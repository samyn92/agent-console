/**
 * OpenCode Agent Communication Protocol (ACP) Types
 * 
 * These types are derived from the OpenCode SDK and define the structure
 * of events and messages exchanged with OpenCode agents.
 */

// ============================================================================
// FILE DIFFS
// ============================================================================

export interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
}

// ============================================================================
// MESSAGES
// ============================================================================

export interface UserMessage {
  id: string;
  sessionID: string;
  role: "user";
  time: {
    created: number;
  };
  summary?: {
    title?: string;
    body?: string;
    diffs: FileDiff[];
  };
  agent: string;
  model: {
    providerID: string;
    modelID: string;
  };
  system?: string;
  tools?: Record<string, boolean>;
}

export interface ProviderAuthError {
  name: "ProviderAuthError";
  data: {
    providerID: string;
    message: string;
  };
}

export interface UnknownError {
  name: "UnknownError";
  data: {
    message: string;
  };
}

export interface MessageOutputLengthError {
  name: "MessageOutputLengthError";
  data: Record<string, unknown>;
}

export interface MessageAbortedError {
  name: "MessageAbortedError";
  data: {
    message: string;
  };
}

export interface ApiError {
  name: "APIError";
  data: {
    message: string;
    statusCode?: number;
    isRetryable: boolean;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
  };
}

export type MessageError = 
  | ProviderAuthError 
  | UnknownError 
  | MessageOutputLengthError 
  | MessageAbortedError 
  | ApiError;

export interface AssistantMessage {
  id: string;
  sessionID: string;
  role: "assistant";
  time: {
    created: number;
    completed?: number;
  };
  error?: MessageError;
  parentID: string;
  modelID: string;
  providerID: string;
  mode: string;
  path: {
    cwd: string;
    root: string;
  };
  summary?: boolean;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  finish?: string;
}

export type Message = UserMessage | AssistantMessage;

// ============================================================================
// MESSAGE PARTS
// ============================================================================

export interface TextPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: {
    start: number;
    end?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface ReasoningPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "reasoning";
  text: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
    end?: number;
  };
}

export interface FilePartSourceText {
  value: string;
  start: number;
  end: number;
}

export interface FileSource {
  text: FilePartSourceText;
  type: "file";
  path: string;
}

export interface Range {
  start: {
    line: number;
    character: number;
  };
  end: {
    line: number;
    character: number;
  };
}

export interface SymbolSource {
  text: FilePartSourceText;
  type: "symbol";
  path: string;
  range: Range;
  name: string;
  kind: number;
}

export type FilePartSource = FileSource | SymbolSource;

export interface FilePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "file";
  mime: string;
  filename?: string;
  url: string;
  source?: FilePartSource;
}

// ============================================================================
// TOOL STATE
// ============================================================================

export interface ToolStatePending {
  status: "pending";
  input: Record<string, unknown>;
  raw: string;
}

export interface ToolStateRunning {
  status: "running";
  input: Record<string, unknown>;
  title?: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
  };
}

export interface ToolStateCompleted {
  status: "completed";
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: {
    start: number;
    end: number;
    compacted?: number;
  };
  attachments?: FilePart[];
}

export interface ToolStateError {
  status: "error";
  input: Record<string, unknown>;
  error: string;
  metadata?: Record<string, unknown>;
  time: {
    start: number;
    end: number;
  };
}

export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

export interface ToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  callID: string;
  tool: string;
  state: ToolState;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// OTHER PARTS
// ============================================================================

export interface StepStartPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-start";
  snapshot?: string;
}

export interface StepFinishPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-finish";
  reason: string;
  snapshot?: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
}

export interface SnapshotPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "snapshot";
  snapshot: string;
}

export interface PatchPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "patch";
  hash: string;
  files: string[];
}

export interface AgentPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "agent";
  name: string;
  source?: {
    value: string;
    start: number;
    end: number;
  };
}

export interface RetryPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "retry";
  attempt: number;
  error: ApiError;
  time: {
    created: number;
  };
}

export interface CompactionPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "compaction";
  auto: boolean;
}

export interface SubtaskPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "subtask";
  prompt: string;
  description: string;
  agent: string;
}

export type Part =
  | TextPart
  | ReasoningPart
  | FilePart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | AgentPart
  | RetryPart
  | CompactionPart
  | SubtaskPart;

// ============================================================================
// TODO
// ============================================================================

export interface Todo {
  /** Brief description of the task */
  content: string;
  /** Current status of the task: pending, in_progress, completed, cancelled */
  status: "pending" | "in_progress" | "completed" | "cancelled";
  /** Priority level of the task: high, medium, low */
  priority: "high" | "medium" | "low";
  /** Unique identifier for the todo item */
  id: string;
}

// ============================================================================
// PERMISSION
// ============================================================================

export interface Permission {
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

// ============================================================================
// SESSION
// ============================================================================

export interface SessionStatus {
  type: "idle" | "busy" | "retry";
  attempt?: number;
  message?: string;
  next?: number;
}

export interface Session {
  id: string;
  projectID: string;
  directory: string;
  parentID?: string;
  summary?: {
    additions: number;
    deletions: number;
    files: number;
    diffs?: FileDiff[];
  };
  share?: {
    url: string;
  };
  title: string;
  version: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
  };
  revert?: {
    messageID: string;
    partID?: string;
    snapshot?: string;
    diff?: string;
  };
}

