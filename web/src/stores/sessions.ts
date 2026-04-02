import { createSignal, createRoot, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { listSessions, deleteSession as apiDeleteSession, createSession as apiCreateSession } from "../lib/api";
import { dispatch as dispatchEvent, setConnected as setEventBusConnected } from "../lib/event-bus";
import type { Session } from "../types/acp";

// =============================================================================
// TYPES
// =============================================================================

export interface SessionTab {
  sessionId: string;
  title: string;
}

interface SessionState {
  /** All sessions from the backend, sorted by updated time desc */
  sessions: Session[];
  /** Currently active session ID (the one being viewed/chatted in) */
  activeSessionId: string | null;
  /** Open tabs - sessions pinned in the tab bar */
  openTabs: SessionTab[];
  /** Hidden session IDs (user chose to hide from recent list) */
  hiddenSessionIds: string[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
}

// API base for EventSource (same as in api.ts)
const API_BASE = import.meta.env.DEV ? 'http://localhost:9090' : '';

// =============================================================================
// STORE
// =============================================================================

function createSessionStore() {
  const [state, setState] = createStore<SessionState>({
    sessions: [],
    activeSessionId: null,
    openTabs: [],
    hiddenSessionIds: [],
    loading: false,
    error: null,
  });

  // Track which agent we're managing sessions for
  const [agentRef, setAgentRef] = createSignal<{ namespace: string; name: string } | null>(null);

  // Derive a stable key string from the current agent ref
  const agentKey = () => {
    const ref = agentRef();
    return ref ? `${ref.namespace}/${ref.name}` : null;
  };

  // Track EventSource connections per agent (keyed by "namespace/name")
  const eventSources = new Map<string, EventSource>();

  // Track sessions that have had at least one message sent (not empty)
  const usedSessions = new Set<string>();

  // ---- Per-agent scoped localStorage helpers ----

  // Load hidden sessions from localStorage (scoped to current agent)
  const loadHidden = () => {
    const key = agentKey();
    if (!key) return;
    try {
      const stored = localStorage.getItem(`agent-console-hidden:${key}`);
      setState("hiddenSessionIds", stored ? JSON.parse(stored) : []);
    } catch {
      setState("hiddenSessionIds", []);
    }
  };

  // Persist hidden sessions (scoped to current agent)
  const saveHidden = () => {
    const key = agentKey();
    if (!key) return;
    try {
      localStorage.setItem(`agent-console-hidden:${key}`, JSON.stringify(state.hiddenSessionIds));
    } catch {
      // ignore
    }
  };

  // Load open tabs + active session from localStorage (scoped to current agent)
  const loadTabs = () => {
    const key = agentKey();
    if (!key) return;
    try {
      const stored = localStorage.getItem(`agent-console-tabs:${key}`);
      if (stored) {
        const data = JSON.parse(stored) as { openTabs: SessionTab[]; activeSessionId: string | null };
        setState("openTabs", data.openTabs || []);
        setState("activeSessionId", data.activeSessionId ?? null);
      } else {
        setState("openTabs", []);
        setState("activeSessionId", null);
      }
    } catch {
      setState("openTabs", []);
      setState("activeSessionId", null);
    }
  };

  // Persist open tabs + active session (scoped to current agent)
  const saveTabs = () => {
    const key = agentKey();
    if (!key) return;
    try {
      localStorage.setItem(`agent-console-tabs:${key}`, JSON.stringify({
        openTabs: state.openTabs,
        activeSessionId: state.activeSessionId,
      }));
    } catch {
      // ignore
    }
  };

  // Don't load anything at init — wait until setAgent() is called with a real agent

  // ==========================================================================
  // EVENT SUBSCRIPTION - Real-time session updates via SSE
  // ==========================================================================

  // Track reconnection attempts per agent
  const reconnectAttempts = new Map<string, number>();
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 1000;

  /** Connect to the agent's /events SSE endpoint for real-time session updates */
  const subscribeToEvents = (namespace: string, name: string) => {
    const key = `${namespace}/${name}`;
    
    // Close any existing connection for this agent before reconnecting
    const existing = eventSources.get(key);
    if (existing) {
      existing.close();
      eventSources.delete(key);
    }

    const url = `${API_BASE}/api/v1/agents/${namespace}/${name}/events`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      // Reset reconnect counter on successful connection
      reconnectAttempts.set(key, 0);
      setEventBusConnected(true);
    };

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as { type: string; properties: Record<string, unknown> };
        handleSessionEvent(event);
        // Dispatch to event bus for external consumers (e.g., active chat stream in api.ts)
        dispatchEvent(event);
      } catch {
        // Ignore parse errors (non-session events, heartbeats, etc.)
      }
    };

    eventSource.onerror = () => {
      // Close the failed connection explicitly
      eventSource.close();
      eventSources.delete(key);
      setEventBusConnected(false);

      // Only reconnect if this is still the active agent
      const currentKey = agentKey();
      if (currentKey !== key) return;

      const attempts = reconnectAttempts.get(key) || 0;
      if (attempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.set(key, attempts + 1);
        const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempts), 30000);
        setTimeout(() => {
          // Re-check we're still the active agent before reconnecting
          if (agentKey() === key) {
            subscribeToEvents(namespace, name);
          }
        }, delay);
      } else {
        console.warn(`[sessions] SSE reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts for ${key}`);
      }
    };
    
    // Store the connection
    eventSources.set(key, eventSource);
  };

  /** Handle an SSE event that may affect sessions */
  const handleSessionEvent = (event: { type: string; properties: Record<string, unknown> }) => {
    switch (event.type) {
      case 'session.updated': {
        const info = event.properties.info as Session | undefined;
        if (!info?.id) return;

        // Update session in the sessions list
        setState("sessions", (sessions) =>
          sessions.map((s) => (s.id === info.id ? info : s))
        );

        // Update tab title if this session is open as a tab
        const tab = state.openTabs.find((t) => t.sessionId === info.id);
        if (tab && info.title && info.title !== tab.title) {
          // Only update if it's a real title (not empty/generic)
          if (!isGenericTitle(info.title)) {
            updateTabTitle(info.id, info.title);
          }
        }
        break;
      }

      case 'session.created': {
        const info = event.properties.info as Session | undefined;
        if (!info?.id) return;

        // Add to sessions list if not already present
        const exists = state.sessions.some((s) => s.id === info.id);
        if (!exists) {
          setState("sessions", (sessions) => {
            const updated = [info, ...sessions];
            return updated.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
          });
        }
        break;
      }

      case 'session.deleted': {
        const info = event.properties.info as Session | undefined;
        if (!info?.id) return;

        // Remove from sessions list
        setState("sessions", (sessions) => sessions.filter((s) => s.id !== info.id));

        // Close tab if open
        if (state.openTabs.some((t) => t.sessionId === info.id)) {
          closeTab(info.id);
        }
        break;
      }
    }
  };

  /** Disconnect from SSE events for a specific agent */
  const disconnectEvents = (namespace?: string, name?: string) => {
    if (namespace && name) {
      const key = `${namespace}/${name}`;
      const eventSource = eventSources.get(key);
      if (eventSource) {
        eventSource.close();
        eventSources.delete(key);
      }
    } else {
      // Disconnect all if no agent specified
      eventSources.forEach(es => es.close());
      eventSources.clear();
    }
    // Update event bus status — if no connections remain, we're disconnected
    if (eventSources.size === 0) {
      setEventBusConnected(false);
    }
  };

  // Clean up on disposal
  onCleanup(() => {
    disconnectEvents(); // Close all connections
  });

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /** Check if a title is a generic/ugly auto-generated one */
  const isGenericTitle = (title: string) => {
    if (!title) return true;
    if (title.startsWith("console-user_") || title.startsWith("console-")) return true;
    if (title === "New conversation") return true;
    return false;
  };

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  /** Set the agent to manage sessions for, fetch sessions, and subscribe to events.
   *  Saves the current agent's tab/session state and restores the target agent's state. */
  const setAgent = (namespace: string, name: string) => {
    const current = agentRef();
    if (current && current.namespace === namespace && current.name === name) return;

    // 1. Save current agent's state before switching
    if (current) {
      saveTabs();
      saveHidden();
      // Disconnect old agent's SSE connection to avoid leaked connections
      disconnectEvents(current.namespace, current.name);
    }

    // 2. Switch to the new agent
    setAgentRef({ namespace, name });

    // 3. Clear in-memory tracking (session IDs from old agent are meaningless)
    usedSessions.clear();

    // 4. Restore the new agent's persisted state (tabs, active session, hidden)
    loadTabs();
    loadHidden();

    // 5. Fetch sessions from the new agent's backend and subscribe to SSE
    fetchSessions();
    subscribeToEvents(namespace, name);
  };

  /** Fetch all sessions from the backend */
  const fetchSessions = async () => {
    const ref = agentRef();
    if (!ref) return;

    setState("loading", true);
    setState("error", null);

    try {
      const sessions = await listSessions(ref.namespace, ref.name);
      // Sort by updated time descending (most recent first)
      const sorted = [...sessions].sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
      setState("sessions", sorted);
    } catch (err) {
      setState("error", err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setState("loading", false);
    }
  };

  /** Open a session (set as active and add to tabs) */
  const openSession = (sessionId: string) => {
    setState("activeSessionId", sessionId);

    // Sessions opened from history already have messages — mark as used
    usedSessions.add(sessionId);

    // Add to tabs if not already there
    if (!state.openTabs.some((t) => t.sessionId === sessionId)) {
      const session = state.sessions.find((s) => s.id === sessionId);
      const tab: SessionTab = {
        sessionId,
        title: session?.title || "Chat",
      };
      setState("openTabs", [...state.openTabs, tab]);
      saveTabs();
    }
  };

  /** Start a new chat - creates session on backend and opens it */
  const startNewChat = async (): Promise<string | null> => {
    const ref = agentRef();
    if (!ref) return null;

    try {
      const result = await apiCreateSession(ref.namespace, ref.name);
      const newSessionId = result.id;

      // Add to tabs and activate
      const tab: SessionTab = {
        sessionId: newSessionId,
        title: "New chat",
      };
      setState("openTabs", [...state.openTabs, tab]);
      setState("activeSessionId", newSessionId);
      saveTabs();

      // Refresh session list
      await fetchSessions();

      return newSessionId;
    } catch (err) {
      setState("error", err instanceof Error ? err.message : "Failed to create session");
      return null;
    }
  };

  /** Close a tab. If the session was never used (no messages sent), delete it from the backend. */
  const closeTab = (sessionId: string) => {
    const wasUnused = !usedSessions.has(sessionId);

    setState("openTabs", state.openTabs.filter((t) => t.sessionId !== sessionId));
    saveTabs();

    // If we closed the active tab, switch to the last remaining tab or go to recent view
    if (state.activeSessionId === sessionId) {
      const remaining = state.openTabs.filter((t) => t.sessionId !== sessionId);
      setState("activeSessionId", remaining.length > 0 ? remaining[remaining.length - 1].sessionId : null);
    }

    // Clean up empty session from backend (fire-and-forget)
    if (wasUnused) {
      const ref = agentRef();
      if (ref) {
        apiDeleteSession(ref.namespace, ref.name, sessionId).catch(() => {
          // Ignore errors — session may already be gone
        });
        setState("sessions", state.sessions.filter((s) => s.id !== sessionId));
      }
      usedSessions.delete(sessionId);
    }
  };

  /** Switch to a specific tab */
  const switchTab = (sessionId: string) => {
    setState("activeSessionId", sessionId);
  };

  /** Go back to the recent chats view (no active session) */
  const goToRecent = () => {
    setState("activeSessionId", null);
  };

  /** Delete a session */
  const removeSession = async (sessionId: string) => {
    const ref = agentRef();
    if (!ref) return;

    try {
      await apiDeleteSession(ref.namespace, ref.name, sessionId);

      // Remove from sessions list
      setState("sessions", state.sessions.filter((s) => s.id !== sessionId));

      // Remove from tabs if open
      closeTab(sessionId);

      // Remove from hidden
      setState("hiddenSessionIds", state.hiddenSessionIds.filter((id) => id !== sessionId));
      saveHidden();
    } catch (err) {
      setState("error", err instanceof Error ? err.message : "Failed to delete session");
    }
  };

  /** Hide a session from the recent list (does not delete) */
  const hideSession = (sessionId: string) => {
    if (!state.hiddenSessionIds.includes(sessionId)) {
      setState("hiddenSessionIds", [...state.hiddenSessionIds, sessionId]);
      saveHidden();
    }
  };

  /** Update a tab's title (e.g., when session.updated event arrives) */
  const updateTabTitle = (sessionId: string, title: string) => {
    setState(
      "openTabs",
      state.openTabs.map((t) => (t.sessionId === sessionId ? { ...t, title } : t))
    );
    saveTabs();
  };

  /** Mark a session as used (has had at least one message sent) */
  const markSessionUsed = (sessionId: string) => {
    usedSessions.add(sessionId);
  };

  /** Refresh sessions after a chat completes and sync tab titles (fallback for non-SSE) */
  const refreshAfterChat = async () => {
    await fetchSessions();
    // Sync tab titles from refreshed session data
    for (const tab of state.openTabs) {
      const session = state.sessions.find((s) => s.id === tab.sessionId);
      if (session && session.title && session.title !== tab.title) {
        if (!isGenericTitle(session.title)) {
          updateTabTitle(tab.sessionId, session.title);
        }
      }
    }
  };

  /** Get visible sessions (not hidden, and filter out empty unused sessions) */
  const visibleSessions = () =>
    state.sessions.filter((s) => {
      // Never show hidden sessions
      if (state.hiddenSessionIds.includes(s.id)) return false;
      // Always show sessions that are open as tabs
      if (state.openTabs.some((t) => t.sessionId === s.id)) return true;
      // Filter out sessions that look empty/unused:
      // - created == updated means nothing happened after creation
      // - no summary data (no file changes)
      // - title is generic/empty
      const isEmpty =
        s.time?.created === s.time?.updated &&
        !s.summary &&
        (!s.title || isGenericTitle(s.title));
      return !isEmpty;
    });

  return {
    state,
    // Getters
    visibleSessions,
    // Actions
    setAgent,
    fetchSessions,
    openSession,
    startNewChat,
    closeTab,
    switchTab,
    goToRecent,
    removeSession,
    hideSession,
    updateTabTitle,
    markSessionUsed,
    refreshAfterChat,
  };
}

export const sessionStore = createRoot(createSessionStore);
