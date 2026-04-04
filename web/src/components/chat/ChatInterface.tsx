import type { Component } from "solid-js";
import { createSignal, createMemo, For, Show, onCleanup, createEffect, Switch, Match, batch } from "solid-js";
import { Dynamic } from "solid-js/web";
import { FiSend, FiAlertCircle, FiSquare, FiCornerDownLeft, FiRefreshCw, FiCpu, FiGitBranch, FiZap, FiPackage, FiFileText, FiBookOpen, FiTool, FiEye, FiTerminal, FiEdit3, FiSearch, FiCheckSquare, FiHelpCircle, FiCode } from "solid-icons/fi";
import ToolCallCard from "./ToolCallCard";
import QuestionPanel from "./QuestionPanel";
import PermissionPanel from "./PermissionPanel";
import type { PendingQuestion } from "./QuestionPanel";
import ContextPill from "./ContextPill";
import { parseContextFromMessage } from "./ContextBar";
import type { ChatMessage, MessagePart } from "../../types";
import type { ToolPart } from "../../types/acp";
import type { SelectedContext } from "../../types/context";
import { chatWithAgent, replyToQuestion, rejectQuestion, replyToPermission, abortSession, getSessionMessages, ApiError } from "../../lib/api";
import type { AgentResponse, CapabilityResponse, PendingPermission } from "../../lib/api";
import { sessionStore } from "../../stores/sessions";
import { mobileStore } from "../../stores/mobileStore";
import Markdown, { StreamingMarkdown } from "./Markdown";

import { detectToolCategory, toolThemes, getCategoryIcon, getCategoryLabel } from "../../lib/capability-themes";

// ============================================================================
// TOOL ACTIVITY HELPERS
// ============================================================================

/** Returns a human-readable activity label and detail for a tool in pending/running state.
 *  Mirrors the transient status lines shown in OpenCode's terminal UI. */
function getToolActivity(toolName: string, input: Record<string, unknown>): { label: string; detail?: string; icon: Component<{ class?: string }> } {
  switch (toolName) {
    case "bash": {
      const cmd = typeof input.command === "string" ? input.command : undefined;
      const truncated = cmd && cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
      return { label: "Executing command", detail: truncated, icon: FiTerminal };
    }
    case "read": {
      const fp = typeof input.filePath === "string" ? input.filePath : undefined;
      const short = fp ? fp.split("/").slice(-2).join("/") : undefined;
      return { label: "Reading file", detail: short, icon: FiEye };
    }
    case "edit": {
      const fp = typeof input.filePath === "string" ? input.filePath : undefined;
      const short = fp ? fp.split("/").slice(-2).join("/") : undefined;
      return { label: "Editing file", detail: short, icon: FiEdit3 };
    }
    case "write": {
      const fp = typeof input.filePath === "string" ? input.filePath : undefined;
      const short = fp ? fp.split("/").slice(-2).join("/") : undefined;
      return { label: "Writing file", detail: short, icon: FiEdit3 };
    }
    case "glob": {
      const pattern = typeof input.pattern === "string" ? input.pattern : undefined;
      return { label: "Finding files", detail: pattern, icon: FiSearch };
    }
    case "grep": {
      const pattern = typeof input.pattern === "string" ? input.pattern : undefined;
      return { label: "Searching", detail: pattern, icon: FiSearch };
    }
    case "task": {
      const desc = typeof input.description === "string" ? input.description : undefined;
      return { label: "Delegating", detail: desc, icon: FiGitBranch };
    }
    case "todowrite":
      return { label: "Updating plan", icon: FiCheckSquare };
    case "question":
      return { label: "Asking question", icon: FiHelpCircle };
    case "webfetch": {
      const url = typeof input.url === "string" ? input.url : undefined;
      const short = url && url.length > 50 ? url.slice(0, 50) + "..." : url;
      return { label: "Fetching", detail: short, icon: FiCode };
    }
    case "skill":
      return { label: "Loading skill", icon: FiBookOpen };
    default: {
      // For capability-provided tools, use the tool name as-is
      const name = toolName.replace(/[_-]/g, " ");
      return { label: `Running ${name}`, icon: FiTool };
    }
  }
}

/** Transient activity indicator shown while a tool is pending or running */
const ToolActivityLine: Component<{ toolPart: ToolPart }> = (props) => {
  const activity = () => getToolActivity(props.toolPart.tool, props.toolPart.state.input);

  return (
    <div class="flex items-center gap-2.5 py-1.5 px-2 fade-in">
      <div class="relative flex items-center justify-center w-5 h-5">
        <div class="absolute inset-0 border-[1.5px] border-accent/20 border-t-accent/70 rounded-full animate-spin" />
        <Dynamic component={activity().icon} class="w-3 h-3 text-accent/70" />
      </div>
      <span class="text-xs text-text-muted">
        {activity().label}
        <Show when={activity().detail}>
          <span class="text-text-muted/60 ml-1 font-mono">{activity().detail}</span>
        </Show>
      </span>
    </div>
  );
};

interface ChatInterfaceProps {
  namespace: string;
  name: string;
  displayName: string;
  sessionId?: string;
  isDraft?: boolean;
  onToolPartsUpdate?: (toolParts: ToolPart[]) => void;
  selectedContexts?: SelectedContext[];
  onRemoveContext?: (ctx: SelectedContext) => void;
  agent?: AgentResponse;
  capabilities?: CapabilityResponse[];
}

/** Renders a single MessagePart inline in the chat.
 *  latestTodoCallId — if set, todowrite tool parts with a different callID are hidden. */
