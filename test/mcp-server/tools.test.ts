import { describe, it, expect, beforeEach } from "vitest";
import { registerMcpTools } from "../../src/mcp-server/tools.js";
import type { TaskApiClient } from "../../src/mcp-server/client.js";
import type { Task, TaskStatus, TaskComment, ScheduledTask, ScheduleFrequency } from "../../src/shared/types.js";

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

    async listTasks(status?: TaskStatus, limit?: number): Promise<Task[]> {
      calls.push({ method: "listTasks", args: [status, limit] });
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
      from?: string;
      to?: string;
      limit?: number;
      deviceId?: string;
      tags?: string[];
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

    async registerDevice(name: string, capabilities?: string): Promise<{ id: string; token: string }> {
      calls.push({ method: "registerDevice", args: [name, capabilities] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { id: "dev_001", token: "tok_test" };
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

    async bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
      calls.push({ method: "bulkDelete", args: [ids] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { deleted: ids.length, errors: [] };
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

    async importTasks(data: Record<string, unknown>, mode?: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
      calls.push({ method: "importTasks", args: [data, mode] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { imported: 0, skipped: 0, errors: [] };
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

    async checkSlaBreaches(): Promise<{ warnings: number; breaches: number }> {
      calls.push({ method: "checkSlaBreaches", args: [] });
      if (mock.failWith) throw new Error(mock.failWith);
      return { warnings: 1, breaches: 0 };
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
    it("registers all 34 tools", () => {
      expect(mockServer.registrations).toHaveLength(43);
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
  });
});
