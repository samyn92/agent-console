package telemetry

import (
	"sort"
	"strings"
	"sync"
	"time"
)

// StorageConfig holds configuration for trace storage
type StorageConfig struct {
	// MaxTraces is the maximum number of traces to keep
	MaxTraces int
	// Retention is how long to keep traces
	Retention time.Duration
}

// DefaultStorageConfig returns sensible defaults
func DefaultStorageConfig() StorageConfig {
	return StorageConfig{
		MaxTraces: 10000,
		Retention: 24 * time.Hour,
	}
}

// Storage provides in-memory storage for traces and spans
type Storage struct {
	mu       sync.RWMutex
	config   StorageConfig
	spans    map[string]*Span  // spanID -> Span
	traces   map[string]*Trace // traceID -> Trace
	traceIDs []string          // ordered by time for cleanup

	// Subscribers for real-time updates
	subMu       sync.RWMutex
	subscribers map[chan *Trace]struct{}
}

// NewStorage creates a new trace storage
func NewStorage(config StorageConfig) *Storage {
	s := &Storage{
		config:      config,
		spans:       make(map[string]*Span),
		traces:      make(map[string]*Trace),
		traceIDs:    make([]string, 0),
		subscribers: make(map[chan *Trace]struct{}),
	}

	// Start cleanup goroutine
	go s.cleanupLoop()

	return s
}

// AddSpan adds a span to storage, creating or updating the parent trace
func (s *Storage) AddSpan(span *Span) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Store the span
	s.spans[span.SpanID] = span

	// Get or create trace
	trace, exists := s.traces[span.TraceID]
	if !exists {
		trace = &Trace{
			TraceID:   span.TraceID,
			Spans:     make([]*Span, 0),
			StartTime: span.StartTime,
			EndTime:   span.EndTime,
			Status:    SpanStatusUnset,
			Services:  make([]string, 0),
		}
		s.traces[span.TraceID] = trace
		s.traceIDs = append(s.traceIDs, span.TraceID)
	}

	// Add span to trace
	trace.Spans = append(trace.Spans, span)
	trace.SpanCount = len(trace.Spans)

	// Update trace timing
	if span.StartTime.Before(trace.StartTime) {
		trace.StartTime = span.StartTime
	}
	if span.EndTime.After(trace.EndTime) {
		trace.EndTime = span.EndTime
	}
	trace.Duration = trace.EndTime.Sub(trace.StartTime).Milliseconds()

	// Update trace status (error takes precedence)
	if span.Status == SpanStatusError {
		trace.Status = SpanStatusError
	} else if trace.Status == SpanStatusUnset && span.Status == SpanStatusOK {
		trace.Status = SpanStatusOK
	}

	// Track root span
	if span.ParentSpanID == "" {
		trace.RootSpan = span
		if span.ServiceName != "" {
			trace.ServiceName = span.ServiceName
		}
	}

	// Track services
	if span.ServiceName != "" {
		found := false
		for _, svc := range trace.Services {
			if svc == span.ServiceName {
				found = true
				break
			}
		}
		if !found {
			trace.Services = append(trace.Services, span.ServiceName)
		}
	}

	// Extract agent-specific info from attributes
	if v, ok := span.Attributes["agent.name"]; ok {
		trace.AgentName = v
	}
	if v, ok := span.Attributes["k8s.namespace"]; ok {
		trace.Namespace = v
	}

	// Notify subscribers
	s.notifySubscribers(trace)
}

// GetTrace returns a trace by ID
func (s *Storage) GetTrace(traceID string) (*Trace, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	trace, ok := s.traces[traceID]
	return trace, ok
}

// GetTraceTree returns a trace with spans organized as a tree
func (s *Storage) GetTraceTree(traceID string) (*TraceTreeNode, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	trace, ok := s.traces[traceID]
	if !ok {
		return nil, false
	}

	return buildSpanTree(trace.Spans), true
}

// buildSpanTree organizes spans into a tree structure
func buildSpanTree(spans []*Span) *TraceTreeNode {
	if len(spans) == 0 {
		return nil
	}

	// Find root span (no parent)
	var root *Span
	childMap := make(map[string][]*Span) // parentID -> children

	for _, span := range spans {
		if span.ParentSpanID == "" {
			root = span
		} else {
			childMap[span.ParentSpanID] = append(childMap[span.ParentSpanID], span)
		}
	}

	if root == nil {
		// No root found, use first span
		root = spans[0]
	}

	return buildTreeNode(root, childMap)
}

