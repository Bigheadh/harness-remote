import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { DeviceStore } from "./store.js";
import type { UserStore } from "../auth/store.js";
import type { ApiKeyStore } from "../auth/apikeys/store.js";
import { authenticate, authorize } from "../auth/middleware.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

export function registerDeviceRoutes(
  server: FastifyInstance,
  store: DeviceStore,
  personalToken: string,
  userStore?: UserStore,
  apiKeyStore?: ApiKeyStore,
): void {
  // Auth hook for /api/devices routes
  server.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith("/api/devices")) {
      try {
        const authCtx = await authenticate(req.headers["authorization"], personalToken, userStore, apiKeyStore);
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

  // POST /api/devices - register a new device (requires devices.write)
  server.post("/api/devices", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "devices.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const body = req.body as { name?: string; capabilities?: string } | undefined;

    if (typeof body?.name !== "string" || body.name.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Request body must include 'name' (non-empty string)",
        },
      });
    }

    const device = await store.registerDevice(body.name.trim(), body.capabilities);
    log.info({ deviceId: device.id, deviceName: device.name }, "Device registered");
    return reply.code(201).send({ device });
  });

  // GET /api/devices - list all devices (requires devices.read)
  server.get("/api/devices", async (req: FastifyRequest, reply: FastifyReply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "devices.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const devices = await store.listDevices();
    return reply.send({ devices });
  });

  // GET /api/devices/:id - get device details (requires devices.read)
  server.get<{
    Params: { id: string };
  }>("/api/devices/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "devices.read");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const device = await store.getDevice(id);
    if (!device) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Device not found: ${id}` },
      });
    }
    return reply.send({ device });
  });

  // POST /api/devices/:id/heartbeat - update device last seen (requires devices.write)
  server.post<{
    Params: { id: string };
  }>("/api/devices/:id/heartbeat", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "devices.write");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const device = await store.getDevice(id);
    if (!device) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Device not found: ${id}` },
      });
    }
    await store.updateDeviceHeartbeat(id);
    return reply.send({ ok: true });
  });

  // DELETE /api/devices/:id - remove device (requires devices.delete)
  server.delete<{
    Params: { id: string };
  }>("/api/devices/:id", async (req, reply) => {
    const authCtx = (req as FastifyRequest & { authCtx: ReturnType<typeof authenticate> extends Promise<infer T> ? T : never }).authCtx;
    try {
      authorize(authCtx, "devices.delete");
    } catch (e) {
      if (e instanceof AppError) {
        return reply.code(403).send({ error: { code: e.code, message: e.message } });
      }
      throw e;
    }

    const { id } = req.params;
    const deleted = await store.deleteDevice(id);
    if (!deleted) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Device not found: ${id}` },
      });
    }
    log.info({ deviceId: id }, "Device deleted");
    return reply.send({ ok: true });
  });
}
