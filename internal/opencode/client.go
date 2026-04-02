// Package opencode provides a client for communicating with OpenCode agents
package opencode

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
)

// IPv4Transport returns an http.Transport that forces TCP over IPv4.
// On IPv6-primary dual-stack clusters, Go's default dialer prefers AAAA records,
// but OpenCode binds to 0.0.0.0 (IPv4 only). Using "tcp4" ensures the console
// always connects via the Service's IPv4 ClusterIP.
func IPv4Transport() *http.Transport {
	return &http.Transport{
		DialContext: func(ctx context.Context, _, addr string) (net.Conn, error) {
			return (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext(ctx, "tcp4", addr)
		},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
}

// Client handles communication with OpenCode server
type Client struct {
	httpClient *http.Client
	log        *zap.SugaredLogger

	// Session management - one session per agent+user combination
	sessions   map[string]string // "namespace/name:userID" -> sessionID
	sessionsMu sync.RWMutex
}

// New creates a new OpenCode client
func New(log *zap.SugaredLogger) *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout:   5 * time.Minute, // Long timeout for AI inference
			Transport: IPv4Transport(),
		},
		log:      log,
		sessions: make(map[string]string),
	}
}

// CreateSessionRequest is the request to create a session
type CreateSessionRequest struct {
	Title string `json:"title,omitempty"`
}

// CreateSessionResponse is the response from creating a session
type CreateSessionResponse struct {
	ID string `json:"id"`
}

// MessageRequest is the request to send a message
type MessageRequest struct {
	Parts []MessagePart `json:"parts"`
}

// MessagePart represents a part of a message
type MessagePart struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// SessionStatus represents the status of a session
type SessionStatus struct {
	Type string `json:"type"` // "idle" or "busy"
}

// GetOrCreateSession gets or creates a session for a user+agent combination
func (c *Client) GetOrCreateSession(ctx context.Context, baseURL, namespace, agentName, userID string) (string, error) {
	key := fmt.Sprintf("%s/%s:%s", namespace, agentName, userID)

	c.sessionsMu.RLock()
	if sessionID, ok := c.sessions[key]; ok {
		c.sessionsMu.RUnlock()
		return sessionID, nil
	}
	c.sessionsMu.RUnlock()

	// Create new session - don't set a title, let OpenCode auto-generate after first message
	sessionID, err := c.createSession(ctx, baseURL, "")
	if err != nil {
		return "", err
	}

	c.sessionsMu.Lock()
	c.sessions[key] = sessionID
	c.sessionsMu.Unlock()

	c.log.Infow("Created new session", "agent", agentName, "namespace", namespace, "userID", userID, "sessionID", sessionID)
	return sessionID, nil
}

func (c *Client) createSession(ctx context.Context, baseURL, title string) (string, error) {
	var reqBody []byte
	if title != "" {
		reqBody, _ = json.Marshal(CreateSessionRequest{Title: title})
	} else {
		reqBody = []byte("{}")
	}

	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/session", bytes.NewReader(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("failed to create session: status %d, body: %s", resp.StatusCode, string(body))
	}

	var result CreateSessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode session response: %w", err)
	}

	return result.ID, nil
}

// GetSessionStatus gets the status of a session (idle or busy)
func (c *Client) GetSessionStatus(ctx context.Context, baseURL, sessionID string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/session/status", nil)
	if err != nil {
		return "", err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to get session status: status %d", resp.StatusCode)
	}

	var statuses map[string]SessionStatus
	if err := json.NewDecoder(resp.Body).Decode(&statuses); err != nil {
		return "", err
	}

	if status, ok := statuses[sessionID]; ok {
		return status.Type, nil
	}
	return "idle", nil
}

// AbortSession aborts a running session
func (c *Client) AbortSession(ctx context.Context, baseURL, sessionID string) error {
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/session/"+sessionID+"/abort", nil)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to abort session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to abort session: status %d, body: %s", resp.StatusCode, string(body))
	}

	return nil
}

