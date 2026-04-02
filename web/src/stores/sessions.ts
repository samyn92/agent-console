import { createSignal, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { listSessions, deleteSession as apiDeleteSession, createSession as apiCreateSession } from "../lib/api";
import { globalEventsStore } from "./globalEvents";
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
  /** Session IDs that are currently busy (agent is processing) */
  busySessionIds: string[];
  /** Session IDs with unseen activity (updated while not active) */
  unseenSessionIds: string[];
  /** Session IDs currently retrying, mapped to attempt count */
  retrySessionIds: Record<string, number>;
  /** Session IDs with errors */
  errorSessionIds: string[];
  /** Session IDs waiting for user permission approval */
  pendingPermissionIds: string[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
}

// =============================================================================
// STORE
// =============================================================================

function createSessionStore() {
  const [state, setState] = createStore<SessionState>({
    sessions: [],
    activeSessionId: null,
    openTabs: [],
    hiddenSessionIds: [],
    busySessionIds: [],
    unseenSessionIds: [],
    retrySessionIds: {},
    errorSessionIds: [],
    pendingPermissionIds: [],
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

  // Track sessions that have had at least one message sent (not empty)
  const usedSessions = new Set<string>();

  // Track sessions for which we've already issued a DELETE request,
  // to prevent duplicate DELETE calls from closeTab() or SSE handlers.
  const deletedSessions = new Set<string>();

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

  // Load unseen session IDs from localStorage (scoped to current agent)
  const loadUnseen = () => {
    const key = agentKey();
    if (!key) return;
    try {
      const stored = localStorage.getItem(`agent-console-unseen:${key}`);
      setState("unseenSessionIds", stored ? JSON.parse(stored) : []);
    } catch {
      setState("unseenSessionIds", []);
    }
  };

  // Persist unseen session IDs (scoped to current agent)
  const saveUnseen = () => {
    const key = agentKey();
    if (!key) return;
    try {
      localStorage.setItem(`agent-console-unseen:${key}`, JSON.stringify(state.unseenSessionIds));
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
  // EVENT HANDLING - Receives events from globalEventsStore
  // ==========================================================================

  /** Handle an SSE event that may affect sessions.
   *  Called by globalEventsStore when an event arrives for the selected agent. */
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
        // Remove from busy list
        setState("busySessionIds", (ids) => ids.filter((id) => id !== info.id));

        // Mark as already deleted so closeTab() won't issue another DELETE request.
        deletedSessions.add(info.id);

        // Close tab if open
        if (state.openTabs.some((t) => t.sessionId === info.id)) {
          closeTab(info.id);
        }
        break;
      }

      case 'session.status': {
        const sessionID = event.properties.sessionID as string | undefined;
        const status = event.properties.status as { type: string; attempt?: number } | undefined;
        if (!sessionID) return;

        if (status?.type === 'busy') {
          // Add to busy set if not already there
          if (!state.busySessionIds.includes(sessionID)) {
            setState("busySessionIds", (ids) => [...ids, sessionID]);
          }
          // Clear retry/error when busy (agent recovered)
          setState("retrySessionIds", { ...state.retrySessionIds, [sessionID]: undefined } as any);
          setState("errorSessionIds", (ids) => ids.filter((id) => id !== sessionID));
        } else if (status?.type === 'idle') {
          setState("busySessionIds", (ids) => ids.filter((id) => id !== sessionID));
          setState("retrySessionIds", { ...state.retrySessionIds, [sessionID]: undefined } as any);
        } else if (status?.type === 'retry') {
          setState("retrySessionIds", { ...state.retrySessionIds, [sessionID]: status.attempt || 1 });
        }
        break;
      }

      case 'session.idle': {
        const sessionID = event.properties.sessionID as string | undefined;
        if (!sessionID) return;
        setState("busySessionIds", (ids) => ids.filter((id) => id !== sessionID));
        setState("retrySessionIds", { ...state.retrySessionIds, [sessionID]: undefined } as any);
        // Mark as unseen if this isn't the active session
        if (state.activeSessionId !== sessionID) {
          if (!state.unseenSessionIds.includes(sessionID)) {
            setState("unseenSessionIds", (ids) => [...ids, sessionID]);
            saveUnseen();
          }
        }
        break;
      }

      case 'session.error': {
        const sessionID = event.properties.sessionID as string | undefined;
        if (!sessionID) return;
        if (!state.errorSessionIds.includes(sessionID)) {
          setState("errorSessionIds", (ids) => [...ids, sessionID]);
        }
        setState("busySessionIds", (ids) => ids.filter((id) => id !== sessionID));
        // Mark as unseen
        if (state.activeSessionId !== sessionID) {
          if (!state.unseenSessionIds.includes(sessionID)) {
            setState("unseenSessionIds", (ids) => [...ids, sessionID]);
            saveUnseen();
          }
        }
        break;
      }

      case 'permission.asked': {
        const sessionID = event.properties.sessionID as string | undefined;
        if (!sessionID) return;
        if (!state.pendingPermissionIds.includes(sessionID)) {
          setState("pendingPermissionIds", (ids) => [...ids, sessionID]);
        }
        // Mark as unseen if not active
        if (state.activeSessionId !== sessionID) {
          if (!state.unseenSessionIds.includes(sessionID)) {
            setState("unseenSessionIds", (ids) => [...ids, sessionID]);
            saveUnseen();
          }
        }
        break;
      }

      case 'permission.replied': {
        const sessionID = event.properties.sessionID as string | undefined;
        if (!sessionID) return;
        setState("pendingPermissionIds", (ids) => ids.filter((id) => id !== sessionID));
        break;
      }

      case 'message.updated': {
        const info = event.properties.info as { sessionID?: string } | undefined;
        const sessionID = info?.sessionID;
        if (!sessionID) return;
        // Mark as unseen if this isn't the active session
        if (state.activeSessionId !== sessionID) {
          if (!state.unseenSessionIds.includes(sessionID)) {
            setState("unseenSessionIds", (ids) => [...ids, sessionID]);
            saveUnseen();
          }
        }
        break;
      }
    }
  };

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

  /** Set the agent to manage sessions for, fetch sessions, and register with global events.
   *  Saves the current agent's tab/session state and restores the target agent's state. */
  const setAgent = (namespace: string, name: string) => {
    const current = agentRef();
    if (current && current.namespace === namespace && current.name === name) return;

    // 1. Save current agent's state before switching
    if (current) {
      saveTabs();
      saveHidden();
      saveUnseen();
    }

    // 2. Switch to the new agent
    setAgentRef({ namespace, name });

    // 3. Clear ALL in-memory state (old agent's data is meaningless for new agent)
    usedSessions.clear();
    deletedSessions.clear();
    setState("sessions", []);
    setState("openTabs", []);
    setState("activeSessionId", null);
    setState("busySessionIds", []);
    setState("unseenSessionIds", []);
    setState("hiddenSessionIds", []);
    setState("retrySessionIds", {});
    setState("errorSessionIds", []);
    setState("pendingPermissionIds", []);

    // 4. Restore the new agent's persisted state (tabs, active session, hidden, unseen)
    loadTabs();
    loadHidden();
    loadUnseen();

    // 5. Register with global events store to receive events for this agent
    globalEventsStore.setSelectedAgent(namespace, name, handleSessionEvent);

    // 6. Fetch sessions from the new agent's backend
    fetchSessions();
  };

  /** Fetch all sessions from the backend */
  const fetchSessions = async () => {
    const ref = agentRef();
    if (!ref) return;

    // Capture agent key at call time to detect if agent changed during await
    const callerKey = `${ref.namespace}/${ref.name}`;

    setState("loading", true);
    setState("error", null);

    try {
      const sessions = await listSessions(ref.namespace, ref.name);

      // If the agent changed while we were awaiting, discard the stale results
      if (agentKey() !== callerKey) return;

      // Sort by updated time descending (most recent first)
      const sorted = [...sessions].sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
      setState("sessions", sorted);

      // Reconcile tabs: remove any open tabs whose session no longer exists on the backend
      const sessionIds = new Set(sorted.map((s) => s.id));
      const staleTabs = state.openTabs.filter((t) => !sessionIds.has(t.sessionId));
      if (staleTabs.length > 0) {
        setState("openTabs", state.openTabs.filter((t) => sessionIds.has(t.sessionId)));
        // If the active session was stale, go to recent view
        if (state.activeSessionId && !sessionIds.has(state.activeSessionId)) {
          const remaining = state.openTabs.filter((t) => sessionIds.has(t.sessionId));
          setState("activeSessionId", remaining.length > 0 ? remaining[remaining.length - 1].sessionId : null);
        }
        saveTabs();
      }

      // Also clean up unseen IDs for sessions that no longer exist
      const staleUnseen = state.unseenSessionIds.filter((id) => !sessionIds.has(id));
      if (staleUnseen.length > 0) {
        setState("unseenSessionIds", (ids) => ids.filter((id) => sessionIds.has(id)));
        saveUnseen();
      }
    } catch (err) {
      // Don't set error if agent changed — it's not relevant anymore
      if (agentKey() !== callerKey) return;
      setState("error", err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      // Only clear loading if we're still on the same agent
      if (agentKey() === callerKey) {
        setState("loading", false);
      }
    }
  };

  /** Open a session (set as active and add to tabs) */
  const openSession = (sessionId: string) => {
    setState("activeSessionId", sessionId);

    // Mark as seen
    if (state.unseenSessionIds.includes(sessionId)) {
      setState("unseenSessionIds", (ids) => ids.filter((id) => id !== sessionId));
      saveUnseen();
    }
    // Clear error state when user opens the session
    setState("errorSessionIds", (ids) => ids.filter((id) => id !== sessionId));

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

    // Capture the agent key at call time to detect if agent changed during await
    const callerKey = `${ref.namespace}/${ref.name}`;

    try {
      const result = await apiCreateSession(ref.namespace, ref.name);
      const newSessionId = result.id;

      // If the agent changed while we were awaiting, discard the result
      const currentKey = agentKey();
      if (currentKey !== callerKey) {
        return null;
      }

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

  /** Close a tab. If the session was never used (no messages sent) and hasn't
   *  already been deleted, delete it from the backend. */
  const closeTab = (sessionId: string) => {
    const wasUnused = !usedSessions.has(sessionId);
    const alreadyDeleted = deletedSessions.has(sessionId);

    setState("openTabs", state.openTabs.filter((t) => t.sessionId !== sessionId));
    saveTabs();

    // If we closed the active tab, switch to the last remaining tab or go to recent view
    if (state.activeSessionId === sessionId) {
      const remaining = state.openTabs.filter((t) => t.sessionId !== sessionId);
      setState("activeSessionId", remaining.length > 0 ? remaining[remaining.length - 1].sessionId : null);
    }

    // Clean up empty session from backend (fire-and-forget),
    // but only if we haven't already issued a DELETE for this session.
    if (wasUnused && !alreadyDeleted) {
      deletedSessions.add(sessionId);
      const ref = agentRef();
      if (ref) {
        apiDeleteSession(ref.namespace, ref.name, sessionId).catch(() => {
          // Ignore errors — session may already be gone
        });
        setState("sessions", state.sessions.filter((s) => s.id !== sessionId));
      }
    }

    usedSessions.delete(sessionId);
    // NOTE: Do NOT clear deletedSessions here. The SSE session.deleted handler
    // can call closeTab() between removeSession()'s await and its own closeTab()
    // call, which would clear the guard and allow a duplicate DELETE.
  };

  /** Switch to a specific tab */
  const switchTab = (sessionId: string) => {
    setState("activeSessionId", sessionId);
    // Mark as seen
    if (state.unseenSessionIds.includes(sessionId)) {
      setState("unseenSessionIds", (ids) => ids.filter((id) => id !== sessionId));
      saveUnseen();
    }
  };

  /** Go back to the recent chats view (no active session) */
  const goToRecent = () => {
    setState("activeSessionId", null);
  };

  /** Delete a session */
  const removeSession = async (sessionId: string) => {
    const ref = agentRef();
    if (!ref) return;

    // Guard: if already being deleted, bail out
    if (deletedSessions.has(sessionId)) {
      return;
    }

    // Mark as deleted BEFORE any async work or closeTab(),
    // so closeTab() and SSE handlers won't issue duplicate DELETEs.
    deletedSessions.add(sessionId);

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

  /** Check if a session is currently busy (agent is processing) */
  const isSessionBusy = (sessionId: string) =>
    state.busySessionIds.includes(sessionId);

  /** Check if a session has unseen activity */
  const isSessionUnseen = (sessionId: string) =>
    state.unseenSessionIds.includes(sessionId);

  /** Get retry attempt count for a session (0 if not retrying) */
  const getSessionRetryAttempt = (sessionId: string): number =>
    state.retrySessionIds[sessionId] || 0;

  /** Check if a session has an error */
  const isSessionError = (sessionId: string) =>
    state.errorSessionIds.includes(sessionId);

  /** Check if a session is waiting for permission approval */
  const isSessionPendingPermission = (sessionId: string) =>
    state.pendingPermissionIds.includes(sessionId);

  /** Handle a session that was not found on the backend (404).
   *  Cleans up the tab and redirects to recent view. */
  const handleSessionNotFound = (sessionId: string) => {
    // Session is already gone on the backend — mark as deleted
    // so closeTab() won't issue a redundant DELETE request.
    deletedSessions.add(sessionId);
    // Remove from sessions list
    setState("sessions", (sessions) => sessions.filter((s) => s.id !== sessionId));
    // Close the tab
    if (state.openTabs.some((t) => t.sessionId === sessionId)) {
      closeTab(sessionId);
    }
    // Clean up tracking state
    setState("busySessionIds", (ids) => ids.filter((id) => id !== sessionId));
    setState("errorSessionIds", (ids) => ids.filter((id) => id !== sessionId));
    setState("unseenSessionIds", (ids) => ids.filter((id) => id !== sessionId));
    setState("pendingPermissionIds", (ids) => ids.filter((id) => id !== sessionId));
    usedSessions.delete(sessionId);
  };

  return {
    state,
    // Getters
    visibleSessions,
    isSessionBusy,
    isSessionUnseen,
    getSessionRetryAttempt,
    isSessionError,
    isSessionPendingPermission,
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
    handleSessionNotFound,
  };
}

export const sessionStore = createRoot(createSessionStore);
