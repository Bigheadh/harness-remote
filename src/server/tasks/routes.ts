import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStore } from "./store.js";
import type { TaskStatus } from "../../shared/types.js";
import type { TaskPriority } from "../../shared/types.js";
import type { AuditLogEntry } from "../../shared/types.js";
import type { ActivityFeedItem } from "../../shared/types.js";
import type { Subtask } from "../../shared/types.js";
import type { FeishuReplyClient } from "../feishu/client.js";
import { buildTaskResultCard, buildTaskStatusCard, buildCustomCard, buildSlaBreachCard, buildWatcherNotificationCard, STATUS_LABELS, STATUS_COLORS } from "../feishu/card-builder.js";
import type { AuditLogStore } from "../audit/store.js";
import type { UserStore } from "../auth/store.js";
import type { ApiKeyStore } from "../auth/apikeys/store.js";
import type { WebhookStore } from "../webhooks/store.js";
import { authenticate, authorize } from "../auth/middleware.js";
import { readTokenFromSessionCookie } from "../dashboard/session.js";
import { CreateTaskBodySchema, parseBody } from "../openapi/schemas.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";
import { dispatchWebhook } from "../webhooks/dispatcher.js";
import { recordTaskStatusChange, recordTaskCompleted, recordSlaEvent } from "../metrics/collector.js";
import {
  broadcastTaskUpdated,
  broadcastTaskStatusChanged,
  broadcastTaskResultReported,
  broadcastTaskAssigned,
  broadcastTaskDeleted,
  getClientCount,
} from "../sse/broadcaster.js";
import { TASK_SCHEMA_VERSION } from "./repos/schema.js";

import type { TaskRouteContext } from "./subroutes/context.js";
import { registerTemplateRoutes } from "./subroutes/templates.js";
import { registerBulkTaskRoutes } from "./subroutes/bulk.js";
import { registerExportImportRoutes } from "./subroutes/export-import.js";
import { registerSlaRoutes } from "./subroutes/sla.js";
import { registerSavedViewRoutes } from "./subroutes/saved-views.js";
import { registerCycleRoutes } from "./subroutes/cycles.js";
import { registerModuleRoutes } from "./subroutes/modules.js";
import { registerDependencyRoutes } from "./subroutes/dependencies.js";
import { registerSubtaskAndCommentRoutes } from "./subroutes/subtasks-comments.js";
import { registerWatcherAndTimeRoutes } from "./subroutes/watchers-time.js";
import { registerRelationshipRoutes } from "./subroutes/relationships.js";

const log = createLogger({ level: "info" });

/** Format an audit log entry into a human-readable summary for the activity feed */
function formatAuditSummary(entry: AuditLogEntry): string {
  const details = entry.details as Record<string, unknown> | undefined;
  switch (entry.action) {
    case "task.created":
      if (details?.action === "clone") return `Task cloned from ${details.sourceTaskId}`;
      if (details?.action === "import") return `Tasks imported (${details.imported} items)`;
      return "Task created";
    case "task.status_changed":
      if (details?.action === "pin") return "Task pinned";
      if (details?.action === "unpin") return "Task unpinned";
      if (details?.action === "retry") return "Task retried (reset to pending)";
      if (details?.bulk) return `Bulk status changed to ${details.status} (${details.count} tasks)`;
      return `Status changed: ${details?.from} → ${details?.to}`;
    case "task.result_reported":
      return `Result reported: ${details?.success ? "success" : "failure"} — ${details?.summary}`;
    case "task.assigned":
      if (details?.bulk) return `Bulk assigned to ${details.deviceId} (${details.count} tasks)`;
      return `Assigned to device: ${details?.deviceId}`;
    case "task.unassigned":
      return "Task unassigned";
    case "task.forwarded":
      return `Task forwarded to device: ${details?.targetDeviceId}`;
    case "task.comment_added":
      return "Comment added";
    case "task.comment_deleted":
      return "Comment deleted";
    case "task.note_added":
      return "Note added";
    case "task.note_deleted":
      return "Note deleted";
    case "task.tags_added":
      return `Tags added: ${JSON.stringify(details?.tags)}`;
    case "task.tags_removed":
      return `Tags removed: ${JSON.stringify(details?.tag)}`;
    case "task.dependencies_set":
      return `Dependencies updated (${details?.dependsOnIds ? (details.dependsOnIds as string[]).length : 0} prereqs)`;
    case "task.subtask_created":
      return `Subtask created: ${details?.title}`;
    case "task.subtask_status_changed":
      return `Subtask status changed: ${details?.status}`;
    case "task.subtask_result_reported":
      return `Subtask result reported: ${details?.success ? "success" : "failure"}`;
    case "task.subtask_deleted":
      return "Subtask deleted";
    case "task.priority_escalated":
      return `Priority escalated for ${details?.count ?? 0} overdue task(s)`;
    case "task.reset_stale":
      return `Stale tasks reset (${details?.count} tasks)`;
    case "cleanup.processed_events":
      return `Processed events cleaned up (${details?.deleted} events)`;
    case "feishu.reply_sent":
      return "Feishu reply sent";
    case "feishu.reply_failed":
      return "Feishu reply failed";
    case "api_key.created":
      return "API key created";
    case "api_key.rotated":
      return "API key rotated";
    case "api_key.revoked":
      return "API key revoked";
    default:
      return entry.action;
  }
}