const PartContent: Component<{ part: MessagePart; latestTodoCallId?: string }> = (props) => {
  return (
    <Switch>
      {/* Text bubble */}
      <Match when={props.part.type === "text" && (props.part as { type: "text"; content: string }).content.trim()}>
        <div class="flex justify-start">
          <div class="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-surface-2 text-text">
            <Markdown content={(props.part as { type: "text"; content: string }).content} class="text-sm leading-relaxed" />
          </div>
        </div>
      </Match>

      {/* Tool call — transient activity line while running, full card when done.
           For todowrite tools, only the latest instance is shown (older ones are hidden). */}
      <Match when={props.part.type === "tool"}>
        {(() => {
          const toolPart = () => (props.part as { type: "tool"; toolPart: ToolPart }).toolPart;
          const isActive = () => {
            const s = toolPart().state?.status;
            return s === "pending" || s === "running";
          };
          // Hide stale todowrite parts — only the latest one matters
          const isHiddenTodo = () => {
            const tp = toolPart();
            if (tp.tool !== "todowrite") return false;
            return props.latestTodoCallId != null && tp.callID !== props.latestTodoCallId;
          };
          return (
            <Show when={!isHiddenTodo()}>
              <Show when={isActive()} fallback={
                <div class="flex justify-start">
                  <div class="max-w-[85%] max-md:max-w-full">
                    <ToolCallCard toolPart={toolPart()} />
                  </div>
                </div>
              }>
                <ToolActivityLine toolPart={toolPart()} />
              </Show>
            </Show>
          );
        })()}
      </Match>

      {/* Reasoning (extended thinking) */}
      <Match when={props.part.type === "reasoning" && (props.part as { type: "reasoning"; content: string }).content.trim()}>
        <div class="flex justify-start">
          <div class="max-w-[85%]">
            <details class="group">
              <summary class="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer hover:text-text-secondary py-1">
                <FiCpu class="w-3.5 h-3.5" />
                <span>Reasoning</span>
              </summary>
              <div class="mt-1 rounded-lg border border-border/50 bg-surface-2/30 px-3 py-2">
                <div class="text-xs text-text-muted leading-relaxed whitespace-pre-wrap italic">
                  {(props.part as { type: "reasoning"; content: string }).content}
                </div>
              </div>
            </details>
          </div>
        </div>
      </Match>

      {/* Step start/finish — structural metadata, not rendered inline.
         Cost/token data is available but too noisy per-step. */}
      <Match when={props.part.type === "step-start" || props.part.type === "step-finish"}>
        {null}
      </Match>

      {/* Subtask — delegated work to sub-agent */}
      <Match when={props.part.type === "subtask"}>
        {(() => {
          const p = props.part as { type: "subtask"; description: string; agent: string };
          return (
            <div class="flex justify-start">
              <div class="flex items-start gap-2 text-xs text-text-muted py-1 px-1">
                <FiGitBranch class="w-3.5 h-3.5 mt-0.5 text-info shrink-0" />
                <div>
                  <span class="font-medium text-text-secondary">{p.agent}</span>
                  <Show when={p.description}>
                    <span class="text-text-muted"> — {p.description}</span>
                  </Show>
                </div>
              </div>
            </div>
          );
        })()}
      </Match>

      {/* Agent — sub-agent indicator */}
      <Match when={props.part.type === "agent"}>
        {(() => {
          const p = props.part as { type: "agent"; name: string };
          return (
            <div class="flex items-center gap-1.5 text-xs text-text-muted py-1 px-1">
              <FiCpu class="w-3 h-3 text-info" />
              <span class="font-medium text-text-secondary">{p.name}</span>
            </div>
          );
        })()}
      </Match>

      {/* Retry — error with attempt count */}
      <Match when={props.part.type === "retry"}>
        {(() => {
          const p = props.part as { type: "retry"; attempt: number; error: string };
          return (
            <div class="flex justify-start">
              <div class="max-w-[85%] flex items-start gap-2 text-xs rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                <FiRefreshCw class="w-3.5 h-3.5 mt-0.5 text-warning shrink-0" />
                <div>
                  <span class="font-medium text-warning">Retry #{p.attempt}</span>
                  <Show when={p.error}>
                    <span class="text-text-muted"> — {p.error}</span>
                  </Show>
                </div>
              </div>
            </div>
          );
        })()}
      </Match>

      {/* Compaction — context was compacted */}
      <Match when={props.part.type === "compaction"}>
        {(() => {
          const p = props.part as { type: "compaction"; auto: boolean };
          return (
            <div class="flex items-center gap-2 py-1 px-1">
              <div class="h-px flex-1 bg-info/20" />
              <div class="flex items-center gap-1.5 text-[10px] text-info/70">
                <FiZap class="w-3 h-3" />
                <span>{p.auto ? "Auto-compacted" : "Compacted"}</span>
              </div>
              <div class="h-px flex-1 bg-info/20" />
            </div>
          );
        })()}
      </Match>

      {/* Patch — files changed summary */}
      <Match when={props.part.type === "patch"}>
        {(() => {
          const p = props.part as { type: "patch"; files: string[] };
          return (
            <div class="flex justify-start">
              <div class="max-w-[85%]">
                <details class="group">
                  <summary class="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer hover:text-text-secondary py-1">
                    <FiPackage class="w-3.5 h-3.5" />
                    <span>{p.files.length} file{p.files.length !== 1 ? "s" : ""} changed</span>
                  </summary>
                  <div class="mt-1 text-xs font-mono space-y-0.5 pl-5">
                    <For each={p.files.slice(0, 20)}>
                      {(file) => (
                        <div class="text-text-secondary truncate flex items-center gap-1.5">
                          <FiFileText class="w-3 h-3 text-text-muted shrink-0" />
                          {file}
                        </div>
                      )}
                    </For>
                    <Show when={p.files.length > 20}>
                      <div class="text-text-muted">... and {p.files.length - 20} more</div>
                    </Show>
                  </div>
                </details>
              </div>
            </div>
          );
        })()}
      </Match>
    </Switch>
  );
};

interface MessageProps {
  message: ChatMessage;
  latestTodoCallId?: string;
}

