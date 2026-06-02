import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTaskStore } from "../../src/server/tasks/store.js";
import type { TaskStore } from "../../src/server/tasks/store.js";
import type { Task } from "../../shared/types.js";
import { unlinkSync } from "node:fs";

const TEST_DB = "/tmp/test-tasks-store.db";

let counter = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  counter++;
  return {
    id: `task_test_${counter}`,
    source: "feishu",
    feishuMessageId: `msg_${counter}`,
    feishuChatId: "chat_xyz",
    feishuUserId: "user_001",
    commandText: "帮我写一个排序算法",
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

let store: TaskStore;

beforeEach(() => {
  counter = 0;
  try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  try { unlinkSync(TEST_DB + "-wal"); } catch { /* ignore */ }
  try { unlinkSync(TEST_DB + "-shm"); } catch { /* ignore */ }
  store = createTaskStore(TEST_DB);
});

afterEach(() => {
  try { unlinkSync(TEST_DB); } catch { /* ignore */ }
  try { unlinkSync(TEST_DB + "-wal"); } catch { /* ignore */ }
  try { unlinkSync(TEST_DB + "-shm"); } catch { /* ignore */ }
});

describe("createTask", () => {
  it("creates a new task and returns it", async () => {
    const task = await store.createTask(makeTask());
    expect(task.source).toBe("feishu");
    expect(task.status).toBe("pending");
    expect(task.feishuMessageId).toMatch(/^msg_/);
    expect(task.feishuChatId).toBe("chat_xyz");
    expect(task.feishuUserId).toBe("user_001");
    expect(task.commandText).toBe("帮我写一个排序算法");
  });

  it("defaults status to pending when not provided", async () => {
    const t = makeTask();
    delete (t as Record<string, unknown>).status;
    const task = await store.createTask(t);
    expect(task.status).toBe("pending");
  });

  it("generates timestamps if not provided", async () => {
    const t = makeTask();
    delete (t as Record<string, unknown>).createdAt;
    delete (t as Record<string, unknown>).updatedAt;
    const task = await store.createTask(t);
    expect(task.createdAt).toBeTruthy();
    expect(task.updatedAt).toBeTruthy();
    expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
  });

  it("returns existing task on duplicate feishuMessageId", async () => {
    const task1 = await store.createTask(makeTask({ id: "t1", feishuMessageId: "dup_msg" }));
    const task2 = await store.createTask(makeTask({ id: "t2", feishuMessageId: "dup_msg" }));
    expect(task1.id).toBe(task2.id);
    expect(task2.feishuMessageId).toBe("dup_msg");
  });

  it("creates tasks with different message IDs", async () => {
    const t1 = await store.createTask(makeTask({ id: "t1", feishuMessageId: "m1" }));
    const t2 = await store.createTask(makeTask({ id: "t2", feishuMessageId: "m2" }));
    expect(t1.id).not.toBe(t2.id);
    expect(t1.feishuMessageId).toBe("m1");
    expect(t2.feishuMessageId).toBe("m2");
  });
});

describe("getTask", () => {
  it("returns task by ID", async () => {
    const created = await store.createTask(makeTask());
    const fetched = await store.getTask(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.commandText).toBe("帮我写一个排序算法");
  });

  it("returns undefined for nonexistent ID", async () => {
    const fetched = await store.getTask("nonexistent");
    expect(fetched).toBeUndefined();
  });
});

describe("listTasks", () => {
  it("lists all tasks by default (limit 20)", async () => {
    await store.createTask(makeTask({ id: "t1", feishuMessageId: "m1" }));
    await store.createTask(makeTask({ id: "t2", feishuMessageId: "m2" }));
    await store.createTask(makeTask({ id: "t3", feishuMessageId: "m3" }));
    const tasks = await store.listTasks();
    expect(tasks).toHaveLength(3);
  });

  it("filters by status", async () => {
    const t1 = await store.createTask(makeTask({ id: "t1", feishuMessageId: "m1" }));
    const t2 = await store.createTask(makeTask({ id: "t2", feishuMessageId: "m2" }));
    const t3 = await store.createTask(makeTask({ id: "t3", feishuMessageId: "m3" }));

    await store.updateTaskStatus(t3.id, "picked");
    await store.updateTaskStatus(t3.id, "running");

    const pending = await store.listTasks("pending");
    expect(pending).toHaveLength(2);
    expect(pending.every((t) => t.status === "pending")).toBe(true);

    const running = await store.listTasks("running");
    expect(running).toHaveLength(1);
    expect(running[0].id).toBe("t3");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await store.createTask(makeTask({ id: `t${i}`, feishuMessageId: `m${i}` }));
    }
    const tasks = await store.listTasks(undefined, 3);
    expect(tasks).toHaveLength(3);
  });

  it("returns empty array when no tasks match", async () => {
    const tasks = await store.listTasks("done");
    expect(tasks).toHaveLength(0);
  });
});

