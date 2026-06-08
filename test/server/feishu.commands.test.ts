import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseCommand,
  executeCommand,
} from "../../src/server/feishu/commands.js";
import type { Task, TaskStore } from "../../src/shared/types.js";
import type { FeishuReplyClient } from "../../src/server/feishu/client.js";
import type { FeishuCard } from "../../src/server/feishu/card-builder.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_001",
    source: "feishu",
    feishuMessageId: "om_msg_001",
    feishuChatId: "oc_chat_001",
    feishuUserId: "ou_user_001",
    commandText: "Check project status",
    status: "pending",
    priority: "normal",
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

function createMockStore(overrides: Partial<TaskStore> = {}): TaskStore {
  return {
    listTasksByUser: vi.fn().mockResolvedValue([]),
    listOverdueTasks: vi.fn().mockResolvedValue([]),
    listTasks: vi.fn().mockResolvedValue([]),
    searchTasks: vi.fn().mockResolvedValue([]),
    getTask: vi.fn().mockResolvedValue(undefined),
    countTasksByStatus: vi.fn().mockResolvedValue({
      pending: 0, picked: 0, running: 0, done: 0, failed: 0,
    }),
    listAllTags: vi.fn().mockResolvedValue([]),
    getTaskStats: vi.fn().mockResolvedValue({
      total: 0, byStatus: {}, byPriority: {}, overdueCount: 0,
    }),
    createTask: vi.fn(),
    updateTaskStatus: vi.fn(),
    saveTaskResult: vi.fn(),
    getTaskMessageId: vi.fn(),
    assignTask: vi.fn(),
    unassignTask: vi.fn(),
    resetStaleTasks: vi.fn(),
    cleanupProcessedEvents: vi.fn(),
    isEventProcessed: vi.fn(),
    markEventProcessed: vi.fn(),
    healthCheck: vi.fn(),
    addTags: vi.fn(),
    removeTag: vi.fn(),
    setTaskDueDate: vi.fn(),
    setTaskReminder: vi.fn(),
    setTaskDescription: vi.fn(),
    setTaskPriority: vi.fn(),
    setTaskEstimatedMinutes: vi.fn(),
    addComment: vi.fn(),
    listComments: vi.fn(),
    deleteComment: vi.fn(),
    bulkUpdateStatus: vi.fn(),
    bulkAssign: vi.fn(),
    bulkDelete: vi.fn(),
    bulkAddTags: vi.fn(),
    bulkRemoveTags: vi.fn(),
    bulkUpdatePriority: vi.fn(),
    createTemplate: vi.fn(),
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    incrementTemplateUsage: vi.fn(),
    getTemplateUsageStats: vi.fn(),
    createScheduledTask: vi.fn(),
    listScheduledTasks: vi.fn(),
    getScheduledTask: vi.fn(),
    updateScheduledTask: vi.fn(),
    deleteScheduledTask: vi.fn(),
    getDueScheduledTasks: vi.fn(),
    markScheduledTaskRun: vi.fn(),
    setDependencies: vi.fn(),
    getDependencies: vi.fn(),
    getDependents: vi.fn(),
    isTaskBlocked: vi.fn(),
    listReadyTasks: vi.fn(),
    exportAll: vi.fn(),
    importAll: vi.fn(),
    createSlaPolicy: vi.fn(),
    listSlaPolicies: vi.fn(),
    getSlaPolicy: vi.fn(),
    updateSlaPolicy: vi.fn(),
    deleteSlaPolicy: vi.fn(),
    getSlaStatusForTask: vi.fn(),
    listSlaBreaches: vi.fn(),
    getSlaSummary: vi.fn(),
    checkAndRecordSlaBreaches: vi.fn(),
    getTaskTimeSeries: vi.fn(),
    getAllTasks: vi.fn(),
    retryTask: vi.fn(),
    cloneTask: vi.fn(),
    reopenTask: vi.fn(),
    pinTask: vi.fn(),
    unpinTask: vi.fn(),
    forwardTask: vi.fn(),
    addNote: vi.fn(),
    listNotes: vi.fn(),
    deleteNote: vi.fn(),
    listTasksByUser: vi.fn().mockResolvedValue([]),
    getDependencyGraph: vi.fn(),
    addRelationship: vi.fn(),
    removeRelationship: vi.fn(),
    listRelationships: vi.fn(),
    lockTask: vi.fn(),
    unlockTask: vi.fn(),
    getTaskLock: vi.fn(),
    cleanupExpiredLocks: vi.fn(),
    createSubtask: vi.fn(),
    listSubtasks: vi.fn(),
    getSubtask: vi.fn(),
    updateSubtaskStatus: vi.fn(),
    saveSubtaskResult: vi.fn(),
    deleteSubtask: vi.fn(),
    addWatcher: vi.fn().mockResolvedValue({ taskId: "task_001", userId: "ou_user_001", createdAt: "2026-06-08T12:00:00.000Z" }),
    removeWatcher: vi.fn().mockResolvedValue(true),
    listWatchers: vi.fn().mockResolvedValue([]),
    isWatching: vi.fn().mockResolvedValue(false),
    ...overrides,
  } as TaskStore;
}

