import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Task } from "../../shared/types.js";
import type { TaskStore } from "../tasks/store.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

export interface FeishuEventContext {
  eventId: string;
  messageId: string;
  chatId: string;
  userId: string;
  text: string;
  chatType: "p2p" | "group";
  mentionedBot: boolean;
}

interface FeishuEvent {
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    token?: string;
  };
  event?: {
    sender?: {
      sender_id?: {
        open_id?: string;
        user_id?: string;
      };
      sender_type?: string;
    };
    message?: {
      message_id?: string;
      chat_id?: string;
      chat_type?: string;
      content?: string;
      mentions?: Array<{
        key?: string;
        id?: {
          open_id?: string;
          user_id?: string;
        };
        name?: string;
        tenant_key?: string;
      }>;
    };
  };
}

interface FeishuConfig {
  appId: string;
  appSecret: string;
  verificationToken: string;
  encryptKey: string;
  allowedUserIds: string[];
}

export function parseFeishuEvent(payload: unknown): FeishuEventContext | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const event = payload as FeishuEvent;

  if (!event.header || !event.event) {
    return null;
  }

  const eventId = event.header.event_id;
  if (!eventId) {
    return null;
  }

  const message = event.event.message;
  if (!message) {
    return null;
  }

  const messageId = message.message_id;
  const chatId = message.chat_id;
  if (!messageId || !chatId) {
    return null;
  }

  const userId = event.event.sender?.sender_id?.open_id;
  if (!userId) {
    return null;
  }

  let text = "";
  if (message.content) {
    try {
      const content = JSON.parse(message.content) as { text?: string };
      text = content.text ?? "";
    } catch {
      text = message.content;
    }
  }

  const chatType = message.chat_type === "group" ? "group" : "p2p";

  let mentionedBot = false;
  if (message.mentions && message.mentions.length > 0) {
    mentionedBot = true;
  }

  return {
    eventId,
    messageId,
    chatId,
    userId,
    text,
    chatType,
    mentionedBot,
  };
}

export function createTaskFromFeishuEvent(event: FeishuEventContext): Task {
  const now = new Date().toISOString();
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: taskId,
    source: "feishu",
    feishuMessageId: event.messageId,
    feishuChatId: event.chatId,
    feishuUserId: event.userId,
    commandText: event.text,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

export function registerFeishuRoutes(
  server: FastifyInstance,
  store: TaskStore,
  feishuConfig: FeishuConfig,
): void {
  server.post("/feishu/events", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;

    // URL verification challenge
    if (body && typeof body === "object" && "challenge" in body) {
      const challenge = body["challenge"];
      if (typeof challenge === "string") {
        log.info({}, "URL verification challenge received");
        return reply.send({ challenge });
      }
      return reply.code(400).send({ error: "Invalid challenge" });
    }

    // Parse event
    const eventContext = parseFeishuEvent(body);
    if (!eventContext) {
      log.debug({}, "Non-message event ignored");
      return reply.send({ ok: true });
    }

    // Verify token if verification token is configured
    const header = body?.["header"] as Record<string, unknown> | undefined;
    if (header?.["token"] && feishuConfig.verificationToken) {
      if (header["token"] !== feishuConfig.verificationToken) {
        log.warn({ eventId: eventContext.eventId }, "Invalid verification token");
        return reply.code(401).send({ error: "Invalid verification token" });
      }
    }

    // Check event deduplication
    if (await store.isEventProcessed(eventContext.eventId)) {
      log.debug({ eventId: eventContext.eventId }, "Duplicate event ignored");
      return reply.send({ ok: true });
    }

    // Check allowlist
    if (!feishuConfig.allowedUserIds.includes(eventContext.userId)) {
      log.info({ userId: eventContext.userId }, "Non-allowed user ignored");
      return reply.send({ ok: true });
    }

    // Group chat: only create if bot mentioned
    if (eventContext.chatType === "group" && !eventContext.mentionedBot) {
      log.debug({ chatId: eventContext.chatId }, "Group message without bot mention ignored");
      return reply.send({ ok: true });
    }

    // Create task
    const task = createTaskFromFeishuEvent(eventContext);
    await store.createTask(task);

    // Mark event as processed
    await store.markEventProcessed(eventContext.eventId);

    log.info(
      {
        taskId: task.id,
        userId: eventContext.userId,
        chatType: eventContext.chatType,
      },
      "Task created from Feishu event",
    );

    return reply.code(201).send({ ok: true, taskId: task.id });
  });
}
