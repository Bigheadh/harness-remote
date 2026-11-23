import type { FastifyReply, FastifyRequest } from "fastify";
import type { TaskStore } from "../store.js";
import type { FeishuReplyClient } from "../../feishu/client.js";
import type { AuditLogStore } from "../../audit/store.js";
import type { UserStore } from "../../auth/store.js";
import type { WebhookStore } from "../../webhooks/store.js";
import type { AuthContext } from "../../auth/middleware.js";
import { authorize } from "../../auth/middleware.js";
import type { Permission } from "../../auth/roles.js";
import { AppError } from "../../../shared/errors.js";
import { createLogger } from "../../../shared/logger.js";

export interface TaskRouteContext {
  store: TaskStore;
  feishuClient?: FeishuReplyClient;
  auditStore?: AuditLogStore;
  userStore?: UserStore;
  webhookStore?: WebhookStore;
  notifyOnStatusChange?: string[];
  log: ReturnType<typeof createLogger>;
}

/**
 * Shared RBAC permission guard for task subroutes.
 * Returns AuthContext when authorized, or sends 403 and returns undefined.
 */
export function requirePermission(
  req: FastifyRequest,
  reply: FastifyReply,
  permission: Permission,
): AuthContext | undefined {
  const authCtx = (req as FastifyRequest & { authCtx: AuthContext }).authCtx;
  try {
    authorize(authCtx, permission);
    return authCtx;
  } catch (e) {
    if (e instanceof AppError) {
      reply.code(403).send({ error: { code: e.code, message: e.message } });
      return undefined;
    }
    throw e;
  }
}
