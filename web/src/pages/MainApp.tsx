import { createSignal, createResource, createEffect, Show, For } from "solid-js";
import { A } from "@solidjs/router";
import { FiSettings, FiRefreshCw, FiMessageSquare, FiPlus, FiMoreVertical, FiCpu, FiSidebar, FiZap } from "solid-icons/fi";
import { listAgents, listCapabilities, type AgentResponse } from "../lib/api";
import ChatInterface from "../components/chat/ChatInterface";
import ChatTabBar from "../components/chat/ChatTabBar";
import ChatContextMenu from "../components/chat/ChatContextMenu";
import AgentDetailPanel from "../components/agent/AgentDetailPanel";
import WorkflowPanel from "../components/workflow/WorkflowPanel";
import ThreePanelLayout from "../components/layout/ThreePanelLayout";
import { sessionStore } from "../stores/sessions";
import { panelStore } from "../stores/panelStore";

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

  // Data fetching
  const [agents, { refetch: refetchAgents }] = createResource(() => listAgents());
  const [capabilities] = createResource(
    () => activeAgent()?.metadata.namespace,
    (ns) => listCapabilities(ns)
  );

  // Auto-select first agent and initialize session store
  createEffect(() => {
    const agentList = agents();
    if (agentList && agentList.length > 0 && !activeAgent()) {
      const agent = agentList[0];
      setActiveAgent(agent);
      sessionStore.setAgent(agent.metadata.namespace, agent.metadata.name);
    }
  });

  // Re-init session store when agent changes
  createEffect(() => {
    const agent = activeAgent();
    if (agent) {
      sessionStore.setAgent(agent.metadata.namespace, agent.metadata.name);
    }
  });

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
      {/* --- Agent Detail Panel (top, bigger) --- */}
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
          onSelectAgent={setActiveAgent}
          capabilities={capabilities() || []}
          loading={agents.loading}
        />
      </Show>

      {/* --- Tab switcher: Chats | Workflows --- */}
      <div class="shrink-0 flex border-b border-border">
        <button
          onClick={() => setSidebarTab("chats")}
          class={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative ${
            sidebarTab() === "chats"
              ? "text-text"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <FiMessageSquare class="w-3 h-3" />
          <span>Chats</span>
          <Show when={sidebarTab() === "chats"}>
            <div class="absolute bottom-0 inset-x-3 h-px bg-accent" />
          </Show>
        </button>
        <button
          onClick={() => setSidebarTab("workflows")}
          class={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative ${
            sidebarTab() === "workflows"
              ? "text-text"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          <FiZap class="w-3 h-3" />
          <span>Workflows</span>
          <Show when={sidebarTab() === "workflows"}>
            <div class="absolute bottom-0 inset-x-3 h-px bg-accent" />
          </Show>
        </button>
      </div>

      {/* --- Tab content (middle, grows) --- */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        <Show when={sidebarTab() === "chats"}>
          {/* Recent Chats tab */}
          <div class="flex items-center justify-between px-3 py-2">
            <span class="section-label">Recent Chats</span>
            <button
              onClick={handleRefresh}
              class="p-1 text-text-muted hover:text-text-secondary rounded transition-colors"
              title="Refresh"
            >
              <FiRefreshCw class={`w-3 h-3 ${agents.loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div class="px-1.5 pb-2">
            <button
              onClick={startNewChat}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-surface-hover text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              <FiPlus class="w-3.5 h-3.5" />
              <span>New chat</span>
            </button>

            <Show when={!sessionStore.state.loading}>
              <For each={sessionStore.visibleSessions().slice(0, 30)}>
                {(session) => (
                  <button
                    onClick={() => openChat(session.id)}
                    onContextMenu={(e) => handleContextMenu(e, session.id)}
                    class={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors group ${
                      sessionStore.state.activeSessionId === session.id
                        ? "bg-surface-2 text-text"
                        : "hover:bg-surface-hover text-text-secondary"
                    }`}
                  >
                    <FiMessageSquare class="w-3 h-3 text-text-muted shrink-0" />
                    <span class="text-xs truncate flex-1">
                      {formatSessionTitle(session.title)}
                    </span>
                    <span class="text-xs text-text-muted shrink-0 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatRelativeTime(session.time?.updated || session.time?.created || 0)}
                    </span>
                  </button>
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
        </Show>

        <Show when={sidebarTab() === "workflows"}>
          {/* Workflows tab */}
          <WorkflowPanel namespace={activeAgent()?.metadata.namespace} />
        </Show>
      </div>

      {/* --- Footer --- */}
      <footer class="shrink-0 border-t border-border">
        <div class="flex items-center gap-1 px-2 py-1.5">
          {/* Panel toggle */}
          <button
            onClick={panelStore.toggleLeft}
            class="p-1.5 text-text-muted hover:text-text-secondary rounded transition-colors"
            title="Toggle left panel"
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
      {/* Tab Bar */}
      <ChatTabBar
        tabs={sessionStore.state.openTabs}
        activeSessionId={sessionStore.state.activeSessionId}
        onSwitchTab={(id) => sessionStore.switchTab(id)}
        onCloseTab={(id) => sessionStore.closeTab(id)}
        onNewChat={startNewChat}
        onGoToRecent={() => sessionStore.goToRecent()}
      />

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
                  <h3 class="section-label mb-2 px-1">
                    Recent
                  </h3>
                  <Show
                    when={sessionStore.visibleSessions().length > 0}
                    fallback={
                      <div class="text-center py-12">
                        <FiMessageSquare class="w-8 h-8 text-text-muted/30 mx-auto mb-3" />
                        <p class="text-sm text-text-muted">No conversations yet</p>
                      </div>
                    }
                  >
                    <div class="flex flex-col gap-px">
                      <For each={sessionStore.visibleSessions()}>
                        {(session) => (
                          <div
                            onClick={() => openChat(session.id)}
                            onContextMenu={(e) => handleContextMenu(e, session.id)}
                            class="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-surface-hover cursor-pointer group transition-colors"
                          >
                            <FiMessageSquare class="w-3.5 h-3.5 text-text-muted shrink-0" />
                            <span class="text-sm text-text truncate flex-1">
                              {formatSessionTitle(session.title)}
                            </span>
                            <span class="text-xs text-text-muted shrink-0 tabular-nums">
                              {formatRelativeTime(session.time?.updated || session.time?.created || 0)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleContextMenu(e, session.id);
                              }}
                              class="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-secondary transition-all"
                            >
                              <FiMoreVertical class="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
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
          <Show when={sessionStore.state.activeSessionId} keyed>
            {(sessionId) => (
              <ChatInterface
                namespace={activeAgent()!.metadata.namespace}
                name={activeAgent()!.metadata.name}
                displayName={activeAgent()!.spec.identity?.name || activeAgent()!.metadata.name}
                sessionId={sessionId}
                selectedContexts={[]}
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
