import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskStatus, Subtask, AuditLogEntry } from "../../../shared/types.js";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import type { TaskRouteContext } from "./context.js";

export function registerSubtaskAndCommentRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, auditStore, log } = ctx;

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
}
