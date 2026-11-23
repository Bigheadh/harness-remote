import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskApiClient } from "./client.js";
import { shouldRegisterTool, type McpToolset } from "./toolsets.js";
import { registerCoreTaskTools } from "./tools/tasks-core.js";
import { registerExtendedTaskTools } from "./tools/tasks-extended.js";
import { registerPlanningTools } from "./tools/planning.js";
import { registerSlaTools } from "./tools/sla.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerAdminTools } from "./tools/admin.js";

export interface RegisterMcpToolsOptions {
  /** Optional list of toolsets to expose (e.g. ["core", "planning"]). Omit or pass ["all"] for all 161 tools. */
  toolsets?: readonly McpToolset[];
}

export function registerMcpTools(
  rawServer: McpServer,
  client: TaskApiClient,
  options?: RegisterMcpToolsOptions,
): void {
  const enabledToolsets = options?.toolsets;
  const server: McpServer =
    enabledToolsets && enabledToolsets.length > 0 && !enabledToolsets.includes("all")
      ? new Proxy(rawServer, {
          get(target, prop, receiver) {
            if (prop === "registerTool") {
              return (name: string, ...rest: unknown[]) => {
                if (!shouldRegisterTool(name, enabledToolsets)) {
                  return undefined;
                }
                return (target.registerTool as (...args: unknown[]) => unknown)(name, ...rest);
              };
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        })
      : rawServer;

  registerCoreTaskTools(server, client);
  registerExtendedTaskTools(server, client);
  registerPlanningTools(server, client);
  registerSlaTools(server, client);
  registerAnalyticsTools(server, client);
  registerAdminTools(server, client);
}