export function registerTaskRoutes(
  server: FastifyInstance,
  store: TaskStore,
  personalToken: string,
  feishuClient?: FeishuReplyClient,
  auditStore?: AuditLogStore,
  userStore?: UserStore,
  webhookStore?: WebhookStore,
  apiKeyStore?: ApiKeyStore,
  notifyOnStatusChange?: string[],
): void {
  const routeCtx: TaskRouteContext = {
    store,
    feishuClient,
    auditStore,
    userStore,
    webhookStore,
    notifyOnStatusChange,
    log,
  };

  // Health endpoint with DB connectivity check (no auth required)
  server.get("/health", async (_req, reply) => {
    const dbOk = await store.healthCheck();
    if (!dbOk) {
      return reply.code(503).send({ ok: false, error: "Database unreachable" });
    }
    return reply.send({ ok: true });
  });

  // Authenticated diagnostic health details (requires tasks.read)
  server.get("/api/health/details", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const dbOk = await store.healthCheck();
    const mem = process.memoryUsage();
    return reply.code(dbOk ? 200 : 503).send({
      ok: dbOk,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      schemaVersion: TASK_SCHEMA_VERSION,
      sseClients: getClientCount(),
      memoryMb: {
        rss: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // RBAC-aware auth hook for /api/* routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const pathname = req.url.split("?")[0];
    // Public OpenAPI docs and SSE stream (which handles its own RBAC auth)
    if (pathname === "/api/tasks/stream" || pathname === "/api/openapi.json" || pathname === "/api/docs") {
      return;
    }
    if (req.url.startsWith("/api/")) {
      try {
        let authHeader = req.headers["authorization"];
        if (!authHeader) {
          const cookieToken = readTokenFromSessionCookie(req.headers["cookie"], personalToken);
          if (cookieToken) {
            authHeader = `Bearer ${cookieToken}`;
          }
        }
        const authCtx = await authenticate(authHeader, personalToken, userStore, apiKeyStore);
        // Attach auth context for downstream handlers
        (req as FastifyRequest & { authCtx?: typeof authCtx }).authCtx = authCtx;
      } catch (e) {
        if (e instanceof AppError) {
          return reply.code(401).send({
            error: { code: e.code, message: e.message },
          });
        }
        return reply.code(401).send({
          error: { code: "unauthorized", message: "Missing or invalid bearer token" },
        });
      }
    }
  });

  // GET /api/tasks/tags - list all unique tags (requires tasks.read)
  server.get("/api/tasks/tags", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const tags = await store.listAllTags();
    return reply.send({ tags });
  });

  registerTemplateRoutes(server, routeCtx);

  // GET /api/tasks - list tasks (requires tasks.read)
  server.get("/api/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { status, limit, deviceId, from, to, priority } = req.query as {
      status?: TaskStatus;
      limit?: number;
      deviceId?: string;
      from?: string;
      to?: string;
      priority?: string;
    };
    const validPriorities = ["low", "normal", "high", "urgent"];
    if (priority && !validPriorities.includes(priority)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid priority: ${priority}. Must be one of: ${validPriorities.join(", ")}` },
      });
    }
    const tasks = await store.listTasks(status, limit, deviceId, from, to, priority as TaskPriority | undefined);
    return reply.send({ tasks });
  });

  // POST /api/tasks - create a task from the web dashboard (requires tasks.write)
  server.post("/api/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = parseBody(CreateTaskBodySchema, req.body, reply);
    if (!body) return;

    const now = new Date().toISOString();
    const task = await store.createTask({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: "web",
      feishuMessageId: `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      feishuChatId: "",
      feishuUserId: (authCtx as { username?: string }).username ?? "web_user",
      commandText: body.commandText,
      status: "pending",
      priority: body.priority,
      tags: body.tags,
      assignedDeviceId: body.assignedDeviceId,
      dueDate: body.dueDate,
      reminderAt: body.reminderAt,
      description: body.description,
      createdAt: now,
      updatedAt: now,
    });

    // Audit log
    if (auditStore) {
      await auditStore.log({
        taskId: task.id,
        action: "task.created" as never,
        actor: (authCtx as { username?: string }).username ?? "web_user",
        actorType: "api",
        details: { source: "web", commandText: body.commandText.slice(0, 100) },
      });
    }

    // Broadcast SSE
    broadcastTaskUpdated(task);

    log.info({ taskId: task.id, source: "web" }, "Task created from web dashboard");
    return reply.code(201).send({ task });
  });

  // GET /api/tasks/search - search task history (requires tasks.search)
  server.get("/api/tasks/search", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.search");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { q, status, from, to, limit, deviceId, tags, priority, cycleId, moduleId, source } = req.query as {
      q?: string;
      status?: TaskStatus;
      from?: string;
      to?: string;
      limit?: number;
      deviceId?: string;
      tags?: string;
      priority?: string;
      cycleId?: string;
      moduleId?: string;
      source?: string;
    };

    if (status && !["pending", "picked", "running", "done", "failed"].includes(status)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid status: ${status}` },
      });
    }

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (priority && !validPriorities.includes(priority)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid priority: ${priority}. Must be one of: ${validPriorities.join(", ")}` },
      });
    }

    if (from && isNaN(Date.parse(from))) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Invalid 'from' date format. Use ISO 8601." },
      });
    }

    if (to && isNaN(Date.parse(to))) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Invalid 'to' date format. Use ISO 8601." },
      });
    }

    const parsedTags = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;

    const validSources = ["feishu", "web", "mcp"];
    if (source && !validSources.includes(source)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid source: ${source}. Must be one of: ${validSources.join(", ")}` },
      });
    }

    const tasks = await store.searchTasks({ q, status, priority: priority as TaskPriority | undefined, from, to, limit, deviceId, tags: parsedTags, cycleId, moduleId, source });
    return reply.send({ tasks });
  });

  // GET /api/tasks/kanban - kanban board view (requires tasks.read)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get("/api/tasks/kanban", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { limit, deviceId } = req.query as {
      limit?: number;
      deviceId?: string;
    };
    const board = await store.getKanbanBoard(limit, deviceId);
    return reply.send(board);
  });

  // GET /api/tasks/overdue - list overdue tasks (requires tasks.read)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get("/api/tasks/overdue", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const tasks = await store.listOverdueTasks();
    return reply.send({ tasks, count: tasks.length });
  });

  registerBulkTaskRoutes(server, routeCtx);

  // GET /api/tasks/ready - list tasks ready for processing (pending + all deps met)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get("/api/tasks/ready", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { limit, deviceId } = req.query as {
      limit?: number;
      deviceId?: string;
    };
    const tasks = await store.listReadyTasks(limit, deviceId);
    return reply.send({ tasks, count: tasks.length });
  });

  registerExportImportRoutes(server, routeCtx);

  // GET /api/tasks/user/:userId - find tasks by Feishu user ID (requires tasks.read)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get<{ Params: { userId: string } }>("/api/tasks/user/:userId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { userId } = req.params;
    const { limit } = req.query as { limit?: number };

    if (!userId || userId.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "userId parameter is required" },
      });
    }

    const tasks = await store.listTasksByUser(userId.trim(), limit);
    return reply.send({ tasks, count: tasks.length });
  });

  // GET /api/tasks/archived - list archived (soft-deleted) tasks (requires tasks.read)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get("/api/tasks/archived", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { limit } = req.query as { limit?: number };
    const tasks = await store.listArchivedTasks(limit);
    return reply.send({ tasks, count: tasks.length });
  });

  // POST /api/tasks/escalate-priorities - auto-escalate overdue tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/escalate-priorities", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const result = await store.escalateOverduePriorities();
    log.info({ escalated: result.escalated }, "Priority escalation completed");

    if (auditStore && result.escalated > 0) {
      await auditStore.log({
        action: "task.priority_escalated",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: {
          count: result.escalated,
          taskIds: result.tasks.map((t) => t.id),
          escalations: result.tasks.map((t) => ({ taskId: t.id, newPriority: t.priority })),
        },
      });
    }

    return reply.send({
      ok: true,
      escalated: result.escalated,
      tasks: result.tasks,
    });
  });

  // GET /api/tasks/:id - get task detail (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }
    return reply.send({ task });
  });

  // POST /api/tasks/:id/status - update status (requires tasks.status)
  server.post<{
    Params: { id: string };
    Body: { status: TaskStatus };
  }>("/api/tasks/:id/status", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.status");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const { status } = req.body as { status?: TaskStatus };

    if (!status) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Missing 'status' in request body" },
      });
    }

    const validStatuses: TaskStatus[] = ["pending", "picked", "running", "done", "failed"];
    if (!validStatuses.includes(status)) {
      return reply.code(400).send({
        error: { code: "invalid_status", message: `Invalid status: ${status}` },
      });
    }

    try {
      // Get task before update to capture previous status
      const prevTask = await store.getTask(id);
      const previousStatus = prevTask?.status;
      const task = await store.updateTaskStatus(id, status);
      if (auditStore) {
        await auditStore.log({
          action: "task.status_changed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { from: previousStatus, to: status },
        });
      }
      // Dispatch webhook for status change
      if (webhookStore) {
        dispatchWebhook(webhookStore, "task.status_changed", task, { previousStatus }).catch(() => {});
      }
      // Broadcast SSE event
      broadcastTaskStatusChanged(task, previousStatus ?? "");
      if (previousStatus) {
        recordTaskStatusChange(previousStatus, status);
      }
      // Send proactive Feishu notification for configured status transitions
      if (feishuClient && task.feishuMessageId && notifyOnStatusChange?.includes(status)) {
        const card = buildTaskStatusCard(task, previousStatus ?? status);
        feishuClient.sendCardMessage({ messageId: task.feishuMessageId, card }).catch((err) => {
          log.warn({ taskId: id, status, err: err instanceof Error ? err.message : String(err) }, "Failed to send status change notification to Feishu");
        });
      }
      // Notify task watchers via direct Feishu message
      if (feishuClient && userStore && previousStatus) {
        const watchers = await store.listWatchers(id);
        for (const watcher of watchers) {
          const user = await userStore.getUserById(watcher.userId);
          if (user?.feishuUserId) {
            const watcherCard = buildWatcherNotificationCard(task, previousStatus, status, user.username);
            feishuClient.sendDirectCardMessage({ feishuUserId: user.feishuUserId, card: watcherCard }).catch((err) => {
              log.warn({ taskId: id, watcherUserId: watcher.userId, err: err instanceof Error ? err.message : String(err) }, "Failed to send watcher notification");
            });
          }
        }
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && e.message.includes("Invalid status transition")) {
        return reply.code(409).send({
          error: { code: "invalid_status", message: e.message },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/result - report result (requires tasks.result)
  server.post<{
    Params: { id: string };
    Body: { success: boolean; summary: string; details?: string };
  }>("/api/tasks/:id/result", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.result");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as {
      success?: boolean;
      summary?: string;
      details?: string;
    };

    if (typeof body?.success !== "boolean" || typeof body?.summary !== "string") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'success' (boolean) and 'summary' (string)",
        },
      });
    }

    try {
      const task = await store.saveTaskResult(
        id,
        body.success,
        body.summary,
        body.details,
      );
      if (auditStore) {
        await auditStore.log({
          action: "task.result_reported",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { success: body.success, summary: body.summary },
        });
      }
      // Dispatch webhook for result report
      if (webhookStore) {
        dispatchWebhook(webhookStore, "task.result_reported", task, { success: body.success, summary: body.summary }).catch(() => {});
      }
      // Broadcast SSE event for result report
      broadcastTaskResultReported(task, body.success, body.summary);
      recordTaskCompleted(body.success ? "done" : "failed");

      // Send rich card reply to Feishu if client is available
      if (feishuClient && task.feishuMessageId) {
        const card = buildTaskResultCard(task, body.success, body.summary, body.details);
        feishuClient.sendCardMessage({ messageId: task.feishuMessageId, card }).catch((err) => {
          log.warn({ taskId: id, err: err instanceof Error ? err.message : String(err) }, "Failed to send task result card to Feishu");
        });
      }

      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // PUT /api/tasks/:id/card - update the Feishu card for a task (requires tasks.write)
  server.put<{
    Params: { id: string };
    Body: { markdown: string; title?: string; color?: string };
  }>("/api/tasks/:id/card", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    if (!feishuClient) {
      return reply.code(503).send({
        error: { code: "not_configured", message: "Feishu client not configured" },
      });
    }

    const { id } = req.params;
    const { markdown, title, color } = req.body ?? {};

    if (!markdown || typeof markdown !== "string") {
      return reply.code(400).send({
        error: { code: "bad_request", message: "markdown field is required and must be a string" },
      });
    }

    try {
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (!task.feishuMessageId) {
        return reply.code(400).send({
          error: { code: "no_message", message: "Task has no associated Feishu message" },
        });
      }

      const card = buildCustomCard(
        title ?? `📝 ${task.commandText.slice(0, 50)}`,
        markdown,
        (color as "blue" | "green" | "red" | "orange" | "purple" | "indigo" | "turquoise" | "yellow" | "grey" | "wathet" | undefined) ?? "blue",
      );
      await feishuClient.updateCardMessage({ messageId: task.feishuMessageId, card });
      log.info({ taskId: id }, "Feishu card updated");
      return reply.send({ success: true, messageId: task.feishuMessageId });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/retry - requeue a failed/done task back to pending (requires tasks.write)
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/retry", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;

    try {
      const task = await store.retryTask(id);
      log.info({ taskId: id }, "Task retried (reset to pending)");
      if (auditStore) {
        await auditStore.log({
          action: "task.status_changed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "retry", fromStatus: "done/failed", toStatus: "pending" },
        });
      }
      // Broadcast SSE event for status change
      broadcastTaskStatusChanged(task, "pending");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && e.message.includes("Cannot retry")) {
        return reply.code(409).send({
          error: { code: "invalid_status", message: e.message },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/clone - duplicate a task with fresh pending status (requires tasks.write)
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/clone", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;

    try {
      const clonedTask = await store.cloneTask(id);
      log.info({ sourceTaskId: id, clonedTaskId: clonedTask.id }, "Task cloned");
      if (auditStore) {
        await auditStore.log({
          action: "task.created",
          taskId: clonedTask.id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "clone", sourceTaskId: id },
        });
      }
      broadcastTaskUpdated(clonedTask);
      return reply.code(201).send({ task: clonedTask });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/reopen - reopen a done/failed task back to pending (requires tasks.write)
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/reopen", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;

    try {
      const reopenedTask = await store.reopenTask(id);
      log.info({ taskId: id, reopenedCount: reopenedTask.reopenedCount }, "Task reopened");
      if (auditStore) {
        await auditStore.log({
          action: "task.status_changed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "reopen", reopenedCount: reopenedTask.reopenedCount },
        });
      }
      broadcastTaskUpdated(reopenedTask);
      return reply.code(200).send({ task: reopenedTask });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && e.message.includes("Can only reopen")) {
        return reply.code(400).send({
          error: { code: "invalid_transition", message: e.message },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/pin - pin a task to top of listing (requires tasks.write)
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/pin", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    try {
      const task = await store.pinTask(id);
      log.info({ taskId: id }, "Task pinned");
      if (auditStore) {
        await auditStore.log({
          action: "task.status_changed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "pin" },
        });
      }
      broadcastTaskUpdated(task);
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/unpin - unpin a task (requires tasks.write)
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/unpin", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    try {
      const task = await store.unpinTask(id);
      log.info({ taskId: id }, "Task unpinned");
      if (auditStore) {
        await auditStore.log({
          action: "task.status_changed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "unpin" },
        });
      }
      broadcastTaskUpdated(task);
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/forward - forward task to different device with message (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { deviceId?: string; message?: string };
  }>("/api/tasks/:id/forward", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { deviceId?: string; message?: string };

    if (!body?.deviceId || typeof body.deviceId !== "string" || body.deviceId.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'deviceId' (non-empty string)" },
      });
    }

    try {
      const task = await store.forwardTask(id, body.deviceId.trim(), body.message);
      log.info({ taskId: id, targetDeviceId: body.deviceId }, "Task forwarded");
      if (auditStore) {
        await auditStore.log({
          action: "task.forwarded",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { targetDeviceId: body.deviceId, message: body.message },
        });
      }
      broadcastTaskUpdated(task);
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/assign - assign task to device (requires tasks.assign)
  server.post<{
    Params: { id: string };
    Body: { deviceId: string };
  }>("/api/tasks/:id/assign", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.assign");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { deviceId?: string };

    if (typeof body?.deviceId !== "string" || body.deviceId.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'deviceId' (non-empty string)",
        },
      });
    }

    try {
      const task = await store.assignTask(id, body.deviceId.trim());
      log.info({ taskId: id, deviceId: body.deviceId }, "Task assigned to device");
      if (auditStore) {
        await auditStore.log({
          action: "task.assigned",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { deviceId: body.deviceId.trim() },
        });
      }
      // Dispatch webhook for assignment
      if (webhookStore) {
        dispatchWebhook(webhookStore, "task.assigned", task, { deviceId: body.deviceId.trim() }).catch(() => {});
      }
      // Broadcast SSE event
      broadcastTaskAssigned(task, body.deviceId.trim());
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/unassign - unassign task from device (requires tasks.assign)
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/unassign", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.assign");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;

    try {
      const task = await store.unassignTask(id);
      log.info({ taskId: id }, "Task unassigned from device");
      if (auditStore) {
        await auditStore.log({
          action: "task.unassigned",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
        });
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/tags - add tags to a task (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { tags: string[] };
  }>("/api/tasks/:id/tags", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { tags?: string[] };

    if (!Array.isArray(body?.tags) || body.tags.length === 0) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'tags' (non-empty array of strings)",
        },
      });
    }

    // Validate all tags are non-empty strings
    const validTags = body.tags
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter((t) => t.length > 0);

    if (validTags.length === 0) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "All tags must be non-empty strings",
        },
      });
    }

    try {
      const task = await store.addTags(id, validTags);
      log.info({ taskId: id, tags: validTags }, "Tags added to task");
      if (auditStore) {
        await auditStore.log({
          action: "task.tags_added",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { tags: validTags },
        });
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/tags/:tag - remove a tag from a task (requires tasks.write)
  server.delete<{
    Params: { id: string; tag: string };
  }>("/api/tasks/:id/tags/:tag", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, tag } = req.params;

    if (!tag || tag.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Tag must be a non-empty string" },
      });
    }

    try {
      const task = await store.removeTag(id, tag);
      log.info({ taskId: id, tag }, "Tag removed from task");
      if (auditStore) {
        await auditStore.log({
          action: "task.tags_removed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { tag },
        });
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/due - set or clear due date (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { dueDate: string | null };
  }>("/api/tasks/:id/due", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { dueDate?: string | null };

    if (body?.dueDate !== null && body?.dueDate !== undefined && typeof body.dueDate !== "string") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "'dueDate' must be an ISO 8601 date string or null to clear",
        },
      });
    }

    if (body?.dueDate && isNaN(Date.parse(body.dueDate))) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Invalid date format. Use ISO 8601 (e.g., '2026-06-15' or '2026-06-15T14:00:00Z')",
        },
      });
    }

    try {
      const task = await store.setTaskDueDate(id, body?.dueDate ?? null);
      log.info({ taskId: id, dueDate: body?.dueDate ?? null }, "Task due date updated");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/reminder - set or clear reminder (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { reminderAt: string | null };
  }>("/api/tasks/:id/reminder", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { reminderAt?: string | null };

    if (body?.reminderAt !== null && body?.reminderAt !== undefined && typeof body.reminderAt !== "string") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "'reminderAt' must be an ISO 8601 date string or null to clear",
        },
      });
    }

    if (body?.reminderAt && isNaN(Date.parse(body.reminderAt))) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Invalid date format. Use ISO 8601 (e.g., '2026-06-15T09:00:00Z')",
        },
      });
    }

    try {
      const task = await store.setTaskReminder(id, body?.reminderAt ?? null);
      log.info({ taskId: id, reminderAt: body?.reminderAt ?? null }, "Task reminder updated");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/description - set or clear task description (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { description: string | null };
  }>("/api/tasks/:id/description", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { description?: string | null };

    if (body?.description !== null && body?.description !== undefined && typeof body.description !== "string") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "'description' must be a string or null to clear",
        },
      });
    }

    try {
      const task = await store.setTaskDescription(id, body?.description ?? null);
      log.info({ taskId: id, hasDescription: body?.description != null }, "Task description updated");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/command-text - set command text (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { commandText: string };
  }>("/api/tasks/:id/command-text", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { commandText?: string };

    if (typeof body?.commandText !== "string" || body.commandText.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "'commandText' must be a non-empty string",
        },
      });
    }

    try {
      const task = await store.setTaskCommandText(id, body.commandText);
      log.info({ taskId: id }, "Task command text updated");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/priority - set priority (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { priority: string };
  }>("/api/tasks/:id/priority", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { priority?: string };
    const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];

    if (!body?.priority || typeof body.priority !== "string") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "'priority' must be one of: low, normal, high, urgent",
        },
      });
    }

    if (!VALID_PRIORITIES.includes(body.priority)) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: `Invalid priority: '${body.priority}'. Must be one of: ${VALID_PRIORITIES.join(", ")}`,
        },
      });
    }

    try {
      const task = await store.setTaskPriority(id, body.priority as TaskPriority);
      log.info({ taskId: id, priority: body.priority }, "Task priority updated");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/reset-stale - reset stale tasks (requires tasks.reset_stale)
  server.post("/api/tasks/reset-stale", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.reset_stale");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { timeoutMs?: number } | undefined;
    const timeoutMs = body?.timeoutMs ?? 30 * 60 * 1000; // Default 30 minutes

    const resetCount = await store.resetStaleTasks(timeoutMs);
    log.info({ resetCount, timeoutMs }, "Stale tasks reset");
    if (auditStore && resetCount > 0) {
      await auditStore.log({
        action: "task.reset_stale",
        actor: authCtx.user?.username ?? "system",
        actorType: "system",
        details: { resetCount, timeoutMs },
      });
    }
    return reply.send({ ok: true, resetCount });
  });

  // POST /api/tasks/cleanup-events - clean up old processed events (requires tasks.cleanup)
  server.post("/api/tasks/cleanup-events", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.cleanup");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { retentionDays?: number } | undefined;
    const retentionDays = body?.retentionDays ?? 7; // Default 7 days

    const deletedCount = await store.cleanupProcessedEvents(retentionDays);
    log.info({ deletedCount, retentionDays }, "Processed events cleaned up");
    if (auditStore && deletedCount > 0) {
      await auditStore.log({
        action: "cleanup.processed_events",
        actor: authCtx.user?.username ?? "system",
        actorType: "system",
        details: { deletedCount, retentionDays },
      });
    }
    return reply.send({ ok: true, deletedCount });
  });

  // POST /api/tasks/:id/reply - reply to Feishu message (requires tasks.reply)
  // Supports optional format: "card" to send as interactive card with title
  server.post<{
    Params: { id: string };
    Body: { message: string; format?: string; title?: string };
  }>("/api/tasks/:id/reply", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.reply");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { message?: string; format?: string; title?: string };

    if (typeof body?.message !== "string" || body.message.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'message' (non-empty string)",
        },
      });
    }

    if (!feishuClient) {
      return reply.code(503).send({
        error: {
          code: "not_configured",
          message: "Feishu reply client is not configured",
        },
      });
    }

    try {
      const messageId = await store.getTaskMessageId(id);
      if (!messageId) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }

      if (body.format === "card") {
        // Send as interactive card
        const card = buildCustomCard(body.title ?? "📢 Reply", body.message);
        await feishuClient.sendCardMessage({ messageId, card });
      } else {
        // Default: send as plain text
        await feishuClient.replyToMessage({ messageId, text: body.message });
      }
      log.info({ taskId: id, format: body.format ?? "text" }, "Reply sent to Feishu");
      if (auditStore) {
        await auditStore.log({
          action: "feishu.reply_sent",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { format: body.format ?? "text" },
        });
      }
      return reply.send({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error({ taskId: id, err: message }, "Failed to reply to Feishu");
      if (auditStore) {
        await auditStore.log({
          action: "feishu.reply_failed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { error: message },
        });
      }
      return reply.code(502).send({
        error: { code: "feishu_reply_failed", message },
      });
    }
  });

  registerDependencyRoutes(server, routeCtx);

  registerSubtaskAndCommentRoutes(server, routeCtx);

  registerSlaRoutes(server, routeCtx);

  // ── Task Notes (internal annotations, not shared to requester) ──

  // GET /api/tasks/:id/notes - list notes for a task (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/notes", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }
    const notes = await store.listNotes(id);
    return reply.send({ notes, count: notes.length });
  });

  // POST /api/tasks/:id/notes - add a note to a task (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { body: string };
  }>("/api/tasks/:id/notes", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { body?: string };

    if (typeof body?.body !== "string" || body.body.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'body' (non-empty string)",
        },
      });
    }

    try {
      const author = authCtx.user?.username ?? "system";
      const note = await store.addNote(id, author, body.body);
      log.info({ taskId: id, noteId: note.id }, "Note added to task");
      if (auditStore) {
        await auditStore.log({
          action: "task.note_added",
          taskId: id,
          actor: author,
          actorType: "api",
          details: { noteId: note.id, body: body.body },
        });
      }
      return reply.send({ note });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/notes/:noteId - delete a note (requires tasks.write)
  server.delete<{
    Params: { id: string; noteId: string };
  }>("/api/tasks/:id/notes/:noteId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, noteId } = req.params;
    const parsedNoteId = Number(noteId);

    if (isNaN(parsedNoteId) || parsedNoteId <= 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "noteId must be a positive integer" },
      });
    }

    const deleted = await store.deleteNote(parsedNoteId, id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Note not found: ${noteId}` },
      });
    }

    log.info({ taskId: id, noteId: parsedNoteId }, "Note deleted from task");
    if (auditStore) {
      await auditStore.log({
        action: "task.note_deleted",
        taskId: id,
        actor: authCtx.user?.username ?? "system",
        actorType: "api",
        details: { noteId: parsedNoteId },
      });
    }
    return reply.send({ ok: true });
  });

  // GET /api/tasks/:id/links - list external links for a task (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/links", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }

    const links = await store.listTaskLinks(id);
    return reply.send({ links, count: links.length });
  });

  // POST /api/tasks/:id/links - add an external link to a task (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { title: string; url: string };
  }>("/api/tasks/:id/links", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const { title, url } = req.body as { title: string; url: string };

    if (!title || !url) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "title and url are required" },
      });
    }

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return reply.code(400).send({
          error: { code: "invalid_request", message: "url must use http:// or https:// protocol" },
        });
      }
    } catch {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "url must be a valid URL" },
      });
    }

    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }

    const addedBy = authCtx.user?.username ?? "anonymous";
    const link = await store.addTaskLink(id, title, url, addedBy);
    log.info({ taskId: id, linkId: link.id, title, url }, "Link added to task");
    if (auditStore) {
      await auditStore.log({
        action: "task.link_added",
        taskId: id,
        actor: addedBy,
        actorType: "api",
        details: { linkId: link.id, title, url },
      });
    }
    return reply.code(201).send({ link });
  });

  // DELETE /api/tasks/:id/links/:linkId - remove an external link from a task (requires tasks.write)
  server.delete<{
    Params: { id: string; linkId: string };
  }>("/api/tasks/:id/links/:linkId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, linkId } = req.params;
    const parsedLinkId = Number(linkId);

    if (isNaN(parsedLinkId) || parsedLinkId <= 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "linkId must be a positive integer" },
      });
    }

    const deleted = await store.deleteTaskLink(id, parsedLinkId);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Link not found: ${linkId}` },
      });
    }

    log.info({ taskId: id, linkId: parsedLinkId }, "Link removed from task");
    if (auditStore) {
      await auditStore.log({
        action: "task.link_removed",
        taskId: id,
        actor: authCtx.user?.username ?? "system",
        actorType: "api",
        details: { linkId: parsedLinkId },
      });
    }
    return reply.send({ ok: true });
  });

  // GET /api/tasks/:id/activity - combined chronological activity feed (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/activity", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const { limit } = req.query as { limit?: number };

    // Verify task exists
    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }

    const effectiveLimit = Math.min(limit ?? 50, 200);

    // 1. Get task-owned activity (creation, comments, notes, subtasks)
    const storeItems = await store.getActivityFeed(id, effectiveLimit * 2);

    // 2. Get audit log entries for this task (status changes, result reports, assignments, etc.)
    let auditItems: ActivityFeedItem[] = [];
    if (auditStore) {
      const auditEntries = await auditStore.query({ taskId: id, limit: effectiveLimit * 2 });
      auditItems = auditEntries.map((entry) => ({
        type: entry.action,
        timestamp: entry.timestamp,
        actor: entry.actor,
        actorType: entry.actorType,
        summary: formatAuditSummary(entry),
        details: entry.details,
      }));
    }

    // 3. Merge and sort by timestamp ascending
    const allItems = [...storeItems, ...auditItems];
    allItems.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    // 4. Apply limit
    const items = allItems.slice(0, effectiveLimit);
    return reply.send({ items, count: items.length });
  });
  // GET /api/tasks/:id/attachments/:attachmentIndex - download a task attachment file (requires tasks.read)
  server.get<{
    Params: { id: string; attachmentIndex: string };
  }>("/api/tasks/:id/attachments/:attachmentIndex", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    if (!feishuClient) {
      return reply.code(503).send({
        error: { code: "not_configured", message: "Feishu client not configured — cannot download files" },
      });
    }

    const { id, attachmentIndex } = req.params;
    const index = Number(attachmentIndex);

    if (isNaN(index) || index < 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "attachmentIndex must be a non-negative integer" },
      });
    }

    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }

    if (!task.attachments || index >= task.attachments.length) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Attachment index ${index} out of range (task has ${task.attachments?.length ?? 0} attachments)` },
      });
    }

    const attachment = task.attachments[index];
    // Map FeishuFileType to the resource type parameter expected by the Feishu download API
    const feishuTypeMap: Record<string, string> = {
      file: "file",
      image: "image",
      audio: "audio",
      media: "media",
    };
    const resourceType = feishuTypeMap[attachment.feishuFileType] ?? "file";

    try {
      const { buffer, contentType, fileName } = await feishuClient.downloadFile(
        task.feishuMessageId,
        attachment.fileKey,
        resourceType,
      );

      log.info({ taskId: id, attachmentIndex: index, fileName, size: buffer.length }, "Attachment downloaded");

      return reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`)
        .header("Content-Length", buffer.length)
        .send(buffer);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error({ taskId: id, attachmentIndex: index, error: message }, "Failed to download attachment from Feishu");
      return reply.code(502).send({
        error: { code: "upstream_error", message: `Failed to download file from Feishu: ${message}` },
      });
    }
  });

  // POST /api/tasks/:id/archive - soft-delete a task (requires tasks.write)
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/archive", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    try {
      const task = await store.archiveTask(id);
      log.info({ taskId: id }, "Task archived");
      if (auditStore) {
        await auditStore.log({
          action: "task.status_changed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "archive", archivedAt: task.archivedAt },
        });
      }
      broadcastTaskUpdated(task);
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && e.message.includes("already archived")) {
        return reply.code(409).send({
          error: { code: "already_archived", message: e.message },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/unarchive - restore an archived task (requires tasks.write)
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/unarchive", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    try {
      const task = await store.unarchiveTask(id);
      log.info({ taskId: id }, "Task unarchived");
      if (auditStore) {
        await auditStore.log({
          action: "task.status_changed",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "unarchive" },
        });
      }
      broadcastTaskUpdated(task);
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && e.message.includes("not archived")) {
        return reply.code(409).send({
          error: { code: "not_archived", message: e.message },
        });
      }
      throw e;
    }
  });

  registerSavedViewRoutes(server, routeCtx);

  registerWatcherAndTimeRoutes(server, routeCtx);

  registerRelationshipRoutes(server, routeCtx);

  // POST /api/tasks/:id/estimated-minutes - set estimated minutes (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { estimatedMinutes: number | null };
  }>("/api/tasks/:id/estimated-minutes", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as { estimatedMinutes?: number | null };

    if (body.estimatedMinutes !== null && body.estimatedMinutes !== undefined) {
      if (typeof body.estimatedMinutes !== "number" || body.estimatedMinutes < 0) {
        return reply.code(400).send({
          error: {
            code: "invalid_request",
            message: "'estimatedMinutes' must be a non-negative number or null",
          },
        });
      }
    }

    try {
      const task = await store.setTaskEstimatedMinutes(id, body.estimatedMinutes ?? null);
      log.info({ taskId: id, estimatedMinutes: body.estimatedMinutes }, "Task estimated minutes updated");
      return reply.send({ task });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message },
        });
      }
      log.error({ err: e, taskId: id }, "Failed to update estimated minutes");
      return reply.code(500).send({
        error: { code: "internal_error", message: "Internal server error" },
      });
    }
  });

  registerCycleRoutes(server, routeCtx);

  registerModuleRoutes(server, routeCtx);
}
