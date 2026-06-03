import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Task, TaskPriority, Attachment, FeishuFileType } from "../../shared/types.js";
import type { TaskStore } from "../tasks/store.js";
import type { AuditLogStore } from "../audit/store.js";
import type { WebhookStore } from "../webhooks/store.js";
import type { FeishuReplyClient } from "./client.js";
import { buildTaskCreatedCard } from "./card-builder.js";
import { createLogger } from "../../shared/logger.js";
import { dispatchWebhook } from "../webhooks/dispatcher.js";
import { broadcastTaskCreated } from "../sse/broadcaster.js";
import { recordTaskCreated, recordEventProcessed } from "../metrics/collector.js";
import { isCommand, parseCommand, executeCommand } from "./commands.js";

const log = createLogger({ level: "info" });

/** Parse priority from message text. Looks for #priority:urgent, #priority:high, etc. */
function parsePriority(text: string): TaskPriority {
  const match = text.match(/#priority:(urgent|high|normal|low)/i);
  if (match) {
    return match[1].toLowerCase() as TaskPriority;
  }
  // Also support shorthand: !urgent, !high
  if (text.includes("!urgent")) return "urgent";
  if (text.includes("!high")) return "high";
  return "normal";
}

/** Strip priority markers from text */
function stripPriorityMarkers(text: string): string {
  return text
    .replace(/#priority:(urgent|high|normal|low)/gi, "")
    .replace(/[!](urgent|high)/g, "")
    .trim();
}

/** Parse tags from message text. Looks for #tag:name patterns. */
function parseTagsFromText(text: string): string[] {
  const tags: string[] = [];
  const regex = /#tag:(\S+)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const tag = match[1].toLowerCase();
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

/** Strip tag markers from text */
function stripTagMarkers(text: string): string {
  return text.replace(/#tag:\S+/gi, "").replace(/\s+/g, " ").trim();
}

/** Parse due date from message text. Looks for #due:YYYY-MM-DD or #due:YYYY-MM-DDTHH:mm */
function parseDueDate(text: string): string | undefined {
  const match = text.match(/#due:(\S+)/i);
  if (match) {
    const dateStr = match[1];
    if (!isNaN(Date.parse(dateStr))) {
      return dateStr;
    }
  }
  return undefined;
}

/** Strip due date markers from text */
function stripDueDateMarkers(text: string): string {
  return text.replace(/#due:\S+/gi, "").replace(/\s+/g, " ").trim();
}

/** Extract description from #desc: marker (supports multi-word descriptions until next # marker or end of text) */
function parseDescription(text: string): string | undefined {
  const match = text.match(/#desc:(.+?)(?=\s+#\w+:|$)/i);
  if (match && match[1].trim().length > 0) {
    return match[1].trim();
  }
  return undefined;
}

/** Strip description marker from text */
function stripDescriptionMarker(text: string): string {
  return text.replace(/#desc:(.+?)(?=\s+#\w+:|$)/gi, "").replace(/\s+/g, " ").trim();
}

export interface FeishuEventContext {
  eventId: string;
  messageId: string;
  chatId: string;
  userId: string;
  text: string;
  chatType: "p2p" | "group";
  mentionedBot: boolean;
  messageType: string;
  attachments: Attachment[];
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
      message_type?: string;
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

  const messageType = message.message_type ?? "text";
  let text = "";
  const attachments: Attachment[] = [];

  if (message.content) {
    try {
      const content = JSON.parse(message.content) as Record<string, unknown>;

      if (messageType === "text") {
        text = (content["text"] as string) ?? "";
      } else if (messageType === "file") {
        // File message: extract file metadata
        const fileKey = content["file_key"] as string | undefined;
        const fileName = content["file_name"] as string | undefined;
        const fileSize = content["file_size"] as number | undefined;
        const fileType = content["file_type"] as string | undefined;
        if (fileKey) {
          attachments.push({
            fileKey,
            fileName: fileName ?? "unknown",
            fileType: fileType ?? "unknown",
            fileSize,
            feishuFileType: "file",
          });
          text = `[附件] ${fileName ?? "file"}`;
        }
      } else if (messageType === "image") {
        // Image message: extract image metadata
        const imageKey = content["image_key"] as string | undefined;
        if (imageKey) {
          attachments.push({
            fileKey: imageKey,
            fileName: "image",
            fileType: "image",
            feishuFileType: "image",
          });
          text = "[图片]";
        }
      } else if (messageType === "audio") {
        const fileKey = content["file_key"] as string | undefined;
        if (fileKey) {
          attachments.push({
            fileKey,
            fileName: "audio",
            fileType: "audio",
            feishuFileType: "audio",
          });
          text = "[语音]";
        }
      } else if (messageType === "media") {
        const fileKey = content["file_key"] as string | undefined;
        const fileName = content["file_name"] as string | undefined;
        if (fileKey) {
          attachments.push({
            fileKey,
            fileName: fileName ?? "video",
            fileType: "video",
            feishuFileType: "media",
          });
          text = `[视频] ${fileName ?? ""}`;
        }
      } else {
        // Unknown message type — try to extract text if available
        text = (content["text"] as string) ?? `[${messageType}]`;
      }
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
    messageType,
    attachments,
  };
}

export function createTaskFromFeishuEvent(event: FeishuEventContext): Task {
  const now = new Date().toISOString();
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const priority = parsePriority(event.text);
  const tags = parseTagsFromText(event.text);
  const dueDate = parseDueDate(event.text);
  const description = parseDescription(event.text);
  let cleanText = stripPriorityMarkers(event.text);
  cleanText = stripTagMarkers(cleanText);
  cleanText = stripDueDateMarkers(cleanText);
  cleanText = stripDescriptionMarker(cleanText);

  return {
    id: taskId,
    source: "feishu",
    feishuMessageId: event.messageId,
    feishuChatId: event.chatId,
    feishuUserId: event.userId,
    commandText: cleanText,
    status: "pending",
    priority,
    tags: tags.length > 0 ? tags : undefined,
    attachments: event.attachments.length > 0 ? event.attachments : undefined,
    dueDate,
    description,
    createdAt: now,
    updatedAt: now,
  };
}

export function registerFeishuRoutes(
  server: FastifyInstance,
  store: TaskStore,
  feishuConfig: FeishuConfig,
  auditStore?: AuditLogStore,
  webhookStore?: WebhookStore,
  feishuClient?: FeishuReplyClient,
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
      if (auditStore) {
        await auditStore.log({
          action: "event.duplicate",
          actor: eventContext.userId,
          actorType: "feishu",
          details: { eventId: eventContext.eventId },
        });
      }
      return reply.send({ ok: true });
    }

    // Check allowlist
    if (!feishuConfig.allowedUserIds.includes(eventContext.userId)) {
      log.info({ userId: eventContext.userId }, "Non-allowed user ignored");
      if (auditStore) {
        await auditStore.log({
          action: "event.non_allowed_user",
          actor: eventContext.userId,
          actorType: "feishu",
          details: { chatId: eventContext.chatId },
        });
      }
      return reply.send({ ok: true });
    }

    // Group chat: only create if bot mentioned
    if (eventContext.chatType === "group" && !eventContext.mentionedBot) {
      log.debug({ chatId: eventContext.chatId }, "Group message without bot mention ignored");
      return reply.send({ ok: true });
    }

    // Check if the text is a slash command
    if (eventContext.text && isCommand(eventContext.text)) {
      const cmd = parseCommand(eventContext.text);
      if (cmd) {
        log.info({ command: cmd.command, userId: eventContext.userId }, "Feishu command received");
        if (auditStore) {
          await auditStore.log({
            action: "event.command",
            actor: eventContext.userId,
            actorType: "feishu",
            details: { command: cmd.command, chatId: eventContext.chatId },
          });
        }
        // Mark event as processed to prevent dedup issues on re-delivery
        await store.markEventProcessed(eventContext.eventId);
        // Execute command asynchronously — Feishu needs HTTP 200 fast
        executeCommand(cmd, eventContext.userId, eventContext.chatId, eventContext.messageId, store, feishuClient).catch((err) => {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "Command execution failed");
        });
        return reply.send({ ok: true, command: cmd.command });
      }
    }

    // Create task
    const task = createTaskFromFeishuEvent(eventContext);
    await store.createTask(task);
    recordTaskCreated();

    // Broadcast SSE event
    broadcastTaskCreated(task);

    // Mark event as processed
    await store.markEventProcessed(eventContext.eventId);

    log.info(
      {
        taskId: task.id,
        userId: eventContext.userId,
        chatType: eventContext.chatType,
        priority: task.priority,
      },
      "Task created from Feishu event",
    );

    if (auditStore) {
      await auditStore.log({
        action: "task.created",
        taskId: task.id,
        actor: eventContext.userId,
        actorType: "feishu",
        details: { chatType: eventContext.chatType, priority: task.priority },
      });
    }

    // Dispatch webhook for task creation
    if (webhookStore) {
      dispatchWebhook(webhookStore, "task.created", task, { chatType: eventContext.chatType }).catch(() => {});
    }

    // Send rich card confirmation to the original chat
    if (feishuClient) {
      const card = buildTaskCreatedCard(task);
      feishuClient.sendCardMessage({ messageId: eventContext.messageId, card }).catch((err) => {
        log.warn({ taskId: task.id, err: err instanceof Error ? err.message : String(err) }, "Failed to send task creation card");
      });
    }

    return reply.code(201).send({ ok: true, taskId: task.id });
  });
}
