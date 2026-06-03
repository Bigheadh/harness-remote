/**
 * Fastify middleware that records API usage analytics.
 *
 * Runs AFTER authentication hooks, so `req.authCtx` is available.
 * Derives a caller identity from the auth context, deviceId query param,
 * or IP fallback, then records the request on response.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import type { ApiUsageStore } from "./store.js";

/**
 * Normalize a URL path for metric labels.
 * Strips query params and replaces UUID/ID segments with :id.
 */
function normalizePath(path: string): string {
  let normalized = path.split("?")[0];
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ":id",
  );
  normalized = normalized.replace(/task_[a-zA-Z0-9_]+/g, ":id");
  normalized = normalized.replace(/\/\d+/g, "/:id");
  return normalized;
}

/**
 * Derive a caller ID from the request context.
 * Priority: deviceId > user.id > token hash > IP
 */
function deriveCallerId(
  req: FastifyRequest,
  authCtx?: { user?: { id: string }; isSuperAdmin: boolean },
): string {
  const deviceId = (req.query as Record<string, unknown>)?.deviceId;
  if (typeof deviceId === "string" && deviceId.trim() !== "") {
    return `device:${deviceId.trim()}`;
  }

  if (authCtx?.user?.id) {
    return `user:${authCtx.user.id}`;
  }

  const authHeader = req.headers["authorization"];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const hash = createHash("sha256").update(token).digest("hex").slice(0, 16);
    return `token:${hash}`;
  }

  return `ip:${req.ip}`;
}

export function registerUsageTrackingHook(
  server: FastifyInstance,
  usageStore: ApiUsageStore,
): void {
  // Hook into onRequest to capture start time
  server.addHook("onRequest", async (req) => {
    (req as FastifyRequest & { usageStartTime: number }).usageStartTime = Date.now();
  });

  // Hook into onResponse to record usage
  server.addHook("onResponse", async (req, reply) => {
    const startTime = (req as FastifyRequest & { usageStartTime: number }).usageStartTime;
    const durationMs = startTime ? Date.now() - startTime : 0;

    // Only track /api/* and /feishu/* routes
    const url = req.url.split("?")[0];
    if (!url.startsWith("/api/") && !url.startsWith("/feishu/")) {
      return;
    }

    const authCtx = (req as FastifyRequest & {
      authCtx?: { user?: { id: string }; isSuperAdmin: boolean };
    }).authCtx;

    const callerId = deriveCallerId(req, authCtx);
    const normalizedPath = normalizePath(req.url);

    try {
      usageStore.recordRequest(
        callerId,
        req.method,
        normalizedPath,
        reply.statusCode,
        durationMs,
      );
    } catch (_err) {
      // Don't let usage tracking failures affect the response
    }
  });
}
