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

export function loadServerConfig(configPath?: string): ServerConfig {
  const filePath = configPath ?? "config/server.json";
  const obj = parseJsonConfig(filePath);

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

  // Parse optional rate limit config
  let rateLimit: ServerConfig["rateLimit"];
  if (obj["rateLimit"] && typeof obj["rateLimit"] === "object") {
    const rl = obj["rateLimit"] as Record<string, unknown>;
    rateLimit = {};
    if (typeof rl["maxRequests"] === "number" && rl["maxRequests"] > 0) {
      rateLimit.maxRequests = rl["maxRequests"] as number;
    }
    if (typeof rl["windowMs"] === "number" && rl["windowMs"] > 0) {
      rateLimit.windowMs = rl["windowMs"] as number;
    }
    if (rl["overrides"] && typeof rl["overrides"] === "object") {
      rateLimit.overrides = rl["overrides"] as Record<string, { maxRequests: number; windowMs?: number }>;
    }
  }

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
    ...(rateLimit ? { rateLimit } : {}),
  };
}
