import type { DatabaseSync } from "node:sqlite";
import type {
  Task,
  TaskTemplate,
  ScheduledTask,
} from "../../../shared/types.js";
import {
  rowToTask,
  rowToTemplate,
  rowToScheduledTask,
  rowToCycle,
  rowToModule,
  applyTemplateVariables,
} from "./db-helpers.js";

export function createPlanningRepo(db: DatabaseSync) {
  const selectTaskById = db.prepare(`SELECT * FROM tasks WHERE id = ?`);

  return {
    // ── Task Templates ──────────────────────────────────────────────

    async createTemplate(
      template: Omit<TaskTemplate, "id" | "createdAt" | "updatedAt">,
    ): Promise<TaskTemplate> {
      const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const tagsJson =
        template.tags && template.tags.length > 0
          ? JSON.stringify(template.tags)
          : null;
      const variablesJson =
        template.variables && Object.keys(template.variables).length > 0
          ? JSON.stringify(template.variables)
          : null;

      db.prepare(`
        INSERT INTO task_templates (id, name, description, command_text, priority, tags, assigned_device_id, due_date_offset_ms, reminder_offset_ms, created_by, created_at, updated_at, variables)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        template.name,
        template.description ?? null,
        template.commandText,
        template.priority ?? "normal",
        tagsJson,
        template.assignedDeviceId ?? null,
        template.dueDateOffsetMs ?? null,
        template.reminderOffsetMs ?? null,
        template.createdBy,
        now,
        now,
        variablesJson,
      );

      const row = db.prepare(`SELECT * FROM task_templates WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToTemplate(row);
    },

    async listTemplates(): Promise<TaskTemplate[]> {
      const rows = db.prepare(`SELECT * FROM task_templates ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
      return rows.map(rowToTemplate);
    },

    async getTemplate(id: string): Promise<TaskTemplate | undefined> {
      const row = db.prepare(`SELECT * FROM task_templates WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      return row ? rowToTemplate(row) : undefined;
    },

    async updateTemplate(
      id: string,
      updates: Partial<Pick<TaskTemplate, "name" | "description" | "commandText" | "priority" | "tags" | "assignedDeviceId" | "dueDateOffsetMs" | "reminderOffsetMs" | "variables">>,
    ): Promise<TaskTemplate> {
      const existing = db.prepare(`SELECT * FROM task_templates WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        throw new Error(`Template not found: ${id}`);
      }

      const now = new Date().toISOString();
      const setClauses: string[] = [];
      const params: (string | number | null)[] = [];

      if (updates.name !== undefined) { setClauses.push("name = ?"); params.push(updates.name); }
      if (updates.description !== undefined) { setClauses.push("description = ?"); params.push(updates.description ?? null); }
      if (updates.commandText !== undefined) { setClauses.push("command_text = ?"); params.push(updates.commandText); }
      if (updates.priority !== undefined) { setClauses.push("priority = ?"); params.push(updates.priority); }
      if (updates.tags !== undefined) {
        setClauses.push("tags = ?");
        params.push(updates.tags && updates.tags.length > 0 ? JSON.stringify(updates.tags) : null);
      }
      if (updates.assignedDeviceId !== undefined) { setClauses.push("assigned_device_id = ?"); params.push(updates.assignedDeviceId ?? null); }
      if (updates.dueDateOffsetMs !== undefined) { setClauses.push("due_date_offset_ms = ?"); params.push(updates.dueDateOffsetMs ?? null); }
      if (updates.reminderOffsetMs !== undefined) { setClauses.push("reminder_offset_ms = ?"); params.push(updates.reminderOffsetMs ?? null); }
      if (updates.variables !== undefined) {
        setClauses.push("variables = ?");
        params.push(updates.variables && Object.keys(updates.variables).length > 0 ? JSON.stringify(updates.variables) : null);
      }

      if (setClauses.length === 0) {
        return rowToTemplate(existing);
      }

      setClauses.push("updated_at = ?");
      params.push(now);
      params.push(id);

      db.prepare(`UPDATE task_templates SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

      const row = db.prepare(`SELECT * FROM task_templates WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToTemplate(row);
    },

    async deleteTemplate(id: string): Promise<boolean> {
      const result = db.prepare(`DELETE FROM task_templates WHERE id = ?`).run(id);
      return Number(result.changes) > 0;
    },

    async incrementTemplateUsage(id: string): Promise<void> {
      db.prepare(`UPDATE task_templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        id,
      );
    },

    async getTemplateUsageStats(): Promise<{ templateId: string; name: string; usageCount: number }[]> {
      const rows = db.prepare(
        `SELECT id as templateId, name, usage_count as usageCount FROM task_templates ORDER BY usage_count DESC`,
      ).all() as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        templateId: r["templateId"] as string,
        name: r["name"] as string,
        usageCount: Number(r["usageCount"] ?? 0),
      }));
    },

    // ── Scheduled Tasks ─────────────────────────────────────────────

    async createScheduledTask(
      data: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt">,
    ): Promise<ScheduledTask> {
      const id = `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const tagsJson =
        data.tags && data.tags.length > 0
          ? JSON.stringify(data.tags)
          : null;

      db.prepare(`
        INSERT INTO scheduled_tasks (id, template_id, command_text, frequency, priority, tags, assigned_device_id, next_run_at, last_run_at, last_task_id, enabled, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.templateId ?? null,
        data.commandText,
        data.frequency,
        data.priority ?? "normal",
        tagsJson,
        data.assignedDeviceId ?? null,
        data.nextRunAt,
        data.lastRunAt ?? null,
        data.lastTaskId ?? null,
        data.enabled ? 1 : 0,
        data.createdBy,
        now,
        now,
      );

      const row = db.prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToScheduledTask(row);
    },

    async listScheduledTasks(): Promise<ScheduledTask[]> {
      const rows = db.prepare(
        `SELECT * FROM scheduled_tasks ORDER BY next_run_at ASC`,
      ).all() as Array<Record<string, unknown>>;
      return rows.map(rowToScheduledTask);
    },

    async getScheduledTask(id: string): Promise<ScheduledTask | undefined> {
      const row = db.prepare(
        `SELECT * FROM scheduled_tasks WHERE id = ?`,
      ).get(id) as Record<string, unknown> | undefined;
      return row ? rowToScheduledTask(row) : undefined;
    },

    async updateScheduledTask(
      id: string,
      updates: Partial<Pick<ScheduledTask, "commandText" | "frequency" | "priority" | "tags" | "assignedDeviceId" | "nextRunAt" | "enabled" | "templateId">>,
    ): Promise<ScheduledTask> {
      const existing = db.prepare(
        `SELECT * FROM scheduled_tasks WHERE id = ?`,
      ).get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        throw new Error(`Scheduled task not found: ${id}`);
      }

      const now = new Date().toISOString();
      const setClauses: string[] = [];
      const params: (string | number | null)[] = [];

      if (updates.commandText !== undefined) { setClauses.push("command_text = ?"); params.push(updates.commandText); }
      if (updates.frequency !== undefined) { setClauses.push("frequency = ?"); params.push(updates.frequency); }
      if (updates.priority !== undefined) { setClauses.push("priority = ?"); params.push(updates.priority); }
      if (updates.tags !== undefined) {
        setClauses.push("tags = ?");
        params.push(updates.tags && updates.tags.length > 0 ? JSON.stringify(updates.tags) : null);
      }
      if (updates.assignedDeviceId !== undefined) { setClauses.push("assigned_device_id = ?"); params.push(updates.assignedDeviceId ?? null); }
      if (updates.nextRunAt !== undefined) { setClauses.push("next_run_at = ?"); params.push(updates.nextRunAt); }
      if (updates.enabled !== undefined) { setClauses.push("enabled = ?"); params.push(updates.enabled ? 1 : 0); }
      if (updates.templateId !== undefined) { setClauses.push("template_id = ?"); params.push(updates.templateId ?? null); }

      if (setClauses.length === 0) {
        return rowToScheduledTask(existing);
      }

      setClauses.push("updated_at = ?");
      params.push(now);
      params.push(id);

      db.prepare(`UPDATE scheduled_tasks SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

      const row = db.prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToScheduledTask(row);
    },

    async deleteScheduledTask(id: string): Promise<boolean> {
      const result = db.prepare(`DELETE FROM scheduled_tasks WHERE id = ?`).run(id);
      return Number(result.changes) > 0;
    },

    async getDueScheduledTasks(now: string): Promise<ScheduledTask[]> {
      const rows = db.prepare(`
        SELECT * FROM scheduled_tasks
        WHERE enabled = 1 AND next_run_at <= ?
        ORDER BY next_run_at ASC
      `).all(now) as Array<Record<string, unknown>>;
      return rows.map(rowToScheduledTask);
    },

    async markScheduledTaskRun(id: string, nextRunAt: string, taskId: string): Promise<void> {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE scheduled_tasks
        SET last_run_at = ?, last_task_id = ?, next_run_at = ?, updated_at = ?
        WHERE id = ?
      `).run(now, taskId, nextRunAt, now, id);
    },


    // Phase 63: Cycle (sprint) methods
    async createCycle(data: { name: string; description?: string; startDate: string; endDate: string; createdBy: string }): Promise<import("../../../shared/types.js").Cycle> {
      const id = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO cycles (id, name, description, start_date, end_date, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.name, data.description ?? null, data.startDate, data.endDate, "upcoming", data.createdBy, now, now);
      const row = db.prepare("SELECT * FROM cycles WHERE id = ?").get(id) as Record<string, unknown>;
      return rowToCycle(row);
    },

    async listCycles(status?: import("../../../shared/types.js").CycleStatus): Promise<import("../../../shared/types.js").CycleSummary[]> {
      let query = "SELECT * FROM cycles";
      const params: (string | number | null)[] = [];
      if (status) {
        query += " WHERE status = ?";
        params.push(status);
      }
      query += " ORDER BY start_date DESC";
      const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
      return rows.map(row => {
        const cycle = rowToCycle(row);
        const counts = db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('done', 'failed') THEN 1 ELSE 0 END) as completed
          FROM tasks WHERE cycle_id = ?
        `).get(cycle.id) as Record<string, unknown>;
        return {
          ...cycle,
          completedTasks: Number(counts["completed"]) || 0,
          totalTasks: Number(counts["total"]) || 0,
        };
      });
    },

    async getCycle(id: string): Promise<import("../../../shared/types.js").CycleSummary | undefined> {
      const row = db.prepare("SELECT * FROM cycles WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      const cycle = rowToCycle(row);
      const counts = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('done', 'failed') THEN 1 ELSE 0 END) as completed
        FROM tasks WHERE cycle_id = ?
      `).get(cycle.id) as Record<string, unknown>;
      return {
        ...cycle,
        completedTasks: Number(counts["completed"]) || 0,
        totalTasks: Number(counts["total"]) || 0,
      };
    },

    async updateCycle(id: string, updates: Partial<Pick<import("../../../shared/types.js").Cycle, "name" | "description" | "startDate" | "endDate" | "status">>): Promise<import("../../../shared/types.js").Cycle> {
      const sets: string[] = [];
      const params: (string | number | null)[] = [];
      if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
      if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description); }
      if (updates.startDate !== undefined) { sets.push("start_date = ?"); params.push(updates.startDate); }
      if (updates.endDate !== undefined) { sets.push("end_date = ?"); params.push(updates.endDate); }
      if (updates.status !== undefined) { sets.push("status = ?"); params.push(updates.status); }
      if (sets.length === 0) throw new Error("No updates provided");
      const now = new Date().toISOString();
      sets.push("updated_at = ?");
      params.push(now);
      params.push(id);
      Number(db.prepare(`UPDATE cycles SET ${sets.join(", ")} WHERE id = ?`).run(...params).changes);
      const row = db.prepare("SELECT * FROM cycles WHERE id = ?").get(id) as Record<string, unknown>;
      if (!row) throw new Error(`Cycle not found: ${id}`);
      return rowToCycle(row);
    },

    async deleteCycle(id: string): Promise<boolean> {
      // Remove cycle_id from tasks before deleting the cycle
      db.prepare("UPDATE tasks SET cycle_id = NULL, updated_at = ? WHERE cycle_id = ?").run(new Date().toISOString(), id);
      const result = db.prepare("DELETE FROM cycles WHERE id = ?").run(id);
      return Number(result.changes) > 0;
    },

    async addTaskToCycle(taskId: string, cycleId: string): Promise<import("../../../shared/types.js").Task> {
      // Verify cycle exists
      const cycle = db.prepare("SELECT id FROM cycles WHERE id = ?").get(cycleId);
      if (!cycle) throw new Error(`Cycle not found: ${cycleId}`);
      const now = new Date().toISOString();
      Number(db.prepare("UPDATE tasks SET cycle_id = ?, updated_at = ? WHERE id = ?").run(cycleId, now, taskId).changes);
      const row = selectTaskById.get(taskId) as Record<string, unknown>;
      if (!row) throw new Error(`Task not found: ${taskId}`);
      return rowToTask(row);
    },

    async removeTaskFromCycle(taskId: string): Promise<import("../../../shared/types.js").Task> {
      const now = new Date().toISOString();
      Number(db.prepare("UPDATE tasks SET cycle_id = NULL, updated_at = ? WHERE id = ?").run(now, taskId).changes);
      const row = selectTaskById.get(taskId) as Record<string, unknown>;
      if (!row) throw new Error(`Task not found: ${taskId}`);
      return rowToTask(row);
    },

    async listCycleTasks(cycleId: string): Promise<import("../../../shared/types.js").Task[]> {
      const rows = db.prepare(`
        SELECT * FROM tasks WHERE cycle_id = ?
        ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, created_at DESC
      `).all(cycleId) as Array<Record<string, unknown>>;
      return rows.map(rowToTask);
    },

    async getCycleProgress(cycleId: string): Promise<import("../../../shared/types.js").CycleProgress> {
      const cycleRow = db.prepare("SELECT * FROM cycles WHERE id = ?").get(cycleId) as Record<string, unknown> | undefined;
      if (!cycleRow) throw new Error(`Cycle not found: ${cycleId}`);

      const cycle = rowToCycle(cycleRow);
      const startDate = new Date(cycle.startDate);
      const endDate = new Date(cycle.endDate);

      // Get all tasks in this cycle
      const taskRows = db.prepare("SELECT * FROM tasks WHERE cycle_id = ?").all(cycleId) as Array<Record<string, unknown>>;
      const tasks = taskRows.map(rowToTask);
      const totalTasks = tasks.length;

      // Status breakdown
      const statusBreakdown = { pending: 0, picked: 0, running: 0, done: 0, failed: 0 };
      const priorityBreakdown = { low: 0, normal: 0, high: 0, urgent: 0 };
      let totalEstimatedMinutes = 0;
      let totalActualMinutes = 0;

      for (const task of tasks) {
        statusBreakdown[task.status as keyof typeof statusBreakdown]++;
        priorityBreakdown[task.priority as keyof typeof priorityBreakdown]++;
        totalEstimatedMinutes += task.estimatedMinutes ?? 0;
        totalActualMinutes += task.actualMinutes ?? 0;
      }

      const completedTasks = statusBreakdown.done;
      const failedTasks = statusBreakdown.failed;
      const inProgressTasks = statusBreakdown.picked + statusBreakdown.running;
      const pendingTasks = statusBreakdown.pending;
      const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // Compute velocity (tasks completed per day)
      const now = new Date();
      const elapsedDays = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const velocityPerDay = completedTasks > 0 ? Math.round((completedTasks / elapsedDays) * 10) / 10 : 0;
      const remainingTasks = totalTasks - completedTasks - failedTasks;
      const estimatedDaysRemaining = velocityPerDay > 0 ? Math.round((remainingTasks / velocityPerDay) * 10) / 10 : -1;

      // Build burndown data
      const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const burndown: import("../../../shared/types.js").BurndownDataPoint[] = [];

      // Get completion dates for tasks in this cycle
      const completedDates: Record<string, number> = {};
      for (const task of tasks) {
        if (task.status === "done" && task.completedAt) {
          const dateStr = task.completedAt.slice(0, 10);
          completedDates[dateStr] = (completedDates[dateStr] || 0) + 1;
        }
      }

      let cumulativeCompleted = 0;
      for (let i = 0; i <= totalDays; i++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(dayDate.getDate() + i);
        const dateStr = dayDate.toISOString().slice(0, 10);

        // Count tasks completed on this day
        cumulativeCompleted += completedDates[dateStr] ?? 0;
        const remaining = totalTasks - cumulativeCompleted;
        const ideal = Math.round(totalTasks * (1 - i / totalDays));

        burndown.push({ date: dateStr, remaining: Math.max(0, remaining), completed: cumulativeCompleted, ideal: Math.max(0, ideal) });
      }

      return {
        cycleId: cycle.id,
        cycleName: cycle.name,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        status: cycle.status,
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        failedTasks,
        completionPercent,
        velocityPerDay,
        estimatedDaysRemaining,
        burndown,
        statusBreakdown,
        priorityBreakdown,
        totalEstimatedMinutes,
        totalActualMinutes,
      };
    },

    // Phase 70: Module (epic) methods
    async createModule(data: { name: string; description?: string; startDate?: string; endDate?: string; createdBy: string }): Promise<import("../../../shared/types.js").Module> {
      const id = `module_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO modules (id, name, description, status, start_date, end_date, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 'planned', ?, ?, ?, ?, ?)
      `).run(id, data.name, data.description ?? null, data.startDate ?? null, data.endDate ?? null, data.createdBy, now, now);
      const row = db.prepare("SELECT * FROM modules WHERE id = ?").get(id) as Record<string, unknown>;
      return rowToModule(row);
    },

    async listModules(status?: import("../../../shared/types.js").ModuleStatus): Promise<import("../../../shared/types.js").ModuleWithProgress[]> {
      const rows = status
        ? db.prepare("SELECT * FROM modules WHERE status = ? ORDER BY created_at DESC").all(status) as Array<Record<string, unknown>>
        : db.prepare("SELECT * FROM modules ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
      return rows.map(row => {
        const module = rowToModule(row);
        const counts = db.prepare(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed
          FROM tasks WHERE module_id = ?
        `).get(module.id) as Record<string, unknown>;
        const total = Number(counts["total"] ?? 0);
        const completed = Number(counts["completed"] ?? 0);
        return {
          ...module,
          totalTasks: total,
          completedTasks: completed,
          completionPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        } as import("../../../shared/types.js").ModuleWithProgress;
      });
    },

    async getModule(id: string): Promise<import("../../../shared/types.js").ModuleWithProgress | undefined> {
      const row = db.prepare("SELECT * FROM modules WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      const module = rowToModule(row);
      const counts = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed
        FROM tasks WHERE module_id = ?
      `).get(id) as Record<string, unknown>;
      const total = Number(counts["total"] ?? 0);
      const completed = Number(counts["completed"] ?? 0);
      return {
        ...module,
        totalTasks: total,
        completedTasks: completed,
        completionPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    },

    async updateModule(id: string, updates: Partial<Pick<import("../../../shared/types.js").Module, "name" | "description" | "status" | "startDate" | "endDate" | "targetCompletionPercent">>): Promise<import("../../../shared/types.js").Module> {
      const existing = db.prepare("SELECT * FROM modules WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      if (!existing) throw new Error("Module not found");
      const now = new Date().toISOString();
      const sets: string[] = [];
      const params: (string | number | null)[] = [];
      if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
      if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description ?? null); }
      if (updates.status !== undefined) { sets.push("status = ?"); params.push(updates.status); }
      if (updates.startDate !== undefined) { sets.push("start_date = ?"); params.push(updates.startDate ?? null); }
      if (updates.endDate !== undefined) { sets.push("end_date = ?"); params.push(updates.endDate ?? null); }
      if (updates.targetCompletionPercent !== undefined) { sets.push("target_completion_percent = ?"); params.push(updates.targetCompletionPercent ?? null); }
      sets.push("updated_at = ?");
      params.push(now);
      params.push(id);
      db.prepare(`UPDATE modules SET ${sets.join(", ")} WHERE id = ?`).run(...params);
      const row = db.prepare("SELECT * FROM modules WHERE id = ?").get(id) as Record<string, unknown>;
      return rowToModule(row);
    },

    async deleteModule(id: string): Promise<boolean> {
      // Remove module_id from all tasks in this module
      db.prepare("UPDATE tasks SET module_id = NULL WHERE module_id = ?").run(id);
      const result = db.prepare("DELETE FROM modules WHERE id = ?").run(id);
      return Number(result.changes) > 0;
    },

    async addTaskToModule(taskId: string, moduleId: string): Promise<import("../../../shared/types.js").Task> {
      const taskRow = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
      if (!taskRow) throw new Error("Task not found");
      const moduleRow = db.prepare("SELECT * FROM modules WHERE id = ?").get(moduleId) as Record<string, unknown> | undefined;
      if (!moduleRow) throw new Error("Module not found");
      const now = new Date().toISOString();
      db.prepare("UPDATE tasks SET module_id = ?, updated_at = ? WHERE id = ?").run(moduleId, now, taskId);
      const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown>;
      return rowToTask(row);
    },

    async removeTaskFromModule(taskId: string): Promise<import("../../../shared/types.js").Task> {
      const taskRow = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
      if (!taskRow) throw new Error("Task not found");
      const now = new Date().toISOString();
      db.prepare("UPDATE tasks SET module_id = NULL, updated_at = ? WHERE id = ?").run(now, taskId);
      const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown>;
      return rowToTask(row);
    },

    async listModuleTasks(moduleId: string): Promise<import("../../../shared/types.js").Task[]> {
      const rows = db.prepare("SELECT * FROM tasks WHERE module_id = ? AND archived_at IS NULL ORDER BY created_at DESC").all(moduleId) as Array<Record<string, unknown>>;
      return rows.map(rowToTask);
    },

  };
}
