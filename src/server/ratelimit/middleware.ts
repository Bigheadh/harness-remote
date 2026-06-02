/**
 * Fastify middleware that applies rate limiting per user/device.
 *
 * After authentication, the limiter key is derived from:
 * 1. The authenticated user's ID (if RBAC is enabled)
 * 2. The "deviceId" query parameter (if present)
 * 3. The raw Bearer token hash (fallback for super admin)
 *
 * Rate limit headers are added to every response:
 * - X-RateLimit-Limit: max requests in window
 * - X-RateLimit-Remaining: requests left in current window
 * - X-RateLimit-Reset: UTC epoch seconds when window resets
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import type { RateLimiter } from "./limiter.js";

/**
 * Derive a rate limit key from the request context.
 * Uses a stable, non-reversible identifier for each caller.
 */
function deriveKey(req: FastifyRequest, authCtx?: { user?: { id: string }; isSuperAdmin: boolean; role?: string }): string {
  // Prefer device ID if present (device-specific rate limiting)
  const deviceId = (req.query as Record<string, unknown>)?.deviceId;
  if (typeof deviceId === "string" && deviceId.trim() !== "") {
    return `device:${deviceId.trim()}`;
  }

  // Prefer user ID if RBAC is active
  if (authCtx?.user?.id) {
    return `user:${authCtx.user.id}`;
  }

  // Fallback: hash the bearer token for super admin
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const hash = createHash("sha256").update(token).digest("hex").slice(0, 16);
    return `token:${hash}`;
  }

  // Last resort: use IP
  return `ip:${req.ip}`;
}

export function registerRateLimitHook(
  server: FastifyInstance,
  limiter: RateLimiter,
): void {
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    // Only rate-limit /api/* routes (skip health, feishu events, dashboard)
    if (!req.url.startsWith("/api/")) {
      return;
    }

    // The auth hook runs first and attaches authCtx — we read it here.
    // Since onRequest hooks run in registration order, this hook must be
    // registered AFTER the auth hook in the task routes module.
    const authCtx = (req as FastifyRequest & {
      authCtx?: { user?: { id: string }; isSuperAdmin: boolean; role?: string };
    }).authCtx;

    const key = deriveKey(req, authCtx);
    const result = limiter.consume(key);

    // Always set rate limit headers
    reply.header("X-RateLimit-Limit", result.limit);
    reply.header("X-RateLimit-Remaining", result.remaining);
    reply.header("X-RateLimit-Reset", Math.ceil(result.resetMs / 1000));

    if (!result.allowed) {
      reply.code(429).send({
        error: {
          code: "rate_limited",
          message: `Rate limit exceeded. Try again after ${new Date(result.resetMs).toISOString()}`,
        },
      });
    }
  });
}
