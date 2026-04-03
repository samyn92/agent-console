/**
 * Global Agent Events Store
 *
 * Connects to the multiplexed SSE endpoint `/api/v1/agents/events` to receive
 * real-time events from ALL agents via a single connection. Maintains lightweight
 * status for each agent (connected, busy session count) and forwards events for
 * the selected agent to the session store.
 *
 * This replaces the per-agent EventSource connections previously managed by
 * sessions.ts.
 */

import { createRoot, onCleanup } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { dispatch as dispatchEvent, setConnected as setEventBusConnected } from "../lib/event-bus";

// API base for EventSource (same as in api.ts)
const API_BASE = import.meta.env.DEV ? 'http://localhost:9090' : '';

// =============================================================================
// TYPES
// =============================================================================

export interface AgentStatus {
  namespace: string;
  name: string;
  /** Whether the global SSE reports this agent's stream as connected */
  connected: boolean;
  /** Number of busy sessions for this agent */
  busySessions: number;
  /** Whether any session has an error */
  hasError: boolean;
  /** Whether any session is waiting for permission */
  hasPendingPermission: boolean;
}

/** Envelope from the backend global SSE */
interface AgentEventEnvelope {
  namespace: string;
  name: string;
  event: string;
  data: unknown;
}

/** Connection status event from backend */
interface AgentConnectionStatus {
  namespace: string;
  name: string;
  connected: boolean;
}

interface GlobalEventsState {
  /** Per-agent status map, keyed by "namespace/name" */
  agents: Record<string, AgentStatus>;
  /** Whether the global SSE connection is active */
  connected: boolean;
}

// Callback type for forwarding events to the session store
type AgentEventCallback = (event: { type: string; properties: Record<string, unknown> }) => void;

// =============================================================================
// STORE
// =============================================================================

