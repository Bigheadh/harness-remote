import type { DatabaseSync } from "node:sqlite";
import type {
  Task,
  TaskStatus,
  TaskComment,
  TaskNote,
  AuditLogEntry,
  SavedView,
  SavedViewFilters,
} from "../../../shared/types.js";
import {
  rowToTask,
  rowToSubtask,
  isValidTransition,
} from "./db-helpers.js";

export function createRelationsRepo(db: DatabaseSync) {
  const selectTaskById = db.prepare(`SELECT * FROM tasks WHERE id = ?`);

  return {
    async addComment(taskId: string, author: string, authorType: AuditLogEntry["actorType"], body: string): Promise<TaskComment> {
      // Verify task exists
      const taskRow = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!taskRow) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO task_comments (task_id, author, author_type, body, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskId, author, authorType, body, now);

      const commentId = Number(result.lastInsertRowid);
      return {
        id: commentId,
        taskId,
        author,
        authorType,
        body,
        createdAt: now,
      };
    },

    async listComments(taskId: string): Promise<TaskComment[]> {
      const rows = db.prepare(`
        SELECT * FROM task_comments
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all(taskId) as Array<Record<string, unknown>>;

      return rows.map((row) => ({
        id: row["id"] as number,
        taskId: row["task_id"] as string,
        author: row["author"] as string,
        authorType: row["author_type"] as AuditLogEntry["actorType"],
        body: row["body"] as string,
        createdAt: row["created_at"] as string,
      }));
    },

    async deleteComment(commentId: number, taskId: string): Promise<boolean> {
      const result = db.prepare(`
        DELETE FROM task_comments WHERE id = ? AND task_id = ?
      `).run(commentId, taskId);
      return Number(result.changes) > 0;
    },

    // ── Task Dependencies ─────────────────────────────────────────

    async setDependencies(taskId: string, dependsOnIds: string[]): Promise<Task> {
      // Verify task exists
      const taskRow = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!taskRow) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Verify all dependency tasks exist
      for (const depId of dependsOnIds) {
        if (depId === taskId) {
          throw new Error(`Task cannot depend on itself: ${taskId}`);
        }
        const depRow = selectTaskById.get(depId) as Record<string, unknown> | undefined;
        if (!depRow) {
          throw new Error(`Dependency task not found: ${depId}`);
        }
      }

      // Check for circular dependencies
      if (dependsOnIds.length > 0) {
        const visited = new Set<string>();
        const stack = [...dependsOnIds];
        while (stack.length > 0) {
          const current = stack.pop()!;
          if (current === taskId) {
            throw new Error(`Circular dependency detected: task ${taskId} would create a cycle`);
          }
          if (visited.has(current)) continue;
          visited.add(current);
          // Get this task's dependencies and add to stack
          const deps = db.prepare(
            `SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?`
          ).all(current) as Array<Record<string, unknown>>;
          for (const dep of deps) {
            stack.push(dep["depends_on_task_id"] as string);
          }
        }
      }

      const now = new Date().toISOString();

      // Replace all existing dependencies atomically
      const insertDepStmt = db.prepare(
        `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`,
      );
      db.exec("BEGIN");
      try {
        db.prepare(`DELETE FROM task_dependencies WHERE task_id = ?`).run(taskId);
        for (const depId of dependsOnIds) {
          insertDepStmt.run(taskId, depId);
        }
        db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, taskId);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      const updated = selectTaskById.get(taskId) as Record<string, unknown>;
      return rowToTask(updated);
    },

    async getDependencies(taskId: string): Promise<string[]> {
      const rows = db.prepare(
        `SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?`
      ).all(taskId) as Array<Record<string, unknown>>;
      return rows.map((r) => r["depends_on_task_id"] as string);
    },

    async getDependents(taskId: string): Promise<string[]> {
      const rows = db.prepare(
        `SELECT task_id FROM task_dependencies WHERE depends_on_task_id = ?`
      ).all(taskId) as Array<Record<string, unknown>>;
      return rows.map((r) => r["task_id"] as string);
    },

    async isTaskBlocked(taskId: string): Promise<boolean> {
      const deps = db.prepare(
        `SELECT d.depends_on_task_id, t.status
         FROM task_dependencies d
         JOIN tasks t ON t.id = d.depends_on_task_id
         WHERE d.task_id = ?`
      ).all(taskId) as Array<Record<string, unknown>>;
      // Blocked if any dependency is not done/failed
      return deps.some((d) => d["status"] !== "done" && d["status"] !== "failed");
    },

    async listReadyTasks(limit?: number, deviceId?: string): Promise<Task[]> {
      const effectiveLimit = limit ?? 20;
      const rows = db.prepare(`
        SELECT t.* FROM tasks t
        WHERE t.status = 'pending'
        AND (t.assigned_device_id IS NULL OR t.assigned_device_id = COALESCE(?, t.assigned_device_id))
        AND NOT EXISTS (
          SELECT 1 FROM task_dependencies d
          JOIN tasks dep ON dep.id = d.depends_on_task_id
          WHERE d.task_id = t.id
          AND dep.status NOT IN ('done', 'failed')
        )
        ORDER BY
          CASE t.priority
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 3
          END,
          t.created_at DESC
        LIMIT ?
      `).all(deviceId ?? null, effectiveLimit) as Array<Record<string, unknown>>;

      // Enrich with dependency info
      return rows.map((row) => {
        const task = rowToTask(row);
        const deps = db.prepare(
          `SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?`
        ).all(task.id) as Array<Record<string, unknown>>;
        if (deps.length > 0) {
          task.dependsOn = deps.map((d) => d["depends_on_task_id"] as string);
        }
        return task;
      });
    },

    async getDependencyGraph(taskId: string): Promise<import("../../../shared/types.js").DependencyGraph> {
      // Verify root task exists
      const rootRow = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!rootRow) {
        throw new Error(`Task not found: ${taskId}`);
      }
      const rootTask = rowToTask(rootRow);

      const edges: Array<{ from: string; to: string }> = [];
      const visited = new Set<string>();
      let maxUpstreamDepth = 0;
      let maxDownstreamDepth = 0;

      // Recursively build upstream tree (prerequisites)
      function buildUpstream(id: string, depth: number): import("../../../shared/types.js").DependencyTreeNode[] {
        if (depth > maxUpstreamDepth) maxUpstreamDepth = depth;
        const depIds = db.prepare(
          `SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?`
        ).all(id) as Array<Record<string, unknown>>;

        return depIds.map((row) => {
          const depId = row["depends_on_task_id"] as string;
          edges.push({ from: id, to: depId });
          visited.add(depId);

          const depRow = selectTaskById.get(depId) as Record<string, unknown> | undefined;
          if (!depRow) {
            return { taskId: depId, status: "pending" as const, commandText: "(deleted)", children: [] };
          }
          const depTask = rowToTask(depRow);
          return {
            taskId: depId,
            status: depTask.status,
            commandText: depTask.commandText,
            children: buildUpstream(depId, depth + 1),
          };
        });
      }

      // Recursively build downstream tree (dependents)
      function buildDownstream(id: string, depth: number): import("../../../shared/types.js").DependencyTreeNode[] {
        if (depth > maxDownstreamDepth) maxDownstreamDepth = depth;
        const dependentIds = db.prepare(
          `SELECT task_id FROM task_dependencies WHERE depends_on_task_id = ?`
        ).all(id) as Array<Record<string, unknown>>;

        return dependentIds.map((row) => {
          const depId = row["task_id"] as string;
          edges.push({ from: depId, to: id });
          visited.add(depId);

          const depRow = selectTaskById.get(depId) as Record<string, unknown> | undefined;
          if (!depRow) {
            return { taskId: depId, status: "pending" as const, commandText: "(deleted)", children: [] };
          }
          const depTask = rowToTask(depRow);
          return {
            taskId: depId,
            status: depTask.status,
            commandText: depTask.commandText,
            children: buildDownstream(depId, depth + 1),
          };
        });
      }

      const upstream = buildUpstream(taskId, 1);
      const downstream = buildDownstream(taskId, 1);

      // Count total unique nodes (root + all visited)
      const totalNodes = visited.size + 1; // +1 for root

      return {
        taskId,
        status: rootTask.status,
        commandText: rootTask.commandText,
        upstream,
        downstream,
        maxUpstreamDepth,
        maxDownstreamDepth,
        totalNodes,
        edges,
      };
    },

    // ── Task Relationships (Phase 58) ─────────────────────────

    async addRelationship(taskId: string, relatedTaskId: string, relationshipType: import("../../../shared/types.js").TaskRelationshipType): Promise<void> {
      // Verify both tasks exist
      const taskRow = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!taskRow) throw new Error(`Task not found: ${taskId}`);
      const relatedRow = selectTaskById.get(relatedTaskId) as Record<string, unknown> | undefined;
      if (!relatedRow) throw new Error(`Related task not found: ${relatedTaskId}`);
      if (taskId === relatedTaskId) throw new Error(`Task cannot have a relationship with itself`);

      const now = new Date().toISOString();
      // Upsert: delete existing relationship of same type, then insert
      db.prepare(
        `DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ? AND relationship_type = ?`
      ).run(taskId, relatedTaskId, relationshipType);
      db.prepare(
        `INSERT INTO task_dependencies (task_id, depends_on_task_id, relationship_type, created_at) VALUES (?, ?, ?, ?)`
      ).run(taskId, relatedTaskId, relationshipType, now);
      db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, taskId);
    },

    async removeRelationship(taskId: string, relatedTaskId: string, relationshipType?: import("../../../shared/types.js").TaskRelationshipType): Promise<void> {
      const now = new Date().toISOString();
      if (relationshipType) {
        db.prepare(
          `DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ? AND relationship_type = ?`
        ).run(taskId, relatedTaskId, relationshipType);
      } else {
        db.prepare(
          `DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?`
        ).run(taskId, relatedTaskId);
      }
      db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, taskId);
    },

    async listRelationships(taskId: string): Promise<import("../../../shared/types.js").TaskRelationship[]> {
      const rows = db.prepare(
        `SELECT task_id, depends_on_task_id, relationship_type, created_at
         FROM task_dependencies
         WHERE task_id = ? OR depends_on_task_id = ?
         ORDER BY created_at DESC`
      ).all(taskId, taskId) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        taskId: r["task_id"] as string,
        relatedTaskId: r["depends_on_task_id"] as string,
        relationshipType: r["relationship_type"] as import("../../../shared/types.js").TaskRelationshipType,
        createdAt: r["created_at"] as string,
      }));
    },

    // ── Task Locks ───────────────────────────────────────────────

    async lockTask(taskId: string, deviceId: string, ttlMs: number = 300000): Promise<import("../../../shared/types.js").TaskLock> {
      // Verify task exists
      const taskRow = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!taskRow) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();

      // Check if already locked by someone else
      const existing = db.prepare(
        `SELECT locked_by, expires_at FROM task_locks WHERE task_id = ?`
      ).get(taskId) as Record<string, unknown> | undefined;

      if (existing) {
        const expiresAtExisting = existing["expires_at"] as string;
        if (new Date(expiresAtExisting) > new Date(now)) {
          // Lock is still active
          if (existing["locked_by"] !== deviceId) {
            throw new Error(`Task ${taskId} is locked by device ${existing["locked_by"]}`);
          }
          // Same device — refresh the lock
          db.prepare(
            `UPDATE task_locks SET locked_at = ?, expires_at = ? WHERE task_id = ?`
          ).run(now, expiresAt, taskId);
        } else {
          // Lock expired — replace it
          db.prepare(
            `UPDATE task_locks SET locked_by = ?, locked_at = ?, expires_at = ? WHERE task_id = ?`
          ).run(deviceId, now, expiresAt, taskId);
        }
      } else {
        // No lock — create one
        db.prepare(
          `INSERT INTO task_locks (task_id, locked_by, locked_at, expires_at) VALUES (?, ?, ?, ?)`
        ).run(taskId, deviceId, now, expiresAt);
      }

      return { taskId, lockedBy: deviceId, lockedAt: now, expiresAt };
    },

    async unlockTask(taskId: string, deviceId: string): Promise<boolean> {
      const existing = db.prepare(
        `SELECT locked_by FROM task_locks WHERE task_id = ?`
      ).get(taskId) as Record<string, unknown> | undefined;

      if (!existing) return false;
      if (existing["locked_by"] !== deviceId) {
        throw new Error(`Task ${taskId} is locked by device ${existing["locked_by"]}, not ${deviceId}`);
      }

      const result = db.prepare(`DELETE FROM task_locks WHERE task_id = ? AND locked_by = ?`).run(taskId, deviceId);
      return Number(result.changes) > 0;
    },

    async getTaskLock(taskId: string): Promise<import("../../../shared/types.js").TaskLock | undefined> {
      const row = db.prepare(
        `SELECT task_id, locked_by, locked_at, expires_at FROM task_locks WHERE task_id = ?`
      ).get(taskId) as Record<string, unknown> | undefined;

      if (!row) return undefined;

      // Check if expired
      if (new Date(row["expires_at"] as string) <= new Date()) {
        db.prepare(`DELETE FROM task_locks WHERE task_id = ?`).run(taskId);
        return undefined;
      }

      return {
        taskId: row["task_id"] as string,
        lockedBy: row["locked_by"] as string,
        lockedAt: row["locked_at"] as string,
        expiresAt: row["expires_at"] as string,
      };
    },

    async cleanupExpiredLocks(): Promise<number> {
      const now = new Date().toISOString();
      const result = db.prepare(
        `DELETE FROM task_locks WHERE expires_at <= ?`
      ).run(now);
      return Number(result.changes);
    },

    // ── Task Subtasks ──────────────────────────────────────────

    async createSubtask(parentTaskId: string, title: string, commandText: string): Promise<import("../../../shared/types.js").Subtask> {
      // Verify parent task exists
      const parentRow = selectTaskById.get(parentTaskId) as Record<string, unknown> | undefined;
      if (!parentRow) {
        throw new Error(`Task not found: ${parentTaskId}`);
      }

      const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      db.prepare(`\n        INSERT INTO task_subtasks (id, parent_task_id, title, command_text, status, created_at, updated_at)\n        VALUES (?, ?, ?, ?, 'pending', ?, ?)\n      `).run(id, parentTaskId, title, commandText, now, now);

      const row = db.prepare(`SELECT * FROM task_subtasks WHERE id = ?`).get(id) as Record<string, unknown>;
      return rowToSubtask(row);
    },

    async listSubtasks(parentTaskId: string): Promise<import("../../../shared/types.js").Subtask[]> {
      const rows = db.prepare(`\n        SELECT * FROM task_subtasks\n        WHERE parent_task_id = ?\n        ORDER BY created_at ASC\n      `).all(parentTaskId) as Array<Record<string, unknown>>;
      return rows.map(rowToSubtask);
    },

    async getSubtask(parentTaskId: string, subtaskId: string): Promise<import("../../../shared/types.js").Subtask | undefined> {
      const row = db.prepare(`\n        SELECT * FROM task_subtasks\n        WHERE id = ? AND parent_task_id = ?\n      `).get(subtaskId, parentTaskId) as Record<string, unknown> | undefined;
      return row ? rowToSubtask(row) : undefined;
    },

    async updateSubtaskStatus(parentTaskId: string, subtaskId: string, status: TaskStatus): Promise<import("../../../shared/types.js").Subtask> {
      const row = db.prepare(`\n        SELECT * FROM task_subtasks\n        WHERE id = ? AND parent_task_id = ?\n      `).get(subtaskId, parentTaskId) as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error(`Subtask not found: ${subtaskId}`);
      }

      const currentStatus = row["status"] as TaskStatus;
      if (!isValidTransition(currentStatus, status)) {
        throw new Error(`Invalid status transition: ${currentStatus} -> ${status}`);
      }

      const now = new Date().toISOString();
      db.prepare(`UPDATE task_subtasks SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, subtaskId);

      const updated = db.prepare(`SELECT * FROM task_subtasks WHERE id = ?`).get(subtaskId) as Record<string, unknown>;
      return rowToSubtask(updated);
    },

    async saveSubtaskResult(parentTaskId: string, subtaskId: string, success: boolean, summary: string, details?: string): Promise<import("../../../shared/types.js").Subtask> {
      const row = db.prepare(`\n        SELECT * FROM task_subtasks\n        WHERE id = ? AND parent_task_id = ?\n      `).get(subtaskId, parentTaskId) as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error(`Subtask not found: ${subtaskId}`);
      }

      const newStatus: TaskStatus = success ? "done" : "failed";
      const now = new Date().toISOString();
      db.prepare(`\n        UPDATE task_subtasks SET status = ?, result_summary = ?, result_details = ?, updated_at = ?\n        WHERE id = ?\n      `).run(newStatus, summary, details ?? null, now, subtaskId);

      const updated = db.prepare(`SELECT * FROM task_subtasks WHERE id = ?`).get(subtaskId) as Record<string, unknown>;
      return rowToSubtask(updated);
    },

    async deleteSubtask(parentTaskId: string, subtaskId: string): Promise<boolean> {
      const result = db.prepare(`\n        DELETE FROM task_subtasks\n        WHERE id = ? AND parent_task_id = ?\n      `).run(subtaskId, parentTaskId);
      return Number(result.changes) > 0;
    },

    // ── Task Notes (internal annotations) ──────────────────────────

    async addNote(taskId: string, author: string, body: string): Promise<TaskNote> {
      // Verify task exists
      const task = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const now = new Date().toISOString();
      const result = db.prepare(
        `INSERT INTO task_notes (task_id, author, body, created_at) VALUES (?, ?, ?, ?)`,
      ).run(taskId, author, body, now);

      const noteId = Number(result.lastInsertRowid);
      const row = db.prepare(`SELECT * FROM task_notes WHERE id = ?`).get(noteId) as Record<string, unknown>;
      return {
        id: row["id"] as number,
        taskId: row["task_id"] as string,
        author: row["author"] as string,
        body: row["body"] as string,
        createdAt: row["created_at"] as string,
      };
    },

    async listNotes(taskId: string): Promise<TaskNote[]> {
      const rows = db.prepare(
        `SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at ASC`,
      ).all(taskId) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: row["id"] as number,
        taskId: row["task_id"] as string,
        author: row["author"] as string,
        body: row["body"] as string,
        createdAt: row["created_at"] as string,
      }));
    },

    async deleteNote(noteId: number, taskId: string): Promise<boolean> {
      const result = db.prepare(
        `DELETE FROM task_notes WHERE id = ? AND task_id = ?`,
      ).run(noteId, taskId);
      return Number(result.changes) > 0;
    },


    // ── Activity Feed ──────────────────────────────────────────────

    async getActivityFeed(taskId: string, limit?: number): Promise<import("../../../shared/types.js").ActivityFeedItem[]> {
      // Verify task exists
      const task = selectTaskById.get(taskId) as Record<string, unknown> | undefined;
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const effectiveLimit = Math.min(limit ?? 50, 200);
      const items: import("../../../shared/types.js").ActivityFeedItem[] = [];

      // 1. Task creation event
      items.push({
        type: "task.created",
        timestamp: task["created_at"] as string,
        actor: task["feishu_user_id"] as string,
        actorType: "feishu",
        summary: `Task created: ${(task["command_text"] as string).slice(0, 100)}`,
        details: { commandText: task["command_text"] as string },
      });

      // 2. Comments
      const commentRows = db.prepare(
        `SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC`,
      ).all(taskId) as Array<Record<string, unknown>>;
      for (const row of commentRows) {
        items.push({
          type: "comment.added",
          timestamp: row["created_at"] as string,
          actor: row["author"] as string,
          actorType: row["author_type"] as string,
          summary: `Comment by ${row["author"]}: ${(row["body"] as string).slice(0, 100)}`,
          details: { commentId: row["id"], body: row["body"] as string },
        });
      }

      // 3. Notes (internal annotations)
      const noteRows = db.prepare(
        `SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at ASC`,
      ).all(taskId) as Array<Record<string, unknown>>;
      for (const row of noteRows) {
        items.push({
          type: "note.added",
          timestamp: row["created_at"] as string,
          actor: row["author"] as string,
          actorType: "api",
          summary: `Note by ${row["author"]}: ${(row["body"] as string).slice(0, 100)}`,
          details: { noteId: row["id"], body: row["body"] as string },
        });
      }

      // 4. Subtask events
      const subtaskRows = db.prepare(
        `SELECT * FROM task_subtasks WHERE parent_task_id = ? ORDER BY created_at ASC`,
      ).all(taskId) as Array<Record<string, unknown>>;
      for (const row of subtaskRows) {
        items.push({
          type: "subtask.created",
          timestamp: row["created_at"] as string,
          actor: "system",
          actorType: "system",
          summary: `Subtask created: ${row["title"]}`,
          details: { subtaskId: row["id"], title: row["title"] as string, status: row["status"] as string },
        });
        // If the subtask has a result, add that as a separate event
        if (row["result_summary"]) {
          items.push({
            type: "subtask.result_reported",
            timestamp: row["updated_at"] as string,
            actor: "system",
            actorType: "system",
            summary: `Subtask "${row["title"]}" completed: ${(row["result_summary"] as string).slice(0, 100)}`,
            details: { subtaskId: row["id"], title: row["title"] as string, status: row["status"] as string },
          });
        }
      }

      // Sort by timestamp ascending and apply limit
      items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      return items.slice(0, effectiveLimit);
    },

    // ─── Saved Views ─────────────────────────────────────────────────────
    async createSavedView(name: string, createdBy: string, filters: SavedViewFilters): Promise<SavedView> {
      const id = `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO saved_views (id, name, created_by, filters, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, name, createdBy, JSON.stringify(filters), now, now);
      return { id, name, createdBy, filters, createdAt: now, updatedAt: now };
    },

    async listSavedViews(createdBy?: string): Promise<SavedView[]> {
      let sql = `SELECT * FROM saved_views`;
      const params: (string | number | null)[] = [];
      if (createdBy) {
        sql += ` WHERE created_by = ?`;
        params.push(createdBy);
      }
      sql += ` ORDER BY created_at DESC`;
      const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: row["id"] as string,
        name: row["name"] as string,
        createdBy: row["created_by"] as string,
        filters: JSON.parse(row["filters"] as string) as SavedViewFilters,
        createdAt: row["created_at"] as string,
        updatedAt: row["updated_at"] as string,
      }));
    },

    async getSavedView(id: string): Promise<SavedView | undefined> {
      const row = db.prepare(`SELECT * FROM saved_views WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return {
        id: row["id"] as string,
        name: row["name"] as string,
        createdBy: row["created_by"] as string,
        filters: JSON.parse(row["filters"] as string) as SavedViewFilters,
        createdAt: row["created_at"] as string,
        updatedAt: row["updated_at"] as string,
      };
    },

    async updateSavedView(id: string, updates: Partial<Pick<SavedView, "name" | "filters">>): Promise<SavedView> {
      const existing = db.prepare(`SELECT * FROM saved_views WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      if (!existing) throw new Error(`Saved view not found: ${id}`);
      const now = new Date().toISOString();
      const sets: string[] = [];
      const params: (string | number | null)[] = [];
      if (updates.name !== undefined) {
        sets.push(`name = ?`);
        params.push(updates.name);
      }
      if (updates.filters !== undefined) {
        sets.push(`filters = ?`);
        params.push(JSON.stringify(updates.filters));
      }
      sets.push(`updated_at = ?`);
      params.push(now);
      params.push(id);
      db.prepare(`UPDATE saved_views SET ${sets.join(", ")} WHERE id = ?`).run(...params);
      const row = db.prepare(`SELECT * FROM saved_views WHERE id = ?`).get(id) as Record<string, unknown>;
      return {
        id: row["id"] as string,
        name: row["name"] as string,
        createdBy: row["created_by"] as string,
        filters: JSON.parse(row["filters"] as string) as SavedViewFilters,
        createdAt: row["created_at"] as string,
        updatedAt: row["updated_at"] as string,
      };
    },

    async deleteSavedView(id: string): Promise<boolean> {
      const result = db.prepare(`DELETE FROM saved_views WHERE id = ?`).run(id);
      return Number(result.changes) > 0;
    },

    async addWatcher(taskId: string, userId: string): Promise<import("../../../shared/types.js").TaskWatcher> {
      const now = new Date().toISOString();
      const insert = db.prepare(`INSERT OR IGNORE INTO task_watchers (task_id, user_id, created_at) VALUES (?, ?, ?)`);
      insert.run(taskId, userId, now);
      return { taskId, userId, createdAt: now };
    },

    async removeWatcher(taskId: string, userId: string): Promise<boolean> {
      const result = db.prepare(`DELETE FROM task_watchers WHERE task_id = ? AND user_id = ?`).run(taskId, userId);
      return Number(result.changes) > 0;
    },

    async listWatchers(taskId: string): Promise<import("../../../shared/types.js").TaskWatcher[]> {
      const rows = db.prepare(`SELECT * FROM task_watchers WHERE task_id = ?`).all(taskId) as Record<string, unknown>[];
      return rows.map(r => ({
        taskId: r.task_id as string,
        userId: r.user_id as string,
        createdAt: r.created_at as string,
      }));
    },

    async isWatching(taskId: string, userId: string): Promise<boolean> {
      const row = db.prepare(`SELECT 1 FROM task_watchers WHERE task_id = ? AND user_id = ?`).get(taskId, userId);
      return row !== undefined;
    },


    // ── Global Activity Feed ─────────────────────────────────────

    async getGlobalActivity(limit?: number): Promise<import("../../../shared/types.js").ActivityFeedItem[]> {
      const effectiveLimit = Math.min(limit ?? 50, 200);
      const items: import("../../../shared/types.js").ActivityFeedItem[] = [];

      // 1. Task creation events (most recent first)
      const taskRows = db.prepare(
        `SELECT id, feishu_user_id, command_text, created_at FROM tasks ORDER BY created_at DESC LIMIT ?`,
      ).all(effectiveLimit) as Array<Record<string, unknown>>;
      for (const row of taskRows) {
        items.push({
          type: "task.created",
          timestamp: row["created_at"] as string,
          actor: row["feishu_user_id"] as string,
          actorType: "feishu",
          summary: `Task created: ${(row["command_text"] as string).slice(0, 100)}`,
          details: { taskId: row["id"], commandText: row["command_text"] as string },
        });
      }

      // 2. Comments across all tasks
      const commentRows = db.prepare(
        `SELECT tc.*, t.command_text FROM task_comments tc JOIN tasks t ON tc.task_id = t.id ORDER BY tc.created_at DESC LIMIT ?`,
      ).all(effectiveLimit) as Array<Record<string, unknown>>;
      for (const row of commentRows) {
        items.push({
          type: "comment.added",
          timestamp: row["created_at"] as string,
          actor: row["author"] as string,
          actorType: row["author_type"] as string,
          summary: `Comment on "${(row["command_text"] as string).slice(0, 60)}": ${(row["body"] as string).slice(0, 80)}`,
          details: { taskId: row["task_id"], commentId: row["id"] },
        });
      }

      // 3. Notes across all tasks
      const noteRows = db.prepare(
        `SELECT tn.*, t.command_text FROM task_notes tn JOIN tasks t ON tn.task_id = t.id ORDER BY tn.created_at DESC LIMIT ?`,
      ).all(effectiveLimit) as Array<Record<string, unknown>>;
      for (const row of noteRows) {
        items.push({
          type: "note.added",
          timestamp: row["created_at"] as string,
          actor: row["author"] as string,
          actorType: "api",
          summary: `Note on "${(row["command_text"] as string).slice(0, 60)}": ${(row["body"] as string).slice(0, 80)}`,
          details: { taskId: row["task_id"], noteId: row["id"] },
        });
      }

      // 4. Subtask events across all tasks
      const subtaskRows = db.prepare(
        `SELECT ts.*, t.command_text FROM task_subtasks ts JOIN tasks t ON ts.parent_task_id = t.id ORDER BY ts.created_at DESC LIMIT ?`,
      ).all(effectiveLimit) as Array<Record<string, unknown>>;
      for (const row of subtaskRows) {
        items.push({
          type: "subtask.created",
          timestamp: row["created_at"] as string,
          actor: "system",
          actorType: "system",
          summary: `Subtask "${row["title"]}" on "${(row["command_text"] as string).slice(0, 60)}"`,
          details: { taskId: row["parent_task_id"], subtaskId: row["id"], title: row["title"] as string },
        });
      }

      // 5. Time entries across all tasks
      const timeRows = db.prepare(
        `SELECT te.*, t.command_text FROM time_entries te JOIN tasks t ON te.task_id = t.id ORDER BY te.created_at DESC LIMIT ?`,
      ).all(effectiveLimit) as Array<Record<string, unknown>>;
      for (const row of timeRows) {
        items.push({
          type: "time.logged",
          timestamp: row["created_at"] as string,
          actor: row["logged_by"] as string,
          actorType: "api",
          summary: `Time logged on "${(row["command_text"] as string).slice(0, 60)}": ${row["duration_minutes"]}min`,
          details: { taskId: row["task_id"], entryId: row["id"], durationMinutes: row["duration_minutes"] },
        });
      }

      // Sort all items by timestamp descending and return top N
      items.sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0));
      return items.slice(0, effectiveLimit);
    },

    // Task links methods
    async addTaskLink(taskId: string, title: string, url: string, addedBy: string): Promise<import("../../../shared/types.js").TaskLink> {
      const now = new Date().toISOString();
      const result = db.prepare(
        "INSERT INTO task_links (task_id, title, url, added_by, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(taskId, title, url, addedBy, now);
      return {
        id: Number(result.lastInsertRowid),
        taskId,
        title,
        url,
        addedBy,
        createdAt: now,
      };
    },

    async listTaskLinks(taskId: string): Promise<import("../../../shared/types.js").TaskLink[]> {
      const rows = db.prepare(
        "SELECT * FROM task_links WHERE task_id = ? ORDER BY created_at ASC"
      ).all(taskId) as Array<Record<string, unknown>>;
      return rows.map(row => ({
        id: row["id"] as number,
        taskId: row["task_id"] as string,
        title: row["title"] as string,
        url: row["url"] as string,
        addedBy: row["added_by"] as string,
        createdAt: row["created_at"] as string,
      }));
    },

    async deleteTaskLink(taskId: string, linkId: number): Promise<boolean> {
      const result = db.prepare(
        "DELETE FROM task_links WHERE id = ? AND task_id = ?"
      ).run(linkId, taskId);
      return Number(result.changes) > 0;
    },

  };
}
