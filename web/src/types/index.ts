// Re-export context types
export * from "./context";

// Re-export ACP (Agent Communication Protocol) types
export * from "./acp";

// Chat message types

/** A message part represents a unit of content in an assistant message */
export type MessagePart = 
  | { type: "text"; content: string }
  | { type: "tool"; toolPart: import("./acp").ToolPart }
  | { type: "reasoning"; content: string }
  | { type: "step-start" }
  | { type: "step-finish"; cost: number; tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } } }
  | { type: "subtask"; description: string; agent: string }
  | { type: "agent"; name: string }
  | { type: "retry"; attempt: number; error: string }
  | { type: "compaction"; auto: boolean }
  | { type: "patch"; files: string[] };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** New ACP ToolPart format */
  toolParts?: import("./acp").ToolPart[];
  /** Ordered sequence of text and tool parts for interleaved rendering */
  parts?: MessagePart[];
}
