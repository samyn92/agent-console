import { createSignal, createResource, createEffect, Show, For, createMemo, onMount, onCleanup } from "solid-js";
import { A } from "@solidjs/router";
import { FiSettings, FiRefreshCw, FiMessageSquare, FiPlus, FiMoreVertical, FiCpu, FiSidebar, FiZap, FiGitCommit, FiMenu, FiMapPin } from "solid-icons/fi";
import { listAgents, listCapabilities, listRepos, type AgentResponse } from "../lib/api";
import type { Session } from "../types/acp";
import type { SelectedContext } from "../types/context";
import ChatInterface from "../components/chat/ChatInterface";
import AgentDetailPanel from "../components/agent/AgentDetailPanel";
import ChatContextMenu from "../components/chat/ChatContextMenu";
import WorkflowPanel from "../components/workflow/WorkflowPanel";

import ThreePanelLayout from "../components/layout/ThreePanelLayout";
import { sessionStore } from "../stores/sessions";
import { panelStore } from "../stores/panelStore";
import { globalEventsStore } from "../stores/globalEvents";
import { mobileStore } from "../stores/mobileStore";
import { settingsStore } from "../stores/settings";
import { getContextId } from "../components/chat/ContextBar";

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

  // Selected resource contexts (from CapabilityBrowser)
  const [selectedContexts, setSelectedContexts] = createSignal<SelectedContext[]>([]);

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

  // Fetch repos for the CapabilityBrowser (GitHub/GitLab browsing)
  const [repos] = createResource(() => listRepos());

  // Auto-select agent when agents list loads:
  // Prefer the previously selected agent (persisted in localStorage),
  // fall back to the first agent in the list.
  createEffect(() => {
    const agentList = agents();
    if (agentList && agentList.length > 0 && !activeAgent()) {
      const savedKey = settingsStore.selectedAgent();
      if (savedKey) {
        const match = agentList.find(
          (a) => `${a.metadata.namespace}/${a.metadata.name}` === savedKey
        );
        if (match) {
          setActiveAgent(match);
          return;
        }
      }
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
    settingsStore.setSelectedAgent(`${agent.metadata.namespace}/${agent.metadata.name}`);
    // Session store will be updated by the createEffect above
  };

  // Toggle a context item from the CapabilityBrowser
  const toggleContext = (item: SelectedContext) => {
    const id = getContextId(item);
    setSelectedContexts((prev) => {
      const exists = prev.some((c) => getContextId(c) === id);
      if (exists) {
        return prev.filter((c) => getContextId(c) !== id);
      }
      return [...prev, item];
    });
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
    const allSessions = sessionStore.visibleSessions().slice(0, 30);
    if (allSessions.length === 0) return [];

    // Separate pinned sessions
    const pinned = allSessions.filter((s) => sessionStore.isSessionPinned(s.id));
    const unpinned = allSessions.filter((s) => !sessionStore.isSessionPinned(s.id));

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const yesterdayStart = todayStart - 86400;
    const weekStart = todayStart - 6 * 86400;

    const groups: Record<string, Session[]> = {
      Pinned: pinned,
      Today: [],
      Yesterday: [],
      "This Week": [],
      Older: [],
    };

    for (const s of unpinned) {
      const t = s.time?.updated || s.time?.created || 0;
      if (t >= todayStart) groups["Today"].push(s);
      else if (t >= yesterdayStart) groups["Yesterday"].push(s);
      else if (t >= weekStart) groups["This Week"].push(s);
      else groups["Older"].push(s);
    }

    return (["Pinned", "Today", "Yesterday", "This Week", "Older"] as const)
      .filter((label) => groups[label].length > 0)
      .map((label) => ({ label, sessions: groups[label] }));
  });

  // Same grouping but for center panel (no limit)
  const groupedAllSessions = createMemo((): TimeGroup[] => {
    const allSessions = sessionStore.visibleSessions();
    if (allSessions.length === 0) return [];

    // Separate pinned sessions
    const pinned = allSessions.filter((s) => sessionStore.isSessionPinned(s.id));
    const unpinned = allSessions.filter((s) => !sessionStore.isSessionPinned(s.id));

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const yesterdayStart = todayStart - 86400;
    const weekStart = todayStart - 6 * 86400;

    const groups: Record<string, Session[]> = {
      Pinned: pinned,
      Today: [],
      Yesterday: [],
      "This Week": [],
      Older: [],
    };

    for (const s of unpinned) {
      const t = s.time?.updated || s.time?.created || 0;
      if (t >= todayStart) groups["Today"].push(s);
      else if (t >= yesterdayStart) groups["Yesterday"].push(s);
      else if (t >= weekStart) groups["This Week"].push(s);
      else groups["Older"].push(s);
    }

    return (["Pinned", "Today", "Yesterday", "This Week", "Older"] as const)
      .filter((label) => groups[label].length > 0)
      .map((label) => ({ label, sessions: groups[label] }));
  });

  const startNewChat = async () => {
    await sessionStore.startNewChat();
  };

  const openChat = (sessionId: string) => {
    sessionStore.openSession(sessionId);
    // Close drawer on mobile after selecting a chat
    if (mobileStore.state.isMobile && mobileStore.state.drawerOpen) {
      mobileStore.closeDrawer();
    }
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
      {/* --- Primary tab switcher: Chats | Workflows (top-level paradigm switch) --- */}
      <nav class="shrink-0 flex bg-surface border-b border-border" role="tablist" aria-label="Primary navigation">
        <button
          onClick={() => setSidebarTab("chats")}
          class={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-colors relative cursor-pointer ${
            sidebarTab() === "chats"
              ? "text-text"
              : "text-text-muted hover:text-text-secondary"
          }`}
          role="tab"
          aria-selected={sidebarTab() === "chats"}
          aria-controls="panel-chats"
        >
          <FiMessageSquare class="w-4 h-4" />
          <span>Chats</span>
          <Show when={sidebarTab() === "chats"}>
            <div class="tab-active-indicator" />
          </Show>
        </button>
        <button
          onClick={() => setSidebarTab("workflows")}
          class={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-colors relative cursor-pointer ${
            sidebarTab() === "workflows"
              ? "text-text"
              : "text-text-muted hover:text-text-secondary"
          }`}
          role="tab"
          aria-selected={sidebarTab() === "workflows"}
          aria-controls="panel-workflows"
        >
          <FiZap class="w-4 h-4" />
          <span>Workflows</span>
          <Show when={sidebarTab() === "workflows"}>
            <div class="tab-active-indicator" />
          </Show>
        </button>
      </nav>

      {/* --- Agent Detail Panel (only visible in Chats mode) --- */}
      <Show when={sidebarTab() === "chats"}>
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
            selectedContexts={selectedContexts()}
            onToggleSelect={toggleContext}
            repos={repos() || []}
          />
        </Show>
      </Show>

      {/* --- Tab content (middle, grows) --- */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        <Show when={sidebarTab() === "chats"}>
          {/* Recent Chats tab */}
          <div id="panel-chats" role="tabpanel">
            <div class="flex items-center justify-between px-4 pt-3 pb-2">
              <span class="text-[11px] font-semibold uppercase tracking-widest text-text-muted/70">Recent Chats</span>
              <div class="flex items-center gap-0.5">
                <button
                  onClick={startNewChat}
                  class="p-1.5 text-text-muted/60 hover:text-text hover:bg-surface-hover rounded-md transition-all duration-150 cursor-pointer"
                  title="New chat"
                  aria-label="Start new chat"
                >
                  <FiPlus class="w-4 h-4" />
                </button>
                <button
                  onClick={handleRefresh}
                  class="p-1.5 text-text-muted/60 hover:text-text hover:bg-surface-hover rounded-md transition-all duration-150 cursor-pointer"
                  title="Refresh chats"
                  aria-label="Refresh chat list"
                >
                  <FiRefreshCw class={`w-3.5 h-3.5 ${agents.loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            <div class="px-2 pb-2" role="list" aria-label="Chat sessions">
              <Show when={!sessionStore.state.loading}>
                <For each={groupedSessions()}>
                  {(group) => (
                    <>
                      <div class="px-2 pt-3 pb-1.5 first:pt-1" role="presentation">
                        <div class="flex items-center gap-2">
                          <span class="text-[10px] font-bold uppercase tracking-widest text-text-muted/50">{group.label}</span>
                          <div class="flex-1 h-px bg-border/40" />
                        </div>
                      </div>
                      <For each={group.sessions}>
                        {(session) => {
                           const isActive = () => sessionStore.state.activeSessionId === session.id;
                          const isBusy = () => sessionStore.isSessionBusy(session.id);
                          const isUnseen = () => sessionStore.isSessionUnseen(session.id);
                          const isRetrying = () => sessionStore.getSessionRetryAttempt(session.id) > 0;
                          const isError = () => sessionStore.isSessionError(session.id);
                          const isPendingPermission = () => sessionStore.isSessionPendingPermission(session.id);
                          const isPinned = () => sessionStore.isSessionPinned(session.id);
                          const summary = () => session.summary;

                        // Determine left accent color
                        const accentColor = () => {
                          if (isPendingPermission()) return "bg-yellow-400";
                          if (isError()) return "bg-red-400";
                          if (isRetrying()) return "bg-amber-400";
                          if (isBusy()) return "bg-success";
                          if (isActive()) return "bg-primary";
                          return "bg-transparent";
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
                                <span class="status-dot-glow absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
                              </span>
                            );
                          }
                          if (isError()) return <span class="w-2.5 h-2.5 rounded-full bg-red-400" />;
                          if (isRetrying()) {
                            return (
                              <span class="relative flex h-2.5 w-2.5">
                                <span class="status-dot-glow absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                              </span>
                            );
                          }
                          if (isBusy()) {
                            return (
                              <span class="relative flex h-2.5 w-2.5">
                                <span class="status-dot-glow absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
                              </span>
                            );
                          }
                          if (isPinned()) {
                            return <FiMapPin class={`w-3.5 h-3.5 ${isActive() ? "text-accent" : "text-accent/60"}`} />;
                          }
                          return <FiMessageSquare class={`w-3.5 h-3.5 ${isActive() ? "text-text-secondary" : "text-text-muted"}`} />;
                        };

                        return (
                          <button
                            onClick={() => openChat(session.id)}
                            onContextMenu={(e) => handleContextMenu(e, session.id)}
                            class={`relative w-full flex flex-col text-left transition-all duration-150 group rounded-lg mb-0.5 ${
                              (isBusy() || isRetrying() || isPendingPermission())
                                ? `session-row-processing ${
                                    isPendingPermission() ? "session-row-processing--warning"
                                    : isRetrying() ? "session-row-processing--warning"
                                    : "session-row-processing--accent"
                                  }`
                                : ""
                            } ${
                              isActive()
                                ? "bg-primary/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-primary/20 z-10"
                                : "hover:bg-surface-hover/70 text-text-muted"
                            }`}
                            role="listitem"
                            aria-current={isActive() ? "true" : undefined}
                            aria-label={`Chat: ${formatSessionTitle(session.title)}`}
                          >
                            <div class={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-colors duration-200 ${accentColor()}`} />
                            <div class="flex items-start gap-2.5 pl-2.5 pr-3 py-2.5 w-full">
                              {/* Left indicator */}
                              <div class="flex items-center justify-center w-4 h-4 mt-0.5 shrink-0">
                                {leftIndicator()}
                              </div>
                              {/* Content */}
                              <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-1.5">
                                  <p class={`text-[13px] truncate leading-snug flex-1 ${
                                    isActive() ? "text-text font-medium"
                                      : isUnseen() ? "text-text font-semibold"
                                      : "text-text-secondary group-hover:text-text"
                                  }`}>
                                    {formatSessionTitle(session.title)}
                                  </p>
                                  {/* Unseen dot */}
                                  <Show when={isUnseen() && !isActive()}>
                                    <span class="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                                  </Show>
                                </div>
                                {/* Status + file changes */}
                                <div class="flex items-center gap-2 mt-0.5">
                                  <span class="text-[10px] text-text-muted/70 tabular-nums">
                                    {statusLine()}
                                  </span>
                                  <Show when={summary() && summary()!.files > 0}>
                                    <span class="text-[10px] font-mono flex items-center gap-1 text-text-muted/70">
                                      <FiGitCommit class="w-2.5 h-2.5" />
                                      <span class="text-emerald-400">+{summary()!.additions}</span>
                                      <span class="text-red-400">-{summary()!.deletions}</span>
                                    </span>
                                  </Show>
                                </div>
                              </div>
                            </div>
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
      <footer class="shrink-0 border-t border-border/60 bg-surface/50">
        <div class="flex items-center gap-1 px-2.5 py-2">
          {/* Panel toggle (desktop) / Close drawer (mobile) */}
          <Show
            when={!mobileStore.state.isMobile}
            fallback={
              <button
                onClick={() => mobileStore.closeDrawer()}
                class="p-1.5 text-text-muted/60 hover:text-text-secondary hover:bg-surface-hover rounded-md transition-all duration-150 cursor-pointer"
                title="Close drawer"
                aria-label="Close navigation drawer"
              >
                <FiSidebar class="w-3.5 h-3.5" />
              </button>
            }
          >
            <button
              onClick={panelStore.toggleLeft}
              class="p-1.5 text-text-muted/60 hover:text-text-secondary hover:bg-surface-hover rounded-md transition-all duration-150 cursor-pointer"
              title="Toggle left panel"
              aria-label="Toggle left panel"
            >
              <FiSidebar class="w-3.5 h-3.5" />
            </button>
          </Show>
          <div class="flex-1" />
          <A
            href="/settings"
            class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-text-muted/70 hover:text-text-secondary hover:bg-surface-hover rounded-md transition-all duration-150"
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
      {/* Mobile header bar — only visible on mobile */}
      <Show when={mobileStore.state.isMobile}>
        <header class="mobile-header shrink-0 flex items-center gap-3 px-3 py-2.5 border-b border-border bg-surface">
          <button
            onClick={() => mobileStore.openDrawer()}
            class="p-2 -ml-1 text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer touch-target"
            aria-label="Open navigation menu"
          >
            <FiMenu class="w-5 h-5" />
          </button>
          <div class="flex-1 min-w-0">
            <Show
              when={sidebarTab() === "chats"}
              fallback={<span class="text-sm font-medium text-text truncate">Workflows</span>}
            >
              <Show
                when={sessionStore.state.activeSessionId || sessionStore.state.isDraftChat}
                fallback={<span class="text-sm font-medium text-text truncate">Chats</span>}
              >
                <span class="text-sm font-medium text-text truncate block">
                  {(() => {
                    if (sessionStore.state.isDraftChat) return "New chat";
                    const session = sessionStore.visibleSessions().find(
                      (s) => s.id === sessionStore.state.activeSessionId
                    );
                    return formatSessionTitle(session?.title);
                  })()}
                </span>
              </Show>
            </Show>
          </div>
          <Show when={sidebarTab() === "chats"}>
            <button
              onClick={startNewChat}
              class="p-2 -mr-1 text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer touch-target"
              aria-label="New chat"
            >
              <FiPlus class="w-5 h-5" />
            </button>
          </Show>
        </header>
      </Show>

      {/* ===== Workflows Center View ===== */}
      <Show when={sidebarTab() === "workflows"}>
        <div class="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div class="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-4">
            <FiZap class="w-7 h-7 text-text-muted" />
          </div>
          <h2 class="text-lg font-semibold text-text mb-1.5">Workflow Runs</h2>
          <p class="text-sm text-text-muted max-w-sm">
            Select a workflow from the sidebar to view its runs, or trigger a new run.
            The process pipeline view will appear here.
          </p>
        </div>
      </Show>

      {/* ===== Chats Center View ===== */}
      <Show when={sidebarTab() === "chats"}>
        <Show
          when={sessionStore.state.activeSessionId || sessionStore.state.isDraftChat}
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
                                  if (isPendingPermission()) return "bg-yellow-400";
                                  if (isError()) return "bg-red-400";
                                  if (isRetrying()) return "bg-amber-400";
                                  if (isBusy()) return "bg-success";
                                  return "bg-transparent";
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
                                        <span class="status-dot-glow absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                        <span class="relative inline-flex rounded-full h-3 w-3 bg-yellow-400" />
                                      </span>
                                    );
                                  }
                                  if (isError()) return <span class="w-3 h-3 rounded-full bg-red-400 shrink-0" />;
                                  if (isRetrying()) {
                                    return (
                                      <span class="relative flex h-3 w-3 shrink-0">
                                        <span class="status-dot-glow absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                                        <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-400" />
                                      </span>
                                    );
                                  }
                                  if (isBusy()) {
                                    return (
                                      <span class="relative flex h-3 w-3 shrink-0">
                                        <span class="status-dot-glow absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
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
                                    class={`relative flex flex-col hover:bg-surface-hover rounded-lg mb-0.5 cursor-pointer group transition-colors ${
                                      (isBusy() || isRetrying() || isPendingPermission())
                                        ? `session-row-processing ${
                                            isPendingPermission() ? "session-row-processing--warning"
                                            : isRetrying() ? "session-row-processing--warning"
                                            : "session-row-processing--accent"
                                          }`
                                        : ""
                                    }`}
                                    role="listitem"
                                    tabIndex={0}
                                    aria-label={`Chat: ${formatSessionTitle(session.title)}`}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openChat(session.id); } }}
                                  >
                                    <div class={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-colors ${accentColor()}`} />
                                    <div class="flex items-center gap-2.5 px-2.5 py-2">
                                      {leftIcon()}
                                      <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-1.5">
                                          <span class={`text-sm truncate flex-1 ${isUnseen() ? "text-text font-semibold" : "text-text"}`}>
                                            {formatSessionTitle(session.title)}
                                          </span>
                                          <Show when={isUnseen()}>
                                            <span class="w-2 h-2 rounded-full bg-accent shrink-0" />
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
          {/* Mount key: agent identity + chatMountId. The mount ID is a
              monotonically increasing counter that bumps on intentional navigation
              (openSession, startNewChat, switchTab, goToRecent) but NOT when a
              draft materializes into a real session via finalizeDraftSession.
              This prevents SolidJS from remounting ChatInterface mid-conversation
              when the session ID changes from __draft__ to a real ID. */}
          <Show when={(() => {
            const agent = activeAgent();
            const sid = sessionStore.state.activeSessionId;
            const isDraft = sessionStore.state.isDraftChat;
            if (!agent || (!sid && !isDraft)) return null;
            return `${agent.metadata.namespace}/${agent.metadata.name}/${sessionStore.chatMountId()}`;
          })()} keyed>
            {(_key) => (
              <ChatInterface
                namespace={activeAgent()!.metadata.namespace}
                name={activeAgent()!.metadata.name}
                displayName={activeAgent()!.spec.identity?.name || activeAgent()!.metadata.name}
                sessionId={sessionStore.state.activeSessionId || undefined}
                isDraft={!sessionStore.state.activeSessionId && sessionStore.state.isDraftChat}
                selectedContexts={selectedContexts()}
                onRemoveContext={toggleContext}
                agent={activeAgent()!}
                capabilities={capabilities()}
              />
            )}
          </Show>
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
          isPinned={sessionStore.isSessionPinned(contextMenu()!.sessionId)}
          onDelete={(id) => sessionStore.removeSession(id)}
          onTogglePin={(id) => sessionStore.togglePinSession(id)}
          onClose={() => setContextMenu(null)}
        />
      </Show>
    </>
  );
};


export default MainApp;
