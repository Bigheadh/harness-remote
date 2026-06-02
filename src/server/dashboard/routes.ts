import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "../tasks/store.js";
import { requireBearerToken } from "../../shared/http.js";
import { AppError } from "../../shared/errors.js";
import { renderDashboardHTML } from "./templates/dashboard.js";

/**
 * Register dashboard routes.
 *
 * The dashboard is served at GET /dashboard. Authentication is done via:
 *   - Bearer token in Authorization header, OR
 *   - ?token= query parameter (for browser access)
 *
 * The HTML page then uses the existing /api/tasks/* endpoints (with Bearer
 * token in JS fetch) to load data client-side.
 */
export function registerDashboardRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
  publicBaseUrl: string,
): void {
  server.get("/dashboard", async (req: FastifyRequest, reply: FastifyReply) => {
    // Authenticate: try header first, then query param
    let authenticated = false;
    const authHeader = req.headers["authorization"];
    if (authHeader) {
      try {
        requireBearerToken(authHeader, personalToken);
        authenticated = true;
      } catch {
        // Fall through to query param check
      }
    }

    if (!authenticated) {
      const queryToken = (req.query as Record<string, string | undefined>)?.token;
      if (queryToken && queryToken === personalToken) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      return reply.code(401).send({
        error: {
          code: "unauthorized",
          message: "Access the dashboard with ?token=<your-token> or Authorization: Bearer <token>",
        },
      });
    }

    const html = renderDashboardHTML(publicBaseUrl, personalToken);
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .send(html);
  });

  // Dashboard API: task stats (used by dashboard health indicator)
  server.get("/dashboard/stats", async (req: FastifyRequest, reply: FastifyReply) => {
    // Same auth as dashboard
    let authenticated = false;
    const authHeader = req.headers["authorization"];
    if (authHeader) {
      try {
        requireBearerToken(authHeader, personalToken);
        authenticated = true;
      } catch {
        // Fall through
      }
    }
    if (!authenticated) {
      const queryToken = (req.query as Record<string, string | undefined>)?.token;
      if (queryToken && queryToken === personalToken) {
        authenticated = true;
      }
    }
    if (!authenticated) {
      return reply.code(401).send({
        error: { code: "unauthorized", message: "Unauthorized" },
      });
    }

    const counts = await store.countTasksByStatus();
    return reply.send(counts);
  });
}
