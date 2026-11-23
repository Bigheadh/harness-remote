import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { TaskApiClient } from "../client.js";
import { countReadyNodes } from "./helpers.js";

export function registerExtendedTaskTools(server: McpServer, client: TaskApiClient): void {
  // set_task_reminder tool
  server.registerTool(
    "set_task_reminder",
    {
      description:
        "Set or clear a reminder time for a task. Pass a valid ISO 8601 datetime string to set, or null to clear. Reminders can be used to notify when a task needs attention.",
      inputSchema: {
        taskId: z.string().describe("The task ID to set the reminder for"),
        reminderAt: z
          .string()
          .nullable()
          .describe("ISO 8601 datetime string (e.g., '2026-06-15T09:00:00Z') or null to clear the reminder"),
      },
    },
    async (args) => {
      const { taskId, reminderAt } = args;

      try {
        const task = await client.setReminder(taskId, reminderAt);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: reminderAt
                  ? `Reminder set to ${reminderAt}`
                  : "Reminder cleared",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // set_task_command_text tool
  server.registerTool(
    "set_task_command_text",
    {
      description:
        "Update the command text of a task. Use this to correct typos, clarify instructions, or update the task's core command without losing its history, comments, or status. The command text is the original user request that triggered the task.",
      inputSchema: {
        taskId: z.string().describe("The task ID to update"),
        commandText: z
          .string()
          .describe("The new command text (non-empty string)"),
      },
    },
    async (args) => {
      const { taskId, commandText } = args;

      try {
        const task = await client.setTaskCommandText(taskId, commandText);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Command text updated (${commandText.length} chars)`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // set_task_estimated_minutes tool
  server.registerTool(
    "set_task_estimated_minutes",
    {
      description:
        "Set the estimated time in minutes for a task. This helps with time planning and can be compared against actual time spent (from time entries). Pass null to clear the estimate.",
      inputSchema: {
        taskId: z.string().describe("The task ID to set the estimate for"),
        estimatedMinutes: z
          .number()
          .min(0)
          .nullable()
          .describe("Estimated time in minutes (non-negative number), or null to clear"),
      },
    },
    async (args) => {
      const { taskId, estimatedMinutes } = args;

      try {
        const task = await client.setEstimatedMinutes(taskId, estimatedMinutes);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: estimatedMinutes !== null
                  ? `Estimated time set to ${estimatedMinutes} minutes`
                  : "Estimated time cleared",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // delete_task_comment tool
  server.registerTool(
    "delete_task_comment",
    {
      description:
        "Delete a comment from a task. This removes the comment permanently from the task's activity timeline. The comment is identified by its numeric ID (returned by list_task_comments).",
      inputSchema: {
        taskId: z.string().describe("The task ID that contains the comment"),
        commentId: z.number().int().positive().describe("The numeric comment ID to delete (from list_task_comments)"),
      },
    },
    async (args) => {
      const { taskId, commentId } = args;

      try {
        await client.deleteTaskComment(taskId, commentId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: `Comment ${commentId} deleted from task ${taskId}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // bulk_update_status tool
  server.registerTool(
    "bulk_update_status",
    {
      description:
        "Update the status of multiple tasks at once. Each task's status transition is validated individually — invalid transitions are skipped and reported in errors. Returns the count of successfully updated tasks and any errors.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to update"),
        status: z
          .enum(["pending", "picked", "running", "done", "failed"])
          .describe("The target status to set on all specified tasks"),
      },
    },
    async (args) => {
      const { ids, status } = args;

      try {
        const result = await client.bulkUpdateStatus(ids, status);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: `Updated ${result.updated} of ${ids.length} tasks to '${status}'${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // bulk_assign_tasks tool
  server.registerTool(
    "bulk_assign_tasks",
    {
      description:
        "Assign multiple tasks to a device at once. All specified tasks will be assigned to the given device. Returns the count of successfully assigned tasks and any errors.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to assign"),
        deviceId: z
          .string()
          .describe("The device ID to assign all tasks to"),
      },
    },
    async (args) => {
      const { ids, deviceId } = args;

      try {
        const result = await client.bulkAssign(ids, deviceId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: `Assigned ${result.updated} of ${ids.length} tasks to device '${deviceId}'${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // bulk_delete_tasks tool
  server.registerTool(
    "bulk_delete_tasks",
    {
      description:
        "Delete multiple tasks at once. This also deletes associated comments. Returns the count of successfully deleted tasks and any errors. WARNING: This operation is irreversible.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to delete"),
      },
    },
    async (args) => {
      const { ids } = args;

      try {
        const result = await client.bulkDelete(ids);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: `Deleted ${result.deleted} of ${ids.length} tasks${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Task Template Tools ──────────────────────────────────────────

  // set_task_dependencies tool
  server.registerTool(
    "set_task_dependencies",
    {
      description:
        "Set prerequisite dependencies for a task. The task will not be ready for processing until ALL its dependencies are completed (done/failed). Pass an empty array to clear all dependencies. Circular dependencies are prevented.",
      inputSchema: {
        taskId: z.string().describe("The task ID to set dependencies for"),
        dependsOn: z
          .array(z.string())
          .describe("Array of task IDs that must complete before this task is ready"),
      },
    },
    async (args) => {
      const { taskId, dependsOn } = args;
      try {
        const task = await client.setDependencies(taskId, dependsOn);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: dependsOn.length === 0
                  ? `All dependencies cleared for task ${taskId}`
                  : `Task ${taskId} now depends on ${dependsOn.length} task(s): ${dependsOn.join(", ")}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // get_task_dependencies tool
  server.registerTool(
    "get_task_dependencies",
    {
      description:
        "Get the dependency graph for a task. Returns: 1) tasks it depends on (prerequisites), 2) tasks that depend on it (dependents), 3) whether the task is blocked by unmet dependencies.",
      inputSchema: {
        taskId: z.string().describe("The task ID to check dependencies for"),
      },
    },
    async (args) => {
      try {
        const result = await client.getDependencies(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: result.blocked
                  ? `Task ${args.taskId} is BLOCKED — ${result.dependencies.filter((d) => d.status !== "done" && d.status !== "failed").length} prerequisite(s) not yet met`
                  : result.dependencies.length === 0
                    ? `Task ${args.taskId} has no dependencies`
                    : `Task ${args.taskId} is ready — all ${result.dependencies.length} prerequisite(s) met`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // remove_task_dependency tool
  server.registerTool(
    "remove_task_dependency",
    {
      description:
        "Remove a specific dependency from a task. The task will no longer wait for the removed prerequisite.",
      inputSchema: {
        taskId: z.string().describe("The task ID to remove a dependency from"),
        dependsOnId: z.string().describe("The dependency task ID to remove"),
      },
    },
    async (args) => {
      try {
        const task = await client.removeDependency(args.taskId, args.dependsOnId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Removed dependency ${args.dependsOnId} from task ${args.taskId}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // ── Task Relationship Tools (Phase 58) ──────────────────────

  // add_task_relationship tool
  server.registerTool(
    "add_task_relationship",
    {
      description:
        "Add a typed relationship between two tasks. Relationship types: depends_on (prerequisite), blocks (prevents other from starting), relates_to (informational link), duplicates (marks as duplicate of another task).",
      inputSchema: {
        taskId: z.string().describe("The source task ID"),
        relatedTaskId: z.string().describe("The target task ID to relate to"),
        relationshipType: z.enum(["depends_on", "blocks", "relates_to", "duplicates"]).describe("The type of relationship"),
      },
    },
    async (args) => {
      try {
        await client.addRelationship(args.taskId, args.relatedTaskId, args.relationshipType);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: `Added '${args.relationshipType}' relationship: task ${args.taskId} → task ${args.relatedTaskId}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // remove_task_relationship tool
  server.registerTool(
    "remove_task_relationship",
    {
      description:
        "Remove a relationship between two tasks. Optionally specify the relationship type to remove only that type; omit to remove all relationships between the tasks.",
      inputSchema: {
        taskId: z.string().describe("The source task ID"),
        relatedTaskId: z.string().describe("The target task ID"),
        relationshipType: z.enum(["depends_on", "blocks", "relates_to", "duplicates"]).optional().describe("Optional: remove only this relationship type. Omit to remove all."),
      },
    },
    async (args) => {
      try {
        await client.removeRelationship(args.taskId, args.relatedTaskId, args.relationshipType);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: args.relationshipType
                  ? `Removed '${args.relationshipType}' relationship: task ${args.taskId} ↔ task ${args.relatedTaskId}`
                  : `Removed all relationships: task ${args.taskId} ↔ task ${args.relatedTaskId}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // list_task_relationships tool
  server.registerTool(
    "list_task_relationships",
    {
      description:
        "List all relationships for a task (both outgoing and incoming). Returns each related task with its relationship type (depends_on, blocks, relates_to, duplicates).",
      inputSchema: {
        taskId: z.string().describe("The task ID to list relationships for"),
      },
    },
    async (args) => {
      try {
        const relationships = await client.listRelationships(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                taskId: args.taskId,
                totalRelationships: relationships.length,
                relationships,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // get_task_dependency_graph tool
  server.registerTool(
    "get_task_dependency_graph",
    {
      description:
        "Get the full dependency graph for a task — recursively traverses all upstream (prerequisites) and downstream (dependents) tasks. Returns a tree structure with node details, edge list for visualization, depth stats, and total node count. Useful for understanding complex task chains.",
      inputSchema: {
        taskId: z.string().describe("The task ID to get the dependency graph for"),
      },
    },
    async (args) => {
      try {
        const graph = await client.getDependencyGraph(args.taskId);
        const readyCount = countReadyNodes(graph);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...graph,
                message: graph.totalNodes === 1
                  ? `Task ${args.taskId} has no dependencies`
                  : `Dependency graph: ${graph.totalNodes} tasks, ${graph.edges.length} edges, max upstream depth ${graph.maxUpstreamDepth}, max downstream depth ${graph.maxDownstreamDepth}, ${readyCount} ready`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // ── Task Lock Tools ──────────────────────────────────────────

  // lock_task tool
  server.registerTool(
    "lock_task",
    {
      description:
        "Lock a task for exclusive processing by a specific device. Prevents other devices from picking up the same task. The lock has a configurable TTL (default 5 minutes) and automatically expires if not refreshed. Returns 409 if already locked by another device.",
      inputSchema: {
        taskId: z.string().describe("The task ID to lock"),
        deviceId: z
          .string()
          .optional()
          .describe("Device ID to lock for. If not provided, uses the configured deviceId."),
        ttlMs: z
          .number()
          .int()
          .min(30000)
          .max(3600000)
          .optional()
          .describe("Lock TTL in milliseconds. Min: 30s, Max: 1hr, Default: 300000 (5 min)"),
      },
    },
    async (args) => {
      try {
        const lock = await client.lockTask(args.taskId, args.deviceId, args.ttlMs);
        const ttlSec = Math.round((new Date(lock.expiresAt).getTime() - Date.now()) / 1000);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                lock,
                message: `Task ${args.taskId} locked by ${lock.lockedBy} for ${ttlSec}s (expires ${lock.expiresAt})`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // unlock_task tool
  server.registerTool(
    "unlock_task",
    {
      description:
        "Release a task lock. Only the device that locked the task can unlock it. Useful when a device finishes processing and wants to release the lock, or when a task needs to be made available to other devices again.",
      inputSchema: {
        taskId: z.string().describe("The task ID to unlock"),
        deviceId: z
          .string()
          .optional()
          .describe("Device ID that owns the lock. If not provided, uses the configured deviceId."),
      },
    },
    async (args) => {
      try {
        await client.unlockTask(args.taskId, args.deviceId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ok: true,
                message: `Task ${args.taskId} unlocked`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // check_task_lock tool
  server.registerTool(
    "check_task_lock",
    {
      description:
        "Check if a task is currently locked. Returns the lock details (who locked it, when, when it expires) or indicates the task is not locked.",
      inputSchema: {
        taskId: z.string().describe("The task ID to check lock status for"),
      },
    },
    async (args) => {
      try {
        const result = await client.getTaskLock(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...result,
                message: result.locked
                  ? `Task ${args.taskId} is locked by ${result.lock!.lockedBy} until ${result.lock!.expiresAt}`
                  : `Task ${args.taskId} is not locked`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // ── Export/Import Tools ──────────────────────────────────────────

  // retry_task tool
  server.registerTool(
    "retry_task",
    {
      description:
        "Retry a failed or completed task by resetting it back to pending status. Clears previous results. Only works on tasks in 'done' or 'failed' status.",
      inputSchema: {
        taskId: z.string().describe("The task ID to retry"),
      },
    },
    async (args) => {
      try {
        const task = await client.retryTask(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: "Task has been reset to pending and is ready for reprocessing.",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // clone_task tool
  server.registerTool(
    "clone_task",
    {
      description:
        "Clone an existing task to create a duplicate with the same command text, priority, and tags, but with a fresh 'pending' status and no results. Useful when you need to re-run the same command or create similar tasks.",
      inputSchema: {
        taskId: z.string().describe("The task ID to clone"),
      },
    },
    async (args) => {
      try {
        const task = await client.cloneTask(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task cloned successfully. New task ID: ${task.id}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // reopen_task tool
  server.registerTool(
    "reopen_task",
    {
      description:
        "Reopen a done or failed task back to 'pending' status. Clears previous results, processing timestamps, and increments the reopen counter. Only works on tasks in 'done' or 'failed' status.",
      inputSchema: {
        taskId: z.string().describe("The task ID to reopen"),
      },
    },
    async (args) => {
      try {
        const task = await client.reopenTask(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task reopened successfully (reopen #${task.reopenedCount ?? 1}). Status is now pending.`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // pin_task tool
  server.registerTool(
    "pin_task",
    {
      description:
        "Pin a task to the top of the task listing. Pinned tasks appear above all other tasks regardless of priority. Use this to keep important tasks visible and easily accessible.",
      inputSchema: {
        taskId: z.string().describe("The task ID to pin"),
      },
    },
    async (args) => {
      try {
        const task = await client.pinTask(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task pinned successfully. Task ${task.id} will now appear at the top of listings.`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // unpin_task tool
  server.registerTool(
    "unpin_task",
    {
      description:
        "Unpin a previously pinned task, returning it to normal priority-based ordering in the task listing.",
      inputSchema: {
        taskId: z.string().describe("The task ID to unpin"),
      },
    },
    async (args) => {
      try {
        const task = await client.unpinTask(args.taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task unpinned successfully. Task ${task.id} will now follow normal priority ordering.`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // forward_task tool
  server.registerTool(
    "forward_task",
    {
      description:
        "Forward a task to a different device for processing. The task is reassigned to the target device and reset to pending status. Optionally include a message that will be added as a forwarding comment.",
      inputSchema: {
        taskId: z.string().describe("The task ID to forward"),
        targetDeviceId: z.string().describe("The device ID to forward the task to"),
        message: z
          .string()
          .optional()
          .describe("Optional message to add as a forwarding comment"),
      },
    },
    async (args) => {
      try {
        const task = await client.forwardTask(args.taskId, args.targetDeviceId, args.message);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task forwarded to device '${args.targetDeviceId}'. Task has been reset to pending status.`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // ── Task Notes (internal annotations) ──────────────────────────

  // list_task_notes tool
  server.registerTool(
    "list_task_notes",
    {
      description:
        "List internal notes on a task. Notes are private annotations that are NOT shared back to the Feishu requester — they're for operator use only. Returns notes in chronological order (oldest first).",
      inputSchema: {
        taskId: z.string().describe("The task ID to list notes for"),
      },
    },
    async (args) => {
      const { taskId } = args;

      try {
        const notes = await client.listNotes(taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                notes,
                count: notes.length,
                message: notes.length === 0
                  ? "No internal notes on this task"
                  : `${notes.length} internal note(s)`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // add_task_note tool
  server.registerTool(
    "add_task_note",
    {
      description:
        "Add an internal note to a task. Notes are private annotations visible only to operators — they are NOT sent to the Feishu requester. Use notes for tracking context, decisions, or observations that shouldn't be shared externally.",
      inputSchema: {
        taskId: z.string().describe("The task ID to add a note to"),
        body: z.string().describe("The note text (internal, not shared with requester)"),
      },
    },
    async (args) => {
      const { taskId, body } = args;

      try {
        const note = await client.addNote(taskId, body);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                note,
                message: `Internal note added (id: ${note.id}). This note is NOT visible to the Feishu requester.`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // delete_task_note tool
  server.registerTool(
    "delete_task_note",
    {
      description:
        "Delete an internal note from a task. Notes are internal annotations NOT shared back to the Feishu requester. The note is identified by its numeric ID (returned by list_task_notes).",
      inputSchema: {
        taskId: z.string().describe("The task ID that contains the note"),
        noteId: z.number().int().positive().describe("The numeric note ID to delete (from list_task_notes)"),
      },
    },
    async (args) => {
      const { taskId, noteId } = args;

      try {
        await client.deleteTaskNote(taskId, noteId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: `Note ${noteId} deleted from task ${taskId}`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // list_user_tasks tool
  server.registerTool(
    "list_user_tasks",
    {
      description:
        "Find all tasks created by a specific Feishu user. Returns tasks sorted by creation time (newest first). Useful for tracking a user's task history and current workload.",
      inputSchema: {
        userId: z.string().describe("The Feishu user ID to search tasks for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of tasks to return. Default: 20, max: 100"),
      },
    },
    async (args) => {
      const { userId, limit } = args;

      try {
        const tasks = await client.listTasksByUser(userId, limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { tasks, count: tasks.length, userId },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Task Subtasks ──────────────────────────────────────────

  // list_subtasks tool
  server.registerTool(
    "list_subtasks",
    {
      description: "List all subtasks for a given parent task. Subtasks are independently trackable child tasks with their own status.",
      inputSchema: {
        taskId: z.string().describe("The parent task ID to list subtasks for"),
      },
    },
    async (args) => {
      const { taskId } = args;

      try {
        const subtasks = await client.listSubtasks(taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ subtasks, count: subtasks.length, taskId }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // create_subtask tool
  server.registerTool(
    "create_subtask",
    {
      description: "Create a new subtask under a parent task. Subtasks are independently trackable child tasks.",
      inputSchema: {
        taskId: z.string().describe("The parent task ID"),
        title: z.string().describe("Short title for the subtask"),
        commandText: z.string().describe("The command or description for the subtask"),
      },
    },
    async (args) => {
      const { taskId, title, commandText } = args;

      try {
        const subtask = await client.createSubtask(taskId, title, commandText);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ subtask }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // update_subtask_status tool
  server.registerTool(
    "update_subtask_status",
    {
      description: "Update the status of a subtask. Valid transitions follow the same state machine as parent tasks: pending -> picked -> running -> done/failed.",
      inputSchema: {
        taskId: z.string().describe("The parent task ID"),
        subtaskId: z.string().describe("The subtask ID"),
        status: z
          .enum(["pending", "picked", "running", "done", "failed"])
          .describe("The new status for the subtask"),
      },
    },
    async (args) => {
      const { taskId, subtaskId, status } = args;

      try {
        const subtask = await client.updateSubtaskStatus(taskId, subtaskId, status);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ subtask }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // report_subtask_result tool
  server.registerTool(
    "report_subtask_result",
    {
      description: "Report the result of a subtask. This sets the subtask to done or failed status and saves the result summary.",
      inputSchema: {
        taskId: z.string().describe("The parent task ID"),
        subtaskId: z.string().describe("The subtask ID"),
        success: z.boolean().describe("Whether the subtask completed successfully"),
        summary: z.string().describe("Brief summary of the result"),
        details: z.string().optional().describe("Optional detailed description of the result"),
      },
    },
    async (args) => {
      const { taskId, subtaskId, success, summary, details } = args;

      try {
        const subtask = await client.reportSubtaskResult(taskId, subtaskId, success, summary, details);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ subtask }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // delete_subtask tool
  server.registerTool(
    "delete_subtask",
    {
      description: "Delete a subtask from a parent task. This permanently removes the subtask.",
      inputSchema: {
        taskId: z.string().describe("The parent task ID"),
        subtaskId: z.string().describe("The subtask ID to delete"),
      },
    },
    async (args) => {
      const { taskId, subtaskId } = args;

      try {
        await client.deleteSubtask(taskId, subtaskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, message: `Subtask ${subtaskId} deleted` }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // archive_task tool
  server.registerTool(
    "archive_task",
    {
      description:
        "Archive (soft-delete) a completed task to remove it from the active view. The task is not permanently deleted — it can be restored with unarchive_task. Archived tasks are hidden from normal listings but can be viewed with list_archived_tasks.",
      inputSchema: {
        taskId: z.string().describe("The task ID to archive"),
      },
    },
    async (args) => {
      const { taskId } = args;

      try {
        const task = await client.archiveTask(taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task archived successfully. Use unarchive_task to restore it.`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // unarchive_task tool
  server.registerTool(
    "unarchive_task",
    {
      description:
        "Restore an archived task back to the active view. The task returns to its previous status and will appear in normal task listings again.",
      inputSchema: {
        taskId: z.string().describe("The task ID to unarchive (restore)"),
      },
    },
    async (args) => {
      const { taskId } = args;

      try {
        const task = await client.unarchiveTask(taskId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                task,
                message: `Task restored from archive.`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // list_archived_tasks tool
  server.registerTool(
    "list_archived_tasks",
    {
      description:
        "List tasks that have been archived (soft-deleted). These tasks are hidden from normal listings. Use this to review archived tasks or find ones to restore.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of archived tasks to return. Default: 20, max: 100"),
      },
    },
    async (args) => {
      const { limit } = args;

      try {
        const tasks = await client.listArchivedTasks(limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ tasks, count: tasks.length }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // bulk_archive_tasks tool
  server.registerTool(
    "bulk_archive_tasks",
    {
      description:
        "Archive (soft-delete) multiple tasks at once. Archived tasks are hidden from normal listings but can be restored with bulk_unarchive_tasks. Returns the count of successfully archived tasks and any errors.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to archive (1-100 IDs)"),
      },
    },
    async (args) => {
      const { ids } = args;
      try {
        const result = await client.bulkArchiveTasks(ids);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                archived: result.archived,
                errors: result.errors,
                message: result.archived > 0
                  ? `Archived ${result.archived} task(s)`
                  : "No tasks were archived",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // bulk_unarchive_tasks tool
  server.registerTool(
    "bulk_unarchive_tasks",
    {
      description:
        "Restore multiple archived tasks at once. Returns the count of successfully restored tasks and any errors.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to restore (1-100 IDs)"),
      },
    },
    async (args) => {
      const { ids } = args;
      try {
        const result = await client.bulkUnarchiveTasks(ids);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                restored: result.restored,
                errors: result.errors,
                message: result.restored > 0
                  ? `Restored ${result.restored} task(s)`
                  : "No tasks were restored",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // bulk_update_priority tool
  server.registerTool(
    "bulk_update_priority",
    {
      description:
        "Update the priority of multiple tasks at once. Changes all specified tasks to the given priority level (low, normal, high, urgent). Returns the count of successfully updated tasks and any errors.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to update (1-100 IDs)"),
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .describe("New priority for all specified tasks"),
      },
    },
    async (args) => {
      const { ids, priority } = args;
      try {
        const result = await client.bulkUpdatePriority(ids, priority);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                updated: result.updated,
                errors: result.errors,
                priority,
                message: result.updated > 0
                  ? `Updated ${result.updated} task(s) to ${priority} priority`
                  : "No tasks were updated",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // bulk_update_due_date tool
  server.registerTool(
    "bulk_update_due_date",
    {
      description:
        "Update the due date of multiple tasks at once. Sets all specified tasks to the given due date (ISO 8601 format). Pass null to clear due dates. Returns the count of successfully updated tasks and any errors.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to update (1-100 IDs)"),
        dueDate: z
          .string()
          .nullable()
          .describe("New due date in ISO 8601 format (e.g. '2026-06-15T23:59:59.000Z'), or null to clear"),
      },
    },
    async (args) => {
      const { ids, dueDate } = args;
      try {
        const result = await client.bulkUpdateDueDate(ids, dueDate);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                updated: result.updated,
                errors: result.errors,
                dueDate,
                message: result.updated > 0
                  ? `Updated ${result.updated} task(s) due date to ${dueDate ?? "cleared"}`
                  : "No tasks were updated",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // bulk_clone_tasks tool
  server.registerTool(
    "bulk_clone_tasks",
    {
      description:
        "Clone multiple tasks at once. Each cloned task starts in 'pending' status with the same command text, priority, tags, and description as the original. Cloned tasks are unassigned. Returns the count of successfully cloned tasks, their new IDs, and any errors.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe("Array of task IDs to clone (1-100 IDs)"),
      },
    },
    async (args) => {
      const { ids } = args;
      try {
        const result = await client.bulkCloneTasks(ids);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                cloned: result.cloned,
                taskIds: result.taskIds,
                errors: result.errors,
                message: result.cloned > 0
                  ? `Cloned ${result.cloned} task(s) successfully`
                  : "No tasks were cloned",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // escalate_overdue_priorities tool
  server.registerTool(
    "escalate_overdue_priorities",
    {
      description:
        "Automatically escalate priority of overdue tasks. Scans all tasks that have passed their due date and bumps their priority one level (low→normal, normal→high, high→urgent). Tasks already at 'urgent' are skipped. Returns the list of escalated tasks.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.escalateOverduePriorities();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                escalated: result.escalated,
                tasks: result.tasks,
                message: result.escalated > 0
                  ? `Escalated priority for ${result.escalated} overdue task(s)`
                  : "No overdue tasks needed escalation",
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // get_kanban_board tool
  server.registerTool(
    "get_kanban_board",
    {
      description:
        "Get a Kanban board view of tasks grouped by status. Returns columns for pending, picked, running, done, and failed statuses, each containing up to limit tasks sorted by priority (urgent first) then creation time. Useful for visualizing task workflow and understanding the current workload distribution across processing stages.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum tasks per column. Default: 50, max: 100"),
        deviceId: z
          .string()
          .optional()
          .describe("Filter by assigned device ID. If not provided, uses the configured deviceId."),
      },
    },
    async (args) => {
      const { limit, deviceId } = args;
      try {
        const board = await client.getKanbanBoard(limit, deviceId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(board, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // list_saved_views tool
  server.registerTool(
    "list_saved_views",
    {
      description:
        "List all saved filter views. Saved views let you save filter combinations (status, priority, tags, device, date range, query) as named presets for quick access. Optionally filter by creator.",
      inputSchema: {
        createdBy: z.string().optional().describe("Filter views by creator username. Omit to list all views."),
      },
    },
    async (args) => {
      try {
        const views = await client.listSavedViews(args.createdBy);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ views, count: views.length }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // get_saved_view tool
  server.registerTool(
    "get_saved_view",
    {
      description:
        "Get the details of a saved view including its filter parameters. Use this to inspect what filters a saved view contains before applying them.",
      inputSchema: {
        viewId: z.string().describe("The ID of the saved view to retrieve"),
      },
    },
    async (args) => {
      try {
        const view = await client.getSavedView(args.viewId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(view, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // create_saved_view tool
  server.registerTool(
    "create_saved_view",
    {
      description:
        "Create a new saved view with a name and filter parameters. Filters can include: status (pending/picked/running/done/failed), priority (low/normal/high/urgent), deviceId, tags (array), fromDate, toDate, query (full-text search). The view is saved for quick reuse.",
      inputSchema: {
        name: z.string().describe("A descriptive name for the saved view (e.g., 'My urgent tasks', 'Failed jobs today')"),
        filters: z
          .object({
            status: z.enum(["pending", "picked", "running", "done", "failed"]).optional().describe("Filter by task status"),
            priority: z.enum(["low", "normal", "high", "urgent"]).optional().describe("Filter by priority"),
            deviceId: z.string().optional().describe("Filter by assigned device ID"),
            tags: z.array(z.string()).optional().describe("Filter by tags (tasks must have ALL listed tags)"),
            fromDate: z.string().optional().describe("Only show tasks created after this ISO date"),
            toDate: z.string().optional().describe("Only show tasks created before this ISO date"),
            query: z.string().optional().describe("Full-text search query"),
          })
          .describe("The filter parameters to save"),
      },
    },
    async (args) => {
      try {
        const view = await client.createSavedView(args.name, args.filters);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `Saved view '${view.name}' created`, view }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // update_saved_view tool
  server.registerTool(
    "update_saved_view",
    {
      description:
        "Update an existing saved view's name or filter parameters. You can update one or both fields.",
      inputSchema: {
        viewId: z.string().describe("The ID of the saved view to update"),
        name: z.string().optional().describe("New name for the view"),
        filters: z
          .object({
            status: z.enum(["pending", "picked", "running", "done", "failed"]).optional(),
            priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
            deviceId: z.string().optional(),
            tags: z.array(z.string()).optional(),
            fromDate: z.string().optional(),
            toDate: z.string().optional(),
            query: z.string().optional(),
          })
          .optional()
          .describe("New filter parameters (replaces existing filters entirely)"),
      },
    },
    async (args) => {
      try {
        const updates: { name?: string; filters?: Record<string, unknown> } = {};
        if (args.name !== undefined) updates.name = args.name;
        if (args.filters !== undefined) updates.filters = args.filters;
        const view = await client.updateSavedView(args.viewId, updates);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `Saved view '${view.name}' updated`, view }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // delete_saved_view tool
  server.registerTool(
    "delete_saved_view",
    {
      description: "Permanently delete a saved view. This cannot be undone.",
      inputSchema: {
        viewId: z.string().describe("The ID of the saved view to delete"),
      },
    },
    async (args) => {
      try {
        await client.deleteSavedView(args.viewId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: `Saved view '${args.viewId}' deleted` }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // apply_saved_view tool
  server.registerTool(
    "apply_saved_view",
    {
      description:
        "Apply a saved view by executing its stored filters against the task database. Returns matching tasks. This is the primary way to use saved views — instead of manually extracting filters and calling search_tasks, use this tool to instantly get results from a named view.",
      inputSchema: {
        viewId: z.string().describe("The ID of the saved view to apply"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of tasks to return (default: 20, max: 100)"),
      },
    },
    async (args) => {
      try {
        const tasks = await client.applySavedView(args.viewId);
        const limited = args.limit ? tasks.slice(0, args.limit) : tasks.slice(0, 20);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  viewId: args.viewId,
                  tasks: limited.map((t) => ({
                    id: t.id,
                    status: t.status,
                    priority: t.priority,
                    commandText: t.commandText.substring(0, 120),
                    tags: t.tags,
                    createdAt: t.createdAt,
                  })),
                  total: tasks.length,
                  returned: limited.length,
                  message: `Applied saved view: ${tasks.length} task(s) matched`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // watch_task tool
  server.registerTool(
    "watch_task",
    {
      description: "Subscribe to updates for a task. You will be notified of status changes, comments, and other updates to this task.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to watch"),
      },
    },
    async (args: Record<string, unknown>) => {
      try {
        const watcher = await client.watchTask(args.taskId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: "Now watching task", watcher }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // unwatch_task tool
  server.registerTool(
    "unwatch_task",
    {
      description: "Unsubscribe from updates for a task. You will no longer receive notifications for this task.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to stop watching"),
      },
    },
    async (args: Record<string, unknown>) => {
      try {
        const result = await client.unwatchTask(args.taskId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: result.removed ? "Unwatched task" : "Not watching this task", removed: result.removed }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // list_task_watchers tool
  server.registerTool(
    "list_task_watchers",
    {
      description: "List all users who are watching a specific task for updates.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to list watchers for"),
      },
    },
    async (args: Record<string, unknown>) => {
      try {
        const watchers = await client.listTaskWatchers(args.taskId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ watchers, count: watchers.length }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // ===== Time Entry Tools =====

  // list_time_entries tool
  server.registerTool(
    "list_time_entries",
    {
      description: "List all time entries (manual logs + timer sessions) for a task. Shows start/end times, duration, and description.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to list time entries for"),
      },
    },
    async (args: Record<string, unknown>) => {
      try {
        const entries = await client.listTimeEntries(args.taskId as string);
        const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ entries, count: entries.length, totalMinutes }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // log_time_entry tool
  server.registerTool(
    "log_time_entry",
    {
      description: "Log a time entry for a task. Can be a manual log (with both start and end times) or a timer start (without end time). Duration is auto-computed from timestamps if both are provided.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to log time for"),
        startedAt: z.string().optional().describe("ISO 8601 start timestamp (defaults to now)"),
        endedAt: z.string().optional().describe("ISO 8601 end timestamp (omit for running timer)"),
        durationMinutes: z.number().optional().describe("Manual duration in minutes (overrides timestamp computation)"),
        description: z.string().optional().describe("Description of what was done during this time"),
        loggedBy: z.string().optional().describe("Who logged this entry (defaults to authenticated user)"),
      },
    },
    async (args: Record<string, unknown>) => {
      try {
        const entry = await client.createTimeEntry(args.taskId as string, {
          startedAt: args.startedAt as string | undefined,
          endedAt: args.endedAt as string | undefined,
          durationMinutes: args.durationMinutes as number | undefined,
          description: args.description as string | undefined,
          loggedBy: args.loggedBy as string | undefined,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ entry, message: `Time entry logged: ${entry.durationMinutes} minutes` }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // start_time_tracking tool
  server.registerTool(
    "start_time_tracking",
    {
      description: "Start a timer for a task. Creates a running time entry with no end time. Use stop_time_tracking to stop it.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task to start tracking time for"),
        description: z.string().optional().describe("Optional description of what work is being done"),
      },
    },
    async (args: Record<string, unknown>) => {
      try {
        const entry = await client.startTimeEntry(args.taskId as string, args.description as string | undefined);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ entry, message: `Timer started at ${entry.startedAt}` }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // stop_time_tracking tool
  server.registerTool(
    "stop_time_tracking",
    {
      description: "Stop a running time entry timer. Computes duration from start time to now.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task"),
        entryId: z.string().describe("The ID of the running time entry to stop"),
      },
    },
    async (args: Record<string, unknown>) => {
      try {
        const entry = await client.stopTimeEntry(args.taskId as string, args.entryId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ entry, message: `Timer stopped: ${entry.durationMinutes} minutes logged` }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // delete_time_entry tool
  server.registerTool(
    "delete_time_entry",
    {
      description: "Delete a time entry from a task. Use this to remove incorrect or duplicate time logs.",
      inputSchema: {
        taskId: z.string().describe("The ID of the task"),
        entryId: z.string().describe("The ID of the time entry to delete"),
      },
    },
    async (args: Record<string, unknown>) => {
      try {
        await client.deleteTimeEntry(args.taskId as string, args.entryId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ deleted: true, message: "Time entry deleted" }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // get_task_activity tool
  server.registerTool(
    "get_task_activity",
    {
      description:
        "Get the combined chronological activity feed for a task. Returns a merged timeline of all task events: creation, status changes, result reports, comments, notes, subtask events, assignments, dependency changes, SLA events, and more. Each entry includes the event type, timestamp, actor, and a human-readable summary. Use this to review the full history and audit trail of a task.",
      inputSchema: {
        taskId: z.string().describe("The task ID to get the activity feed for"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of activity entries to return (default: 50, max: 200)"),
      },
    },
    async (args) => {
      try {
        const { taskId, limit } = args as { taskId: string; limit?: number };
        const items = await client.getActivityFeed(taskId, limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ items, count: items.length }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // get_global_activity tool
  server.registerTool(
    "get_global_activity",
    {
      description:
        "Get a combined chronological activity feed across ALL tasks. Returns recent task creations, comments, notes, subtask events, and time entries sorted by recency. Useful for getting an overview of recent project activity.",
      inputSchema: {
        limit: z.number().optional().describe("Maximum number of activity items to return (default: 50, max: 200)"),
      },
    },
    async (args) => {
      try {
        const items = await client.getGlobalActivity(args.limit as number | undefined);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                items,
                count: items.length,
                message: items.length === 0 ? "No recent activity found" : `Found ${items.length} recent activity item(s)`,
              }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  // ─── Module (Epic) Tools ───

  // Task links tools
  server.registerTool(
    "list_task_links",
    {
      description:
        "List all external links attached to a task. Links are URLs to related resources like PRs, documentation, design docs, or reference materials.",
      inputSchema: {
        taskId: z.string().describe("The task ID to list links for"),
      },
    },
    async (args) => {
      try {
        const links = await client.listTaskLinks(args.taskId as string);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ links, count: links.length }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "add_task_link",
    {
      description:
        "Add an external link to a task. Use this to attach PRs, documentation, design references, or any URL relevant to the task.",
      inputSchema: {
        taskId: z.string().describe("The task ID to add a link to"),
        title: z.string().describe("Display title for the link (e.g. 'PR #123', 'Design Doc')"),
        url: z.string().describe("The URL to attach"),
      },
    },
    async (args) => {
      try {
        const link = await client.addTaskLink(
          args.taskId as string,
          args.title as string,
          args.url as string,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ link, message: `Link added: ${link.title} (${link.url})` }, null, 2),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "remove_task_link",
    {
      description:
        "Remove an external link from a task. Use list_task_links first to find the link ID.",
      inputSchema: {
        taskId: z.string().describe("The task ID"),
        linkId: z.number().describe("The numeric ID of the link to remove"),
      },
    },
    async (args) => {
      try {
        await client.deleteTaskLink(args.taskId as string, args.linkId as number);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, message: "Link removed" }),
            },
          ],
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );
}
