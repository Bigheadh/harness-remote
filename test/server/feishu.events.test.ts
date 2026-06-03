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
        message_type: "text",
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
      messageType: "text",
      attachments: [],
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

  // ── File attachment tests ────────────────────────────────────────────────

  it("parses file message and extracts attachment metadata", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.message_type = "file";
    payload.event.message.content = JSON.stringify({
      file_key: "file_v3_abc123",
      file_name: "report.pdf",
      file_size: 12345,
      file_type: "pdf",
    });
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.messageType).toBe("file");
    expect(ctx?.text).toBe("[附件] report.pdf");
    expect(ctx?.attachments).toHaveLength(1);
    expect(ctx?.attachments[0]).toEqual({
      fileKey: "file_v3_abc123",
      fileName: "report.pdf",
      fileType: "pdf",
      fileSize: 12345,
      feishuFileType: "file",
    });
  });

  it("parses image message and extracts attachment metadata", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.message_type = "image";
    payload.event.message.content = JSON.stringify({
      image_key: "img_v3_xyz789",
      height: 1080,
      width: 1920,
    });
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.messageType).toBe("image");
    expect(ctx?.text).toBe("[图片]");
    expect(ctx?.attachments).toHaveLength(1);
    expect(ctx?.attachments[0]).toEqual({
      fileKey: "img_v3_xyz789",
      fileName: "image",
      fileType: "image",
      feishuFileType: "image",
    });
  });

  it("parses audio message and extracts attachment metadata", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.message_type = "audio";
    payload.event.message.content = JSON.stringify({
      file_key: "audio_v3_def456",
      duration: 5000,
    });
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.messageType).toBe("audio");
    expect(ctx?.text).toBe("[语音]");
    expect(ctx?.attachments).toHaveLength(1);
    expect(ctx?.attachments[0]).toEqual({
      fileKey: "audio_v3_def456",
      fileName: "audio",
      fileType: "audio",
      feishuFileType: "audio",
    });
  });

  it("parses media (video) message and extracts attachment metadata", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.message_type = "media";
    payload.event.message.content = JSON.stringify({
      file_key: "media_v3_ghi789",
      file_name: "demo.mp4",
      duration: 30000,
    });
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.messageType).toBe("media");
    expect(ctx?.text).toBe("[视频] demo.mp4");
    expect(ctx?.attachments).toHaveLength(1);
    expect(ctx?.attachments[0]).toEqual({
      fileKey: "media_v3_ghi789",
      fileName: "demo.mp4",
      fileType: "video",
      feishuFileType: "media",
    });
  });

  it("defaults messageType to 'text' when message_type is absent", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    delete payload.event.message.message_type;
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.messageType).toBe("text");
    expect(ctx?.attachments).toEqual([]);
  });

  it("handles unknown message type gracefully", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.message_type = "sticker";
    payload.event.message.content = JSON.stringify({ file_key: "stk_123" });
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.messageType).toBe("sticker");
    expect(ctx?.text).toBe("[sticker]");
    expect(ctx?.attachments).toEqual([]);
  });

  it("handles file message with missing file_key gracefully", () => {
    const payload = JSON.parse(JSON.stringify(validPayload));
    payload.event.message.message_type = "file";
    payload.event.message.content = JSON.stringify({
      file_name: "broken.pdf",
    });
    const ctx = parseFeishuEvent(payload);
    expect(ctx?.attachments).toEqual([]);
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
      messageType: "text",
      attachments: [],
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
    expect(task.attachments).toBeUndefined();
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
      messageType: "text",
      attachments: [],
    };

    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(createTaskFromFeishuEvent(event).id);
    }
    expect(ids.size).toBe(20);
  });

  it("includes attachments when present", () => {
    const event = {
      eventId: "ev_1",
      messageId: "msg_1",
      chatId: "oc_1",
      userId: "ou_1",
      text: "[附件] report.pdf",
      chatType: "p2p" as const,
      mentionedBot: false,
      messageType: "file",
      attachments: [
        {
          fileKey: "file_v3_abc",
          fileName: "report.pdf",
          fileType: "pdf",
          fileSize: 12345,
          feishuFileType: "file" as const,
        },
      ],
    };

    const task = createTaskFromFeishuEvent(event);
    expect(task.attachments).toHaveLength(1);
    expect(task.attachments![0].fileKey).toBe("file_v3_abc");
    expect(task.attachments![0].fileName).toBe("report.pdf");
  });

  it("omits attachments when empty", () => {
    const event = {
      eventId: "ev_1",
      messageId: "msg_1",
      chatId: "oc_1",
      userId: "ou_1",
      text: "hello",
      chatType: "p2p" as const,
      mentionedBot: false,
      messageType: "text",
      attachments: [],
    };

    const task = createTaskFromFeishuEvent(event);
    expect(task.attachments).toBeUndefined();
  });

  it("parses tags from message text", () => {
    const event: FeishuEventContext = {
      eventId: "ev_tag_1",
      messageId: "msg_tag_1",
      chatId: "oc_1",
      userId: "ou_1",
      text: "#tag:bug #tag:urgent 请修复登录问题",
      chatType: "p2p",
      mentionedBot: false,
      messageType: "text",
      attachments: [],
    };

    const task = createTaskFromFeishuEvent(event);
    expect(task.tags).toEqual(["bug", "urgent"]);
    expect(task.commandText).toBe("请修复登录问题");
  });

  it("deduplicates tags from message text", () => {
    const event: FeishuEventContext = {
      eventId: "ev_tag_2",
      messageId: "msg_tag_2",
      chatId: "oc_1",
      userId: "ou_1",
      text: "#tag:bug 检查 #tag:bug 状态",
      chatType: "p2p",
      mentionedBot: false,
      messageType: "text",
      attachments: [],
    };

    const task = createTaskFromFeishuEvent(event);
    expect(task.tags).toEqual(["bug"]);
    expect(task.commandText).toBe("检查 状态");
  });

  it("sets tags to undefined when no tags in message", () => {
    const event: FeishuEventContext = {
      eventId: "ev_tag_3",
      messageId: "msg_tag_3",
      chatId: "oc_1",
      userId: "ou_1",
      text: "普通消息",
      chatType: "p2p",
      mentionedBot: false,
      messageType: "text",
      attachments: [],
    };

    const task = createTaskFromFeishuEvent(event);
    expect(task.tags).toBeUndefined();
    expect(task.commandText).toBe("普通消息");
  });

  it("parses tags combined with priority", () => {
    const event: FeishuEventContext = {
      eventId: "ev_tag_4",
      messageId: "msg_tag_4",
      chatId: "oc_1",
      userId: "ou_1",
      text: "#priority:urgent #tag:critical 紧急修复",
      chatType: "p2p",
      mentionedBot: false,
      messageType: "text",
      attachments: [],
    };

    const task = createTaskFromFeishuEvent(event);
    expect(task.priority).toBe("urgent");
    expect(task.tags).toEqual(["critical"]);
    expect(task.commandText).toBe("紧急修复");
  });

  it("extracts description from #desc: marker", () => {
    const event: FeishuEventContext = {
      eventId: "ev_desc_1",
      messageId: "msg_desc_1",
      chatId: "oc_1",
      userId: "ou_1",
      text: "部署API #priority:high #desc:部署新版本到staging环境，验证健康检查",
      chatType: "p2p",
      mentionedBot: false,
      messageType: "text",
      attachments: [],
    };

    const task = createTaskFromFeishuEvent(event);
    expect(task.description).toBe("部署新版本到staging环境，验证健康检查");
    expect(task.commandText).toBe("部署API");
    expect(task.priority).toBe("high");
  });

  it("strips description marker from commandText", () => {
    const event: FeishuEventContext = {
      eventId: "ev_desc_2",
      messageId: "msg_desc_2",
      chatId: "oc_1",
      userId: "ou_1",
      text: "运行测试 #desc:执行完整的单元测试套件",
      chatType: "p2p",
      mentionedBot: false,
      messageType: "text",
      attachments: [],
    };

    const task = createTaskFromFeishuEvent(event);
    expect(task.commandText).toBe("运行测试");
    expect(task.description).toBe("执行完整的单元测试套件");
  });

  it("sets description to undefined when no #desc: marker", () => {
    const event: FeishuEventContext = {
      eventId: "ev_desc_3",
      messageId: "msg_desc_3",
      chatId: "oc_1",
      userId: "ou_1",
      text: "普通消息没有描述",
      chatType: "p2p",
      mentionedBot: false,
      messageType: "text",
      attachments: [],
    };

    const task = createTaskFromFeishuEvent(event);
    expect(task.description).toBeUndefined();
    expect(task.commandText).toBe("普通消息没有描述");
  });
});
