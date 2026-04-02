import { createSignal, createResource, createEffect, Show, For, createMemo, onMount, onCleanup } from "solid-js";
import { A } from "@solidjs/router";
import { FiSettings, FiRefreshCw, FiMessageSquare, FiPlus, FiMoreVertical, FiCpu, FiSidebar, FiZap, FiGitCommit } from "solid-icons/fi";
import { listAgents, listCapabilities, type AgentResponse } from "../lib/api";
import type { Session } from "../types/acp";
import ChatInterface from "../components/chat/ChatInterface";
import AgentDetailPanel from "../components/agent/AgentDetailPanel";
import ChatContextMenu from "../components/chat/ChatContextMenu";
import WorkflowPanel from "../components/workflow/WorkflowPanel";
import NeuralTrace from "../components/NeuralTrace";
import ThreePanelLayout from "../components/layout/ThreePanelLayout";
import { sessionStore } from "../stores/sessions";
import { panelStore } from "../stores/panelStore";
import { globalEventsStore } from "../stores/globalEvents";

// =============================================================================
// SIDEBAR TAB TYPE
// =============================================================================

type SidebarTab = "chats" | "workflows";

// =============================================================================
// MAIN APP COMPONENT
// =============================================================================

const MainApp = () => {
  // State
  const [activeAgent, setActiveAgent] = createSignal<AgentResponse | null>(null);
  const [sidebarTab, setSidebarTab] = createSignal<SidebarTab>("chats");

  // Context menu state
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; sessionId: string } | null>(null);

  // Start global SSE connection on mount, disconnect on cleanup
  onMount(() => {
    globalEventsStore.connect();
  });
  onCleanup(() => {
    globalEventsStore.disconnect();
  });

  // Data fetching
  const [agents, { refetch: refetchAgents }] = createResource(() => listAgents());
  const [capabilities] = createResource(
    () => activeAgent()?.metadata.namespace,
    (ns) => listCapabilities(ns)
  );

  // Auto-select first agent when agents list loads
  createEffect(() => {
    const agentList = agents();
    if (agentList && agentList.length > 0 && !activeAgent()) {
      setActiveAgent(agentList[0]);
    }
  });

  // Initialize/switch session store whenever the active agent changes
  createEffect(() => {
    const agent = activeAgent();
    if (agent) {
      sessionStore.setAgent(agent.metadata.namespace, agent.metadata.name);
    }
  });

  // Select an agent from the sidebar list
  const selectAgent = (agent: AgentResponse) => {
    setActiveAgent(agent);
    // Session store will be updated by the createEffect above
  };

  // Format relative time
  const formatRelativeTime = (unixTimestamp: number) => {
    const now = Date.now();
    const diff = now - unixTimestamp * 1000;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    return `${days}d ago`;
  };

  const formatSessionTitle = (title: string | undefined) => {
    if (!title) return "Untitled conversation";
    if (title.startsWith("console-user_") || title.startsWith("console-")) return "Untitled conversation";
    if (title === "New conversation") return "New conversation";
    return title;
  };

  // Time-based grouping for chat list
  type TimeGroup = { label: string; sessions: Session[] };
  const groupedSessions = createMemo((): TimeGroup[] => {
    const sessions = sessionStore.visibleSessions().slice(0, 30);
    if (sessions.length === 0) return [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const yesterdayStart = todayStart - 86400;
    const weekStart = todayStart - 6 * 86400;

    const groups: Record<string, Session[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      Older: [],
    };

    for (const s of sessions) {
      const t = s.time?.updated || s.time?.created || 0;
      if (t >= todayStart) groups["Today"].push(s);
      else if (t >= yesterdayStart) groups["Yesterday"].push(s);
      else if (t >= weekStart) groups["This Week"].push(s);
      else groups["Older"].push(s);
    }

    return (["Today", "Yesterday", "This Week", "Older"] as const)
      .filter((label) => groups[label].length > 0)
      .map((label) => ({ label, sessions: groups[label] }));
  });

  // Same grouping but for center panel (no limit)
  const groupedAllSessions = createMemo((): TimeGroup[] => {
    const sessions = sessionStore.visibleSessions();
    if (sessions.length === 0) return [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const yesterdayStart = todayStart - 86400;
    const weekStart = todayStart - 6 * 86400;

    const groups: Record<string, Session[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      Older: [],
    };

    for (const s of sessions) {
      const t = s.time?.updated || s.time?.created || 0;
      if (t >= todayStart) groups["Today"].push(s);
      else if (t >= yesterdayStart) groups["Yesterday"].push(s);
      else if (t >= weekStart) groups["This Week"].push(s);
      else groups["Older"].push(s);
    }

    return (["Today", "Yesterday", "This Week", "Older"] as const)
      .filter((label) => groups[label].length > 0)
      .map((label) => ({ label, sessions: groups[label] }));
  });

  const startNewChat = async () => {
    await sessionStore.startNewChat();
  };

  const openChat = (sessionId: string) => {
    sessionStore.openSession(sessionId);
  };

  const handleContextMenu = (e: MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
  };

  const handleRefresh = () => {
    refetchAgents();
    sessionStore.fetchSessions();
  };

  // =========================================================================
  // LEFT PANEL CONTENT
  // =========================================================================
  const leftPanel = () => (
    <>
      {/* --- Agent Detail Panel (top, with dropdown selector) --- */}
      <Show
        when={agents() && activeAgent()}
        fallback={
          <div class="shrink-0 border-b border-border px-3 py-3">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center">
                <FiCpu class="w-4 h-4 text-text-muted" />
              </div>
              <span class="text-sm text-text-muted">Loading agents...</span>
            </div>
          </div>
        }
      >
        <AgentDetailPanel
          agent={activeAgent()!}
          agents={agents()!}
          onSelectAgent={selectAgent}
          capabilities={capabilities() || []}
          loading={agents.loading}
        />
      </Show>

      {/* --- Tab switcher: Chats | Workflows --- */}
      <nav class="shrink-0 flex border-b border-border" role="tablist" aria-label="Sidebar navigation">
        <button
          onClick={() => setSidebarTab("chats")}
          class={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative cursor-pointer ${
            sidebarTab() === "chats"
              ? "text-text"
              : "text-text-muted hover:text-text-secondary"
          }`}
          role="tab"
          aria-selected={sidebarTab() === "chats"}
          aria-controls="panel-chats"
        >
          <FiMessageSquare class="w-3 h-3" />
          <span>Chats</span>
          <Show when={sidebarTab() === "chats"}>
            <div class="absolute bottom-0 inset-x-3 h-0.5 bg-accent rounded-full" />
          </Show>
        </button>
        <button
          onClick={() => setSidebarTab("workflows")}
          class={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative cursor-pointer ${
            sidebarTab() === "workflows"
              ? "text-text"
              : "text-text-muted hover:text-text-secondary"
          }`}
          role="tab"
          aria-selected={sidebarTab() === "workflows"}
          aria-controls="panel-workflows"
        >
          <FiZap class="w-3 h-3" />
          <span>Workflows</span>
          <Show when={sidebarTab() === "workflows"}>
            <div class="absolute bottom-0 inset-x-3 h-0.5 bg-accent rounded-full" />
          </Show>
        </button>
      </nav>

      {/* --- Tab content (middle, grows) --- */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        <Show when={sidebarTab() === "chats"}>
          {/* Recent Chats tab */}
          <div id="panel-chats" role="tabpanel">
            <div class="flex items-center justify-between px-3 py-2">
              <span class="section-label">Recent Chats</span>
              <div class="flex items-center gap-1">
                <button
                  onClick={startNewChat}
                  class="p-1.5 text-text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
                  title="New chat"
                  aria-label="Start new chat"
                >
                  <FiPlus class="w-4 h-4" />
                </button>
                <button
                  onClick={handleRefresh}
                  class="p-1.5 text-text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
                  title="Refresh chats"
                  aria-label="Refresh chat list"
                >
                  <FiRefreshCw class={`w-3.5 h-3.5 ${agents.loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            <div class="px-1.5 pb-2" role="list" aria-label="Chat sessions">
              <Show when={!sessionStore.state.loading}>
                <For each={groupedSessions()}>
                  {(group) => (
                    <>
                      <div class="px-2 pt-2 pb-1 first:pt-0" role="presentation">
                        <span class="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{group.label}</span>
                      </div>
                      <For each={group.sessions}>
                        {(session) => {
                          const isActive = () => sessionStore.state.activeSessionId === session.id;
                          const isBusy = () => sessionStore.isSessionBusy(session.id);
                          const isUnseen = () => sessionStore.isSessionUnseen(session.id);
                          const isRetrying = () => sessionStore.getSessionRetryAttempt(session.id) > 0;
                          const isError = () => sessionStore.isSessionError(session.id);
                          const isPendingPermission = () => sessionStore.isSessionPendingPermission(session.id);
                          const summary = () => session.summary;

                        // Determine left accent color
                        const accentColor = () => {
                          if (isPendingPermission()) return "border-l-yellow-400";
                          if (isError()) return "border-l-red-400";
                          if (isRetrying()) return "border-l-amber-400";
                          if (isBusy()) return "border-l-success";
                          if (isActive()) return "border-l-blue-400";
                          return "border-l-transparent";
                        };

                        // Determine status line content
                        const statusLine = () => {
                          if (isPendingPermission()) return <span class="text-yellow-400">Needs approval</span>;
                          if (isError()) return <span class="text-red-400">Error</span>;
                          if (isRetrying()) return <span class="text-amber-400">Retrying (#{sessionStore.getSessionRetryAttempt(session.id)})...</span>;
                          if (isBusy()) return <span class="text-success">Running...</span>;
                          return formatRelativeTime(session.time?.updated || session.time?.created || 0);
                        };

                        // Determine left icon
                        const leftIndicator = () => {
                          if (isPendingPermission()) {
                            return (
                              <span class="relative flex h-2.5 w-2.5">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
                              </span>
                            );
                          }
                          if (isError()) return <span class="w-2.5 h-2.5 rounded-full bg-red-400" />;
                          if (isRetrying()) {
                            return (
                              <span class="relative flex h-2.5 w-2.5">
                                <span class="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                              </span>
                            );
                          }
                          if (isBusy()) {
                            return (
                              <span class="relative flex h-2.5 w-2.5">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
                              </span>
                            );
                          }
                          return <FiMessageSquare class={`w-3.5 h-3.5 ${isActive() ? "text-text-secondary" : "text-text-muted"}`} />;
                        };

                        return (
                          <button
                            onClick={() => openChat(session.id)}
                            onContextMenu={(e) => handleContextMenu(e, session.id)}
                            class={`relative w-full flex flex-col text-left transition-all duration-150 group border-l-2 ${accentColor()} ${
                              isActive()
                                ? "bg-surface-hover ring-1 ring-border"
                                : "hover:bg-surface-hover"
                            }`}
                            role="listitem"
                            aria-current={isActive() ? "true" : undefined}
                            aria-label={`Chat: ${formatSessionTitle(session.title)}`}
                          >
                            <div class="flex items-start gap-2.5 pl-2 pr-2.5 py-2 w-full">
                              {/* Left indicator */}
                              <div class="flex items-center justify-center w-4 h-4 mt-0.5 shrink-0">
                                {leftIndicator()}
                              </div>
                              {/* Content */}
                              <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-1.5">
                                  <p class={`text-sm truncate leading-snug flex-1 ${
                                    isActive() ? "text-text font-medium"
                                      : isUnseen() ? "text-text font-semibold"
                                      : "text-text-secondary"
                                  }`}>
                                    {formatSessionTitle(session.title)}
                                  </p>
                                  {/* Unseen dot */}
                                  <Show when={isUnseen() && !isActive()}>
                                    <span class="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                                  </Show>
                                </div>
                                {/* Status + file changes */}
                                <div class="flex items-center gap-2 mt-0.5">
                                  <span class="text-[10px] text-text-muted tabular-nums">
                                    {statusLine()}
                                  </span>
                                  <Show when={summary() && summary()!.files > 0}>
                                    <span class="text-[10px] font-mono flex items-center gap-1 text-text-muted">
                                      <FiGitCommit class="w-2.5 h-2.5" />
                                      <span class="text-emerald-400">+{summary()!.additions}</span>
                                      <span class="text-red-400">-{summary()!.deletions}</span>
                                    </span>
                                  </Show>
                                </div>
                              </div>
                            </div>
                            {/* Neural trace beam — subtle glow on the bottom edge */}
                            <Show when={isBusy() || isRetrying() || isPendingPermission()}>
                              <div class="absolute bottom-0 left-2 right-2 z-10">
                                <NeuralTrace
                                  size="sm"
                                  color={isPendingPermission() ? "warning" : isRetrying() ? "warning" : "accent"}
                                />
                              </div>
                            </Show>
                          </button>
                        );
                      }}
                    </For>
                  </>
                )}
              </For>
            </Show>

            <Show when={sessionStore.state.loading}>
              <div class="flex items-center justify-center py-4">
                <div class="w-3.5 h-3.5 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
                <span class="ml-2 text-xs text-text-muted">Loading...</span>
              </div>
            </Show>
          </div>
          </div>
        </Show>

        <Show when={sidebarTab() === "workflows"}>
          {/* Workflows tab */}
          <div id="panel-workflows" role="tabpanel">
            <WorkflowPanel namespace={activeAgent()?.metadata.namespace} />
          </div>
        </Show>
      </div>

      {/* --- Footer --- */}
      <footer class="shrink-0 border-t border-border">
        <div class="flex items-center gap-1 px-2 py-1.5">
          {/* Panel toggle */}
          <button
            onClick={panelStore.toggleLeft}
            class="p-1.5 text-text-muted hover:text-text-secondary rounded transition-colors cursor-pointer"
            title="Toggle left panel"
            aria-label="Toggle left panel"
          >
            <FiSidebar class="w-3.5 h-3.5" />
          </button>
          <div class="flex-1" />
          <A
            href="/settings"
            class="flex items-center gap-2 px-2.5 py-1.5 text-sm text-text-muted hover:text-text-secondary hover:bg-surface-hover rounded-md transition-colors"
          >
            <FiSettings class="w-3.5 h-3.5" />
            <span>Settings</span>
          </A>
        </div>
      </footer>
    </>
  );

  // =========================================================================
  // CENTER CONTENT
  // =========================================================================
  const centerContent = () => (
    <>
      {/* Content */}
      <Show
        when={sessionStore.state.activeSessionId}
        fallback={
          /* ===== Recent Chats View ===== */
          <div class="flex-1 overflow-y-auto">
            <div class="max-w-xl mx-auto px-6 py-8">
              {/* New Chat Button */}
              <button
                onClick={startNewChat}
                class="w-full mb-6 px-4 py-3 rounded-lg border border-dashed border-border hover:border-text-muted/40 hover:bg-surface-hover transition-all group flex items-center gap-3 cursor-pointer"
              >
                <div class="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center group-hover:border-text-muted/40 transition-colors">
                  <FiPlus class="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors" />
                </div>
                <div class="text-left">
                  <span class="text-sm font-semibold text-text block">New conversation</span>
                  <span class="text-xs text-text-muted">Start a new chat session</span>
                </div>
              </button>

              {/* Loading */}
              <Show when={sessionStore.state.loading}>
                <div class="flex items-center justify-center py-8">
                  <div class="w-4 h-4 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
                  <span class="ml-2.5 text-sm text-text-muted">Loading...</span>
                </div>
              </Show>

              {/* Recent Chats List */}
              <Show when={!sessionStore.state.loading}>
                <div>
                  <Show
                    when={sessionStore.visibleSessions().length > 0}
                    fallback={
                      <div class="text-center py-12">
                        <FiMessageSquare class="w-8 h-8 text-text-muted/30 mx-auto mb-3" />
                        <p class="text-sm text-text-muted">No conversations yet</p>
                      </div>
                    }
                  >
                    <For each={groupedAllSessions()}>
                      {(group) => (
                        <div class="mb-4">
                          <h3 class="section-label mb-1.5 px-1">{group.label}</h3>
                          <div class="flex flex-col gap-px" role="list">
                            <For each={group.sessions}>
                              {(session) => {
                                const isBusy = () => sessionStore.isSessionBusy(session.id);
                                const isUnseen = () => sessionStore.isSessionUnseen(session.id);
                                const isError = () => sessionStore.isSessionError(session.id);
                                const isRetrying = () => sessionStore.getSessionRetryAttempt(session.id) > 0;
                                const isPendingPermission = () => sessionStore.isSessionPendingPermission(session.id);
                                const summary = () => session.summary;

                                const accentColor = () => {
                                  if (isPendingPermission()) return "border-l-yellow-400";
                                  if (isError()) return "border-l-red-400";
                                  if (isRetrying()) return "border-l-amber-400";
                                  if (isBusy()) return "border-l-success";
                                  return "border-l-transparent";
                                };

                                const statusText = () => {
                                  if (isPendingPermission()) return <span class="text-yellow-400">Needs approval</span>;
                                  if (isError()) return <span class="text-red-400">Error</span>;
                                  if (isRetrying()) return <span class="text-amber-400">Retrying...</span>;
                                  if (isBusy()) return <span class="text-success">Running...</span>;
                                  return formatRelativeTime(session.time?.updated || session.time?.created || 0);
                                };

                                const leftIcon = () => {
                                  if (isPendingPermission()) {
                                    return (
                                      <span class="relative flex h-3 w-3 shrink-0">
                                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                        <span class="relative inline-flex rounded-full h-3 w-3 bg-yellow-400" />
                                      </span>
                                    );
                                  }
                                  if (isError()) return <span class="w-3 h-3 rounded-full bg-red-400 shrink-0" />;
                                  if (isRetrying()) {
                                    return (
                                      <span class="relative flex h-3 w-3 shrink-0">
                                        <span class="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                        <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-400" />
                                      </span>
                                    );
                                  }
                                  if (isBusy()) {
                                    return (
                                      <span class="relative flex h-3 w-3 shrink-0">
                                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                                        <span class="relative inline-flex rounded-full h-3 w-3 bg-success" />
                                      </span>
                                    );
                                  }
                                  return <FiMessageSquare class="w-3.5 h-3.5 text-text-muted shrink-0" />;
                                };

                                return (
                                  <div
                                    onClick={() => openChat(session.id)}
                                    onContextMenu={(e) => handleContextMenu(e, session.id)}
                                    class={`relative flex flex-col hover:bg-surface-hover cursor-pointer group transition-colors border-l-2 ${accentColor()}`}
                                    role="listitem"
                                    tabIndex={0}
                                    aria-label={`Chat: ${formatSessionTitle(session.title)}`}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openChat(session.id); } }}
                                  >
                                    <div class="flex items-center gap-2.5 px-2.5 py-2">
                                      {leftIcon()}
                                      <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-1.5">
                                          <span class={`text-sm truncate flex-1 ${isUnseen() ? "text-text font-semibold" : "text-text"}`}>
                                            {formatSessionTitle(session.title)}
                                          </span>
                                          <Show when={isUnseen()}>
                                            <span class="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                                          </Show>
                                        </div>
                                        <div class="flex items-center gap-2 mt-0.5">
                                          <span class="text-xs text-text-muted tabular-nums">
                                            {statusText()}
                                          </span>
                                          <Show when={summary() && summary()!.files > 0}>
                                            <span class="text-[10px] font-mono flex items-center gap-1 text-text-muted">
                                              <FiGitCommit class="w-2.5 h-2.5" />
                                              <span class="text-emerald-400">+{summary()!.additions}</span>
                                              <span class="text-red-400">-{summary()!.deletions}</span>
                                            </span>
                                          </Show>
                                        </div>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleContextMenu(e, session.id);
                                        }}
                                        class="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-secondary transition-all cursor-pointer"
                                        aria-label="Chat options"
                                      >
                                        <FiMoreVertical class="w-3 h-3" />
                                      </button>
                                    </div>
                                    {/* Neural trace beam — subtle glow on the bottom edge */}
                                    <Show when={isBusy() || isRetrying() || isPendingPermission()}>
                                      <div class="absolute bottom-0 left-2.5 right-2.5 z-10">
                                        <NeuralTrace
                                          size="sm"
                                          color={isPendingPermission() ? "warning" : isRetrying() ? "warning" : "accent"}
                                        />
                                      </div>
                                    </Show>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </Show>
            </div>
          </div>
        }
      >
        {/* ===== Active Chat ===== */}
        <Show
          when={activeAgent()}
          fallback={
            <div class="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div class="w-8 h-8 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin mb-3" />
              <p class="text-sm text-text-muted">Connecting to agent...</p>
            </div>
          }
        >
          {/* Composite key: agent identity + session ID.
              SolidJS <Show keyed> only remounts when the key value changes.
              Without the agent in the key, switching agents that share a session ID
              (or that restore the same activeSessionId from localStorage) would NOT
              remount ChatInterface, leaving the old agent's messages on screen. */}
          <Show when={(() => {
            const agent = activeAgent();
            const sid = sessionStore.state.activeSessionId;
            if (!agent || !sid) return null;
            return `${agent.metadata.namespace}/${agent.metadata.name}/${sid}`;
          })()} keyed>
            {(_key) => (
              <ChatInterface
                namespace={activeAgent()!.metadata.namespace}
                name={activeAgent()!.metadata.name}
                displayName={activeAgent()!.spec.identity?.name || activeAgent()!.metadata.name}
                sessionId={sessionStore.state.activeSessionId!}
                selectedContexts={[]}
                agent={activeAgent()!}
                capabilities={capabilities()}
              />
            )}
          </Show>
        </Show>
      </Show>
    </>
  );

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <>
      <ThreePanelLayout
        left={leftPanel()}
        center={centerContent()}
      />

      {/* Context Menu (portal-like, rendered above layout) */}
      <Show when={contextMenu()}>
        <ChatContextMenu
          x={contextMenu()!.x}
          y={contextMenu()!.y}
          sessionId={contextMenu()!.sessionId}
          onDelete={(id) => sessionStore.removeSession(id)}
          onHide={(id) => sessionStore.hideSession(id)}
          onClose={() => setContextMenu(null)}
        />
      </Show>
    </>
  );
};


export default MainApp;