// SendMessage sends a message to OpenCode and returns a reader for the streaming response
func (c *Client) SendMessage(ctx context.Context, baseURL, sessionID, text string) (io.ReadCloser, error) {
	// Check if session is busy and abort if needed
	status, err := c.GetSessionStatus(ctx, baseURL, sessionID)
	if err != nil {
		c.log.Warnw("Failed to get session status", "error", err)
	} else if status == "busy" {
		c.log.Infow("Session is busy, aborting previous request", "sessionID", sessionID)
		if err := c.AbortSession(ctx, baseURL, sessionID); err != nil {
			c.log.Warnw("Failed to abort session", "error", err)
		}
		// Give it a moment to clean up
		time.Sleep(200 * time.Millisecond)
	}

	reqBody, _ := json.Marshal(MessageRequest{
		Parts: []MessagePart{
			{Type: "text", Text: text},
		},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/session/"+sessionID+"/message", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send message: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("failed to send message: status %d, body: %s", resp.StatusCode, string(body))
	}

	return resp.Body, nil
}

// InvalidateSession removes a session from the cache (e.g., on error)
func (c *Client) InvalidateSession(namespace, agentName, userID string) {
	key := fmt.Sprintf("%s/%s:%s", namespace, agentName, userID)
	c.sessionsMu.Lock()
	delete(c.sessions, key)
	c.sessionsMu.Unlock()
}

// ============================================================================
// Session Listing & Management
// ============================================================================

// SessionInfo represents an OpenCode session with full metadata
type SessionInfo struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectID,omitempty"`
	Directory string `json:"directory,omitempty"`
	ParentID  string `json:"parentID,omitempty"`
	Title     string `json:"title"`
	Version   string `json:"version,omitempty"`
	Time      struct {
		Created    int64 `json:"created"`
		Updated    int64 `json:"updated"`
		Compacting int64 `json:"compacting,omitempty"`
	} `json:"time"`
	Summary *SessionSummary `json:"summary,omitempty"`
}

// SessionSummary contains diff statistics for a session
type SessionSummary struct {
	Additions int `json:"additions"`
	Deletions int `json:"deletions"`
	Files     int `json:"files"`
}

// MessageInfo represents an OpenCode message
type MessageInfo struct {
	ID        string          `json:"id"`
	SessionID string          `json:"sessionID"`
	Role      string          `json:"role"` // "user" or "assistant"
	Time      json.RawMessage `json:"time"`
	// Additional fields vary by role, keep raw for flexibility
	Raw json.RawMessage `json:"-"`
}

// ListSessions retrieves all sessions from an OpenCode agent
// OpenCode returns a map[sessionID]Session
func (c *Client) ListSessions(ctx context.Context, baseURL string) ([]SessionInfo, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/session", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to list sessions: status %d, body: %s", resp.StatusCode, string(body))
	}

	// OpenCode may return sessions as an array or a map keyed by session ID
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read sessions response: %w", err)
	}

	// Try array first
	var sessions []SessionInfo
	if err := json.Unmarshal(body, &sessions); err == nil {
		return sessions, nil
	}

	// Fall back to map format
	var sessionsMap map[string]SessionInfo
	if err := json.Unmarshal(body, &sessionsMap); err != nil {
		return nil, fmt.Errorf("failed to decode sessions: %w", err)
	}

	sessions = make([]SessionInfo, 0, len(sessionsMap))
	for _, s := range sessionsMap {
		sessions = append(sessions, s)
	}

	return sessions, nil
}

// GetSession retrieves a specific session by ID
func (c *Client) GetSession(ctx context.Context, baseURL, sessionID string) (*SessionInfo, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/session/"+sessionID, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get session: status %d, body: %s", resp.StatusCode, string(body))
	}

	var session SessionInfo
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return nil, fmt.Errorf("failed to decode session: %w", err)
	}

	return &session, nil
}

// DeleteSession deletes a session from OpenCode
func (c *Client) DeleteSession(ctx context.Context, baseURL, sessionID string) error {
	req, err := http.NewRequestWithContext(ctx, "DELETE", baseURL+"/session/"+sessionID, nil)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to delete session: status %d, body: %s", resp.StatusCode, string(body))
	}

	return nil
}