// ============================================================================
// EVENTS
// ============================================================================

export interface EventMessageUpdated {
  type: "message.updated";
  properties: {
    info: Message;
  };
}

export interface EventMessageRemoved {
  type: "message.removed";
  properties: {
    sessionID: string;
    messageID: string;
  };
}

export interface EventMessagePartUpdated {
  type: "message.part.updated";
  properties: {
    part: Part;
    delta?: string;
  };
}

export interface EventMessagePartRemoved {
  type: "message.part.removed";
  properties: {
    sessionID: string;
    messageID: string;
    partID: string;
  };
}

export interface EventPermissionAsked {
  type: "permission.asked";
  properties: Permission;
}

export interface EventPermissionReplied {
  type: "permission.replied";
  properties: {
    sessionID: string;
    requestID: string;
    reply: string;
  };
}

export interface EventSessionStatus {
  type: "session.status";
  properties: {
    sessionID: string;
    status: SessionStatus;
  };
}

export interface EventSessionIdle {
  type: "session.idle";
  properties: {
    sessionID: string;
  };
}

export interface EventSessionCompacted {
  type: "session.compacted";
  properties: {
    sessionID: string;
  };
}

export interface EventFileEdited {
  type: "file.edited";
  properties: {
    file: string;
  };
}

export interface EventTodoUpdated {
  type: "todo.updated";
  properties: {
    sessionID: string;
    todos: Todo[];
  };
}

export interface EventCommandExecuted {
  type: "command.executed";
  properties: {
    name: string;
    sessionID: string;
    arguments: string;
    messageID: string;
  };
}

export interface EventSessionCreated {
  type: "session.created";
  properties: {
    info: Session;
  };
}

export interface EventSessionUpdated {
  type: "session.updated";
  properties: {
    info: Session;
  };
}

export interface EventSessionDeleted {
  type: "session.deleted";
  properties: {
    info: Session;
  };
}

export interface EventSessionDiff {
  type: "session.diff";
  properties: {
    sessionID: string;
    diff: FileDiff[];
  };
}

export interface EventSessionError {
  type: "session.error";
  properties: {
    sessionID?: string;
    error?: MessageError;
  };
}

export interface EventServerConnected {
  type: "server.connected";
  properties: Record<string, unknown>;
}

// ============================================================================
// QUESTION EVENTS
// ============================================================================

export interface EventQuestionAsked {
  type: "question.asked";
  properties: {
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
  };
}

export interface EventQuestionReplied {
  type: "question.replied";
  properties: {
    id: string;
    sessionID: string;
    answers: string[][];
  };
}

export interface EventQuestionRejected {
  type: "question.rejected";
  properties: {
    id: string;
    sessionID: string;
  };
}

export type ACPEvent =
  | EventMessageUpdated
  | EventMessageRemoved
  | EventMessagePartUpdated
  | EventMessagePartRemoved
  | EventPermissionAsked
  | EventPermissionReplied
  | EventSessionStatus
  | EventSessionIdle
  | EventSessionCompacted
  | EventFileEdited
  | EventTodoUpdated
  | EventCommandExecuted
  | EventSessionCreated
  | EventSessionUpdated
  | EventSessionDeleted
  | EventSessionDiff
  | EventSessionError
  | EventServerConnected
  | EventQuestionAsked
  | EventQuestionReplied
  | EventQuestionRejected;

// ============================================================================
// TOOL-SPECIFIC INPUT/OUTPUT TYPES
// ============================================================================

/** Input for bash tool */
export interface BashInput {
  command: string;
  description?: string;
  timeout?: number;
  workdir?: string;
}

/** Input for edit tool */
export interface EditInput {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

/** Input for write tool */
export interface WriteInput {
  filePath: string;
  content: string;
}

/** Input for read tool */
export interface ReadInput {
  filePath: string;
  offset?: number;
  limit?: number;
}

/** Input for glob tool */
export interface GlobInput {
  pattern: string;
  path?: string;
}

/** Input for grep tool */
export interface GrepInput {
  pattern: string;
  path?: string;
  include?: string;
}

/** Input for question tool */
export interface QuestionInput {
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Parse todowrite output to get todos */
export function parseTodoOutput(output: string): Todo[] {
  try {
    return JSON.parse(output) as Todo[];
  } catch {
    return [];
  }
}

/** Get a human-readable tool name */
export function getToolDisplayName(toolName: string): string {
  const names: Record<string, string> = {
    bash: "Terminal",
    read: "Read File",
    write: "Write File",
    edit: "Edit File",
    glob: "Find Files",
    grep: "Search",
    webfetch: "Web Fetch",
    task: "Subtask",
    todowrite: "Todo List",
    todoread: "Read Todos",
    question: "Question",
    skill: "Load Skill",
  };
  return names[toolName] || toolName;
}
