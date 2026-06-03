import type { FeishuCard } from "./card-builder.js";
import { serializeCard } from "./card-builder.js";

export interface FeishuReplyInput {
  messageId: string;
  text: string;
}

export interface FeishuSendCardInput {
  messageId: string;
  card: FeishuCard;
}

export interface FeishuReplyClient {
  replyToMessage(input: FeishuReplyInput): Promise<void>;
  sendCardMessage(input: FeishuSendCardInput): Promise<void>;
  downloadFile(messageId: string, fileKey: string, type: string): Promise<{ buffer: Buffer; contentType: string; fileName: string }>;
}

interface FeishuReplyConfig {
  appId: string;
  appSecret: string;
}

let cachedTenantToken: string | undefined;
let tokenExpiresAt = 0;

async function getTenantAccessToken(
  config: FeishuReplyConfig,
): Promise<string> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedTenantToken && Date.now() < tokenExpiresAt - 300_000) {
    return cachedTenantToken;
  }

  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret,
      }),
    },
  );

  const data = (await response.json()) as {
    code: number;
    msg: string;
    tenant_access_token?: string;
    expire?: number;
  };

  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Failed to get tenant access token: ${data.msg}`);
  }

  cachedTenantToken = data.tenant_access_token;
  tokenExpiresAt = Date.now() + (data.expire ?? 7200) * 1000;

  return cachedTenantToken;
}

export function createFeishuReplyClient(config: FeishuReplyConfig): FeishuReplyClient {
  return {
    async replyToMessage(input: FeishuReplyInput): Promise<void> {
      const token = await getTenantAccessToken(config);

      // Feishu reply API requires a reply_in_thread or message_id
      // Using the reply API endpoint
      const response = await fetch(
        `https://open.feishu.cn/open-apis/im/v1/messages/${input.messageId}/reply`,
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
        },
      );

      const data = (await response.json()) as {
        code: number;
        msg: string;
      };

      if (data.code !== 0) {
        throw new Error(`Failed to reply to Feishu message: ${data.msg}`);
      }
    },

    async sendCardMessage(input: FeishuSendCardInput): Promise<void> {
      const token = await getTenantAccessToken(config);

      const response = await fetch(
        `https://open.feishu.cn/open-apis/im/v1/messages/${input.messageId}/reply`,
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
        },
      );

      const data = (await response.json()) as {
        code: number;
        msg: string;
      };

      if (data.code !== 0) {
        throw new Error(`Failed to send Feishu card message: ${data.msg}`);
      }
    },

    async downloadFile(
      messageId: string,
      fileKey: string,
      type: string,
    ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
      const token = await getTenantAccessToken(config);

      const response = await fetch(
        `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=${encodeURIComponent(type)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const errBody = (await response.text()) as string;
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
