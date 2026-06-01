import Fastify from "fastify";
import { loadServerConfig } from "./config.js";
import { createTaskStore } from "./tasks/store.js";
import { registerTaskRoutes } from "./tasks/routes.js";
import { registerFeishuRoutes } from "./feishu/events.js";

const configPath = process.argv.includes("--config")
  ? process.argv[process.argv.indexOf("--config") + 1]
  : undefined;

export async function startServer(): Promise<void> {
  const config = loadServerConfig(configPath);

  const store = createTaskStore(config.storagePath);

  const server = Fastify({
    logger: {
      level: "info",
    },
  });

  // Register routes
  registerTaskRoutes(server, store, config.personalToken);
  registerFeishuRoutes(server, store, config.feishu);

  // Start listening
  try {
    await server.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`Server listening on port ${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
