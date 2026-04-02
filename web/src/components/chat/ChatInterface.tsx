import type { Component } from "solid-js";
import { createSignal, For, Show, onCleanup, createEffect, Switch, Match, batch } from "solid-js";
import { FiSend, FiAlertCircle, FiSquare, FiCornerDownLeft, FiRefreshCw, FiCpu, FiGitBranch, FiZap, FiPackage, FiFileText } from "solid-icons/fi";
import ToolCallCard from "./ToolCallCard";
import QuestionPanel from "./QuestionPanel";
import PermissionPanel from "./PermissionPanel";
import type { PendingQuestion } from "./QuestionPanel";
import { formatContextForAgent } from "./ContextBar";
import type { ChatMessage, MessagePart } from "../../types";
import type { ToolPart } from "../../types/acp";
import type { SelectedContext } from "../../types/context";
import { chatWithAgent, replyToQuestion, rejectQuestion, replyToPermission, abortSession, getSessionMessages } from "../../lib/api";
import type { PendingPermission } from "../../lib/api";
import { sessionStore } from "../../stores/sessions";
import Markdown, { StreamingMarkdown } from "./Markdown";

interface ChatInterfaceProps {
  namespace: string;
  name: string;
  displayName: string;
  sessionId?: string;
  onToolPartsUpdate?: (toolParts: ToolPart[]) => void;
  selectedContexts?: SelectedContext[];
}

