package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/samyn92/agent-console/internal/k8s"
	"github.com/samyn92/agent-console/internal/opencode"
	agentsv1alpha1 "github.com/samyn92/agent-operator-core/api/v1alpha1"
)

// AgentEventEnvelope wraps an event from a specific agent with routing metadata.
// The frontend uses namespace+name to dispatch events to the correct agent store.
type AgentEventEnvelope struct {
	Namespace string          `json:"namespace"`
	Name      string          `json:"name"`
	Event     string          `json:"event"`
	Data      json.RawMessage `json:"data"`
}

// AgentConnectionStatus is sent when an agent's event stream connects or disconnects.
type AgentConnectionStatus struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Connected bool   `json:"connected"`
}

// GlobalAgentEvents multiplexes SSE event streams from all available agents
// into a single SSE response. The frontend connects once and receives events
// from all agents, each wrapped in an AgentEventEnvelope.
//
// Events emitted:
//   - "connected"         — initial handshake
//   - "agent.connected"   — an agent's event stream was established
//   - "agent.disconnected"— an agent's event stream was lost (will auto-reconnect)
//   - "agent.event"       — a proxied event from a specific agent (wrapped in envelope)
//   - "agent.added"       — a new agent was discovered via K8s watcher
//   - "agent.removed"     — an agent was removed via K8s watcher
//   - "heartbeat"         — periodic keep-alive
func (h *Handlers) GlobalAgentEvents(w http.ResponseWriter, r *http.Request) {
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

	// Buffered channel for all events to write to the client
	eventCh := make(chan sseFrame, 256)

	// Send initial connected event
	eventCh <- sseFrame{event: "connected", data: map[string]string{"message": "Watching all agent events"}}

	// Track active agent connections so we can tear them down
	type agentConn struct {
		cancel context.CancelFunc
	}
	var connMu sync.Mutex
	connections := make(map[string]*agentConn) // key: "namespace/name"

	// connectToAgent starts a goroutine that connects to an agent's /event endpoint,
	// parses the SSE stream, and forwards events as AgentEventEnvelope into eventCh.
	// It auto-reconnects on failure with exponential backoff.
	connectToAgent := func(ctx context.Context, namespace, name string) {
		key := namespace + "/" + name

		go func() {
			backoff := time.Second
			maxBackoff := 30 * time.Second

			for {
				select {
				case <-ctx.Done():
					return
				default:
				}

				agent, err := h.k8s.GetAgent(ctx, namespace, name)
				if err != nil {
					h.log.Warnw("Agent not found for event stream", "namespace", namespace, "name", name, "error", err)
					// Wait and retry — agent might come back
					select {
					case <-ctx.Done():
						return
					case <-time.After(backoff):
						backoff = minDuration(backoff*2, maxBackoff)
						continue
					}
				}

				if agent.Status.Phase != agentsv1alpha1.AgentPhaseRunning {
					// Agent not ready, wait and retry
					select {
					case <-ctx.Done():
						return
					case <-time.After(backoff):
						backoff = minDuration(backoff*2, maxBackoff)
						continue
					}
				}

				serviceURL := h.getAgentServiceURL(agent, namespace, name)

				req, err := http.NewRequestWithContext(ctx, "GET", serviceURL+"/event", nil)
				if err != nil {
					h.log.Warnw("Failed to create event request", "agent", key, "error", err)
					select {
					case <-ctx.Done():
						return
					case <-time.After(backoff):
						backoff = minDuration(backoff*2, maxBackoff)
						continue
					}
				}
				req.Header.Set("Accept", "text/event-stream")
				req.Header.Set("Cache-Control", "no-cache")

				client := &http.Client{Timeout: 0, Transport: opencode.IPv4Transport()}
				resp, err := client.Do(req)
				if err != nil {
					h.log.Warnw("Failed to connect to agent events", "agent", key, "error", err)
					select {
					case <-ctx.Done():
						return
					case <-time.After(backoff):
						backoff = minDuration(backoff*2, maxBackoff)
						continue
					}
				}

				// Connected successfully
				backoff = time.Second // reset backoff
				h.log.Infow("Connected to agent event stream", "agent", key)

				select {
				case eventCh <- sseFrame{event: "agent.connected", data: AgentConnectionStatus{
					Namespace: namespace, Name: name, Connected: true,
				}}:
				default:
				}

				// Parse the SSE stream line by line.
				//
				// OpenCode does NOT send "event:" lines — events arrive as:
				//   data: {"type":"session.idle","properties":{...}}
				//   <blank line>
				//
				// So we collect data lines and, on the blank-line delimiter, parse
				// the JSON to extract the "type" field for the envelope. If an
				// "event:" line IS present (future-proofing), we use that instead.
				scanner := bufio.NewScanner(resp.Body)
				scanner.Buffer(make([]byte, 64*1024), 64*1024) // 64KB line buffer
				var currentEvent string
				var dataLines []string

				for scanner.Scan() {
					select {
					case <-ctx.Done():
						resp.Body.Close()
						return
					default:
					}

					line := scanner.Text()

					if line == "" {
						// Empty line = end of event
						if len(dataLines) > 0 {
							rawData := json.RawMessage(strings.Join(dataLines, "\n"))

							// Determine the event type for the envelope.
							// Prefer an explicit "event:" line if present;
							// otherwise extract "type" from the JSON payload
							// (OpenCode's standard format).
							eventType := currentEvent
							if eventType == "" {
								var peek struct {
									Type string `json:"type"`
								}
								if json.Unmarshal(rawData, &peek) == nil && peek.Type != "" {
									eventType = peek.Type
								}
							}

							if eventType != "" {
								envelope := AgentEventEnvelope{
									Namespace: namespace,
									Name:      name,
									Event:     eventType,
									Data:      rawData,
								}
								select {
								case eventCh <- sseFrame{event: "agent.event", data: envelope}:
								default:
									// Channel full, drop event
								}
							}
						}
						currentEvent = ""
						dataLines = nil
						continue
					}

					if strings.HasPrefix(line, "event: ") {
						currentEvent = strings.TrimPrefix(line, "event: ")
					} else if strings.HasPrefix(line, "data: ") {
						dataLines = append(dataLines, strings.TrimPrefix(line, "data: "))
					} else if line == "data:" {
						dataLines = append(dataLines, "")
					}
					// Ignore comments (lines starting with :) and other fields
				}

				resp.Body.Close()

				// Stream ended — notify and reconnect
				h.log.Warnw("Agent event stream ended, will reconnect", "agent", key)
				select {
				case eventCh <- sseFrame{event: "agent.disconnected", data: AgentConnectionStatus{
					Namespace: namespace, Name: name, Connected: false,
				}}:
				default:
				}

				select {
				case <-ctx.Done():
					return
				case <-time.After(backoff):
					backoff = minDuration(backoff*2, maxBackoff)
				}
			}
		}()
	}

	// disconnectAgent tears down the event stream for an agent
	disconnectAgent := func(key string) {
		connMu.Lock()
		defer connMu.Unlock()
		if conn, ok := connections[key]; ok {
			conn.cancel()
			delete(connections, key)
		}
	}

	// Start connections to all currently known agents
	agents, err := h.k8s.ListAgents(r.Context(), "")
	if err != nil {
		h.log.Errorw("Failed to list agents for global events", "error", err)
	} else {
		for _, agent := range agents {
			key := agent.Namespace + "/" + agent.Name
			ctx, cancel := context.WithCancel(r.Context())
			connMu.Lock()
			connections[key] = &agentConn{cancel: cancel}
			connMu.Unlock()
			connectToAgent(ctx, agent.Namespace, agent.Name)
		}
	}

	// Subscribe to K8s watcher for agent add/remove
	unsubscribe := h.k8s.Watcher().Subscribe(func(event k8s.ResourceEvent) {
		if event.ResourceKind != "Agent" {
			return
		}

		key := event.Namespace + "/" + event.Name

		switch event.Type {
		case k8s.EventAdded:
			connMu.Lock()
			if _, exists := connections[key]; !exists {
				ctx, cancel := context.WithCancel(r.Context())
				connections[key] = &agentConn{cancel: cancel}
				connMu.Unlock()
				connectToAgent(ctx, event.Namespace, event.Name)
			} else {
				connMu.Unlock()
			}

			select {
			case eventCh <- sseFrame{event: "agent.added", data: map[string]string{
				"namespace": event.Namespace, "name": event.Name,
			}}:
			default:
			}

		case k8s.EventDeleted:
			disconnectAgent(key)

			select {
			case eventCh <- sseFrame{event: "agent.removed", data: map[string]string{
				"namespace": event.Namespace, "name": event.Name,
			}}:
			default:
			}
		}
	})

	// Clean up everything on client disconnect
	defer func() {
		unsubscribe()
		connMu.Lock()
		for _, conn := range connections {
			conn.cancel()
		}
		connMu.Unlock()
	}()

	// Main write loop: drain eventCh and write SSE frames, with heartbeat
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return

		case frame := <-eventCh:
			if err := writeSSEFrame(w, flusher, frame); err != nil {
				return
			}

		case <-heartbeat.C:
			if err := writeSSEFrame(w, flusher, sseFrame{
				event: "heartbeat",
				data:  map[string]int64{"timestamp": time.Now().Unix()},
			}); err != nil {
				return
			}
		}
	}
}

// sseFrame is an internal type for an event + data pair to write.
type sseFrame struct {
	event string
	data  interface{}
}

// writeSSEFrame marshals and writes an SSE event.
func writeSSEFrame(w http.ResponseWriter, flusher http.Flusher, frame sseFrame) error {
	jsonData, err := json.Marshal(frame.data)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", frame.event, jsonData)
	if err != nil {
		return err
	}
	flusher.Flush()
	return nil
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
