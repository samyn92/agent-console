package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	agentsv1alpha1 "github.com/samyn92/agent-operator-core/api/v1alpha1"
	"github.com/samyn92/agent-console/internal/github"
	"github.com/samyn92/agent-console/internal/gitlab"
	"github.com/samyn92/agent-console/internal/k8s"
	"github.com/samyn92/agent-console/internal/opencode"
	"github.com/samyn92/agent-console/internal/telemetry"
	"go.uber.org/zap"
)

// Handlers holds all HTTP handlers
type Handlers struct {
	k8s          *k8s.Client
	opencode     *opencode.Client
	github       *github.Client
	gitlab       *gitlab.Client
	traceStorage *telemetry.Storage
	log          *zap.SugaredLogger
}

// New creates handlers
func New(k8sClient *k8s.Client, traceStorage *telemetry.Storage, log *zap.SugaredLogger) *Handlers {
	return &Handlers{
		k8s:          k8sClient,
		opencode:     opencode.New(log),
		github:       github.New(),
		gitlab:       gitlab.New(),
		traceStorage: traceStorage,
		log:          log,
	}
}

// ============================================================================
// AGENTS
// ============================================================================

// ListAgents returns all agents
func (h *Handlers) ListAgents(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")

	agents, err := h.k8s.ListAgents(r.Context(), namespace)
	if err != nil {
		h.log.Errorw("Failed to list agents", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list agents")
		return
	}

	// Transform to JSON-friendly format
	result := make([]AgentResponse, 0, len(agents))
	for _, a := range agents {
		result = append(result, agentToResponse(a))
	}

	jsonOK(w, result)
}

// GetAgent returns a specific agent
func (h *Handlers) GetAgent(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		h.log.Errorw("Failed to get agent", "namespace", namespace, "name", name, "error", err)
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	jsonOK(w, agentToResponse(*agent))
}

// ChatWithAgent sends a message to an agent and returns session info
// The frontend should separately connect to /events to receive real-time updates
// Supports multi-session: if sessionId is a real OpenCode session ID, use it directly.
// If not provided, creates/reuses a default session for the user.
func (h *Handlers) ChatWithAgent(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	// Parse request body
	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Get agent to verify it exists and get service URL
	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	// Get user ID from cookie
	userID := ""
	if cookie, err := r.Cookie("console_session"); err == nil {
		userID = cookie.Value
	} else {
		userID = fmt.Sprintf("user_%d", time.Now().UnixNano())
		http.SetCookie(w, &http.Cookie{
			Name:     "console_session",
			Value:    userID,
			Path:     "/",
			MaxAge:   86400 * 30,
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})
	}

	var sessionID string

	// If a specific session ID is provided, use it directly (continuing an existing session)
	if req.SessionID != "" {
		sessionID = req.SessionID
		// Update the cache so subsequent calls without sessionID use this session
		h.opencode.SetSessionForUser(namespace, name, userID, sessionID)
	} else {
		// Get or create a default session for this user+agent
		sessionID, err = h.opencode.GetOrCreateSession(r.Context(), serviceURL, namespace, name, userID)
		if err != nil {
			h.log.Errorw("Failed to create OpenCode session", "error", err, "url", serviceURL)
			jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create session: %v", err))
			return
		}
	}

	// Send message to OpenCode asynchronously
	if err := h.opencode.SendMessageAsync(r.Context(), serviceURL, sessionID, req.Message); err != nil {
		h.log.Errorw("Failed to send message to agent", "error", err, "url", serviceURL)
		h.opencode.InvalidateSession(namespace, name, userID)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Agent error: %v", err))
		return
	}

	// Return session info - frontend will connect to /events endpoint separately
	jsonOK(w, map[string]string{
		"sessionId": sessionID,
		"userId":    userID,
		"status":    "sent",
	})
}

// AgentEvents proxies SSE events from an agent's OpenCode instance
// This is a simple passthrough - the frontend handles filtering and parsing
func (h *Handlers) AgentEvents(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	// Get agent to verify it exists
	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

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

	// Connect to OpenCode's event endpoint
	req, err := http.NewRequestWithContext(r.Context(), "GET", serviceURL+"/event", nil)
	if err != nil {
		h.log.Errorw("Failed to create event request", "error", err)
		return
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")

	// Use a client with no timeout for SSE, force IPv4 for dual-stack clusters
	client := &http.Client{Timeout: 0, Transport: opencode.IPv4Transport()}
	resp, err := client.Do(req)
	if err != nil {
		h.log.Errorw("Failed to connect to agent events", "error", err, "url", serviceURL)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		h.log.Errorw("Agent events returned error", "status", resp.StatusCode)
		return
	}

	h.log.Infow("Connected to agent events, proxying to client", "agent", name, "namespace", namespace)

	// Simple byte-level passthrough with proper flushing
	buf := make([]byte, 4096)
	for {
		select {
		case <-r.Context().Done():
			return
		default:
		}

		n, err := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				return
			}
			flusher.Flush()
		}
		if err != nil {
			if err != io.EOF {
				h.log.Warnw("Error reading from agent events", "error", err)
			}
			return
		}
	}
}

// getAgentServiceURL returns the service URL for an agent
// In dev mode (KUBECTL_PROXY_URL set), uses kubectl proxy to reach agents
// Otherwise uses agent's status.serviceURL or constructs cluster DNS URL
func (h *Handlers) getAgentServiceURL(agent *agentsv1alpha1.Agent, namespace, name string) string {
	// Explicit override takes priority
	if override := os.Getenv("AGENT_URL_OVERRIDE"); override != "" {
		return override
	}

	// GetAgentServiceURL checks KUBECTL_PROXY_URL for dev mode
	// If set, it returns the proxy URL which we should use (not the stored serviceURL)
	serviceURL := h.k8s.GetAgentServiceURL(namespace, name)

	// Only use stored serviceURL when NOT in dev mode (no kubectl proxy)
	if os.Getenv("KUBECTL_PROXY_URL") == "" && agent.Status.ServiceURL != "" {
		serviceURL = agent.Status.ServiceURL
	}

	return serviceURL
}

