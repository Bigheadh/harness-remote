/**
 * Server-Sent Events broadcaster for real-time task updates.
 *
 * Clients connect via GET /api/tasks/stream and receive events when tasks
 * are created, updated, or deleted.
 */

import type { FastifyReply } from "fastify";
import type { Task } from "../../shared/types.js";

/** Event types sent over SSE */
export type SseEventType =
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "task.status_changed"
  | "task.result_reported"
  | "task.assigned"
  | "connected"
  | "heartbeat";

export interface SseEvent {
  event: SseEventType;
  data: unknown;
}

interface SseClient {
  id: number;
  reply: FastifyReply;
  alive: boolean;
  subscribedEvents?: SseEventType[];
}

let nextClientId = 0;
const clients: Map<number, SseClient> = new Map();

/** Heartbeat interval handle */
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Register a new SSE client.
 * Sets response headers and keeps the connection open.
 */
export function addClient(
  reply: FastifyReply,
  subscribedEvents?: SseEventType[],
): number {
  const id = nextClientId++;

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  });

  // Flush initial headers
  reply.raw.flushHeaders();

  const client: SseClient = { id, reply, alive: true, subscribedEvents };
  clients.set(id, client);

  // Send initial connected event
  sendToClient(client, { event: "connected", data: { clientId: id } });

  // Start heartbeat if not running
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      broadcast({ event: "heartbeat", data: { ts: new Date().toISOString() } });
    }, 30_000);
  }

  return id;
}

/** Remove a client from the pool */
export function removeClient(id: number): void {
  clients.delete(id);
  if (clients.size === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}

/** Get the number of currently connected SSE clients */
export function getClientCount(): number {
  return clients.size;
}

/** Broadcast an event to all connected (or filtered) clients */
export function broadcast(event: SseEvent): void {
  const dead: number[] = [];
  for (const [id, client] of clients) {
    // Filter by subscribed events if specified
    if (
      client.subscribedEvents &&
      client.subscribedEvents.length > 0 &&
      !client.subscribedEvents.includes(event.event)
    ) {
      continue;
    }
    if (!sendToClient(client, event)) {
      dead.push(id);
    }
  }
  for (const id of dead) {
    clients.delete(id);
  }
}

/** Send a single SSE event to a client. Returns false if write failed. */
function sendToClient(client: SseClient, event: SseEvent): boolean {
  try {
    const payload = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
    const ok = client.reply.raw.write(payload);
    if (!ok) {
      client.alive = false;
      return false;
    }
    return true;
  } catch {
    client.alive = false;
    return false;
  }
}

/**
 * Convenience: broadcast task-created event.
 */
export function broadcastTaskCreated(task: Task): void {
  broadcast({ event: "task.created", data: { task } });
}

/**
 * Convenience: broadcast task-updated event.
 */
export function broadcastTaskUpdated(task: Task): void {
  broadcast({ event: "task.updated", data: { task } });
}

/**
 * Convenience: broadcast task-deleted event.
 */
export function broadcastTaskDeleted(taskId: string): void {
  broadcast({ event: "task.deleted", data: { taskId } });
}

/**
 * Convenience: broadcast task status change.
 */
export function broadcastTaskStatusChanged(
  task: Task,
  previousStatus: string,
): void {
  broadcast({
    event: "task.status_changed",
    data: { task, previousStatus },
  });
}

/**
 * Convenience: broadcast task result reported.
 */
export function broadcastTaskResultReported(
  task: Task,
  success: boolean,
  summary: string,
): void {
  broadcast({
    event: "task.result_reported",
    data: { task, success, summary },
  });
}

/**
 * Convenience: broadcast task assigned.
 */
export function broadcastTaskAssigned(task: Task, deviceId: string): void {
  broadcast({
    event: "task.assigned",
    data: { task, deviceId },
  });
}