/** Renders a single MessagePart inline in the chat */
const PartContent: Component<{ part: MessagePart }> = (props) => {
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

      {/* Tool call card */}
      <Match when={props.part.type === "tool"}>
        <div class="flex justify-start">
          <div class="max-w-[85%]">
            <ToolCallCard toolPart={(props.part as { type: "tool"; toolPart: ToolPart }).toolPart} />
          </div>
        </div>
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
          {(part) => <PartContent part={part} />}
        </For>
      </>
    );
  }

  // Fallback: Legacy format
  return (
    <>
      <Show when={hasToolParts()}>
        <div class="flex justify-start">
          <div class="max-w-[85%] space-y-2">
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
  const [error, setError] = createSignal<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = createSignal<PendingQuestion | null>(null);
  const [pendingPermission, setPendingPermission] = createSignal<PendingPermission | null>(null);
  const [isFocused, setIsFocused] = createSignal(false);

  let messagesEndRef: HTMLDivElement | undefined;
  let messagesContainerRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  let cancelStream: (() => void) | null = null;

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

  const isNearBottom = () => {
    if (!messagesContainerRef) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef;
    return scrollHeight - scrollTop - clientHeight < 80;
  };

  const handleScroll = () => {
    // If user scrolled away from bottom, stop auto-scrolling
    setUserScrolledAway(!isNearBottom());
  };

  const scrollToBottom = (behavior: ScrollBehavior = "instant") => {
    if (userScrolledAway()) return;
    if (scrollRAF !== null) return; // already scheduled
    scrollRAF = requestAnimationFrame(() => {
      scrollRAF = null;
      if (messagesEndRef && !userScrolledAway()) {
        messagesEndRef.scrollIntoView({ behavior });
      }
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

  // Load existing messages on mount when sessionId is provided
  createEffect(() => {
    const sid = props.sessionId;
    if (!sid) return;

    setCurrentSessionId(sid);

    getSessionMessages(props.namespace, props.name, sid)
      .then((data) => {
        if (!data) return;

        const entries = data as Array<{
          info: { id: string; role: string; time?: { created: number } };
          parts: Array<Record<string, unknown>>;
        }>;

        if (!Array.isArray(entries) || entries.length === 0) return;

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

          msgs.push({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            content: allText,
            timestamp: new Date(tsMs),
            parts: orderedParts.length > 0 ? orderedParts : undefined,
            toolParts: toolParts.length > 0 ? toolParts : undefined,
          });
        }

        if (msgs.length > 0) {
          setMessages(msgs);
        }
      })
      .catch((err) => {
        console.warn("Failed to load session messages:", sid, err);
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

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
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
      const sessionId = props.sessionId || currentSessionId();
      if (sessionId) {
        const truncated = content.length > 50 ? content.slice(0, 50) + "..." : content;
        sessionStore.updateTabTitle(sessionId, truncated);
        sessionStore.markSessionUsed(sessionId);
      }
    }
    setStreamingParts([]);
    resetTypewriter();

    const contextPrefix = formatContextForAgent(props.selectedContexts || []);
    const messageToAgent = contextPrefix ? `${contextPrefix}\n${content}` : content;

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
          resetTypewriter();
          setError(errorMsg);
          setIsStreaming(false);
          cancelStream = null;
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
          sessionStore.refreshAfterChat();
        },
      },
      props.sessionId || currentSessionId() || undefined
    );
  };

  const stopStreaming = async () => {
    const sessionId = currentSessionId();
    if (sessionId && isStreaming()) {
      try {
        await abortSession(props.namespace, props.name, sessionId);
      } catch (err) {
        console.error("Failed to abort session:", err);
      }
      if (cancelStream) {
        cancelStream();
        cancelStream = null;
      }
      flushTypewriter();
      setIsStreaming(false);
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
      <div ref={messagesContainerRef} onScroll={handleScroll} class="flex-1 overflow-y-auto px-4 py-4 space-y-3 flex flex-col">
        <Show
          when={messages().length > 0 || isStreaming()}
          fallback={
            <div class="flex flex-col items-center justify-center flex-1 text-center px-4">
              <div class="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center mb-4">
                <FiSend class="w-4 h-4 text-text-muted" />
              </div>
              <h2 class="text-base font-semibold text-text mb-1.5">
                Chat with {props.displayName}
              </h2>
              <p class="text-sm text-text-muted max-w-sm leading-relaxed">
                Ask questions, request actions, or get help with your operations.
              </p>
              <div class="mt-5 flex flex-wrap justify-center gap-2">
                <button 
                  onClick={() => { setInputValue("What can you help me with?"); textareaRef?.focus(); }}
                  class="px-3 py-1.5 text-xs bg-surface-2 hover:bg-surface-hover border border-border rounded-full text-text-secondary transition-colors"
                >
                  What can you help me with?
                </button>
                <button 
                  onClick={() => { setInputValue("Show me the cluster status"); textareaRef?.focus(); }}
                  class="px-3 py-1.5 text-xs bg-surface-2 hover:bg-surface-hover border border-border rounded-full text-text-secondary transition-colors"
                >
                  Show me the cluster status
                </button>
              </div>
            </div>
          }
        >
          <For each={messages()}>
            {(message) => <Message message={message} />}
          </For>

          {/* Streaming message */}
          <Show when={isStreaming()}>
            <For each={streamingParts()}>
              {(part) => <PartContent part={part} />}
            </For>

            {/* Current text being streamed — throttled markdown rendering */}
            <Show when={currentTextBuffer()}>
              <div class="flex justify-start">
                <div class="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-surface-2 text-text">
                  <StreamingMarkdown content={currentTextBuffer()} class="text-sm leading-relaxed" />
                </div>
              </div>
            </Show>

            {/* Thinking indicator */}
            <Show when={streamingParts().some(p => p.type === "tool" && p.toolPart.state.status === "running") && !currentTextBuffer()}>
              <div class="flex justify-start">
                <div class="flex items-center gap-2 text-sm text-text-muted py-1 px-1">
                  <div class="w-3.5 h-3.5 border-[1.5px] border-text-muted/40 border-t-text-muted rounded-full animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            </Show>

            {/* Initial typing indicator */}
            <Show when={!currentTextBuffer() && streamingParts().length === 0}>
              <div class="flex justify-start">
                <div class="flex items-center gap-1 py-2 px-1">
                  <span class="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ "animation-delay": "0ms" }} />
                  <span class="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ "animation-delay": "150ms" }} />
                  <span class="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ "animation-delay": "300ms" }} />
                </div>
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
        <div
          class={`composer-input rounded-xl border bg-surface transition-all ${
            isFocused() ? "border-text/50 ring-1 ring-text/30" : "border-border"
          }`}
        >
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
            class="w-full px-3.5 pt-3 pb-1.5 text-sm leading-5 bg-transparent text-text placeholder-text-muted resize-none focus:outline-none min-h-[36px] max-h-[160px]"
          />
          <div class="flex items-center justify-between px-3 pb-2.5">
            <div class="flex items-center gap-1">
              <Show when={!isStreaming()}>
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
  );
};

export default ChatInterface;
