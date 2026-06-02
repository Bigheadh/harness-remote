import {
  validateRequired,
  validateUrl,
  parseJsonConfig,
} from "../shared/config-utils.js";

export interface McpConfig {
  serverBaseUrl: string;
  personalToken: string;
  defaultUser: string;
  deviceId?: string;
}

export function loadMcpConfig(configPath?: string): McpConfig {
  const filePath = configPath ?? "config/mcp.json";
  const obj = parseJsonConfig(filePath);

  validateRequired(obj["serverBaseUrl"], "serverBaseUrl");
  validateUrl(obj["serverBaseUrl"] as string, "serverBaseUrl");
  const serverBaseUrl = (obj["serverBaseUrl"] as string).replace(/\/+$/, "");

  validateRequired(obj["personalToken"], "personalToken");
  const personalToken = obj["personalToken"] as string;

  const defaultUser =
    typeof obj["defaultUser"] === "string" ? obj["defaultUser"] : "me";

  const deviceId =
    typeof obj["deviceId"] === "string" && obj["deviceId"].trim() !== ""
      ? (obj["deviceId"] as string).trim()
      : undefined;

  return {
    serverBaseUrl,
    personalToken,
    defaultUser,
    deviceId,
  };
}
