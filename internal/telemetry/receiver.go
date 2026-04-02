package telemetry

import (
	"context"
	"encoding/hex"
	"fmt"
	"net"
	"time"

	"go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

// ReceiverConfig holds configuration for the OTLP receiver
type ReceiverConfig struct {
	// GRPCAddr is the address to listen on for gRPC OTLP
	GRPCAddr string
}

// DefaultReceiverConfig returns sensible defaults
func DefaultReceiverConfig() ReceiverConfig {
	return ReceiverConfig{
		GRPCAddr: ":4317",
	}
}

// Receiver receives OTLP traces via gRPC
type Receiver struct {
	v1.UnimplementedTraceServiceServer

	config  ReceiverConfig
	storage *Storage
	log     *zap.SugaredLogger
	server  *grpc.Server
}

// NewReceiver creates a new OTLP receiver
func NewReceiver(config ReceiverConfig, storage *Storage, log *zap.SugaredLogger) *Receiver {
	return &Receiver{
		config:  config,
		storage: storage,
		log:     log,
	}
}

// Start starts the gRPC server
func (r *Receiver) Start(ctx context.Context) error {
	lis, err := net.Listen("tcp", r.config.GRPCAddr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", r.config.GRPCAddr, err)
	}

	r.server = grpc.NewServer()
	v1.RegisterTraceServiceServer(r.server, r)

	r.log.Infow("Starting OTLP gRPC receiver", "addr", r.config.GRPCAddr)

	// Handle shutdown
	go func() {
		<-ctx.Done()
		r.log.Info("Shutting down OTLP receiver")
		r.server.GracefulStop()
	}()

	// Start serving
	go func() {
		if err := r.server.Serve(lis); err != nil {
			r.log.Errorw("OTLP server error", "error", err)
		}
	}()

	return nil
}

// Export implements the OTLP TraceService Export method
func (r *Receiver) Export(ctx context.Context, req *v1.ExportTraceServiceRequest) (*v1.ExportTraceServiceResponse, error) {
	for _, resourceSpans := range req.ResourceSpans {
		// Extract resource attributes
		resourceAttrs := extractAttributes(resourceSpans.Resource.GetAttributes())
		serviceName := resourceAttrs["service.name"]

		for _, scopeSpans := range resourceSpans.ScopeSpans {
			for _, span := range scopeSpans.Spans {
				s := r.convertSpan(span, serviceName, resourceAttrs)
				r.storage.AddSpan(s)
			}
		}
	}

	return &v1.ExportTraceServiceResponse{}, nil
}

// convertSpan converts an OTLP span to our internal Span type
func (r *Receiver) convertSpan(pb *tracepb.Span, serviceName string, resourceAttrs map[string]string) *Span {
	span := &Span{
		TraceID:     hex.EncodeToString(pb.TraceId),
		SpanID:      hex.EncodeToString(pb.SpanId),
		Name:        pb.Name,
		StartTime:   time.Unix(0, int64(pb.StartTimeUnixNano)),
		EndTime:     time.Unix(0, int64(pb.EndTimeUnixNano)),
		ServiceName: serviceName,
		Attributes:  make(map[string]string),
		Events:      make([]SpanEvent, 0, len(pb.Events)),
	}

	// Duration in milliseconds
	span.Duration = span.EndTime.Sub(span.StartTime).Milliseconds()

	// Parent span ID
	if len(pb.ParentSpanId) > 0 {
		span.ParentSpanID = hex.EncodeToString(pb.ParentSpanId)
	}

	// Convert kind
	switch pb.Kind {
	case tracepb.Span_SPAN_KIND_SERVER:
		span.Kind = SpanKindServer
	case tracepb.Span_SPAN_KIND_CLIENT:
		span.Kind = SpanKindClient
	case tracepb.Span_SPAN_KIND_PRODUCER:
		span.Kind = SpanKindProducer
	case tracepb.Span_SPAN_KIND_CONSUMER:
		span.Kind = SpanKindConsumer
	default:
		span.Kind = SpanKindInternal
	}

	// Convert status
	if pb.Status != nil {
		switch pb.Status.Code {
		case tracepb.Status_STATUS_CODE_OK:
			span.Status = SpanStatusOK
		case tracepb.Status_STATUS_CODE_ERROR:
			span.Status = SpanStatusError
			span.StatusMsg = pb.Status.Message
		default:
			span.Status = SpanStatusUnset
		}
	}

	// Merge resource and span attributes
	for k, v := range resourceAttrs {
		span.Attributes[k] = v
	}
	for k, v := range extractAttributes(pb.Attributes) {
		span.Attributes[k] = v
	}

	// Convert events
	for _, event := range pb.Events {
		span.Events = append(span.Events, SpanEvent{
			Name:       event.Name,
			Time:       time.Unix(0, int64(event.TimeUnixNano)),
			Attributes: extractAttributes(event.Attributes),
		})
	}

	// Set resource name for display
	if name, ok := span.Attributes["k8s.pod.name"]; ok {
		span.ResourceName = name
	} else if name, ok := span.Attributes["k8s.deployment.name"]; ok {
		span.ResourceName = name
	}

	return span
}

// extractAttributes converts OTLP KeyValue list to a map
func extractAttributes(attrs []*commonpb.KeyValue) map[string]string {
	result := make(map[string]string, len(attrs))
	for _, kv := range attrs {
		if kv.Value == nil {
			continue
		}
		switch v := kv.Value.Value.(type) {
		case *commonpb.AnyValue_StringValue:
			result[kv.Key] = v.StringValue
		case *commonpb.AnyValue_IntValue:
			result[kv.Key] = fmt.Sprintf("%d", v.IntValue)
		case *commonpb.AnyValue_DoubleValue:
			result[kv.Key] = fmt.Sprintf("%f", v.DoubleValue)
		case *commonpb.AnyValue_BoolValue:
			result[kv.Key] = fmt.Sprintf("%t", v.BoolValue)
		}
	}
	return result
}