function createMockFeishuClient(): FeishuReplyClient & {
  sentCards: FeishuCard[];
  sentMessages: string[];
} {
  const sentCards: FeishuCard[] = [];
  const sentMessages: string[] = [];
  return {
    sentCards,
    sentMessages,
    replyToMessage: vi.fn().mockResolvedValue(undefined),
    sendCardMessage: vi.fn().mockImplementation(({ card }) => {
      sentCards.push(card);
      return Promise.resolve();
    }),
    sendDirectCardMessage: vi.fn().mockResolvedValue(undefined),
    updateCardMessage: vi.fn().mockResolvedValue(undefined),
    getTenantAccessToken: vi.fn().mockResolvedValue("mock_token"),
  } as unknown as FeishuReplyClient & {
    sentCards: FeishuCard[];
    sentMessages: string[];
  };
}

describe("Feishu Commands - Digest", () => {
  let store: TaskStore;
  let feishuClient: ReturnType<typeof createMockFeishuClient>;

  beforeEach(() => {
    store = createMockStore();
    feishuClient = createMockFeishuClient();
  });

  describe("parseCommand", () => {
    it("parses /digest command", () => {
      const cmd = parseCommand("/digest");
      expect(cmd).toEqual({ command: "digest", args: "" });
    });

    it("parses /digest with extra args (ignored)", () => {
      const cmd = parseCommand("/digest extra");
      expect(cmd).toEqual({ command: "digest", args: "extra" });
    });
  });

  describe("executeCommand /digest", () => {
    it("sends a digest card when called", async () => {
      const result = await executeCommand(
        { command: "digest", args: "" },
        "ou_user_001",
        "oc_chat_001",
        "msg_001",
        store,
        feishuClient as unknown as FeishuReplyClient,
      );

      expect(result).toBe(true);
      expect(feishuClient.sendCardMessage).toHaveBeenCalledOnce();
      const card = feishuClient.sentCards[0];
      expect(card.header.title.content).toBe("📊 Task Digest");
    });

    it("shows empty state when no tasks", async () => {
      await executeCommand(
        { command: "digest", args: "" },
        "ou_user_001",
        "oc_chat_001",
        "msg_001",
        store,
        feishuClient as unknown as FeishuReplyClient,
      );

      const card = feishuClient.sentCards[0];
      const summaryEl = card.elements.find(
        (e) => e.text?.content?.includes("Pending:"),
      );
      expect(summaryEl).toBeDefined();
      expect(summaryEl!.text!.content).toContain("**Pending:** 0");
      expect(summaryEl!.text!.content).toContain("**Done Today:**");
    });

    it("shows overdue tasks with red header", async () => {
      const overdueTask = makeTask({
        id: "task_overdue_001",
        feishuUserId: "ou_user_001",
        status: "pending",
        dueDate: "2026-06-01",
        commandText: "Fix critical bug",
      });

      (store.listOverdueTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
        overdueTask,
      ]);
      (store.listTasksByUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        overdueTask,
      ]);

      await executeCommand(
        { command: "digest", args: "" },
        "ou_user_001",
        "oc_chat_001",
        "msg_001",
        store,
        feishuClient as unknown as FeishuReplyClient,
      );

      const card = feishuClient.sentCards[0];
      expect(card.header.template).toBe("red");
      const overdueEl = card.elements.find(
        (e) => e.text?.content?.includes("Overdue Tasks:"),
      );
      expect(overdueEl).toBeDefined();
      expect(overdueEl!.text!.content).toContain("Fix critical bug");
    });

    it("shows pending tasks in summary", async () => {
      const pendingTasks = [
        makeTask({
          id: "task_p1",
          feishuUserId: "ou_user_001",
          status: "pending",
          commandText: "Task 1",
        }),
        makeTask({
          id: "task_p2",
          feishuUserId: "ou_user_001",
          status: "pending",
          commandText: "Task 2",
        }),
      ];

      (store.listTasksByUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        pendingTasks,
      );

      await executeCommand(
        { command: "digest", args: "" },
        "ou_user_001",
        "oc_chat_001",
        "msg_001",
        store,
        feishuClient as unknown as FeishuReplyClient,
      );

      const card = feishuClient.sentCards[0];
      const summaryEl = card.elements.find(
        (e) => e.text?.content?.includes("Pending:"),
      );
      expect(summaryEl!.text!.content).toContain("**Pending:** 2");
    });

    it("shows in-progress tasks", async () => {
      const runningTask = makeTask({
        id: "task_run1",
        feishuUserId: "ou_user_001",
        status: "running",
        commandText: "Running task",
      });

      (store.listTasksByUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        runningTask,
      ]);

      await executeCommand(
        { command: "digest", args: "" },
        "ou_user_001",
        "oc_chat_001",
        "msg_001",
        store,
        feishuClient as unknown as FeishuReplyClient,
      );

      const card = feishuClient.sentCards[0];
      // The in-progress section is a separate element from the summary
      const inProgressEl = card.elements.find(
        (e) => e.text?.content?.startsWith("**🔄 In Progress:**"),
      );
      expect(inProgressEl).toBeDefined();
      expect(inProgressEl!.text!.content).toContain("Running task");
      expect(inProgressEl!.text!.content).toContain("Running");
    });

    it("handles errors gracefully", async () => {
      (store.listTasksByUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("DB error"),
      );

      const result = await executeCommand(
        { command: "digest", args: "" },
        "ou_user_001",
        "oc_chat_001",
        "msg_001",
        store,
        feishuClient as unknown as FeishuReplyClient,
      );

      expect(result).toBe(false);
      // Error card should be sent
      expect(feishuClient.sendCardMessage).toHaveBeenCalled();
      const errorCard = feishuClient.sentCards[feishuClient.sentCards.length - 1];
      expect(errorCard.header.title.content).toBe("Command Error");
    });
  });
});

