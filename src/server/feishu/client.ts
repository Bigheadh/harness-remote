export interface FeishuReplyInput {
  messageId: string;
  text: string;
}

export interface FeishuReplyClient {
  replyToMessage(input: FeishuReplyInput): Promise<void>;
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
  };
}
