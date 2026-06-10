import { describe, it, expect, beforeEach } from "vitest";
import { registerMcpTools } from "../../src/mcp-server/tools.js";
import type { TaskApiClient } from "../../src/mcp-server/client.js";
import type { Task, TaskStatus, TaskPriority, TaskComment, TaskNote, ScheduledTask, ScheduleFrequency, KanbanBoard, User, UserRole } from "../../src/shared/types.js";

// --- Mock TaskApiClient ---
function createMockClient(): TaskApiClient & {
  calls: { method: string; args: unknown[] }[];
  failWith?: string;
} {
  const calls: { method: string; args: unknown[] }[] = [];
  const mock: TaskApiClient & {
    calls: { method: string; args: unknown[] }[];
    failWith?: string;
  } = {
    calls,
    failWith: undefined,

    async listTasks(status?: TaskStatus, limit?: number, deviceId?: string, priority?: string): Promise<Task[]> {
      calls.push({ method: "listTasks", args: [status, limit, deviceId, priority] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_001",
          source: "feishu",
          feishuMessageId: "om_test",
          feishuChatId: "oc_test",
          feishuUserId: "ou_test",
          commandText: "帮我检查项目状态",
          status: status ?? "pending",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getTask(taskId: string): Promise<Task> {
      calls.push({ method: "getTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_detail",
        feishuChatId: "oc_detail",
        feishuUserId: "ou_detail",
        commandText: "详细任务",
        status: "pending",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async markTaskRunning(taskId: string): Promise<Task> {
      calls.push({ method: "markTaskRunning", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_running",
        feishuChatId: "oc_running",
        feishuUserId: "ou_running",
        commandText: "运行中任务",
        status: "running",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:01:00.000Z",
      };
    },

    async reportTaskResult(
      taskId: string,
      success: boolean,
      summary: string,
      details?: string,
    ): Promise<Task> {
      calls.push({
        method: "reportTaskResult",
        args: [taskId, success, summary, details],
      });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_result",
        feishuChatId: "oc_result",
        feishuUserId: "ou_result",
        commandText: "结果任务",
        status: success ? "done" : "failed",
        resultSummary: summary,
        resultDetails: details,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:02:00.000Z",
      };
    },

    async replyFeishu(taskId: string, message: string): Promise<void> {
      calls.push({ method: "replyFeishu", args: [taskId, message] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async searchTasks(options: {
      q?: string;
      status?: TaskStatus;
      priority?: string;
      from?: string;
      to?: string;
      limit?: number;
      deviceId?: string;
      tags?: string[];
      cycleId?: string;
      moduleId?: string;
    }): Promise<Task[]> {
      calls.push({ method: "searchTasks", args: [options] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_search_001",
          source: "feishu",
          feishuMessageId: "om_search",
          feishuChatId: "oc_search",
          feishuUserId: "ou_search",
          commandText: "搜索测试任务",
          status: options.status ?? "done",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
          resultSummary: "搜索结果",
        },
      ];
    },

    async addTags(taskId: string, tags: string[]): Promise<Task> {
      calls.push({ method: "addTags", args: [taskId, tags] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_tags",
        feishuChatId: "oc_tags",
        feishuUserId: "ou_tags",
        commandText: "标签任务",
        status: "pending",
        tags,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async removeTag(taskId: string, tag: string): Promise<Task> {
      calls.push({ method: "removeTag", args: [taskId, tag] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_tags",
        feishuChatId: "oc_tags",
        feishuUserId: "ou_tags",
        commandText: "标签任务",
        status: "pending",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async listAllTags(): Promise<string[]> {
      calls.push({ method: "listAllTags", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return ["bug", "feature", "urgent"];
    },

    async setDueDate(taskId: string, dueDate: string | null): Promise<Task> {
      calls.push({ method: "setDueDate", args: [taskId, dueDate] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_due",
        feishuChatId: "oc_due",
        feishuUserId: "ou_due",
        commandText: "截止日期任务",
        status: "pending",
        dueDate: dueDate ?? undefined,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async setReminder(taskId: string, reminderAt: string | null): Promise<Task> {
      calls.push({ method: "setReminder", args: [taskId, reminderAt] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_remind",
        feishuChatId: "oc_remind",
        feishuUserId: "ou_remind",
        commandText: "提醒任务",
        status: "pending",
        reminderAt: reminderAt ?? undefined,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async setTaskDescription(taskId: string, description: string | null): Promise<Task> {
      calls.push({ method: "setTaskDescription", args: [taskId, description] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_desc",
        feishuChatId: "oc_desc",
        feishuUserId: "ou_desc",
        commandText: "描述任务",
        status: "pending",
        description: description ?? undefined,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async setTaskCommandText(taskId: string, commandText: string): Promise<Task> {
      calls.push({ method: "setTaskCommandText", args: [taskId, commandText] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_cmd",
        feishuChatId: "oc_cmd",
        feishuUserId: "ou_cmd",
        commandText,
        status: "pending",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async setPriority(taskId: string, priority: TaskPriority): Promise<Task> {
      calls.push({ method: "setPriority", args: [taskId, priority] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_priority",
        feishuChatId: "oc_priority",
        feishuUserId: "ou_priority",
        commandText: "优先级任务",
        status: "pending",
        priority,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async setEstimatedMinutes(taskId: string, minutes: number | null): Promise<Task> {
      calls.push({ method: "setEstimatedMinutes", args: [taskId, minutes] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_estimated",
        feishuChatId: "oc_estimated",
        feishuUserId: "ou_estimated",
        commandText: "估算任务",
        status: "pending",
        estimatedMinutes: minutes ?? undefined,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async listOverdueTasks(): Promise<Task[]> {
      calls.push({ method: "listOverdueTasks", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_overdue_001",
          source: "feishu",
          feishuMessageId: "om_overdue",
          feishuChatId: "oc_overdue",
          feishuUserId: "ou_overdue",
          commandText: "逾期任务",
          status: "pending",
          dueDate: "2026-05-01T00:00:00.000Z",
          createdAt: "2026-04-01T12:00:00.000Z",
          updatedAt: "2026-04-01T12:00:00.000Z",
        },
      ];
    },

    async listComments(taskId: string): Promise<TaskComment[]> {
      calls.push({ method: "listComments", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: 1,
          taskId,
          author: "test-user",
          authorType: "api",
          body: "Test comment",
          createdAt: "2026-06-02T12:00:00.000Z",
        },
      ];
    },

    async addComment(taskId: string, author: string, body: string): Promise<TaskComment> {
      calls.push({ method: "addComment", args: [taskId, author, body] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: 42,
        taskId,
        author,
        authorType: "api",
        body,
        createdAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async deleteTaskComment(taskId: string, commentId: number): Promise<void> {
      calls.push({ method: "deleteTaskComment", args: [taskId, commentId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async registerDevice(name: string, capabilities?: string): Promise<{ id: string; token: string }> {
      calls.push({ method: "registerDevice", args: [name, capabilities] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { id: "dev_001", token: "tok_test" };
    },

    async listDevices(): Promise<import("../../src/shared/types.js").Device[]> {
      calls.push({ method: "listDevices", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "dev_001",
          name: "office-desktop",
          token: "tok_test",
          capabilities: "frontend,react",
          lastSeen: "2026-06-01T12:00:00.000Z",
          createdAt: "2026-06-01T10:00:00.000Z",
        },
      ];
    },

    async getDevice(deviceId: string): Promise<import("../../src/shared/types.js").Device> {
      calls.push({ method: "getDevice", args: [deviceId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: deviceId,
        name: "office-desktop",
        token: "tok_test",
        capabilities: "frontend,react",
        lastSeen: "2026-06-01T12:00:00.000Z",
        createdAt: "2026-06-01T10:00:00.000Z",
      };
    },

    async deleteDevice(deviceId: string): Promise<void> {
      calls.push({ method: "deleteDevice", args: [deviceId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async queryAuditLog(options: { action?: string; taskId?: string; actor?: string; actorType?: string; from?: string; to?: string; limit?: number }): Promise<import("../../src/shared/types.js").AuditLogEntry[]> {
      calls.push({ method: "queryAuditLog", args: [options] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [];
    },

    async bulkUpdateStatus(ids: string[], status: TaskStatus): Promise<{ updated: number; errors: string[] }> {
      calls.push({ method: "bulkUpdateStatus", args: [ids, status] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { updated: ids.length, errors: [] };
    },

    async bulkAssign(ids: string[], deviceId: string): Promise<{ updated: number; errors: string[] }> {
      calls.push({ method: "bulkAssign", args: [ids, deviceId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { updated: ids.length, errors: [] };
    },

    async assignTask(taskId: string, deviceId: string): Promise<Task> {
      calls.push({ method: "assignTask", args: [taskId, deviceId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { id: taskId, commandText: "test task", status: "pending", priority: "normal", assignedDeviceId: deviceId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Task;
    },

    async unassignTask(taskId: string): Promise<Task> {
      calls.push({ method: "unassignTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { id: taskId, commandText: "test task", status: "pending", priority: "normal", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Task;
    },

    async bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
      calls.push({ method: "bulkDelete", args: [ids] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { deleted: ids.length, errors: [] };
    },

    async bulkAddTags(ids: string[], tags: string[]): Promise<{ updated: number; errors: string[] }> {
      calls.push({ method: "bulkAddTags", args: [ids, tags] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { updated: ids.length, errors: [] };
    },

    async bulkRemoveTags(ids: string[], tag: string): Promise<{ updated: number; errors: string[] }> {
      calls.push({ method: "bulkRemoveTags", args: [ids, tag] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { updated: ids.length, errors: [] };
    },

    async bulkUpdatePriority(ids: string[], priority: string): Promise<{ updated: number; errors: string[] }> {
      calls.push({ method: "bulkUpdatePriority", args: [ids, priority] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { updated: ids.length, errors: [] };
    },

    async bulkUpdateDueDate(ids: string[], dueDate: string | null): Promise<{ updated: number; errors: string[] }> {
      calls.push({ method: "bulkUpdateDueDate", args: [ids, dueDate] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { updated: ids.length, errors: [] };
    },

    async bulkCloneTasks(ids: string[]): Promise<{ cloned: number; errors: string[]; taskIds: string[] }> {
      calls.push({ method: "bulkCloneTasks", args: [ids] });
      if (mock.failWith) throw new Error(mock.failWith);
      const taskIds = ids.map((id) => `${id}_clone`);
      return { cloned: ids.length, errors: [], taskIds };
    },

    async listTemplates(): Promise<import("../../src/shared/types.js").TaskTemplate[]> {
      calls.push({ method: "listTemplates", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "tpl_001",
          name: "Deploy Template",
          description: "Standard deployment task",
          commandText: "Deploy to production",
          priority: "high",
          tags: ["deploy"],
          createdBy: "test-user",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getTemplate(templateId: string): Promise<import("../../src/shared/types.js").TaskTemplate> {
      calls.push({ method: "getTemplate", args: [templateId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: templateId,
        name: "Deploy Template",
        description: "Standard deployment task",
        commandText: "Deploy to production",
        priority: "high",
        tags: ["deploy"],
        createdBy: "test-user",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async createTemplate(template: { name: string; description?: string; commandText: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDateOffsetMs?: number; reminderOffsetMs?: number }): Promise<import("../../src/shared/types.js").TaskTemplate> {
      calls.push({ method: "createTemplate", args: [template] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "tpl_new_001",
        name: template.name,
        description: template.description,
        commandText: template.commandText,
        priority: (template.priority as "low" | "normal" | "high" | "urgent") ?? "normal",
        tags: template.tags,
        assignedDeviceId: template.assignedDeviceId,
        dueDateOffsetMs: template.dueDateOffsetMs,
        reminderOffsetMs: template.reminderOffsetMs,
        createdBy: "test-user",
        createdAt: "2026-06-02T12:00:00.000Z",
        updatedAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async updateTemplate(templateId: string, updates: Record<string, unknown>): Promise<import("../../src/shared/types.js").TaskTemplate> {
      calls.push({ method: "updateTemplate", args: [templateId, updates] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: templateId,
        name: (updates.name as string) ?? "Deploy Template",
        description: (updates.description as string) ?? "Standard deployment task",
        commandText: (updates.commandText as string) ?? "Deploy to production",
        priority: (updates.priority as "low" | "normal" | "high" | "urgent") ?? "high",
        tags: (updates.tags as string[]) ?? ["deploy"],
        createdBy: "test-user",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async deleteTemplate(templateId: string): Promise<void> {
      calls.push({ method: "deleteTemplate", args: [templateId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async createTaskFromTemplate(templateId: string, overrides?: { commandText?: string; description?: string; priority?: string; tags?: string[]; assignedDeviceId?: string; dueDate?: string; reminderAt?: string }): Promise<Task> {
      calls.push({ method: "createTaskFromTemplate", args: [templateId, overrides] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "task_from_tmpl_001",
        source: "feishu",
        feishuMessageId: `tmpl_${templateId}_${Date.now()}`,
        feishuChatId: "template",
        feishuUserId: "api",
        commandText: overrides?.commandText ?? "Default template command",
        status: "pending",
        priority: (overrides?.priority as Task["priority"]) ?? "normal",
        tags: overrides?.tags ?? [],
        createdAt: "2026-06-06T22:00:00.000Z",
        updatedAt: "2026-06-06T22:00:00.000Z",
      };
    },

    async getTemplateUsageStats(): Promise<{ stats: { templateId: string; name: string; usageCount: number }[]; totalUsage: number; templateCount: number }> {
      calls.push({ method: "getTemplateUsageStats", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        stats: [
          { templateId: "tpl_001", name: "Deploy Template", usageCount: 5 },
          { templateId: "tpl_002", name: "Bug Report Template", usageCount: 3 },
        ],
        totalUsage: 8,
        templateCount: 2,
      };
    },

    // Scheduled task mocks
    async listScheduledTasks(): Promise<ScheduledTask[]> {
      calls.push({ method: "listScheduledTasks", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "sch_001",
          commandText: "Daily backup check",
          frequency: "daily",
          priority: "normal",
          nextRunAt: "2026-06-03T09:00:00.000Z",
          enabled: true,
          createdBy: "test-user",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getScheduledTask(scheduledId: string): Promise<ScheduledTask> {
      calls.push({ method: "getScheduledTask", args: [scheduledId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: scheduledId,
        commandText: "Daily backup check",
        frequency: "daily",
        priority: "normal",
        nextRunAt: "2026-06-03T09:00:00.000Z",
        enabled: true,
        createdBy: "test-user",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async createScheduledTask(data: { commandText: string; frequency: ScheduleFrequency; priority?: string; tags?: string[]; assignedDeviceId?: string; nextRunAt?: string; enabled?: boolean; templateId?: string }): Promise<ScheduledTask> {
      calls.push({ method: "createScheduledTask", args: [data] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "sch_new_001",
        commandText: data.commandText,
        frequency: data.frequency,
        priority: (data.priority as "low" | "normal" | "high" | "urgent") ?? "normal",
        tags: data.tags,
        assignedDeviceId: data.assignedDeviceId,
        nextRunAt: data.nextRunAt ?? "2026-06-02T12:00:00.000Z",
        enabled: data.enabled !== false,
        templateId: data.templateId,
        createdBy: "test-user",
        createdAt: "2026-06-02T12:00:00.000Z",
        updatedAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async updateScheduledTask(scheduledId: string, updates: Record<string, unknown>): Promise<ScheduledTask> {
      calls.push({ method: "updateScheduledTask", args: [scheduledId, updates] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: scheduledId,
        commandText: (updates.commandText as string) ?? "Daily backup check",
        frequency: (updates.frequency as ScheduleFrequency) ?? "daily",
        priority: (updates.priority as "low" | "normal" | "high" | "urgent") ?? "normal",
        tags: (updates.tags as string[]) ?? undefined,
        nextRunAt: (updates.nextRunAt as string) ?? "2026-06-03T09:00:00.000Z",
        enabled: (updates.enabled as boolean) ?? true,
        createdBy: "test-user",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async deleteScheduledTask(scheduledId: string): Promise<void> {
      calls.push({ method: "deleteScheduledTask", args: [scheduledId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async runScheduledTask(scheduledId: string): Promise<{ task: Task; scheduledTask: ScheduledTask }> {
      calls.push({ method: "runScheduledTask", args: [scheduledId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        task: {
          id: "task_scheduled_001",
          source: "feishu",
          feishuMessageId: "om_scheduled",
          feishuChatId: "oc_scheduled",
          feishuUserId: "ou_scheduled",
          commandText: "Scheduled task result",
          status: "pending",
          createdAt: "2026-06-02T12:00:00.000Z",
          updatedAt: "2026-06-02T12:00:00.000Z",
        },
        scheduledTask: {
          id: scheduledId,
          commandText: "Daily backup check",
          frequency: "daily",
          priority: "normal",
          nextRunAt: "2026-06-03T09:00:00.000Z",
          lastRunAt: "2026-06-02T12:00:00.000Z",
          lastTaskId: "task_scheduled_001",
          enabled: true,
          createdBy: "test-user",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-02T12:00:00.000Z",
        },
      };
    },

    // Dependency mocks
    async setDependencies(taskId: string, dependsOnIds: string[]): Promise<Task> {
      calls.push({ method: "setDependencies", args: [taskId, dependsOnIds] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_dep",
        feishuChatId: "oc_dep",
        feishuUserId: "ou_dep",
        commandText: "Dependency task",
        status: "pending",
        dependsOn: dependsOnIds.length > 0 ? dependsOnIds : undefined,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async getDependencies(taskId: string): Promise<{ dependencies: Array<{ id: string; status: string; commandText: string }>; dependentIds: string[]; blocked: boolean }> {
      calls.push({ method: "getDependencies", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        dependencies: [
          { id: "task_dep_001", status: "done", commandText: "Prerequisite task" },
        ],
        dependentIds: [],
        blocked: false,
      };
    },

    async removeDependency(taskId: string, depId: string): Promise<Task> {
      calls.push({ method: "removeDependency", args: [taskId, depId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_dep",
        feishuChatId: "oc_dep",
        feishuUserId: "ou_dep",
        commandText: "Dependency task",
        status: "pending",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async listReadyTasks(limit?: number, deviceId?: string): Promise<Task[]> {
      calls.push({ method: "listReadyTasks", args: [limit, deviceId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_ready_001",
          source: "feishu",
          feishuMessageId: "om_ready",
          feishuChatId: "oc_ready",
          feishuUserId: "ou_ready",
          commandText: "Ready task",
          status: "pending",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getDependencyGraph(taskId: string): Promise<import("../../src/shared/types.js").DependencyGraph> {
      calls.push({ method: "getDependencyGraph", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        taskId,
        status: "pending",
        commandText: "Root task",
        upstream: [],
        downstream: [],
        maxUpstreamDepth: 0,
        maxDownstreamDepth: 0,
        totalNodes: 1,
        edges: [],
      };
    },

    // Phase 58: Task Relationships
    async addRelationship(taskId: string, relatedTaskId: string, relationshipType: import("../../src/shared/types.js").TaskRelationshipType): Promise<void> {
      calls.push({ method: "addRelationship", args: [taskId, relatedTaskId, relationshipType] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async removeRelationship(taskId: string, relatedTaskId: string, relationshipType?: import("../../src/shared/types.js").TaskRelationshipType): Promise<void> {
      calls.push({ method: "removeRelationship", args: [taskId, relatedTaskId, relationshipType] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async listRelationships(taskId: string): Promise<import("../../src/shared/types.js").TaskRelationship[]> {
      calls.push({ method: "listRelationships", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          taskId,
          relatedTaskId: "task_related_001",
          relationshipType: "blocks",
          createdAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async lockTask(taskId: string, deviceId?: string, ttlMs?: number): Promise<import("../../src/shared/types.js").TaskLock> {
      calls.push({ method: "lockTask", args: [taskId, deviceId, ttlMs] });
      if (mock.failWith) throw new Error(mock.failWith);
      const now = new Date().toISOString();
      return {
        taskId,
        lockedBy: deviceId ?? "test_device",
        lockedAt: now,
        expiresAt: new Date(Date.now() + (ttlMs ?? 300000)).toISOString(),
      };
    },

    async unlockTask(taskId: string, deviceId?: string): Promise<void> {
      calls.push({ method: "unlockTask", args: [taskId, deviceId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async getTaskLock(taskId: string): Promise<{ locked: boolean; lock: import("../../src/shared/types.js").TaskLock | null }> {
      calls.push({ method: "getTaskLock", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { locked: false, lock: null };
    },

    // Export/Import mocks
    async exportTasks(): Promise<Record<string, unknown>> {
      calls.push({ method: "exportTasks", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        exportedAt: "2026-06-02T12:00:00.000Z",
        version: 1,
        tasks: [],
        comments: [],
        dependencies: [],
        templates: [],
        scheduledTasks: [],
      };
    },
    async exportTasksCsv(filters?: Record<string, string>): Promise<string> {
      calls.push({ method: "exportTasksCsv", args: [filters] });
      if (mock.failWith) throw new Error(mock.failWith);
      return "id,source,commandText,status,priority\n";
    },

    async importTasks(data: Record<string, unknown>, mode?: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
      calls.push({ method: "importTasks", args: [data, mode] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { imported: 0, skipped: 0, errors: [] };
    },

    async importTasksFromCsv(csv: string, options?: { columnMap?: Record<string, string>; defaultPriority?: string; defaultTags?: string[]; delimiter?: string }): Promise<{ imported: number; errors: string[]; taskIds: string[] }> {
      calls.push({ method: "importTasksFromCsv", args: [csv, options] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { imported: 0, errors: [], taskIds: [] };
    },

    // SLA mocks
    async listSlaPolicies(): Promise<import("../../src/shared/types.js").SlaPolicy[]> {
      calls.push({ method: "listSlaPolicies", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "sla_policy_001",
          name: "High Priority SLA",
          description: "4-hour SLA for high priority tasks",
          targetMinutes: 240,
          warningThresholdPercent: 80,
          matchPriorities: ["high", "urgent"],
          matchTags: [],
          enabled: true,
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getSlaPolicy(policyId: string): Promise<import("../../src/shared/types.js").SlaPolicy> {
      calls.push({ method: "getSlaPolicy", args: [policyId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: policyId,
        name: "High Priority SLA",
        description: "4-hour SLA for high priority tasks",
        targetMinutes: 240,
        warningThresholdPercent: 80,
        matchPriorities: ["high", "urgent"],
        matchTags: [],
        enabled: true,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async createSlaPolicy(policy: { name: string; description?: string; targetMinutes: number; warningThresholdPercent?: number; matchPriorities?: string[]; matchTags?: string[]; enabled?: boolean }): Promise<import("../../src/shared/types.js").SlaPolicy> {
      calls.push({ method: "createSlaPolicy", args: [policy] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "sla_policy_new",
        name: policy.name,
        description: policy.description,
        targetMinutes: policy.targetMinutes,
        warningThresholdPercent: policy.warningThresholdPercent ?? 80,
        matchPriorities: policy.matchPriorities as ("low" | "normal" | "high" | "urgent")[] | undefined,
        matchTags: policy.matchTags,
        enabled: policy.enabled ?? true,
        createdAt: "2026-06-02T12:00:00.000Z",
        updatedAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async updateSlaPolicy(policyId: string, updates: Record<string, unknown>): Promise<import("../../src/shared/types.js").SlaPolicy> {
      calls.push({ method: "updateSlaPolicy", args: [policyId, updates] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: policyId,
        name: (updates.name as string) ?? "Updated SLA",
        description: (updates.description as string) ?? "Updated description",
        targetMinutes: (updates.targetMinutes as number) ?? 120,
        warningThresholdPercent: (updates.warningThresholdPercent as number) ?? 80,
        matchPriorities: (updates.matchPriorities as ("low" | "normal" | "high" | "urgent")[]) ?? undefined,
        matchTags: (updates.matchTags as string[]) ?? undefined,
        enabled: (updates.enabled as boolean) ?? true,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async deleteSlaPolicy(policyId: string): Promise<void> {
      calls.push({ method: "deleteSlaPolicy", args: [policyId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async getSlaSummary(): Promise<import("../../src/shared/types.js").SlaSummary> {
      calls.push({ method: "getSlaSummary", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        totalTasksTracked: 5,
        onTrack: 4,
        warning: 1,
        breached: 0,
        avgResolutionMinutes: 120,
        policyStats: [
          {
            policyId: "sla_policy_001",
            policyName: "High Priority SLA",
            targetMinutes: 240,
            tasksTracked: 3,
            onTrack: 2,
            warning: 1,
            breached: 0,
          },
        ],
      };
    },

    async listSlaBreaches(): Promise<import("../../src/shared/types.js").SlaBreachLog[]> {
      calls.push({ method: "listSlaBreaches", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: 1,
          taskId: "task_001",
          policyId: "sla_policy_001",
          policyName: "High Priority SLA",
          breachType: "warning",
          targetMinutes: 240,
          actualMinutes: 200,
          detectedAt: "2026-06-02T10:00:00.000Z",
          resolvedAt: null,
        },
      ];
    },

    async checkSlaBreaches(): Promise<{ warnings: number; breaches: number; details: import("../../src/shared/types.js").SlaBreachNotification[] }> {
      calls.push({ method: "checkSlaBreaches", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { warnings: 1, breaches: 0, details: [] };
    },

    async getTaskSlaStatus(taskId: string): Promise<{ status: string; policy?: import("../../src/shared/types.js").SlaPolicy; elapsedMinutes: number; targetMinutes?: number }> {
      calls.push({ method: "getTaskSlaStatus", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        status: "ok",
        policy: {
          id: "sla_policy_001",
          name: "High Priority SLA",
          description: "4-hour SLA for high priority tasks",
          targetMinutes: 240,
          warningThresholdPercent: 80,
          matchPriorities: ["high", "urgent"],
          matchTags: [],
          enabled: true,
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
        elapsedMinutes: 60,
        targetMinutes: 240,
      };
    },

    async retryTask(taskId: string): Promise<Task> {
      calls.push({ method: "retryTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_retry",
        feishuChatId: "oc_retry",
        feishuUserId: "ou_retry",
        commandText: "重试任务",
        status: "pending",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:03:00.000Z",
      };
    },

    async cloneTask(taskId: string): Promise<Task> {
      calls.push({ method: "cloneTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: `${taskId}_clone`,
        source: "feishu",
        feishuMessageId: "om_clone",
        feishuChatId: "oc_clone",
        feishuUserId: "ou_clone",
        commandText: "克隆任务",
        status: "pending",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:03:00.000Z",
      };
    },

    async reopenTask(taskId: string): Promise<Task> {
      calls.push({ method: "reopenTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_reopen",
        feishuChatId: "oc_reopen",
        feishuUserId: "ou_reopen",
        commandText: "重新打开任务",
        status: "pending",
        reopenedCount: 1,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:05:00.000Z",
      };
    },

    async pinTask(taskId: string): Promise<Task> {
      calls.push({ method: "pinTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_pin",
        feishuChatId: "oc_pin",
        feishuUserId: "ou_pin",
        commandText: "固定任务",
        status: "pending",
        pinned: true,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:04:00.000Z",
      };
    },

    async unpinTask(taskId: string): Promise<Task> {
      calls.push({ method: "unpinTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_unpin",
        feishuChatId: "oc_unpin",
        feishuUserId: "ou_unpin",
        commandText: "取消固定任务",
        status: "pending",
        pinned: false,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:05:00.000Z",
      };
    },

    async listNotes(taskId: string): Promise<TaskNote[]> {
      calls.push({ method: "listNotes", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: 1,
          taskId,
          author: "test-user",
          body: "Internal note: needs follow-up",
          createdAt: "2026-06-02T12:00:00.000Z",
        },
      ];
    },

    async addNote(taskId: string, body: string): Promise<TaskNote> {
      calls.push({ method: "addNote", args: [taskId, body] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: 99,
        taskId,
        author: "mcp-user",
        body,
        createdAt: "2026-06-02T12:00:00.000Z",
      };
    },

    async deleteTaskNote(taskId: string, noteId: number): Promise<void> {
      calls.push({ method: "deleteTaskNote", args: [taskId, noteId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async listTasksByUser(userId: string, limit?: number): Promise<Task[]> {
      calls.push({ method: "listTasksByUser", args: [userId, limit] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_user_001",
          source: "feishu",
          feishuMessageId: "msg_user_001",
          feishuChatId: "chat_001",
          feishuUserId: userId,
          commandText: "Check deploy status",
          status: "pending",
          priority: "normal" as const,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
      ];
    },

    // ── Task Subtasks ──────────────────────────────────────────

    async listSubtasks(taskId: string): Promise<import("../../src/shared/types.js").Subtask[]> {
      calls.push({ method: "listSubtasks", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "sub_001",
          parentTaskId: taskId,
          title: "Subtask 1",
          commandText: "Do something specific",
          status: "pending" as TaskStatus,
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getSubtask(taskId: string, subtaskId: string): Promise<import("../../src/shared/types.js").Subtask> {
      calls.push({ method: "getSubtask", args: [taskId, subtaskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: subtaskId,
        parentTaskId: taskId,
        title: "Subtask Detail",
        commandText: "Detailed subtask",
        status: "pending" as TaskStatus,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async createSubtask(taskId: string, title: string, commandText: string): Promise<import("../../src/shared/types.js").Subtask> {
      calls.push({ method: "createSubtask", args: [taskId, title, commandText] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "sub_new_001",
        parentTaskId: taskId,
        title,
        commandText,
        status: "pending" as TaskStatus,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async updateSubtaskStatus(taskId: string, subtaskId: string, status: TaskStatus): Promise<import("../../src/shared/types.js").Subtask> {
      calls.push({ method: "updateSubtaskStatus", args: [taskId, subtaskId, status] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: subtaskId,
        parentTaskId: taskId,
        title: "Updated Subtask",
        commandText: "Updated",
        status,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:01:00.000Z",
      };
    },

    async reportSubtaskResult(taskId: string, subtaskId: string, success: boolean, summary: string, details?: string): Promise<import("../../src/shared/types.js").Subtask> {
      calls.push({ method: "reportSubtaskResult", args: [taskId, subtaskId, success, summary, details] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: subtaskId,
        parentTaskId: taskId,
        title: "Result Subtask",
        commandText: "Done",
        status: success ? "done" : "failed" as TaskStatus,
        resultSummary: summary,
        resultDetails: details,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:02:00.000Z",
      };
    },

    async deleteSubtask(taskId: string, subtaskId: string): Promise<void> {
      calls.push({ method: "deleteSubtask", args: [taskId, subtaskId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async downloadAttachment(taskId: string, attachmentIndex: number): Promise<{ fileName: string; contentType: string; base64Data: string }> {
      calls.push({ method: "downloadAttachment", args: [taskId, attachmentIndex] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        fileName: "test-file.txt",
        contentType: "text/plain",
        base64Data: Buffer.from("Hello, World!").toString("base64"),
      };
    },

    async archiveTask(taskId: string): Promise<Task> {
      calls.push({ method: "archiveTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_archive",
        feishuChatId: "oc_archive",
        feishuUserId: "ou_archive",
        commandText: "Archived task",
        status: "done",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
        archivedAt: new Date().toISOString(),
      };
    },

    async unarchiveTask(taskId: string): Promise<Task> {
      calls.push({ method: "unarchiveTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_unarchive",
        feishuChatId: "oc_unarchive",
        feishuUserId: "ou_unarchive",
        commandText: "Unarchived task",
        status: "done",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async listArchivedTasks(limit?: number): Promise<Task[]> {
      calls.push({ method: "listArchivedTasks", args: [limit] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_archived_001",
          source: "feishu",
          feishuMessageId: "om_archived",
          feishuChatId: "oc_archived",
          feishuUserId: "ou_archived",
          commandText: "Archived task",
          status: "done",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
          archivedAt: new Date().toISOString(),
        },
      ];
    },

    async bulkArchiveTasks(ids: string[]): Promise<{ archived: number; errors: string[] }> {
      calls.push({ method: "bulkArchiveTasks", args: [ids] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { archived: ids.length, errors: [] };
    },

    async bulkUnarchiveTasks(ids: string[]): Promise<{ restored: number; errors: string[] }> {
      calls.push({ method: "bulkUnarchiveTasks", args: [ids] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { restored: ids.length, errors: [] };
    },

    async escalateOverduePriorities(): Promise<{ escalated: number; tasks: Task[] }> {
      calls.push({ method: "escalateOverduePriorities", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { escalated: 0, tasks: [] };
    },

    async getApiUsageStats(): Promise<Record<string, unknown>> {
      calls.push({ method: "getApiUsageStats", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        stats: {
          totalRequests: 100,
          from: "2026-06-01T00:00:00Z",
          to: "2026-06-03T23:59:59Z",
          callers: [
            {
              callerId: "user:admin",
              totalRequests: 50,
              errorRequests: 2,
              errorRate: 4,
              avgDurationMs: 45,
              medianDurationMs: 40,
              p95DurationMs: 120,
              byStatus: { 200: 48, 401: 2 },
              byMethod: { GET: 30, POST: 20 },
              byPath: [{ path: "/api/tasks", count: 30, avgDurationMs: 45 }],
              lastRequestAt: "2026-06-03T12:00:00Z",
            },
          ],
          slowestEndpoints: [
            { method: "GET", path: "/api/tasks/search", avgDurationMs: 200, count: 10 },
          ],
        },
      };
    },

    async getApiUsageEntries(callerId: string, limit?: number): Promise<Record<string, unknown>> {
      calls.push({ method: "getApiUsageEntries", args: [callerId, limit] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        callerId,
        entries: [
          {
            id: 1,
            callerId,
            method: "GET",
            path: "/api/tasks",
            statusCode: 200,
            durationMs: 45,
            createdAt: "2026-06-03T12:00:00Z",
          },
        ],
        count: 1,
      };
    },

    async listWebhooks(): Promise<import("../../src/shared/types.js").WebhookSubscription[]> {
      calls.push({ method: "listWebhooks", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "wh_test_001",
          url: "https://example.com/webhook",
          events: ["task.created"],
          secret: "abc123",
          enabled: true,
          description: "Test webhook",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getWebhook(webhookId: string): Promise<import("../../src/shared/types.js").WebhookSubscription> {
      calls.push({ method: "getWebhook", args: [webhookId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: webhookId,
        url: "https://example.com/webhook",
        events: ["task.created"],
        secret: "abc123",
        enabled: true,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async createWebhook(_data: { url: string; events: string[]; enabled?: boolean; description?: string }): Promise<import("../../src/shared/types.js").WebhookSubscription> {
      calls.push({ method: "createWebhook", args: [_data] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "wh_new_001",
        url: _data.url,
        events: _data.events as import("../../src/shared/types.js").WebhookEvent[],
        secret: "newsecret",
        enabled: _data.enabled !== false,
        description: _data.description,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async updateWebhook(webhookId: string, _updates: Record<string, unknown>): Promise<import("../../src/shared/types.js").WebhookSubscription> {
      calls.push({ method: "updateWebhook", args: [webhookId, _updates] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: webhookId,
        url: "https://example.com/updated",
        events: ["task.status_changed"],
        secret: "abc123",
        enabled: true,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:01:00.000Z",
      };
    },

    async deleteWebhook(webhookId: string): Promise<void> {
      calls.push({ method: "deleteWebhook", args: [webhookId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async listWebhookDeliveries(webhookId: string, _limit?: number): Promise<import("../../src/shared/types.js").WebhookDelivery[]> {
      calls.push({ method: "listWebhookDeliveries", args: [webhookId, _limit] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: 1,
          webhookId,
          event: "task.created",
          url: "https://example.com/webhook",
          statusCode: 200,
          success: true,
          durationMs: 120,
          timestamp: "2026-06-01T12:00:01.000Z",
          retryCount: 1,
        },
      ];
    },

    async getKanbanBoard(): Promise<import("../../src/shared/types.js").KanbanBoard> {
      calls.push({ method: "getKanbanBoard", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        columns: [
          { status: "pending", label: "Pending", count: 1, tasks: [] },
          { status: "picked", label: "Picked", count: 0, tasks: [] },
          { status: "running", label: "Running", count: 0, tasks: [] },
          { status: "done", label: "Done", count: 0, tasks: [] },
          { status: "failed", label: "Failed", count: 0, tasks: [] },
        ],
        totalTasks: 1,
      };
    },

    async getProcessingStats(): Promise<Record<string, unknown>> {
      calls.push({ method: "getProcessingStats", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        totalCompleted: 10,
        avgDurationMs: 5000,
        p50DurationMs: 4000,
        p95DurationMs: 12000,
        avgQueueWaitMs: 1000,
        avgProcessingMs: 3000,
        byStatus: { done: 8, failed: 2 },
      };
    },

    async getTaskStatsSummary(): Promise<Record<string, unknown>> {
      calls.push({ method: "getTaskStatsSummary", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        total: 25,
        byStatus: { pending: 10, picked: 3, running: 2, done: 8, failed: 2 },
        byPriority: { low: 5, normal: 15, high: 4, urgent: 1 },
      };
    },

    async getUserStats(): Promise<Record<string, unknown>> {
      calls.push({ method: "getUserStats", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        totalUsers: 3,
        totalTasks: 25,
        users: [
          { userId: "user_001", total: 15, done: 10, avgResolutionMinutes: 30 },
        ],
      };
    },

    async getTaskTimeSeries(): Promise<Record<string, unknown>> {
      calls.push({ method: "getTaskTimeSeries", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        interval: "day",
        metric: "created",
        data: [
          { date: "2026-06-01", value: 5 },
          { date: "2026-06-02", value: 3 },
        ],
      };
    },

    async listUsers(): Promise<User[]> {
      calls.push({ method: "listUsers", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "usr_001",
          username: "admin",
          token: "utoken_abc123",
          role: "admin",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getUser(userId: string): Promise<User> {
      calls.push({ method: "getUser", args: [userId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: userId,
        username: "admin",
        token: "utoken_abc123",
        role: "admin",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async createUser(username: string, role?: UserRole, feishuUserId?: string): Promise<User> {
      calls.push({ method: "createUser", args: [username, role, feishuUserId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "usr_002",
        username,
        token: "utoken_new123",
        role: (role ?? "viewer") as UserRole,
        feishuUserId,
        createdAt: "2026-06-07T00:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      };
    },

    async updateUserRole(userId: string, role: UserRole): Promise<User> {
      calls.push({ method: "updateUserRole", args: [userId, role] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: userId,
        username: "admin",
        token: "utoken_abc123",
        role,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      };
    },

    async deleteUser(userId: string): Promise<void> {
      calls.push({ method: "deleteUser", args: [userId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async regenerateUserToken(userId: string): Promise<User> {
      calls.push({ method: "regenerateUserToken", args: [userId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: userId,
        username: "admin",
        token: "utoken_fresh456",
        role: "admin",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      };
    },

    // API key management mocks
    async listApiKeys(userId?: string): Promise<Array<Record<string, unknown>>> {
      calls.push({ method: "listApiKeys", args: [userId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "ak_001",
          name: "Test API Key",
          key: "ak_test123",
          userId: userId ?? "user_001",
          role: "admin",
          enabled: true,
          lastUsedAt: "2026-06-06T12:00:00.000Z",
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ];
    },

    async getApiKey(keyId: string): Promise<Record<string, unknown>> {
      calls.push({ method: "getApiKey", args: [keyId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: keyId,
        name: "Test API Key",
        key: "ak_test123",
        userId: "user_001",
        role: "admin",
        enabled: true,
        lastUsedAt: "2026-06-06T12:00:00.000Z",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-01T12:00:00.000Z",
      };
    },

    async createApiKey(name: string, userId: string, role?: string): Promise<Record<string, unknown>> {
      calls.push({ method: "createApiKey", args: [name, userId, role] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "ak_new_001",
        name,
        key: "ak_new_secret_key_123",
        userId,
        role: role ?? "viewer",
        enabled: true,
        createdAt: "2026-06-07T12:00:00.000Z",
        updatedAt: "2026-06-07T12:00:00.000Z",
      };
    },

    async rotateApiKey(keyId: string, gracePeriodMs?: number): Promise<Record<string, unknown>> {
      calls.push({ method: "rotateApiKey", args: [keyId, gracePeriodMs] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: keyId,
        name: "Test API Key",
        key: "ak_rotated_new_key",
        previousKey: "ak_old_key",
        previousKeyExpiresAt: "2026-06-08T12:00:00.000Z",
        userId: "user_001",
        role: "admin",
        enabled: true,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-07T12:00:00.000Z",
      };
    },

    async revokeApiKey(keyId: string): Promise<void> {
      calls.push({ method: "revokeApiKey", args: [keyId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async enableApiKey(keyId: string): Promise<Record<string, unknown>> {
      calls.push({ method: "enableApiKey", args: [keyId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: keyId,
        name: "Test API Key",
        key: "ak_test123",
        userId: "user_001",
        role: "admin",
        enabled: true,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-07T12:00:00.000Z",
      };
    },

    async disableApiKey(keyId: string): Promise<Record<string, unknown>> {
      calls.push({ method: "disableApiKey", args: [keyId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: keyId,
        name: "Test API Key",
        key: "ak_test123",
        userId: "user_001",
        role: "admin",
        enabled: false,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-07T12:00:00.000Z",
      };
    },

    async cleanupExpiredApiKeys(): Promise<{ cleaned: number }> {
      calls.push({ method: "cleanupExpiredApiKeys", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { cleaned: 3 };
    },

    // Saved views mock methods
    async listSavedViews(createdBy?: string): Promise<import("../../src/shared/types.js").SavedView[]> {
      calls.push({ method: "listSavedViews", args: createdBy ? [createdBy] : [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "view_1",
          name: "My urgent tasks",
          createdBy: "admin",
          filters: { status: "pending", priority: "urgent" },
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ];
    },

    async getSavedView(viewId: string): Promise<import("../../src/shared/types.js").SavedView> {
      calls.push({ method: "getSavedView", args: [viewId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: viewId,
        name: "My urgent tasks",
        createdBy: "admin",
        filters: { status: "pending", priority: "urgent" },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };
    },

    async createSavedView(name: string, filters: Record<string, unknown>): Promise<import("../../src/shared/types.js").SavedView> {
      calls.push({ method: "createSavedView", args: [name, filters] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "view_new",
        name,
        createdBy: "admin",
        filters: filters as import("../../src/shared/types.js").SavedViewFilters,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };
    },

    async updateSavedView(viewId: string, updates: { name?: string; filters?: Record<string, unknown> }): Promise<import("../../src/shared/types.js").SavedView> {
      calls.push({ method: "updateSavedView", args: [viewId, updates] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: viewId,
        name: updates.name ?? "My urgent tasks",
        createdBy: "admin",
        filters: (updates.filters ?? { status: "pending" }) as import("../../src/shared/types.js").SavedViewFilters,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      };
    },

    async deleteSavedView(viewId: string): Promise<void> {
      calls.push({ method: "deleteSavedView", args: [viewId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async resetStaleTasks(timeoutMs?: number): Promise<{ resetCount: number }> {
      calls.push({ method: "resetStaleTasks", args: timeoutMs !== undefined ? [timeoutMs] : [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { resetCount: 3 };
    },

    async cleanupProcessedEvents(retentionDays?: number): Promise<{ deletedCount: number }> {
      calls.push({ method: "cleanupProcessedEvents", args: retentionDays !== undefined ? [retentionDays] : [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { deletedCount: 15 };
    },

    async watchTask(taskId: string): Promise<import("../../src/shared/types.js").TaskWatcher> {
      calls.push({ method: "watchTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { taskId, userId: "user_1", createdAt: new Date().toISOString() };
    },

    async unwatchTask(taskId: string): Promise<{ removed: boolean }> {
      calls.push({ method: "unwatchTask", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { removed: true };
    },

    async listTaskWatchers(taskId: string): Promise<import("../../src/shared/types.js").TaskWatcher[]> {
      calls.push({ method: "listTaskWatchers", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [{ taskId, userId: "user_1", createdAt: new Date().toISOString() }];
    },

    async listTimeEntries(taskId: string): Promise<import("../../src/shared/types.js").TimeEntry[]> {
      calls.push({ method: "listTimeEntries", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [{ id: "1", taskId, startedAt: "2026-06-07T10:00:00.000Z", endedAt: "2026-06-07T10:30:00.000Z", durationMinutes: 30, description: "Test work", loggedBy: "user_1", createdAt: "2026-06-07T10:00:00.000Z", updatedAt: "2026-06-07T10:30:00.000Z" }];
    },

    async createTimeEntry(taskId: string, opts: { startedAt?: string; endedAt?: string; durationMinutes?: number; description?: string; loggedBy?: string }): Promise<import("../../src/shared/types.js").TimeEntry> {
      calls.push({ method: "createTimeEntry", args: [taskId, opts] });
      if (mock.failWith) throw new Error(mock.failWith);
      const now = new Date().toISOString();
      return { id: "1", taskId, startedAt: opts.startedAt ?? now, endedAt: opts.endedAt, durationMinutes: opts.durationMinutes ?? 0, description: opts.description, loggedBy: opts.loggedBy ?? "user_1", createdAt: now, updatedAt: now };
    },

    async startTimeEntry(taskId: string, description?: string): Promise<import("../../src/shared/types.js").TimeEntry> {
      calls.push({ method: "startTimeEntry", args: [taskId, description] });
      if (mock.failWith) throw new Error(mock.failWith);
      const now = new Date().toISOString();
      return { id: "1", taskId, startedAt: now, durationMinutes: 0, description, loggedBy: "user_1", createdAt: now, updatedAt: now };
    },

    async stopTimeEntry(taskId: string, entryId: string): Promise<import("../../src/shared/types.js").TimeEntry> {
      calls.push({ method: "stopTimeEntry", args: [taskId, entryId] });
      if (mock.failWith) throw new Error(mock.failWith);
      const now = new Date().toISOString();
      return { id: entryId, taskId, startedAt: "2026-06-07T10:00:00.000Z", endedAt: now, durationMinutes: 30, loggedBy: "user_1", createdAt: "2026-06-07T10:00:00.000Z", updatedAt: now };
    },

    async deleteTimeEntry(taskId: string, entryId: string): Promise<void> {
      calls.push({ method: "deleteTimeEntry", args: [taskId, entryId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async getTimeTrackingStats(): Promise<import("../../src/shared/types.js").TimeTrackingSummary> {
      calls.push({ method: "getTimeTrackingStats", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        totalEntries: 5,
        totalMinutes: 120,
        avgMinutesPerEntry: 24,
        avgMinutesPerTask: 40,
        tasksWithEntries: 3,
        activeTimers: 0,
        byUser: [{ userId: "user_1", totalMinutes: 80, entryCount: 3 }],
        byPriority: { normal: { totalMinutes: 80, entryCount: 3 }, high: { totalMinutes: 40, entryCount: 2 } },
        recentDaily: [{ date: "2026-06-07", totalMinutes: 50, entryCount: 2 }],
      };
    },

    async getActivityFeed(taskId: string, limit?: number): Promise<import("../../src/shared/types.js").ActivityFeedItem[]> {
      calls.push({ method: "getActivityFeed", args: [taskId, limit] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        { type: "task.created", timestamp: "2026-06-07T00:00:00Z", summary: "Task created" },
        { type: "task.status_changed", timestamp: "2026-06-07T01:00:00Z", actor: "user_1", summary: "Status changed to running" },
      ];
    },

    async listCycles(status?: import("../../src/shared/types.js").CycleStatus): Promise<import("../../src/shared/types.js").CycleSummary[]> {
      calls.push({ method: "listCycles", args: [status] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "cycle_001",
          name: "Sprint 1",
          startDate: "2026-06-01",
          endDate: "2026-06-14",
          status: status ?? "active",
          completedTasks: 3,
          totalTasks: 5,
          createdBy: "user_1",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ];
    },

    async getCycle(cycleId: string): Promise<import("../../src/shared/types.js").CycleSummary> {
      calls.push({ method: "getCycle", args: [cycleId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: cycleId,
        name: "Sprint 1",
        description: "First sprint",
        startDate: "2026-06-01",
        endDate: "2026-06-14",
        status: "active",
        completedTasks: 3,
        totalTasks: 5,
        createdBy: "user_1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      };
    },

    async createCycle(data: { name: string; description?: string; startDate: string; endDate: string }): Promise<import("../../src/shared/types.js").Cycle> {
      calls.push({ method: "createCycle", args: [data] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "cycle_new",
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        status: "upcoming",
        createdBy: "user_1",
        createdAt: "2026-06-07T00:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      };
    },

    async updateCycle(cycleId: string, updates: Record<string, unknown>): Promise<import("../../src/shared/types.js").Cycle> {
      calls.push({ method: "updateCycle", args: [cycleId, updates] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: cycleId,
        name: (updates.name as string) ?? "Sprint 1",
        description: updates.description as string | undefined,
        startDate: (updates.startDate as string) ?? "2026-06-01",
        endDate: (updates.endDate as string) ?? "2026-06-14",
        status: (updates.status as import("../../src/shared/types.js").CycleStatus) ?? "active",
        createdBy: "user_1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      };
    },

    async deleteCycle(cycleId: string): Promise<void> {
      calls.push({ method: "deleteCycle", args: [cycleId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async addTaskToCycle(taskId: string, cycleId: string): Promise<import("../../src/shared/types.js").Task> {
      calls.push({ method: "addTaskToCycle", args: [taskId, cycleId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_cycle",
        feishuChatId: "oc_cycle",
        feishuUserId: "ou_cycle",
        commandText: "Cycle task",
        status: "pending",
        cycleId,
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      };
    },

    async removeTaskFromCycle(taskId: string): Promise<import("../../src/shared/types.js").Task> {
      calls.push({ method: "removeTaskFromCycle", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "om_cycle",
        feishuChatId: "oc_cycle",
        feishuUserId: "ou_cycle",
        commandText: "Cycle task",
        status: "pending",
        createdAt: "2026-06-01T12:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      };
    },

    async listCycleTasks(cycleId: string): Promise<import("../../src/shared/types.js").Task[]> {
      calls.push({ method: "listCycleTasks", args: [cycleId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_cycle_001",
          source: "feishu",
          feishuMessageId: "om_cycle_1",
          feishuChatId: "oc_cycle_1",
          feishuUserId: "ou_cycle_1",
          commandText: "Sprint task 1",
          status: "done",
          cycleId,
          createdAt: "2026-06-01T12:00:00.000Z",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
      ];
    },

    async getCycleProgress(cycleId: string): Promise<import("../../src/shared/types.js").CycleProgress> {
      calls.push({ method: "getCycleProgress", args: [cycleId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        cycleId,
        cycleName: "Sprint 1",
        startDate: "2026-06-01",
        endDate: "2026-06-14",
        status: "active",
        totalTasks: 10,
        completedTasks: 4,
        inProgressTasks: 2,
        pendingTasks: 3,
        failedTasks: 1,
        completionPercent: 40,
        velocityPerDay: 0.6,
        estimatedDaysRemaining: 10,
        burndown: [
          { date: "2026-06-01", remaining: 10, completed: 0, ideal: 10 },
          { date: "2026-06-08", remaining: 6, completed: 4, ideal: 5 },
        ],
        statusBreakdown: { pending: 3, picked: 1, running: 1, done: 4, failed: 1 },
        priorityBreakdown: { low: 2, normal: 5, high: 2, urgent: 1 },
        totalEstimatedMinutes: 600,
        totalActualMinutes: 240,
      };
    },

    // Module (epic) mock methods
    async listModules(status?: import("../../src/shared/types.js").ModuleStatus): Promise<import("../../src/shared/types.js").ModuleWithProgress[]> {
      calls.push({ method: "listModules", args: [status] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "module_test_001",
          name: "Auth System",
          description: "Authentication and authorization",
          status: "active",
          startDate: "2026-06-01",
          endDate: "2026-06-30",
          createdBy: "test_user",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          totalTasks: 5,
          completedTasks: 2,
          completionPercent: 40,
        },
      ];
    },

    async getModule(moduleId: string): Promise<import("../../src/shared/types.js").ModuleWithProgress> {
      calls.push({ method: "getModule", args: [moduleId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: moduleId,
        name: "Auth System",
        description: "Authentication and authorization",
        status: "active",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        createdBy: "test_user",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        totalTasks: 5,
        completedTasks: 2,
        completionPercent: 40,
      };
    },

    async createModule(data: { name: string; description?: string; startDate?: string; endDate?: string }): Promise<import("../../src/shared/types.js").Module> {
      calls.push({ method: "createModule", args: [data] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: "module_test_new",
        name: data.name,
        description: data.description,
        status: "planned",
        startDate: data.startDate,
        endDate: data.endDate,
        createdBy: "test_user",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
      };
    },

    async updateModule(moduleId: string, updates: Record<string, unknown>): Promise<import("../../src/shared/types.js").Module> {
      calls.push({ method: "updateModule", args: [moduleId, updates] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: moduleId,
        name: (updates.name as string) ?? "Auth System",
        description: (updates.description as string) ?? undefined,
        status: (updates.status as import("../../src/shared/types.js").ModuleStatus) ?? "active",
        startDate: (updates.startDate as string) ?? undefined,
        endDate: (updates.endDate as string) ?? undefined,
        targetCompletionPercent: (updates.targetCompletionPercent as number) ?? undefined,
        createdBy: "test_user",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
      };
    },

    async deleteModule(moduleId: string): Promise<void> {
      calls.push({ method: "deleteModule", args: [moduleId] });
      if (mock.failWith) throw new Error(mock.failWith);
    },

    async addTaskToModule(taskId: string, moduleId: string): Promise<import("../../src/shared/types.js").Task> {
      calls.push({ method: "addTaskToModule", args: [taskId, moduleId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "msg_001",
        feishuChatId: "chat_001",
        feishuUserId: "user_001",
        commandText: "test task",
        status: "pending",
        priority: "normal",
        tags: [],
        description: undefined,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        moduleId,
      };
    },

    async removeTaskFromModule(taskId: string): Promise<import("../../src/shared/types.js").Task> {
      calls.push({ method: "removeTaskFromModule", args: [taskId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return {
        id: taskId,
        source: "feishu",
        feishuMessageId: "msg_001",
        feishuChatId: "chat_001",
        feishuUserId: "user_001",
        commandText: "test task",
        status: "pending",
        priority: "normal",
        tags: [],
        description: undefined,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
      };
    },

    async listModuleTasks(moduleId: string): Promise<import("../../src/shared/types.js").Task[]> {
      calls.push({ method: "listModuleTasks", args: [moduleId] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          id: "task_test_001",
          source: "feishu",
          feishuMessageId: "msg_001",
          feishuChatId: "chat_001",
          feishuUserId: "user_001",
          commandText: "test task in module",
          status: "pending",
          priority: "normal",
          tags: [],
          description: undefined,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          moduleId,
        },
      ];
    },

    async getAuditCount(): Promise<number> {
      calls.push({ method: "getAuditCount", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return 42;
    },

    async cleanupAuditLog(retentionDays?: number): Promise<{ deletedCount: number }> {
      calls.push({ method: "cleanupAuditLog", args: [retentionDays] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { deletedCount: 5 };
    },

    async updateTaskCard(taskId: string, markdown: string, title?: string, color?: string): Promise<{ success: boolean; messageId: string }> {
      calls.push({ method: "updateTaskCard", args: [taskId, markdown, title, color] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { success: true, messageId: "msg_001" };
    },

    async getGlobalActivity(limit?: number): Promise<import("../../src/shared/types.js").ActivityFeedItem[]> {
      calls.push({ method: "getGlobalActivity", args: [limit] });
      if (mock.failWith) throw new Error(mock.failWith);
      return [
        {
          type: "task.created",
          timestamp: "2026-06-08T10:00:00.000Z",
          actor: "ou_test",
          actorType: "feishu",
          summary: "Task created: test task",
          details: { taskId: "task_001" },
        },
      ];
    },
  };
  return mock;
}

// --- Mock McpServer to capture tool registrations ---
interface ToolRegistration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
}

function createMockServer(): {
  registrations: ToolRegistration[];
  registerTool: (
    name: string,
    opts: { description: string; inputSchema: Record<string, unknown> },
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ) => void;
} {
  const registrations: ToolRegistration[] = [];
  return {
    registrations,
    registerTool: (
      name: string,
      opts: { description: string; inputSchema: Record<string, unknown> },
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      registrations.push({
        name,
        description: opts.description,
        inputSchema: opts.inputSchema,
        handler: handler as ToolRegistration["handler"],
      });
    },
  };
}

// --- Tests ---
describe("MCP tools", () => {
  let mock: ReturnType<typeof createMockClient>;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    mock = createMockClient();
    mockServer = createMockServer();
    registerMcpTools(mockServer as never, mock);
  });

  describe("tool registration", () => {
      it("registers all 158 tools", () => {
        expect(mockServer.registrations).toHaveLength(158);
    });

    it("registers list_tasks with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_tasks");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("List tasks");
    });

    it("registers get_task with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_task");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Get details");
    });

    it("registers mark_task_running with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "mark_task_running");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("running");
    });

    it("registers report_task_result with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("result");
    });

    it("registers reply_feishu with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "reply_feishu");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("reply");
    });

    it("registers search_tasks with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Search task history");
    });
  });

  describe("list_tasks handler", () => {
    it("calls client.listTasks with default parameters", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_tasks")!;
      const result = await tool.handler({});

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("listTasks");
      expect(mock.calls[0].args[0]).toBeUndefined();
      expect(mock.calls[0].args[1]).toBeUndefined();

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].id).toBe("task_001");
    });

    it("passes status and limit to client", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_tasks")!;
      await tool.handler({ status: "running", limit: 5 });

      expect(mock.calls[0].method).toBe("listTasks");
      expect(mock.calls[0].args[0]).toBe("running");
      expect(mock.calls[0].args[1]).toBe(5);
    });

    it("returns error when client throws", async () => {
      mock.failWith = "Server unreachable";
      const tool = mockServer.registrations.find((r) => r.name === "list_tasks")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server unreachable");
    });
  });

  describe("get_task handler", () => {
    it("returns task details for a valid taskId", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_task")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(mock.calls[0].method).toBe("getTask");
      expect(mock.calls[0].args[0]).toBe("task_001");

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBeDefined();
      expect(parsed.task.id).toBe("task_001");
    });

    it("returns error when task not found", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "get_task")!;
      const result = await tool.handler({ taskId: "nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Task not found");
    });
  });

  describe("mark_task_running handler", () => {
    it("marks a task as running", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "mark_task_running")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(mock.calls[0].method).toBe("markTaskRunning");
      expect(mock.calls[0].args[0]).toBe("task_001");

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBeDefined();
      expect(parsed.task.status).toBe("running");
    });

    it("returns error on invalid status transition", async () => {
      mock.failWith = "Invalid status transition";
      const tool = mockServer.registrations.find((r) => r.name === "mark_task_running")!;
      const result = await tool.handler({ taskId: "task_done" });

      expect(result.isError).toBe(true);
    });
  });

  describe("report_task_result handler", () => {
    it("reports successful result with all fields", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result")!;
      const result = await tool.handler({
        taskId: "task_001",
        success: true,
        summary: "处理完成",
        details: "使用快排算法",
      });

      expect(mock.calls[0].method).toBe("reportTaskResult");
      const args = mock.calls[0].args;
      expect(args[0]).toBe("task_001");
      expect(args[1]).toBe(true);
      expect(args[2]).toBe("处理完成");
      expect(args[3]).toBe("使用快排算法");

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.status).toBe("done");
      expect(parsed.task.resultSummary).toBe("处理完成");
    });

    it("reports failed result", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result")!;
      const result = await tool.handler({
        taskId: "task_001",
        success: false,
        summary: "执行失败",
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.status).toBe("failed");
    });

    it("handles result without details", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result")!;
      await tool.handler({
        taskId: "task_001",
        success: true,
        summary: "完成",
      });

      const args = mock.calls[0].args;
      expect(args[3]).toBeUndefined();
    });

    it("returns error on report failure", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "report_task_result")!;
      const result = await tool.handler({
        taskId: "nonexistent",
        success: true,
        summary: "done",
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("reply_feishu handler", () => {
    it("sends a reply to Feishu", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "reply_feishu")!;
      const result = await tool.handler({
        taskId: "task_001",
        message: "我已收到任务，稍后处理。",
      });

      expect(mock.calls[0].method).toBe("replyFeishu");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toBe("我已收到任务，稍后处理。");

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ok).toBe(true);
    });

    it("returns error on reply failure", async () => {
      mock.failWith = "Feishu API error";
      const tool = mockServer.registrations.find((r) => r.name === "reply_feishu")!;
      const result = await tool.handler({
        taskId: "task_001",
        message: "测试回复",
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Feishu API error");
    });
  });

  describe("search_tasks handler", () => {
    it("calls client.searchTasks with text query", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks")!;
      const result = await tool.handler({ q: "检查" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("searchTasks");
      expect(mock.calls[0].args[0]).toEqual({ q: "检查" });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.count).toBe(1);
    });

    it("passes all filter options to client", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks")!;
      const result = await tool.handler({
        q: "deploy",
        status: "done",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.000Z",
        limit: 10,
      });

      expect(mock.calls[0].args[0]).toEqual({
        q: "deploy",
        status: "done",
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-30T23:59:59.000Z",
        limit: 10,
      });

      expect(result.isError).toBeFalsy();
    });

    it("returns error when client throws", async () => {
      mock.failWith = "Search failed";
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks")!;
      const result = await tool.handler({ q: "test" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Search failed");
    });

    it("passes tags filter to client", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "search_tasks")!;
      await tool.handler({ tags: ["bug", "urgent"] });

      expect(mock.calls[0].args[0]).toHaveProperty("tags", ["bug", "urgent"]);
    });
  });

  describe("manage_task_tags handler", () => {
    it("registers manage_task_tags with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Manage tags");
    });

    it("lists all tags", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "list" });

      expect(mock.calls[0].method).toBe("listAllTags");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tags).toEqual(["bug", "feature", "urgent"]);
      expect(parsed.count).toBe(3);
    });

    it("adds tags to a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({
        action: "add",
        taskId: "task_001",
        tags: ["bug", "critical"],
      });

      expect(mock.calls[0].method).toBe("addTags");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toEqual(["bug", "critical"]);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBeDefined();
      expect(parsed.message).toContain("bug");
    });

    it("removes a tag from a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({
        action: "remove",
        taskId: "task_001",
        tag: "bug",
      });

      expect(mock.calls[0].method).toBe("removeTag");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toBe("bug");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBeDefined();
      expect(parsed.message).toContain("bug");
    });

    it("returns error when add action missing taskId", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "add", tags: ["bug"] });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("taskId is required");
    });

    it("returns error when add action missing tags", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "add", taskId: "task_001" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("tags array is required");
    });

    it("returns error when remove action missing tag", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "remove", taskId: "task_001" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("tag is required");
    });

    it("returns error on client failure", async () => {
      mock.failWith = "Server error";
      const tool = mockServer.registrations.find((r) => r.name === "manage_task_tags")!;
      const result = await tool.handler({ action: "list" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server error");
    });
  });

  describe("comment tools", () => {
    it("registers add_task_comment tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "add_task_comment");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("comment");
    });

    it("registers list_task_comments tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_task_comments");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("comment");
    });

    it("adds a comment to a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "add_task_comment")!;
      const result = await tool.handler({ taskId: "task_001", body: "This is a test comment" });

      expect(mock.calls[0].method).toBe("addComment");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[2]).toBe("This is a test comment");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.comment).toBeDefined();
      expect(parsed.comment.id).toBe(42);
      expect(parsed.message).toContain("Comment added");
    });

    it("returns error when add_comment fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "add_task_comment")!;
      const result = await tool.handler({ taskId: "task_nonexistent", body: "test" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Task not found");
    });

    it("lists comments for a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_task_comments")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(mock.calls[0].method).toBe("listComments");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.comments).toHaveLength(1);
      expect(parsed.comments[0].body).toBe("Test comment");
      expect(parsed.count).toBe(1);
    });

    it("returns error when list_comments fails", async () => {
      mock.failWith = "Server error";
      const tool = mockServer.registrations.find((r) => r.name === "list_task_comments")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server error");
    });

    it("registers delete_task_comment tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_task_comment");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("delete");
      expect(tool!.description.toLowerCase()).toContain("comment");
    });

    it("deletes a comment from a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_task_comment")!;
      const result = await tool.handler({ taskId: "task_001", commentId: 42 });

      expect(mock.calls[0].method).toBe("deleteTaskComment");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toBe(42);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("Comment 42 deleted");
    });

    it("returns error when delete_task_comment fails", async () => {
      mock.failWith = "Comment not found";
      const tool = mockServer.registrations.find((r) => r.name === "delete_task_comment")!;
      const result = await tool.handler({ taskId: "task_001", commentId: 999 });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Comment not found");
    });

    it("registers add_task_note tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "add_task_note");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("note");
    });

    it("registers list_task_notes tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_task_notes");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("note");
    });

    it("registers delete_task_note tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_task_note");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("delete");
      expect(tool!.description.toLowerCase()).toContain("note");
    });

    it("adds a note to a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "add_task_note")!;
      const result = await tool.handler({ taskId: "task_001", body: "Internal note" });

      expect(mock.calls[0].method).toBe("addNote");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toBe("Internal note");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.note).toBeDefined();
      expect(parsed.note.id).toBe(99);
    });

    it("lists notes for a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_task_notes")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(mock.calls[0].method).toBe("listNotes");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.notes).toHaveLength(1);
    });

    it("deletes a note from a task", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_task_note")!;
      const result = await tool.handler({ taskId: "task_001", noteId: 99 });

      expect(mock.calls[0].method).toBe("deleteTaskNote");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toBe(99);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("Note 99 deleted");
    });

    it("returns error when delete_task_note fails", async () => {
      mock.failWith = "Note not found";
      const tool = mockServer.registrations.find((r) => r.name === "delete_task_note")!;
      const result = await tool.handler({ taskId: "task_001", noteId: 888 });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Note not found");
    });

    it("lists tasks by user", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_user_tasks")!;
      const result = await tool.handler({ userId: "ou_abc123" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("listTasksByUser");
      expect(mock.calls[0].args[0]).toBe("ou_abc123");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].feishuUserId).toBe("ou_abc123");
      expect(parsed.count).toBe(1);
      expect(parsed.userId).toBe("ou_abc123");
    });

    it("passes limit to listTasksByUser", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_user_tasks")!;
      const result = await tool.handler({ userId: "ou_abc123", limit: 5 });

      expect(mock.calls[0].args[1]).toBe(5);
      expect(result.isError).toBeFalsy();
    });

    it("returns error when list_user_tasks fails", async () => {
      mock.failWith = "Server error";
      const tool = mockServer.registrations.find((r) => r.name === "list_user_tasks")!;
      const result = await tool.handler({ userId: "ou_abc123" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server error");
    });

    it("registers download_attachment with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "download_attachment");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Download");
      expect(tool!.description).toContain("attachment");
    });

    it("downloads an attachment", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "download_attachment")!;
      const result = await tool.handler({ taskId: "task_001", attachmentIndex: 0 });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("downloadAttachment");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toBe(0);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.fileName).toBe("test-file.txt");
      expect(parsed.contentType).toBe("text/plain");
      expect(parsed.base64Data).toBeDefined();
    });

    it("returns error when download_attachment fails", async () => {
      mock.failWith = "Server error";
      const tool = mockServer.registrations.find((r) => r.name === "download_attachment")!;
      const result = await tool.handler({ taskId: "task_001", attachmentIndex: 0 });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server error");
    });

    it("registers get_api_usage with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_api_usage");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("usage");
      expect(tool!.description).toContain("analytics");
    });

    it("gets API usage stats", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_api_usage")!;
      const result = await tool.handler({});

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("getApiUsageStats");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stats).toBeDefined();
      expect(parsed.stats.totalRequests).toBe(100);
      expect(parsed.stats.callers).toHaveLength(1);
      expect(parsed.stats.callers[0].callerId).toBe("user:admin");
    });

    it("passes time filters to get_api_usage", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_api_usage")!;
      const result = await tool.handler({
        from: "2026-06-01T00:00:00Z",
        to: "2026-06-03T23:59:59Z",
      });

      expect(mock.calls).toHaveLength(1);
      expect(result.isError).toBeFalsy();
    });

    it("returns error when get_api_usage fails", async () => {
      mock.failWith = "Server error";
      const tool = mockServer.registrations.find((r) => r.name === "get_api_usage")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server error");
    });

    it("registers get_api_usage_entries with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_api_usage_entries");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("usage");
      expect(tool!.description.toLowerCase()).toContain("entries");
    });

    it("gets API usage entries for a caller", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_api_usage_entries")!;
      const result = await tool.handler({ callerId: "user:admin" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("getApiUsageEntries");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.callerId).toBe("user:admin");
      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].method).toBe("GET");
    });

    it("passes limit parameter to get_api_usage_entries", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_api_usage_entries")!;
      const result = await tool.handler({ callerId: "user:admin", limit: 10 });

      expect(mock.calls).toHaveLength(1);
      expect(result.isError).toBeFalsy();
    });

    it("returns error when get_api_usage_entries fails", async () => {
      mock.failWith = "Server error";
      const tool = mockServer.registrations.find((r) => r.name === "get_api_usage_entries")!;
      const result = await tool.handler({ callerId: "user:admin" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server error");
    });

    it("registers escalate_overdue_priorities tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "escalate_overdue_priorities");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("escalate");
    });

    it("calls escalate_overdue_priorities", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "escalate_overdue_priorities")!;
      const result = await tool.handler({});

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("escalateOverduePriorities");
      expect(result.isError).toBeFalsy();
    });

    // --- set_task_priority tool tests ---

    it("registers set_task_priority tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "set_task_priority");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("priority");
    });

    it("sets task priority to urgent", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "set_task_priority")!;
      const result = await tool.handler({ taskId: "task_001", priority: "urgent" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("setPriority");
      expect(mock.calls[0].args).toEqual(["task_001", "urgent"]);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.priority).toBe("urgent");
      expect(parsed.message).toContain("urgent");
    });

    it("sets task priority to low", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "set_task_priority")!;
      const result = await tool.handler({ taskId: "task_001", priority: "low" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].args).toEqual(["task_001", "low"]);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.priority).toBe("low");
    });

    it("returns error when set_priority fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "set_task_priority")!;
      const result = await tool.handler({ taskId: "task_nonexistent", priority: "high" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Task not found");
    });

    // --- set_task_command_text tool tests ---

    it("registers set_task_command_text tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "set_task_command_text");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("command text");
    });

    it("updates task command text", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "set_task_command_text")!;
      const result = await tool.handler({ taskId: "task_001", commandText: "Updated command" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("setTaskCommandText");
      expect(mock.calls[0].args).toEqual(["task_001", "Updated command"]);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.commandText).toBe("Updated command");
      expect(parsed.message).toContain("Command text updated");
    });

    it("returns error when set_task_command_text fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "set_task_command_text")!;
      const result = await tool.handler({ taskId: "task_nonexistent", commandText: "New text" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Task not found");
    });

    // --- set_task_estimated_minutes tool tests ---

    it("registers set_task_estimated_minutes tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "set_task_estimated_minutes");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("estimated");
    });

    it("sets task estimated minutes to 30", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "set_task_estimated_minutes")!;
      const result = await tool.handler({ taskId: "task_001", estimatedMinutes: 30 });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("setEstimatedMinutes");
      expect(mock.calls[0].args).toEqual(["task_001", 30]);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.estimatedMinutes).toBe(30);
      expect(parsed.message).toContain("30");
    });

    it("clears task estimated minutes with null", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "set_task_estimated_minutes")!;
      const result = await tool.handler({ taskId: "task_001", estimatedMinutes: null });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].args).toEqual(["task_001", null]);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("cleared");
    });

    it("returns error when set_estimated_minutes fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "set_task_estimated_minutes")!;
      const result = await tool.handler({ taskId: "task_nonexistent", estimatedMinutes: 60 });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Task not found");
    });

    // --- Webhook tools tests ---

    it("registers list_webhooks tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_webhooks");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("webhook");
    });

    it("lists webhooks", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_webhooks")!;
      const result = await tool.handler({});

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("listWebhooks");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.webhooks).toHaveLength(1);
      expect(parsed.webhooks[0].id).toBe("wh_test_001");
    });

    it("registers get_webhook tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_webhook");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("webhook");
    });

    it("gets a webhook by ID", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_webhook")!;
      const result = await tool.handler({ webhookId: "wh_test_001" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("getWebhook");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe("wh_test_001");
    });

    it("registers create_webhook tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "create_webhook");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Create");
    });

    it("creates a webhook", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "create_webhook")!;
      const result = await tool.handler({
        url: "https://example.com/hook",
        events: ["task.created"],
        description: "My new hook",
      });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("createWebhook");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.webhook.id).toBe("wh_new_001");
      expect(parsed.webhook.url).toBe("https://example.com/hook");
    });

    it("registers update_webhook tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "update_webhook");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Update");
    });

    it("updates a webhook", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "update_webhook")!;
      const result = await tool.handler({
        webhookId: "wh_test_001",
        enabled: false,
      });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("updateWebhook");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe("wh_test_001");
    });

    it("registers delete_webhook tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_webhook");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Delete");
    });

    it("deletes a webhook", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "delete_webhook")!;
      const result = await tool.handler({ webhookId: "wh_test_001" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("deleteWebhook");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("deleted");
    });

    it("registers list_webhook_deliveries tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_webhook_deliveries");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("delivery");
    });

    it("lists webhook deliveries", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_webhook_deliveries")!;
      const result = await tool.handler({ webhookId: "wh_test_001", limit: 10 });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("listWebhookDeliveries");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deliveries).toHaveLength(1);
      expect(parsed.summary.success).toBe(1);
    });

    it("returns error when list_webhooks fails", async () => {
      mock.failWith = "Server error";
      const tool = mockServer.registrations.find((r) => r.name === "list_webhooks")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Server error");
    });

    // ── get_kanban_board tests ─────────────────────────────────────

    it("registers get_kanban_board tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_kanban_board");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Kanban");
    });

    it("returns kanban board with all status columns", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_kanban_board")!;
      const result = await tool.handler({});

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("getKanbanBoard");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.columns).toHaveLength(5);
      expect(parsed.columns.map((c: { status: string }) => c.status)).toEqual([
        "pending", "picked", "running", "done", "failed",
      ]);
      expect(parsed.totalTasks).toBe(1);
    });

    it("passes limit parameter to getKanbanBoard", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_kanban_board")!;
      await tool.handler({ limit: 25 });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("getKanbanBoard");
    });

    it("returns error when getKanbanBoard fails", async () => {
      mock.failWith = "Connection refused";
      const tool = mockServer.registrations.find((r) => r.name === "get_kanban_board")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Connection refused");
    });

    // ── create_task_from_template tests ──────────────────────────────

    it("registers create_task_from_template tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "create_task_from_template");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("template");
    });

    it("creates task from template with defaults", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "create_task_from_template")!;
      const result = await tool.handler({ templateId: "tmpl_001" });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe("createTaskFromTemplate");
      expect(mock.calls[0].args[0]).toBe("tmpl_001");
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task).toBeDefined();
      expect(parsed.task.id).toBe("task_from_tmpl_001");
      expect(parsed.task.status).toBe("pending");
      expect(parsed.message).toContain("created from template");
    });

    it("creates task from template with overrides", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "create_task_from_template")!;
      const result = await tool.handler({
        templateId: "tmpl_002",
        commandText: "Custom command",
        priority: "urgent",
        tags: ["urgent", "ops"],
      });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].args[0]).toBe("tmpl_002");
      const overrides = mock.calls[0].args[1] as Record<string, unknown>;
      expect(overrides.commandText).toBe("Custom command");
      expect(overrides.priority).toBe("urgent");
      expect(overrides.tags).toEqual(["urgent", "ops"]);
      expect(result.isError).toBeFalsy();
    });

    it("returns error when createTaskFromTemplate fails", async () => {
      mock.failWith = "Template not found";
      const tool = mockServer.registrations.find((r) => r.name === "create_task_from_template")!;
      const result = await tool.handler({ templateId: "nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Template not found");
    });
  });

  // --- Template usage stats tests ---
  describe("get_template_usage_stats", () => {
    it("registers get_template_usage_stats tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_template_usage_stats");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("template");
      expect(tool!.description.toLowerCase()).toContain("usage");
    });

    it("returns template usage statistics", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_template_usage_stats")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("getTemplateUsageStats");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stats).toHaveLength(2);
      expect(parsed.totalUsage).toBe(8);
      expect(parsed.templateCount).toBe(2);
      expect(parsed.stats[0].name).toBe("Deploy Template");
      expect(parsed.stats[0].usageCount).toBe(5);
    });

    it("returns error when getTemplateUsageStats fails", async () => {
      mock.failWith = "Service unavailable";
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_template_usage_stats")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Service unavailable");
      mock.failWith = undefined;
    });
  });

  // --- Device tools tests ---
  describe("device tools", () => {
    it("registers list_devices tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_devices");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("device");
    });

    it("lists devices", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_devices")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("listDevices");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.devices).toHaveLength(1);
      expect(parsed.devices[0].id).toBe("dev_001");
      expect(parsed.total).toBe(1);
    });

    it("registers get_device tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_device");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("device");
    });

    it("gets device details", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_device")!;
      const result = await tool.handler({ deviceId: "dev_001" });

      expect(mock.calls[0].method).toBe("getDevice");
      expect(mock.calls[0].args[0]).toBe("dev_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.device.id).toBe("dev_001");
      expect(parsed.device.name).toBe("office-desktop");
    });

    it("returns error when getDevice fails", async () => {
      mock.failWith = "Device not found";
      const tool = mockServer.registrations.find((r) => r.name === "get_device")!;
      const result = await tool.handler({ deviceId: "nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Device not found");
    });

    it("registers delete_device tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_device");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("device");
    });

    it("deletes a device", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "delete_device")!;
      const result = await tool.handler({ deviceId: "dev_001" });

      expect(mock.calls[0].method).toBe("deleteDevice");
      expect(mock.calls[0].args[0]).toBe("dev_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("deleted successfully");
    });

    it("returns error when deleteDevice fails", async () => {
      mock.failWith = "Device not found";
      const tool = mockServer.registrations.find((r) => r.name === "delete_device")!;
      const result = await tool.handler({ deviceId: "nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Device not found");
    });
  });

  describe("get_processing_stats", () => {
    it("registers get_processing_stats tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_processing_stats");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("processing");
    });

    it("returns processing stats", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_processing_stats")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("getProcessingStats");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalCompleted).toBe(10);
      expect(parsed.avgDurationMs).toBe(5000);
      expect(parsed.byStatus.done).toBe(8);
    });

    it("returns error when getProcessingStats fails", async () => {
      mock.failWith = "Stats unavailable";
      const tool = mockServer.registrations.find((r) => r.name === "get_processing_stats")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Stats unavailable");
    });
  });

  describe("get_task_stats_summary", () => {
    it("registers get_task_stats_summary tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_task_stats_summary");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("summary");
    });

    it("returns task stats summary", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_task_stats_summary")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("getTaskStatsSummary");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.total).toBe(25);
      expect(parsed.byStatus.pending).toBe(10);
    });

    it("returns error when getTaskStatsSummary fails", async () => {
      mock.failWith = "Summary failed";
      const tool = mockServer.registrations.find((r) => r.name === "get_task_stats_summary")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Summary failed");
    });
  });

  describe("get_user_stats", () => {
    it("registers get_user_stats tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_user_stats");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("user");
    });

    it("returns user stats", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_user_stats")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("getUserStats");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalUsers).toBe(3);
      expect(parsed.users).toHaveLength(1);
    });

    it("returns error when getUserStats fails", async () => {
      mock.failWith = "User stats error";
      const tool = mockServer.registrations.find((r) => r.name === "get_user_stats")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("User stats error");
    });
  });

  describe("get_task_timeseries", () => {
    it("registers get_task_timeseries tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_task_timeseries");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("time-series");
    });

    it("returns timeseries data", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_task_timeseries")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("getTaskTimeSeries");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.interval).toBe("day");
      expect(parsed.data).toHaveLength(2);
    });

    it("passes filter parameters", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_task_timeseries")!;
      await tool.handler({ from: "2026-06-01", to: "2026-06-30", interval: "week", metric: "completed" });

      expect(mock.calls[0].method).toBe("getTaskTimeSeries");
    });

    it("returns error when getTaskTimeSeries fails", async () => {
      mock.failWith = "Timeseries error";
      const tool = mockServer.registrations.find((r) => r.name === "get_task_timeseries")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Timeseries error");
    });
  });

  // --- User management tools tests ---
  describe("user management tools", () => {
    it("registers list_users tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_users");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("user");
    });

    it("lists users", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_users")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("listUsers");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.users).toHaveLength(1);
      expect(parsed.users[0].id).toBe("usr_001");
      expect(parsed.users[0].username).toBe("admin");
      expect(parsed.total).toBe(1);
    });

    it("returns error when listUsers fails", async () => {
      mock.failWith = "Auth required";
      const tool = mockServer.registrations.find((r) => r.name === "list_users")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Auth required");
    });

    it("registers get_user tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_user");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("user");
    });

    it("gets user details", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_user")!;
      const result = await tool.handler({ userId: "usr_001" });

      expect(mock.calls[0].method).toBe("getUser");
      expect(mock.calls[0].args[0]).toBe("usr_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.user.id).toBe("usr_001");
      expect(parsed.user.username).toBe("admin");
      expect(parsed.user.role).toBe("admin");
    });

    it("returns error when getUser fails", async () => {
      mock.failWith = "User not found";
      const tool = mockServer.registrations.find((r) => r.name === "get_user")!;
      const result = await tool.handler({ userId: "nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("User not found");
    });

    it("registers create_user tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "create_user");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("user");
    });

    it("creates a user", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "create_user")!;
      const result = await tool.handler({ username: "newuser", role: "operator", feishuUserId: "ou_123" });

      expect(mock.calls[0].method).toBe("createUser");
      expect(mock.calls[0].args[0]).toBe("newuser");
      expect(mock.calls[0].args[1]).toBe("operator");
      expect(mock.calls[0].args[2]).toBe("ou_123");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.user.username).toBe("newuser");
      expect(parsed.user.role).toBe("operator");
      expect(parsed.message).toContain("created successfully");
    });

    it("returns error when createUser fails", async () => {
      mock.failWith = "Username already exists";
      const tool = mockServer.registrations.find((r) => r.name === "create_user")!;
      const result = await tool.handler({ username: "existing" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Username already exists");
    });

    it("registers update_user_role tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "update_user_role");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("role");
    });

    it("updates user role", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "update_user_role")!;
      const result = await tool.handler({ userId: "usr_001", role: "viewer" });

      expect(mock.calls[0].method).toBe("updateUserRole");
      expect(mock.calls[0].args[0]).toBe("usr_001");
      expect(mock.calls[0].args[1]).toBe("viewer");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.user.role).toBe("viewer");
      expect(parsed.message).toContain("role updated");
    });

    it("returns error when updateUserRole fails", async () => {
      mock.failWith = "User not found";
      const tool = mockServer.registrations.find((r) => r.name === "update_user_role")!;
      const result = await tool.handler({ userId: "nonexistent", role: "admin" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("User not found");
    });

    it("registers delete_user tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_user");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("delete");
    });

    it("deletes a user", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "delete_user")!;
      const result = await tool.handler({ userId: "usr_001" });

      expect(mock.calls[0].method).toBe("deleteUser");
      expect(mock.calls[0].args[0]).toBe("usr_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("deleted successfully");
    });

    it("returns error when deleteUser fails", async () => {
      mock.failWith = "User not found";
      const tool = mockServer.registrations.find((r) => r.name === "delete_user")!;
      const result = await tool.handler({ userId: "nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("User not found");
    });

    it("registers regenerate_user_token tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "regenerate_user_token");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("token");
    });

    it("regenerates user token", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "regenerate_user_token")!;
      const result = await tool.handler({ userId: "usr_001" });

      expect(mock.calls[0].method).toBe("regenerateUserToken");
      expect(mock.calls[0].args[0]).toBe("usr_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.user.token).toBe("utoken_fresh456");
      expect(parsed.message).toContain("Token regenerated");
    });

    it("returns error when regenerateUserToken fails", async () => {
      mock.failWith = "User not found";
      const tool = mockServer.registrations.find((r) => r.name === "regenerate_user_token")!;
      const result = await tool.handler({ userId: "nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("User not found");
    });

    // --- API key management tools ---
    it("registers list_api_keys tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_api_keys");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("API key");
    });

    it("lists API keys", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_api_keys")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("listApiKeys");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.apiKeys).toHaveLength(1);
      expect(parsed.apiKeys[0].id).toBe("ak_001");
    });

    it("returns error when listApiKeys fails", async () => {
      mock.failWith = "DB error";
      const tool = mockServer.registrations.find((r) => r.name === "list_api_keys")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("DB error");
    });

    it("registers get_api_key tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_api_key");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("API key");
    });

    it("gets API key details", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_api_key")!;
      const result = await tool.handler({ keyId: "ak_001" });

      expect(mock.calls[0].method).toBe("getApiKey");
      expect(mock.calls[0].args[0]).toBe("ak_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe("ak_001");
    });

    it("returns error when getApiKey fails", async () => {
      mock.failWith = "Key not found";
      const tool = mockServer.registrations.find((r) => r.name === "get_api_key")!;
      const result = await tool.handler({ keyId: "nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Key not found");
    });

    it("registers create_api_key tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "create_api_key");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Create");
    });

    it("creates an API key", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "create_api_key")!;
      const result = await tool.handler({ name: "My Key", userId: "usr_001", role: "operator" });

      expect(mock.calls[0].method).toBe("createApiKey");
      expect(mock.calls[0].args[0]).toBe("My Key");
      expect(mock.calls[0].args[1]).toBe("usr_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.apiKey.name).toBe("My Key");
      expect(parsed.message).toContain("created");
    });

    it("returns error when createApiKey fails", async () => {
      mock.failWith = "Invalid role";
      const tool = mockServer.registrations.find((r) => r.name === "create_api_key")!;
      const result = await tool.handler({ name: "Key", userId: "usr_001" });

      expect(result.isError).toBe(true);
    });

    it("registers rotate_api_key tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "rotate_api_key");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Rotate");
    });

    it("rotates an API key", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "rotate_api_key")!;
      const result = await tool.handler({ keyId: "ak_001", gracePeriodMs: 3600000 });

      expect(mock.calls[0].method).toBe("rotateApiKey");
      expect(mock.calls[0].args[0]).toBe("ak_001");
      expect(mock.calls[0].args[1]).toBe(3600000);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.apiKey.key).toBe("ak_rotated_new_key");
      expect(parsed.message).toContain("rotated");
    });

    it("returns error when rotateApiKey fails", async () => {
      mock.failWith = "Key not found";
      const tool = mockServer.registrations.find((r) => r.name === "rotate_api_key")!;
      const result = await tool.handler({ keyId: "nonexistent" });

      expect(result.isError).toBe(true);
    });

    it("registers revoke_api_key tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "revoke_api_key");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("revoke");
    });

    it("revokes an API key", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "revoke_api_key")!;
      const result = await tool.handler({ keyId: "ak_001" });

      expect(mock.calls[0].method).toBe("revokeApiKey");
      expect(mock.calls[0].args[0]).toBe("ak_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("revoked successfully");
    });

    it("returns error when revokeApiKey fails", async () => {
      mock.failWith = "Key not found";
      const tool = mockServer.registrations.find((r) => r.name === "revoke_api_key")!;
      const result = await tool.handler({ keyId: "nonexistent" });

      expect(result.isError).toBe(true);
    });

    it("registers enable_api_key tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "enable_api_key");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("enable");
    });

    it("enables an API key", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "enable_api_key")!;
      const result = await tool.handler({ keyId: "ak_001" });

      expect(mock.calls[0].method).toBe("enableApiKey");
      expect(mock.calls[0].args[0]).toBe("ak_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("enabled successfully");
    });

    it("registers disable_api_key tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "disable_api_key");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("disable");
    });

    it("disables an API key", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "disable_api_key")!;
      const result = await tool.handler({ keyId: "ak_001" });

      expect(mock.calls[0].method).toBe("disableApiKey");
      expect(mock.calls[0].args[0]).toBe("ak_001");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("disabled successfully");
    });

    it("registers cleanup_expired_api_keys tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "cleanup_expired_api_keys");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("expired");
    });

    it("cleans up expired API keys", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "cleanup_expired_api_keys")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("cleanupExpiredApiKeys");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.cleaned).toBe(3);
      expect(parsed.message).toContain("3");
    });

    it("returns error when cleanupExpiredApiKeys fails", async () => {
      mock.failWith = "DB error";
      const tool = mockServer.registrations.find((r) => r.name === "cleanup_expired_api_keys")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
    });
  });

  // ─── Saved Views tools ────────────────────────────────────────────────

  describe("list_saved_views", () => {
    it("registers list_saved_views with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_saved_views");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("saved");
    });

    it("lists saved views", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_saved_views")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("listSavedViews");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.views).toHaveLength(1);
      expect(parsed.views[0].name).toBe("My urgent tasks");
    });

    it("lists saved views filtered by creator", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_saved_views")!;
      const result = await tool.handler({ createdBy: "admin" });

      expect(mock.calls[0].method).toBe("listSavedViews");
      expect(mock.calls[0].args).toEqual(["admin"]);
    });

    it("returns error when listSavedViews fails", async () => {
      mock.failWith = "DB error";
      const tool = mockServer.registrations.find((r) => r.name === "list_saved_views")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
    });
  });

  describe("get_saved_view", () => {
    it("registers get_saved_view with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_saved_view");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("saved view");
    });

    it("gets a saved view by ID", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_saved_view")!;
      const result = await tool.handler({ viewId: "view_1" });

      expect(mock.calls[0].method).toBe("getSavedView");
      expect(mock.calls[0].args).toEqual(["view_1"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe("My urgent tasks");
    });

    it("returns error when getSavedView fails", async () => {
      mock.failWith = "Not found";
      const tool = mockServer.registrations.find((r) => r.name === "get_saved_view")!;
      const result = await tool.handler({ viewId: "view_1" });

      expect(result.isError).toBe(true);
    });
  });

  describe("create_saved_view", () => {
    it("registers create_saved_view with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "create_saved_view");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Create");
    });

    it("creates a saved view with filters", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "create_saved_view")!;
      const filters = { status: "pending", priority: "urgent" };
      const result = await tool.handler({ name: "Urgent pending", filters });

      expect(mock.calls[0].method).toBe("createSavedView");
      expect(mock.calls[0].args[0]).toBe("Urgent pending");
      expect(mock.calls[0].args[1]).toEqual(filters);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.view.name).toBe("Urgent pending");
    });

    it("returns error when createSavedView fails", async () => {
      mock.failWith = "DB error";
      const tool = mockServer.registrations.find((r) => r.name === "create_saved_view")!;
      const result = await tool.handler({ name: "Test", filters: {} });

      expect(result.isError).toBe(true);
    });
  });

  describe("update_saved_view", () => {
    it("registers update_saved_view with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "update_saved_view");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Update");
    });

    it("updates a saved view name", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "update_saved_view")!;
      const result = await tool.handler({ viewId: "view_1", name: "Renamed view" });

      expect(mock.calls[0].method).toBe("updateSavedView");
      expect(mock.calls[0].args[0]).toBe("view_1");
      expect(mock.calls[0].args[1].name).toBe("Renamed view");
    });

    it("updates saved view filters", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "update_saved_view")!;
      const newFilters = { status: "done", priority: "low" };
      const result = await tool.handler({ viewId: "view_1", filters: newFilters });

      expect(mock.calls[0].method).toBe("updateSavedView");
      expect(mock.calls[0].args[1].filters).toEqual(newFilters);
    });

    it("returns error when updateSavedView fails", async () => {
      mock.failWith = "Not found";
      const tool = mockServer.registrations.find((r) => r.name === "update_saved_view")!;
      const result = await tool.handler({ viewId: "view_1", name: "Test" });

      expect(result.isError).toBe(true);
    });
  });

  describe("delete_saved_view", () => {
    it("registers delete_saved_view with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_saved_view");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("delete");
    });

    it("deletes a saved view", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "delete_saved_view")!;
      const result = await tool.handler({ viewId: "view_1" });

      expect(mock.calls[0].method).toBe("deleteSavedView");
      expect(mock.calls[0].args).toEqual(["view_1"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("deleted");
    });

    it("returns error when deleteSavedView fails", async () => {
      mock.failWith = "Not found";
      const tool = mockServer.registrations.find((r) => r.name === "delete_saved_view")!;
      const result = await tool.handler({ viewId: "view_1" });

      expect(result.isError).toBe(true);
    });
  });

  describe("reset_stale_tasks", () => {
    it("registers reset_stale_tasks with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "reset_stale_tasks");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("stale");
    });

    it("resets stale tasks with default timeout", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "reset_stale_tasks")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("resetStaleTasks");
      expect(mock.calls[0].args).toEqual([]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.resetCount).toBe(3);
    });

    it("resets stale tasks with custom timeout", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "reset_stale_tasks")!;
      const result = await tool.handler({ timeoutMs: 600000 });

      expect(mock.calls[0].method).toBe("resetStaleTasks");
      expect(mock.calls[0].args).toEqual([600000]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("3 stale");
    });

    it("returns error when resetStaleTasks fails", async () => {
      mock.failWith = "DB error";
      const tool = mockServer.registrations.find((r) => r.name === "reset_stale_tasks")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("DB error");
    });
  });

  describe("cleanup_processed_events", () => {
    it("registers cleanup_processed_events with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "cleanup_processed_events");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("processed");
    });

    it("cleans up events with default retention", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "cleanup_processed_events")!;
      const result = await tool.handler({});

      expect(mock.calls[0].method).toBe("cleanupProcessedEvents");
      expect(mock.calls[0].args).toEqual([]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deletedCount).toBe(15);
    });

    it("cleans up events with custom retention", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "cleanup_processed_events")!;
      const result = await tool.handler({ retentionDays: 30 });

      expect(mock.calls[0].method).toBe("cleanupProcessedEvents");
      expect(mock.calls[0].args).toEqual([30]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("15 old");
    });

    it("returns error when cleanupProcessedEvents fails", async () => {
      mock.failWith = "Disk full";
      const tool = mockServer.registrations.find((r) => r.name === "cleanup_processed_events")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("Disk full");
    });
  });

  // ===== Bulk Update Priority Tests =====

  describe("bulk_update_priority", () => {
    it("registers bulk_update_priority with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "bulk_update_priority");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("priority");
    });

    it("updates priority for multiple tasks", async () => {
      mock.calls.length = 0;
      mock.serverResponse = { updated: 3, errors: [] };
      const tool = mockServer.registrations.find((r) => r.name === "bulk_update_priority")!;
      const result = await tool.handler({ ids: ["task_001", "task_002", "task_003"], priority: "urgent" });

      expect(mock.calls[0].method).toBe("bulkUpdatePriority");
      expect(mock.calls[0].args).toEqual([["task_001", "task_002", "task_003"], "urgent"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated).toBe(3);
      expect(parsed.priority).toBe("urgent");
      expect(parsed.errors).toEqual([]);
    });

    it("returns error when bulkUpdatePriority fails", async () => {
      mock.failWith = "Disk full";
      const tool = mockServer.registrations.find((r) => r.name === "bulk_update_priority")!;
      const result = await tool.handler({ ids: ["task_001"], priority: "high" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("Disk full");
    });
  });

  // ===== Bulk Update Due Date Tests =====

  describe("bulk_update_due_date", () => {
    it("registers bulk_update_due_date with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "bulk_update_due_date");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("due date");
    });

    it("updates due date for multiple tasks", async () => {
      mock.calls.length = 0;
      mock.serverResponse = { updated: 3, errors: [] };
      const tool = mockServer.registrations.find((r) => r.name === "bulk_update_due_date")!;
      const result = await tool.handler({ ids: ["task_001", "task_002", "task_003"], dueDate: "2026-12-31T23:59:59.000Z" });

      expect(mock.calls[0].method).toBe("bulkUpdateDueDate");
      expect(mock.calls[0].args).toEqual([["task_001", "task_002", "task_003"], "2026-12-31T23:59:59.000Z"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated).toBe(3);
      expect(parsed.dueDate).toBe("2026-12-31T23:59:59.000Z");
      expect(parsed.errors).toEqual([]);
    });

    it("clears due date when null is passed", async () => {
      mock.calls.length = 0;
      mock.serverResponse = { updated: 2, errors: [] };
      const tool = mockServer.registrations.find((r) => r.name === "bulk_update_due_date")!;
      const result = await tool.handler({ ids: ["task_001", "task_002"], dueDate: null });

      expect(mock.calls[0].method).toBe("bulkUpdateDueDate");
      expect(mock.calls[0].args).toEqual([["task_001", "task_002"], null]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated).toBe(2);
      expect(parsed.dueDate).toBeNull();
    });

    it("returns error when bulkUpdateDueDate fails", async () => {
      mock.failWith = "Disk full";
      const tool = mockServer.registrations.find((r) => r.name === "bulk_update_due_date")!;
      const result = await tool.handler({ ids: ["task_001"], dueDate: "2026-06-15T00:00:00.000Z" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("Disk full");
    });
  });

  // ===== Bulk Clone Tests =====

  describe("bulk_clone_tasks", () => {
    it("registers bulk_clone_tasks with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "bulk_clone_tasks");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("clone");
    });

    it("clones multiple tasks", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "bulk_clone_tasks")!;
      const result = await tool.handler({ ids: ["task_001", "task_002", "task_003"] });

      expect(mock.calls[0].method).toBe("bulkCloneTasks");
      expect(mock.calls[0].args).toEqual([["task_001", "task_002", "task_003"]]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.cloned).toBe(3);
      expect(parsed.taskIds).toHaveLength(3);
      expect(parsed.errors).toEqual([]);
    });

    it("returns error when bulkCloneTasks fails", async () => {
      mock.failWith = "Database locked";
      const tool = mockServer.registrations.find((r) => r.name === "bulk_clone_tasks")!;
      const result = await tool.handler({ ids: ["task_001"] });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("Database locked");
    });
  });

  // ===== Individual Task Assignment Tests =====

  describe("assign_task", () => {
    it("registers assign_task with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "assign_task");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("assign");
    });

    it("assigns a task to a device", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "assign_task")!;
      const result = await tool.handler({ taskId: "task_001", deviceId: "device_A" });

      expect(mock.calls[0].method).toBe("assignTask");
      expect(mock.calls[0].args).toEqual(["task_001", "device_A"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.assignedDeviceId).toBe("device_A");
      expect(parsed.message).toContain("assigned to device");
    });

    it("returns error when assignTask fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "assign_task")!;
      const result = await tool.handler({ taskId: "task_nonexistent", deviceId: "device_A" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("Task not found");
    });
  });

  describe("unassign_task", () => {
    it("registers unassign_task with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "unassign_task");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("unassign");
    });

    it("unassigns a task from its device", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "unassign_task")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(mock.calls[0].method).toBe("unassignTask");
      expect(mock.calls[0].args).toEqual(["task_001"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("unassigned from device");
    });

    it("returns error when unassignTask fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "unassign_task")!;
      const result = await tool.handler({ taskId: "task_nonexistent" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("Task not found");
    });
  });

  // ===== Time Entry Tests =====

  describe("list_time_entries", () => {
    it("registers list_time_entries with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_time_entries");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("time entries");
    });

    it("lists time entries for a task", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_time_entries")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(mock.calls[0].method).toBe("listTimeEntries");
      expect(mock.calls[0].args).toEqual(["task_001"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.entries).toHaveLength(1);
      expect(parsed.totalMinutes).toBe(30);
    });

    it("returns error when listTimeEntries fails", async () => {
      mock.failWith = "DB error";
      const tool = mockServer.registrations.find((r) => r.name === "list_time_entries")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("DB error");
    });
  });

  describe("log_time_entry", () => {
    it("registers log_time_entry with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "log_time_entry");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("time entry");
    });

    it("logs a time entry with timestamps", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "log_time_entry")!;
      const result = await tool.handler({ taskId: "task_001", startedAt: "2026-06-07T10:00:00Z", endedAt: "2026-06-07T10:45:00Z", description: "Code review" });

      expect(mock.calls[0].method).toBe("createTimeEntry");
      const opts = mock.calls[0].args[1] as Record<string, unknown>;
      expect(opts.startedAt).toBe("2026-06-07T10:00:00Z");
      expect(opts.endedAt).toBe("2026-06-07T10:45:00Z");
      expect(opts.description).toBe("Code review");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.entry).toBeDefined();
    });

    it("logs a time entry with manual duration", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "log_time_entry")!;
      const result = await tool.handler({ taskId: "task_001", durationMinutes: 15, description: "Quick fix" });

      expect(mock.calls[0].method).toBe("createTimeEntry");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.entry).toBeDefined();
    });

    it("returns error when createTimeEntry fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "log_time_entry")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("Task not found");
    });
  });

  describe("start_time_tracking", () => {
    it("registers start_time_tracking with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "start_time_tracking");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("timer");
    });

    it("starts a timer for a task", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "start_time_tracking")!;
      const result = await tool.handler({ taskId: "task_001", description: "Working on feature" });

      expect(mock.calls[0].method).toBe("startTimeEntry");
      expect(mock.calls[0].args).toEqual(["task_001", "Working on feature"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.entry).toBeDefined();
      expect(parsed.message).toContain("Timer started");
    });

    it("returns error when startTimeEntry fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "start_time_tracking")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBe(true);
    });
  });

  describe("stop_time_tracking", () => {
    it("registers stop_time_tracking with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "stop_time_tracking");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Stop");
    });

    it("stops a running timer", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "stop_time_tracking")!;
      const result = await tool.handler({ taskId: "task_001", entryId: "1" });

      expect(mock.calls[0].method).toBe("stopTimeEntry");
      expect(mock.calls[0].args).toEqual(["task_001", "1"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.entry).toBeDefined();
      expect(parsed.message).toContain("30 minutes");
    });

    it("returns error when stopTimeEntry fails", async () => {
      mock.failWith = "Entry not found";
      const tool = mockServer.registrations.find((r) => r.name === "stop_time_tracking")!;
      const result = await tool.handler({ taskId: "task_001", entryId: "999" });

      expect(result.isError).toBe(true);
    });
  });

  describe("delete_time_entry", () => {
    it("registers delete_time_entry with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_time_entry");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("Delete");
    });

    it("deletes a time entry", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "delete_time_entry")!;
      const result = await tool.handler({ taskId: "task_001", entryId: "1" });

      expect(mock.calls[0].method).toBe("deleteTimeEntry");
      expect(mock.calls[0].args).toEqual(["task_001", "1"]);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toBe(true);
    });

    it("returns error when deleteTimeEntry fails", async () => {
      mock.failWith = "Entry not found";
      const tool = mockServer.registrations.find((r) => r.name === "delete_time_entry")!;
      const result = await tool.handler({ taskId: "task_001", entryId: "999" });

      expect(result.isError).toBe(true);
    });
  });

  describe("get_time_tracking_stats", () => {
    it("registers get_time_tracking_stats with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_time_tracking_stats");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("time tracking");
    });

    it("returns time tracking summary", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_time_tracking_stats")!;
      const result = await tool.handler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.totalEntries).toBe(5);
      expect(data.totalMinutes).toBe(120);
      expect(data.byUser).toHaveLength(1);
      expect(data.recentDaily).toHaveLength(1);
    });

    it("calls getTimeTrackingStats on client", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_time_tracking_stats")!;
      await tool.handler({});

      expect(mock.calls[0].method).toBe("getTimeTrackingStats");
    });

    it("returns error when getTimeTrackingStats fails", async () => {
      mock.failWith = "Stats unavailable";
      const tool = mockServer.registrations.find((r) => r.name === "get_time_tracking_stats")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
    });
  });

  describe("get_task_activity", () => {
    it("registers get_task_activity with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_task_activity");
      expect(tool).toBeDefined();
      expect(tool!.description).toContain("activity feed");
      expect(tool!.inputSchema).toHaveProperty("taskId");
      expect(tool!.inputSchema).toHaveProperty("limit");
    });

    it("returns activity feed items", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_task_activity")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.items).toHaveLength(2);
      expect(data.count).toBe(2);
      expect(data.items[0].type).toBe("task.created");
      expect(data.items[1].type).toBe("task.status_changed");
    });

    it("calls getActivityFeed on client with correct args", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_task_activity")!;
      await tool.handler({ taskId: "task_001", limit: 25 });

      expect(mock.calls[0].method).toBe("getActivityFeed");
      expect(mock.calls[0].args[0]).toBe("task_001");
      expect(mock.calls[0].args[1]).toBe(25);
    });

    it("returns error when getActivityFeed fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "get_task_activity")!;
      const result = await tool.handler({ taskId: "nonexistent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Task not found");
    });
  });

  // Phase 58: Task Relationship Tools
  describe("add_task_relationship", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "add_task_relationship");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("taskId");
      expect(tool!.inputSchema).toHaveProperty("relatedTaskId");
      expect(tool!.inputSchema).toHaveProperty("relationshipType");
    });

    it("calls addRelationship with correct args", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "add_task_relationship")!;
      const result = await tool.handler({ taskId: "task_001", relatedTaskId: "task_002", relationshipType: "blocks" });

      expect(result.isError).toBeUndefined();
      expect(mock.calls[0].method).toBe("addRelationship");
      expect(mock.calls[0].args).toEqual(["task_001", "task_002", "blocks"]);
      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain("blocks");
    });

    it("returns error when addRelationship fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "add_task_relationship")!;
      const result = await tool.handler({ taskId: "nonexistent", relatedTaskId: "task_002", relationshipType: "relates_to" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Task not found");
    });
  });

  describe("remove_task_relationship", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "remove_task_relationship");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("taskId");
      expect(tool!.inputSchema).toHaveProperty("relatedTaskId");
    });

    it("calls removeRelationship with correct args", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "remove_task_relationship")!;
      const result = await tool.handler({ taskId: "task_001", relatedTaskId: "task_002", relationshipType: "duplicates" });

      expect(result.isError).toBeUndefined();
      expect(mock.calls[0].method).toBe("removeRelationship");
      expect(mock.calls[0].args).toEqual(["task_001", "task_002", "duplicates"]);
    });

    it("returns error when removeRelationship fails", async () => {
      mock.failWith = "Internal error";
      const tool = mockServer.registrations.find((r) => r.name === "remove_task_relationship")!;
      const result = await tool.handler({ taskId: "task_001", relatedTaskId: "task_002" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Internal error");
    });
  });

  describe("list_task_relationships", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_task_relationships");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("taskId");
    });

    it("returns relationships from client", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_task_relationships")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.relationships).toHaveLength(1);
      expect(data.relationships[0].relationshipType).toBe("blocks");
      expect(mock.calls[0].method).toBe("listRelationships");
    });

    it("returns error when listRelationships fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "list_task_relationships")!;
      const result = await tool.handler({ taskId: "nonexistent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Task not found");
    });
  });

  describe("list_cycles", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_cycles");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("cycle");
    });

    it("returns cycles from client", async () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_cycles")!;
      const result = await tool.handler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.cycles).toHaveLength(1);
      expect(data.cycles[0].name).toBe("Sprint 1");
      expect(mock.calls[0].method).toBe("listCycles");
    });

    it("passes status filter to client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_cycles")!;
      await tool.handler({ status: "completed" });

      expect(mock.calls[0].args[0]).toBe("completed");
    });

    it("returns error when listCycles fails", async () => {
      mock.failWith = "DB error";
      const tool = mockServer.registrations.find((r) => r.name === "list_cycles")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("DB error");
    });
  });

  describe("get_cycle", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_cycle");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("cycleId");
    });

    it("returns cycle details from client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_cycle")!;
      const result = await tool.handler({ cycleId: "cycle_001" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.id).toBe("cycle_001");
      expect(data.name).toBe("Sprint 1");
      expect(mock.calls[0].method).toBe("getCycle");
    });

    it("returns error when getCycle fails", async () => {
      mock.failWith = "Cycle not found";
      const tool = mockServer.registrations.find((r) => r.name === "get_cycle")!;
      const result = await tool.handler({ cycleId: "nonexistent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Cycle not found");
    });
  });

  describe("create_cycle", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "create_cycle");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("name");
      expect(tool!.inputSchema).toHaveProperty("startDate");
      expect(tool!.inputSchema).toHaveProperty("endDate");
    });

    it("creates cycle via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "create_cycle")!;
      const result = await tool.handler({ name: "Sprint 2", startDate: "2026-06-15", endDate: "2026-06-28", description: "Goals" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.cycle.name).toBe("Sprint 2");
      expect(mock.calls[0].method).toBe("createCycle");
      expect(mock.calls[0].args[0]).toEqual({ name: "Sprint 2", startDate: "2026-06-15", endDate: "2026-06-28", description: "Goals" });
    });

    it("returns error when createCycle fails", async () => {
      mock.failWith = "Invalid dates";
      const tool = mockServer.registrations.find((r) => r.name === "create_cycle")!;
      const result = await tool.handler({ name: "Sprint 3", startDate: "2026-06-15", endDate: "2026-06-28" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Invalid dates");
    });
  });

  describe("update_cycle", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "update_cycle");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("cycleId");
    });

    it("updates cycle via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "update_cycle")!;
      const result = await tool.handler({ cycleId: "cycle_001", name: "Sprint 1 Updated", status: "completed" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.cycle.name).toBe("Sprint 1 Updated");
      expect(mock.calls[0].method).toBe("updateCycle");
      expect(mock.calls[0].args[1]).toEqual({ name: "Sprint 1 Updated", status: "completed" });
    });

    it("returns error when updateCycle fails", async () => {
      mock.failWith = "Cycle not found";
      const tool = mockServer.registrations.find((r) => r.name === "update_cycle")!;
      const result = await tool.handler({ cycleId: "nonexistent", name: "Updated" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Cycle not found");
    });
  });

  describe("delete_cycle", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_cycle");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("cycleId");
    });

    it("deletes cycle via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "delete_cycle")!;
      const result = await tool.handler({ cycleId: "cycle_001" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.deleted).toBe(true);
      expect(mock.calls[0].method).toBe("deleteCycle");
    });

    it("returns error when deleteCycle fails", async () => {
      mock.failWith = "Cycle not found";
      const tool = mockServer.registrations.find((r) => r.name === "delete_cycle")!;
      const result = await tool.handler({ cycleId: "nonexistent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Cycle not found");
    });
  });

  describe("add_task_to_cycle", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "add_task_to_cycle");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("taskId");
      expect(tool!.inputSchema).toHaveProperty("cycleId");
    });

    it("adds task to cycle via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "add_task_to_cycle")!;
      const result = await tool.handler({ taskId: "task_001", cycleId: "cycle_001" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.task.id).toBe("task_001");
      expect(data.task.cycleId).toBe("cycle_001");
      expect(mock.calls[0].method).toBe("addTaskToCycle");
    });

    it("returns error when addTaskToCycle fails", async () => {
      mock.failWith = "Task not found";
      const tool = mockServer.registrations.find((r) => r.name === "add_task_to_cycle")!;
      const result = await tool.handler({ taskId: "nonexistent", cycleId: "cycle_001" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Task not found");
    });
  });

  describe("remove_task_from_cycle", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "remove_task_from_cycle");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("taskId");
    });

    it("removes task from cycle via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "remove_task_from_cycle")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.task.id).toBe("task_001");
      expect(mock.calls[0].method).toBe("removeTaskFromCycle");
    });

    it("returns error when removeTaskFromCycle fails", async () => {
      mock.failWith = "Task not in any cycle";
      const tool = mockServer.registrations.find((r) => r.name === "remove_task_from_cycle")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Task not in any cycle");
    });
  });

  describe("list_cycle_tasks", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_cycle_tasks");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("cycleId");
    });

    it("returns tasks in cycle from client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_cycle_tasks")!;
      const result = await tool.handler({ cycleId: "cycle_001" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0].cycleId).toBe("cycle_001");
      expect(mock.calls[0].method).toBe("listCycleTasks");
    });

    it("returns error when listCycleTasks fails", async () => {
      mock.failWith = "Cycle not found";
      const tool = mockServer.registrations.find((r) => r.name === "list_cycle_tasks")!;
      const result = await tool.handler({ cycleId: "nonexistent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Cycle not found");
    });
  });

  describe("get_cycle_progress", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_cycle_progress");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("cycleId");
    });

    it("returns burndown data from client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_cycle_progress")!;
      const result = await tool.handler({ cycleId: "cycle_001" });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.progress.cycleId).toBe("cycle_001");
      expect(data.progress.totalTasks).toBe(10);
      expect(data.progress.completedTasks).toBe(4);
      expect(data.progress.completionPercent).toBe(40);
      expect(data.progress.velocityPerDay).toBe(0.6);
      expect(data.progress.burndown).toHaveLength(2);
      expect(data.progress.statusBreakdown.done).toBe(4);
      expect(data.progress.priorityBreakdown.urgent).toBe(1);
      expect(mock.calls[0].method).toBe("getCycleProgress");
    });

    it("returns error when getCycleProgress fails", async () => {
      mock.failWith = "Cycle not found";
      const tool = mockServer.registrations.find((r) => r.name === "get_cycle_progress")!;
      const result = await tool.handler({ cycleId: "nonexistent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Cycle not found");
    });
  });

  // --- get_global_activity tool tests ---
  describe("get_global_activity", () => {
    it("registers get_global_activity tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_global_activity");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("limit");
    });

    it("returns activity items from client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_global_activity")!;
      const result = await tool.handler({ limit: 10 });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.items).toHaveLength(1);
      expect(data.count).toBe(1);
      expect(data.items[0].type).toBe("task.created");
      expect(data.items[0].summary).toContain("test task");
      expect(data.message).toContain("1 recent activity");
      expect(mock.calls[0].method).toBe("getGlobalActivity");
      expect(mock.calls[0].args[0]).toBe(10);
    });

    it("returns error when client fails", async () => {
      mock.failWith = "Connection refused";
      const tool = mockServer.registrations.find((r) => r.name === "get_global_activity")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Connection refused");
    });
  });

  describe("reopen_task", () => {
    it("registers reopen_task tool", () => {
      const tool = mockServer.registrations.find((r) => r.name === "reopen_task");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("reopen");
    });

    it("reopens task via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "reopen_task")!;
      const result = await tool.handler({ taskId: "task_123" });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.status).toBe("pending");
      expect(parsed.task.reopenedCount).toBe(1);
      expect(mock.calls[0].method).toBe("reopenTask");
      expect(mock.calls[0].args[0]).toBe("task_123");
    });

    it("returns error when reopenTask fails", async () => {
      mock.failWith = "Can only reopen done or failed tasks";
      const tool = mockServer.registrations.find((r) => r.name === "reopen_task")!;
      const result = await tool.handler({ taskId: "task_bad" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Can only reopen");
    });
  });

  describe("list_modules", () => {
    it("registers the tool with correct description", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_modules");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("list");
      expect(tool!.description.toLowerCase()).toContain("module");
    });

    it("lists modules via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_modules")!;
      const result = await tool.handler({});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.modules).toHaveLength(1);
      expect(parsed.modules[0].name).toBe("Auth System");
      expect(mock.calls[0].method).toBe("listModules");
    });

    it("returns error when listModules fails", async () => {
      mock.failWith = "Database error";
      const tool = mockServer.registrations.find((r) => r.name === "list_modules")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Database error");
    });
  });

  describe("get_module", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "get_module");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("moduleId");
    });

    it("gets module via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "get_module")!;
      const result = await tool.handler({ moduleId: "module_001" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe("Auth System");
      expect(parsed.completionPercent).toBe(40);
      expect(mock.calls[0].method).toBe("getModule");
    });
  });

  describe("create_module", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "create_module");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("name");
    });

    it("creates module via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "create_module")!;
      const result = await tool.handler({ name: "Payment Flow" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.module.name).toBe("Payment Flow");
      expect(mock.calls[0].method).toBe("createModule");
    });
  });

  describe("update_module", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "update_module");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("moduleId");
    });

    it("updates module via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "update_module")!;
      const result = await tool.handler({ moduleId: "module_001", status: "completed" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.module.status).toBe("completed");
      expect(mock.calls[0].method).toBe("updateModule");
    });
  });

  describe("delete_module", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "delete_module");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("moduleId");
    });

    it("deletes module via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "delete_module")!;
      const result = await tool.handler({ moduleId: "module_001" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mock.calls[0].method).toBe("deleteModule");
    });
  });

  describe("add_task_to_module", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "add_task_to_module");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("taskId");
      expect(tool!.inputSchema).toHaveProperty("moduleId");
    });

    it("adds task to module via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "add_task_to_module")!;
      const result = await tool.handler({ taskId: "task_001", moduleId: "module_001" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.id).toBe("task_001");
      expect(parsed.task.moduleId).toBe("module_001");
      expect(mock.calls[0].method).toBe("addTaskToModule");
    });
  });

  describe("remove_task_from_module", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "remove_task_from_module");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("taskId");
    });

    it("removes task from module via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "remove_task_from_module")!;
      const result = await tool.handler({ taskId: "task_001" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.task.id).toBe("task_001");
      expect(mock.calls[0].method).toBe("removeTaskFromModule");
    });
  });

  describe("list_module_tasks", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "list_module_tasks");
      expect(tool).toBeDefined();
      expect(tool!.inputSchema).toHaveProperty("moduleId");
    });
    it("lists module tasks via client", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "list_module_tasks")!;
      const result = await tool.handler({ moduleId: "module_001" });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].moduleId).toBe("module_001");
      expect(mock.calls[0].method).toBe("listModuleTasks");
    });
  });
  describe("export_tasks_csv", () => {
    it("registers the tool with correct schema", () => {
      const tool = mockServer.registrations.find((r) => r.name === "export_tasks_csv");
      expect(tool).toBeDefined();
      expect(tool!.description.toLowerCase()).toContain("csv");
    });

    it("exports CSV with no filters", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "export_tasks_csv")!;
      const result = await tool.handler({});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.csv).toContain("id,source");
      expect(parsed.lineCount).toBe(1);
      expect(mock.calls[0].method).toBe("exportTasksCsv");
    });

    it("exports CSV with status filter", async () => {
      mock.calls.length = 0;
      const tool = mockServer.registrations.find((r) => r.name === "export_tasks_csv")!;
      const result = await tool.handler({ status: "pending" });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.csv).toBeDefined();
      expect(mock.calls[0].args[0].status).toBe("pending");
    });

    it("handles errors gracefully", async () => {
      mock.calls.length = 0;
      mock.failWith = "Network error";
      const tool = mockServer.registrations.find((r) => r.name === "export_tasks_csv")!;
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Network error");
      mock.failWith = undefined;
    });
  });
});
