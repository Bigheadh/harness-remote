import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TaskPriority } from "../../../shared/types.js";
import { authenticate, authorize } from "../../auth/middleware.js";
import { AppError } from "../../../shared/errors.js";
import type { TaskRouteContext } from "./context.js";
import { CreateTemplateBodySchema, parseBody } from "../../openapi/schemas.js";

export function registerTemplateRoutes(
  server: FastifyInstance,
  ctx: TaskRouteContext,
): void {
  const { store, log } = ctx;

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

    const body = parseBody(CreateTemplateBodySchema, req.body, reply);
    if (!body) return;

    const template = await store.createTemplate({
      name: body.name,
      description: body.description,
      commandText: body.commandText,
      priority: body.priority,
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
}
