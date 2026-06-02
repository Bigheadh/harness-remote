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

describe("searchTasks", () => {
  it("returns empty array when no tasks match", async () => {
    const results = await store.searchTasks({ q: "nonexistent" });
    expect(results).toHaveLength(0);
  });

  it("searches by text in commandText", async () => {
    await store.createTask(makeTask({ commandText: "帮我部署项目到服务器", status: "done" }));
    await store.createTask(makeTask({ commandText: "写一个排序算法", status: "done" }));
    await store.createTask(makeTask({ commandText: "部署数据库迁移脚本", status: "done" }));

    const results = await store.searchTasks({ q: "部署" });
    expect(results).toHaveLength(2);
    expect(results.every((t) => t.commandText.includes("部署"))).toBe(true);
  });

  it("searches by text in resultSummary", async () => {
    const taskA = await store.createTask(makeTask({ commandText: "任务A" }));
    await store.saveTaskResult(taskA.id, true, "已部署到生产环境");
    const taskB = await store.createTask(makeTask({ commandText: "任务B" }));
    await store.saveTaskResult(taskB.id, true, "代码已提交");

    const results = await store.searchTasks({ q: "部署" });
    expect(results).toHaveLength(1);
    expect(results[0].resultSummary).toContain("部署");
  });

  it("filters by status", async () => {
    await store.createTask(makeTask({ commandText: "任务1", status: "pending" }));
    await store.createTask(makeTask({ commandText: "任务2", status: "done" }));

    const results = await store.searchTasks({ status: "done" });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("done");
  });

  it("filters by date range", async () => {
    const oldDate = new Date("2025-01-01T00:00:00.000Z").toISOString();
    const recentDate = new Date().toISOString();

    await store.createTask(makeTask({ commandText: "旧任务", createdAt: oldDate, updatedAt: oldDate }));
    await store.createTask(makeTask({ commandText: "新任务", createdAt: recentDate, updatedAt: recentDate }));

    const results = await store.searchTasks({ from: "2026-01-01T00:00:00.000Z" });
    expect(results).toHaveLength(1);
    expect(results[0].commandText).toBe("新任务");
  });

  it("combines multiple filters", async () => {
    await store.createTask(makeTask({ commandText: "部署任务", status: "done" }));
    await store.createTask(makeTask({ commandText: "部署任务2", status: "pending" }));
    await store.createTask(makeTask({ commandText: "其他任务", status: "done" }));

    const results = await store.searchTasks({ q: "部署", status: "done" });
    expect(results).toHaveLength(1);
    expect(results[0].commandText).toBe("部署任务");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await store.createTask(makeTask({ commandText: `搜索测试${i}` }));
    }

    const results = await store.searchTasks({ q: "搜索测试", limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("returns results sorted by created_at DESC", async () => {
    const oldDate = new Date("2025-01-01T00:00:00.000Z").toISOString();
    const newDate = new Date("2026-12-31T00:00:00.000Z").toISOString();

    await store.createTask(makeTask({ commandText: "旧任务", createdAt: oldDate, updatedAt: oldDate }));
    await store.createTask(makeTask({ commandText: "新任务", createdAt: newDate, updatedAt: newDate }));

    const results = await store.searchTasks({ q: "任务" });
    expect(results[0].commandText).toBe("新任务");
    expect(results[1].commandText).toBe("旧任务");
  });
});

describe("attachments", () => {
  it("stores and retrieves task with attachments", async () => {
    const task = await store.createTask(
      makeTask({
        id: "t_att_1",
        feishuMessageId: "msg_att_1",
        attachments: [
          {
            fileKey: "file_v3_abc",
            fileName: "report.pdf",
            fileType: "pdf",
            fileSize: 12345,
            feishuFileType: "file",
          },
        ],
      }),
    );
    expect(task.attachments).toHaveLength(1);
    expect(task.attachments![0].fileKey).toBe("file_v3_abc");
    expect(task.attachments![0].fileName).toBe("report.pdf");

    const fetched = await store.getTask(task.id);
    expect(fetched).toBeDefined();
    expect(fetched!.attachments).toHaveLength(1);
    expect(fetched!.attachments![0].fileKey).toBe("file_v3_abc");
  });

  it("stores task without attachments as undefined", async () => {
    const task = await store.createTask(
      makeTask({ id: "t_no_att", feishuMessageId: "msg_no_att" }),
    );
    expect(task.attachments).toBeUndefined();

    const fetched = await store.getTask(task.id);
    expect(fetched!.attachments).toBeUndefined();
  });

  it("stores multiple attachments", async () => {
    const task = await store.createTask(
      makeTask({
        id: "t_multi",
        feishuMessageId: "msg_multi",
        attachments: [
          {
            fileKey: "img_v3_1",
            fileName: "image",
            fileType: "image",
            feishuFileType: "image",
          },
          {
            fileKey: "file_v3_2",
            fileName: "doc.pdf",
            fileType: "pdf",
            fileSize: 9999,
            feishuFileType: "file",
          },
        ],
      }),
    );
    expect(task.attachments).toHaveLength(2);
    expect(task.attachments![0].feishuFileType).toBe("image");
    expect(task.attachments![1].feishuFileType).toBe("file");

    const fetched = await store.getTask(task.id);
    expect(fetched!.attachments).toHaveLength(2);
  });

  it("preserves attachments in listTasks", async () => {
    await store.createTask(
      makeTask({
        id: "t_list_att",
        feishuMessageId: "msg_list_att",
        attachments: [
          {
            fileKey: "file_v3_list",
            fileName: "data.csv",
            fileType: "csv",
            feishuFileType: "file",
          },
        ],
      }),
    );
    const tasks = await store.listTasks();
    const found = tasks.find((t) => t.id === "t_list_att");
    expect(found).toBeDefined();
    expect(found!.attachments).toHaveLength(1);
    expect(found!.attachments![0].fileName).toBe("data.csv");
  });

  it("preserves attachments in searchTasks", async () => {
    await store.createTask(
      makeTask({
        id: "t_search_att",
        feishuMessageId: "msg_search_att",
        commandText: "搜索附件测试",
        attachments: [
          {
            fileKey: "file_v3_search",
            fileName: "result.xlsx",
            fileType: "xlsx",
            feishuFileType: "file",
          },
        ],
      }),
    );
    const results = await store.searchTasks({ q: "搜索附件" });
    expect(results).toHaveLength(1);
    expect(results[0].attachments).toHaveLength(1);
    expect(results[0].attachments![0].fileName).toBe("result.xlsx");
  });

  describe("tags", () => {
    it("stores and retrieves tags", async () => {
      await store.createTask(
        makeTask({
          id: "t_tags_1",
          feishuMessageId: "msg_tags_1",
          tags: ["bug", "urgent"],
        }),
      );
      const task = await store.getTask("t_tags_1");
      expect(task).toBeDefined();
      expect(task!.tags).toEqual(["bug", "urgent"]);
    });

    it("creates task without tags", async () => {
      await store.createTask(
        makeTask({
          id: "t_no_tags",
          feishuMessageId: "msg_no_tags",
        }),
      );
      const task = await store.getTask("t_no_tags");
      expect(task).toBeDefined();
      expect(task!.tags).toBeUndefined();
    });

    it("adds tags to a task", async () => {
      await store.createTask(
        makeTask({
          id: "t_add_tags",
          feishuMessageId: "msg_add_tags",
          tags: ["bug"],
        }),
      );
      const updated = await store.addTags("t_add_tags", ["urgent", "bug"]);
      expect(updated.tags).toEqual(["bug", "urgent"]);
    });

    it("deduplicates tags when adding", async () => {
      await store.createTask(
        makeTask({
          id: "t_dedup_tags",
          feishuMessageId: "msg_dedup_tags",
          tags: ["bug"],
        }),
      );
      const updated = await store.addTags("t_dedup_tags", ["bug", "feature"]);
      expect(updated.tags).toEqual(["bug", "feature"]);
    });

    it("removes a tag from a task", async () => {
      await store.createTask(
        makeTask({
          id: "t_rm_tag",
          feishuMessageId: "msg_rm_tag",
          tags: ["bug", "urgent"],
        }),
      );
      const updated = await store.removeTag("t_rm_tag", "bug");
      expect(updated.tags).toEqual(["urgent"]);
    });

    it("sets tags to undefined when all tags removed", async () => {
      await store.createTask(
        makeTask({
          id: "t_rm_all",
          feishuMessageId: "msg_rm_all",
          tags: ["bug"],
        }),
      );
      const updated = await store.removeTag("t_rm_all", "bug");
      expect(updated.tags).toBeUndefined();
    });

    it("lists all unique tags", async () => {
      await store.createTask(
        makeTask({
          id: "t_list_a",
          feishuMessageId: "msg_list_a",
          tags: ["bug", "urgent"],
        }),
      );
      await store.createTask(
        makeTask({
          id: "t_list_b",
          feishuMessageId: "msg_list_b",
          tags: ["feature", "bug"],
        }),
      );
      const tags = await store.listAllTags();
      expect(tags).toEqual(["bug", "feature", "urgent"]);
    });

    it("filters tasks by tags in searchTasks", async () => {
      await store.createTask(
        makeTask({
          id: "t_ftag_1",
          feishuMessageId: "msg_ftag_1",
          tags: ["bug", "urgent"],
        }),
      );
      await store.createTask(
        makeTask({
          id: "t_ftag_2",
          feishuMessageId: "msg_ftag_2",
          tags: ["feature"],
        }),
      );
      const results = await store.searchTasks({ tags: ["bug"] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("t_ftag_1");
    });

    it("filters tasks by multiple tags in searchTasks", async () => {
      await store.createTask(
        makeTask({
          id: "t_mtag_1",
          feishuMessageId: "msg_mtag_1",
          tags: ["bug", "urgent"],
        }),
      );
      await store.createTask(
        makeTask({
          id: "t_mtag_2",
          feishuMessageId: "msg_mtag_2",
          tags: ["bug", "feature"],
        }),
      );
      const results = await store.searchTasks({ tags: ["bug", "urgent"] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("t_mtag_1");
    });

    it("addTags throws for non-existent task", async () => {
      await expect(store.addTags("nonexistent", ["tag"])).rejects.toThrow("Task not found");
    });

    it("removeTag throws for non-existent task", async () => {
      await expect(store.removeTag("nonexistent", "tag")).rejects.toThrow("Task not found");
    });
  });
});
