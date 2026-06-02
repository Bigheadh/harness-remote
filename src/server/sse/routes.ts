import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate, authorize } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";
import { addClient, removeClient, getClientCount } from "./broadcaster.js";
import type { SseEventType } from "./broadcaster.js";

/**
 * Register SSE streaming endpoint for real-time task updates.
 *
 * GET /api/tasks/stream
 * Query params:
 *   - events: comma-separated list of event types to subscribe to (optional, default: all)
 *
 * Events:
 *   - task.created
 *   - task.updated
 *   - task.deleted
 *   - task.status_changed
 *   - task.result_reported
 *   - task.assigned
 *   - heartbeat (every 30s)
 *   - connected (initial)
 */
export function registerSseRoutes(
  server: FastifyInstance,
  personalToken: string,
): void {
  // GET /api/tasks/stream - SSE endpoint
  server.get("/api/tasks/stream", async (req: FastifyRequest, reply: FastifyReply) => {
    // Authenticate via query param or header (SSE can't set custom headers in browser)
    const queryToken =
      (req.query as Record<string, string>).token ??
      (req.query as Record<string, string>).personalToken;
    const authHeader = req.headers["authorization"];
    const tokenValue = authHeader
      ? authHeader.replace(/^Bearer\s+/i, "").trim()
      : queryToken;

    if (!tokenValue || tokenValue !== personalToken) {
      return reply.code(401).send({
        error: { code: "unauthorized", message: "Missing or invalid bearer token" },
      });
    }

    // Parse optional event filter
    const queryEvents = (req.query as Record<string, string>).events;
    let subscribedEvents: SseEventType[] | undefined;
    if (queryEvents) {
      subscribedEvents = queryEvents
        .split(",")
        .map((e) => e.trim()) as SseEventType[];
    }

    const clientId = addClient(reply, subscribedEvents);

    // Clean up on client disconnect
    req.raw.on("close", () => {
      removeClient(clientId);
    });

    // Prevent Fastify from closing the response
    return reply;
  });

  // GET /api/sse/status - check SSE connection count (requires auth)
  server.get("/api/sse/status", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx?: unknown }).authCtx;
    if (!authCtx) {
      return reply.code(401).send({
        error: { code: "unauthorized", message: "Missing or invalid bearer token" },
      });
    }
    return reply.send({
      connectedClients: getClientCount(),
      uptime: process.uptime(),
    });
  });
}
