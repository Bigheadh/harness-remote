import { readFileSync } from "node:fs";

export interface McpConfig {
  serverBaseUrl: string;
  personalToken: string;
  defaultUser: string;
}

function validateRequired(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing or empty required config field: ${fieldName}`);
  }
}

function validateUrl(value: string, fieldName: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(
        `Config field ${fieldName} must use https or http protocol, got: ${url.protocol}`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("protocol")) {
      throw e;
    }
    throw new Error(`Config field ${fieldName} is not a valid URL: ${value}`);
  }
}

export function loadMcpConfig(configPath?: string): McpConfig {
  const filePath = configPath ?? "config/mcp.json";

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(`Failed to read config file: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${filePath}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Config file must contain a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  validateRequired(obj["serverBaseUrl"], "serverBaseUrl");
  validateUrl(obj["serverBaseUrl"] as string, "serverBaseUrl");
  const serverBaseUrl = (obj["serverBaseUrl"] as string).replace(/\/+$/, "");

  validateRequired(obj["personalToken"], "personalToken");
  const personalToken = obj["personalToken"] as string;

  const defaultUser =
    typeof obj["defaultUser"] === "string" ? obj["defaultUser"] : "me";

  return {
    serverBaseUrl,
    personalToken,
    defaultUser,
  };
}
