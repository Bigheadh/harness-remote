import type { FeishuCard } from "./card-builder.js";
import { serializeCard } from "./card-builder.js";
import { recordFeishuReply } from "../metrics/collector.js";

export interface FeishuReplyInput {
  messageId: string;
  text: string;
}

export interface FeishuSendCardInput {
  messageId: string;
  card: FeishuCard;
}

export interface FeishuDirectCardInput {
  feishuUserId: string;
  card: FeishuCard;
}

export interface FeishuUpdateCardInput {
  messageId: string;
  card: FeishuCard;
}

export interface FeishuReplyClient {
  replyToMessage(input: FeishuReplyInput): Promise<void>;
  sendCardMessage(input: FeishuSendCardInput): Promise<void>;
  sendDirectCardMessage(input: FeishuDirectCardInput): Promise<void>;
  updateCardMessage(input: FeishuUpdateCardInput): Promise<void>;
  downloadFile(messageId: string, fileKey: string, type: string): Promise<{ buffer: Buffer; contentType: string; fileName: string }>;
}

interface FeishuReplyConfig {
  appId: string;
  appSecret: string;
  /** HTTP request timeout in ms. Default: 15000 */
  timeoutMs?: number;
}

const DEFAULT_FEISHU_TIMEOUT_MS = 15_000;

async function parseJsonSafely<T>(response: Response, action: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${action}: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${action}: invalid JSON response (${text.slice(0, 200)})`);
  }
}

export function createFeishuReplyClient(config: FeishuReplyConfig): FeishuReplyClient {
  const timeoutMs = config.timeoutMs ?? DEFAULT_FEISHU_TIMEOUT_MS;
  let cachedTenantToken: string | undefined;
  let tokenExpiresAt = 0;
  let inflightTokenPromise: Promise<string> | undefined;

  async function getTenantAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5-minute buffer)
    if (cachedTenantToken && Date.now() < tokenExpiresAt - 300_000) {
      return cachedTenantToken;
    }

    // Singleflight lock so concurrent requests don't stampede Feishu's auth endpoint
    if (inflightTokenPromise) {
      return inflightTokenPromise;
    }

    inflightTokenPromise = (async () => {
      try {
        const response = await fetch(
          "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              app_id: config.appId,
              app_secret: config.appSecret,
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );

        const data = await parseJsonSafely<{
          code: number;
          msg: string;
          tenant_access_token?: string;
          expire?: number;
        }>(response, "Failed to get tenant access token");

        if (data.code !== 0 || !data.tenant_access_token) {
          throw new Error(`Failed to get tenant access token: ${data.msg}`);
        }

        cachedTenantToken = data.tenant_access_token;
        tokenExpiresAt = Date.now() + (data.expire ?? 7200) * 1000;
        return cachedTenantToken;
      } finally {
        inflightTokenPromise = undefined;
      }
    })();

    return inflightTokenPromise;
  }

  return {
    async replyToMessage(input: FeishuReplyInput): Promise<void> {
      try {
        const token = await getTenantAccessToken();

        const response = await fetch(
          `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(input.messageId)}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: JSON.stringify({ text: input.text }),
              msg_type: "text",
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );

        const data = await parseJsonSafely<{ code: number; msg: string }>(
          response,
          "Failed to reply to Feishu message",
        );

        if (data.code !== 0) {
          throw new Error(`Failed to reply to Feishu message: ${data.msg}`);
        }
        recordFeishuReply(true);
      } catch (err) {
        recordFeishuReply(false);
        throw err;
      }
    },

    async sendCardMessage(input: FeishuSendCardInput): Promise<void> {
      try {
        const token = await getTenantAccessToken();

        const response = await fetch(
          `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(input.messageId)}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: serializeCard(input.card),
              msg_type: "interactive",
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );

        const data = await parseJsonSafely<{ code: number; msg: string }>(
          response,
          "Failed to send Feishu card message",
        );

        if (data.code !== 0) {
          throw new Error(`Failed to send Feishu card message: ${data.msg}`);
        }
        recordFeishuReply(true);
      } catch (err) {
        recordFeishuReply(false);
        throw err;
      }
    },

    async sendDirectCardMessage(input: FeishuDirectCardInput): Promise<void> {
      try {
        const token = await getTenantAccessToken();

        const response = await fetch(
          `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=user_id`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              receive_id: input.feishuUserId,
              msg_type: "interactive",
              content: serializeCard(input.card),
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );

        const data = await parseJsonSafely<{ code: number; msg: string }>(
          response,
          "Failed to send direct Feishu card message",
        );

        if (data.code !== 0) {
          throw new Error(`Failed to send direct Feishu card message: ${data.msg}`);
        }
        recordFeishuReply(true);
      } catch (err) {
        recordFeishuReply(false);
        throw err;
      }
    },

    async updateCardMessage(input: FeishuUpdateCardInput): Promise<void> {
      try {
        const token = await getTenantAccessToken();

        const response = await fetch(
          `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(input.messageId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: serializeCard(input.card),
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );

        const data = await parseJsonSafely<{ code: number; msg: string }>(
          response,
          "Failed to update Feishu card message",
        );

        if (data.code !== 0) {
          throw new Error(`Failed to update Feishu card message: ${data.msg}`);
        }
        recordFeishuReply(true);
      } catch (err) {
        recordFeishuReply(false);
        throw err;
      }
    },

    async downloadFile(
      messageId: string,
      fileKey: string,
      type: string,
    ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
      const token = await getTenantAccessToken();

      const response = await fetch(
        `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(fileKey)}?type=${encodeURIComponent(type)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(timeoutMs * 2),
        },
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(
          `Failed to download Feishu file: ${response.status} ${errBody.slice(0, 200)}`,
        );
      }

      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const buffer = Buffer.from(await response.arrayBuffer());

      // Extract filename from Content-Disposition header if present
      let fileName = fileKey;
      const match = contentDisposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
      if (match) {
        fileName = decodeURIComponent(match[1].replace(/"/g, ""));
      }

      return { buffer, contentType, fileName };
    },
  };
}
