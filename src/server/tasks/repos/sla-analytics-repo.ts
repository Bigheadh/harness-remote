import type { DatabaseSync } from "node:sqlite";
import type {
  Task,
  TaskStatus,
  TaskPriority,
  SlaPolicy,
  SlaBreachLog,
  SlaBreachType,
  SlaStatus,
  SlaSummary,
} from "../../../shared/types.js";
import {
  parseTags,
  rowToTask,
  rowToSlaPolicy,
  rowToSlaBreachLog,
  rowToTimeEntry,
} from "./db-helpers.js";

export function createSlaAnalyticsRepo(db: DatabaseSync) {
  const selectTaskById = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
  const getTaskById = (id: string): Task | undefined => {
    const row = selectTaskById.get(id) as Record<string, unknown> | undefined;
    return row ? rowToTask(row) : undefined;
  };
  const listSlaPoliciesSync = (): SlaPolicy[] => {
    const rows = db.prepare(`SELECT * FROM sla_policies ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
    return rows.map(rowToSlaPolicy);
  };

  return {
    // ── SLA Methods ──────────────────────────────────────────────

    async createSlaPolicy(policy: Omit<SlaPolicy, "id" | "createdAt" | "updatedAt">): Promise<SlaPolicy> {
      const id = `sla_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const prioritiesJson = policy.matchPriorities && policy.matchPriorities.length > 0
        ? JSON.stringify(policy.matchPriorities)
        : null;
      const tagsJson = policy.matchTags && policy.matchTags.length > 0
        ? JSON.stringify(policy.matchTags)
        : null;

      db.prepare(`\n        INSERT INTO sla_policies (id, name, description, target_minutes, warning_threshold_percent, match_priorities, match_tags, enabled, created_by, created_at, updated_at)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      `).run(
        id,
        policy.name,
        policy.description ?? null,
        policy.targetMinutes,
        policy.warningThresholdPercent,
        prioritiesJson,
        tagsJson,
        policy.enabled ? 1 : 0,
        policy.createdBy,
        now,
        now,
      );

      const row = db.prepare(`SELECT * FROM sla_policies WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToSlaPolicy(row);
    },

    async listSlaPolicies(): Promise<SlaPolicy[]> {
      const rows = db.prepare(`SELECT * FROM sla_policies ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
      return rows.map(rowToSlaPolicy);
    },

    async getSlaPolicy(id: string): Promise<SlaPolicy | undefined> {
      const row = db.prepare(`SELECT * FROM sla_policies WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      return row ? rowToSlaPolicy(row) : undefined;
    },

    async updateSlaPolicy(
      id: string,
      updates: Partial<Pick<SlaPolicy, "name" | "description" | "targetMinutes" | "warningThresholdPercent" | "matchPriorities" | "matchTags" | "enabled">>,
    ): Promise<SlaPolicy> {
      const existing = db.prepare(`SELECT * FROM sla_policies WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        throw new Error(`SLA policy not found: ${id}`);
      }

      const now = new Date().toISOString();
      const setClauses: string[] = [];
      const params: (string | number | null)[] = [];

      if (updates.name !== undefined) { setClauses.push("name = ?"); params.push(updates.name); }
      if (updates.description !== undefined) { setClauses.push("description = ?"); params.push(updates.description ?? null); }
      if (updates.targetMinutes !== undefined) { setClauses.push("target_minutes = ?"); params.push(updates.targetMinutes); }
      if (updates.warningThresholdPercent !== undefined) { setClauses.push("warning_threshold_percent = ?"); params.push(updates.warningThresholdPercent); }
      if (updates.matchPriorities !== undefined) {
        setClauses.push("match_priorities = ?");
        params.push(updates.matchPriorities && updates.matchPriorities.length > 0 ? JSON.stringify(updates.matchPriorities) : null);
      }
      if (updates.matchTags !== undefined) {
        setClauses.push("match_tags = ?");
        params.push(updates.matchTags && updates.matchTags.length > 0 ? JSON.stringify(updates.matchTags) : null);
      }
      if (updates.enabled !== undefined) { setClauses.push("enabled = ?"); params.push(updates.enabled ? 1 : 0); }

      if (setClauses.length === 0) {
        return rowToSlaPolicy(existing);
      }

      setClauses.push("updated_at = ?");
      params.push(now);
      params.push(id);

      db.prepare(`UPDATE sla_policies SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

      const row = db.prepare(`SELECT * FROM sla_policies WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToSlaPolicy(row);
    },

    async deleteSlaPolicy(id: string): Promise<boolean> {
      // Delete associated breach logs first
      db.prepare(`DELETE FROM sla_breach_log WHERE policy_id = ?`).run(id);
      const result = db.prepare(`DELETE FROM sla_policies WHERE id = ?`).run(id);
      return Number(result.changes) > 0;
    },

    async getSlaStatusForTask(taskId: string): Promise<{ status: SlaStatus; policy?: SlaPolicy; elapsedMinutes: number; targetMinutes?: number }> {
      const task = getTaskById(taskId);
      if (!task) {
        return { status: "no_sla", elapsedMinutes: 0 };
      }

      const elapsedMinutes = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60);

      // Find matching SLA policy
      const policies = listSlaPoliciesSync();
      const matchingPolicy = policies.find((p) => {
        if (!p.enabled) return false;
        // Check priority match
        if (p.matchPriorities && p.matchPriorities.length > 0) {
          if (!p.matchPriorities.includes(task.priority)) return false;
        }
        // Check tag match (all specified tags must be present)
        if (p.matchTags && p.matchTags.length > 0) {
          const taskTags = task.tags ?? [];
          if (!p.matchTags.every((t) => taskTags.includes(t))) return false;
        }
        return true;
      });

      if (!matchingPolicy) {
        return { status: "no_sla", elapsedMinutes };
      }

      // Calculate SLA status based on elapsed time vs target
      const warningMinutes = (matchingPolicy.targetMinutes * matchingPolicy.warningThresholdPercent) / 100;

      if (elapsedMinutes >= matchingPolicy.targetMinutes) {
        return { status: "breached", policy: matchingPolicy, elapsedMinutes, targetMinutes: matchingPolicy.targetMinutes };
      } else if (elapsedMinutes >= warningMinutes) {
        return { status: "warning", policy: matchingPolicy, elapsedMinutes, targetMinutes: matchingPolicy.targetMinutes };
      } else {
        return { status: "on_track", policy: matchingPolicy, elapsedMinutes, targetMinutes: matchingPolicy.targetMinutes };
      }
    },

    async listSlaBreaches(): Promise<SlaBreachLog[]> {
      const rows = db.prepare(`\n        SELECT * FROM sla_breach_log\n        WHERE resolved_at IS NULL\n        ORDER BY detected_at DESC\n      `).all() as Array<Record<string, unknown>>;
      return rows.map(rowToSlaBreachLog);
    },

    async getSlaSummary(): Promise<SlaSummary> {
      const policies = listSlaPoliciesSync();
      const policyStats: SlaSummary["policyStats"] = [];
      let totalTracked = 0;
      let totalOnTrack = 0;
      let totalWarning = 0;
      let totalBreached = 0;
      let totalResolutionMinutes = 0;
      let resolvedCount = 0;

      for (const policy of policies) {
        if (!policy.enabled) continue;

        // Find tasks matching this policy
        const conditions: string[] = ["status IN ('pending', 'picked', 'running')"];
        const params: (string | number | null)[] = [];

        if (policy.matchPriorities && policy.matchPriorities.length > 0) {
          const placeholders = policy.matchPriorities.map(() => "?").join(",");
          conditions.push(`priority IN (${placeholders})`);
          params.push(...policy.matchPriorities);
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;
        const taskRows = db.prepare(`SELECT * FROM tasks ${whereClause}`).all(...params) as Array<Record<string, unknown>>;

        let onTrack = 0;
        let warning = 0;
        let breached = 0;

        for (const taskRow of taskRows) {
          const task = rowToTask(taskRow);
          // Apply tag filter in JS
          if (policy.matchTags && policy.matchTags.length > 0) {
            const taskTags = task.tags ?? [];
            if (!policy.matchTags.every((t) => taskTags.includes(t))) continue;
          }

          const elapsedMinutes = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60);
          const warningMinutes = (policy.targetMinutes * policy.warningThresholdPercent) / 100;

          if (elapsedMinutes >= policy.targetMinutes) {
            breached++;
          } else if (elapsedMinutes >= warningMinutes) {
            warning++;
          } else {
            onTrack++;
          }
        }

        totalTracked += onTrack + warning + breached;
        totalOnTrack += onTrack;
        totalWarning += warning;
        totalBreached += breached;

        policyStats.push({
          policyId: policy.id,
          policyName: policy.name,
          targetMinutes: policy.targetMinutes,
          tasksTracked: onTrack + warning + breached,
          onTrack,
          warning,
          breached,
        });
      }

      // Calculate average resolution time for completed tasks
      const avgRow = db.prepare(`\n        SELECT AVG((julianday(updated_at) - julianday(created_at)) * 24 * 60) as avg_minutes\n        FROM tasks\n        WHERE status IN ('done', 'failed')\n      `).get() as Record<string, unknown> | undefined;
      if (avgRow && avgRow["avg_minutes"] != null) {
        totalResolutionMinutes = Number(avgRow["avg_minutes"]);
        resolvedCount = 1; // Flag that we have data
      }

      return {
        totalTasksTracked: totalTracked,
        onTrack: totalOnTrack,
        warning: totalWarning,
        breached: totalBreached,
        avgResolutionMinutes: resolvedCount > 0 ? totalResolutionMinutes : undefined,
        policyStats,
      };
    },

    async checkAndRecordSlaBreaches(): Promise<{ warnings: number; breaches: number; details: import("../../../shared/types.js").SlaBreachNotification[] }> {
      const policies = listSlaPoliciesSync();
      let warnings = 0;
      let breaches = 0;
      const details: import("../../../shared/types.js").SlaBreachNotification[] = [];
      const now = new Date().toISOString();

      for (const policy of policies) {
        if (!policy.enabled) continue;

        // Find active tasks matching this policy
        const conditions: string[] = ["status IN ('pending', 'picked', 'running')"];
        const params: (string | number | null)[] = [];

        if (policy.matchPriorities && policy.matchPriorities.length > 0) {
          const placeholders = policy.matchPriorities.map(() => "?").join(",");
          conditions.push(`priority IN (${placeholders})`);
          params.push(...policy.matchPriorities);
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;
        const taskRows = db.prepare(`SELECT * FROM tasks ${whereClause}`).all(...params) as Array<Record<string, unknown>>;

        for (const taskRow of taskRows) {
          const task = rowToTask(taskRow);
          // Apply tag filter
          if (policy.matchTags && policy.matchTags.length > 0) {
            const taskTags = task.tags ?? [];
            if (!policy.matchTags.every((t) => taskTags.includes(t))) continue;
          }

          const elapsedMinutes = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60);
          const warningMinutes = (policy.targetMinutes * policy.warningThresholdPercent) / 100;

          // Check if we already have a log for this task+policy+type
          const existingWarning = db.prepare(`\n            SELECT 1 FROM sla_breach_log\n            WHERE task_id = ? AND policy_id = ? AND breach_type = 'warning' AND resolved_at IS NULL\n          `).get(task.id, policy.id) as unknown;

          const existingBreach = db.prepare(`\n            SELECT 1 FROM sla_breach_log\n            WHERE task_id = ? AND policy_id = ? AND breach_type = 'breach' AND resolved_at IS NULL\n          `).get(task.id, policy.id) as unknown;

          if (elapsedMinutes >= policy.targetMinutes && !existingBreach) {
            // Record breach
            db.prepare(`\n              INSERT INTO sla_breach_log (task_id, policy_id, policy_name, breach_type, target_minutes, actual_minutes, detected_at)\n              VALUES (?, ?, ?, 'breach', ?, ?, ?)\n            `).run(task.id, policy.id, policy.name, policy.targetMinutes, elapsedMinutes, now);

            // Auto-resolve warning if exists
            if (existingWarning) {
              db.prepare(`UPDATE sla_breach_log SET resolved_at = ? WHERE task_id = ? AND policy_id = ? AND breach_type = 'warning' AND resolved_at IS NULL`).run(now, task.id, policy.id);
            }
            breaches++;
            details.push({
              taskId: task.id,
              taskCommandText: task.commandText,
              taskPriority: task.priority,
              taskStatus: task.status,
              taskTags: task.tags,
              taskFeishuMessageId: task.feishuMessageId,
              policyName: policy.name,
              breachType: "breach",
              targetMinutes: policy.targetMinutes,
              actualMinutes: elapsedMinutes,
            });
          } else if (elapsedMinutes >= warningMinutes && !existingWarning && !existingBreach) {
            // Record warning
            db.prepare(`\n              INSERT INTO sla_breach_log (task_id, policy_id, policy_name, breach_type, target_minutes, actual_minutes, detected_at)\n              VALUES (?, ?, ?, 'warning', ?, ?, ?)\n            `).run(task.id, policy.id, policy.name, policy.targetMinutes, elapsedMinutes, now);
            warnings++;
            details.push({
              taskId: task.id,
              taskCommandText: task.commandText,
              taskPriority: task.priority,
              taskStatus: task.status,
              taskTags: task.tags,
              taskFeishuMessageId: task.feishuMessageId,
              policyName: policy.name,
              breachType: "warning",
              targetMinutes: policy.targetMinutes,
              actualMinutes: elapsedMinutes,
            });
          }
        }
      }

      // Auto-resolve breaches/warnings for completed tasks
      db.prepare(`\n        UPDATE sla_breach_log SET resolved_at = ?\n        WHERE resolved_at IS NULL\n        AND task_id IN (SELECT id FROM tasks WHERE status IN ('done', 'failed'))\n      `).run(now);

     return { warnings, breaches, details };
    },

    async getTaskStats(): Promise<import("../../../shared/types.js").TaskStats> {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();

      // Total count
      const totalRow = db.prepare(`SELECT COUNT(*) as cnt FROM tasks`).get() as Record<string, unknown>;
      const total = Number(totalRow["cnt"]);

      // Count by status
      const statusRows = db.prepare(`SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status`).all() as Array<Record<string, unknown>>;
      const byStatus: Record<TaskStatus, number> = { pending: 0, picked: 0, running: 0, done: 0, failed: 0 };
      for (const row of statusRows) {
        byStatus[row["status"] as TaskStatus] = Number(row["cnt"]);
      }

      // Count by priority
      const priorityRows = db.prepare(`SELECT priority, COUNT(*) as cnt FROM tasks GROUP BY priority`).all() as Array<Record<string, unknown>>;
      const byPriority: Record<TaskPriority, number> = { low: 0, normal: 0, high: 0, urgent: 0 };
      for (const row of priorityRows) {
        const p = (row["priority"] as TaskPriority) ?? "normal";
        byPriority[p] = Number(row["cnt"]);
      }

      // Daily created (last 7 days)
      const dailyCreatedRows = db.prepare(`
        SELECT DATE(created_at) as day, COUNT(*) as cnt
        FROM tasks
        WHERE created_at >= ?
        GROUP BY day ORDER BY day
      `).all(sevenDaysAgoISO) as Array<Record<string, unknown>>;
      const dailyCreated = dailyCreatedRows.map(r => ({ date: r["day"] as string, count: Number(r["cnt"]) }));

      // Daily completed (last 7 days)
      const dailyCompletedRows = db.prepare(`
        SELECT DATE(updated_at) as day, COUNT(*) as cnt
        FROM tasks
        WHERE status IN ('done', 'failed') AND updated_at >= ?
        GROUP BY day ORDER BY day
      `).all(sevenDaysAgoISO) as Array<Record<string, unknown>>;
      const dailyCompleted = dailyCompletedRows.map(r => ({ date: r["day"] as string, count: Number(r["cnt"]) }));

      // Resolution times for completed tasks in last 7 days
      const resolutionRows = db.prepare(`
        SELECT (julianday(updated_at) - julianday(created_at)) * 24 * 60 as minutes
        FROM tasks
        WHERE status IN ('done', 'failed') AND updated_at >= ?
        ORDER BY minutes
      `).all(sevenDaysAgoISO) as Array<Record<string, unknown>>;

      let avgResolutionMinutes: number | null = null;
      let medianResolutionMinutes: number | null = null;
      if (resolutionRows.length > 0) {
        const values = resolutionRows.map(r => Number(r["minutes"]));
        avgResolutionMinutes = values.reduce((a, b) => a + b, 0) / values.length;
        const mid = Math.floor(values.length / 2);
        medianResolutionMinutes = values.length % 2 !== 0
          ? values[mid]
          : (values[mid - 1] + values[mid]) / 2;
      }

      // Success rate
      const doneCount = byStatus.done;
      const failedCount = byStatus.failed;
      const successRate = (doneCount + failedCount) > 0
        ? Math.round((doneCount / (doneCount + failedCount)) * 1000) / 10
        : null;

      // Top 10 tags
      const allTagRows = db.prepare(`SELECT tags FROM tasks WHERE tags IS NOT NULL AND tags != '[]'`).all() as Array<Record<string, unknown>>;
      const tagCounts = new Map<string, number>();
      for (const row of allTagRows) {
        const tags = parseTags(row["tags"]);
        if (tags) {
          for (const tag of tags) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        }
      }
      const topTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));

      // Overdue count
      const overdueRow = db.prepare(`
        SELECT COUNT(*) as cnt FROM tasks
        WHERE due_date IS NOT NULL AND due_date < ? AND status IN ('pending', 'picked', 'running')
      `).get(now.toISOString()) as Record<string, unknown>;
      const overdueCount = Number(overdueRow["cnt"]);

      return {
        total,
        byStatus,
        byPriority,
        dailyCreated,
        dailyCompleted,
        avgResolutionMinutes: avgResolutionMinutes !== null ? Math.round(avgResolutionMinutes * 10) / 10 : null,
        medianResolutionMinutes: medianResolutionMinutes !== null ? Math.round(medianResolutionMinutes * 10) / 10 : null,
        successRate,
        topTags,
        overdueCount,
        computedAt: now.toISOString(),
      };
    },

    async getTaskTimeSeries(
      from: string,
      to: string,
      interval: import("../../../shared/types.js").TimeSeriesInterval,
      metric: import("../../../shared/types.js").TimeSeriesMetric,
    ): Promise<import("../../../shared/types.js").TimeSeriesResult> {
      // Build date truncation format based on interval
      const truncFmt = interval === "hour" ? "%Y-%m-%dT%H:00:00"
        : interval === "week" ? "%Y-W%W"
        : interval === "month" ? "%Y-%m"
        : "%Y-%m-%d"; // day

      // Generate all expected bucket timestamps for filling gaps
      function* generateBuckets(start: Date, end: Date, iv: import("../../../shared/types.js").TimeSeriesInterval): Generator<string> {
        const d = new Date(start);
        while (d <= end) {
          if (iv === "hour") {
            yield d.toISOString().slice(0, 13) + ":00:00";
            d.setUTCHours(d.getUTCHours() + 1);
          } else if (iv === "week") {
            // Align to Monday
            const day = d.getUTCDay();
            const diff = day === 0 ? -6 : 1 - day;
            d.setUTCDate(d.getUTCDate() + diff);
            const y = d.getUTCFullYear();
            const weekNum = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
            yield `${y}-W${String(weekNum).padStart(2, "0")}`;
            d.setUTCDate(d.getUTCDate() + 7);
          } else if (iv === "month") {
            yield d.toISOString().slice(0, 7);
            d.setUTCMonth(d.getUTCMonth() + 1);
          } else {
            yield d.toISOString().slice(0, 10);
            d.setUTCDate(d.getUTCDate() + 1);
          }
        }
      }

      const buckets = new Map<string, number>();
      for (const b of generateBuckets(new Date(from), new Date(to), interval)) {
        buckets.set(b, 0);
      }

      if (metric === "created") {
        const rows = db.prepare(`
          SELECT strftime('${truncFmt}', created_at) as bucket, COUNT(*) as cnt
          FROM tasks
          WHERE created_at >= ? AND created_at < ?
          GROUP BY bucket ORDER BY bucket
        `).all(from, to) as Array<Record<string, unknown>>;
        for (const row of rows) {
          const key = row["bucket"] as string;
          if (buckets.has(key)) buckets.set(key, Number(row["cnt"]));
        }
      } else if (metric === "completed") {
        const rows = db.prepare(`
          SELECT strftime('${truncFmt}', updated_at) as bucket, COUNT(*) as cnt
          FROM tasks
          WHERE status IN ('done', 'failed')
            AND updated_at >= ? AND updated_at < ?
          GROUP BY bucket ORDER BY bucket
        `).all(from, to) as Array<Record<string, unknown>>;
        for (const row of rows) {
          const key = row["bucket"] as string;
          if (buckets.has(key)) buckets.set(key, Number(row["cnt"]));
        }
      } else if (metric === "resolution_time") {
        // Get resolution times grouped by bucket
        const rows = db.prepare(`
          SELECT
            strftime('${truncFmt}', created_at) as bucket,
            (julianday(updated_at) - julianday(created_at)) * 24 * 60 as minutes
          FROM tasks
          WHERE status IN ('done', 'failed')
            AND created_at >= ? AND created_at < ?
          ORDER BY bucket
        `).all(from, to) as Array<Record<string, unknown>>;

        // Group minutes by bucket
        const bucketTimes = new Map<string, number[]>();
        for (const row of rows) {
          const key = row["bucket"] as string;
          const mins = Number(row["minutes"]);
          if (!bucketTimes.has(key)) bucketTimes.set(key, []);
          bucketTimes.get(key)!.push(mins);
        }

        for (const [key] of buckets) {
          const times = bucketTimes.get(key);
          if (times && times.length > 0) {
            const sorted = [...times].sort((a, b) => a - b);
            const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 !== 0
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2;
            buckets.set(key, times.length);
            // Store avg/median as separate values — we'll set them on the data point below
          }
        }

        const data: import("../../../shared/types.js").TimeSeriesDataPoint[] = [];
        for (const [key, count] of buckets) {
          const times = bucketTimes.get(key);
          const dp: import("../../../shared/types.js").TimeSeriesDataPoint = { timestamp: key, count };
          if (times && times.length > 0) {
            const sorted = [...times].sort((a, b) => a - b);
            const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 !== 0
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2;
            dp.avgResolutionMinutes = Math.round(avg * 10) / 10;
            dp.medianResolutionMinutes = Math.round(median * 10) / 10;
          }
          data.push(dp);
        }

        return {
          interval,
          metric,
          from,
          to,
          data,
        };
      }

      const data: import("../../../shared/types.js").TimeSeriesDataPoint[] = [];
      for (const [key, count] of buckets) {
        data.push({ timestamp: key, count });
      }

      return {
        interval,
        metric,
        from,
        to,
        data,
      };
    },


    async getCompletedTaskTimings(): Promise<Array<{
      status: TaskStatus;
      createdAt: string;
      pickedAt?: string;
      startedAt?: string;
      completedAt: string;
    }>> {
      const rows = db.prepare(`
        SELECT status, created_at, picked_at, started_at, completed_at
        FROM tasks
        WHERE completed_at IS NOT NULL AND status IN ('done', 'failed')
      `).all() as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        status: row["status"] as TaskStatus,
        createdAt: row["created_at"] as string,
        pickedAt: (row["picked_at"] as string) ?? undefined,
        startedAt: (row["started_at"] as string) ?? undefined,
        completedAt: row["completed_at"] as string,
      }));
    },

    // ── Kanban Board ──────────────────────────────────────────────

    async getKanbanBoard(limit?: number, deviceId?: string): Promise<import("../../../shared/types.js").KanbanBoard> {
      const STATUS_LABELS: Record<TaskStatus, string> = {
        pending: "Pending",
        picked: "Picked",
        running: "Running",
        done: "Done",
        failed: "Failed",
      };
      const STATUSES: TaskStatus[] = ["pending", "picked", "running", "done", "failed"];
      const perColumnLimit = limit ?? 50;

      const columns: import("../../../shared/types.js").KanbanColumn[] = [];
      let totalTasks = 0;

      for (const status of STATUSES) {
        const params: (string | number | null)[] = [status];
        let whereClause = "WHERE status = ? AND archived_at IS NULL";
        if (deviceId) {
          whereClause += " AND (assigned_device_id = ? OR assigned_device_id IS NULL)";
          params.push(deviceId);
        }
        whereClause += " ORDER BY pinned DESC, CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, created_at DESC";
        whereClause += ` LIMIT ${perColumnLimit}`;

        const rows = db.prepare(`SELECT * FROM tasks ${whereClause}`).all(...params) as Array<Record<string, unknown>>;
        const tasks = rows.map(rowToTask);
        totalTasks += tasks.length;
        columns.push({
          status,
          label: STATUS_LABELS[status],
          count: tasks.length,
          tasks,
        });
      }

      return { columns, totalTasks };
    },

    // Time entry methods
    async createTimeEntry(taskId: string, startedAt: string, endedAt: string | undefined, durationMinutes: number, description: string | null, loggedBy: string): Promise<import("../../../shared/types.js").TimeEntry> {
      const now = new Date().toISOString();
      const result = db.prepare(
        `INSERT INTO time_entries (task_id, started_at, ended_at, duration_minutes, description, logged_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(taskId, startedAt, endedAt ?? null, durationMinutes, description ?? null, loggedBy, now, now);
      const id = String(result.lastInsertRowid);
      return { id, taskId, startedAt, endedAt, durationMinutes, description: description ?? undefined, loggedBy, createdAt: now, updatedAt: now };
    },

    async listTimeEntries(taskId: string): Promise<import("../../../shared/types.js").TimeEntry[]> {
      const rows = db.prepare(`SELECT * FROM time_entries WHERE task_id = ? ORDER BY started_at DESC`).all(taskId) as Record<string, unknown>[];
      return rows.map(rowToTimeEntry);
    },

    async getTimeEntry(taskId: string, entryId: string): Promise<import("../../../shared/types.js").TimeEntry | undefined> {
      const row = db.prepare(`SELECT * FROM time_entries WHERE task_id = ? AND id = ?`).get(taskId, entryId) as Record<string, unknown> | undefined;
      return row ? rowToTimeEntry(row) : undefined;
    },

    async deleteTimeEntry(taskId: string, entryId: string): Promise<boolean> {
      const result = db.prepare(`DELETE FROM time_entries WHERE task_id = ? AND id = ?`).run(taskId, entryId);
      return Number(result.changes) > 0;
    },

    async stopTimeEntry(taskId: string, entryId: string, endedAt: string): Promise<import("../../../shared/types.js").TimeEntry> {
      const existing = db.prepare(`SELECT * FROM time_entries WHERE task_id = ? AND id = ?`).get(taskId, entryId) as Record<string, unknown> | undefined;
      if (!existing) throw new Error("Time entry not found");
      if (existing["ended_at"]) throw new Error("Time entry already stopped");
      const startedAt = new Date(existing["started_at"] as string).getTime();
      const endMs = new Date(endedAt).getTime();
      const durationMinutes = Math.round((endMs - startedAt) / 60000);
      const now = new Date().toISOString();
      db.prepare(`UPDATE time_entries SET ended_at = ?, duration_minutes = ?, updated_at = ? WHERE task_id = ? AND id = ?`).run(endedAt, durationMinutes, now, taskId, entryId);
      return { id: entryId, taskId, startedAt: existing["started_at"] as string, endedAt, durationMinutes, description: (existing["description"] as string) ?? undefined, loggedBy: existing["logged_by"] as string, createdAt: existing["created_at"] as string, updatedAt: now };
    },

    async getTimeTrackingSummary(): Promise<import("../../../shared/types.js").TimeTrackingSummary> {
      // Total entries and minutes
      const totals = db.prepare(`
        SELECT COUNT(*) as total_entries, COALESCE(SUM(duration_minutes), 0) as total_minutes
        FROM time_entries
      `).get() as Record<string, unknown>;

      // Active timers (no ended_at)
      const active = db.prepare(`
        SELECT COUNT(*) as cnt FROM time_entries WHERE ended_at IS NULL
      `).get() as Record<string, unknown>;

      // Tasks with entries
      const tasksCount = db.prepare(`
        SELECT COUNT(DISTINCT task_id) as cnt FROM time_entries
      `).get() as Record<string, unknown>;

      // Breakdown by loggedBy (top 10)
      const byUserRows = db.prepare(`
        SELECT logged_by, SUM(duration_minutes) as total_minutes, COUNT(*) as entry_count
        FROM time_entries
        GROUP BY logged_by
        ORDER BY total_minutes DESC
        LIMIT 10
      `).all() as Array<Record<string, unknown>>;

      // Breakdown by task priority
      const byPriorityRows = db.prepare(`
        SELECT t.priority, SUM(te.duration_minutes) as total_minutes, COUNT(*) as entry_count
        FROM time_entries te
        JOIN tasks t ON te.task_id = t.id
        GROUP BY t.priority
      `).all() as Array<Record<string, unknown>>;

      // Last 7 days daily breakdown
      const dailyRows = db.prepare(`
        SELECT DATE(te.started_at) as date, SUM(te.duration_minutes) as total_minutes, COUNT(*) as entry_count
        FROM time_entries te
        WHERE te.started_at >= datetime('now', '-7 days')
        GROUP BY DATE(te.started_at)
        ORDER BY date ASC
      `).all() as Array<Record<string, unknown>>;

      const totalEntries = Number(totals["total_entries"]) || 0;
      const totalMinutes = Number(totals["total_minutes"]) || 0;
      const tasksWithEntries = Number(tasksCount["cnt"]) || 0;

      return {
        totalEntries,
        totalMinutes,
        avgMinutesPerEntry: totalEntries > 0 ? Math.round(totalMinutes / totalEntries) : 0,
        avgMinutesPerTask: tasksWithEntries > 0 ? Math.round(totalMinutes / tasksWithEntries) : 0,
        tasksWithEntries,
        activeTimers: Number(active["cnt"]) || 0,
        byUser: byUserRows.map(r => ({ userId: r["logged_by"] as string, totalMinutes: Number(r["total_minutes"]), entryCount: Number(r["entry_count"]) })),
        byPriority: Object.fromEntries(byPriorityRows.map(r => [r["priority"] as string, { totalMinutes: Number(r["total_minutes"]), entryCount: Number(r["entry_count"]) }])),
        recentDaily: dailyRows.map(r => ({ date: r["date"] as string, totalMinutes: Number(r["total_minutes"]), entryCount: Number(r["entry_count"]) })),
      };
    },

  };
}
