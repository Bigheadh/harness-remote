import { existsSync } from "node:fs";
import {
  validateRequired,
  validateUrl,
  parseJsonConfig,
} from "../shared/config-utils.js";

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
    /** Status transitions that trigger a proactive Feishu card notification.
     *  Default: ["running", "failed"]. Set to [] to disable. */
    notifyOnStatusChange?: string[];
  };
  /** Optional webhook delivery timeout in ms (default: 10000) */
  webhookTimeoutMs?: number;
  /** Optional rate limiting config */
  rateLimit?: {
    /** Maximum requests per window per user/device. Default: 60 */
    maxRequests?: number;
    /** Window duration in ms. Default: 60000 (1 minute) */
    windowMs?: number;
    /** Per-key overrides: { "user:xxx": { maxRequests: 100 } } */
    overrides?: Record<string, { maxRequests: number; windowMs?: number }>;
  };
}

function parseCsvEnv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

export function loadServerConfig(configPath?: string): ServerConfig {
  const filePath = configPath ?? "config/server.json";
  // Allow pure environment variable startup when default config file is absent
  const obj: Record<string, unknown> =
    configPath || existsSync(filePath) ? parseJsonConfig(filePath) : {};

  // Validate port (env: HARNESS_PORT or PORT)
  const rawPort = process.env["HARNESS_PORT"] ?? process.env["PORT"] ?? obj["port"];
  const port = typeof rawPort === "string" ? Number(rawPort) : rawPort;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Config field 'port' must be an integer between 1 and 65535");
  }

  // Validate publicBaseUrl
  const rawPublicBaseUrl = process.env["HARNESS_PUBLIC_BASE_URL"] ?? obj["publicBaseUrl"];
  validateRequired(rawPublicBaseUrl, "publicBaseUrl");
  validateUrl(rawPublicBaseUrl as string, "publicBaseUrl");
  const publicBaseUrl = (rawPublicBaseUrl as string).replace(/\/+$/, "");

  // Validate personalToken
  const rawPersonalToken = process.env["HARNESS_PERSONAL_TOKEN"] ?? obj["personalToken"];
  validateRequired(rawPersonalToken, "personalToken");
  if ((rawPersonalToken as string).length < 24) {
    throw new Error("Config field 'personalToken' must be at least 24 characters");
  }
  const personalToken = rawPersonalToken as string;

  // Validate storagePath
  const rawStoragePath = process.env["HARNESS_STORAGE_PATH"] ?? obj["storagePath"];
  validateRequired(rawStoragePath, "storagePath");
  const storagePath = rawStoragePath as string;

  // Validate feishu config (JSON object or FEISHU_* env vars)
  const feishu =
    typeof obj["feishu"] === "object" && obj["feishu"] !== null
      ? (obj["feishu"] as Record<string, unknown>)
      : {};

  const appId = process.env["FEISHU_APP_ID"] ?? feishu["appId"];
  const appSecret = process.env["FEISHU_APP_SECRET"] ?? feishu["appSecret"];
  const verificationToken = process.env["FEISHU_VERIFICATION_TOKEN"] ?? feishu["verificationToken"];

  validateRequired(appId, "feishu.appId");
  validateRequired(appSecret, "feishu.appSecret");
  validateRequired(verificationToken, "feishu.verificationToken");

  const rawEncryptKey = process.env["FEISHU_ENCRYPT_KEY"] ?? feishu["encryptKey"];
  const encryptKey = typeof rawEncryptKey === "string" ? rawEncryptKey : "";

  const envAllowedUsers = parseCsvEnv(process.env["FEISHU_ALLOWED_USER_IDS"]);
  const rawAllowedUsers = envAllowedUsers ?? feishu["allowedUserIds"];
  if (!Array.isArray(rawAllowedUsers) || rawAllowedUsers.length === 0) {
    throw new Error(
      "Config field 'feishu.allowedUserIds' must be a non-empty array",
    );
  }
  const allowedUserIds = rawAllowedUsers as string[];

  // Parse optional notifyOnStatusChange (array of status strings)
  const validStatuses = ["pending", "picked", "running", "done", "failed"];
  const envNotify = process.env["FEISHU_NOTIFY_ON_STATUS_CHANGE"];
  let notifyOnStatusChange: string[] | undefined;
  if (envNotify !== undefined) {
    notifyOnStatusChange = envNotify
      .split(",")
      .map((s) => s.trim())
      .filter((s) => validStatuses.includes(s));
  } else if (Array.isArray(feishu["notifyOnStatusChange"])) {
    notifyOnStatusChange = (feishu["notifyOnStatusChange"] as string[]).filter(
      (s) => validStatuses.includes(s),
    );
  }

  // Parse optional rate limit config
  let rateLimit: ServerConfig["rateLimit"];
  const rl =
    obj["rateLimit"] && typeof obj["rateLimit"] === "object"
      ? (obj["rateLimit"] as Record<string, unknown>)
      : undefined;
  const maxRequests = parsePositiveNumber(
    process.env["HARNESS_RATE_LIMIT_MAX"] ?? rl?.["maxRequests"],
  );
  const windowMs = parsePositiveNumber(
    process.env["HARNESS_RATE_LIMIT_WINDOW_MS"] ?? rl?.["windowMs"],
  );
  const overrides =
    rl?.["overrides"] && typeof rl["overrides"] === "object"
      ? (rl["overrides"] as Record<string, { maxRequests: number; windowMs?: number }>)
      : undefined;
  if (maxRequests !== undefined || windowMs !== undefined || overrides !== undefined) {
    rateLimit = {
      ...(maxRequests !== undefined ? { maxRequests } : {}),
      ...(windowMs !== undefined ? { windowMs } : {}),
      ...(overrides !== undefined ? { overrides } : {}),
    };
  }

  // Parse optional webhookTimeoutMs
  const webhookTimeoutMs = parsePositiveNumber(
    process.env["HARNESS_WEBHOOK_TIMEOUT_MS"] ?? obj["webhookTimeoutMs"],
  );

  return {
    port,
    publicBaseUrl,
    personalToken,
    storagePath,
    feishu: {
      appId: appId as string,
      appSecret: appSecret as string,
      verificationToken: verificationToken as string,
      encryptKey,
      allowedUserIds,
      ...(notifyOnStatusChange !== undefined ? { notifyOnStatusChange } : {}),
    },
    ...(webhookTimeoutMs !== undefined ? { webhookTimeoutMs } : {}),
    ...(rateLimit ? { rateLimit } : {}),
  };
}