function createGlobalEventsStore() {
  const [state, setState] = createStore<GlobalEventsState>({
    agents: {},
    connected: false,
  });

  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 15;
  const BASE_RECONNECT_DELAY = 1000;

  /** Timestamp of the last received SSE event (any type, including heartbeats) */
  let lastEventTime = 0;

  /**
   * How long without events before we consider the connection stale (ms).
   * If the backend sends heartbeats every ~30s, 60s of silence means
   * we've missed at least one heartbeat and the connection is likely dead.
   */
  const STALE_THRESHOLD = 60_000;

  // Selected agent key — events for this agent are forwarded to the session store
  let selectedAgentKey: string | null = null;
  let eventCallback: AgentEventCallback | null = null;

  // ---- Helpers ----

  const agentKey = (ns: string, name: string) => `${ns}/${name}`;

  const ensureAgent = (namespace: string, name: string) => {
    const key = agentKey(namespace, name);
    if (!state.agents[key]) {
      setState("agents", key, {
        namespace,
        name,
        connected: false,
        busySessions: 0,
        hasError: false,
        hasPendingPermission: false,
      });
    }
  };

  // ---- Event handling ----

  const handleAgentEvent = (envelope: AgentEventEnvelope) => {
    const key = agentKey(envelope.namespace, envelope.name);
    ensureAgent(envelope.namespace, envelope.name);

    // Parse the inner event (from the agent's OpenCode SSE)
    const innerEvent = envelope.data as { type?: string; properties?: Record<string, unknown> } | undefined;
    if (!innerEvent?.type) return;

    // Update lightweight agent status based on event type
    switch (innerEvent.type) {
      case 'session.status': {
        const status = innerEvent.properties?.status as { type: string } | undefined;
        if (status?.type === 'busy') {
          // Increment busy count (we track a simple count, not per-session)
          setState("agents", key, "busySessions", (n) => n + 1);
        } else if (status?.type === 'idle') {
          setState("agents", key, "busySessions", (n) => Math.max(0, n - 1));
        }
        break;
      }
      case 'session.error': {
        setState("agents", key, "hasError", true);
        break;
      }
      case 'permission.asked': {
        setState("agents", key, "hasPendingPermission", true);
        break;
      }
      case 'permission.replied': {
        setState("agents", key, "hasPendingPermission", false);
        break;
      }
      case 'session.idle': {
        // Clear error/pending on idle
        setState("agents", key, "hasError", false);
        break;
      }
    }

    // Forward to session store if this is the selected agent
    if (key === selectedAgentKey && eventCallback) {
      eventCallback(innerEvent as { type: string; properties: Record<string, unknown> });
      // Also dispatch to event bus for external consumers (e.g., active chat stream in api.ts)
      dispatchEvent(innerEvent as { type: string; properties: Record<string, unknown> });
    }
  };

  const handleConnectionStatus = (status: AgentConnectionStatus) => {
    const key = agentKey(status.namespace, status.name);
    ensureAgent(status.namespace, status.name);
    setState("agents", key, "connected", status.connected);

    // If disconnected, reset busy count (we'll get fresh data on reconnect)
    if (!status.connected) {
      setState("agents", key, "busySessions", 0);
    }
  };

  const handleAgentAdded = (data: { namespace: string; name: string }) => {
    ensureAgent(data.namespace, data.name);
  };

  const handleAgentRemoved = (data: { namespace: string; name: string }) => {
    const key = agentKey(data.namespace, data.name);
    setState("agents", produce((agents) => {
      delete agents[key];
    }));
  };

  // ---- SSE connection ----

  const connect = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    const url = `${API_BASE}/api/v1/agents/events`;
    const es = new EventSource(url);

    es.addEventListener("connected", () => {
      reconnectAttempts = 0;
      lastEventTime = Date.now();
      setState("connected", true);
      setEventBusConnected(true);
    });

    es.addEventListener("agent.event", (e) => {
      try {
        lastEventTime = Date.now();
        const envelope = JSON.parse((e as MessageEvent).data) as AgentEventEnvelope;
        handleAgentEvent(envelope);
      } catch {
        // Ignore parse errors
      }
    });

    es.addEventListener("agent.connected", (e) => {
      try {
        lastEventTime = Date.now();
        const status = JSON.parse((e as MessageEvent).data) as AgentConnectionStatus;
        handleConnectionStatus(status);
      } catch {}
    });

    es.addEventListener("agent.disconnected", (e) => {
      try {
        lastEventTime = Date.now();
        const status = JSON.parse((e as MessageEvent).data) as AgentConnectionStatus;
        handleConnectionStatus(status);
      } catch {}
    });

    es.addEventListener("agent.added", (e) => {
      try {
        lastEventTime = Date.now();
        const data = JSON.parse((e as MessageEvent).data) as { namespace: string; name: string };
        handleAgentAdded(data);
      } catch {}
    });

    es.addEventListener("agent.removed", (e) => {
      try {
        lastEventTime = Date.now();
        const data = JSON.parse((e as MessageEvent).data) as { namespace: string; name: string };
        handleAgentRemoved(data);
      } catch {}
    });

    es.addEventListener("heartbeat", () => {
      // Heartbeat received — connection is alive
      lastEventTime = Date.now();
    });

    es.onerror = () => {
      es.close();
      eventSource = null;
      setState("connected", false);
      setEventBusConnected(false);

      // Reconnect with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(() => {
          connect();
        }, delay);
      } else {
        console.warn(`[globalEvents] SSE reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
      }
    };

    eventSource = es;
  };

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    setState("connected", false);
    setEventBusConnected(false);
  };

  // Clean up on disposal
  onCleanup(() => {
    disconnect();
  });

  // ---- Visibility change handler ----
  // When the page is backgrounded (mobile or desktop), the SSE connection
  // may silently die. When the user returns, check if the connection is stale
  // and reconnect proactively instead of waiting for onerror (which may never fire).
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      const now = Date.now();
      const timeSinceLastEvent = now - lastEventTime;
      const isStale = lastEventTime > 0 && timeSinceLastEvent > STALE_THRESHOLD;

      if (isStale || (eventSource && eventSource.readyState === EventSource.CLOSED)) {
        // Connection is stale or closed — force reconnect
        reconnectAttempts = 0; // Reset backoff since this is a fresh user interaction
        connect();
      }
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  onCleanup(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  // ---- Public API ----

  return {
    state,

    /** Start the global SSE connection */
    connect,

    /** Stop the global SSE connection */
    disconnect,

    /** Set the selected agent — events for this agent will be forwarded to the callback */
    setSelectedAgent(namespace: string, name: string, callback: AgentEventCallback) {
      selectedAgentKey = agentKey(namespace, name);
      eventCallback = callback;
    },

    /** Clear the selected agent */
    clearSelectedAgent() {
      selectedAgentKey = null;
      eventCallback = null;
    },

    /** Get status for a specific agent */
    getAgentStatus(namespace: string, name: string): AgentStatus | undefined {
      return state.agents[agentKey(namespace, name)];
    },

    /** Get all agent statuses as an array */
    get agentStatuses(): AgentStatus[] {
      return Object.values(state.agents);
    },

    /** Check if any agent has busy sessions */
    get hasAnyBusy(): boolean {
      return Object.values(state.agents).some(a => a.busySessions > 0);
    },
  };
}

export const globalEventsStore = createRoot(createGlobalEventsStore);
