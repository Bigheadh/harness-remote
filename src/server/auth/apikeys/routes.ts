import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ApiKeyStore } from "./store.js";
import type { UserRole } from "../../../shared/types.js";
import { authenticate, authorize } from "../middleware.js";
import { VALID_ROLES } from "../roles.js";
import { AppError } from "../../../shared/errors.js";
import { createLogger } from "../../../shared/logger.js";
import type { AuditLogStore } from "../../audit/store.js";
import { recordApiKeyOp } from "../../metrics/collector.js";

const log = createLogger({ level: "info" });

/** Default grace period: 24 hours */
const DEFAULT_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export function registerApiKeyRoutes(
  server: FastifyInstance,
  apiKeyStore: ApiKeyStore,
  personalToken: string,
  userStore?: { getUserById(id: string): Promise<{ id: string; role: UserRole } | undefined> },
  auditStore?: AuditLogStore,
): void {
  // Auth hook for /api/keys routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith("/api/keys")) return;
    try {
      const authCtx = await authenticate(req.headers["authorization"], personalToken, userStore as never, apiKeyStore);
      authorize(authCtx, "users.write"); // Only admin/operator can manage API keys
      (req as FastifyRequest & { authCtx?: typeof authCtx }).authCtx = authCtx;
    } catch (e) {
      if (e instanceof AppError) {
        const status = e.code === "unauthorized" ? 401 : 403;
        return reply.code(status).send({
          error: { code: e.code, message: e.message },
        });
      }
      return reply.code(401).send({
        error: { code: "unauthorized", message: "Missing or invalid bearer token" },
      });
    }
  });

  // POST /api/keys - create a new API key
  server.post("/api/keys", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: { user?: { id: string }; role: UserRole } }).authCtx;
    const body = req.body as { name?: string; userId?: string; role?: string } | undefined;

    if (typeof body?.name !== "string" || body.name.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'name' (non-empty string)" },
      });
    }

    // Target user: specified or the requesting user
    const targetUserId = body.userId ?? authCtx.user?.id;
    if (!targetUserId) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'userId' or you must be authenticated" },
      });
    }

    // Validate role
    const role = (body.role ?? authCtx.role ?? "viewer") as UserRole;
    if (!VALID_ROLES.includes(role)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid role: ${body.role}. Must be one of: ${VALID_ROLES.join(", ")}` },
      });
    }

    const apiKey = await apiKeyStore.createApiKey(body.name.trim(), targetUserId, role);
    log.info({ apiKeyId: apiKey.id, name: apiKey.name, userId: targetUserId }, "API key created");
    recordApiKeyOp("create");

    if (auditStore) {
      await auditStore.log({
        action: "api_key.created" as never,
        actor: authCtx.user?.id ?? "system",
        actorType: "api",
        details: { apiKeyId: apiKey.id, name: apiKey.name, userId: targetUserId, role },
      });
    }

    return reply.code(201).send({ apiKey });
  });

  // GET /api/keys - list all API keys
  server.get("/api/keys", async (req: FastifyRequest, reply: FastifyReply) => {
    const { userId } = req.query as { userId?: string };
    const keys = await apiKeyStore.listApiKeys(userId);
    return reply.send({ apiKeys: keys });
  });

  // GET /api/keys/:id - get API key details
  server.get<{ Params: { id: string } }>("/api/keys/:id", async (req, reply) => {
    const key = await apiKeyStore.getApiKeyById(req.params.id);
    if (!key) {
      return reply.code(404).send({
        error: { code: "not_found", message: `API key not found: ${req.params.id}` },
      });
    }
    return reply.send({ apiKey: key });
  });

  // POST /api/keys/:id/rotate - rotate an API key with grace period
  server.post<{ Params: { id: string }; Body: { gracePeriodMs?: number } }>("/api/keys/:id/rotate", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: { user?: { id: string }; role: UserRole } }).authCtx;
    const gracePeriodMs = req.body?.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;

    if (typeof gracePeriodMs !== "number" || gracePeriodMs < 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "gracePeriodMs must be a non-negative number" },
      });
    }

    // Max grace period: 7 days
    const MAX_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
    if (gracePeriodMs > MAX_GRACE_PERIOD_MS) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `gracePeriodMs cannot exceed ${MAX_GRACE_PERIOD_MS} (7 days)` },
      });
    }

    try {
      const newKey = await apiKeyStore.rotateApiKey(req.params.id, gracePeriodMs);
      log.info({ apiKeyId: req.params.id, gracePeriodMs }, "API key rotated");
      recordApiKeyOp("rotate");

      if (auditStore) {
        await auditStore.log({
          action: "api_key.rotated" as never,
          actor: authCtx.user?.id ?? "system",
          actorType: "api",
          details: {
            apiKeyId: req.params.id,
            gracePeriodMs,
            previousKeyExpiresAt: newKey.previousKeyExpiresAt,
          },
        });
      }

      return reply.send({
        apiKey: newKey,
        message: gracePeriodMs > 0
          ? `New key active. Previous key will expire at ${newKey.previousKeyExpiresAt}`
          : "New key active. Previous key revoked immediately.",
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `API key not found: ${req.params.id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/keys/:id/revoke - revoke (delete) an API key
  server.post<{ Params: { id: string } }>("/api/keys/:id/revoke", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: { user?: { id: string }; role: UserRole } }).authCtx;
    const deleted = await apiKeyStore.revokeApiKey(req.params.id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `API key not found: ${req.params.id}` },
      });
    }

    log.info({ apiKeyId: req.params.id }, "API key revoked");
    recordApiKeyOp("revoke");

    if (auditStore) {
      await auditStore.log({
        action: "api_key.revoked" as never,
        actor: authCtx.user?.id ?? "system",
        actorType: "api",
        details: { apiKeyId: req.params.id },
      });
    }

    return reply.send({ ok: true });
  });

  // POST /api/keys/:id/enable - re-enable a disabled API key
  server.post<{ Params: { id: string } }>("/api/keys/:id/enable", async (req, reply) => {
    try {
      const key = await apiKeyStore.enableApiKey(req.params.id);
      log.info({ apiKeyId: req.params.id }, "API key enabled");
      recordApiKeyOp("enable");
      return reply.send({ apiKey: key });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `API key not found: ${req.params.id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/keys/:id/disable - disable an API key
  server.post<{ Params: { id: string } }>("/api/keys/:id/disable", async (req, reply) => {
    try {
      const key = await apiKeyStore.disableApiKey(req.params.id);
      log.info({ apiKeyId: req.params.id }, "API key disabled");
      recordApiKeyOp("disable");
      return reply.send({ apiKey: key });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `API key not found: ${req.params.id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/keys/cleanup-expired - clean up expired previous keys
  server.post("/api/keys/cleanup-expired", async (_req, reply) => {
    const cleaned = await apiKeyStore.deleteExpiredPreviousKeys();
    log.info({ cleaned }, "Expired previous API keys cleaned up");
    recordApiKeyOp("cleanup");
    return reply.send({ ok: true, cleaned });
  });
}
