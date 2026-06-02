import type { TaskStore } from "../tasks/store.js";
import type { ScheduledTask, TaskStatus, TaskPriority } from "../../shared/types.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger({ level: "info" });

/** Calculate the next run time based on frequency */
export function calculateNextRun(
  frequency: ScheduledTask["frequency"],
  lastRunAt?: string,
): string {
  const base = lastRunAt ? new Date(lastRunAt) : new Date();

  switch (frequency) {
    case "once":
      // For "once", set to far future so it never runs again
      return "9999-12-31T23:59:59.999Z";
    case "hourly":
      base.setHours(base.getHours() + 1);
      return base.toISOString();
    case "daily":
      base.setDate(base.getDate() + 1);
      base.setHours(base.getHours() || 9); // Default to 9 AM
      return base.toISOString();
    case "weekly":
      base.setDate(base.getDate() + 7);
      return base.toISOString();
    case "monthly":
      base.setMonth(base.getMonth() + 1);
      return base.toISOString();
    default:
      // Fallback to daily
      base.setDate(base.getDate() + 1);
      return base.toISOString();
  }
}

/** Process one scheduled task — create a real task from it */
async function processScheduledTask(
  store: TaskStore,
  scheduled: ScheduledTask,
): Promise<void> {
  const now = new Date().toISOString();

  // Create the task from the schedule
  const task = await store.createTask({
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source: "feishu",
    feishuMessageId: `sched_${scheduled.id}_${Date.now()}`,
    feishuChatId: "",
    feishuUserId: scheduled.createdBy,
    commandText: scheduled.commandText,
    status: "pending" as TaskStatus,
    priority: (scheduled.priority ?? "normal") as TaskPriority,
    tags: scheduled.tags,
    assignedDeviceId: scheduled.assignedDeviceId,
    createdAt: now,
    updatedAt: now,
  });

  // Calculate next run time
  const nextRunAt = calculateNextRun(scheduled.frequency, scheduled.lastRunAt);

  // Mark as run
  await store.markScheduledTaskRun(scheduled.id, nextRunAt, task.id);

  log.info(
    { scheduleId: scheduled.id, taskId: task.id, frequency: scheduled.frequency },
    "Scheduled task fired — created task",
  );
}

/** Start the scheduler loop. Returns a cleanup function to stop it. */
export function startScheduler(
  store: TaskStore,
  intervalMs: number = 60_000, // Default: check every 60 seconds
): () => void {
  log.info({ intervalMs }, "Starting task scheduler");

  const timer = setInterval(async () => {
    try {
      const now = new Date().toISOString();
      const due = await store.getDueScheduledTasks(now);

      if (due.length === 0) return;

      log.info({ count: due.length }, "Processing due scheduled tasks");

      for (const scheduled of due) {
        try {
          await processScheduledTask(store, scheduled);
        } catch (err) {
          log.error(
            { scheduleId: scheduled.id, err },
            "Failed to process scheduled task",
          );
        }
      }
    } catch (err) {
      log.error({ err }, "Scheduler tick failed");
    }
  }, intervalMs);

  // Prevent the timer from keeping the process alive during graceful shutdown
  timer.unref();

  return () => {
    log.info({}, "Stopping task scheduler");
    clearInterval(timer);
  };
}
