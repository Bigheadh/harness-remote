import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "../tasks/store.js";
import type { UserStore } from "../auth/store.js";
import { authenticate, authorize } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";
import { renderDashboardHTML } from "./templates/dashboard.js";

/**
 * Register dashboard routes.
 *
 * The dashboard is served at GET /dashboard. Authentication is done via:
 *   - Bearer token in Authorization header, OR
 *   - ?token= query parameter (for browser access)
 *
 * Supports both super admin personalToken and per-user tokens.
 */
export function registerDashboardRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
  publicBaseUrl: string,
  userStore?: UserStore,
): void {
  server.get("/dashboard", async (req: FastifyRequest, reply: FastifyReply) => {
    // Authenticate: try header first, then query param
    let authCtx: { role: "admin" | "operator" | "viewer"; isSuperAdmin: boolean; user?: { id: string; username: string; token: string; role: "admin" | "operator" | "viewer"; feishuUserId?: string; createdAt: string; updatedAt: string } } | undefined;

    const authHeader = req.headers["authorization"];
    if (authHeader) {
      try {
        authCtx = await authenticate(authHeader, personalToken, userStore);
      } catch {
        // Fall through to query param check
      }
    }

    if (!authCtx) {
      const queryToken = (req.query as Record<string, string | undefined>)?.token;
      if (queryToken) {
        try {
          authCtx = await authenticate(`Bearer ${queryToken}`, personalToken, userStore);
        } catch {
          // Invalid token
        }
      }
    }

    if (!authCtx) {
      return reply.code(401).send({
        error: {
          code: "unauthorized",
          message: "Access the dashboard with ?token=<your-token> or Authorization: Bearer <token>",
        },
      });
    }

    // Check dashboard.read permission
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const html = renderDashboardHTML(publicBaseUrl, personalToken);
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .send(html);
  });

  // Dashboard API: task stats (used by dashboard health indicator)
  server.get("/dashboard/stats", async (req: FastifyRequest, reply: FastifyReply) => {
    let authCtx: { role: "admin" | "operator" | "viewer"; isSuperAdmin: boolean; user?: { id: string; username: string; token: string; role: "admin" | "operator" | "viewer"; feishuUserId?: string; createdAt: string; updatedAt: string } } | undefined;

    const authHeader = req.headers["authorization"];
    if (authHeader) {
      try {
        authCtx = await authenticate(authHeader, personalToken, userStore);
      } catch {
        // Fall through
      }
    }
    if (!authCtx) {
      const queryToken = (req.query as Record<string, string | undefined>)?.token;
      if (queryToken) {
        try {
          authCtx = await authenticate(`Bearer ${queryToken}`, personalToken, userStore);
        } catch {
          // Invalid
        }
      }
    }
    if (!authCtx) {
      return reply.code(401).send({
        error: { code: "unauthorized", message: "Unauthorized" },
      });
    }

    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const counts = await store.countTasksByStatus();
    return reply.send(counts);
  });
}
