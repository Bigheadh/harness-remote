import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadMcpConfig } from "./config.js";
import { createTaskApiClient } from "./client.js";
import { registerMcpTools } from "./tools.js";

const configPath = process.argv.includes("--config")
  ? process.argv[process.argv.indexOf("--config") + 1]
  : undefined;

export async function startMcpServer(): Promise<void> {
  const config = loadMcpConfig(configPath);

  const client = createTaskApiClient(config.serverBaseUrl, config.personalToken, config.deviceId);

  const server = new McpServer({
    name: "harness-remote",
    version: "0.1.0",
  });

  registerMcpTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

startMcpServer();
