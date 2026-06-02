import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { createTaskStore } from "../../src/server/tasks/store.js";
import { registerTaskRoutes } from "../../src/server/tasks/routes.js";
import { registerFeishuRoutes } from "../../src/server/feishu/events.js";
import { mkdirSync, rmSync } from "node:fs";

const TEST_DATA_DIR = "/tmp/harness-remote-integration-test";
const TEST_DB_PATH = `${TEST_DATA_DIR}/test.sqlite`;
const PERSONAL_TOKEN = "test-integration-token-abc123";

const FEISHU_CONFIG = {
  appId: "cli_test_app",
  appSecret: "test_secret",
  verificationToken: "test_verify_token",
  encryptKey: "",
  allowedUserIds: ["ou_allowed_user_001"],
};

function makeFeishuEvent(overrides: Partial<{
  eventId: string;
  messageId: string;
  chatId: string;
  userId: string;
  text: string;
  chatType: "p2p" | "group";
  mentionedBot: boolean;
}> = {}) {
  const defaults = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    messageId: `om_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    chatId: "oc_test_chat_001",
    userId: "ou_allowed_user_001",
    text: "请帮我检查项目构建状态",
    chatType: "p2p" as const,
    mentionedBot: false,
  };
  return { ...defaults, ...overrides };
}

function buildFeishuPayload(ctx: ReturnType<typeof makeFeishuEvent>) {
  return {
    schema: "2.0",
    header: {
      event_id: ctx.eventId,
      event_type: "im.message.receive_v1",
      token: FEISHU_CONFIG.verificationToken,
    },
    event: {
      sender: {
        sender_id: { open_id: ctx.userId },
        sender_type: "user",
      },
      message: {
        message_id: ctx.messageId,
        chat_id: ctx.chatId,
        chat_type: ctx.chatType,
        content: JSON.stringify({ text: ctx.text }),
        mentions: ctx.mentionedBot
          ? [{ key: "@_user_1", id: { open_id: "ou_bot_001" }, name: "Bot" }]
          : undefined,
      },
    },
  };
}

let server: ReturnType<typeof Fastify>;

beforeAll(async () => {
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  rmSync(TEST_DB_PATH, { force: true });
  rmSync(`${TEST_DB_PATH}-wal`, { force: true });
  rmSync(`${TEST_DB_PATH}-shm`, { force: true });

  const store = createTaskStore(TEST_DB_PATH);
  server = Fastify({ logger: false });
  registerTaskRoutes(server, store, PERSONAL_TOKEN);
  registerFeishuRoutes(server, store, FEISHU_CONFIG);
  await server.ready();
});

afterAll(async () => {
  await server?.close();
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe("End-to-end: Feishu event → Task API lifecycle", () => {
  let createdTaskId: string;

  it("POST /feishu/events creates a task from a valid P2P message", async () => {
    const ctx = makeFeishuEvent();
    const payload = buildFeishuPayload(ctx);

    const res = await server.inject({
      method: "POST",
      url: "/feishu/events",
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { ok: boolean; taskId: string };
    expect(body.ok).toBe(true);
    expect(body.taskId).toMatch(/^task_/);
    createdTaskId = body.taskId;
  });

  it("GET /api/tasks returns the newly created task", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { tasks: Array<{ id: string; status: string; commandText: string }> };
    expect(body.tasks.length).toBeGreaterThanOrEqual(1);
    const found = body.tasks.find((t) => t.id === createdTaskId);
    expect(found).toBeDefined();
    expect(found!.status).toBe("pending");
    expect(found!.commandText).toBe("请帮我检查项目构建状态");
  });

  it("GET /api/tasks/:id returns task detail", async () => {
    const res = await server.inject({
      method: "GET",
      url: `/api/tasks/${createdTaskId}`,
      headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      task: {
        id: string;
        source: string;
        feishuUserId: string;
        status: string;
      };
    };
    expect(body.task.id).toBe(createdTaskId);
    expect(body.task.source).toBe("feishu");
    expect(body.task.feishuUserId).toBe("ou_allowed_user_001");
    expect(body.task.status).toBe("pending");
  });

  it("POST /api/tasks/:id/status transitions to 'picked'", async () => {
    const res = await server.inject({
      method: "POST",
      url: `/api/tasks/${createdTaskId}/status`,
      headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
      payload: { status: "picked" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { task: { status: string } };
    expect(body.task.status).toBe("picked");
  });

  it("POST /api/tasks/:id/status transitions to 'running'", async () => {
    const res = await server.inject({
      method: "POST",
      url: `/api/tasks/${createdTaskId}/status`,
      headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
      payload: { status: "running" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { task: { status: string } };
    expect(body.task.status).toBe("running");
  });

  it("POST /api/tasks/:id/result completes the task as done", async () => {
    const res = await server.inject({
      method: "POST",
      url: `/api/tasks/${createdTaskId}/result`,
      headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
      payload: {
        success: true,
        summary: "项目构建成功，所有测试通过。",
        details: "构建耗时 12s，0 个错误。",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      task: { status: string; resultSummary: string; resultDetails: string };
    };
    expect(body.task.status).toBe("done");
    expect(body.task.resultSummary).toBe("项目构建成功，所有测试通过。");
    expect(body.task.resultDetails).toBe("构建耗时 12s，0 个错误。");
  });

  it("duplicate Feishu event is deduplicated (returns 200, no new task)", async () => {
    const ctx = makeFeishuEvent();
    const payload = buildFeishuPayload(ctx);

    // First submission
    const res1 = await server.inject({
      method: "POST",
      url: "/feishu/events",
      payload,
    });
    expect(res1.statusCode).toBe(201);

    // Duplicate submission (same event_id)
    const res2 = await server.inject({
      method: "POST",
      url: "/feishu/events",
      payload,
    });
    expect(res2.statusCode).toBe(200);
    const body = res2.json() as { ok: boolean; taskId?: string };
    expect(body.taskId).toBeUndefined();
  });

  it("non-allowed user is silently ignored (200, no task)", async () => {
    const ctx = makeFeishuEvent({ userId: "ou_unknown_user" });
    const payload = buildFeishuPayload(ctx);

    const res = await server.inject({
      method: "POST",
      url: "/feishu/events",
      payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it("group chat without bot mention is ignored", async () => {
    const ctx = makeFeishuEvent({
      chatType: "group",
      mentionedBot: false,
    });
    const payload = buildFeishuPayload(ctx);

    const res = await server.inject({
      method: "POST",
      url: "/feishu/events",
      payload,
    });

    expect(res.statusCode).toBe(200);
  });

  it("group chat WITH bot mention creates a task", async () => {
    const ctx = makeFeishuEvent({
      chatType: "group",
      mentionedBot: true,
      text: "@Bot 请帮我部署新版本",
    });
    const payload = buildFeishuPayload(ctx);

    const res = await server.inject({
      method: "POST",
      url: "/feishu/events",
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { ok: boolean; taskId: string };
    expect(body.taskId).toMatch(/^task_/);
  });

  it("API without auth returns 401", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/tasks",
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("API with wrong token returns 401", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { authorization: "Bearer wrong-token" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/tasks/:id for non-existent task returns 404", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/tasks/task_nonexistent",
      headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("POST /health returns 200", async () => {
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("POST /api/tasks/:id/result with missing fields returns 400", async () => {
    const ctx = makeFeishuEvent();
    const payload = buildFeishuPayload(ctx);
    const createRes = await server.inject({
      method: "POST",
      url: "/feishu/events",
      payload,
    });
    const taskId = (createRes.json() as { taskId: string }).taskId;

    const res = await server.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/result`,
      headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
      payload: { success: true }, // missing summary
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/tasks/cleanup-events returns deleted count", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/tasks/cleanup-events",
      headers: { authorization: `Bearer ${PERSONAL_TOKEN}` },
      payload: { retentionDays: 7 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; deletedCount: number };
    expect(body.ok).toBe(true);
    expect(typeof body.deletedCount).toBe("number");
  });

  it("POST /api/tasks/cleanup-events without auth returns 401", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/tasks/cleanup-events",
      payload: { retentionDays: 7 },
    });

    expect(res.statusCode).toBe(401);
  });
});
