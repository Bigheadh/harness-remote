import { readFileSync } from "node:fs";

export interface ServerConfig {
  port: number;
  publicBaseUrl: string;
  personalToken: string;
  storagePath: string;
  feishu: {
    appId: string;
    appSecret: string;
    verificationToken: string;
    encryptKey: string;
    allowedUserIds: string[];
  };
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

export function loadServerConfig(configPath?: string): ServerConfig {
  const filePath = configPath ?? "config/server.json";

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (e) {
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

  // Validate port
  if (typeof obj["port"] !== "number" || obj["port"] < 1 || obj["port"] > 65535) {
    throw new Error("Config field 'port' must be an integer between 1 and 65535");
  }
  const port = obj["port"] as number;

  // Validate publicBaseUrl
  validateRequired(obj["publicBaseUrl"], "publicBaseUrl");
  validateUrl(obj["publicBaseUrl"] as string, "publicBaseUrl");
  const publicBaseUrl = (obj["publicBaseUrl"] as string).replace(/\/+$/, "");

  // Validate personalToken
  validateRequired(obj["personalToken"], "personalToken");
  if ((obj["personalToken"] as string).length < 24) {
    throw new Error("Config field 'personalToken' must be at least 24 characters");
  }
  const personalToken = obj["personalToken"] as string;

  // Validate storagePath
  validateRequired(obj["storagePath"], "storagePath");
  const storagePath = obj["storagePath"] as string;

  // Validate feishu config
  if (typeof obj["feishu"] !== "object" || obj["feishu"] === null) {
    throw new Error("Config field 'feishu' is required");
  }
  const feishu = obj["feishu"] as Record<string, unknown>;

  validateRequired(feishu["appId"], "feishu.appId");
  validateRequired(feishu["appSecret"], "feishu.appSecret");
  validateRequired(feishu["verificationToken"], "feishu.verificationToken");

  const encryptKey =
    typeof feishu["encryptKey"] === "string" ? feishu["encryptKey"] : "";

  if (!Array.isArray(feishu["allowedUserIds"]) || feishu["allowedUserIds"].length === 0) {
    throw new Error(
      "Config field 'feishu.allowedUserIds' must be a non-empty array",
    );
  }
  const allowedUserIds = feishu["allowedUserIds"] as string[];

  return {
    port,
    publicBaseUrl,
    personalToken,
    storagePath,
    feishu: {
      appId: feishu["appId"] as string,
      appSecret: feishu["appSecret"] as string,
      verificationToken: feishu["verificationToken"] as string,
      encryptKey,
      allowedUserIds,
    },
  };
}