// ─── Task Management Commands Tests ────────────────────────────
// These tests use an in-memory SQLite store for realistic behavior

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

let counter = 0;

function createInMemoryStore(): TaskStore {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA journal_mode=WAL;`);
  db.exec(`CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    feishu_message_id TEXT NOT NULL UNIQUE,
    feishu_chat_id TEXT NOT NULL,
    feishu_user_id TEXT NOT NULL,
    command_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result_summary TEXT,
    result_details TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    picked_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    tags TEXT DEFAULT '[]',
    attachments TEXT DEFAULT '[]',
    assigned_device_id TEXT,
    due_date TEXT,
    reminder_at TEXT,
    description TEXT,
    cycle_id TEXT,
    module_id TEXT,
    due_date_offset_ms INTEGER,
    reminder_offset_ms INTEGER,
    estimated_minutes INTEGER,
    is_pinned INTEGER DEFAULT 0,
    archived_at TEXT,
    reopened_count INTEGER DEFAULT 0,
    notes TEXT DEFAULT '[]',
    estimated_cost REAL DEFAULT 0,
    actual_cost REAL DEFAULT 0
  )`);
  db.exec(`CREATE TABLE task_tags (task_id TEXT, tag TEXT, PRIMARY KEY(task_id, tag))`);

  const insertStmt = db.prepare(`INSERT INTO tasks (id, feishu_message_id, feishu_chat_id, feishu_user_id, command_text, status, priority, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const selectById = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
  const updateStatusStmt = db.prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`);
  const assignStmt = db.prepare(`UPDATE tasks SET assigned_device_id = ?, updated_at = ? WHERE id = ?`);
  const setPriorityStmt = db.prepare(`UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?`);
  const setDueDateStmt = db.prepare(`UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?`);
  const addTagStmt = db.prepare(`INSERT OR IGNORE INTO task_tags (task_id, tag) VALUES (?, ?)`);
  const selectTags = db.prepare(`SELECT tag FROM task_tags WHERE task_id = ?`);

  return {
    async createTask(input) {
      counter++;
      const id = input.id || `task_${counter}`;
      const now = new Date().toISOString();
      const tags = input.tags || [];
      insertStmt.run(id, input.feishuMessageId || `msg_${counter}`, input.feishuChatId || "chat_1", input.feishuUserId || "user_1", input.commandText, input.status || "pending", input.priority || "normal", JSON.stringify(tags), now, now);
      for (const tag of tags) {
        addTagStmt.run(id, tag);
      }
      return this.getTask(id) as Promise<Task>;
    },
    async getTask(id) {
      const row = selectById.get(id) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      const tagRows = selectTags.all(id) as { tag: string }[];
      return {
        id: row.id,
        source: row.source ?? "feishu",
        feishuMessageId: row.feishu_message_id,
        feishuChatId: row.feishu_chat_id,
        feishuUserId: row.feishu_user_id,
        commandText: row.command_text,
        status: row.status,
        resultSummary: row.result_summary,
        resultDetails: row.result_details,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        pickedAt: row.picked_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        priority: row.priority,
        tags: tagRows.map(r => r.tag),
        attachments: row.attachments ? JSON.parse(row.attachments as string) : [],
        assignedDeviceId: row.assigned_device_id,
        dueDate: row.due_date,
        reminderAt: row.reminder_at,
        description: row.description,
        cycleId: row.cycle_id,
        moduleId: row.module_id,
        dueDateOffsetMs: row.due_date_offset_ms,
        reminderOffsetMs: row.reminder_offset_ms,
        estimatedMinutes: row.estimated_minutes,
        isPinned: row.is_pinned === 1,
        archivedAt: row.archived_at,
        reopenedCount: row.reopened_count,
        notes: row.notes ? JSON.parse(row.notes as string) : [],
        estimatedCost: row.estimated_cost,
        actualCost: row.actual_cost,
      } as Task;
    },
    async updateTaskStatus(id, status) {
      const now = new Date().toISOString();
      updateStatusStmt.run(status, now, id);
      return this.getTask(id) as Promise<Task>;
    },
    async assignTask(id, deviceId) {
      const now = new Date().toISOString();
      assignStmt.run(deviceId, now, id);
      return this.getTask(id) as Promise<Task>;
    },
    async setTaskPriority(id, priority) {
      const now = new Date().toISOString();
      setPriorityStmt.run(priority, now, id);
      return this.getTask(id) as Promise<Task>;
    },
    async setTaskDueDate(id, dueDate) {
      const now = new Date().toISOString();
      setDueDateStmt.run(dueDate, now, id);
      return this.getTask(id) as Promise<Task>;
    },
    async listTasks(status, limit) {
      const stmt = db.prepare(
        status
          ? "SELECT id FROM tasks WHERE status = ? LIMIT ?"
          : "SELECT id FROM tasks LIMIT ?"
      );
      const rows = status
        ? stmt.all(status, limit ?? 20) as { id: string }[]
        : stmt.all(limit ?? 20) as { id: string }[];
      const tasks: Task[] = [];
      for (const row of rows) {
        const task = await this.getTask(row.id);
        if (task) tasks.push(task);
      }
      return tasks;
    },
    async addTags(id, tags) {
      for (const tag of tags) {
        addTagStmt.run(id, tag);
      }
      return this.getTask(id) as Promise<Task>;
    },
  } as unknown as TaskStore;
}

function makeFeishuClient() {
  const sentCards: FeishuCard[] = [];
  return {
    sentCards,
    sendCardMessage: vi.fn().mockImplementation(({ card }: { card: FeishuCard }) => {
      sentCards.push(card);
      return Promise.resolve();
    }),
    replyToMessage: vi.fn().mockResolvedValue(undefined),
    updateCardMessage: vi.fn().mockResolvedValue(undefined),
  };
}

describe("feishu commands - task management", () => {
  let store: TaskStore;
  let feishu: ReturnType<typeof makeFeishuClient>;

  beforeEach(() => {
    counter = 0;
    store = createInMemoryStore();
    feishu = makeFeishuClient();
  });

  describe("/assign command", () => {
    it("assigns a task to a device", async () => {
      const task = await store.createTask({
        feishuMessageId: "msg_assign_1",
        feishuChatId: "chat_1",
        feishuUserId: "user_1",
        commandText: "test task",
        status: "pending",
        priority: "normal",
      });
      const result = await executeCommand(
        { command: "assign", args: `${task.id} device_A` },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      expect(feishu.sendCardMessage).toHaveBeenCalled();
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Assigned");
      const updated = await store.getTask(task.id);
      expect(updated!.assignedDeviceId).toBe("device_A");
    });

    it("shows error for missing arguments", async () => {
      const result = await executeCommand(
        { command: "assign", args: "task_1" },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Missing");
    });

    it("shows error for nonexistent task", async () => {
      const result = await executeCommand(
        { command: "assign", args: "nonexistent device_A" },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Not Found");
    });
  });

  describe("/priority command", () => {
    it("changes task priority", async () => {
      const task = await store.createTask({
        feishuMessageId: "msg_prio_1",
        feishuChatId: "chat_1",
        feishuUserId: "user_1",
        commandText: "test task",
        status: "pending",
        priority: "normal",
      });
      const result = await executeCommand(
        { command: "priority", args: `${task.id} urgent` },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Priority");
      const updated = await store.getTask(task.id);
      expect(updated!.priority).toBe("urgent");
    });

    it("shows error for invalid priority", async () => {
      const task = await store.createTask({
        feishuMessageId: "msg_prio_2",
        feishuChatId: "chat_1",
        feishuUserId: "user_1",
        commandText: "test task",
        status: "pending",
        priority: "normal",
      });
      const result = await executeCommand(
        { command: "priority", args: `${task.id} invalid` },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Invalid");
    });
  });

  describe("/due command", () => {
    it("sets task due date", async () => {
      const task = await store.createTask({
        feishuMessageId: "msg_due_1",
        feishuChatId: "chat_1",
        feishuUserId: "user_1",
        commandText: "test task",
        status: "pending",
        priority: "normal",
      });
      const result = await executeCommand(
        { command: "due", args: `${task.id} 2026-12-31` },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Due");
      const updated = await store.getTask(task.id);
      expect(updated!.dueDate).toContain("2026-12-31");
    });

    it("clears due date with 'clear'", async () => {
      const task = await store.createTask({
        feishuMessageId: "msg_due_2",
        feishuChatId: "chat_1",
        feishuUserId: "user_1",
        commandText: "test task",
        status: "pending",
        priority: "normal",
      });
      await store.setTaskDueDate(task.id, "2026-12-31");
      const result = await executeCommand(
        { command: "due", args: `${task.id} clear` },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const updated = await store.getTask(task.id);
      expect(updated!.dueDate).toBeFalsy();
    });

    it("shows error for invalid date", async () => {
      const task = await store.createTask({
        feishuMessageId: "msg_due_3",
        feishuChatId: "chat_1",
        feishuUserId: "user_1",
        commandText: "test task",
        status: "pending",
        priority: "normal",
      });
      const result = await executeCommand(
        { command: "due", args: `${task.id} not-a-date` },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Invalid");
    });
  });

  describe("/tag command", () => {
    it("adds tags to a task", async () => {
      const task = await store.createTask({
        feishuMessageId: "msg_tag_1",
        feishuChatId: "chat_1",
        feishuUserId: "user_1",
        commandText: "test task",
        status: "pending",
        priority: "normal",
      });
      const result = await executeCommand(
        { command: "tag", args: `${task.id} bug,urgent` },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Tag");
      const updated = await store.getTask(task.id);
      expect(updated!.tags).toContain("bug");
      expect(updated!.tags).toContain("urgent");
    });

    it("shows error for missing arguments", async () => {
      const result = await executeCommand(
        { command: "tag", args: "" },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Missing");
    });
  });

  describe("/help command includes new commands", () => {
    it("shows assign, priority, due, tag in help", async () => {
      const result = await executeCommand(
        { command: "help", args: "" },
        "user_1",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[0];
      const helpText = JSON.stringify(card);
      expect(helpText).toContain("/assign");
      expect(helpText).toContain("/priority");
      expect(helpText).toContain("/due");
      expect(helpText).toContain("/tag");
      expect(helpText).toContain("/watch");
      expect(helpText).toContain("/unwatch");
    });
  });

  describe("/watch command", () => {
    it("subscribes to task updates", async () => {
      const task = makeTask();
      store.getTask = vi.fn().mockResolvedValue(task);
      store.isWatching = vi.fn().mockResolvedValue(false);
      store.addWatcher = vi.fn().mockResolvedValue({ taskId: task.id, userId: "ou_user_001", createdAt: "2026-06-08T12:00:00.000Z" });

      const result = await executeCommand(
        { command: "watch", args: "task_001" },
        "ou_user_001",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      expect(store.addWatcher).toHaveBeenCalledWith(task.id, "ou_user_001");
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Watching");
    });

    it("shows already watching message", async () => {
      const task = makeTask();
      store.getTask = vi.fn().mockResolvedValue(task);
      store.isWatching = vi.fn().mockResolvedValue(true);

      const result = await executeCommand(
        { command: "watch", args: "task_001" },
        "ou_user_001",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Already Watching");
    });

    it("shows error for missing task ID", async () => {
      const result = await executeCommand(
        { command: "watch", args: "" },
        "ou_user_001",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Missing");
    });

    it("shows error for unknown task", async () => {
      store.getTask = vi.fn().mockResolvedValue(undefined);
      store.listTasks = vi.fn().mockResolvedValue([]);

      const result = await executeCommand(
        { command: "watch", args: "unknown_id" },
        "ou_user_001",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Not Found");
    });
  });

  describe("/unwatch command", () => {
    it("unsubscribes from task updates", async () => {
      const task = makeTask();
      store.getTask = vi.fn().mockResolvedValue(task);
      store.isWatching = vi.fn().mockResolvedValue(true);
      store.removeWatcher = vi.fn().mockResolvedValue(true);

      const result = await executeCommand(
        { command: "unwatch", args: "task_001" },
        "ou_user_001",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      expect(store.removeWatcher).toHaveBeenCalledWith(task.id, "ou_user_001");
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Unwatched");
    });

    it("shows not watching message", async () => {
      const task = makeTask();
      store.getTask = vi.fn().mockResolvedValue(task);
      store.isWatching = vi.fn().mockResolvedValue(false);

      const result = await executeCommand(
        { command: "unwatch", args: "task_001" },
        "ou_user_001",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Not Watching");
    });

    it("shows error for missing task ID", async () => {
      const result = await executeCommand(
        { command: "unwatch", args: "" },
        "ou_user_001",
        "chat_1",
        "msg_cmd",
        store,
        feishu as unknown as FeishuReplyClient,
      );
      expect(result).toBe(true);
      const card = feishu.sentCards[feishu.sentCards.length - 1];
      expect(card.header.title.content).toContain("Missing");
    });
  });
});