const Message: Component<MessageProps> = (props) => {
  const message = () => props.message;
  const isUser = () => message().role === "user";
  const hasParts = () => message().parts && message().parts!.length > 0;
  const hasContent = () => message().content.trim().length > 0;
  const hasToolParts = () => message().toolParts && message().toolParts!.length > 0;

  // Don't render empty assistant messages
  if (!isUser() && !hasContent() && !hasToolParts() && !hasParts()) {
    return null;
  }

  // User messages
  if (isUser()) {
    return (
      <div class="flex justify-end">
        <div class="max-w-[80%] rounded-lg rounded-br px-4 py-2.5 bg-primary text-primary-foreground">
          {/* Context pills attached to this message */}
          <Show when={message().contexts && message().contexts!.length > 0}>
            <div class="flex items-center gap-1 mb-1.5 flex-wrap">
              <For each={message().contexts}>
                {(ctx) => (
                  <ContextPill ctx={ctx} compact onPrimary />
                )}
              </For>
            </div>
          </Show>
          <div class="text-sm leading-relaxed whitespace-pre-wrap">
            {message().content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant messages with ordered parts (new format)
  if (hasParts()) {
    return (
      <>
        <For each={message().parts}>
          {(part) => <PartContent part={part} latestTodoCallId={props.latestTodoCallId} />}
        </For>
      </>
    );
  }

  // Fallback: Legacy format
  return (
    <>
      <Show when={hasToolParts()}>
        <div class="flex justify-start">
          <div class="max-w-[85%] max-md:max-w-full space-y-2">
            <For each={message().toolParts}>
              {(toolPart) => (
                <ToolCallCard toolPart={toolPart} />
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={hasContent()}>
        <div class="flex justify-start">
          <div class="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-surface-2 text-text">
            <Markdown content={message().content} class="text-sm leading-relaxed" />
          </div>
        </div>
      </Show>
    </>
  );
};

const ChatInterface: Component<ChatInterfaceProps> = (props) => {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [inputValue, setInputValue] = createSignal("");
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(null);
  const [streamingParts, setStreamingParts] = createSignal<MessagePart[]>([]);
  const [currentTextBuffer, setCurrentTextBuffer] = createSignal("");
  // Hide the message container until we've scrolled to the bottom after loading
  // history, so the user never sees the scroll-from-top animation.
  const [isLoadingHistory, setIsLoadingHistory] = createSignal(!!props.sessionId && !props.isDraft);
  const [error, setError] = createSignal<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = createSignal<PendingQuestion | null>(null);
  const [pendingPermission, setPendingPermission] = createSignal<PendingPermission | null>(null);
  const [isFocused, setIsFocused] = createSignal(false);

  // Compute the callID of the last todowrite tool part across all messages
  // and streaming parts. Older todowrite cards are hidden so only the latest
  // plan is visible (matching OpenCode's terminal UI behaviour).
  const latestTodoCallId = createMemo((): string | undefined => {
    let lastId: string | undefined;
    // Scan historical messages (newest last)
    for (const msg of messages()) {
      if (msg.parts) {
        for (const p of msg.parts) {
          if (p.type === "tool" && (p as { type: "tool"; toolPart: ToolPart }).toolPart.tool === "todowrite") {
            lastId = (p as { type: "tool"; toolPart: ToolPart }).toolPart.callID;
          }
        }
      }
    }
    // Scan streaming parts (appended after messages)
    for (const p of streamingParts()) {
      if (p.type === "tool" && (p as { type: "tool"; toolPart: ToolPart }).toolPart.tool === "todowrite") {
        lastId = (p as { type: "tool"; toolPart: ToolPart }).toolPart.callID;
      }
    }
    return lastId;
  });

  let messagesEndRef: HTMLDivElement | undefined;
  let messagesContainerRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  let cancelStream: (() => void) | null = null;
  // Whether the current streaming session started as a draft (needs finalization)
  let pendingDraftFinalization: string | null = null;

  // Auto-resize textarea
  const autoResize = () => {
    if (!textareaRef) return;
    textareaRef.style.height = "auto";
    textareaRef.style.height = Math.min(textareaRef.scrollHeight, 160) + "px";
  };

  // --- Natural-flow typewriter ---
  // Tokens from the LLM arrive in irregular bursts. Instead of dumping them
  // straight into the DOM (choppy) or dripping chars at a fixed rate (robotic),
  // we advance **word-by-word** with subtle tempo variation that mimics natural
  // reading rhythm:
  //   - Words flow out one per frame (~60 words/sec, faster than reading speed
  //     so it never feels like it's holding you back)
  //   - Tiny pause after commas/colons (1 extra frame)
  //   - Slightly longer pause after sentence enders like . ! ? (2 extra frames)
  //   - Newlines get a breath (1 extra frame)
  //   - Inside code fences (```), text flushes fast (8 chars/frame) since nobody
  //     wants to watch code type out slowly
  //
  // The result feels like the AI is *speaking* the text rather than printing it.

  let rawTextBuffer = "";
  let displayedLength = 0;
  let typewriterRAF: number | null = null;
  let pauseFrames = 0;           // frames to skip before next advance
  let inCodeFence = false;       // inside ``` block — fast-forward mode

  const startTypewriter = () => {
    if (typewriterRAF !== null) return;
    const tick = () => {
      if (displayedLength >= rawTextBuffer.length) {
        // Caught up — pause until more tokens arrive
        typewriterRAF = null;
        return;
      }

      // Honor micro-pauses (skip this frame, decrement counter)
      if (pauseFrames > 0) {
        pauseFrames--;
        typewriterRAF = requestAnimationFrame(tick);
        return;
      }

      // Detect code fence toggles
      if (rawTextBuffer.startsWith("```", displayedLength)) {
        inCodeFence = !inCodeFence;
      }

      // Inside code blocks: flush fast (8 chars/frame)
      if (inCodeFence) {
        displayedLength = Math.min(displayedLength + 8, rawTextBuffer.length);
      } else {
        // Advance to the end of the next word (or whitespace run)
        let next = displayedLength + 1;
        // Skip through the current word to the next boundary
        while (next < rawTextBuffer.length && rawTextBuffer[next] !== ' ' && rawTextBuffer[next] !== '\n') {
          next++;
        }
        // Also consume trailing spaces so the next tick starts at a word
        while (next < rawTextBuffer.length && rawTextBuffer[next] === ' ') {
          next++;
        }
        displayedLength = Math.min(next, rawTextBuffer.length);

        // Look at the character just before the new cursor for punctuation pauses
        const lastChar = rawTextBuffer[displayedLength - 1];
        if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
          pauseFrames = 2;   // sentence-end breath
        } else if (lastChar === ',' || lastChar === ':' || lastChar === ';') {
          pauseFrames = 1;   // clause pause
        } else if (lastChar === '\n') {
          pauseFrames = 1;   // line break breath
        }
      }

      setCurrentTextBuffer(rawTextBuffer.slice(0, displayedLength));
      scrollToBottom("instant");
      typewriterRAF = requestAnimationFrame(tick);
    };
    typewriterRAF = requestAnimationFrame(tick);
  };

  const flushTypewriter = () => {
    if (typewriterRAF !== null) {
      cancelAnimationFrame(typewriterRAF);
      typewriterRAF = null;
    }
    pauseFrames = 0;
    inCodeFence = false;
    displayedLength = rawTextBuffer.length;
    if (displayedLength > 0) {
      setCurrentTextBuffer(rawTextBuffer);
    }
  };

  const resetTypewriter = () => {
    if (typewriterRAF !== null) {
      cancelAnimationFrame(typewriterRAF);
      typewriterRAF = null;
    }
    rawTextBuffer = "";
    displayedLength = 0;
    pauseFrames = 0;
    inCodeFence = false;
    setCurrentTextBuffer("");
  };

  // --- Scroll management: rAF-debounced, user-scroll-aware ---
  const [userScrolledAway, setUserScrolledAway] = createSignal(false);
  let scrollRAF: number | null = null;
  let isProgrammaticScroll = false;

  const isNearBottom = () => {
    if (!messagesContainerRef) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef;
    return scrollHeight - scrollTop - clientHeight < 80;
  };

  const handleScroll = () => {
    // Ignore scroll events triggered by our own programmatic scrolls
    if (isProgrammaticScroll) return;
    setUserScrolledAway(!isNearBottom());
  };

  const scrollToBottom = (behavior: ScrollBehavior = "instant") => {
    if (userScrolledAway()) return;
    if (scrollRAF !== null) return; // already scheduled
    scrollRAF = requestAnimationFrame(() => {
      scrollRAF = null;
      if (messagesEndRef && !userScrolledAway()) {
        isProgrammaticScroll = true;
        messagesEndRef.scrollIntoView({ behavior });
        // Release the flag after a tick so the scroll events from this
        // scrollIntoView call are suppressed
        requestAnimationFrame(() => {
          isProgrammaticScroll = false;
        });
      }
    });
  };

  /** Force-scroll to bottom, ignoring userScrolledAway. Used after initial load. */
  const forceScrollToBottom = () => {
    if (!messagesContainerRef) return;
    // Synchronously snap to bottom before the browser paints.
    // This avoids the visible "scroll down" animation entirely.
    messagesContainerRef.scrollTop = messagesContainerRef.scrollHeight;
    // After layout settles, do one more snap to catch any late content,
    // then reveal the container.
    requestAnimationFrame(() => {
      if (messagesContainerRef) {
        isProgrammaticScroll = true;
        messagesContainerRef.scrollTop = messagesContainerRef.scrollHeight;
        isProgrammaticScroll = false;
      }
      setIsLoadingHistory(false);
    });
  };

  onCleanup(() => {
    if (scrollRAF !== null) cancelAnimationFrame(scrollRAF);
    if (typewriterRAF !== null) cancelAnimationFrame(typewriterRAF);
  });

  // Auto-scroll on new messages (finalized) — smooth scroll
  createEffect(() => {
    messages();
    scrollToBottom("smooth");
  });

  // Auto-scroll during streaming — instant (no animation stacking)
  createEffect(() => {
    streamingParts();
    // Don't track currentTextBuffer() here — too noisy (fires per character)
    if (isStreaming()) scrollToBottom("instant");
  });

  // Mobile: scroll to bottom when virtual keyboard opens so composer stays visible
  createEffect(() => {
    if (mobileStore.state.keyboardVisible) {
      // Small delay to let the viewport resize settle
      setTimeout(() => {
        if (messagesEndRef) {
          isProgrammaticScroll = true;
          messagesEndRef.scrollIntoView({ behavior: "instant" });
          requestAnimationFrame(() => {
            isProgrammaticScroll = false;
          });
        }
      }, 100);
    }
  });

  // Notify parent of tool parts for the inspector
  createEffect(() => {
    if (props.onToolPartsUpdate) {
      const allToolParts: ToolPart[] = [];
      for (const msg of messages()) {
        if (msg.parts) {
          for (const part of msg.parts) {
            if (part.type === "tool") allToolParts.push(part.toolPart);
          }
        }
        if (msg.toolParts) {
          allToolParts.push(...msg.toolParts);
        }
      }
      for (const part of streamingParts()) {
        if (part.type === "tool") allToolParts.push(part.toolPart);
      }
      props.onToolPartsUpdate(allToolParts);
    }
  });

  onCleanup(() => {
    if (cancelStream) cancelStream();
  });

  // Load existing messages on mount when sessionId is provided.
  // Skip if we already have messages in state (e.g. draft just materialized
  // and we already have the streamed messages — no need to re-fetch).
  createEffect(() => {
    const sid = props.sessionId;
    if (!sid) return;

    setCurrentSessionId(sid);

    // If we already have messages (draft→real transition), don't re-fetch
    if (messages().length > 0) return;

    getSessionMessages(props.namespace, props.name, sid)
      .then((data) => {
        if (!data) { setIsLoadingHistory(false); return; }

        const entries = data as Array<{
          info: { id: string; role: string; time?: { created: number } };
          parts: Array<Record<string, unknown>>;
        }>;

        if (!Array.isArray(entries) || entries.length === 0) { setIsLoadingHistory(false); return; }

        const msgs: ChatMessage[] = [];

        for (const entry of entries) {
          const msg = entry.info;
          if (!msg?.role || !msg?.id) continue;

          const rawParts = entry.parts || [];
          const orderedParts: MessagePart[] = [];
          const toolParts: ToolPart[] = [];
          let allText = "";

          for (const p of rawParts) {
            if (p.type === "text" && typeof p.text === "string" && (p.text as string).trim()) {
              orderedParts.push({ type: "text", content: p.text as string });
              allText += (allText ? "\n\n" : "") + (p.text as string);
            } else if (p.type === "tool" && p.callID) {
              const toolPart = p as unknown as ToolPart;
              orderedParts.push({ type: "tool", toolPart });
              toolParts.push(toolPart);
            } else if (p.type === "reasoning" && typeof p.text === "string" && (p.text as string).trim()) {
              orderedParts.push({ type: "reasoning", content: p.text as string });
            } else if (p.type === "step-start") {
              orderedParts.push({ type: "step-start" });
            } else if (p.type === "step-finish") {
              orderedParts.push({
                type: "step-finish",
                cost: (p.cost as number) || 0,
                tokens: (p.tokens as { input: number; output: number; reasoning: number; cache: { read: number; write: number } }) || { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              });
            } else if (p.type === "subtask") {
              orderedParts.push({ type: "subtask", description: (p.description as string) || "", agent: (p.agent as string) || "" });
            } else if (p.type === "agent") {
              orderedParts.push({ type: "agent", name: (p.name as string) || "" });
            } else if (p.type === "retry") {
              const retryError = p.error as { error?: string } | string | undefined;
              const errorMsg = typeof retryError === "string" ? retryError : (retryError?.error || "Unknown error");
              orderedParts.push({ type: "retry", attempt: (p.attempt as number) || 0, error: errorMsg });
            } else if (p.type === "compaction") {
              orderedParts.push({ type: "compaction", auto: !!p.auto });
            } else if (p.type === "patch") {
              orderedParts.push({ type: "patch", files: (p.files as string[]) || [] });
            }
          }

          if (msg.role !== "user" && !allText && toolParts.length === 0 && orderedParts.length === 0) continue;

          const created = msg.time?.created || 0;
          const tsMs = created > 4_000_000_000 ? created : created * 1000;

          // For user messages, parse context tags from the stored text and strip
          // the context markdown so it's not shown raw in the message bubble.
          let displayContent = allText;
          let parsedContexts: SelectedContext[] | undefined;
          if (msg.role === "user" && allText) {
            const parsed = parseContextFromMessage(allText);
            displayContent = parsed.cleanContent;
            if (parsed.contexts.length > 0) {
              parsedContexts = parsed.contexts;
            }
          }

          msgs.push({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            content: displayContent,
            timestamp: new Date(tsMs),
            contexts: parsedContexts,
            parts: orderedParts.length > 0 ? orderedParts : undefined,
            toolParts: toolParts.length > 0 ? toolParts : undefined,
          });
        }

        if (msgs.length > 0) {
          setMessages(msgs);
          // After loading a full conversation, force-scroll to the bottom
          // regardless of userScrolledAway state
          setUserScrolledAway(false);
          forceScrollToBottom();
        } else {
          setIsLoadingHistory(false);
        }
      })
      .catch((err) => {
        console.warn("Failed to load session messages:", sid, err);
        setIsLoadingHistory(false);
        // If the session no longer exists on the backend, clean up and redirect
        if (err instanceof ApiError && err.status === 404) {
          sessionStore.handleSessionNotFound(sid);
        } else {
          setError("Failed to load chat history. The session may no longer exist.");
        }
      });
  });

  // Handle answering a question from the agent
  const handleQuestionAnswer = async (requestId: string, answers: string[][]) => {
    try {
      await replyToQuestion(props.namespace, props.name, requestId, answers);
      setPendingQuestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    }
  };

  const handleQuestionDismiss = async (requestId: string) => {
    try {
      await rejectQuestion(props.namespace, props.name, requestId);
      setPendingQuestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss question");
    }
  };

  const handlePermissionAllow = async (permissionId: string) => {
    const sessionId = currentSessionId();
    const perm = pendingPermission();
    if (!sessionId || !perm) return;
    try {
      await replyToPermission(props.namespace, props.name, permissionId, sessionId, "once");
      setPendingPermission(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to allow permission");
    }
  };

  const handlePermissionAlwaysAllow = async (permissionId: string) => {
    const sessionId = currentSessionId();
    const perm = pendingPermission();
    if (!sessionId || !perm) return;
    try {
      await replyToPermission(props.namespace, props.name, permissionId, sessionId, "always");
      setPendingPermission(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to always-allow permission");
    }
  };

  const handlePermissionDeny = async (permissionId: string) => {
    const sessionId = currentSessionId();
    const perm = pendingPermission();
    if (!sessionId || !perm) return;
    try {
      await replyToPermission(props.namespace, props.name, permissionId, sessionId, "reject");
      setPendingPermission(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deny permission");
    }
  };

  const sendMessage = async () => {
    const content = inputValue().trim();
    if (!content || isStreaming()) return;

    setError(null);

    const isFirstMessage = messages().length === 0;

    // If in draft mode (no backend session yet), materialize it now
    let effectiveSessionId = props.sessionId || currentSessionId() || undefined;
    let wasDraft = false;
    if (props.isDraft && !effectiveSessionId) {
      const newId = await sessionStore.materializeDraftSession();
      if (!newId) {
        setError("Failed to create session. Please try again.");
        return;
      }
      effectiveSessionId = newId;
      setCurrentSessionId(newId);
      wasDraft = true;
      pendingDraftFinalization = newId;
    }

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
      contexts: (props.selectedContexts || []).length > 0
        ? [...props.selectedContexts!]
        : undefined,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsStreaming(true);
    setUserScrolledAway(false);

    // Reset textarea height
    if (textareaRef) {
      textareaRef.style.height = "auto";
    }

    if (isFirstMessage) {
      if (effectiveSessionId) {
        const truncated = content.length > 50 ? content.slice(0, 50) + "..." : content;
        // If this was a draft, update the draft tab title (tab still has __draft__ ID)
        sessionStore.updateTabTitle(wasDraft ? "__draft__" : effectiveSessionId, truncated);
        sessionStore.markSessionUsed(effectiveSessionId);
      }
    }
    setStreamingParts([]);
    resetTypewriter();

    // Don't prepend context text to message - the backend resolves structured context
    // into a rich "## Resource Context" block, so frontend prefix would be redundant.
    const messageToAgent = content;

    // Build structured context for the backend to resolve and inject
    const contexts = props.selectedContexts || [];
    const structuredContext = contexts.length > 0 ? {
      kubernetes: contexts
        .filter((c): c is import("../../types/context").K8sResourceContext => c.type === "k8s-resource")
        .map((c) => ({ kind: c.kind, name: c.name, namespace: c.namespace })),
      github: contexts
        .filter((c): c is import("../../types/context").GitHubPathContext => c.type === "github-path")
        .map((c) => ({ owner: c.owner, repo: c.repo, path: c.path, isFile: c.isFile })),
      gitlab: contexts
        .filter((c): c is import("../../types/context").GitLabPathContext => c.type === "gitlab-path")
        .map((c) => ({ project: c.project, path: c.path, isFile: c.isFile })),
    } : undefined;

    cancelStream = chatWithAgent(
      props.namespace,
      props.name,
      messageToAgent,
      {
        onToken: (token) => {
          rawTextBuffer += token;
          startTypewriter();
        },
        onToolPart: (toolPart) => {
          batch(() => {
            setStreamingParts((prev) => {
              const existingToolIndex = prev.findIndex(
                (p) => p.type === "tool" && p.toolPart.callID === toolPart.callID
              );
              
              if (existingToolIndex >= 0) {
                const updated = [...prev];
                updated[existingToolIndex] = { type: "tool", toolPart };
                return updated;
              }
              
              // Flush all buffered text before the tool call
              flushTypewriter();
              const textContent = rawTextBuffer.trim();
              resetTypewriter();
              
              if (textContent) {
                return [...prev, { type: "text", content: textContent }, { type: "tool", toolPart }];
              }
              return [...prev, { type: "tool", toolPart }];
            });
          });
        },
        onQuestionAsked: (question) => {
          setPendingQuestion(question);
        },
        onQuestionResolved: () => {
          setPendingQuestion(null);
        },
        onPermissionRequired: (permission) => {
          setPendingPermission(permission);
        },
        onPermissionResolved: () => {
          setPendingPermission(null);
        },
        onReasoning: (content) => {
          // Flush any pending text buffer, then add reasoning part
          setStreamingParts((prev) => {
            const existing = prev.findIndex((p) => p.type === "reasoning");
            if (existing >= 0) {
              const updated = [...prev];
              const existingPart = updated[existing] as { type: "reasoning"; content: string };
              updated[existing] = { type: "reasoning", content: existingPart.content + content };
              return updated;
            }
            return [...prev, { type: "reasoning", content }];
          });
        },
        onStepStart: () => {
          setStreamingParts((prev) => [...prev, { type: "step-start" }]);
        },
        onStepFinish: (cost, tokens) => {
          setStreamingParts((prev) => [...prev, { type: "step-finish", cost, tokens }]);
        },
        onSubtask: (description, agent) => {
          setStreamingParts((prev) => [...prev, { type: "subtask", description, agent }]);
        },
        onAgent: (name) => {
          setStreamingParts((prev) => [...prev, { type: "agent", name }]);
        },
        onRetry: (attempt, error) => {
          setStreamingParts((prev) => [...prev, { type: "retry", attempt, error }]);
        },
        onCompaction: (auto) => {
          setStreamingParts((prev) => [...prev, { type: "compaction", auto }]);
        },
        onPatch: (files) => {
          setStreamingParts((prev) => [...prev, { type: "patch", files }]);
        },
        onSessionInfo: (sessionId) => {
          setCurrentSessionId(sessionId);
        },
        onError: (errorMsg) => {
          flushTypewriter();

          // Preserve any partial content that was already streamed
          const finalTextBuffer = rawTextBuffer.trim();
          const parts = streamingParts();
          const finalParts: MessagePart[] = [...parts];
          if (finalTextBuffer) {
            finalParts.push({ type: "text", content: finalTextBuffer });
          }
          if (finalParts.length > 0) {
            const toolParts = finalParts
              .filter((p): p is MessagePart & { type: "tool" } => p.type === "tool")
              .map((p) => p.toolPart);
            const allText = finalParts
              .filter((p): p is MessagePart & { type: "text" } => p.type === "text")
              .map((p) => p.content)
              .join("\n\n");
            const assistantMessage: ChatMessage = {
              id: `msg_error_${Date.now()}`,
              role: "assistant",
              content: allText,
              timestamp: new Date(),
              toolParts,
              parts: finalParts,
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }

          setStreamingParts([]);
          resetTypewriter();
          setError(errorMsg);
          setIsStreaming(false);
          cancelStream = null;
          // If this was a draft chat, finalize even on error so the user can retry
          if (wasDraft && effectiveSessionId) {
            pendingDraftFinalization = null;
            sessionStore.finalizeDraftSession(effectiveSessionId);
          }
        },
        onDone: () => {
          flushTypewriter();
          const finalTextBuffer = rawTextBuffer.trim();
          const parts = streamingParts();
          
          const finalParts: MessagePart[] = [...parts];
          if (finalTextBuffer) {
            finalParts.push({ type: "text", content: finalTextBuffer });
          }
          
          if (finalParts.length > 0) {
            const toolParts = finalParts
              .filter((p): p is MessagePart & { type: "tool" } => p.type === "tool")
              .map((p) => p.toolPart);
            
            const allText = finalParts
              .filter((p): p is MessagePart & { type: "text" } => p.type === "text")
              .map((p) => p.content)
              .join("\n\n");
            
            const assistantMessage: ChatMessage = {
              id: `msg_${Date.now()}`,
              role: "assistant",
              content: allText,
              timestamp: new Date(),
              toolParts,
              parts: finalParts,
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
          setStreamingParts([]);
          resetTypewriter();
          setIsStreaming(false);
          setPendingQuestion(null);
          setPendingPermission(null);
          cancelStream = null;
          // If this was a draft chat, finalize the transition now that streaming is done
          if (wasDraft && effectiveSessionId) {
            pendingDraftFinalization = null;
            sessionStore.finalizeDraftSession(effectiveSessionId);
          } else {
            sessionStore.refreshAfterChat();
          }
        },
      },
      props.sessionId || currentSessionId() || effectiveSessionId || undefined,
      structuredContext
    );
  };

  const stopStreaming = () => {
    const sessionId = currentSessionId();
    if (sessionId && isStreaming()) {
      // Cancel the stream FIRST to unsubscribe from the SSE event bus.
      // This prevents onDone/onError callbacks from firing (due to server-sent
      // session.idle/session.error events) while we finalize the UI state.
      if (cancelStream) {
        cancelStream();
        cancelStream = null;
      }
      flushTypewriter();

      // Finalize any accumulated streaming parts into a persistent message
      // so tool calls and partial text are not lost when the streaming UI unmounts.
      const finalTextBuffer = rawTextBuffer.trim();
      const parts = streamingParts();
      const finalParts: MessagePart[] = [...parts];
      if (finalTextBuffer) {
        finalParts.push({ type: "text", content: finalTextBuffer });
      }

      if (finalParts.length > 0) {
        const toolParts = finalParts
          .filter((p): p is MessagePart & { type: "tool" } => p.type === "tool")
          .map((p) => p.toolPart);

        const allText = finalParts
          .filter((p): p is MessagePart & { type: "text" } => p.type === "text")
          .map((p) => p.content)
          .join("\n\n");

        const assistantMessage: ChatMessage = {
          id: `msg_aborted_${Date.now()}`,
          role: "assistant",
          content: allText,
          timestamp: new Date(),
          toolParts,
          parts: finalParts,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }

      setStreamingParts([]);
      resetTypewriter();
      setIsStreaming(false);

      // Tell the backend to stop processing (fire-and-forget — the stream
      // is already unsubscribed so we won't receive any further events).
      abortSession(props.namespace, props.name, sessionId).catch((err) => {
        console.error("Failed to abort session:", err);
      });

      // If the user aborted a draft chat mid-stream, finalize it so they
      // can continue chatting with the now-real session
      if (pendingDraftFinalization) {
        const realId = pendingDraftFinalization;
        pendingDraftFinalization = null;
        sessionStore.finalizeDraftSession(realId);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "Escape" && isStreaming()) {
      e.preventDefault();
      stopStreaming();
    }
  };

  return (
    <div class="flex flex-col flex-1 min-h-0 bg-background">
      {/* Error Banner */}
      <Show when={error()}>
        <div class="mx-4 mt-3 px-3 py-2.5 bg-error/5 border border-error/15 rounded-lg flex items-center gap-2">
          <FiAlertCircle class="w-4 h-4 text-error flex-shrink-0" />
          <p class="text-sm text-error flex-1">{error()}</p>
          <button
            onClick={() => setError(null)}
            class="text-error/60 hover:text-error text-xs font-normal transition-colors"
          >
            Dismiss
          </button>
        </div>
      </Show>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleScroll} class={`flex-1 overflow-y-auto px-4 py-4 space-y-3 flex flex-col ${isLoadingHistory() ? "opacity-0" : "opacity-100"} ${mobileStore.state.isMobile ? "overscroll-contain" : ""}`}>
        <Show
          when={messages().length > 0 || isStreaming()}
          fallback={
            <div class="flex flex-col items-center justify-center flex-1 text-center px-4 overflow-y-auto">
              <div class="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center mb-4">
                <FiCpu class="w-4 h-4 text-text-muted" />
              </div>
              <h2 class="text-base font-semibold text-text mb-1.5">
                Chat with {props.displayName}
              </h2>
              <Show when={props.agent}>
                <p class="text-xs text-text-muted mb-1">
                  {props.agent!.spec.model.replace(/-\d{8}$/, "")}
                  <Show when={props.agent!.metadata.namespace}>
                    <span class="text-border-hover"> · </span>{props.agent!.metadata.namespace}
                  </Show>
                </p>
              </Show>
              <p class="text-sm text-text-muted max-w-sm leading-relaxed">
                Ask questions, request actions, or get help with your operations.
              </p>

              {/* Capabilities display */}
              <Show when={(() => {
                const agent = props.agent;
                const caps = props.capabilities;
                if (!agent || !caps) return [];
                const refs = agent.spec.capabilityRefs || [];
                return refs.map(ref => {
                  const cap = caps.find(c => c.metadata.name === ref.name);
                  return cap ? { ref, capability: cap } : null;
                }).filter(Boolean) as { ref: { name: string; alias?: string }; capability: CapabilityResponse }[];
              })().length > 0}>
                <div class="mt-5 w-full max-w-md">
                  <div class="flex items-center justify-center gap-1.5 mb-2">
                    <FiBookOpen class="w-3 h-3 text-text-muted" />
                    <span class="text-[11px] font-medium text-text-secondary">Capabilities</span>
                  </div>
                  <div class="space-y-1.5 text-left">
                    <For each={(() => {
                      const agent = props.agent;
                      const caps = props.capabilities;
                      if (!agent || !caps) return [];
                      const refs = agent.spec.capabilityRefs || [];
                      return refs.map(ref => {
                        const cap = caps.find(c => c.metadata.name === ref.name);
                        return cap ? { ref, capability: cap } : null;
                      }).filter(Boolean) as { ref: { name: string; alias?: string }; capability: CapabilityResponse }[];
                    })()}>
                      {({ ref, capability }) => {
                        const cat = detectToolCategory(ref.alias || ref.name);
                        const theme = toolThemes[cat];
                        const Icon = getCategoryIcon(cat);
                        const label = getCategoryLabel(cat);
                        const imageName = () => {
                          if (!capability.spec.image) return null;
                          const img = capability.spec.image;
                          const name = img.split("/").pop()?.split(":")[0] || img;
                          const tag = img.includes(":") ? img.split(":").pop() : null;
                          return { name, tag };
                        };
                        return (
                          <div class={`rounded-lg border ${theme.border || "border-border"} ${theme.bg || "bg-surface-2"}`}>
                            <div class={`flex items-center gap-2 px-2.5 py-1.5 rounded-t-lg ${theme.headerBg || ""}`}>
                              <Icon class={`w-3.5 h-3.5 ${theme.iconColor} shrink-0`} />
                              <span class="text-xs font-medium text-text truncate flex-1">{ref.alias || ref.name}</span>
                            </div>
                            <div class="px-2.5 pb-2 pt-1 flex items-center gap-1.5 flex-wrap">
                              <Show when={label}>
                                <span class={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${theme.badge}`}>
                                  <Icon class="w-2.5 h-2.5" />
                                  {label}
                                </span>
                              </Show>
                              <Show when={capability.spec.type}>
                                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-surface-2 border border-border/60 text-text-secondary">
                                  {capability.spec.type}
                                </span>
                              </Show>
                              <Show when={capability.spec.audit}>
                                <span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                  <FiEye class="w-2.5 h-2.5" />
                                  Audit
                                </span>
                              </Show>
                              <Show when={capability.spec.permissions?.approve?.length}>
                                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                                  {capability.spec.permissions!.approve!.length} approval
                                </span>
                              </Show>
                              <Show when={capability.spec.permissions?.deny?.length}>
                                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-500/10 border border-red-500/20 text-red-400">
                                  {capability.spec.permissions!.deny!.length} denied
                                </span>
                              </Show>
                              <Show when={capability.spec.permissions?.allow?.length}>
                                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                  {capability.spec.permissions!.allow!.length} allowed
                                </span>
                              </Show>
                              <Show when={imageName()}>
                                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-surface border border-border/40 text-text-muted truncate max-w-[140px]" title={capability.spec.image}>
                                  {imageName()!.name}<Show when={imageName()!.tag}><span class="text-text-muted/60">:{imageName()!.tag}</span></Show>
                                </span>
                              </Show>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Tools display */}
              <Show when={(() => {
                const agent = props.agent;
                if (!agent?.spec.tools) return [];
                return Object.entries(agent.spec.tools).filter(([, enabled]) => enabled).map(([name]) => name);
              })().length > 0}>
                <div class="mt-3 w-full max-w-md">
                  <div class="flex items-center justify-center gap-1.5 mb-1.5">
                    <FiTool class="w-3 h-3 text-text-muted" />
                    <span class="text-[11px] font-medium text-text-secondary">Tools</span>
                  </div>
                  <div class="flex flex-wrap justify-center gap-1">
                    <For each={(() => {
                      const agent = props.agent;
                      if (!agent?.spec.tools) return [];
                      return Object.entries(agent.spec.tools).filter(([, enabled]) => enabled).map(([name]) => name);
                    })()}>
                      {(tool) => (
                        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-surface-2/60 border border-border/60 rounded text-text-muted font-mono">
                          {tool}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Quick prompts */}
              <div class="mt-5 flex flex-wrap justify-center gap-2">
                <button 
                  onClick={() => { setInputValue("What can you help me with?"); textareaRef?.focus(); }}
                  class="px-3 py-1.5 text-xs bg-surface-2 hover:bg-surface-hover border border-border rounded-full text-text-secondary transition-colors cursor-pointer"
                >
                  What can you help me with?
                </button>
                <button 
                  onClick={() => { setInputValue("Show me the cluster status"); textareaRef?.focus(); }}
                  class="px-3 py-1.5 text-xs bg-surface-2 hover:bg-surface-hover border border-border rounded-full text-text-secondary transition-colors cursor-pointer"
                >
                  Show me the cluster status
                </button>
              </div>
            </div>
          }
        >
          <For each={messages()}>
            {(message) => <Message message={message} latestTodoCallId={latestTodoCallId()} />}
          </For>

          {/* Streaming message */}
          <Show when={isStreaming()}>
            <For each={streamingParts()}>
              {(part) => <PartContent part={part} latestTodoCallId={latestTodoCallId()} />}
            </For>

            {/* Current text being streamed — throttled markdown rendering */}
            <Show when={currentTextBuffer()}>
              <div class="flex justify-start">
                <div class="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-surface-2 text-text">
                  <StreamingMarkdown content={currentTextBuffer()} class="text-sm leading-relaxed" />
                </div>
              </div>
            </Show>

            {/* Initial typing indicator — shown before any text or tool parts arrive */}
            <Show when={!currentTextBuffer() && streamingParts().length === 0}>
              <div class="flex items-center gap-1.5 py-2 px-1">
                <span class="w-1.5 h-1.5 bg-accent/60 rounded-full typing-dot" style={{ "animation-delay": "0ms" }} />
                <span class="w-1.5 h-1.5 bg-accent/60 rounded-full typing-dot" style={{ "animation-delay": "200ms" }} />
                <span class="w-1.5 h-1.5 bg-accent/60 rounded-full typing-dot" style={{ "animation-delay": "400ms" }} />
              </div>
            </Show>
          </Show>
        </Show>
        <div ref={messagesEndRef} />
      </div>

      {/* Question Panel */}
      <Show when={pendingQuestion()}>
        <div class="shrink-0 px-4 py-3 border-t border-border">
          <QuestionPanel
            question={pendingQuestion()!}
            onAnswer={handleQuestionAnswer}
            onDismiss={handleQuestionDismiss}
          />
        </div>
      </Show>

      {/* Permission Panel */}
      <Show when={pendingPermission()}>
        <div class="shrink-0 px-4 py-3">
          <PermissionPanel
            permission={pendingPermission()!}
            onAllow={handlePermissionAllow}
            onAlwaysAllow={handlePermissionAlwaysAllow}
            onDeny={handlePermissionDeny}
          />
        </div>
      </Show>

      {/* ===== Composer ===== */}
      <div class="shrink-0 px-4 pb-4 pt-2">
        <div class="relative">
          <div
            class={`composer-input rounded-xl border bg-surface ${
              isStreaming()
                ? "composer-processing"
                : isFocused() ? "border-accent" : "border-border"
            }`}
          >
          {/* Selected context pills */}
          <Show when={(props.selectedContexts || []).length > 0}>
            <div class="flex items-center gap-1.5 px-3 pt-2.5 pb-1 flex-wrap">
              <For each={props.selectedContexts || []}>
                {(ctx) => (
                  <ContextPill
                    ctx={ctx}
                    onRemove={props.onRemoveContext ? (c) => props.onRemoveContext!(c) : undefined}
                  />
                )}
              </For>
            </div>
          </Show>
          <textarea
            ref={textareaRef}
            value={inputValue()}
            onInput={(e) => {
              setInputValue(e.currentTarget.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Message..."
            rows={1}
            enterkeyhint={mobileStore.state.isMobile ? "send" : undefined}
            class="w-full px-3.5 pt-3 pb-1.5 text-sm leading-5 bg-transparent text-text placeholder-text-muted resize-none focus:outline-none min-h-[36px] max-h-[160px]"
          />
          <div class={`flex items-center justify-between px-3 pb-2.5 ${mobileStore.state.isMobile ? "pb-[max(0.625rem,env(safe-area-inset-bottom))]" : ""}`}>
            <div class="flex items-center gap-1">
              <Show when={!isStreaming() && !mobileStore.state.isMobile}>
                <span class="text-xs text-text-muted/50 flex items-center gap-1">
                  <FiCornerDownLeft class="w-2.5 h-2.5" />
                  to send
                </span>
              </Show>
            </div>
            <Show
              when={isStreaming()}
              fallback={
                <button
                  onClick={sendMessage}
                  disabled={!inputValue().trim()}
                  class="h-7 w-7 flex items-center justify-center bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground rounded-lg transition-all"
                >
                  <FiSend class="w-3.5 h-3.5" />
                </button>
              }
            >
              <button
                onClick={stopStreaming}
                class="h-7 px-2.5 flex items-center justify-center gap-1.5 bg-error/10 hover:bg-error/15 text-error rounded-lg transition-all text-xs font-normal"
                title="Stop generation (Esc)"
              >
                <FiSquare class="w-3 h-3" />
                <span>Stop</span>
              </button>
            </Show>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
