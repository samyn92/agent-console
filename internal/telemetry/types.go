package telemetry

import (
	"time"
)

// SpanStatus represents the status of a span
type SpanStatus string

const (
	SpanStatusUnset SpanStatus = "unset"
	SpanStatusOK    SpanStatus = "ok"
	SpanStatusError SpanStatus = "error"
)

// SpanKind represents the kind of span
type SpanKind string

const (
	SpanKindInternal SpanKind = "internal"
	SpanKindServer   SpanKind = "server"
	SpanKindClient   SpanKind = "client"
	SpanKindProducer SpanKind = "producer"
	SpanKindConsumer SpanKind = "consumer"
)

// Span represents a single span in a trace
type Span struct {
	TraceID      string            `json:"traceId"`
	SpanID       string            `json:"spanId"`
	ParentSpanID string            `json:"parentSpanId,omitempty"`
	Name         string            `json:"name"`
	Kind         SpanKind          `json:"kind"`
	StartTime    time.Time         `json:"startTime"`
	EndTime      time.Time         `json:"endTime"`
	Duration     int64             `json:"duration"` // milliseconds
	Status       SpanStatus        `json:"status"`
	StatusMsg    string            `json:"statusMessage,omitempty"`
	Attributes   map[string]string `json:"attributes,omitempty"`
	Events       []SpanEvent       `json:"events,omitempty"`

	// Derived fields for UI
	ServiceName  string `json:"serviceName,omitempty"`
	ResourceName string `json:"resourceName,omitempty"`
}

// SpanEvent represents an event within a span
type SpanEvent struct {
	Name       string            `json:"name"`
	Time       time.Time         `json:"time"`
	Attributes map[string]string `json:"attributes,omitempty"`
}

// Trace represents a complete trace with all its spans
type Trace struct {
	TraceID   string     `json:"traceId"`
	RootSpan  *Span      `json:"rootSpan"`
	Spans     []*Span    `json:"spans"`
	StartTime time.Time  `json:"startTime"`
	EndTime   time.Time  `json:"endTime"`
	Duration  int64      `json:"duration"` // milliseconds
	Status    SpanStatus `json:"status"`
	SpanCount int        `json:"spanCount"`

	// Aggregated info
	ServiceName string   `json:"serviceName,omitempty"`
	Services    []string `json:"services,omitempty"`

	// Agent-specific fields (extracted from attributes)
	AgentName string `json:"agentName,omitempty"`
	Namespace string `json:"namespace,omitempty"`
}

// TraceTreeNode is a span with its children for hierarchical display
type TraceTreeNode struct {
	Span     *Span            `json:"span"`
	Children []*TraceTreeNode `json:"children,omitempty"`
}

// TraceListItem is a summary of a trace for list views
type TraceListItem struct {
	TraceID     string     `json:"traceId"`
	RootSpan    string     `json:"rootSpan"`
	Status      SpanStatus `json:"status"`
	StartTime   time.Time  `json:"startTime"`
	Duration    int64      `json:"duration"`
	SpanCount   int        `json:"spanCount"`
	ServiceName string     `json:"serviceName,omitempty"`
	AgentName   string     `json:"agentName,omitempty"`
	Namespace   string     `json:"namespace,omitempty"`
}

// TraceQuery represents search/filter parameters for traces
type TraceQuery struct {
	TraceID     string        `json:"traceId,omitempty"`
	ServiceName string        `json:"serviceName,omitempty"`
	AgentName   string        `json:"agentName,omitempty"`
	Namespace   string        `json:"namespace,omitempty"`
	Status      SpanStatus    `json:"status,omitempty"`
	MinDuration time.Duration `json:"minDuration,omitempty"`
	MaxDuration time.Duration `json:"maxDuration,omitempty"`
	StartTime   time.Time     `json:"startTime,omitempty"`
	EndTime     time.Time     `json:"endTime,omitempty"`
	Limit       int           `json:"limit,omitempty"`
}
