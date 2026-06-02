import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Fastify, { type FastifyRequest } from "fastify";
import { loadServerConfig } from "./config.js";
import { createTaskStore } from "./tasks/store.js";
import { registerTaskRoutes } from "./tasks/routes.js";
import { registerFeishuRoutes } from "./feishu/events.js";
import { createFeishuReplyClient } from "./feishu/client.js";
import { createLogger } from "../shared/logger.js";

const configPath = process.argv.includes("--config")
  ? process.argv[process.argv.indexOf("--config") + 1]
  : undefined;

export async function startServer(): Promise<void> {
  const config = loadServerConfig(configPath);
  const log = createLogger({ level: "info" });

  log.info({ port: config.port }, "Starting harness-remote server");

  // Ensure data directory exists
  mkdirSync(dirname(config.storagePath), { recursive: true });

  const store = createTaskStore(config.storagePath);

  const server = Fastify({
    logger: false, // We use our own redacting logger
  });

  // Request logging middleware
  server.addHook("onRequest", async (req) => {
    (req as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  server.addHook("onResponse", async (req, reply) => {
    const startTime = (req as FastifyRequest & { startTime: number }).startTime;
    const duration = startTime ? Date.now() - startTime : 0;
    log.info(
      {
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        duration,
      },
      "Request completed",
    );
  });

  // Register routes
  const feishuClient = createFeishuReplyClient(config.feishu);
  registerTaskRoutes(server, store, config.personalToken, feishuClient);
  registerFeishuRoutes(server, store, config.feishu);

  // Start listening
  try {
    await server.listen({ port: config.port, host: "0.0.0.0" });
    log.info({ port: config.port }, "Server listening");
  } catch (err) {
    log.error({ err }, "Failed to start server");
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    log.info({}, "Shutting down...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
