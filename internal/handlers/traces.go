package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/samyn92/agent-console/internal/telemetry"
)

// TraceHandlers holds handlers for trace-related endpoints
type TraceHandlers struct {
	storage *telemetry.Storage
}

// NewTraceHandlers creates trace handlers
func NewTraceHandlers(storage *telemetry.Storage) *TraceHandlers {
	return &TraceHandlers{
		storage: storage,
	}
}

// ListTraces returns traces matching query parameters
func (h *TraceHandlers) ListTraces(w http.ResponseWriter, r *http.Request) {
	query := telemetry.TraceQuery{
		TraceID:     r.URL.Query().Get("traceId"),
		ServiceName: r.URL.Query().Get("service"),
		AgentName:   r.URL.Query().Get("agent"),
		Namespace:   r.URL.Query().Get("namespace"),
	}

	// Status filter
	if status := r.URL.Query().Get("status"); status != "" {
		query.Status = telemetry.SpanStatus(status)
	}

	// Time range
	if start := r.URL.Query().Get("start"); start != "" {
		if t, err := time.Parse(time.RFC3339, start); err == nil {
			query.StartTime = t
		}
	}
	if end := r.URL.Query().Get("end"); end != "" {
		if t, err := time.Parse(time.RFC3339, end); err == nil {
			query.EndTime = t
		}
	}

	// Duration filters (in ms)
	if minDur := r.URL.Query().Get("minDuration"); minDur != "" {
		if d, err := strconv.ParseInt(minDur, 10, 64); err == nil {
			query.MinDuration = time.Duration(d) * time.Millisecond
		}
	}
	if maxDur := r.URL.Query().Get("maxDuration"); maxDur != "" {
		if d, err := strconv.ParseInt(maxDur, 10, 64); err == nil {
			query.MaxDuration = time.Duration(d) * time.Millisecond
		}
	}

	// Limit
	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil {
			query.Limit = l
		}
	}

	traces := h.storage.ListTraces(query)
	jsonOK(w, traces)
}

// GetTrace returns a specific trace by ID
func (h *TraceHandlers) GetTrace(w http.ResponseWriter, r *http.Request) {
	traceID := chi.URLParam(r, "traceId")

	trace, ok := h.storage.GetTrace(traceID)
	if !ok {
		jsonError(w, http.StatusNotFound, "Trace not found")
		return
	}

	jsonOK(w, trace)
}

// GetTraceTree returns a trace with spans as a tree structure
func (h *TraceHandlers) GetTraceTree(w http.ResponseWriter, r *http.Request) {
	traceID := chi.URLParam(r, "traceId")

	tree, ok := h.storage.GetTraceTree(traceID)
	if !ok {
		jsonError(w, http.StatusNotFound, "Trace not found")
		return
	}

	jsonOK(w, tree)
}

// GetStats returns trace storage statistics
func (h *TraceHandlers) GetStats(w http.ResponseWriter, r *http.Request) {
	stats := h.storage.Stats()
	jsonOK(w, stats)
}

// WatchTraces streams trace updates via SSE
func (h *TraceHandlers) WatchTraces(w http.ResponseWriter, r *http.Request) {
	// Set up SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "Streaming not supported")
		return
	}

	// Optional filters
	namespaceFilter := r.URL.Query().Get("namespace")
	agentFilter := r.URL.Query().Get("agent")

	// Subscribe to trace updates
	traceCh := h.storage.Subscribe()
	defer h.storage.Unsubscribe(traceCh)

	// Send connected event
	writeSSE(w, flusher, "connected", map[string]string{
		"message": "Watching for trace updates",
	})

	// Heartbeat
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case trace := <-traceCh:
			// Apply filters
			if namespaceFilter != "" && trace.Namespace != namespaceFilter {
				continue
			}
			if agentFilter != "" && trace.AgentName != agentFilter {
				continue
			}

			// Send trace update
			item := telemetry.TraceListItem{
				TraceID:     trace.TraceID,
				Status:      trace.Status,
				StartTime:   trace.StartTime,
				Duration:    trace.Duration,
				SpanCount:   trace.SpanCount,
				ServiceName: trace.ServiceName,
				AgentName:   trace.AgentName,
				Namespace:   trace.Namespace,
			}
			if trace.RootSpan != nil {
				item.RootSpan = trace.RootSpan.Name
			}
			writeSSE(w, flusher, "trace", item)
		case <-heartbeat.C:
			writeSSE(w, flusher, "heartbeat", map[string]int64{
				"timestamp": time.Now().Unix(),
			})
		}
	}
}

