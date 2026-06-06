# Research: SLA Breach Notifications —借鉴 from Popular Open Source Projects

**Date:** 2026-06-07
**Direction:** Task Management Notification Patterns

## Search Results

### Hot Open Source Projects Analyzed

| Project | Stars | Relevance |
|---------|-------|-----------|
| microsoft/playwright-mcp | 33,567 | MCP server patterns |
| activepieces/activepieces | 22,586 | Workflow automation with triggers/actions |
| GLips/Figma-Context-MCP | 15,007 | MCP server architecture |
| modelcontextprotocol/inspector | 10,013 | MCP testing patterns |
| JordanKnott/taskcafe | 5,199 | Kanban + task management |
| usekaneo/kaneo | 3,662 | Project management |
| hyperdxio/hyperdx | 9,580 | Observability + alerting |
| PySpur-Dev/pyspur | 5,732 | Agent workflow orchestration |

### Key Patterns Identified

1. **Linear/Plane SLA Notifications** — Popular task management tools (Linear, Plane, ClickUp) all notify users when SLAs are at risk or breached. This is a standard feature in enterprise task management.

2. **Activepieces Workflow Engine** — 22k stars. Workflow automation with triggers (task created, SLA breached) and actions (send notification, update status). The trigger-action pattern is the foundation for task automation.

3. **HyperDX Observability** — 9.5k stars. Open source observability platform that unifies logs, traces, and metrics. Their alerting pattern: detect condition → notify via configured channels.

## Feature Implemented: SLA Breach Feishu Notifications

### What was missing
- SLA breach detection existed (`checkAndRecordSlaBreaches`) but only recorded breaches to the database
- No Feishu notification was sent when SLAs were breached or at warning threshold
- Users had to manually check `/api/sla/breaches` to see breaches

### What was implemented
- **SlaBreachNotification type** — Structured data for notification details (task info, policy name, breach type, timing)
- **buildSlaBreachCard** — Rich Feishu interactive card with:
  - 🚨 red header for breaches, ⚠️ orange for warnings
  - Policy name, task ID, command text
  - Priority badge and status
  - Target vs elapsed time comparison
  - Task tags (when present)
  - Timestamp note
- **Store enhancement** — `checkAndRecordSlaBreaches` now returns breach details alongside counts
- **Route integration** — SLA check endpoint sends Feishu card notifications for each breach/warning

### Implementation approach
- Followed the existing notification pattern (build card → sendCardMessage → catch errors)
- Non-blocking: notifications are fire-and-forget with error logging
- Only sends notifications for tasks with a `feishuMessageId` (tasks created via Feishu)

### Reference: Linear SLA Notifications
Linear sends notifications when:
- Task enters "at risk" state (warning threshold)
- Task breaches SLA (target time exceeded)
- SLA is extended or reset

Our implementation covers the first two cases. SLA extension/reset notifications could be a future enhancement.

## Next Research Directions

1. **Workflow Automation Rules** —借鉴 Activepieces' trigger-action model. Define rules like "when task priority is urgent, auto-assign to device X" or "when task is overdue, escalate priority and notify". This would be a significant feature addition.

2. **Task Batch CSV Import** — We have CSV export but no CSV import. Plane and TaskCafe both support bulk task creation from CSV files.

3. **Dashboard SLA Compliance View** — Show SLA compliance metrics visually on the dashboard (like Linear's SLA dashboard). Currently only available via API.

4. **Webhook Delivery Retry Dashboard** — Visualize webhook delivery status and retry attempts. Currently only available via API (`list_webhook_deliveries`).
