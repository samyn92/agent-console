import { type Component, For, Show, createEffect, onMount, onCleanup } from "solid-js";
import { FiX, FiPlus, FiMessageSquare, FiClock } from "solid-icons/fi";
import type { SessionTab } from "../../stores/sessions";
import NeuralTrace from "../NeuralTrace";

interface ChatTabBarProps {
  tabs: SessionTab[];
  activeSessionId: string | null;
  isDraftChat?: boolean;
  busySessionIds?: string[];
  onSwitchTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onNewChat: () => void;
  onGoToRecent?: () => void;
}

const ChatTabBar: Component<ChatTabBarProps> = (props) => {
  let scrollRef!: HTMLDivElement;
  const tabRefs = new Map<string, HTMLButtonElement>();

  // Auto-scroll to active tab whenever it changes
  createEffect(() => {
    const activeId = props.activeSessionId;
    if (!activeId) return;
    requestAnimationFrame(() => {
      const el = tabRefs.get(activeId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    });
  });

  // Horizontal scroll with mouse wheel
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      scrollRef.scrollLeft += e.deltaY;
    }
  };

  onMount(() => {
    scrollRef.addEventListener("wheel", onWheel, { passive: false });
  });

  onCleanup(() => {
    scrollRef.removeEventListener("wheel", onWheel);
  });

  // Middle-click to close tab
  const onMouseDown = (e: MouseEvent, sessionId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      props.onCloseTab(sessionId);
    }
  };

  const isOnRecent = () => !props.activeSessionId && !props.isDraftChat;

  return (
    <div class="flex items-stretch bg-surface border-b border-border h-[40px] shrink-0 cursor-default">
      {/* Scrollable tab strip */}
      <div
        ref={scrollRef}
        class="flex items-stretch flex-1 min-w-0 overflow-x-auto scrollbar-none"
      >
        {/* Recent chats button — pinned left */}
        <button
          onClick={() => props.onGoToRecent?.()}
          class={`shrink-0 w-[38px] flex items-center justify-center transition-colors border-r border-border cursor-pointer ${
            isOnRecent()
              ? "text-text bg-background"
              : "text-text-muted hover:text-text-secondary hover:bg-surface-hover/50"
          }`}
          title="Recent chats"
        >
          <FiClock class="w-3.5 h-3.5" />
        </button>

        {/* Open session tabs */}
        <For each={props.tabs}>
          {(tab) => {
            const isActive = () => {
              if (tab.sessionId === "__draft__") return !!props.isDraftChat;
              return props.activeSessionId === tab.sessionId;
            };
            const isBusy = () => props.busySessionIds?.includes(tab.sessionId) ?? false;
            return (
              <button
                ref={(el) => tabRefs.set(tab.sessionId, el)}
                onClick={() => props.onSwitchTab(tab.sessionId)}
                onMouseDown={(e) => onMouseDown(e, tab.sessionId)}
                class={`tab-item group relative flex items-center gap-1.5 px-3 text-xs leading-none transition-colors select-none cursor-pointer ${
                  isActive()
                    ? "bg-background text-text"
                    : "text-text-muted hover:text-text-secondary hover:bg-surface-hover/30"
                }`}
              >
                {/* Active indicator — neural trace beam when busy, static bar otherwise */}
                <Show when={isActive()}>
                  <Show
                    when={isBusy()}
                    fallback={<div class="tab-active-indicator" />}
                  >
                    <div class="absolute bottom-0 left-1 right-1" style={{ height: "2px" }}>
                      <NeuralTrace size="sm" color="accent" inline />
                    </div>
                  </Show>
                </Show>

                {/* Non-active busy tabs also get a subtle trace */}
                <Show when={!isActive() && isBusy()}>
                  <div class="absolute bottom-0 left-2 right-2" style={{ height: "2px" }}>
                    <NeuralTrace size="sm" color="success" inline />
                  </div>
                </Show>

                <FiMessageSquare
                  class={`w-3 h-3 shrink-0 ${isActive() ? "text-text-secondary" : "opacity-40"}`}
                />
                <span class="truncate min-w-0 flex-1">{tab.title || "New chat"}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onCloseTab(tab.sessionId);
                  }}
                  class={`shrink-0 w-[16px] h-[16px] flex items-center justify-center rounded hover:bg-surface-2 transition-colors cursor-pointer ${
                    isActive()
                      ? "opacity-30 hover:opacity-100"
                      : "opacity-0 group-hover:opacity-30 hover:!opacity-100"
                  }`}
                >
                  <FiX class="w-2.5 h-2.5" />
                </span>

                {/* Right separator */}
                <div
                  class={`absolute right-0 top-[10px] bottom-[10px] w-px ${
                    isActive() ? "bg-transparent" : "bg-border"
                  }`}
                />
              </button>
            );
          }}
        </For>
      </div>

      {/* New tab button — pinned right */}
      <button
        onClick={props.onNewChat}
        class="shrink-0 px-2.5 flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-surface-hover/50 transition-colors border-l border-border cursor-pointer"
        title="New chat"
      >
        <FiPlus class="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default ChatTabBar;