// PluginSpanRequest is the span format sent by the OpenCode telemetry plugin
type PluginSpanRequest struct {
	TraceID           string         `json:"traceId"`
	SpanID            string         `json:"spanId"`
	ParentSpanID      string         `json:"parentSpanId,omitempty"`
	Name              string         `json:"name"`
	StartTimeUnixNano string         `json:"startTimeUnixNano"`
	EndTimeUnixNano   string         `json:"endTimeUnixNano"`
	DurationMs        int64          `json:"durationMs"`
	Status            string         `json:"status"` // "ok" or "error"
	Attributes        map[string]any `json:"attributes,omitempty"`
	SessionID         string         `json:"sessionId,omitempty"`
	MessageID         string         `json:"messageId,omitempty"`
}

// IngestSpan receives spans from the OpenCode telemetry plugin
// This provides a simple HTTP endpoint as an alternative to the gRPC OTLP receiver
func (h *TraceHandlers) IngestSpan(w http.ResponseWriter, r *http.Request) {
	var req PluginSpanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	// Parse timestamps (nanoseconds since epoch as string)
	startNano, _ := strconv.ParseInt(req.StartTimeUnixNano, 10, 64)
	endNano, _ := strconv.ParseInt(req.EndTimeUnixNano, 10, 64)

	// Convert to time.Time (nanos are in milliseconds * 1_000_000 from the plugin)
	startTime := time.Unix(0, startNano)
	endTime := time.Unix(0, endNano)

	// Fallback: if timestamps look wrong, use current time
	if startTime.Year() < 2020 {
		startTime = time.Now().Add(-time.Duration(req.DurationMs) * time.Millisecond)
		endTime = time.Now()
	}

	// Convert attributes to string map
	attrs := make(map[string]string)
	for k, v := range req.Attributes {
		switch val := v.(type) {
		case string:
			attrs[k] = val
		case float64:
			attrs[k] = strconv.FormatFloat(val, 'f', -1, 64)
		case bool:
			attrs[k] = strconv.FormatBool(val)
		default:
			if b, err := json.Marshal(val); err == nil {
				attrs[k] = string(b)
			}
		}
	}

	// Add session/message context as attributes
	if req.SessionID != "" {
		attrs["opencode.session_id"] = req.SessionID
	}
	if req.MessageID != "" {
		attrs["opencode.message_id"] = req.MessageID
	}

	// Map status
	status := telemetry.SpanStatusOK
	if req.Status == "error" {
		status = telemetry.SpanStatusError
	}

	// Create span
	span := &telemetry.Span{
		TraceID:      req.TraceID,
		SpanID:       req.SpanID,
		ParentSpanID: req.ParentSpanID,
		Name:         req.Name,
		Kind:         telemetry.SpanKindClient, // Tool calls are client spans
		StartTime:    startTime,
		EndTime:      endTime,
		Duration:     req.DurationMs,
		Status:       status,
		Attributes:   attrs,
		ServiceName:  "opencode", // Spans from OpenCode plugin
	}

	// Store the span
	h.storage.AddSpan(span)

	// Return success with the trace ID for correlation
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"traceId": req.TraceID,
		"spanId":  req.SpanID,
	})
}