// ============================================================================
// PERMISSION HANDLING
// ============================================================================

// PermissionReplyRequest represents a request to reply to a permission prompt
type PermissionReplyRequest struct {
	SessionID string `json:"sessionId"`
	Response  string `json:"response"` // "once" | "always" | "reject"
}

// ReplyToPermission handles responding to a pending permission request from an agent
func (h *Handlers) ReplyToPermission(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	permissionID := chi.URLParam(r, "permissionID")

	// Parse request body
	var req PermissionReplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.SessionID == "" {
		jsonError(w, http.StatusBadRequest, "sessionId is required")
		return
	}

	if req.Response != "once" && req.Response != "always" && req.Response != "reject" {
		jsonError(w, http.StatusBadRequest, "response must be 'once', 'always', or 'reject'")
		return
	}

	// Get agent to verify it exists and get service URL
	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	// Reply to permission
	if err := h.opencode.ReplyToPermission(r.Context(), serviceURL, req.SessionID, permissionID, req.Response); err != nil {
		h.log.Errorw("Failed to reply to permission", "error", err, "permissionID", permissionID)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to reply to permission: %v", err))
		return
	}

	jsonOK(w, map[string]bool{"success": true})
}

// ============================================================================
// QUESTION HANDLING
// ============================================================================

// QuestionReplyRequest represents a request to reply to a question
type QuestionReplyRequest struct {
	Answers [][]string `json:"answers"`
}

// ReplyToQuestion handles replying to a pending question from an agent
func (h *Handlers) ReplyToQuestion(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	requestID := chi.URLParam(r, "requestID")

	// Parse request body
	var req QuestionReplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Get agent to verify it exists and get service URL
	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	// Reply to question
	if err := h.opencode.ReplyToQuestion(r.Context(), serviceURL, requestID, req.Answers); err != nil {
		h.log.Errorw("Failed to reply to question", "error", err, "requestID", requestID)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to reply to question: %v", err))
		return
	}

	jsonOK(w, map[string]bool{"success": true})
}

// RejectQuestion handles rejecting/dismissing a pending question from an agent
func (h *Handlers) RejectQuestion(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	requestID := chi.URLParam(r, "requestID")

	// Get agent to verify it exists and get service URL
	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	// Reject question
	if err := h.opencode.RejectQuestion(r.Context(), serviceURL, requestID); err != nil {
		h.log.Errorw("Failed to reject question", "error", err, "requestID", requestID)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to reject question: %v", err))
		return
	}

	jsonOK(w, map[string]bool{"success": true})
}

// AbortSessionRequest is the request body for aborting a session
type AbortSessionRequest struct {
	SessionID string `json:"sessionId"`
}

// AbortSession handles aborting an active session to stop AI processing
func (h *Handlers) AbortSession(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	var req AbortSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.SessionID == "" {
		jsonError(w, http.StatusBadRequest, "sessionId is required")
		return
	}

	// Get agent to verify it exists and get service URL
	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	// Abort the session
	if err := h.opencode.AbortSession(r.Context(), serviceURL, req.SessionID); err != nil {
		h.log.Errorw("Failed to abort session", "error", err, "sessionID", req.SessionID)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to abort session: %v", err))
		return
	}

	jsonOK(w, map[string]bool{"success": true})
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

// ListSessions returns all sessions for an agent
func (h *Handlers) ListSessions(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	// Get agent to verify it exists and get service URL
	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	sessions, err := h.opencode.ListSessions(r.Context(), serviceURL)
	if err != nil {
		h.log.Errorw("Failed to list sessions", "error", err, "agent", name)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to list sessions: %v", err))
		return
	}

	jsonOK(w, sessions)
}

// GetSession returns a specific session for an agent
func (h *Handlers) GetSession(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	sessionID := chi.URLParam(r, "sessionID")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	session, err := h.opencode.GetSession(r.Context(), serviceURL, sessionID)
	if err != nil {
		h.log.Errorw("Failed to get session", "error", err, "sessionID", sessionID)
		jsonError(w, http.StatusNotFound, fmt.Sprintf("Session not found: %v", err))
		return
	}

	jsonOK(w, session)
}

// DeleteSession deletes a session from an agent
func (h *Handlers) DeleteSession(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	sessionID := chi.URLParam(r, "sessionID")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	if err := h.opencode.DeleteSession(r.Context(), serviceURL, sessionID); err != nil {
		h.log.Errorw("Failed to delete session", "error", err, "sessionID", sessionID)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to delete session: %v", err))
		return
	}

	jsonOK(w, map[string]bool{"success": true})
}

// GetSessionMessages returns messages for a session
func (h *Handlers) GetSessionMessages(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	sessionID := chi.URLParam(r, "sessionID")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	messages, err := h.opencode.GetSessionMessages(r.Context(), serviceURL, sessionID)
	if err != nil {
		h.log.Errorw("Failed to get session messages", "error", err, "sessionID", sessionID)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to get messages: %v", err))
		return
	}

	// Write raw JSON directly (it's already JSON from OpenCode)
	w.Header().Set("Content-Type", "application/json")
	w.Write(messages)
}

// GetSessionParts returns message parts for a session
func (h *Handlers) GetSessionParts(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	sessionID := chi.URLParam(r, "sessionID")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	parts, err := h.opencode.GetSessionParts(r.Context(), serviceURL, sessionID)
	if err != nil {
		h.log.Errorw("Failed to get session parts", "error", err, "sessionID", sessionID)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to get parts: %v", err))
		return
	}

	// Write raw JSON directly
	w.Header().Set("Content-Type", "application/json")
	w.Write(parts)
}

// CreateSessionRequest is the request to create a new session
type CreateSessionReq struct {
	Title string `json:"title,omitempty"`
}

// CreateSession creates a new session for an agent
func (h *Handlers) CreateSession(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	var req CreateSessionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Allow empty body - title is optional
		req.Title = ""
	}

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	// Pass title through to OpenCode. If empty, OpenCode auto-generates
	// a title after the first message.
	sessionID, err := h.opencode.CreateNewSession(r.Context(), serviceURL, req.Title)
	if err != nil {
		h.log.Errorw("Failed to create session", "error", err)
		jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create session: %v", err))
		return
	}

	jsonOK(w, map[string]string{
		"id": sessionID,
	})
}

