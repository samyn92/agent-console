// API client for the console backend
// In dev mode, connect to local backend on 9090 (run: just dev-console)
// The local backend connects to cluster via kubeconfig

const API_BASE = import.meta.env.DEV ? 'http://localhost:9090' : '';

// Error class that preserves HTTP status for callers to distinguish 404 vs transient errors
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Generic fetch with error handling
async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const error = await response.json();
      message = error.error || error.data?.message || message;
    } catch {
      // response body wasn't JSON — keep the default message
    }
    throw new ApiError(message, response.status);
  }

  return response.json();
}

// ============================================================================
// TYPES - matching backend responses
// ============================================================================

export interface AgentResponse {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  spec: {
    model: string;
    provider: string;
    identity?: {
      name?: string;
      systemPrompt?: string;
    };
    tools?: {
      bash: boolean;
      read: boolean;
      write: boolean;
      edit: boolean;
      glob: boolean;
      grep: boolean;
      webfetch: boolean;
      task: boolean;
    };
    capabilityRefs?: Array<{ name: string; alias?: string }>;
  };
  status: {
    phase: string;
    ready: boolean;
    serviceURL?: string;
    readyReplicas: number;
  };
}

export interface WorkflowResponse {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  spec: {
    trigger: {
      schedule?: { cron: string; timezone?: string };
      webhook?: { path?: string };
      github?: { events?: string[]; actions?: string[]; repos?: string[] };
    };
    steps: Array<{
      name: string;
      agent: string;
      prompt: string;
    }>;
  };
  status: {
    webhookURL?: string;
    lastTriggered?: string;
    runCount: number;
    lastRunStatus?: string;
  };
}

export interface ChannelResponse {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  spec: {
    type: string;
    agentRef: string;
  };
  status: {
    phase: string;
    ready: boolean;
    serviceURL?: string;
    webhookURL?: string;
  };
}

export interface CapabilityResponse {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  spec: {
    type?: string;
    description: string;
    image: string;
    serviceAccountName?: string;
    commandPrefix?: string;
    permissions?: {
      allow?: string[];
      approve?: Array<{
        pattern: string;
        message?: string;
        severity?: 'info' | 'warning' | 'critical';
        timeout?: number;
      }>;
      deny?: string[];
    };
    rateLimit?: {
      requestsPerMinute?: number;
    };
    audit: boolean;
    instructions?: string;
  };
  status: {
    phase: string;
    usedBy?: string[];
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

// Agents
export async function listAgents(namespace?: string): Promise<AgentResponse[]> {
  const params = namespace ? `?namespace=${namespace}` : '';
  return fetchAPI<AgentResponse[]>(`/api/v1/agents${params}`);
}

// Workflows
export async function listWorkflows(namespace?: string): Promise<WorkflowResponse[]> {
  const params = namespace ? `?namespace=${namespace}` : '';
  return fetchAPI<WorkflowResponse[]>(`/api/v1/workflows${params}`);
}

export async function getWorkflow(namespace: string, name: string): Promise<WorkflowResponse> {
  return fetchAPI<WorkflowResponse>(`/api/v1/workflows/${namespace}/${name}`);
}

// Workflow Runs
export interface WorkflowRunResponse {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
  };
  spec: {
    workflowRef: string;
  };
  status: {
    phase: string;
    startTime?: string;
    endTime?: string;
    steps?: Array<{
      name: string;
      phase: string;
      startTime?: string;
      endTime?: string;
      output?: string;
    }>;
  };
}

export async function listWorkflowRuns(namespace?: string): Promise<WorkflowRunResponse[]> {
  const params = namespace ? `?namespace=${namespace}` : '';
  return fetchAPI<WorkflowRunResponse[]>(`/api/v1/workflowruns${params}`);
}

// Channels — types kept for watch infrastructure
// Capabilities
export async function listCapabilities(namespace?: string): Promise<CapabilityResponse[]> {
  const params = namespace ? `?namespace=${namespace}` : '';
  return fetchAPI<CapabilityResponse[]>(`/api/v1/capabilities${params}`);
}

// ============================================================================
// REPOSITORIES
// ============================================================================

export interface BranchInfo {
  name: string;
  lastCommit?: string;
  lastUpdated?: string;
  agentName?: string;
  prNumber?: number;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  branch: string;
  baseBranch: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: boolean;
  url?: string;
}

export interface RepoResponse {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  provider: 'github' | 'gitlab' | 'bitbucket' | 'git';
  agents: Array<{
    namespace: string;
    name: string;
    source: string;
  }>;
  activity?: {
    defaultBranch?: string;
    openPRs: number;
    branches?: BranchInfo[];
    pullRequests?: PullRequestInfo[];
    recentCommits?: Array<{
      sha: string;
      message: string;
      author: string;
      timestamp?: string;
    }>;
  };
}

// List all repositories (aggregated from agent git sources)
export async function listRepos(): Promise<RepoResponse[]> {
  return fetchAPI<RepoResponse[]>('/api/v1/repos');
}

// ============================================================================
// CHAT STREAMING - ACP (Agent Communication Protocol)
// ============================================================================

import type { ToolPart, Todo } from '../types/acp';
import { subscribe as subscribeToEventBus, isConnected as isEventBusConnected } from './event-bus';

export interface PendingQuestion {
  id: string;
  sessionID: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{
      label: string;
      description: string;
    }>;
    multiple?: boolean;
  }>;
}

