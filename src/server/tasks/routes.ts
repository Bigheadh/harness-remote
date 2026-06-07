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
} from "../sse/broadcaster.js";

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
  // Health endpoint with DB connectivity check (no auth required)
  server.get("/health", async (_req, reply) => {
    const dbOk = await store.healthCheck();
    if (!dbOk) {
      return reply.code(503).send({ ok: false, error: "Database unreachable" });
    }
    return reply.send({ ok: true });
  });

  // RBAC-aware auth hook for /api/* routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith("/api/")) {
      try {
        const authCtx = await authenticate(req.headers["authorization"], personalToken, userStore, apiKeyStore);
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

  // ── Task Templates ────────────────────────────────────────────────

  // GET /api/templates - list all task templates (requires tasks.read)
  server.get("/api/templates", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const templates = await store.listTemplates();
    return reply.send({ templates });
  });

  // GET /api/templates/usage-stats - template usage statistics (requires tasks.read)
  server.get("/api/templates/usage-stats", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const stats = await store.getTemplateUsageStats();
    const totalUsage = stats.reduce((sum, s) => sum + s.usageCount, 0);
    return reply.send({ stats, totalUsage, templateCount: stats.length });
  });

  // GET /api/templates/:id - get a task template by ID (requires tasks.read)
  server.get<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const template = await store.getTemplate(req.params.id);
    if (!template) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Template not found: ${req.params.id}` },
      });
    }
    return reply.send({ template });
  });

  // POST /api/templates - create a task template (requires tasks.write)
  server.post("/api/templates", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as {
      name?: string;
      description?: string;
      commandText?: string;
      priority?: string;
      tags?: string[];
      assignedDeviceId?: string;
      dueDateOffsetMs?: number;
      reminderOffsetMs?: number;
      variables?: Record<string, string>;
    };

    if (typeof body?.name !== "string" || body.name.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'name' (non-empty string)" },
      });
    }
    if (typeof body?.commandText !== "string" || body.commandText.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'commandText' (non-empty string)" },
      });
    }

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid priority: ${body.priority}. Must be one of: ${validPriorities.join(", ")}` },
      });
    }

    const template = await store.createTemplate({
      name: body.name.trim(),
      description: body.description,
      commandText: body.commandText.trim(),
      priority: body.priority as "low" | "normal" | "high" | "urgent" | undefined,
      tags: body.tags,
      assignedDeviceId: body.assignedDeviceId,
      dueDateOffsetMs: body.dueDateOffsetMs,
      reminderOffsetMs: body.reminderOffsetMs,
      variables: body.variables,
      createdBy: authCtx.user?.username ?? "api",
    });
    log.info({ templateId: template.id, name: template.name }, "Task template created");
    return reply.code(201).send({ template });
  });

  // PUT /api/templates/:id - update a task template (requires tasks.write)
  server.put<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as {
      name?: string;
      description?: string;
      commandText?: string;
      priority?: string;
      tags?: string[];
      assignedDeviceId?: string;
      dueDateOffsetMs?: number;
      reminderOffsetMs?: number;
      variables?: Record<string, string>;
    };

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid priority: ${body.priority}. Must be one of: ${validPriorities.join(", ")}` },
      });
    }

    try {
      const template = await store.updateTemplate(req.params.id, {
        name: body.name,
        description: body.description,
        commandText: body.commandText,
        priority: body.priority as "low" | "normal" | "high" | "urgent" | undefined,
        tags: body.tags,
        assignedDeviceId: body.assignedDeviceId,
        dueDateOffsetMs: body.dueDateOffsetMs,
        reminderOffsetMs: body.reminderOffsetMs,
        variables: body.variables,
      });
      log.info({ templateId: template.id }, "Task template updated");
      return reply.send({ template });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Template not found: ${req.params.id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/templates/:id - delete a task template (requires tasks.write)
  server.delete<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const deleted = await store.deleteTemplate(req.params.id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Template not found: ${req.params.id}` },
      });
    }
    log.info({ templateId: req.params.id }, "Task template deleted");
    return reply.send({ ok: true });
  });

  // POST /api/templates/:id/create-task - create a task from a template (requires tasks.write)
  server.post<{ Params: { id: string } }>("/api/templates/:id/create-task", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const template = await store.getTemplate(req.params.id);
    if (!template) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Template not found: ${req.params.id}` },
      });
    }

    const body = req.body as {
      commandText?: string;
      description?: string;
      priority?: string;
      tags?: string[];
      assignedDeviceId?: string;
      dueDate?: string;
      reminderAt?: string;
      variables?: Record<string, string>;
    } | undefined;

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body?.priority && !validPriorities.includes(body.priority)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid priority: ${body.priority}. Must be one of: ${validPriorities.join(", ")}` },
      });
    }

    // Merge template default variables with request-provided variables
    const effectiveVariables: Record<string, string> = {
      ...(template.variables ?? {}),
      ...(body?.variables ?? {}),
    };
    const hasVariables = Object.keys(effectiveVariables).length > 0;

    /** Apply variable substitution: {var_name} → value */
    const applyVars = (text: string): string =>
      text.replace(/\{(\w+)\}/g, (_m, varName) =>
        effectiveVariables[varName] !== undefined ? effectiveVariables[varName] : `{${varName}}`
      );

    const now = new Date().toISOString();
    const effectivePriority = body?.priority ?? template.priority ?? "normal";
    const effectiveTags = body?.tags ?? template.tags ?? [];
    const effectiveDeviceId = body?.assignedDeviceId ?? template.assignedDeviceId ?? undefined;
    const effectiveDueDate = body?.dueDate
      ? body.dueDate
      : template.dueDateOffsetMs
        ? new Date(Date.now() + template.dueDateOffsetMs).toISOString()
        : undefined;
    const effectiveReminderAt = body?.reminderAt
      ? body.reminderAt
      : template.reminderOffsetMs
        ? new Date(Date.now() + template.reminderOffsetMs).toISOString()
        : undefined;

    const rawCommandText = body?.commandText ?? template.commandText;
    const rawDescription = body?.description ?? template.description ?? undefined;

    const task = await store.createTask({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: "feishu",
      feishuMessageId: `tmpl_${template.id}_${Date.now()}`,
      feishuChatId: "template",
      feishuUserId: authCtx.user?.username ?? "api",
      commandText: hasVariables ? applyVars(rawCommandText) : rawCommandText,
      status: "pending",
      priority: effectivePriority as "low" | "normal" | "high" | "urgent",
      tags: effectiveTags,
      assignedDeviceId: effectiveDeviceId,
      dueDate: effectiveDueDate,
      reminderAt: effectiveReminderAt,
      description: hasVariables && rawDescription ? applyVars(rawDescription) : rawDescription,
      createdAt: now,
      updatedAt: now,
    });

    log.info({ taskId: task.id, templateId: template.id }, "Task created from template");
    // Track template usage
    store.incrementTemplateUsage(template.id).catch(() => {});
    return reply.code(201).send({ task });
  });

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

    const body = req.body as {
      commandText?: string;
      description?: string;
      priority?: TaskPriority;
      tags?: string[];
      assignedDeviceId?: string;
      dueDate?: string;
    };

    if (!body.commandText || body.commandText.trim().length === 0) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "commandText is required" } });
    }

    const now = new Date().toISOString();
    const task = await store.createTask({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: "web",
      feishuMessageId: `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      feishuChatId: "",
      feishuUserId: (authCtx as { username?: string }).username ?? "web_user",
      commandText: body.commandText.trim(),
      status: "pending",
      priority: body.priority ?? "normal",
      tags: body.tags,
      assignedDeviceId: body.assignedDeviceId,
      dueDate: body.dueDate,
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

    const { q, status, from, to, limit, deviceId, tags, priority } = req.query as {
      q?: string;
      status?: TaskStatus;
      from?: string;
      to?: string;
      limit?: number;
      deviceId?: string;
      tags?: string;
      priority?: string;
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
    const tasks = await store.searchTasks({ q, status, priority: priority as TaskPriority | undefined, from, to, limit, deviceId, tags: parsedTags });
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

  // POST /api/tasks/bulk/status - bulk status update (requires tasks.status)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/status", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.status");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[]; status?: TaskStatus };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }
    if (!body?.status) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Missing 'status' in request body" },
      });
    }

    const validStatuses: TaskStatus[] = ["pending", "picked", "running", "done", "failed"];
    if (!validStatuses.includes(body.status)) {
      return reply.code(400).send({
        error: { code: "invalid_status", message: `Invalid status: ${body.status}` },
      });
    }

    const result = await store.bulkUpdateStatus(body.ids, body.status);
    log.info({ count: result.updated, errors: result.errors.length }, "Bulk status update completed");

    if (auditStore && result.updated > 0) {
      await auditStore.log({
        action: "task.status_changed",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.updated, status: body.status, ids: body.ids, errors: result.errors },
      });
    }

    // Dispatch webhooks for each successfully updated task
    if (webhookStore && result.updated > 0) {
      for (const taskId of body.ids) {
        if (result.errors.includes(taskId)) continue;
        const task = await store.getTask(taskId);
        if (task) {
          dispatchWebhook(webhookStore, "task.status_changed", task, { bulk: true, status: body.status }).catch(() => {});
        }
      }
    }

    // Send proactive Feishu notifications for configured status transitions
    if (feishuClient && notifyOnStatusChange?.includes(body.status) && result.updated > 0) {
      for (const taskId of body.ids) {
        if (result.errors.includes(taskId)) continue;
        const task = await store.getTask(taskId);
        if (task?.feishuMessageId) {
          // For bulk updates, we don't know the previous status, so use a simpler card
          const card = buildCustomCard(
            `🔄 Task Status Updated`,
            `**Status:** ${STATUS_LABELS[body.status]}\n**Command:** ${task.commandText}\n\n_Bulk status update applied._`,
            STATUS_COLORS[body.status],
          );
          feishuClient.sendCardMessage({ messageId: task.feishuMessageId, card }).catch((err) => {
            log.warn({ taskId, status: body.status, err: err instanceof Error ? err.message : String(err) }, "Failed to send bulk status change notification to Feishu");
          });
        }
      }
    }

    // Notify task watchers via direct Feishu message (bulk)
    if (feishuClient && userStore && result.updated > 0) {
      for (const taskId of body.ids) {
        if (result.errors.includes(taskId)) continue;
        const task = await store.getTask(taskId);
        if (task) {
          const watchers = await store.listWatchers(taskId);
          for (const watcher of watchers) {
            const user = await userStore.getUserById(watcher.userId);
            if (user?.feishuUserId) {
              const watcherCard = buildWatcherNotificationCard(task, "unknown", body.status, user.username);
              feishuClient.sendDirectCardMessage({ feishuUserId: user.feishuUserId, card: watcherCard }).catch((err) => {
                log.warn({ taskId, watcherUserId: watcher.userId, err: err instanceof Error ? err.message : String(err) }, "Failed to send bulk watcher notification");
              });
            }
          }
        }
      }
    }

    return reply.send({ ok: true, ...result });
  });

  // POST /api/tasks/bulk/assign - bulk assign tasks (requires tasks.assign)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/assign", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.assign");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[]; deviceId?: string };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }
    if (typeof body?.deviceId !== "string" || body.deviceId.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'deviceId' (non-empty string)" },
      });
    }

    const result = await store.bulkAssign(body.ids, body.deviceId.trim());
    log.info({ count: result.updated, deviceId: body.deviceId, errors: result.errors.length }, "Bulk assign completed");

    if (auditStore && result.updated > 0) {
      await auditStore.log({
        action: "task.assigned",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.updated, deviceId: body.deviceId.trim(), ids: body.ids, errors: result.errors },
      });
    }

    return reply.send({ ok: true, ...result });
  });

  // POST /api/tasks/bulk/delete - bulk delete tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/delete", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[] };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }

    const result = await store.bulkDelete(body.ids);
    log.info({ count: result.deleted, errors: result.errors.length }, "Bulk delete completed");

    if (auditStore && result.deleted > 0) {
      await auditStore.log({
        action: "task.status_changed",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, action: "delete", count: result.deleted, ids: body.ids, errors: result.errors },
      });
    }

    // Broadcast SSE events for each deleted task
    for (const taskId of body.ids) {
      if (!result.errors.includes(taskId)) {
        broadcastTaskDeleted(taskId);
      }
    }

    return reply.send({ ok: true, ...result });
  });

  // POST /api/tasks/bulk/tags/add - add tags to multiple tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/tags/add", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[]; tags?: string[] };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }
    if (!Array.isArray(body?.tags) || body.tags.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'tags' (non-empty array of strings)" },
      });
    }

    // Validate all tags are non-empty strings
    const validTags = body.tags
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter((t) => t.length > 0);
    if (validTags.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "All tags must be non-empty strings" },
      });
    }

    const result = await store.bulkAddTags(body.ids, validTags);
    log.info({ count: result.updated, tags: validTags, errors: result.errors.length }, "Bulk add tags completed");

    if (auditStore && result.updated > 0) {
      await auditStore.log({
        action: "task.tags_added",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.updated, tags: validTags, ids: body.ids, errors: result.errors },
      });
    }

    return reply.send({ ok: true, ...result });
  });

  // POST /api/tasks/bulk/tags/remove - remove a tag from multiple tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/tags/remove", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[]; tag?: string };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }
    if (typeof body?.tag !== "string" || body.tag.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'tag' (non-empty string)" },
      });
    }

    const result = await store.bulkRemoveTags(body.ids, body.tag.trim());
    log.info({ count: result.updated, tag: body.tag, errors: result.errors.length }, "Bulk remove tag completed");

    if (auditStore && result.updated > 0) {
      await auditStore.log({
        action: "task.tags_removed",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.updated, tag: body.tag.trim(), ids: body.ids, errors: result.errors },
      });
    }

    return reply.send({ ok: true, ...result });
  });

  // POST /api/tasks/bulk/archive - archive (soft-delete) multiple tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/archive", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[] };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }

    const archived: string[] = [];
    const errors: string[] = [];
    for (const id of body.ids) {
      try {
        await store.archiveTask(id);
        archived.push(id);
      } catch (e) {
        errors.push(id);
      }
    }

    log.info({ count: archived.length, errors: errors.length }, "Bulk archive completed");

    if (auditStore && archived.length > 0) {
      await auditStore.log({
        action: "task.status_changed",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, action: "archive", count: archived.length, ids: body.ids, errors },
      });
    }

    // Broadcast SSE events for each archived task
    for (const taskId of archived) {
      const task = await store.getTask(taskId);
      if (task) {
        broadcastTaskUpdated(task);
      }
    }

    return reply.send({ ok: true, archived: archived.length, errors });
  });

  // POST /api/tasks/bulk/unarchive - restore multiple archived tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/unarchive", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[] };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }

    const restored: string[] = [];
    const errors: string[] = [];
    for (const id of body.ids) {
      try {
        await store.unarchiveTask(id);
        restored.push(id);
      } catch (e) {
        errors.push(id);
      }
    }

    log.info({ count: restored.length, errors: errors.length }, "Bulk unarchive completed");

    if (auditStore && restored.length > 0) {
      await auditStore.log({
        action: "task.status_changed",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, action: "unarchive", count: restored.length, ids: body.ids, errors },
      });
    }

    // Broadcast SSE events for each restored task
    for (const taskId of restored) {
      const task = await store.getTask(taskId);
      if (task) {
        broadcastTaskUpdated(task);
      }
    }

    return reply.send({ ok: true, restored: restored.length, errors });
  });

  // POST /api/tasks/bulk/priority - bulk update priority for multiple tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/priority", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[]; priority?: TaskPriority };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }
    if (!body?.priority) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Missing 'priority' in request body" },
      });
    }

    const validPriorities: TaskPriority[] = ["low", "normal", "high", "urgent"];
    if (!validPriorities.includes(body.priority)) {
      return reply.code(400).send({
        error: { code: "invalid_priority", message: `Invalid priority: ${body.priority}. Must be one of: low, normal, high, urgent` },
      });
    }

    const result = await store.bulkUpdatePriority(body.ids, body.priority);
    log.info({ count: result.updated, priority: body.priority, errors: result.errors.length }, "Bulk priority update completed");

    if (auditStore && result.updated > 0) {
      await auditStore.log({
        action: "task.status_changed",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.updated, priority: body.priority, ids: body.ids, errors: result.errors },
      });
    }

    // Broadcast SSE events for each updated task
    for (const taskId of body.ids) {
      if (result.errors.includes(taskId)) continue;
      const task = await store.getTask(taskId);
      if (task) {
        broadcastTaskUpdated(task);
      }
    }

    return reply.send({ ok: true, ...result });
  });

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

  // GET /api/tasks/export - export all tasks, comments, dependencies, templates, scheduled tasks (requires tasks.read)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get("/api/tasks/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    try {
      const data = await store.exportAll();
      log.info({ taskCount: data.tasks.length, commentCount: data.comments.length }, "Tasks exported");
      return reply.send(data);
    } catch (e) {
      throw e;
    }
  });

  // GET /api/tasks/export.csv - export all tasks as CSV (requires tasks.read)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.get("/api/tasks/export.csv", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    try {
      const tasks = await store.getAllTasks();

      // CSV header
      const headers = [
        "id", "source", "feishuMessageId", "feishuChatId", "feishuUserId",
        "commandText", "status", "priority", "assignedDeviceId",
        "dueDate", "reminderAt", "pinned", "createdAt", "updatedAt",
        "resultSummary", "resultDetails", "tags",
      ];

      function csvEscape(val: unknown): string {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }

      const rows = tasks.map(t => [
        csvEscape(t.id),
        csvEscape(t.source),
        csvEscape(t.feishuMessageId),
        csvEscape(t.feishuChatId),
        csvEscape(t.feishuUserId),
        csvEscape(t.commandText),
        csvEscape(t.status),
        csvEscape(t.priority),
        csvEscape(t.assignedDeviceId),
        csvEscape(t.dueDate),
        csvEscape(t.reminderAt),
        csvEscape(t.pinned ? "true" : "false"),
        csvEscape(t.createdAt),
        csvEscape(t.updatedAt),
        csvEscape(t.resultSummary),
        csvEscape(t.resultDetails),
        csvEscape(t.tags?.join("; ") ?? ""),
      ].join(","));

      const csv = [headers.join(","), ...rows].join("\n");

      log.info({ taskCount: tasks.length }, "Tasks exported as CSV");
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="tasks-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv);
    } catch (e) {
      throw e;
    }
  });

  // POST /api/tasks/import - import tasks from JSON payload (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/import", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { tasks?: unknown[]; version?: number; mode?: string } & Record<string, unknown>;
    if (!body || !Array.isArray(body.tasks)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must be a valid export payload with 'tasks' array" },
      });
    }

    const mode = (body.mode as string) === "overwrite" ? "overwrite" : "skip";

    try {
      const result = await store.importAll(body as never, mode);
      log.info({ imported: result.imported, skipped: result.skipped, errors: result.errors.length }, "Tasks imported");
      if (auditStore) {
        await auditStore.log({
          action: "task.created",
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "import", imported: result.imported, skipped: result.skipped, errorCount: result.errors.length },
        });
      }
      return reply.send({ ok: true, ...result });
    } catch (e) {
      if (e instanceof Error && e.message.includes("Invalid export data")) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: e.message },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/import-csv - import tasks from CSV text with column mapping (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/import-csv", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as {
      csv?: string;
      columnMap?: Record<string, string>;
      defaultPriority?: string;
      defaultTags?: string[];
      delimiter?: string;
    } & Record<string, unknown>;

    if (!body || typeof body.csv !== "string" || body.csv.trim().length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'csv' string with CSV data" },
      });
    }

    try {
      const delimiter = (body.delimiter as string) || ",";
      const lines = body.csv.split("\n").filter((l: string) => l.trim().length > 0);
      if (lines.length < 2) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: "CSV must have a header row and at least one data row" },
        });
      }

      // Parse CSV header
      const headerLine = lines[0];
      const headers = headerLine.split(delimiter).map((h: string) => h.trim().replace(/^"|"$/g, ""));

      // Column mapping: CSV column name -> Task field name
      const columnMap = body.columnMap ?? {};
      const defaultPriority = (body.defaultPriority as string) || "normal";
      const defaultTags = body.defaultTags ?? [];

      const imported: string[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(delimiter).map((v: string) => v.trim().replace(/^"|"$/g, ""));
          const row: Record<string, string> = {};
          headers.forEach((h: string, idx: number) => {
            row[h] = values[idx] ?? "";
          });

          // Map CSV columns to task fields
          const commandText = row[columnMap["commandText"] ?? columnMap["title"] ?? columnMap["name"] ?? headers[0]] ?? "";
          if (!commandText) {
            errors.push(`Row ${i + 1}: empty commandText/title, skipped`);
            continue;
          }

          const taskId = `task_csv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const priority = (row[columnMap["priority"] ?? "priority"] as string) || defaultPriority;
          const tagsStr = row[columnMap["tags"] ?? "tags"] ?? "";
          const tags = tagsStr ? tagsStr.split(/[;,]/).map((t: string) => t.trim()).filter(Boolean) : defaultTags;
          const dueDate = row[columnMap["dueDate"] ?? columnMap["due_date"] ?? "dueDate"] ?? undefined;
          const description = row[columnMap["description"] ?? "description"] ?? undefined;

          const now = new Date().toISOString();
          const task = {
            id: taskId,
            source: "mcp" as const,
            feishuMessageId: `csv_${taskId}`,
            feishuChatId: "",
            feishuUserId: "",
            commandText,
            status: "pending" as const,
            priority: (priority as TaskPriority) || "normal",
            tags: tags.length > 0 ? tags : undefined,
            dueDate: dueDate || undefined,
            description: description || undefined,
            createdAt: now,
            updatedAt: now,
          };

          await store.createTask(task);
          imported.push(taskId);
        } catch (rowErr) {
          errors.push(`Row ${i + 1}: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
        }
      }

      log.info({ imported: imported.length, errors: errors.length }, "Tasks imported from CSV");
      if (auditStore) {
        await auditStore.log({
          action: "task.created",
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { action: "csv_import", imported: imported.length, errorCount: errors.length },
        });
      }
      return reply.send({ ok: true, imported: imported.length, errors, taskIds: imported });
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(400).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
  });

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

  // ── Task Dependencies ──────────────────────────────────────────────

  // GET /api/tasks/:id/dependencies - get dependencies for a task (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/dependencies", async (req, reply) => {
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

    const dependencyIds = await store.getDependencies(id);
    const blocked = await store.isTaskBlocked(id);

    // Fetch full dependency task objects
    const dependencies: Array<{ id: string; status: string; commandText: string }> = [];
    for (const depId of dependencyIds) {
      const depTask = await store.getTask(depId);
      if (depTask) {
        dependencies.push({ id: depTask.id, status: depTask.status, commandText: depTask.commandText });
      }
    }

    // Also get dependents (tasks waiting on this one)
    const dependentIds = await store.getDependents(id);

    return reply.send({
      dependencies,
      dependentIds,
      blocked,
    });
  });

  // POST /api/tasks/:id/dependencies - set dependencies for a task (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { dependsOn: string[] };
  }>("/api/tasks/:id/dependencies", async (req, reply) => {
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
    const body = req.body as { dependsOn?: string[] };

    if (!Array.isArray(body?.dependsOn)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'dependsOn' (array of task IDs)" },
      });
    }

    // Validate all IDs are strings
    const validIds = body.dependsOn.filter((d): d is string => typeof d === "string" && d.trim() !== "");
    if (validIds.length !== body.dependsOn.length) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "All dependency IDs must be non-empty strings" },
      });
    }

    try {
      const task = await store.setDependencies(id, validIds);
      log.info({ taskId: id, dependsOn: validIds }, "Task dependencies set");
      if (auditStore) {
        await auditStore.log({
          action: "task.dependencies_set",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { dependsOn: validIds },
        });
      }
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && (e.message.includes("Circular dependency") || e.message.includes("cannot depend on itself"))) {
        return reply.code(409).send({
          error: { code: "invalid_dependency", message: e.message },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/dependencies/:depId - remove a specific dependency (requires tasks.write)
  server.delete<{
    Params: { id: string; depId: string };
  }>("/api/tasks/:id/dependencies/:depId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, depId } = req.params;

    try {
      // Get current dependencies, remove the specified one, and re-set
      const currentDeps = await store.getDependencies(id);
      if (!currentDeps.includes(depId)) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Dependency not found: ${depId}` },
        });
      }
      const newDeps = currentDeps.filter((d) => d !== depId);
      const task = await store.setDependencies(id, newDeps);
      log.info({ taskId: id, removedDep: depId }, "Task dependency removed");
      if (auditStore) {
        await auditStore.log({
          action: "task.dependencies_set",
          taskId: id,
          actor: authCtx.user?.username ?? "api",
          actorType: "api",
          details: { removed: depId, dependsOn: newDeps },
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

  // GET /api/tasks/:id/dependency-graph - full dependency tree (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/dependency-graph", async (req, reply) => {
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

    try {
      const graph = await store.getDependencyGraph(id);
      return reply.send({ graph });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/lock - lock a task for exclusive processing (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { deviceId?: string; ttlMs?: number };
  }>("/api/tasks/:id/lock", async (req, reply) => {
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
    const body = req.body as { deviceId?: string; ttlMs?: number };

    // Determine the device ID — from body, auth context, or fallback to "api"
    const deviceId = body?.deviceId ?? authCtx.user?.username ?? "api";
    const ttlMs = body?.ttlMs ?? 300000; // Default 5 minutes

    try {
      const lock = await store.lockTask(id, deviceId, ttlMs);
      log.info({ taskId: id, deviceId, expiresAt: lock.expiresAt }, "Task locked");
      return reply.send({ lock });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      if (e instanceof Error && e.message.includes("locked by")) {
        return reply.code(409).send({
          error: { code: "locked", message: e.message },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/lock - unlock a task (requires tasks.write)
  server.delete<{
    Params: { id: string };
    Body: { deviceId?: string };
  }>("/api/tasks/:id/lock", async (req, reply) => {
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
    const body = req.body as { deviceId?: string };
    const deviceId = body?.deviceId ?? authCtx.user?.username ?? "api";

    try {
      const unlocked = await store.unlockTask(id, deviceId);
      if (!unlocked) {
        return reply.send({ ok: true, message: "No lock found for this task" });
      }
      log.info({ taskId: id, deviceId }, "Task unlocked");
      return reply.send({ ok: true });
    } catch (e) {
      if (e instanceof Error && e.message.includes("locked by")) {
        return reply.code(403).send({
          error: { code: "lock_mismatch", message: e.message },
        });
      }
      throw e;
    }
  });

  // GET /api/tasks/:id/lock - check if a task is locked (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/lock", async (req, reply) => {
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
    const lock = await store.getTaskLock(id);
    return reply.send({ locked: !!lock, lock: lock ?? null });
  });

  // ── Task Subtasks ────────────────────────────────────────────

  // POST /api/tasks/:id/subtasks - create a subtask (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { title?: string; commandText?: string };
  }>("/api/tasks/:id/subtasks", async (req, reply) => {
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
    const body = req.body as { title?: string; commandText?: string };

    if (typeof body?.title !== "string" || body.title.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'title' (non-empty string)" },
      });
    }
    if (typeof body?.commandText !== "string" || body.commandText.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'commandText' (non-empty string)" },
      });
    }

    try {
      const subtask = await store.createSubtask(id, body.title.trim(), body.commandText.trim());
      log.info({ parentId: id, subtaskId: subtask.id, title: subtask.title }, "Subtask created");
      if (auditStore) {
        await auditStore.log({
          action: "task.subtask_created",
          taskId: id,
          actor: authCtx.user?.username ?? "system",
          actorType: "api",
          details: { subtaskId: subtask.id, title: subtask.title },
        });
      }
      return reply.code(201).send({ subtask });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // GET /api/tasks/:id/subtasks - list subtasks for a task (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/subtasks", async (req, reply) => {
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

    // Verify parent task exists
    const task = await store.getTask(id);
    if (!task) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Task not found: ${id}` },
      });
    }

    const subtasks = await store.listSubtasks(id);
    return reply.send({ subtasks });
  });

  // GET /api/tasks/:id/subtasks/:subtaskId - get a specific subtask (requires tasks.read)
  server.get<{
    Params: { id: string; subtaskId: string };
  }>("/api/tasks/:id/subtasks/:subtaskId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, subtaskId } = req.params;
    const subtask = await store.getSubtask(id, subtaskId);
    if (!subtask) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Subtask not found: ${subtaskId}` },
      });
    }
    return reply.send({ subtask });
  });

  // POST /api/tasks/:id/subtasks/:subtaskId/status - update subtask status (requires tasks.write)
  server.post<{
    Params: { id: string; subtaskId: string };
    Body: { status?: string };
  }>("/api/tasks/:id/subtasks/:subtaskId/status", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, subtaskId } = req.params;
    const body = req.body as { status?: string };

    const validStatuses = ["pending", "picked", "running", "done", "failed"];
    if (!body?.status || !validStatuses.includes(body.status)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      });
    }

    try {
      const subtask = await store.updateSubtaskStatus(id, subtaskId, body.status as TaskStatus);
      log.info({ parentId: id, subtaskId, status: body.status }, "Subtask status updated");
      if (auditStore) {
        await auditStore.log({
          action: "task.subtask_status_changed",
          taskId: id,
          actor: authCtx.user?.username ?? "system",
          actorType: "api",
          details: { subtaskId, status: body.status },
        });
      }
      return reply.send({ subtask });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: e.message },
        });
      }
      if (e instanceof Error && e.message.includes("Invalid status")) {
        return reply.code(409).send({
          error: { code: "invalid_status", message: e.message },
        });
      }
      throw e;
    }
  });

  // POST /api/tasks/:id/subtasks/:subtaskId/result - report subtask result (requires tasks.write)
  server.post<{
    Params: { id: string; subtaskId: string };
    Body: { success?: boolean; summary?: string; details?: string };
  }>("/api/tasks/:id/subtasks/:subtaskId/result", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, subtaskId } = req.params;
    const body = req.body as { success?: boolean; summary?: string; details?: string };

    if (typeof body?.success !== "boolean") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'success' (boolean)" },
      });
    }
    if (typeof body?.summary !== "string" || body.summary.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'summary' (non-empty string)" },
      });
    }

    try {
      const subtask = await store.saveSubtaskResult(id, subtaskId, body.success, body.summary.trim(), body.details);
      log.info({ parentId: id, subtaskId, success: body.success }, "Subtask result saved");
      if (auditStore) {
        await auditStore.log({
          action: "task.subtask_result_reported",
          taskId: id,
          actor: authCtx.user?.username ?? "system",
          actorType: "api",
          details: { subtaskId, success: body.success, summaryLength: body.summary.length },
        });
      }
      return reply.send({ subtask });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: e.message },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/subtasks/:subtaskId - delete a subtask (requires tasks.write)
  server.delete<{
    Params: { id: string; subtaskId: string };
  }>("/api/tasks/:id/subtasks/:subtaskId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, subtaskId } = req.params;
    const deleted = await store.deleteSubtask(id, subtaskId);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Subtask not found: ${subtaskId}` },
      });
    }
    log.info({ parentId: id, subtaskId }, "Subtask deleted");
    if (auditStore) {
      await auditStore.log({
        action: "task.subtask_deleted",
        taskId: id,
        actor: authCtx.user?.username ?? "system",
        actorType: "api",
        details: { subtaskId },
      });
    }
    return reply.send({ ok: true });
  });

  // GET /api/tasks/:id/comments - list comments for a task (requires tasks.read)
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/comments", async (req, reply) => {
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
    const comments = await store.listComments(id);
    return reply.send({ comments, count: comments.length });
  });

  // POST /api/tasks/:id/comments - add a comment to a task (requires tasks.write)
  server.post<{
    Params: { id: string };
    Body: { body: string };
  }>("/api/tasks/:id/comments", async (req, reply) => {
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
      const authorType: AuditLogEntry["actorType"] = authCtx.user?.username ? "api" : "system";
      const author = authCtx.user?.username ?? "system";
      const comment = await store.addComment(id, author, authorType, body.body);
      log.info({ taskId: id, commentId: comment.id }, "Comment added to task");
      if (auditStore) {
        await auditStore.log({
          action: "task.comment_added",
          taskId: id,
          actor: author,
          actorType: authorType,
          details: { commentId: comment.id, body: body.body },
        });
      }
      return reply.send({ comment });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Task not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/tasks/:id/comments/:commentId - delete a comment (requires tasks.write)
  server.delete<{
    Params: { id: string; commentId: string };
  }>("/api/tasks/:id/comments/:commentId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id, commentId } = req.params;
    const parsedCommentId = Number(commentId);

    if (isNaN(parsedCommentId) || parsedCommentId <= 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "commentId must be a positive integer" },
      });
    }

    const deleted = await store.deleteComment(parsedCommentId, id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Comment not found: ${commentId}` },
      });
    }

    log.info({ taskId: id, commentId: parsedCommentId }, "Comment deleted from task");
    if (auditStore) {
      await auditStore.log({
        action: "task.comment_deleted",
        taskId: id,
        actor: authCtx.user?.username ?? "system",
        actorType: "api",
        details: { commentId: parsedCommentId },
      });
    }
    return reply.send({ ok: true });
  });

  // ── SLA Management ──────────────────────────────────────────────

  // GET /api/sla/policies - list all SLA policies (requires tasks.read)
  server.get("/api/sla/policies", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const policies = await store.listSlaPolicies();
    return reply.send({ policies });
  });

  // GET /api/sla/policies/:id - get an SLA policy by ID (requires tasks.read)
  server.get<{ Params: { id: string } }>("/api/sla/policies/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const policy = await store.getSlaPolicy(req.params.id);
    if (!policy) {
      return reply.code(404).send({
        error: { code: "not_found", message: `SLA policy not found: ${req.params.id}` },
      });
    }
    return reply.send({ policy });
  });

  // POST /api/sla/policies - create an SLA policy (requires tasks.write)
  server.post("/api/sla/policies", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as {
      name?: string;
      description?: string;
      targetMinutes?: number;
      warningThresholdPercent?: number;
      matchPriorities?: string[];
      matchTags?: string[];
      enabled?: boolean;
    };

    if (typeof body?.name !== "string" || body.name.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'name' (non-empty string)" },
      });
    }
    if (typeof body?.targetMinutes !== "number" || body.targetMinutes <= 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'targetMinutes' (positive number in minutes)" },
      });
    }

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.matchPriorities && body.matchPriorities.length > 0) {
      const invalid = body.matchPriorities.filter((p) => !validPriorities.includes(p));
      if (invalid.length > 0) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: `Invalid priorities: ${invalid.join(", ")}. Must be one of: ${validPriorities.join(", ")}` },
        });
      }
    }

    const policy = await store.createSlaPolicy({
      name: body.name.trim(),
      description: body.description,
      targetMinutes: body.targetMinutes,
      warningThresholdPercent: body.warningThresholdPercent ?? 80,
      matchPriorities: body.matchPriorities as TaskPriority[] | undefined,
      matchTags: body.matchTags,
      enabled: body.enabled ?? true,
      createdBy: authCtx.user?.username ?? "api",
    });
    log.info({ policyId: policy.id, name: policy.name }, "SLA policy created");
    return reply.code(201).send({ policy });
  });

  // PUT /api/sla/policies/:id - update an SLA policy (requires tasks.write)
  server.put<{ Params: { id: string } }>("/api/sla/policies/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as {
      name?: string;
      description?: string;
      targetMinutes?: number;
      warningThresholdPercent?: number;
      matchPriorities?: string[];
      matchTags?: string[];
      enabled?: boolean;
    };

    if (body.targetMinutes !== undefined && (typeof body.targetMinutes !== "number" || body.targetMinutes <= 0)) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "'targetMinutes' must be a positive number" },
      });
    }

    const validPriorities = ["low", "normal", "high", "urgent"];
    if (body.matchPriorities && body.matchPriorities.length > 0) {
      const invalid = body.matchPriorities.filter((p) => !validPriorities.includes(p));
      if (invalid.length > 0) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: `Invalid priorities: ${invalid.join(", ")}` },
        });
      }
    }

    try {
      const policy = await store.updateSlaPolicy(req.params.id, {
        name: body.name,
        description: body.description,
        targetMinutes: body.targetMinutes,
        warningThresholdPercent: body.warningThresholdPercent,
        matchPriorities: body.matchPriorities as TaskPriority[] | undefined,
        matchTags: body.matchTags,
        enabled: body.enabled,
      });
      log.info({ policyId: policy.id }, "SLA policy updated");
      return reply.send({ policy });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `SLA policy not found: ${req.params.id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/sla/policies/:id - delete an SLA policy (requires tasks.write)
  server.delete<{ Params: { id: string } }>("/api/sla/policies/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const deleted = await store.deleteSlaPolicy(req.params.id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `SLA policy not found: ${req.params.id}` },
      });
    }
    log.info({ policyId: req.params.id }, "SLA policy deleted");
    return reply.send({ ok: true });
  });

  // GET /api/sla/summary - get SLA compliance summary (requires tasks.read)
  server.get("/api/sla/summary", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const summary = await store.getSlaSummary();
    return reply.send(summary);
  });

  // GET /api/sla/breaches - list active SLA breaches (requires tasks.read)
  server.get("/api/sla/breaches", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const breaches = await store.listSlaBreaches();
    return reply.send({ breaches, count: breaches.length });
  });

  // POST /api/sla/check - trigger SLA breach detection (requires tasks.write)
  server.post("/api/sla/check", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const result = await store.checkAndRecordSlaBreaches();
    log.info({ warnings: result.warnings, breaches: result.breaches }, "SLA breach check completed");

    // Record SLA metrics
    if (result.warnings > 0) {
      for (let i = 0; i < result.warnings; i++) {
        recordSlaEvent("warning");
      }
    }
    if (result.breaches > 0) {
      for (let i = 0; i < result.breaches; i++) {
        recordSlaEvent("breach");
      }
    }

    // Send Feishu notifications for SLA breaches and warnings
    if (feishuClient && result.details.length > 0) {
      for (const detail of result.details) {
        if (detail.taskFeishuMessageId) {
          const card = buildSlaBreachCard(
            {
              id: detail.taskId,
              feishuMessageId: detail.taskFeishuMessageId,
              commandText: detail.taskCommandText,
              priority: detail.taskPriority,
              status: detail.taskStatus,
              tags: detail.taskTags,
            } as any,
            detail.policyName,
            detail.breachType,
            detail.targetMinutes,
            detail.actualMinutes,
          );
          feishuClient.sendCardMessage({ messageId: detail.taskFeishuMessageId, card }).catch((err) => {
            log.warn({ taskId: detail.taskId, err: err instanceof Error ? err.message : String(err) }, "Failed to send SLA breach notification to Feishu");
          });
        }
      }
    }

    return reply.send({ ok: true, ...result });
  });

  // GET /api/tasks/:id/sla - get SLA status for a specific task (requires tasks.read)
  server.get<{ Params: { id: string } }>("/api/tasks/:id/sla", async (req, reply) => {
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

    const slaStatus = await store.getSlaStatusForTask(id);
    return reply.send(slaStatus);
  });

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

  // ─── Saved Views ──────────────────────────────────────────────────────

  // GET /api/saved-views - list saved views (requires tasks.read)
  server.get("/api/saved-views", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { createdBy } = req.query as { createdBy?: string };
    const views = await store.listSavedViews(createdBy);
    return reply.send({ views, count: views.length });
  });

  // GET /api/saved-views/:id - get saved view details (requires tasks.read)
  server.get("/api/saved-views/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params as { id: string };
    const view = await store.getSavedView(id);
    if (!view) {
      return reply.code(404).send({ error: { code: "not_found", message: "Saved view not found" } });
    }
    return reply.send(view);
  });

  // POST /api/saved-views - create a saved view (requires tasks.write)
  server.post("/api/saved-views", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { name, filters } = req.body as { name?: string; filters?: Record<string, unknown> };
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "name is required" } });
    }
    if (!filters || typeof filters !== "object") {
      return reply.code(400).send({ error: { code: "invalid_request", message: "filters object is required" } });
    }

    const createdBy = authCtx.user?.username ?? "api";
    const view = await store.createSavedView(name.trim(), createdBy, filters as import("../../shared/types.js").SavedViewFilters);

    if (auditStore) {
      await auditStore.log({
        action: "task.created",
        actor: createdBy,
        actorType: "api",
        details: { entity: "saved_view", viewId: view.id, viewName: view.name },
      });
    }

    return reply.code(201).send(view);
  });

  // PUT /api/saved-views/:id - update a saved view (requires tasks.write)
  server.put("/api/saved-views/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params as { id: string };
    const { name, filters } = req.body as { name?: string; filters?: Record<string, unknown> };
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (filters !== undefined) updates.filters = filters;

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "At least one of name or filters must be provided" } });
    }

    try {
      const view = await store.updateSavedView(id, updates as Partial<import("../../shared/types.js").SavedView>);
      return reply.send(view);
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({ error: { code: "not_found", message: "Saved view not found" } });
      }
      throw e;
    }
  });

  // DELETE /api/saved-views/:id - delete a saved view (requires tasks.write)
  server.delete("/api/saved-views/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params as { id: string };
    const deleted = await store.deleteSavedView(id);
    if (!deleted) {
      return reply.code(404).send({ error: { code: "not_found", message: "Saved view not found" } });
    }
    return reply.send({ ok: true });
  });

  // ===== Task Watchers =====

  // GET /api/tasks/:id/watchers - list watchers for a task
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/watchers", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const watchers = await store.listWatchers(id);
      return reply.send({ watchers, count: watchers.length });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to list watchers");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to list watchers" } });
    }
  });

  // POST /api/tasks/:id/watchers - add yourself as a watcher
  server.post<{
    Params: { id: string };
  }>("/api/tasks/:id/watchers", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const userId = authCtx.user?.id ?? "anonymous";
      const watcher = await store.addWatcher(id, userId);
      log.info({ taskId: id, userId }, "Task watcher added");
      return reply.code(201).send({ watcher });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to add watcher");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to add watcher" } });
    }
  });

  // DELETE /api/tasks/:id/watchers - remove yourself as a watcher
  server.delete<{
    Params: { id: string };
  }>("/api/tasks/:id/watchers", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const userId = authCtx.user?.id ?? "anonymous";
      const removed = await store.removeWatcher(id, userId);
      log.info({ taskId: id, userId, removed }, "Task watcher removed");
      return reply.send({ ok: true, removed });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to remove watcher");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to remove watcher" } });
    }
  });

  // ===== Time Entry Routes =====

  // GET /api/tasks/:id/time-entries - list time entries for a task
  server.get<{
    Params: { id: string };
  }>("/api/tasks/:id/time-entries", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const entries = await store.listTimeEntries(id);
      return reply.send({ entries, count: entries.length });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to list time entries");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to list time entries" } });
    }
  });

  // POST /api/tasks/:id/time-entries - log a time entry (manual or timer-based)
  server.post<{
    Params: { id: string };
    Body: { startedAt?: string; endedAt?: string; durationMinutes?: number; description?: string; loggedBy?: string };
  }>("/api/tasks/:id/time-entries", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const { startedAt, endedAt, durationMinutes, description, loggedBy } = req.body ?? {};
      const now = new Date().toISOString();
      const start = startedAt ?? now;
      let end = endedAt;
      let duration = durationMinutes ?? 0;
      if (start && end && !durationMinutes) {
        duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
      }
      if (!end && !durationMinutes) {
        // Running entry (no end yet)
        end = undefined;
        duration = 0;
      }
      const actor = authCtx.user?.id ?? loggedBy ?? "anonymous";
      const entry = await store.createTimeEntry(id, start, end, duration, description ?? null, actor);
      return reply.code(201).send({ entry });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to create time entry");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to create time entry" } });
    }
  });

  // POST /api/tasks/:id/time-entries/start - start a timer for a task
  server.post<{
    Params: { id: string };
    Body: { description?: string; loggedBy?: string };
  }>("/api/tasks/:id/time-entries/start", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const { description, loggedBy } = req.body ?? {};
      const now = new Date().toISOString();
      const actor = authCtx.user?.id ?? loggedBy ?? "anonymous";
      const entry = await store.createTimeEntry(id, now, undefined, 0, description ?? null, actor);
      return reply.code(201).send({ entry });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to start time tracking");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to start time tracking" } });
    }
  });

  // POST /api/tasks/:id/time-entries/stop - stop a running timer
  server.post<{
    Params: { id: string; entryId?: string };
    Body: { entryId?: string };
  }>("/api/tasks/:id/time-entries/stop", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id } = req.params;
      const { entryId } = req.body ?? req.params;
      if (!entryId) {
        return reply.code(400).send({ error: { code: "invalid_request", message: "entryId is required" } });
      }
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const now = new Date().toISOString();
      const entry = await store.stopTimeEntry(id, entryId, now);
      return reply.send({ entry });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      const message = err instanceof Error ? err.message : "Failed to stop time tracking";
      return reply.code(400).send({ error: { code: "invalid_request", message } });
    }
  });

  // DELETE /api/tasks/:id/time-entries/:entryId - delete a time entry
  server.delete<{
    Params: { id: string; entryId: string };
  }>("/api/tasks/:id/time-entries/:entryId", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
      const { id, entryId } = req.params;
      const task = await store.getTask(id);
      if (!task) {
        return reply.code(404).send({ error: { code: "not_found", message: "Task not found" } });
      }
      const deleted = await store.deleteTimeEntry(id, entryId);
      if (!deleted) {
        return reply.code(404).send({ error: { code: "not_found", message: "Time entry not found" } });
      }
      return reply.send({ deleted: true });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.code === "unauthorized" ? 401 : err.code === "forbidden" ? 403 : 400).send({
          error: { code: err.code, message: err.message },
        });
      }
      log.error({ err }, "Failed to delete time entry");
      return reply.code(500).send({ error: { code: "internal_error", message: "Failed to delete time entry" } });
    }
  });

  // ── Task Relationships (Phase 58) ──────────────────────────────

  server.get<{ Params: { id: string } }>(
    "/api/tasks/:id/relationships",
    async (req, reply) => {
      const { id } = req.params;
      try {
        const relationships = await store.listRelationships(id);
        return reply.send({ relationships });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.code(404).send({ error: { code: "not_found", message: msg } });
        log.error({ err }, "Failed to list relationships");
        return reply.code(500).send({ error: { code: "internal_error", message: "Failed to list relationships" } });
      }
    }
  );

  server.post<{ Params: { id: string }; Body: { relatedTaskId: string; relationshipType: string } }>(
    "/api/tasks/:id/relationships",
    async (req, reply) => {
      const { id } = req.params;
      const { relatedTaskId, relationshipType } = req.body ?? {};
      const validTypes = ["depends_on", "blocks", "relates_to", "duplicates"];
      if (!relatedTaskId || !relationshipType || !validTypes.includes(relationshipType)) {
        return reply.code(400).send({ error: { code: "invalid_request", message: "relatedTaskId and valid relationshipType required" } });
      }
      try {
        await store.addRelationship(id, relatedTaskId, relationshipType as import("../../shared/types.js").TaskRelationshipType);
        return reply.send({ ok: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.code(404).send({ error: { code: "not_found", message: msg } });
        if (msg.includes("itself")) return reply.code(400).send({ error: { code: "invalid_request", message: msg } });
        log.error({ err }, "Failed to add relationship");
        return reply.code(500).send({ error: { code: "internal_error", message: "Failed to add relationship" } });
      }
    }
  );

  server.delete<{ Params: { id: string; relatedId: string }; Querystring: { type?: string } }>(
    "/api/tasks/:id/relationships/:relatedId",
    async (req, reply) => {
      const { id, relatedId } = req.params;
      const type = req.query.type as import("../../shared/types.js").TaskRelationshipType | undefined;
      try {
        await store.removeRelationship(id, relatedId, type);
        return reply.send({ ok: true });
      } catch (err: unknown) {
        log.error({ err }, "Failed to remove relationship");
        return reply.code(500).send({ error: { code: "internal_error", message: "Failed to remove relationship" } });
      }
    }
  );

  // Error handler
  server.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      const statusCode =
        error.code === "unauthorized"
          ? 401
          : error.code === "forbidden"
            ? 403
            : error.code === "not_found"
              ? 404
              : error.code === "invalid_status"
                ? 409
                : error.code === "invalid_request"
                  ? 400
                  : error.code === "rate_limited"
                    ? 429
                    : 500;
      return reply.code(statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
    return reply.code(500).send({
      error: { code: "internal_error", message: "Internal server error" },
    });
  });

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

  // ──────────────────────────────────────────────────────────
  // Cycle (Sprint) management routes
  // ──────────────────────────────────────────────────────────

  // GET /api/cycles — list all cycles
  server.get("/api/cycles", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const query = req.query as Record<string, unknown>;
    const status = typeof query["status"] === "string" ? query["status"] : undefined;
    try {
      const cycles = await store.listCycles(status as import("../../shared/types.js").CycleStatus | undefined);
      return reply.send({ cycles });
    } catch (e) {
      log.error({ err: e }, "Failed to list cycles");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/cycles/:id — get a single cycle
  server.get("/api/cycles/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const cycle = await store.getCycle(id);
      if (!cycle) {
        return reply.code(404).send({ error: { code: "not_found", message: `Cycle not found: ${id}` } });
      }
      return reply.send({ cycle });
    } catch (e) {
      log.error({ err: e, cycleId: id }, "Failed to get cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // POST /api/cycles — create a new cycle
  server.post("/api/cycles", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const body = req.body as Record<string, unknown>;
    if (!body.name || typeof body.name !== "string") {
      return reply.code(400).send({ error: { code: "invalid_request", message: "'name' is required" } });
    }
    if (!body.startDate || typeof body.startDate !== "string") {
      return reply.code(400).send({ error: { code: "invalid_request", message: "'startDate' is required" } });
    }
    if (!body.endDate || typeof body.endDate !== "string") {
      return reply.code(400).send({ error: { code: "invalid_request", message: "'endDate' is required" } });
    }
    try {
      const cycle = await store.createCycle({
        name: body.name as string,
        description: body.description as string | undefined,
        startDate: body.startDate as string,
        endDate: body.endDate as string,
        createdBy: authCtx.user?.id ?? "anonymous",
      });
      log.info({ cycleId: cycle.id, name: cycle.name }, "Cycle created");
      return reply.code(201).send({ cycle });
    } catch (e) {
      log.error({ err: e }, "Failed to create cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // PUT /api/cycles/:id — update a cycle
  server.put("/api/cycles/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    try {
      const cycle = await store.updateCycle(id, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        startDate: body.startDate as string | undefined,
        endDate: body.endDate as string | undefined,
        status: body.status as import("../../shared/types.js").CycleStatus | undefined,
      });
      log.info({ cycleId: id }, "Cycle updated");
      return reply.send({ cycle });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("not found")) {
        return reply.code(404).send({ error: { code: "not_found", message } });
      }
      log.error({ err: e, cycleId: id }, "Failed to update cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // DELETE /api/cycles/:id — delete a cycle
  server.delete("/api/cycles/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      await store.deleteCycle(id);
      log.info({ cycleId: id }, "Cycle deleted");
      return reply.send({ ok: true });
    } catch (e) {
      log.error({ err: e, cycleId: id }, "Failed to delete cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // POST /api/cycles/:id/tasks — add a task to a cycle
  server.post("/api/cycles/:id/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    if (!body.taskId || typeof body.taskId !== "string") {
      return reply.code(400).send({ error: { code: "invalid_request", message: "'taskId' is required" } });
    }
    try {
      const task = await store.addTaskToCycle(body.taskId as string, id);
      log.info({ cycleId: id, taskId: body.taskId }, "Task added to cycle");
      return reply.send({ task });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("not found")) {
        return reply.code(404).send({ error: { code: "not_found", message } });
      }
      log.error({ err: e, cycleId: id }, "Failed to add task to cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // DELETE /api/cycles/tasks/:taskId — remove a task from its cycle
  server.delete("/api/cycles/tasks/:taskId", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { taskId } = req.params as { taskId: string };
    try {
      const task = await store.removeTaskFromCycle(taskId);
      log.info({ taskId }, "Task removed from cycle");
      return reply.send({ task });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("not found")) {
        return reply.code(404).send({ error: { code: "not_found", message } });
      }
      log.error({ err: e, taskId }, "Failed to remove task from cycle");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/cycles/:id/tasks — list tasks in a cycle
  server.get("/api/cycles/:id/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const tasks = await store.listCycleTasks(id);
      return reply.send({ tasks });
    } catch (e) {
      log.error({ err: e, cycleId: id }, "Failed to list cycle tasks");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/cycles/:id/progress — cycle burndown and progress data
  server.get("/api/cycles/:id/progress", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "dashboard.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const progress = await store.getCycleProgress(id);
      return reply.send({ progress });
    } catch (e) {
      log.error({ err: e, cycleId: id }, "Failed to get cycle progress");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/activity - global activity feed across all tasks (requires tasks.read)
  server.get("/api/activity", async (req: FastifyRequest, reply: FastifyReply) => {
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
    try {
      const items = await store.getGlobalActivity(limit);
      return reply.send({ items, count: items.length });
    } catch (e) {
      log.error({ err: e }, "Failed to get global activity");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // ─── Module (Epic) Management Routes ───

  // GET /api/modules — list all modules with progress
  server.get("/api/modules", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { status } = req.query as { status?: string };
    try {
      const modules = await store.listModules(status as import("../../shared/types.js").ModuleStatus | undefined);
      return reply.send({ modules, count: modules.length });
    } catch (e) {
      log.error({ err: e }, "Failed to list modules");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/modules/:id — get a single module with progress
  server.get("/api/modules/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const mod = await store.getModule(id);
      if (!mod) {
        return reply.code(404).send({ error: { code: "not_found", message: `Module not found: ${id}` } });
      }
      return reply.send({ module: mod });
    } catch (e) {
      log.error({ err: e, moduleId: id }, "Failed to get module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // POST /api/modules — create a new module
  server.post("/api/modules", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const body = req.body as {
      name?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
    } | undefined;

    if (typeof body?.name !== "string" || body.name.trim() === "") {
      return reply.code(400).send({ error: { code: "validation_error", message: "Module name is required" } });
    }

    try {
      const mod = await store.createModule({
        name: body.name.trim(),
        description: body.description,
        startDate: body.startDate,
        endDate: body.endDate,
        createdBy: authCtx.user?.username ?? "api",
      });
      log.info({ moduleId: mod.id, name: mod.name }, "Module created");
      return reply.code(201).send({ module: mod });
    } catch (e) {
      log.error({ err: e }, "Failed to create module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // PUT /api/modules/:id — update a module
  server.put("/api/modules/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      targetCompletionPercent?: number;
    } | undefined;

    const validStatuses = ["planned", "active", "completed", "archived"];
    if (body?.status !== undefined && !validStatuses.includes(body.status)) {
      return reply.code(400).send({ error: { code: "validation_error", message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` } });
    }

    try {
      const mod = await store.updateModule(id, {
        name: body?.name,
        description: body?.description,
        status: body?.status as import("../../shared/types.js").ModuleStatus | undefined,
        startDate: body?.startDate,
        endDate: body?.endDate,
        targetCompletionPercent: body?.targetCompletionPercent,
      });
      log.info({ moduleId: id }, "Module updated");
      return reply.send({ module: mod });
    } catch (e) {
      if (e instanceof Error && e.message === "Module not found") {
        return reply.code(404).send({ error: { code: "not_found", message: `Module not found: ${id}` } });
      }
      log.error({ err: e, moduleId: id }, "Failed to update module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // DELETE /api/modules/:id — delete a module
  server.delete("/api/modules/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      await store.deleteModule(id);
      log.info({ moduleId: id }, "Module deleted");
      return reply.send({ success: true });
    } catch (e) {
      log.error({ err: e, moduleId: id }, "Failed to delete module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // POST /api/modules/:id/tasks — add a task to a module
  server.post("/api/modules/:id/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    const body = req.body as { taskId?: string } | undefined;
    if (typeof body?.taskId !== "string" || body.taskId.trim() === "") {
      return reply.code(400).send({ error: { code: "validation_error", message: "taskId is required" } });
    }
    try {
      const task = await store.addTaskToModule(body.taskId.trim(), id);
      log.info({ moduleId: id, taskId: body.taskId }, "Task added to module");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && (e.message === "Task not found" || e.message === "Module not found")) {
        return reply.code(404).send({ error: { code: "not_found", message: e.message } });
      }
      log.error({ err: e, moduleId: id }, "Failed to add task to module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // DELETE /api/modules/:id/tasks/:taskId — remove a task from its module
  server.delete("/api/modules/:id/tasks/:taskId", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { taskId } = req.params as { id: string; taskId: string };
    try {
      const task = await store.removeTaskFromModule(taskId);
      log.info({ taskId }, "Task removed from module");
      return reply.send({ task });
    } catch (e) {
      if (e instanceof Error && e.message === "Task not found") {
        return reply.code(404).send({ error: { code: "not_found", message: e.message } });
      }
      log.error({ err: e, taskId }, "Failed to remove task from module");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });

  // GET /api/modules/:id/tasks — list tasks in a module
  server.get("/api/modules/:id/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }
    const { id } = req.params as { id: string };
    try {
      const tasks = await store.listModuleTasks(id);
      return reply.send({ tasks, count: tasks.length });
    } catch (e) {
      log.error({ err: e, moduleId: id }, "Failed to list module tasks");
      return reply.code(500).send({ error: { code: "internal_error", message: "Internal server error" } });
    }
  });
}
