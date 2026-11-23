import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "../tasks/store.js";
import type { UserStore } from "../auth/store.js";
import type { ApiKeyStore } from "../auth/apikeys/store.js";
import { authenticate, authorize, type AuthContext } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";
import {
  renderDashboardHTML,
  renderLoginHTML,
  getDashboardCss,
  getDashboardJs,
} from "./templates/dashboard.js";
import {
  createSessionCookieValue,
  formatClearSessionCookie,
  formatSetSessionCookie,
  readTokenFromSessionCookie,
} from "./session.js";
import { DashboardLoginBodySchema, parseBody } from "../openapi/schemas.js";

const DASHBOARD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

async function resolveDashboardAuth(
  req: FastifyRequest,
  personalToken: string,
  userStore?: UserStore,
  apiKeyStore?: ApiKeyStore,
): Promise<{ authCtx: AuthContext; callerToken: string; fromCookie: boolean } | undefined> {
  // 1. Authorization header
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    try {
      const authCtx = await authenticate(authHeader, personalToken, userStore, apiKeyStore);
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match) {
        return { authCtx, callerToken: match[1].trim(), fromCookie: false };
      }
    } catch {
      // Fall through
    }
  }

  // 2. HttpOnly encrypted session cookie
  const cookieToken = readTokenFromSessionCookie(req.headers["cookie"], personalToken);
  if (cookieToken) {
    try {
      const authCtx = await authenticate(`Bearer ${cookieToken}`, personalToken, userStore, apiKeyStore);
      return { authCtx, callerToken: cookieToken, fromCookie: true };
    } catch {
      // Invalid or revoked token inside cookie — fall through
    }
  }

  // 3. Query parameter ?token= (legacy browser convenience; exchanged into HttpOnly cookie)
  const queryToken = (req.query as Record<string, string | undefined>)?.token;
  if (queryToken) {
    try {
      const authCtx = await authenticate(`Bearer ${queryToken}`, personalToken, userStore, apiKeyStore);
      return { authCtx, callerToken: queryToken.trim(), fromCookie: false };
    } catch {
      // Invalid token
    }
  }

  return undefined;
}

/**
 * Register dashboard routes:
 * - Static assets: GET /dashboard/assets/dashboard.css, /dashboard/assets/dashboard.js
 * - Cookie auth: POST /dashboard/login, POST /dashboard/logout
 * - UI & stats: GET /dashboard, GET /dashboard/stats
 */
export function registerDashboardRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
  publicBaseUrl: string,
  userStore?: UserStore,
  apiKeyStore?: ApiKeyStore,
): void {
  const isHttps = publicBaseUrl.startsWith("https://");

  // Static CSS asset
  server.get("/dashboard/assets/dashboard.css", async (_req, reply) => {
    return reply
      .header("Content-Type", "text/css; charset=utf-8")
      .header("Cache-Control", "public, max-age=300")
      .header("X-Content-Type-Options", "nosniff")
      .send(getDashboardCss());
  });

  // Static JS asset
  server.get("/dashboard/assets/dashboard.js", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/javascript; charset=utf-8")
      .header("Cache-Control", "public, max-age=300")
      .header("X-Content-Type-Options", "nosniff")
      .send(getDashboardJs());
  });

  // POST /dashboard/login — exchange a bearer token for an HttpOnly encrypted session cookie
  server.post("/dashboard/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = parseBody(DashboardLoginBodySchema, req.body, reply);
    if (!parsed) return;
    const rawToken = parsed.token;

    let authCtx: AuthContext;
    try {
      authCtx = await authenticate(`Bearer ${rawToken}`, personalToken, userStore, apiKeyStore);
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        const status = e.code === "forbidden" ? 403 : 401;
        return reply.code(status).send({ error: { code: e.code, message: e.message } });
      }
      return reply.code(401).send({ error: { code: "unauthorized", message: "Invalid token" } });
    }

    const cookieVal = createSessionCookieValue(rawToken, personalToken);
    return reply
      .header("Set-Cookie", formatSetSessionCookie(cookieVal, { secure: isHttps }))
      .header("Cache-Control", "no-store")
      .send({ ok: true, role: authCtx.role });
  });

  // POST /dashboard/logout — clear session cookie
  server.post("/dashboard/logout", async (_req, reply) => {
    return reply
      .header("Set-Cookie", formatClearSessionCookie())
      .header("Cache-Control", "no-store")
      .send({ ok: true });
  });

  // GET /dashboard
  server.get("/dashboard", async (req: FastifyRequest, reply: FastifyReply) => {
    const resolved = await resolveDashboardAuth(req, personalToken, userStore, apiKeyStore);

    if (!resolved) {
      const accept = String(req.headers["accept"] ?? "");
      if (accept.includes("text/html")) {
        return reply
          .code(200)
          .header("Content-Type", "text/html; charset=utf-8")
          .header("Cache-Control", "no-store")
          .header("X-Content-Type-Options", "nosniff")
          .header("X-Frame-Options", "DENY")
          .header("Referrer-Policy", "no-referrer")
          .header("Content-Security-Policy", DASHBOARD_CSP)
          .send(renderLoginHTML());
      }
      return reply.code(401).send({
        error: {
          code: "unauthorized",
          message: "Access the dashboard by signing in at /dashboard, or provide Authorization: Bearer <token>",
        },
      });
    }

    try {
      authorize(resolved.authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    // Set/refresh HttpOnly encrypted session cookie so browser JS never needs raw tokens
    if (!resolved.fromCookie) {
      const cookieVal = createSessionCookieValue(resolved.callerToken, personalToken);
      reply.header("Set-Cookie", formatSetSessionCookie(cookieVal, { secure: isHttps }));
    }

    const html = renderDashboardHTML(publicBaseUrl);
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "no-referrer")
      .header("Content-Security-Policy", DASHBOARD_CSP)
      .send(html);
  });

  // Dashboard API: task stats (used by dashboard health indicator)
  server.get("/dashboard/stats", async (req: FastifyRequest, reply: FastifyReply) => {
    const resolved = await resolveDashboardAuth(req, personalToken, userStore, apiKeyStore);
    if (!resolved) {
      return reply.code(401).send({
        error: { code: "unauthorized", message: "Unauthorized" },
      });
    }

    try {
      authorize(resolved.authCtx, "dashboard.read");
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
