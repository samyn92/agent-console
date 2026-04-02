/**
 * Shared SSE event bus for agent events.
 *
 * This module breaks the circular dependency between sessions.ts and api.ts
 * by providing a standalone event dispatcher. The session store registers
 * the active EventSource connection here, and chatWithAgent() subscribes
 * to events through this bus instead of creating its own EventSource.
 *
 * Flow:
 *   sessions.ts -> registers SSE events via dispatch()
 *   api.ts      -> subscribes via subscribe() to receive events
 */

export type AgentEvent = { type: string; properties: Record<string, unknown> };
export type AgentEventListener = (event: AgentEvent) => void;

const listeners = new Set<AgentEventListener>();
let connected = false;

/** Dispatch an event to all subscribers (called by sessions.ts) */
export function dispatch(event: AgentEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Don't let a failing listener break event processing
    }
  }
}

/** Subscribe to agent events. Returns an unsubscribe function (used by api.ts) */
export function subscribe(listener: AgentEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Set connection status (called by sessions.ts when SSE connects/disconnects) */
export function setConnected(value: boolean): void {
  connected = value;
}

/** Check if the SSE connection is active (used by api.ts before subscribing) */
export function isConnected(): boolean {
  return connected;
}