// GetSessionMessages retrieves messages for a specific session
// OpenCode API: GET /session/:id/message (singular)
func (c *Client) GetSessionMessages(ctx context.Context, baseURL, sessionID string) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/session/"+sessionID+"/message", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get session messages: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get session messages: status %d, body: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read session messages: %w", err)
	}

	return json.RawMessage(body), nil
}

// GetSessionParts retrieves message parts for a specific session
func (c *Client) GetSessionParts(ctx context.Context, baseURL, sessionID string) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/session/"+sessionID+"/messages/parts", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get session parts: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get session parts: status %d, body: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read session parts: %w", err)
	}

	return json.RawMessage(body), nil
}

// CreateNewSession creates a new session (independent of the session cache)
// Used when the user explicitly wants a new conversation
func (c *Client) CreateNewSession(ctx context.Context, baseURL, title string) (string, error) {
	return c.createSession(ctx, baseURL, title)
}

// SetSessionForUser associates a session ID with a user+agent key in the cache
func (c *Client) SetSessionForUser(namespace, agentName, userID, sessionID string) {
	key := fmt.Sprintf("%s/%s:%s", namespace, agentName, userID)
	c.sessionsMu.Lock()
	c.sessions[key] = sessionID
	c.sessionsMu.Unlock()
}

// ============================================================================
// ACP Event Types - matching OpenCode SDK
// ============================================================================

// ACPEvent represents an event from OpenCode's /event SSE endpoint
type ACPEvent struct {
	Type       string          `json:"type"`
	Properties json.RawMessage `json:"properties"`
}

// MessagePartUpdatedEvent represents message.part.updated event
type MessagePartUpdatedEvent struct {
	Part  json.RawMessage `json:"part"`
	Delta string          `json:"delta,omitempty"`
}

