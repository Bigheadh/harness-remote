import { existsSync } from "node:fs";
import {
  validateRequired,
  validateUrl,
  parseJsonConfig,
} from "../shared/config-utils.js";
import { parseToolsets, type McpToolset } from "./toolsets.js";

export interface McpConfig {
  serverBaseUrl: string;
  personalToken: string;
  defaultUser: string;
  deviceId?: string;
  /** Optional list of MCP toolsets to register (e.g. ["core", "planning"]). Default: all. */
  toolsets?: McpToolset[];
  /** Optional HTTP request timeout in ms for server API calls. Default: 30000. */
  timeoutMs?: number;
}

export function loadMcpConfig(configPath?: string): McpConfig {
  const filePath = configPath ?? "config/mcp.json";
  // Allow pure-env configuration when default config path doesn't exist
  const obj: Record<string, unknown> =
    configPath || existsSync(filePath) ? parseJsonConfig(filePath) : {};

  const rawServerBaseUrl = process.env["HARNESS_SERVER_BASE_URL"] ?? obj["serverBaseUrl"];
  validateRequired(rawServerBaseUrl, "serverBaseUrl");
  validateUrl(rawServerBaseUrl as string, "serverBaseUrl");
  const serverBaseUrl = (rawServerBaseUrl as string).replace(/\/+$/, "");

  const rawPersonalToken = process.env["HARNESS_PERSONAL_TOKEN"] ?? obj["personalToken"];
  validateRequired(rawPersonalToken, "personalToken");
  const personalToken = rawPersonalToken as string;

  const rawDefaultUser = process.env["HARNESS_DEFAULT_USER"] ?? obj["defaultUser"];
  const defaultUser =
    typeof rawDefaultUser === "string" && rawDefaultUser.trim() !== ""
      ? rawDefaultUser.trim()
      : "me";

  const rawDeviceId = process.env["HARNESS_DEVICE_ID"] ?? obj["deviceId"];
  const deviceId =
    typeof rawDeviceId === "string" && rawDeviceId.trim() !== ""
      ? rawDeviceId.trim()
      : undefined;

  const rawToolsets = process.env["HARNESS_MCP_TOOLSETS"] ?? (obj["toolsets"] as string | string[] | undefined);
  const toolsets = parseToolsets(rawToolsets);

  const rawTimeout = process.env["HARNESS_MCP_TIMEOUT_MS"] ?? obj["timeoutMs"];
  const parsedTimeout = typeof rawTimeout === "string" ? Number(rawTimeout) : rawTimeout;
  const timeoutMs =
    typeof parsedTimeout === "number" && Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? parsedTimeout
      : undefined;

  return {
    serverBaseUrl,
    personalToken,
    defaultUser,
    deviceId,
    ...(toolsets ? { toolsets } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}
