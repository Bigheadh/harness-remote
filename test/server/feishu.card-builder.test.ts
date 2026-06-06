import { describe, it, expect } from "vitest";
import {
  buildTaskCreatedCard,
  buildTaskResultCard,
  buildTaskStatusCard,
  buildCustomCard,
  buildSlaBreachCard,
  buildWatcherNotificationCard,
  serializeCard,
} from "../../src/server/feishu/card-builder.js";
import type { Task } from "../../src/shared/types.js";

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

describe("card-builder", () => {
  describe("buildTaskCreatedCard", () => {
    it("creates a card with basic task info", () => {
      const task = makeTask();
      const card = buildTaskCreatedCard(task);

      expect(card.config.wide_screen_mode).toBe(true);
      expect(card.header.title.content).toBe("📋 New Task Created");
      expect(card.header.template).toBe("blue");
      expect(card.elements.length).toBeGreaterThanOrEqual(3); // command, priority, separator, note
    });

    it("includes command text", () => {
      const task = makeTask({ commandText: "Deploy to production" });
      const card = buildTaskCreatedCard(task);
      const commandEl = card.elements.find(
        (e) => e.text?.content?.includes("Deploy to production"),
      );
      expect(commandEl).toBeDefined();
    });

    it("includes priority", () => {
      const task = makeTask({ priority: "urgent" });
      const card = buildTaskCreatedCard(task);
      const priorityEl = card.elements.find((e) =>
        e.text?.content?.includes("Urgent"),
      );
      expect(priorityEl).toBeDefined();
    });

    it("includes tags when present", () => {
      const task = makeTask({ tags: ["deploy", "critical"] });
      const card = buildTaskCreatedCard(task);
      const tagsEl = card.elements.find((e) =>
        e.text?.content?.includes("Tags"),
      );
      expect(tagsEl).toBeDefined();
    });

    it("omits tags when not present", () => {
      const task = makeTask({ tags: undefined });
      const card = buildTaskCreatedCard(task);
      const tagsEl = card.elements.find((e) =>
        e.text?.content?.includes("Tags"),
      );
      expect(tagsEl).toBeUndefined();
    });

    it("includes due date when present", () => {
      const task = makeTask({ dueDate: "2026-06-15" });
      const card = buildTaskCreatedCard(task);
      const dueEl = card.elements.find((e) =>
        e.text?.content?.includes("2026-06-15"),
      );
      expect(dueEl).toBeDefined();
    });

    it("includes task ID in note", () => {
      const task = makeTask({ id: "task_xyz_999" });
      const card = buildTaskCreatedCard(task);
      const noteEl = card.elements.find((e) => e.tag === "note");
      expect(noteEl).toBeDefined();
      expect(noteEl!.elements![0].content).toContain("task_xyz_999");
    });
  });

  describe("buildTaskResultCard", () => {
    it("creates a success card", () => {
      const task = makeTask();
      const card = buildTaskResultCard(task, true, "All tests passed");

      expect(card.header.title.content).toBe("✅ Task Completed");
      expect(card.header.template).toBe("green");
    });

    it("creates a failure card", () => {
      const task = makeTask();
      const card = buildTaskResultCard(task, false, "Build failed");

      expect(card.header.title.content).toBe("❌ Task Failed");
      expect(card.header.template).toBe("red");
    });

    it("includes summary", () => {
      const task = makeTask();
      const card = buildTaskResultCard(task, true, "Deployed v1.2.3");
      const summaryEl = card.elements.find((e) =>
        e.text?.content?.includes("Deployed v1.2.3"),
      );
      expect(summaryEl).toBeDefined();
    });

    it("includes details when provided", () => {
      const task = makeTask();
      const card = buildTaskResultCard(
        task,
        true,
        "Done",
        "Detailed log output here",
      );
      const detailEl = card.elements.find((e) =>
        e.text?.content?.includes("Detailed log output here"),
      );
      expect(detailEl).toBeDefined();
    });

    it("omits details when not provided", () => {
      const task = makeTask();
      const card = buildTaskResultCard(task, true, "Done");
      // Should have: status, summary, separator, note (4 elements)
      expect(card.elements.length).toBe(4);
    });
  });

  describe("buildTaskStatusCard", () => {
    it("creates a status change card", () => {
      const task = makeTask({ status: "running" });
      const card = buildTaskStatusCard(task, "pending");

      expect(card.header.title.content).toBe("🔄 Task Status Updated");
      expect(card.header.template).toBe("orange"); // running color
    });

    it("includes status transition", () => {
      const task = makeTask({ status: "done" });
      const card = buildTaskStatusCard(task, "running");
      const statusEl = card.elements.find((e) =>
        e.text?.content?.includes("Running") && e.text?.content?.includes("Done"),
      );
      expect(statusEl).toBeDefined();
    });
  });

  describe("buildCustomCard", () => {
    it("creates a card with custom title and body", () => {
      const card = buildCustomCard("Custom Title", "**Hello** world");
      expect(card.header.title.content).toBe("Custom Title");
      expect(card.elements[0].text?.content).toBe("**Hello** world");
    });

    it("defaults to blue template", () => {
      const card = buildCustomCard("Title", "Body");
      expect(card.header.template).toBe("blue");
    });
  });

  describe("serializeCard", () => {
    it("serializes a card to valid JSON string", () => {
      const card = buildCustomCard("Test", "Body");
      const json = serializeCard(card);
      const parsed = JSON.parse(json);
      expect(parsed.header.title.content).toBe("Test");
    });
  });

  describe("buildSlaBreachCard", () => {
    it("creates a breach card with red template", () => {
      const task = makeTask();
      const card = buildSlaBreachCard(task, "Response Time SLA", "breach", 60, 75);
      expect(card.header.template).toBe("red");
      expect(card.header.title.content).toContain("SLA Breached");
    });

    it("creates a warning card with orange template", () => {
      const task = makeTask();
      const card = buildSlaBreachCard(task, "Response Time SLA", "warning", 60, 50);
      expect(card.header.template).toBe("orange");
      expect(card.header.title.content).toContain("SLA Warning");
    });

    it("includes task details in the card", () => {
      const task = makeTask({ commandText: "Deploy to prod", priority: "urgent" });
      const card = buildSlaBreachCard(task, "Deploy SLA", "breach", 30, 45);
      const body = JSON.stringify(card);
      expect(body).toContain("Deploy to prod");
      expect(body).toContain("Urgent");
      expect(body).toContain("Deploy SLA");
    });

    it("includes target and elapsed times", () => {
      const task = makeTask();
      const card = buildSlaBreachCard(task, "Test SLA", "breach", 120, 135);
      const body = JSON.stringify(card);
      expect(body).toContain("120 min");
      expect(body).toContain("135 min");
    });

    it("includes tags when present", () => {
      const task = makeTask({ tags: ["production", "urgent"] });
      const card = buildSlaBreachCard(task, "Test SLA", "breach", 60, 90);
      const body = JSON.stringify(card);
      expect(body).toContain("production");
      expect(body).toContain("urgent");
    });

    it("omits tags section when no tags", () => {
      const task = makeTask({ tags: [] });
      const card = buildSlaBreachCard(task, "Test SLA", "warning", 60, 50);
      const body = JSON.stringify(card);
      expect(body).not.toContain("**Tags:**");
    });
  });

  describe("buildWatcherNotificationCard", () => {
    it("creates a card with task info and status transition", () => {
      const task = makeTask({ status: "running" });
      const card = buildWatcherNotificationCard(task, "pending", "running", "testuser");
      expect(card.config.wide_screen_mode).toBe(true);
      expect(card.header.title.content).toContain("Watched Task Updated");
      expect(card.elements.length).toBeGreaterThanOrEqual(5);
    });

    it("shows status transition from previous to new", () => {
      const task = makeTask({ status: "done" });
      const card = buildWatcherNotificationCard(task, "running", "done", "testuser");
      const body = JSON.stringify(card);
      expect(body).toContain("Running");
      expect(body).toContain("Done");
    });

    it("includes task ID and command", () => {
      const task = makeTask({ id: "task_xyz", commandText: "Deploy app" });
      const card = buildWatcherNotificationCard(task, "pending", "running", "testuser");
      const body = JSON.stringify(card);
      expect(body).toContain("task_xyz");
      expect(body).toContain("Deploy app");
    });

    it("includes priority", () => {
      const task = makeTask({ priority: "urgent" });
      const card = buildWatcherNotificationCard(task, "pending", "running", "testuser");
      const body = JSON.stringify(card);
      expect(body).toContain("Urgent");
    });

    it("includes tags when present", () => {
      const task = makeTask({ tags: ["deploy", "production"] });
      const card = buildWatcherNotificationCard(task, "pending", "running", "testuser");
      const body = JSON.stringify(card);
      expect(body).toContain("deploy");
      expect(body).toContain("production");
    });

    it("omits tags when empty", () => {
      const task = makeTask({ tags: [] });
      const card = buildWatcherNotificationCard(task, "pending", "running", "testuser");
      const body = JSON.stringify(card);
      expect(body).not.toContain("**Tags:**");
    });

    it("includes description when present", () => {
      const task = makeTask({ description: "Important deployment" });
      const card = buildWatcherNotificationCard(task, "pending", "running", "testuser");
      const body = JSON.stringify(card);
      expect(body).toContain("Important deployment");
    });

    it("truncates long descriptions", () => {
      const longDesc = "x".repeat(300);
      const task = makeTask({ description: longDesc });
      const card = buildWatcherNotificationCard(task, "pending", "running", "testuser");
      const body = JSON.stringify(card);
      expect(body).toContain("...");
      expect(body).not.toContain(longDesc);
    });

    it("serializes to valid JSON", () => {
      const task = makeTask();
      const card = buildWatcherNotificationCard(task, "pending", "running", "testuser");
      const json = serializeCard(card);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
});