// ============================================================================
// WORKFLOWS
// ============================================================================

// ListWorkflows returns all workflows
func (h *Handlers) ListWorkflows(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")

	workflows, err := h.k8s.ListWorkflows(r.Context(), namespace)
	if err != nil {
		h.log.Errorw("Failed to list workflows", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list workflows")
		return
	}

	result := make([]WorkflowResponse, 0, len(workflows))
	for _, wf := range workflows {
		result = append(result, workflowToResponse(wf))
	}

	jsonOK(w, result)
}

// GetWorkflow returns a specific workflow
func (h *Handlers) GetWorkflow(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	workflow, err := h.k8s.GetWorkflow(r.Context(), namespace, name)
	if err != nil {
		h.log.Errorw("Failed to get workflow", "namespace", namespace, "name", name, "error", err)
		jsonError(w, http.StatusNotFound, "Workflow not found")
		return
	}

	jsonOK(w, workflowToResponse(*workflow))
}

// ListWorkflowRuns returns all workflow runs
func (h *Handlers) ListWorkflowRuns(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")

	runs, err := h.k8s.ListWorkflowRuns(r.Context(), namespace)
	if err != nil {
		h.log.Errorw("Failed to list workflow runs", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list workflow runs")
		return
	}

	result := make([]WorkflowRunResponse, 0, len(runs))
	for _, run := range runs {
		result = append(result, workflowRunToResponse(run))
	}

	jsonOK(w, result)
}

// ============================================================================
// CHANNELS
// ============================================================================

// ListChannels returns all channels
func (h *Handlers) ListChannels(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")

	channels, err := h.k8s.ListChannels(r.Context(), namespace)
	if err != nil {
		h.log.Errorw("Failed to list channels", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list channels")
		return
	}

	result := make([]ChannelResponse, 0, len(channels))
	for _, ch := range channels {
		result = append(result, channelToResponse(ch))
	}

	jsonOK(w, result)
}

// GetChannel returns a specific channel
func (h *Handlers) GetChannel(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	channel, err := h.k8s.GetChannel(r.Context(), namespace, name)
	if err != nil {
		h.log.Errorw("Failed to get channel", "namespace", namespace, "name", name, "error", err)
		jsonError(w, http.StatusNotFound, "Channel not found")
		return
	}

	jsonOK(w, channelToResponse(*channel))
}

// ============================================================================
// CAPABILITIES
// ============================================================================

// ListCapabilities returns all capabilities
func (h *Handlers) ListCapabilities(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")

	capabilities, err := h.k8s.ListCapabilities(r.Context(), namespace)
	if err != nil {
		h.log.Errorw("Failed to list capabilities", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list capabilities")
		return
	}

	result := make([]CapabilityResponse, 0, len(capabilities))
	for _, capability := range capabilities {
		result = append(result, capabilityToResponse(capability))
	}

	jsonOK(w, result)
}

// GetCapability returns a specific capability
func (h *Handlers) GetCapability(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	capability, err := h.k8s.GetCapability(r.Context(), namespace, name)
	if err != nil {
		h.log.Errorw("Failed to get capability", "namespace", namespace, "name", name, "error", err)
		jsonError(w, http.StatusNotFound, "Capability not found")
		return
	}

	jsonOK(w, capabilityToResponse(*capability))
}

// ============================================================================
// VCS & DIFF - Git state proxy to OpenCode
// ============================================================================

// GetAgentVCS proxies the VCS (git) status from an agent's OpenCode instance
func (h *Handlers) GetAgentVCS(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	vcs, err := h.opencode.GetVCS(r.Context(), serviceURL)
	if err != nil {
		h.log.Warnw("Failed to get VCS info", "error", err, "agent", name)
		// Return empty VCS info rather than error — agent may not have a repo
		jsonOK(w, map[string]interface{}{
			"branch": "",
			"sha":    "",
			"dirty":  false,
			"ahead":  0,
			"behind": 0,
		})
		return
	}

	jsonOK(w, vcs)
}

// GetSessionDiff proxies the session diff from an agent's OpenCode instance
func (h *Handlers) GetSessionDiff(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	sessionID := chi.URLParam(r, "sessionID")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	serviceURL := h.getAgentServiceURL(agent, namespace, name)

	diffs, err := h.opencode.GetSessionDiff(r.Context(), serviceURL, sessionID)
	if err != nil {
		h.log.Warnw("Failed to get session diff", "error", err, "sessionID", sessionID)
		// Return empty array rather than error
		jsonOK(w, []interface{}{})
		return
	}

	jsonOK(w, diffs)
}

// ============================================================================
// GIT CONTEXT - Resolve agent → capabilityRefs → Capability CRD git config
// ============================================================================

// GitContextResponse describes the git repositories an agent works with
type GitContextResponse struct {
	Repositories []GitRepoInfo `json:"repositories"`
}

// GitRepoInfo describes a single git repository from Capability config
type GitRepoInfo struct {
	URL      string `json:"url"`
	Owner    string `json:"owner"`
	Name     string `json:"name"`
	Provider string `json:"provider"` // "github", "gitlab", "git"
	Domain   string `json:"domain,omitempty"`
}

// GetAgentGitContext resolves git repos from agent's capabilityRefs → Capability CRDs
func (h *Handlers) GetAgentGitContext(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	var repos []GitRepoInfo

	// Walk agent's capabilityRefs and extract git config from each Capability CRD
	for _, ref := range agent.Spec.CapabilityRefs {
		capability, err := h.k8s.GetCapability(r.Context(), namespace, ref.Name)
		if err != nil {
			h.log.Warnw("Failed to get capability", "capability", ref.Name, "error", err)
			continue
		}

		if capability.Spec.Container == nil || capability.Spec.Container.Config == nil {
			continue
		}

		config := capability.Spec.Container.Config

		// Extract from config.git.repositories[]
		if config.Git != nil {
			for _, repo := range config.Git.Repositories {
				parsed := parseRepoURL(repo.URL)
				if parsed != nil {
					repos = append(repos, GitRepoInfo{
						URL:      repo.URL,
						Owner:    parsed.Owner,
						Name:     parsed.Name,
						Provider: parsed.Provider,
					})
				}
			}
		}

		// Extract from config.github.repositories[] (format: "owner/repo")
		if config.GitHub != nil {
			for _, ghRepo := range config.GitHub.Repositories {
				owner, repoName := splitOwnerRepo(ghRepo)
				repos = append(repos, GitRepoInfo{
					URL:      fmt.Sprintf("https://github.com/%s", ghRepo),
					Owner:    owner,
					Name:     repoName,
					Provider: "github",
				})
			}
		}

		// Extract from config.gitlab.projects[] (format: "group/project")
		if config.GitLab != nil {
			domain := config.GitLab.Domain
			if domain == "" {
				domain = "gitlab.com"
			}
			for _, p := range config.GitLab.Projects {
				owner, repoName := splitOwnerRepo(p)
				repos = append(repos, GitRepoInfo{
					URL:      fmt.Sprintf("https://%s/%s", domain, p),
					Owner:    owner,
					Name:     repoName,
					Provider: "gitlab",
					Domain:   domain,
				})
			}
		}
	}

	jsonOK(w, GitContextResponse{Repositories: repos})
}

// splitOwnerRepo splits "owner/repo" into (owner, repo)
func splitOwnerRepo(s string) (string, string) {
	parts := strings.SplitN(s, "/", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return "", s
}

// ============================================================================
// COMMITS - Agent commit history from git provider
// ============================================================================

// GetAgentCommits returns recent commits for an agent's primary repository,
// optionally filtered by branch (defaults to the agent's current VCS branch).
func (h *Handlers) GetAgentCommits(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	branch := r.URL.Query().Get("branch")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	// If no branch specified, try to get the current branch from VCS
	if branch == "" {
		serviceURL := h.getAgentServiceURL(agent, namespace, name)
		vcs, err := h.opencode.GetVCS(r.Context(), serviceURL)
		if err == nil && vcs != nil && vcs.Branch != "" {
			branch = vcs.Branch
		}
	}

	// Resolve agent → first repo via capabilityRefs → Capability CRD git config
	var repoInfo *GitRepoInfo
	for _, ref := range agent.Spec.CapabilityRefs {
		capability, err := h.k8s.GetCapability(r.Context(), namespace, ref.Name)
		if err != nil || capability.Spec.Container == nil || capability.Spec.Container.Config == nil {
			continue
		}

		config := capability.Spec.Container.Config

		// Check git config
		if config.Git != nil {
			for _, repo := range config.Git.Repositories {
				parsed := parseRepoURL(repo.URL)
				if parsed != nil {
					repoInfo = &GitRepoInfo{
						URL:      repo.URL,
						Owner:    parsed.Owner,
						Name:     parsed.Name,
						Provider: parsed.Provider,
					}
					break
				}
			}
		}
		if repoInfo != nil {
			break
		}

		// Check GitHub config
		if config.GitHub != nil {
			for _, ghRepo := range config.GitHub.Repositories {
				owner, repoName := splitOwnerRepo(ghRepo)
				repoInfo = &GitRepoInfo{
					URL:      fmt.Sprintf("https://github.com/%s", ghRepo),
					Owner:    owner,
					Name:     repoName,
					Provider: "github",
				}
				break
			}
		}
		if repoInfo != nil {
			break
		}

		// Check GitLab config
		if config.GitLab != nil {
			domain := config.GitLab.Domain
			if domain == "" {
				domain = "gitlab.com"
			}
			for _, p := range config.GitLab.Projects {
				owner, repoName := splitOwnerRepo(p)
				repoInfo = &GitRepoInfo{
					URL:      fmt.Sprintf("https://%s/%s", domain, p),
					Owner:    owner,
					Name:     repoName,
					Provider: "gitlab",
					Domain:   domain,
				}
				break
			}
		}
		if repoInfo != nil {
			break
		}
	}

	if repoInfo == nil {
		// No repo found — return empty list
		jsonOK(w, []CommitInfo{})
		return
	}

	// Fetch commits from the appropriate provider
	var commits []CommitInfo

	switch repoInfo.Provider {
	case "github":
		token := getGitHubToken()
		if token == "" {
			jsonError(w, http.StatusUnauthorized, "GitHub token not configured")
			return
		}
		ghCommits, err := h.github.ListCommitsByBranch(r.Context(), token, repoInfo.Owner, repoInfo.Name, branch)
		if err != nil {
			h.log.Warnw("Failed to fetch GitHub commits", "repo", repoInfo.Owner+"/"+repoInfo.Name, "branch", branch, "error", err)
			jsonOK(w, []CommitInfo{})
			return
		}
		for _, c := range ghCommits {
			timestamp := c.Commit.Author.Date
			author := c.Commit.Author.Name
			if c.Author.Login != "" {
				author = c.Author.Login
			}
			commits = append(commits, CommitInfo{
				SHA:       c.SHA,
				Message:   c.Commit.Message,
				Author:    author,
				Timestamp: &timestamp,
			})
		}

	case "gitlab":
		token := getGitLabToken()
		if token == "" {
			jsonError(w, http.StatusUnauthorized, "GitLab token not configured")
			return
		}
		projectPath := repoInfo.Owner + "/" + repoInfo.Name
		glCommits, err := h.gitlab.ListCommitsByBranch(r.Context(), token, repoInfo.Domain, projectPath, branch)
		if err != nil {
			h.log.Warnw("Failed to fetch GitLab commits", "project", projectPath, "branch", branch, "error", err)
			jsonOK(w, []CommitInfo{})
			return
		}
		for _, c := range glCommits {
			timestamp := c.CreatedAt
			commits = append(commits, CommitInfo{
				SHA:       c.ID,
				Message:   c.Title,
				Author:    c.AuthorName,
				Timestamp: &timestamp,
			})
		}

	default:
		// Unknown provider — return empty
		jsonOK(w, []CommitInfo{})
		return
	}

	if commits == nil {
		commits = []CommitInfo{}
	}

	jsonOK(w, commits)
}

// ============================================================================
// PULL REQUESTS - Agent PR/MR discovery with checks and reviews
// ============================================================================

// GetAgentPRs returns pull requests/merge requests for an agent's primary
// repository, enriched with check runs and reviews.
func (h *Handlers) GetAgentPRs(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	// Get current branch from VCS
	branch := ""
	serviceURL := h.getAgentServiceURL(agent, namespace, name)
	vcs, err := h.opencode.GetVCS(r.Context(), serviceURL)
	if err == nil && vcs != nil && vcs.Branch != "" {
		branch = vcs.Branch
	}

	// Resolve agent → first repo via capabilityRefs → Capability CRD git config
	var repoInfo *GitRepoInfo
	for _, ref := range agent.Spec.CapabilityRefs {
		capability, err := h.k8s.GetCapability(r.Context(), namespace, ref.Name)
		if err != nil || capability.Spec.Container == nil || capability.Spec.Container.Config == nil {
			continue
		}

		config := capability.Spec.Container.Config

		if config.Git != nil {
			for _, repo := range config.Git.Repositories {
				parsed := parseRepoURL(repo.URL)
				if parsed != nil {
					repoInfo = &GitRepoInfo{
						URL:      repo.URL,
						Owner:    parsed.Owner,
						Name:     parsed.Name,
						Provider: parsed.Provider,
					}
					break
				}
			}
		}
		if repoInfo != nil {
			break
		}

		if config.GitHub != nil {
			for _, ghRepo := range config.GitHub.Repositories {
				owner, repoName := splitOwnerRepo(ghRepo)
				repoInfo = &GitRepoInfo{
					URL:      fmt.Sprintf("https://github.com/%s", ghRepo),
					Owner:    owner,
					Name:     repoName,
					Provider: "github",
				}
				break
			}
		}
		if repoInfo != nil {
			break
		}

		if config.GitLab != nil {
			domain := config.GitLab.Domain
			if domain == "" {
				domain = "gitlab.com"
			}
			for _, p := range config.GitLab.Projects {
				owner, repoName := splitOwnerRepo(p)
				repoInfo = &GitRepoInfo{
					URL:      fmt.Sprintf("https://%s/%s", domain, p),
					Owner:    owner,
					Name:     repoName,
					Provider: "gitlab",
					Domain:   domain,
				}
				break
			}
		}
		if repoInfo != nil {
			break
		}
	}

	if repoInfo == nil {
		jsonOK(w, AgentPRResponse{PullRequests: []EnrichedPullRequest{}})
		return
	}

	var enrichedPRs []EnrichedPullRequest

	switch repoInfo.Provider {
	case "github":
		token := getGitHubToken()
		if token == "" {
			jsonError(w, http.StatusUnauthorized, "GitHub token not configured")
			return
		}

		// Fetch all open PRs
		prs, err := h.github.ListPullRequests(r.Context(), token, repoInfo.Owner, repoInfo.Name, "open")
		if err != nil {
			h.log.Warnw("Failed to fetch GitHub PRs", "repo", repoInfo.Owner+"/"+repoInfo.Name, "error", err)
			jsonOK(w, AgentPRResponse{
				PullRequests: []EnrichedPullRequest{},
				Repository:   repoInfo,
				Branch:       branch,
			})
			return
		}

		// Filter to PRs matching the current branch (if we have one)
		var relevantPRs []PullRequestInfo
		var relevantGHPRs []struct {
			pr      PullRequestInfo
			number  int
			headSHA string
		}

		for _, pr := range prs {
			// If we have a branch, only include PRs from that branch
			if branch != "" && pr.Head.Ref != branch {
				continue
			}

			state := pr.State
			if pr.Merged {
				state = "merged"
			}
			mergeable := false
			if pr.Mergeable != nil {
				mergeable = *pr.Mergeable
			}
			createdAt := pr.CreatedAt
			updatedAt := pr.UpdatedAt

			info := PullRequestInfo{
				Number:       pr.Number,
				Title:        pr.Title,
				State:        state,
				Branch:       pr.Head.Ref,
				BaseBranch:   pr.Base.Ref,
				Author:       pr.User.Login,
				CreatedAt:    &createdAt,
				UpdatedAt:    &updatedAt,
				Additions:    pr.Additions,
				Deletions:    pr.Deletions,
				ChangedFiles: pr.ChangedFiles,
				Mergeable:    mergeable,
				URL:          pr.HTMLURL,
			}

			relevantPRs = append(relevantPRs, info)
			relevantGHPRs = append(relevantGHPRs, struct {
				pr      PullRequestInfo
				number  int
				headSHA string
			}{pr: info, number: pr.Number, headSHA: pr.Head.Ref})
		}

		// Enrich each PR with checks and reviews
		for _, rpr := range relevantGHPRs {
			epr := EnrichedPullRequest{
				PullRequestInfo: rpr.pr,
			}

			// Fetch check runs for the PR's head branch
			checks, err := h.github.ListCheckRuns(r.Context(), token, repoInfo.Owner, repoInfo.Name, rpr.headSHA)
			if err == nil {
				for _, check := range checks {
					epr.Checks = append(epr.Checks, CheckInfo{
						Name:        check.Name,
						Status:      check.Status,
						Conclusion:  check.Conclusion,
						URL:         check.HTMLURL,
						StartedAt:   check.StartedAt,
						CompletedAt: check.CompletedAt,
					})
				}
			}

			// Fetch reviews for the PR
			reviews, err := h.github.ListReviews(r.Context(), token, repoInfo.Owner, repoInfo.Name, rpr.number)
			if err == nil {
				for _, review := range reviews {
					epr.Reviews = append(epr.Reviews, ReviewInfo{
						Author:      review.User.Login,
						State:       review.State,
						Body:        review.Body,
						SubmittedAt: review.SubmittedAt,
					})
				}
			}

			// Determine merge readiness
			epr.MergeReady = determineMergeReady(epr)

			enrichedPRs = append(enrichedPRs, epr)
		}

	case "gitlab":
		token := getGitLabToken()
		if token == "" {
			jsonError(w, http.StatusUnauthorized, "GitLab token not configured")
			return
		}
		projectPath := repoInfo.Owner + "/" + repoInfo.Name

		// Fetch open MRs
		mrs, err := h.gitlab.ListMergeRequests(r.Context(), token, repoInfo.Domain, projectPath, "opened")
		if err != nil {
			h.log.Warnw("Failed to fetch GitLab MRs", "project", projectPath, "error", err)
			jsonOK(w, AgentPRResponse{
				PullRequests: []EnrichedPullRequest{},
				Repository:   repoInfo,
				Branch:       branch,
			})
			return
		}

		for _, mr := range mrs {
			// If we have a branch, only include MRs from that branch
			if branch != "" && mr.SourceBranch != branch {
				continue
			}

			state := mr.State
			if state == "opened" {
				state = "open"
			}
			mergeable := mr.MergeStatus == "can_be_merged"
			createdAt := mr.CreatedAt
			updatedAt := mr.UpdatedAt

			info := PullRequestInfo{
				Number:     mr.IID,
				Title:      mr.Title,
				State:      state,
				Branch:     mr.SourceBranch,
				BaseBranch: mr.TargetBranch,
				Author:     mr.Author.Username,
				CreatedAt:  &createdAt,
				UpdatedAt:  &updatedAt,
				Mergeable:  mergeable,
				URL:        mr.WebURL,
			}

			// Fetch full MR details for additions/deletions
			mrDetails, err := h.gitlab.GetMergeRequest(r.Context(), token, repoInfo.Domain, projectPath, mr.IID)
			if err == nil {
				info.Additions = mrDetails.DiffStats.Additions
				info.Deletions = mrDetails.DiffStats.Deletions
			}

			epr := EnrichedPullRequest{
				PullRequestInfo: info,
			}

			// Fetch pipeline status (GitLab uses pipelines instead of check runs)
			pipelines, err := h.gitlab.ListPipelines(r.Context(), token, repoInfo.Domain, projectPath)
			if err == nil {
				for _, pipeline := range pipelines {
					// Only include pipelines for this MR's source branch
					if pipeline.Ref != mr.SourceBranch {
						continue
					}
					startedAt := pipeline.CreatedAt
					epr.Checks = append(epr.Checks, CheckInfo{
						Name:      fmt.Sprintf("Pipeline #%d", pipeline.ID),
						Status:    pipeline.Status,
						URL:       pipeline.WebURL,
						StartedAt: &startedAt,
					})
				}
			}

			// Fetch approvals
			approvals, err := h.gitlab.ListMRApprovals(r.Context(), token, repoInfo.Domain, projectPath, mr.IID)
			if err == nil {
				for _, approver := range approvals.ApprovedBy {
					epr.Reviews = append(epr.Reviews, ReviewInfo{
						Author: approver.User.Username,
						State:  "APPROVED",
					})
				}
			}

			epr.MergeReady = determineMergeReady(epr)
			enrichedPRs = append(enrichedPRs, epr)
		}

	default:
		jsonOK(w, AgentPRResponse{
			PullRequests: []EnrichedPullRequest{},
			Repository:   repoInfo,
			Branch:       branch,
		})
		return
	}

	if enrichedPRs == nil {
		enrichedPRs = []EnrichedPullRequest{}
	}

	jsonOK(w, AgentPRResponse{
		PullRequests: enrichedPRs,
		Repository:   repoInfo,
		Branch:       branch,
	})
}

// determineMergeReady evaluates whether a PR is ready to merge based on
// checks passing and having at least one approval with no changes requested.
func determineMergeReady(epr EnrichedPullRequest) bool {
	// Must be mergeable per the provider
	if !epr.Mergeable {
		return false
	}

	// All checks must be completed successfully
	for _, check := range epr.Checks {
		if check.Status != "completed" && check.Status != "success" {
			return false
		}
		if check.Conclusion != "" && check.Conclusion != "success" && check.Conclusion != "neutral" && check.Conclusion != "skipped" {
			return false
		}
	}

	// Check reviews: need at least one approval, no changes_requested
	hasApproval := false
	for _, review := range epr.Reviews {
		if review.State == "CHANGES_REQUESTED" {
			return false
		}
		if review.State == "APPROVED" {
			hasApproval = true
		}
	}

	// If there are no reviews, still allow merge (some repos don't require reviews)
	if len(epr.Reviews) > 0 && !hasApproval {
		return false
	}

	return true
}

// ============================================================================
// CI/CD PIPELINES - Agent pipeline tracking from git provider
// ============================================================================

// GetAgentPipelines returns CI/CD pipelines for an agent's primary repository,
// filtered by branch (defaults to the agent's current VCS branch), enriched
// with per-job status.
func (h *Handlers) GetAgentPipelines(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	branch := r.URL.Query().Get("branch")

	agent, err := h.k8s.GetAgent(r.Context(), namespace, name)
	if err != nil {
		jsonError(w, http.StatusNotFound, "Agent not found")
		return
	}

	// If no branch specified, try to get the current branch from VCS
	if branch == "" {
		serviceURL := h.getAgentServiceURL(agent, namespace, name)
		vcs, err := h.opencode.GetVCS(r.Context(), serviceURL)
		if err == nil && vcs != nil && vcs.Branch != "" {
			branch = vcs.Branch
		}
	}

	// Resolve agent → first repo via capabilityRefs → Capability CRD git config
	var repoInfo *GitRepoInfo
	for _, ref := range agent.Spec.CapabilityRefs {
		capability, err := h.k8s.GetCapability(r.Context(), namespace, ref.Name)
		if err != nil || capability.Spec.Container == nil || capability.Spec.Container.Config == nil {
			continue
		}

		config := capability.Spec.Container.Config

		if config.Git != nil {
			for _, repo := range config.Git.Repositories {
				parsed := parseRepoURL(repo.URL)
				if parsed != nil {
					repoInfo = &GitRepoInfo{
						URL:      repo.URL,
						Owner:    parsed.Owner,
						Name:     parsed.Name,
						Provider: parsed.Provider,
					}
					break
				}
			}
		}
		if repoInfo != nil {
			break
		}

		if config.GitHub != nil {
			for _, ghRepo := range config.GitHub.Repositories {
				owner, repoName := splitOwnerRepo(ghRepo)
				repoInfo = &GitRepoInfo{
					URL:      fmt.Sprintf("https://github.com/%s", ghRepo),
					Owner:    owner,
					Name:     repoName,
					Provider: "github",
				}
				break
			}
		}
		if repoInfo != nil {
			break
		}

		if config.GitLab != nil {
			domain := config.GitLab.Domain
			if domain == "" {
				domain = "gitlab.com"
			}
			for _, p := range config.GitLab.Projects {
				owner, repoName := splitOwnerRepo(p)
				repoInfo = &GitRepoInfo{
					URL:      fmt.Sprintf("https://%s/%s", domain, p),
					Owner:    owner,
					Name:     repoName,
					Provider: "gitlab",
					Domain:   domain,
				}
				break
			}
		}
		if repoInfo != nil {
			break
		}
	}

	emptyResponse := AgentPipelineResponse{
		Pipelines:  []PipelineInfo{},
		Repository: repoInfo,
		Branch:     branch,
	}

	if repoInfo == nil {
		jsonOK(w, emptyResponse)
		return
	}

	var pipelines []PipelineInfo

	switch repoInfo.Provider {
	case "github":
		token := getGitHubToken()
		if token == "" {
			jsonError(w, http.StatusUnauthorized, "GitHub token not configured")
			return
		}

		var runs []github.WorkflowRun
		var fetchErr error
		if branch != "" {
			runs, fetchErr = h.github.GetWorkflowRunsByBranch(r.Context(), token, repoInfo.Owner, repoInfo.Name, branch)
		} else {
			runs, fetchErr = h.github.GetWorkflowRuns(r.Context(), token, repoInfo.Owner, repoInfo.Name)
		}
		if fetchErr != nil {
			h.log.Warnw("Failed to fetch GitHub workflow runs", "repo", repoInfo.Owner+"/"+repoInfo.Name, "branch", branch, "error", fetchErr)
			jsonOK(w, emptyResponse)
			return
		}

		for _, run := range runs {
			createdAt := run.CreatedAt
			updatedAt := run.UpdatedAt

			// Calculate duration for completed runs
			var durationSec *float64
			if run.Status == "completed" {
				d := updatedAt.Sub(createdAt).Seconds()
				durationSec = &d
			}

			pi := PipelineInfo{
				ID:              run.ID,
				Name:            run.Name,
				Status:          run.Status,
				Conclusion:      run.Conclusion,
				Branch:          run.HeadBranch,
				SHA:             run.HeadSHA,
				URL:             run.HTMLURL,
				Event:           run.Event,
				CreatedAt:       &createdAt,
				UpdatedAt:       &updatedAt,
				DurationSeconds: durationSec,
			}

			// Fetch jobs for each run (limit to latest 5 runs to avoid rate limiting)
			if len(pipelines) < 5 {
				jobs, err := h.github.ListWorkflowRunJobs(r.Context(), token, repoInfo.Owner, repoInfo.Name, run.ID)
				if err == nil {
					for _, job := range jobs {
						var jobDuration *float64
						if job.StartedAt != nil && job.CompletedAt != nil {
							d := job.CompletedAt.Sub(*job.StartedAt).Seconds()
							jobDuration = &d
						}
						pi.Jobs = append(pi.Jobs, PipelineJobInfo{
							ID:              job.ID,
							Name:            job.Name,
							Status:          job.Status,
							Conclusion:      job.Conclusion,
							URL:             job.HTMLURL,
							StartedAt:       job.StartedAt,
							CompletedAt:     job.CompletedAt,
							DurationSeconds: jobDuration,
						})
					}
				}
			}

			pipelines = append(pipelines, pi)
		}

	case "gitlab":
		token := getGitLabToken()
		if token == "" {
			jsonError(w, http.StatusUnauthorized, "GitLab token not configured")
			return
		}
		projectPath := repoInfo.Owner + "/" + repoInfo.Name

		var glPipelines []gitlab.Pipeline
		var fetchErr error
		if branch != "" {
			glPipelines, fetchErr = h.gitlab.ListPipelinesByRef(r.Context(), token, repoInfo.Domain, projectPath, branch)
		} else {
			glPipelines, fetchErr = h.gitlab.ListPipelines(r.Context(), token, repoInfo.Domain, projectPath)
		}
		if fetchErr != nil {
			h.log.Warnw("Failed to fetch GitLab pipelines", "project", projectPath, "branch", branch, "error", fetchErr)
			jsonOK(w, emptyResponse)
			return
		}

		for _, pipeline := range glPipelines {
			createdAt := pipeline.CreatedAt
			updatedAt := pipeline.UpdatedAt

			// Calculate duration for completed pipelines
			var durationSec *float64
			if pipeline.Status == "success" || pipeline.Status == "failed" || pipeline.Status == "canceled" {
				d := updatedAt.Sub(createdAt).Seconds()
				durationSec = &d
			}

			pi := PipelineInfo{
				ID:              int64(pipeline.ID),
				Name:            fmt.Sprintf("Pipeline #%d", pipeline.ID),
				Status:          pipeline.Status,
				Branch:          pipeline.Ref,
				SHA:             pipeline.SHA,
				URL:             pipeline.WebURL,
				Event:           pipeline.Source,
				CreatedAt:       &createdAt,
				UpdatedAt:       &updatedAt,
				DurationSeconds: durationSec,
			}

			// Fetch jobs for each pipeline (limit to latest 5 to avoid rate limiting)
			if len(pipelines) < 5 {
				jobs, err := h.gitlab.ListPipelineJobs(r.Context(), token, repoInfo.Domain, projectPath, pipeline.ID)
				if err == nil {
					for _, job := range jobs {
						ji := PipelineJobInfo{
							ID:              int64(job.ID),
							Name:            job.Name,
							Stage:           job.Stage,
							Status:          job.Status,
							URL:             job.WebURL,
							StartedAt:       job.StartedAt,
							CompletedAt:     job.FinishedAt,
							DurationSeconds: job.Duration,
						}
						pi.Jobs = append(pi.Jobs, ji)
					}
				}
			}

			pipelines = append(pipelines, pi)
		}

	default:
		jsonOK(w, emptyResponse)
		return
	}

	if pipelines == nil {
		pipelines = []PipelineInfo{}
	}

	jsonOK(w, AgentPipelineResponse{
		Pipelines:  pipelines,
		Repository: repoInfo,
		Branch:     branch,
	})
}

// ============================================================================
// HELPERS
// ============================================================================

func jsonOK(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func writeSSE(w http.ResponseWriter, flusher http.Flusher, event string, data interface{}) {
	jsonData, _ := json.Marshal(data)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, jsonData)
	flusher.Flush()
}

func writeSSEData(w http.ResponseWriter, flusher http.Flusher, event string, data string) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
	flusher.Flush()
}

// ============================================================================
// WATCH - Real-time resource updates via SSE
// ============================================================================

// WatchEvent is sent to clients watching for resource changes
type WatchEvent struct {
	Type         string      `json:"type"`         // ADDED, MODIFIED, DELETED
	ResourceKind string      `json:"resourceKind"` // Agent, Tool, Workflow, Channel, WorkflowRun
	Namespace    string      `json:"namespace"`
	Name         string      `json:"name"`
	Resource     interface{} `json:"resource,omitempty"`
}

// Watch streams resource change events via SSE
func (h *Handlers) Watch(w http.ResponseWriter, r *http.Request) {
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

	// Filter by namespace if provided
	namespaceFilter := r.URL.Query().Get("namespace")

	// Filter by resource kinds if provided (comma-separated)
	kindsParam := r.URL.Query().Get("kinds")
	var kindFilter map[string]bool
	if kindsParam != "" {
		kindFilter = make(map[string]bool)
		for _, k := range strings.Split(kindsParam, ",") {
			kindFilter[strings.TrimSpace(k)] = true
		}
	}

	// Send initial connected event
	writeSSE(w, flusher, "connected", map[string]string{
		"message": "Watching for resource changes",
	})

	// Create event channel
	eventCh := make(chan WatchEvent, 100)

	// Subscribe to resource changes
	unsubscribe := h.k8s.Watcher().Subscribe(func(event k8s.ResourceEvent) {
		// Apply namespace filter
		if namespaceFilter != "" && event.Namespace != namespaceFilter {
			return
		}

		// Apply kind filter
		if kindFilter != nil && !kindFilter[event.ResourceKind] {
			return
		}

		// Transform resource to response format
		var resource interface{}
		switch event.ResourceKind {
		case "Agent":
			if agent, ok := event.Resource.(*agentsv1alpha1.Agent); ok && agent != nil {
				resource = agentToResponse(*agent)
			}
		case "Capability":
			if capability, ok := event.Resource.(*agentsv1alpha1.Capability); ok && capability != nil {
				resource = capabilityToResponse(*capability)
			}
		case "Workflow":
			if wf, ok := event.Resource.(*agentsv1alpha1.Workflow); ok && wf != nil {
				resource = workflowToResponse(*wf)
			}
		case "Channel":
			if ch, ok := event.Resource.(*agentsv1alpha1.Channel); ok && ch != nil {
				resource = channelToResponse(*ch)
			}
		case "WorkflowRun":
			if run, ok := event.Resource.(*agentsv1alpha1.WorkflowRun); ok && run != nil {
				resource = workflowRunToResponse(*run)
			}
		}

		// Send to channel (non-blocking)
		select {
		case eventCh <- WatchEvent{
			Type:         string(event.Type),
			ResourceKind: event.ResourceKind,
			Namespace:    event.Namespace,
			Name:         event.Name,
			Resource:     resource,
		}:
		default:
			// Drop event if channel is full
			h.log.Warnw("Dropping watch event, channel full", "kind", event.ResourceKind, "name", event.Name)
		}
	})
	defer unsubscribe()

	// Send heartbeat every 30 seconds to keep connection alive
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	// Stream events until client disconnects
	for {
		select {
		case <-r.Context().Done():
			h.log.Debug("Watch client disconnected")
			return
		case event := <-eventCh:
			writeSSE(w, flusher, "resource", event)
		case <-heartbeat.C:
			writeSSE(w, flusher, "heartbeat", map[string]int64{
				"timestamp": time.Now().Unix(),
			})
		}
	}
}
