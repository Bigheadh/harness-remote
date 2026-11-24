import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskPriority, TaskStatus } from "../../../shared/types.js";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import { dispatchWebhook } from "../../webhooks/dispatcher.js";
import { broadcastTaskUpdated, broadcastTaskDeleted } from "../../sse/broadcaster.js";
import {
  buildTaskStatusCard,
  buildCustomCard,
  buildWatcherNotificationCard,
  STATUS_LABELS,
  STATUS_COLORS,
} from "../../feishu/card-builder.js";
import type { TaskRouteContext } from "./context.js";
import {
  BulkStatusBodySchema,
  BulkAssignBodySchema,
  BulkIdsBodySchema,
  parseBody,
} from "../../openapi/schemas.js";

export function registerBulkTaskRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, auditStore, webhookStore, feishuClient, userStore, notifyOnStatusChange, log } = ctx;

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

    const body = parseBody(BulkStatusBodySchema, req.body, reply);
    if (!body) return;

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

    const body = parseBody(BulkAssignBodySchema, req.body, reply);
    if (!body) return;

    const result = await store.bulkAssign(body.ids, body.deviceId);
    log.info({ count: result.updated, deviceId: body.deviceId, errors: result.errors.length }, "Bulk assign completed");

    if (auditStore && result.updated > 0) {
      await auditStore.log({
        action: "task.assigned",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.updated, deviceId: body.deviceId, ids: body.ids, errors: result.errors },
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

    const body = parseBody(BulkIdsBodySchema, req.body, reply);
    if (!body) return;

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

  // POST /api/tasks/bulk/due-date - bulk update due date for multiple tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/due-date", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "tasks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { ids?: string[]; dueDate?: string | null };
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'ids' (non-empty array of task IDs)" },
      });
    }

    const dueDate = body.dueDate ?? null;
    if (dueDate !== null && isNaN(Date.parse(dueDate))) {
      return reply.code(400).send({
        error: { code: "invalid_date", message: `Invalid date format: ${dueDate}. Use ISO 8601.` },
      });
    }

    const result = await store.bulkUpdateDueDate(body.ids, dueDate);
    log.info({ count: result.updated, dueDate, errors: result.errors.length }, "Bulk due date update completed");

    if (auditStore && result.updated > 0) {
      await auditStore.log({
        action: "task.status_changed",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.updated, dueDate, ids: body.ids, errors: result.errors },
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

  // POST /api/tasks/bulk/clone - clone multiple tasks (requires tasks.write)
  // NOTE: Must be registered before /api/tasks/:id to avoid matching as :id param
  server.post("/api/tasks/bulk/clone", async (req: FastifyRequest, reply: FastifyReply) => {
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

    if (body.ids.length > 100) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Cannot clone more than 100 tasks at once" },
      });
    }

    const result = await store.bulkCloneTasks(body.ids);
    log.info({ count: result.cloned, errors: result.errors.length }, "Bulk clone completed");

    if (auditStore && result.cloned > 0) {
      await auditStore.log({
        action: "task.created",
        actor: authCtx.user?.username ?? "api",
        actorType: "api",
        details: { bulk: true, count: result.cloned, sourceIds: body.ids, clonedIds: result.taskIds, errors: result.errors },
      });
    }

    return reply.send({ ok: true, ...result });
  });
}
