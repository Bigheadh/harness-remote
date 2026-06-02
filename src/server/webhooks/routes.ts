import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WebhookStore } from "./store.js";
import type { WebhookEvent } from "../../shared/types.js";
import type { UserStore } from "../auth/store.js";
import { authenticate, authorize } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

const VALID_WEBHOOK_EVENTS: WebhookEvent[] = [
  "task.created",
  "task.status_changed",
  "task.result_reported",
  "task.assigned",
  "task.deleted",
];

export function registerWebhookRoutes(
  server: FastifyInstance,
  webhookStore: WebhookStore,
  personalToken: string,
  userStore?: UserStore,
): void {
  // Auth hook for /api/webhooks routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith("/api/webhooks")) {
      try {
        const authCtx = await authenticate(req.headers["authorization"], personalToken, userStore);
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

  // GET /api/webhooks - list all webhook subscriptions
  server.get("/api/webhooks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "webhooks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const subscriptions = await webhookStore.listSubscriptions();
    return reply.send({ webhooks: subscriptions });
  });

  // GET /api/webhooks/:id - get a single webhook subscription
  server.get<{ Params: { id: string } }>("/api/webhooks/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "webhooks.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const sub = await webhookStore.getSubscription(id);
    if (!sub) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Webhook subscription not found: ${id}` },
      });
    }
    return reply.send({ webhook: sub });
  });

  // POST /api/webhooks - create a new webhook subscription
  server.post("/api/webhooks", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "webhooks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as {
      url?: string;
      events?: string[];
      enabled?: boolean;
      description?: string;
    };

    if (typeof body?.url !== "string" || body.url.trim() === "") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'url' (non-empty string)" },
      });
    }

    // Validate URL
    try {
      new URL(body.url);
    } catch {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Invalid URL format" },
      });
    }

    if (!Array.isArray(body?.events) || body.events.length === 0) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Request body must include 'events' (non-empty array of event types)" },
      });
    }

    const validEvents = body.events.filter((e): e is WebhookEvent =>
      VALID_WEBHOOK_EVENTS.includes(e as WebhookEvent),
    );
    if (validEvents.length === 0) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: `Invalid events. Valid events: ${VALID_WEBHOOK_EVENTS.join(", ")}`,
        },
      });
    }

    const sub = await webhookStore.createSubscription({
      url: body.url.trim(),
      events: validEvents,
      enabled: body.enabled !== false,
      description: body.description,
    });

    log.info({ webhookId: sub.id, url: sub.url, events: sub.events }, "Webhook subscription created");
    return reply.code(201).send({ webhook: sub });
  });

  // PATCH /api/webhooks/:id - update a webhook subscription
  server.patch<{ Params: { id: string } }>("/api/webhooks/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "webhooks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const body = req.body as {
      url?: string;
      events?: string[];
      enabled?: boolean;
      description?: string;
    };

    // Validate URL if provided
    if (body?.url !== undefined) {
      if (typeof body.url !== "string" || body.url.trim() === "") {
        return reply.code(400).send({
          error: { code: "invalid_request", message: "'url' must be a non-empty string" },
        });
      }
      try {
        new URL(body.url);
      } catch {
        return reply.code(400).send({
          error: { code: "invalid_request", message: "Invalid URL format" },
        });
      }
    }

    // Validate events if provided
    let validEvents: WebhookEvent[] | undefined;
    if (body?.events !== undefined) {
      if (!Array.isArray(body.events) || body.events.length === 0) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: "'events' must be a non-empty array of event types" },
        });
      }
      validEvents = body.events.filter((e): e is WebhookEvent =>
        VALID_WEBHOOK_EVENTS.includes(e as WebhookEvent),
      );
      if (validEvents.length === 0) {
        return reply.code(400).send({
          error: {
            code: "invalid_request",
            message: `Invalid events. Valid events: ${VALID_WEBHOOK_EVENTS.join(", ")}`,
          },
        });
      }
    }

    try {
      const updated = await webhookStore.updateSubscription(id, {
        url: body?.url?.trim(),
        events: validEvents,
        enabled: body?.enabled,
        description: body?.description,
      });
      log.info({ webhookId: id }, "Webhook subscription updated");
      return reply.send({ webhook: updated });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Webhook subscription not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // DELETE /api/webhooks/:id - delete a webhook subscription
  server.delete<{ Params: { id: string } }>("/api/webhooks/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "webhooks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const deleted = await webhookStore.deleteSubscription(id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Webhook subscription not found: ${id}` },
      });
    }

    log.info({ webhookId: id }, "Webhook subscription deleted");
    return reply.send({ ok: true });
  });

  // POST /api/webhooks/:id/rotate-secret - rotate the webhook secret
  server.post<{ Params: { id: string } }>("/api/webhooks/:id/rotate-secret", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "webhooks.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    try {
      const updated = await webhookStore.rotateSecret(id);
      log.info({ webhookId: id }, "Webhook secret rotated");
      return reply.send({ webhook: updated });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Webhook subscription not found: ${id}` },
        });
      }
      throw e;
    }
  });

  // GET /api/webhooks/:id/deliveries - get delivery log for a webhook
  server.get<{ Params: { id: string }; Querystring: { limit?: number } }>(
    "/api/webhooks/:id/deliveries",
    async (req, reply) => {
      const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
      try {
        authorize(authCtx, "webhooks.read");
      } catch (e) {
        if (e instanceof AppError) {
          return reply.code(403).send({ error: { code: e.code, message: e.message } });
        }
        throw e;
      }

      const { id } = req.params;
      const sub = await webhookStore.getSubscription(id);
      if (!sub) {
        return reply.code(404).send({
          error: { code: "not_found", message: `Webhook subscription not found: ${id}` },
        });
      }

      const { limit } = req.query as { limit?: number };
      const deliveries = await webhookStore.getDeliveries(id, limit);
      return reply.send({ deliveries, count: deliveries.length });
    },
  );
}