// ToolPart represents a tool call part with full state
type ToolPart struct {
	ID        string          `json:"id"`
	SessionID string          `json:"sessionID"`
	MessageID string          `json:"messageID"`
	Type      string          `json:"type"` // "tool"
	CallID    string          `json:"callID"`
	Tool      string          `json:"tool"`
	State     json.RawMessage `json:"state"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
}

// TextPart represents a text part
type TextPart struct {
	ID        string `json:"id"`
	SessionID string `json:"sessionID"`
	MessageID string `json:"messageID"`
	Type      string `json:"type"` // "text"
	Text      string `json:"text"`
}

// Part is a generic part that can be deserialized to check its type
type Part struct {
	ID        string          `json:"id"`
	SessionID string          `json:"sessionID"`
	MessageID string          `json:"messageID"`
	Type      string          `json:"type"`
	Raw       json.RawMessage `json:"-"`
}

// SessionIdleEvent represents session.idle event
type SessionIdleEvent struct {
	SessionID string `json:"sessionID"`
}

// TodoUpdatedEvent represents todo.updated event
type TodoUpdatedEvent struct {
	SessionID string          `json:"sessionID"`
	Todos     json.RawMessage `json:"todos"`
}

// ============================================================================
// Event Subscription
// ============================================================================

// EventCallback is called for each event received from OpenCode
type EventCallback func(eventType string, data json.RawMessage)

// SubscribeToEvents connects to OpenCode's /event SSE endpoint and calls the callback for each event
// This runs until the context is cancelled or an error occurs
func (c *Client) SubscribeToEvents(ctx context.Context, baseURL string, sessionID string, callback EventCallback) error {
	c.log.Infow("Starting event subscription", "baseURL", baseURL, "sessionID", sessionID)

	// Create a separate client for SSE (no timeout, but still force IPv4)
	sseClient := &http.Client{
		Timeout:   0, // No timeout for SSE
		Transport: IPv4Transport(),
	}

	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/event", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := sseClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to event stream: %w", err)
	}
	defer resp.Body.Close()

	c.log.Infow("Connected to event stream", "status", resp.StatusCode)

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("event stream returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse SSE stream
	// OpenCode sends events in format: data: {"type":"event.type","properties":{...}}
	// The event type is embedded in the JSON, not as a separate "event:" line
	reader := bufio.NewReader(resp.Body)
	var dataLines []string

	for {
		select {
		case <-ctx.Done():
			c.log.Infow("Event subscription context cancelled")
			return ctx.Err()
		default:
		}

		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				c.log.Infow("Event stream EOF")
				return nil
			}
			return fmt.Errorf("error reading event stream: %w", err)
		}

		line = strings.TrimSuffix(line, "\n")
		line = strings.TrimSuffix(line, "\r")

		// Log every line for debugging
		if line != "" {
			c.log.Infow("SSE line received", "line", line[:min(80, len(line))], "len", len(line))
		} else {
			c.log.Infow("SSE empty line", "dataLinesCount", len(dataLines))
		}

		if strings.HasPrefix(line, "data:") {
			// Trim "data:" prefix and any leading space
			data := strings.TrimPrefix(line, "data:")
			data = strings.TrimPrefix(data, " ")
			dataLines = append(dataLines, data)
		} else if line == "" && len(dataLines) > 0 {
			// End of event - process it
			data := strings.Join(dataLines, "")
			if data != "" {
				// Parse the event to get type and check session
				var event ACPEvent
				if err := json.Unmarshal([]byte(data), &event); err == nil {
					c.log.Infow("Received event", "type", event.Type, "targetSessionID", sessionID)
					// Filter by session if needed
					if c.isEventForSession(event, sessionID) {
						c.log.Infow("Event passed filter, calling callback", "type", event.Type)
						// Pass the properties (not the full event), as handler expects the inner structure
						callback(event.Type, event.Properties)
					} else {
						c.log.Infow("Event filtered out", "type", event.Type)
					}
				} else {
					c.log.Warnw("Failed to parse event JSON", "error", err, "data", data[:min(100, len(data))])
				}
			}
			dataLines = nil
		}
	}
}

// isEventForSession checks if an event is for the given session
func (c *Client) isEventForSession(event ACPEvent, sessionID string) bool {
	// Parse properties to check sessionID
	var props struct {
		SessionID string          `json:"sessionID"`
		Part      json.RawMessage `json:"part"`
		Info      json.RawMessage `json:"info"`
	}

	if err := json.Unmarshal(event.Properties, &props); err != nil {
		return true // If we can't parse, let it through
	}

	// Direct sessionID field
	if props.SessionID != "" {
		return props.SessionID == sessionID
	}

	// Check in part
	if len(props.Part) > 0 {
		var part struct {
			SessionID string `json:"sessionID"`
		}
		if err := json.Unmarshal(props.Part, &part); err == nil && part.SessionID != "" {
			return part.SessionID == sessionID
		}
	}

	// Check in info (for message.updated)
	if len(props.Info) > 0 {
		var info struct {
			SessionID string `json:"sessionID"`
		}
		if err := json.Unmarshal(props.Info, &info); err == nil && info.SessionID != "" {
			return info.SessionID == sessionID
		}
	}

	return true // Let through events without session info
}

// SendMessageAsync sends a message asynchronously and returns immediately
// Use with SubscribeToEvents to get real-time updates
func (c *Client) SendMessageAsync(ctx context.Context, baseURL, sessionID, text string) error {
	// Check if session is busy and abort if needed
	status, err := c.GetSessionStatus(ctx, baseURL, sessionID)
	if err != nil {
		c.log.Warnw("Failed to get session status", "error", err)
	} else if status == "busy" {
		c.log.Infow("Session is busy, aborting previous request", "sessionID", sessionID)
		if err := c.AbortSession(ctx, baseURL, sessionID); err != nil {
			c.log.Warnw("Failed to abort session", "error", err)
		}
		time.Sleep(200 * time.Millisecond)
	}

	reqBody, _ := json.Marshal(MessageRequest{
		Parts: []MessagePart{
			{Type: "text", Text: text},
		},
	})

	// Use prompt_async endpoint for non-blocking send
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/session/"+sessionID+"/prompt_async", bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to send message: status %d, body: %s", resp.StatusCode, string(body))
	}

	return nil
}

// ============================================================================
// Permission Handling
// ============================================================================

// PermissionReplyRequest is the request to reply to a permission prompt
// Response must be "once", "always", or "reject"
type PermissionReplyRequest struct {
	Response string `json:"response"` // "once" | "always" | "reject"
}

// ReplyToPermission responds to a pending permission request
// The endpoint is POST /session/{sessionID}/permissions/{permissionID}
func (c *Client) ReplyToPermission(ctx context.Context, baseURL, sessionID, permissionID, response string) error {
	reqBody, _ := json.Marshal(PermissionReplyRequest{
		Response: response,
	})

	req, err := http.NewRequestWithContext(ctx, "POST",
		baseURL+"/session/"+sessionID+"/permissions/"+permissionID,
		bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to reply to permission: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to reply to permission: status %d, body: %s", resp.StatusCode, string(body))
	}

	return nil
}

// ============================================================================
// Question Handling
// ============================================================================

// QuestionReplyRequest is the request to reply to a question
type QuestionReplyRequest struct {
	Answers [][]string `json:"answers"`
}

// ReplyToQuestion sends an answer to a pending question
func (c *Client) ReplyToQuestion(ctx context.Context, baseURL, requestID string, answers [][]string) error {
	reqBody, _ := json.Marshal(QuestionReplyRequest{
		Answers: answers,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/question/"+requestID+"/reply", bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to reply to question: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to reply to question: status %d, body: %s", resp.StatusCode, string(body))
	}

	return nil
}

// ============================================================================
// VCS & Diff - Git state from OpenCode
// ============================================================================

// VCSInfo represents the VCS (version control system) state from OpenCode
type VCSInfo struct {
	SHA     string   `json:"sha,omitempty"`
	Branch  string   `json:"branch,omitempty"`
	Dirty   bool     `json:"dirty,omitempty"`
	Ahead   int      `json:"ahead,omitempty"`
	Behind  int      `json:"behind,omitempty"`
	Remotes []string `json:"remotes,omitempty"`
}

// SessionDiffFile represents a single file diff in a session
type SessionDiffFile struct {
	File      string `json:"file"`
	Before    string `json:"before"`
	After     string `json:"after"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

// GetVCS retrieves VCS (git) status from OpenCode
// OpenCode API: GET /vcs
func (c *Client) GetVCS(ctx context.Context, baseURL string) (*VCSInfo, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/vcs", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get VCS info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get VCS info: status %d, body: %s", resp.StatusCode, string(body))
	}

	var vcs VCSInfo
	if err := json.NewDecoder(resp.Body).Decode(&vcs); err != nil {
		return nil, fmt.Errorf("failed to decode VCS info: %w", err)
	}

	return &vcs, nil
}

// GetSessionDiff retrieves the current diff state for a session
// OpenCode API: GET /session/{id}/diff
func (c *Client) GetSessionDiff(ctx context.Context, baseURL, sessionID string) ([]SessionDiffFile, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", baseURL+"/session/"+sessionID+"/diff", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get session diff: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get session diff: status %d, body: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read session diff: %w", err)
	}

	// Try array first
	var diffs []SessionDiffFile
	if err := json.Unmarshal(body, &diffs); err == nil {
		return diffs, nil
	}

	// Fall back to map format (keyed by file path)
	var diffsMap map[string]SessionDiffFile
	if err := json.Unmarshal(body, &diffsMap); err != nil {
		return nil, fmt.Errorf("failed to decode session diff: %w", err)
	}

	diffs = make([]SessionDiffFile, 0, len(diffsMap))
	for _, d := range diffsMap {
		diffs = append(diffs, d)
	}

	return diffs, nil
}

// RejectQuestion rejects a pending question
func (c *Client) RejectQuestion(ctx context.Context, baseURL, requestID string) error {
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/question/"+requestID+"/reject", nil)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to reject question: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to reject question: status %d, body: %s", resp.StatusCode, string(body))
	}

	return nil
}
