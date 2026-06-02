import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { DeviceStore } from "./store.js";
import { requireBearerToken } from "../../shared/http.js";
import { AppError } from "../../shared/errors.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

export function registerDeviceRoutes(
  server: FastifyInstance,
  store: DeviceStore,
  personalToken: string,
): void {
  // POST /api/devices - register a new device
  server.post("/api/devices", async (req: FastifyRequest, reply: FastifyReply) => {
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

  // GET /api/devices - list all devices
  server.get("/api/devices", async (_req: FastifyRequest, reply: FastifyReply) => {
    const devices = await store.listDevices();
    return reply.send({ devices });
  });

  // GET /api/devices/:id - get device details
  server.get<{
    Params: { id: string };
  }>("/api/devices/:id", async (req, reply) => {
    const { id } = req.params;
    const device = await store.getDevice(id);
    if (!device) {
      return reply.code(404).send({
        error: { code: "not_found", message: `Device not found: ${id}` },
      });
    }
    return reply.send({ device });
  });

  // POST /api/devices/:id/heartbeat - update device last seen
  server.post<{
    Params: { id: string };
  }>("/api/devices/:id/heartbeat", async (req, reply) => {
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

  // DELETE /api/devices/:id - remove device
  server.delete<{
    Params: { id: string };
  }>("/api/devices/:id", async (req, reply) => {
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