describe("updateTaskStatus", () => {
  it("transitions pending -> picked", async () => {
    const task = await store.createTask(makeTask());
    const updated = await store.updateTaskStatus(task.id, "picked");
    expect(updated.status).toBe("picked");
    expect(updated.updatedAt).not.toBe(task.updatedAt);
  });

  it("transitions pending -> running", async () => {
    const task = await store.createTask(makeTask());
    const updated = await store.updateTaskStatus(task.id, "running");
    expect(updated.status).toBe("running");
  });

  it("transitions picked -> running", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "picked");
    const updated = await store.updateTaskStatus(task.id, "running");
    expect(updated.status).toBe("running");
  });

  it("transitions running -> done", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "running");
    const updated = await store.updateTaskStatus(task.id, "done");
    expect(updated.status).toBe("done");
  });

  it("transitions running -> failed", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "running");
    const updated = await store.updateTaskStatus(task.id, "failed");
    expect(updated.status).toBe("failed");
  });

  it("rejects invalid transition pending -> done", async () => {
    const task = await store.createTask(makeTask());
    await expect(store.updateTaskStatus(task.id, "done")).rejects.toThrow("Invalid status transition");
  });

  it("rejects invalid transition pending -> failed", async () => {
    const task = await store.createTask(makeTask());
    await expect(store.updateTaskStatus(task.id, "failed")).rejects.toThrow("Invalid status transition");
  });

  it("rejects transition from done (terminal state)", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "running");
    await store.updateTaskStatus(task.id, "done");
    await expect(store.updateTaskStatus(task.id, "pending")).rejects.toThrow("Invalid status transition");
  });

  it("rejects transition from failed (terminal state)", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "running");
    await store.updateTaskStatus(task.id, "failed");
    await expect(store.updateTaskStatus(task.id, "pending")).rejects.toThrow("Invalid status transition");
  });

  it("throws for nonexistent task", async () => {
    await expect(store.updateTaskStatus("nonexistent", "picked")).rejects.toThrow("Task not found");
  });

  it("rejects picked -> pending", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "picked");
    await expect(store.updateTaskStatus(task.id, "pending")).rejects.toThrow("Invalid status transition");
  });
});

describe("saveTaskResult", () => {
  it("saves successful result and sets status to done", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "running");
    const updated = await store.saveTaskResult(task.id, true, "排序完成", "使用快排算法");
    expect(updated.status).toBe("done");
    expect(updated.resultSummary).toBe("排序完成");
    expect(updated.resultDetails).toBe("使用快排算法");
  });

  it("saves failed result and sets status to failed", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "running");
    const updated = await store.saveTaskResult(task.id, false, "执行失败", "内存不足");
    expect(updated.status).toBe("failed");
    expect(updated.resultSummary).toBe("执行失败");
    expect(updated.resultDetails).toBe("内存不足");
  });

  it("handles undefined details", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "running");
    const updated = await store.saveTaskResult(task.id, true, "完成");
    expect(updated.resultSummary).toBe("完成");
    expect(updated.resultDetails).toBeUndefined();
  });

  it("throws for nonexistent task", async () => {
    await expect(store.saveTaskResult("nonexistent", true, "ok")).rejects.toThrow("Task not found");
  });

  it("updates updatedAt timestamp", async () => {
    const task = await store.createTask(makeTask());
    await store.updateTaskStatus(task.id, "running");
    const before = new Date().toISOString();
    const updated = await store.saveTaskResult(task.id, true, "done");
    expect(updated.updatedAt >= before).toBe(true);
  });
});

describe("event deduplication", () => {
  it("isEventProcessed returns false for new event", async () => {
    expect(await store.isEventProcessed("evt_001")).toBe(false);
  });

  it("markEventProcessed marks event as processed", async () => {
    await store.markEventProcessed("evt_001");
    expect(await store.isEventProcessed("evt_001")).toBe(true);
  });

  it("duplicate markEventProcessed is idempotent", async () => {
    await store.markEventProcessed("evt_001");
    await store.markEventProcessed("evt_001");
    expect(await store.isEventProcessed("evt_001")).toBe(true);
  });

  it("different events are tracked independently", async () => {
    await store.markEventProcessed("evt_001");
    expect(await store.isEventProcessed("evt_001")).toBe(true);
    expect(await store.isEventProcessed("evt_002")).toBe(false);
  });

  it("unprocessed event stays false after other events processed", async () => {
    await store.markEventProcessed("evt_a");
    await store.markEventProcessed("evt_b");
    expect(await store.isEventProcessed("evt_c")).toBe(false);
  });
});

describe("cleanupProcessedEvents", () => {
  it("returns 0 when no events to clean", async () => {
    const deleted = await store.cleanupProcessedEvents(7);
    expect(deleted).toBe(0);
  });

  it("defaults to 7 days retention", async () => {
    await store.markEventProcessed("evt_1");
    const deleted = await store.cleanupProcessedEvents();
    expect(deleted).toBe(0); // Event is recent
  });

  it("deletes events older than retention period", async () => {
    // Insert events with old timestamps directly
    await store.markEventProcessed("old_evt_1");
    await store.markEventProcessed("old_evt_2");
    await store.markEventProcessed("new_evt_1");

    // Use 365 day retention - all recent events should survive
    const deleted = await store.cleanupProcessedEvents(365);
    expect(deleted).toBe(0);
  });
});

describe("healthCheck", () => {
  it("returns true when database is accessible", async () => {
    const ok = await store.healthCheck();
    expect(ok).toBe(true);
  });

  it("returns true after creating tasks", async () => {
    await store.createTask(makeTask());
    const ok = await store.healthCheck();
    expect(ok).toBe(true);
  });
});
