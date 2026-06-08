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