export interface PendingPermission {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always?: string[];
  tool?: {
    messageID: string;
    callID: string;
  };
}

export interface ChatStreamCallbacks {
  onToken: (content: string) => void;
  onToolPart?: (toolPart: ToolPart) => void;
  onTodoUpdated?: (todos: Todo[]) => void;
  onReasoning?: (content: string) => void;
  onStepStart?: () => void;
  onStepFinish?: (cost: number, tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }) => void;
  onSubtask?: (description: string, agent: string) => void;
  onAgent?: (name: string) => void;
  onRetry?: (attempt: number, error: string) => void;
  onCompaction?: (auto: boolean) => void;
  onPatch?: (files: string[]) => void;
  onSessionInfo?: (sessionId: string, userId: string) => void;
  onQuestionAsked?: (question: PendingQuestion) => void;
  onQuestionResolved?: () => void;
  onPermissionRequired?: (permission: PendingPermission) => void;
  onPermissionResolved?: () => void;
  onError: (error: string) => void;
  onDone: () => void;
}

interface ChatResponse {
  sessionId: string;
  userId: string;
  status: string;
}

interface ACPEvent {
  type: string;
  properties: Record<string, unknown>;
}

/**
 * Chat with an agent using the new direct SSE approach.
 * 1. Connect to /events endpoint (SSE passthrough from OpenCode)
 * 2. POST message to /chat (returns session info)
 * 3. Parse events client-side, filter by sessionID
 */
