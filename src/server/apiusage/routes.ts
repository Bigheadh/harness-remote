/**
 * API usage analytics routes.
 *
 * GET /api/usage/stats — Aggregated usage statistics per user/device
 * GET /api/usage/entries/:callerId — Raw request entries for a specific caller
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ApiUsageStore } from "./store.js";
import type { UserStore } from "../auth/store.js";
import type { ApiKeyStore } from "../auth/apikeys/store.js";
import { authenticate, authorize } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";

export function registerUsageRoutes(
  server: FastifyInstance,
  usageStore: ApiUsageStore,
  personalToken: string,
  userStore: UserStore | undefined,
  apiKeyStore: ApiKeyStore,
): void {
  // Auth hook for all /api/usage routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith("/api/usage")) {
      try {
        const authCtx = await authenticate(
          req.headers["authorization"],
          personalToken,
          userStore,
          apiKeyStore,
        );
        (req as FastifyRequest & { authCtx?: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx = authCtx;
      } catch (e) {
        if (e instanceof AppError) {
          return reply.code(401).send({
            error: { code: e.code, message: e.message },
          });
        }
        return reply.code(500).send({
          error: { code: "internal_error", message: "Authentication failed" },
        });
      }
    }
  });

  // GET /api/usage/stats — aggregated usage analytics
  server.get("/api/usage/stats", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & {
      authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never;
    }).authCtx;
    try {
      authorize(authCtx, "audit.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
    }

    const query = req.query as Record<string, unknown>;
    const from = typeof query["from"] === "string" ? query["from"] : undefined;
    const to = typeof query["to"] === "string" ? query["to"] : undefined;

    try {
      const stats = usageStore.getStats(from, to);
      return { stats };
    } catch (err) {
      return reply.code(500).send({
        error: { code: "internal_error", message: "Failed to retrieve usage stats" },
      });
    }
  });

  // GET /api/usage/entries/:callerId — raw entries for a specific caller
  server.get("/api/usage/entries/:callerId", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & {
      authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never;
    }).authCtx;
    try {
      authorize(authCtx, "audit.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
    }

    const params = req.params as Record<string, unknown>;
    const callerId = params["callerId"] as string;
    const query = req.query as Record<string, unknown>;
    const limit = typeof query["limit"] === "number" ? query["limit"] : 50;

    try {
      const entries = usageStore.getEntriesForCaller(callerId, limit);
      return { callerId, entries, count: entries.length };
    } catch (err) {
      return reply.code(500).send({
        error: { code: "internal_error", message: "Failed to retrieve usage entries" },
      });
    }
  });
}