func buildTreeNode(span *Span, childMap map[string][]*Span) *TraceTreeNode {
	node := &TraceTreeNode{
		Span:     span,
		Children: make([]*TraceTreeNode, 0),
	}

	children := childMap[span.SpanID]
	// Sort children by start time
	sort.Slice(children, func(i, j int) bool {
		return children[i].StartTime.Before(children[j].StartTime)
	})

	for _, child := range children {
		node.Children = append(node.Children, buildTreeNode(child, childMap))
	}

	return node
}

// ListTraces returns traces matching the query
func (s *Storage) ListTraces(query TraceQuery) []*TraceListItem {
	s.mu.RLock()
	defer s.mu.RUnlock()

	results := make([]*TraceListItem, 0)

	for _, trace := range s.traces {
		// Apply filters
		if query.TraceID != "" && trace.TraceID != query.TraceID {
			continue
		}
		if query.ServiceName != "" && !strings.Contains(strings.ToLower(trace.ServiceName), strings.ToLower(query.ServiceName)) {
			continue
		}
		if query.AgentName != "" && !strings.Contains(strings.ToLower(trace.AgentName), strings.ToLower(query.AgentName)) {
			continue
		}
		if query.Namespace != "" && trace.Namespace != query.Namespace {
			continue
		}
		if query.Status != "" && trace.Status != query.Status {
			continue
		}
		if query.MinDuration > 0 && time.Duration(trace.Duration)*time.Millisecond < query.MinDuration {
			continue
		}
		if query.MaxDuration > 0 && time.Duration(trace.Duration)*time.Millisecond > query.MaxDuration {
			continue
		}
		if !query.StartTime.IsZero() && trace.StartTime.Before(query.StartTime) {
			continue
		}
		if !query.EndTime.IsZero() && trace.StartTime.After(query.EndTime) {
			continue
		}

		// Build list item
		item := &TraceListItem{
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

		results = append(results, item)
	}

	// Sort by start time descending (newest first)
	sort.Slice(results, func(i, j int) bool {
		return results[i].StartTime.After(results[j].StartTime)
	})

	// Apply limit
	limit := query.Limit
	if limit <= 0 {
		limit = 100
	}
	if len(results) > limit {
		results = results[:limit]
	}

	return results
}

// Subscribe returns a channel that receives trace updates
func (s *Storage) Subscribe() <-chan *Trace {
	ch := make(chan *Trace, 100)

	s.subMu.Lock()
	s.subscribers[ch] = struct{}{}
	s.subMu.Unlock()

	return ch
}

// Unsubscribe removes a subscriber
func (s *Storage) Unsubscribe(ch <-chan *Trace) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	// Find and delete the channel
	for subCh := range s.subscribers {
		if subCh == ch {
			delete(s.subscribers, subCh)
			close(subCh)
			break
		}
	}
}

func (s *Storage) notifySubscribers(trace *Trace) {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	for ch := range s.subscribers {
		select {
		case ch <- trace:
		default:
			// Channel full, skip
		}
	}
}

// cleanupLoop periodically removes old traces
func (s *Storage) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		s.cleanup()
	}
}

func (s *Storage) cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-s.config.Retention)

	// Remove old traces
	newTraceIDs := make([]string, 0, len(s.traceIDs))
	for _, id := range s.traceIDs {
		trace, ok := s.traces[id]
		if !ok {
			continue
		}

		if trace.StartTime.Before(cutoff) {
			// Remove spans
			for _, span := range trace.Spans {
				delete(s.spans, span.SpanID)
			}
			delete(s.traces, id)
		} else {
			newTraceIDs = append(newTraceIDs, id)
		}
	}
	s.traceIDs = newTraceIDs

	// Enforce max traces limit
	if len(s.traceIDs) > s.config.MaxTraces {
		excess := len(s.traceIDs) - s.config.MaxTraces
		for i := 0; i < excess; i++ {
			id := s.traceIDs[i]
			if trace, ok := s.traces[id]; ok {
				for _, span := range trace.Spans {
					delete(s.spans, span.SpanID)
				}
				delete(s.traces, id)
			}
		}
		s.traceIDs = s.traceIDs[excess:]
	}
}

// Stats returns storage statistics
func (s *Storage) Stats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return map[string]interface{}{
		"traceCount": len(s.traces),
		"spanCount":  len(s.spans),
		"maxTraces":  s.config.MaxTraces,
		"retention":  s.config.Retention.String(),
	}
}
