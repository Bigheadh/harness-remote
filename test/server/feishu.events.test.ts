import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseFeishuEvent,
  createTaskFromFeishuEvent,
} from "../../src/server/feishu/events.js";

// ── parseFeishuEvent ────────────────────────────────────────────────────────

describe("parseFeishuEvent", () => {
  const validPayload = {
    schema: "2.0",
    header: {
      event_id: "ev_123",
      event_type: "im.message.receive_v1",
      token: "tok_abc",
    },
    event: {
      sender: {
        sender_id: { open_id: "ou_user1", user_id: "uid1" },
        sender_type: "user",
      },
      message: {
        message_id: "msg_001",
        chat_id: "oc_chat1",
        chat_type: "p2p",
        content: JSON.stringify({ text: "do something" }),
        mentions: [],
      },
    },
  };

  it("extracts all fields from a valid payload", () => {
    const ctx = parseFeishuEvent(validPayload);
    expect(ctx).toEqual({
      eventId: "ev_123",
      messageId: "msg_001",
      chatId: "oc_chat1",
      userId: "ou_user1",
      text: "do something",
      chatType: "p2p",
      mentionedBot: false,
    });
  });

  it("returns null for non-object input", () => {
    expect(parseFeishuEvent(null)).toBeNull();
    expect(parseFeishuEvent(undefined)).toBeNull();
    expect(parseFeishuEvent("string")).toBeNull();
    expect(parseFeishuEvent(42)).toBeNull();
  });

  it("returns null when header is missing", () => {
    expect(parseFeishuEvent({ event: {} })).toBeNull();
  });

  it("returns null when event is missing", () => {
    expect(parseFeishuEvent({ header: {} })).toBeNull();
  });

  it("returns null when event_id is missing", () => {
    const payload = {
      header: { event_type: "im.message.receive_v1" },
      event: validPayload.event,
    };
    expect(parseFeishuEvent(payload)).toBeNull();
  });

  it("returns null when message is missing", () => {
    const payload = {
      header: validPayload.header,
      event: { sender: validPayload.event.sender },
    };
    expect(parseFeishuEvent(payload)).toBeNull();
  });

  it("returns null when message_id is missing", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.message_id = undefined;
    expect(parseFeishuEvent(payload)).toBeNull();
  });

  it("returns null when chat_id is missing", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.chat_id = undefined;
    expect(parseFeishuEvent(payload)).toBeNull();
  });

  it("returns null when sender open_id is missing", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.sender.sender_id.open_id = undefined;
    expect(parseFeishuEvent(payload)).toBeNull();
  });

  it("sets chatType to 'group' when chat_type is 'group'", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.chat_type = "group";
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.chatType).toBe("group");
  });

  it("defaults chatType to 'p2p' for unknown chat_type", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.chat_type = "channel";
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.chatType).toBe("p2p");
  });

  it("sets mentionedBot to true when mentions array is non-empty", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.mentions = [
      { key: "@_user_1", id: { open_id: "ou_bot" }, name: "Bot" },
    ];
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.mentionedBot).toBe(true);
  });

  it("sets mentionedBot to false when mentions is empty or absent", () => {
    const payload1 = JSON.parse(JSON.stringify(validPayload));
    payload1.event.message.mentions = [];
    expect(parseFeishuEvent(payload1)?.mentionedBot).toBe(false);

    const payload2 = JSON.parse(JSON.stringify(validPayload));
    delete payload2.event.message.mentions;
    expect(parseFeishuEvent(payload2)?.mentionedBot).toBe(false);
  });

  it("extracts text from content JSON", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.content = JSON.stringify({ text: "hello world" });
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.text).toBe("hello world");
  });

  it("falls back to raw content when JSON.parse fails", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.content = "raw text not json";
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.text).toBe("raw text not json");
  });

  it("defaults text to empty when content has no text field", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.content = JSON.stringify({ type: "image" });
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.text).toBe("");
  });

  it("defaults text to empty when content is absent", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    delete payload.event.message.content;
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.text).toBe("");
  });
});

// ── createTaskFromFeishuEvent ───────────────────────────────────────────────

describe("createTaskFromFeishuEvent", () => {
  it("creates a task with correct fields", () => {
    const event = {
      eventId: "ev_1",
      messageId: "msg_1",
      chatId: "oc_1",
      userId: "ou_1",
      text: "run tests",
      chatType: "p2p" as const,
      mentionedBot: false,
    };

    const task = createTaskFromFeishuEvent(event);

    expect(task.source).toBe("feishu");
    expect(task.feishuMessageId).toBe("msg_1");
    expect(task.feishuChatId).toBe("oc_1");
    expect(task.feishuUserId).toBe("ou_1");
    expect(task.commandText).toBe("run tests");
    expect(task.status).toBe("pending");
    expect(task.id).toMatch(/^task_\d+_[a-z0-9]+$/);
    expect(task.createdAt).toBeTruthy();
    expect(task.updatedAt).toBeTruthy();
  });

  it("generates unique task IDs", () => {
    const event = {
      eventId: "ev_1",
      messageId: "msg_1",
      chatId: "oc_1",
      userId: "ou_1",
      text: "test",
      chatType: "p2p" as const,
      mentionedBot: false,
    };

    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(createTaskFromFeishuEvent(event).id);
    }
    expect(ids.size).toBe(20);
  });
});