export function chatWithAgent(
  namespace: string,
  name: string,
  message: string,
  callbacks: ChatStreamCallbacks,
  sessionId?: string,
  context?: { kubernetes?: Array<{ kind: string; name: string; namespace: string }>; github?: Array<{ owner: string; repo: string; path: string; isFile?: boolean }>; gitlab?: Array<{ project: string; path: string; isFile?: boolean }> }
): () => void {
  const controller = new AbortController();
  let unsubscribeEvents: (() => void) | null = null;
  let currentSessionId: string | null = sessionId || null;
  let isComplete = false;

  // Track seen part IDs to dedupe
  const seenParts = new Set<string>();

  // Debounce timer for session.idle — gives time for late-arriving events
  // after tool calls complete (OpenCode may fire session.idle between steps)
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const IDLE_DEBOUNCE_MS = 500;

  const clearIdleTimer = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const cleanup = () => {
    isComplete = true;
    clearIdleTimer();
    unsubscribeEvents?.();
    unsubscribeEvents = null;
    controller.abort();
  };

  // Parse an ACP event from OpenCode
  const handleACPEvent = (event: ACPEvent) => {
    const props = event.properties;

    // Check if this event is for our session
    const eventSessionId = 
      (props.sessionID as string) ||
      (props.part as Record<string, unknown>)?.sessionID as string ||
      (props.info as Record<string, unknown>)?.sessionID as string;

    if (currentSessionId && eventSessionId && eventSessionId !== currentSessionId) {
      return; // Not for our session
    }

    switch (event.type) {
      case 'message.part.delta': {
        // Incremental text delta — OpenCode sends these for streaming text tokens.
        // This is the ONLY place we call onToken for text. Do NOT also handle text
        // in message.part.updated — OpenCode fires both events for each token,
        // and handling both causes duplicate/tripled text.
        clearIdleTimer();
        const delta = props.delta as string;
        if (delta) {
          callbacks.onToken(delta);
        }
        break;
      }

      case 'message.part.updated': {
        // New content arriving — cancel any pending idle finalization
        clearIdleTimer();

        const part = props.part as Record<string, unknown>;
        const partId = part?.id as string;
        const partType = part?.type as string;

        if (!part || !partType) return;

        switch (partType) {
          case 'text':
            // Text deltas are handled exclusively by message.part.delta above.
            // message.part.updated for text carries the full accumulated text,
            // NOT an incremental delta — emitting it here would duplicate output.
            break;

          case 'tool':
            // Convert to ToolPart format
            if (callbacks.onToolPart) {
              const toolPart: ToolPart = {
                id: partId,
                sessionID: eventSessionId || currentSessionId || '',
                messageID: part.messageID as string,
                type: 'tool',
                callID: part.callID as string,
                tool: part.tool as string,
                state: part.state as ToolPart['state'],
              };

              // Dedupe: only emit if this is a new state
              const stateKey = `${partId}:${toolPart.state?.status}`;
              if (!seenParts.has(stateKey)) {
                seenParts.add(stateKey);
                callbacks.onToolPart(toolPart);
              }
            }
            break;

          case 'reasoning':
            if (callbacks.onReasoning) {
              const text = part.text as string;
              if (text) callbacks.onReasoning(text);
            }
            break;

          case 'step-start':
            if (callbacks.onStepStart) {
              callbacks.onStepStart();
            }
            break;

          case 'step-finish':
            if (callbacks.onStepFinish) {
              const cost = (part.cost as number) || 0;
              const tokens = part.tokens as { input: number; output: number; reasoning: number; cache: { read: number; write: number } } || { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
              callbacks.onStepFinish(cost, tokens);
            }
            break;

          case 'subtask':
            if (callbacks.onSubtask) {
              callbacks.onSubtask(part.description as string || '', part.agent as string || '');
            }
            break;

          case 'agent':
            if (callbacks.onAgent) {
              callbacks.onAgent(part.name as string || '');
            }
            break;

          case 'retry':
            if (callbacks.onRetry) {
              const attempt = (part.attempt as number) || 0;
              const retryError = part.error as { error?: string } | string;
              const errorMsg = typeof retryError === 'string' ? retryError : (retryError?.error || 'Unknown error');
              callbacks.onRetry(attempt, errorMsg);
            }
            break;

          case 'compaction':
            if (callbacks.onCompaction) {
              callbacks.onCompaction(!!part.auto);
            }
            break;

          case 'patch':
            if (callbacks.onPatch) {
              callbacks.onPatch((part.files as string[]) || []);
            }
            break;
        }
        break;
      }

      case 'session.idle': {
        // Agent finished a processing step. OpenCode may fire session.idle
        // between inference steps (e.g., after a tool call completes but before
        // the next text generation step). Debounce to avoid premature cleanup.
        if (!isComplete) {
          clearIdleTimer();
          idleTimer = setTimeout(() => {
            if (!isComplete) {
              callbacks.onDone();
              cleanup();
            }
          }, IDLE_DEBOUNCE_MS);
        }
        break;
      }

      case 'todo.updated': {
        if (callbacks.onTodoUpdated) {
          const todos = props.todos as Todo[];
          if (todos) callbacks.onTodoUpdated(todos);
        }
        break;
      }

      case 'question.asked': {
        // Agent is asking the user a question
        if (callbacks.onQuestionAsked) {
          const questionRequest: PendingQuestion = {
            id: props.id as string,
            sessionID: props.sessionID as string,
            questions: props.questions as PendingQuestion['questions'],
          };
          callbacks.onQuestionAsked(questionRequest);
        }
        break;
      }

      case 'question.replied':
      case 'question.rejected': {
        // Question has been answered or dismissed
        if (callbacks.onQuestionResolved) {
          callbacks.onQuestionResolved();
        }
        break;
      }

      case 'permission.asked': {
        // Agent is requesting permission for a command
        if (callbacks.onPermissionRequired) {
          const permission: PendingPermission = {
            id: props.id as string,
            sessionID: props.sessionID as string,
            permission: props.permission as string,
            patterns: (props.patterns as string[]) || [],
            metadata: (props.metadata as Record<string, unknown>) || {},
            always: props.always as string[] | undefined,
            tool: props.tool as { messageID: string; callID: string } | undefined,
          };
          callbacks.onPermissionRequired(permission);
        }
        break;
      }

      case 'permission.replied': {
        // Permission has been responded to
        if (callbacks.onPermissionResolved) {
          callbacks.onPermissionResolved();
        }
        break;
      }

      case 'session.error': {
        const error = props.error as Record<string, unknown>;
        callbacks.onError(error?.message as string || 'Unknown error');
        cleanup();
        break;
      }
    }
  };

  // Step 1: Subscribe to events via the session store's existing SSE connection
  // (through the shared event bus). This avoids creating a duplicate EventSource
  // to the same endpoint, which can hit the browser's per-origin connection limit
  // (6 for HTTP/1.1) and cause connections to be interrupted.
  if (!isEventBusConnected()) {
    // If the session store isn't connected yet, report an error
    callbacks.onError('Not connected to agent events. Please wait for the connection to establish.');
    return () => {};
  }

  unsubscribeEvents = subscribeToEventBus((event) => {
      if (isComplete) {
        return;
      }
    handleACPEvent(event as ACPEvent);
  });

  // Step 2: Send the chat message
  fetch(`${API_BASE}/api/v1/agents/${namespace}/${name}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      ...(sessionId ? { sessionId } : {}),
      ...(context ? { context } : {}),
    }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        callbacks.onError(error.error || `HTTP ${response.status}`);
        cleanup();
        return;
      }

      const data = await response.json() as ChatResponse;
      currentSessionId = data.sessionId;
      
      if (callbacks.onSessionInfo) {
        callbacks.onSessionInfo(data.sessionId, data.userId);
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError(err.message);
        cleanup();
      }
    });

  // Return cancel function
  return cleanup;
}

// ============================================================================
// WATCH - Real-time resource updates via SSE
// ============================================================================

export type ResourceKind = 'Agent' | 'Capability' | 'Workflow' | 'Channel' | 'WorkflowRun';
export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED';

export interface WatchEvent<T = unknown> {
  type: WatchEventType;
  resourceKind: ResourceKind;
  namespace: string;
  name: string;
  resource?: T;
}

export interface WatchCallbacks {
  onEvent: (event: WatchEvent) => void;
  onConnected?: () => void;
  onReconnecting?: () => void;
  onError?: (error: string) => void;
}

export interface WatchOptions {
  namespace?: string;
  kinds?: ResourceKind[];
}

/**
 * Watch for real-time resource changes via SSE
 * Returns an unsubscribe function
 */
export function watchResources(
  callbacks: WatchCallbacks,
  options: WatchOptions = {}
): () => void {
  let isActive = true;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000;

  const connect = () => {
    if (!isActive) return;

    // Build query params
    const params = new URLSearchParams();
    if (options.namespace) {
      params.set('namespace', options.namespace);
    }
    if (options.kinds && options.kinds.length > 0) {
      params.set('kinds', options.kinds.join(','));
    }

    const queryString = params.toString();
    const url = `${API_BASE}/api/v1/watch${queryString ? `?${queryString}` : ''}`;

    const eventSource = new EventSource(url);

    eventSource.addEventListener('connected', () => {
      reconnectAttempts = 0;
      callbacks.onConnected?.();
    });

    eventSource.addEventListener('resource', (e) => {
      try {
        const event = JSON.parse(e.data) as WatchEvent;
        callbacks.onEvent(event);
      } catch (err) {
        console.error('Failed to parse watch event:', err);
      }
    });

    eventSource.addEventListener('heartbeat', () => {
      // Heartbeat received, connection is alive
    });

    eventSource.onerror = () => {
      eventSource.close();

      if (!isActive) return;

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts - 1), 30000);
        callbacks.onReconnecting?.();
        setTimeout(connect, delay);
      } else {
        callbacks.onError?.('Failed to connect after multiple attempts');
      }
    };

    // Store for cleanup
    return eventSource;
  };

  const eventSource = connect();

  // Return unsubscribe function
  return () => {
    isActive = false;
    eventSource?.close();
  };
}

// ============================================================================
// KUBERNETES RESOURCES
// ============================================================================

export interface NamespaceInfo {
  name: string;
  status: string;
  created: string;
  labels?: Record<string, string>;
  deployments: number;
  statefulSets: number;
  pods: number;
  services: number;
}

export interface WorkloadInfo {
  name: string;
  namespace: string;
  kind: 'Deployment' | 'StatefulSet';
  replicas: number;
  ready: number;
  available: number;
  created: string;
  labels?: Record<string, string>;
  images?: string[];
}

export interface PodInfo {
  name: string;
  namespace: string;
  phase: string;
  ready: boolean;
  restarts: number;
  node: string;
  ip: string;
  created: string;
  labels?: Record<string, string>;
  containers?: Array<{
    name: string;
    image: string;
    ready: boolean;
    restarts: number;
    state: string;
    stateReason?: string;
    stateMessage?: string;
  }>;
}

export interface ServiceInfo {
  name: string;
  namespace: string;
  type: string;
  clusterIP: string;
  externalIP?: string;
  ports?: Array<{
    name?: string;
    port: number;
    targetPort: string;
    protocol: string;
    nodePort?: number;
  }>;
  created: string;
  labels?: Record<string, string>;
}

// List all namespaces with workload counts
export async function listNamespaces(): Promise<NamespaceInfo[]> {
  return fetchAPI<NamespaceInfo[]>('/api/v1/kubernetes/namespaces');
}

// List workloads (deployments + statefulsets) in a namespace
export async function listWorkloads(namespace: string): Promise<WorkloadInfo[]> {
  return fetchAPI<WorkloadInfo[]>(`/api/v1/kubernetes/namespaces/${namespace}/workloads`);
}

// List all pods in a namespace
export async function listPods(namespace: string): Promise<PodInfo[]> {
  return fetchAPI<PodInfo[]>(`/api/v1/kubernetes/namespaces/${namespace}/pods`);
}

// List services in a namespace
export async function listServices(namespace: string): Promise<ServiceInfo[]> {
  return fetchAPI<ServiceInfo[]>(`/api/v1/kubernetes/namespaces/${namespace}/services`);
}

// ============================================================================
// GITHUB REPOSITORY CONTENTS
// ============================================================================

export interface RepoContentEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha?: string;
  url?: string;
}

// List contents of a repository at a given path
export async function listRepoContents(owner: string, name: string, path: string = ''): Promise<RepoContentEntry[]> {
  // Clean path - remove leading slash if present
  const cleanPath = path.replace(/^\//, '');
  const endpoint = cleanPath 
    ? `/api/v1/repos/${owner}/${name}/contents/${cleanPath}`
    : `/api/v1/repos/${owner}/${name}/contents`;
  return fetchAPI<RepoContentEntry[]>(endpoint);
}

// Get full repository details including README, commits, PRs, CI/CD
export async function getRepoDetail(owner: string, name: string): Promise<{
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  defaultBranch: string;
  private: boolean;
  url: string;
  readmeContent?: string;
  branches?: BranchInfo[];
  pullRequests?: PullRequestInfo[];
  recentCommits?: Array<{
    sha: string;
    message: string;
    author: string;
    timestamp?: string;
  }>;
}> {
  return fetchAPI(`/api/v1/repos/${owner}/${name}/detail`);
}

// ============================================================================
// HELM RELEASES
// ============================================================================

export interface HelmRelease {
  name: string;
  namespace: string;
  chart: string;
  chartVersion: string;
  appVersion: string;
  revision: number;
  status: string;
  updated: string;
}

// List all Helm releases across namespaces
export async function listHelmReleases(namespace?: string): Promise<HelmRelease[]> {
  const params = namespace ? `?namespace=${namespace}` : '';
  return fetchAPI<HelmRelease[]>(`/api/v1/helm/releases${params}`);
}

// ============================================================================
// QUESTION TOOL - Agent asking user for clarification
// ============================================================================

/**
 * Reply to a pending question from the agent
 * @param namespace Agent namespace
 * @param name Agent name
 * @param requestId The question request ID (e.g., "question_xxx")
 * @param answers Array of arrays - each question gets array of selected option labels
 */
export async function replyToQuestion(
  namespace: string,
  name: string,
  requestId: string,
  answers: string[][]
): Promise<void> {
  await fetch(`${API_BASE}/api/v1/agents/${namespace}/${name}/question/${requestId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
}

/**
 * Reject/dismiss a pending question from the agent
 * @param namespace Agent namespace
 * @param name Agent name
 * @param requestId The question request ID (e.g., "question_xxx")
 */
export async function rejectQuestion(
  namespace: string,
  name: string,
  requestId: string
): Promise<void> {
  await fetch(`${API_BASE}/api/v1/agents/${namespace}/${name}/question/${requestId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Reply to a pending permission request from the agent
 * @param namespace Agent namespace
 * @param name Agent name
 * @param permissionId The permission ID
 * @param sessionId The session ID (required by OpenCode's API)
 * @param response "once" (allow this time), "always" (auto-approve matching), or "reject" (deny)
 */
export async function replyToPermission(
  namespace: string,
  name: string,
  permissionId: string,
  sessionId: string,
  response: 'once' | 'always' | 'reject'
): Promise<void> {
  await fetch(`${API_BASE}/api/v1/agents/${namespace}/${name}/permission/${permissionId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, response }),
  });
}

/**
 * Abort an active session to stop AI processing
 * @param namespace Agent namespace
 * @param name Agent name
 * @param sessionId The session ID to abort
 */
export async function abortSession(
  namespace: string,
  name: string,
  sessionId: string
): Promise<void> {
  await fetch(`${API_BASE}/api/v1/agents/${namespace}/${name}/abort`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
}

// ============================================================================
// VCS & DIFF - Git state from agents
// ============================================================================

export interface VCSInfo {
  sha: string;
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  remotes?: string[];
}

export interface SessionDiffFile {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
}

export interface GitRepoInfo {
  url: string;
  owner: string;
  name: string;
  provider: 'github' | 'gitlab' | 'git';
  domain?: string;
}

export interface GitContextResponse {
  repositories: GitRepoInfo[];
}

// Get VCS (git) status for an agent
export async function getAgentVCS(namespace: string, name: string): Promise<VCSInfo> {
  return fetchAPI<VCSInfo>(`/api/v1/agents/${namespace}/${name}/vcs`);
}

// Get session diff (changed files) for a session
export async function getSessionDiff(namespace: string, name: string, sessionId: string): Promise<SessionDiffFile[]> {
  return fetchAPI<SessionDiffFile[]>(`/api/v1/agents/${namespace}/${name}/sessions/${sessionId}/diff`);
}

// Get git context (repositories from capabilityRefs) for an agent
export async function getAgentGitContext(namespace: string, name: string): Promise<GitContextResponse> {
  return fetchAPI<GitContextResponse>(`/api/v1/agents/${namespace}/${name}/git-context`);
}

// ============================================================================
// COMMITS - Agent commit history from git provider
// ============================================================================

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  timestamp?: string;
  files?: Array<{
    path: string;
    additions: number;
    deletions: number;
    status: string; // added, modified, deleted, renamed
  }>;
}

// Get recent commits for an agent's primary repository
// Optionally filter by branch (defaults to current VCS branch)
export async function getAgentCommits(
  namespace: string,
  name: string,
  branch?: string
): Promise<CommitInfo[]> {
  const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  return fetchAPI<CommitInfo[]>(`/api/v1/agents/${namespace}/${name}/commits${params}`);
}

// ============================================================================
// PULL REQUESTS - Agent PR/MR discovery with checks and reviews
// ============================================================================

export interface CheckInfo {
  name: string;
  status: string;       // queued, in_progress, completed (GitHub) / running, pending, success, failed (GitLab)
  conclusion?: string;  // success, failure, neutral, cancelled, skipped, timed_out, action_required
  url?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ReviewInfo {
  author: string;
  state: string; // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING
  body?: string;
  submittedAt?: string;
}

export interface EnrichedPullRequest {
  number: number;
  title: string;
  state: string; // open, closed, merged
  branch: string;
  baseBranch: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: boolean;
  url?: string;
  checks?: CheckInfo[];
  reviews?: ReviewInfo[];
  mergeReady: boolean;
}

export interface AgentPRResponse {
  pullRequests: EnrichedPullRequest[];
  repository?: GitRepoInfo;
  branch?: string;
}

// Get pull requests/merge requests for an agent's primary repository
export async function getAgentPRs(namespace: string, name: string): Promise<AgentPRResponse> {
  return fetchAPI<AgentPRResponse>(`/api/v1/agents/${namespace}/${name}/pull-requests`);
}

// ============================================================================
// CI/CD PIPELINES - Agent pipeline tracking from git provider
// ============================================================================

export interface PipelineJobInfo {
  id: number;
  name: string;
  stage?: string;         // GitLab stage name
  status: string;         // queued, in_progress, completed / pending, running, success, failed
  conclusion?: string;    // success, failure, cancelled, skipped (GitHub only)
  url?: string;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
}

export interface PipelineInfo {
  id: number;
  name: string;
  status: string;          // queued, in_progress, completed (GitHub) / pending, running, success, failed, canceled (GitLab)
  conclusion?: string;     // success, failure, cancelled, skipped (GitHub only)
  branch: string;
  sha: string;
  url?: string;
  event?: string;          // push, pull_request, merge_request_event, etc.
  createdAt?: string;
  updatedAt?: string;
  durationSeconds?: number;
  jobs?: PipelineJobInfo[];
}

export interface AgentPipelineResponse {
  pipelines: PipelineInfo[];
  repository?: GitRepoInfo;
  branch?: string;
}

// Get CI/CD pipelines for an agent's primary repository
// Optionally filter by branch (defaults to current VCS branch)
export async function getAgentPipelines(
  namespace: string,
  name: string,
  branch?: string
): Promise<AgentPipelineResponse> {
  const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  return fetchAPI<AgentPipelineResponse>(`/api/v1/agents/${namespace}/${name}/pipelines${params}`);
}

// ============================================================================
// SESSIONS - Chat History
// ============================================================================

import type { Session } from '../types/acp';

// List all sessions for an agent
export async function listSessions(namespace: string, name: string): Promise<Session[]> {
  return fetchAPI<Session[]>(`/api/v1/agents/${namespace}/${name}/sessions`);
}

// Delete a session
export async function deleteSession(namespace: string, name: string, sessionId: string): Promise<void> {
  await fetchAPI<void>(`/api/v1/agents/${namespace}/${name}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

// Create a new session
export async function createSession(namespace: string, name: string, title?: string): Promise<{ id: string }> {
  return fetchAPI<{ id: string }>(`/api/v1/agents/${namespace}/${name}/sessions`, {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  });
}

// Get messages for a session (raw JSON from OpenCode)
export async function getSessionMessages(namespace: string, name: string, sessionId: string): Promise<unknown> {
  return fetchAPI<unknown>(`/api/v1/agents/${namespace}/${name}/sessions/${sessionId}/messages`);
}