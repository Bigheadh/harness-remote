# harness-remote Feature Progress Tracker

## Phase 1: Project Setup & Dependencies
- [x] TypeScript skeleton with TODO stubs
- [x] Install dependencies (fastify, @modelcontextprotocol/sdk, vitest)
- [x] npm run build passes with real dependencies
- [x] npm run typecheck passes

## Phase 2: Shared Layer (src/shared/)
- [x] http.ts - Bearer token validation helper
- [x] errors.ts - Already has AppError class, ensure it's complete
- [x] types.ts - Already complete

## Phase 3: Server Config (src/server/config.ts)
- [x] Config file loading from JSON
- [x] Config validation (port, publicBaseUrl, personalToken, feishu fields)
- [x] CLI --config flag support

## Phase 4: SQLite Task Store (src/server/tasks/store.ts)
- [x] Initialize SQLite with tasks and processed_events tables
- [x] createTask implementation
- [x] listTasks with status filter and limit
- [x] getTask by ID
- [x] updateTaskStatus with state machine validation
- [x] saveTaskResult with status update
- [x] Event deduplication (isEventProcessed, markEventProcessed)

## Phase 5: Task API Routes (src/server/tasks/routes.ts)
- [x] GET /health endpoint
- [x] Auth middleware (Bearer token validation)
- [x] GET /api/tasks - list tasks
- [x] GET /api/tasks/:id - get task detail
- [x] POST /api/tasks/:id/status - update status
- [x] POST /api/tasks/:id/result - report result + trigger Feishu reply
- [x] Error response formatting

## Phase 6: Server Bootstrap (src/server/index.ts)
- [x] Fastify server setup
- [x] Route registration
- [x] Config loading on startup
- [x] Task store initialization
- [x] Graceful shutdown

## Phase 7: Feishu Event Processing (src/server/feishu/events.ts)
- [x] URL verification (challenge response)
- [x] Event signature validation
- [x] Event body decryption (optional encrypt key)
- [x] Message event parsing (extract userId, chatId, messageId, text)
- [x] Allowlist check
- [x] Event deduplication
- [x] Task creation from Feishu event
- [x] Group chat: only create if bot mentioned
- [x] P2P chat: always create for allowed users

## Phase 8: Feishu Reply Client (src/server/feishu/client.ts)
- [x] Get tenant access token
- [x] Reply to message API
- [x] Token caching and refresh

## Phase 9: MCP Config (src/mcp-server/config.ts)
- [x] Config file loading
- [x] Validation (serverBaseUrl, personalToken)

## Phase 10: MCP HTTP Client (src/mcp-server/client.ts)
- [x] listTasks implementation
- [x] getTask implementation
- [x] markTaskRunning implementation
- [x] reportTaskResult implementation
- [x] replyFeishu implementation

## Phase 11: MCP Server Bootstrap (src/mcp-server/index.ts)
- [x] MCP server setup with stdio transport
- [x] Tool registration
- [x] Config loading

## Phase 12: MCP Tools (src/mcp-server/tools.ts)
- [x] list_tasks tool
- [x] get_task tool
- [x] mark_task_running tool
- [x] report_task_result tool
- [x] reply_feishu tool

## Phase 13: Tests
- [x] shared/http.test.ts - Bearer token validation
- [x] server/tasks.store.test.ts - SQLite CRUD
- [x] server/feishu.events.test.ts - Event parsing, dedup
- [x] mcp-server/tools.test.ts - Tool contracts
- [x] Integration test: end-to-end flow

## Phase 14: Polish & Deploy
- [x] Deploy script / systemd service
- [x] README update with working quick start
- [x] Error logging with redaction
- [x] Data directory auto-creation
- [x] Git initial commit + push to GitHub

## Phase 15: Security & Code Quality
- [x] Timing-safe token comparison (prevent timing attacks)
- [x] Shared config validation helpers (eliminate duplication)
- [x] FeishuReplyClient type export (better DI)

## Phase 16: API Improvements
- [x] Dedicated POST /api/tasks/:id/reply endpoint
- [x] POST /api/tasks/reset-stale endpoint (stale task cleanup)
- [x] Request logging middleware with duration tracking

## Phase 17: Feature Enhancements
- [x] Task priority field (low/normal/high/urgent)
- [x] Priority parsing from message text (#priority:urgent, !high)
- [x] Priority-sorted task listing (urgent tasks first)
- [x] Stale task detection and reset (configurable timeout)

## Phase 18: Infrastructure Hardening
- [x] SQLite WAL mode for better read concurrency
- [x] Processed events cleanup (configurable retention period)
- [x] Improved health check with DB connectivity verification
- [x] POST /api/tasks/cleanup-events endpoint for manual cleanup

## Phase 19: v2 Feature Enhancements
- [x] Task history search (GET /api/tasks/search with text, status, date range filters)
- [x] Task history search MCP tool (search_tasks)
- [x] Task attachment support (file metadata on tasks)
- [x] Web management dashboard (read-only task viewer)
- [x] Multi-device task assignment (device registry and routing)
- [x] Audit logging (who did what when)
- [x] Finer permission control (per-user token and RBAC)

## Phase 20: v3 Advanced Features
- [x] Task tags/labels system (categorize and filter tasks by custom tags)
- [x] Task due dates and reminders (deadline tracking with overdue alerts)
- [x] Task comments/activity timeline (comment thread on each task)
- [x] Batch task operations (bulk status update, bulk assign, bulk delete)
- [x] Webhook notifications (external URL callback on task events)
- [x] Rate limiting per user/device (API abuse prevention)

## Phase 21: v4 Enterprise Features
- [x] Task templates (reusable task definitions for common operations)
- [x] Scheduled/recurring tasks (cron-like scheduling for periodic task creation)
- [x] Task dependencies (prerequisite chains: task B waits for task A)
- [x] API key rotation with grace period (auto-expire old tokens after rotation)
- [x] Export/import tasks (JSON backup and restore across instances)
- [x] SLA monitoring and alerts (track resolution time, alert on breaches)

## Phase 22: v5 Observability & Analytics
- [x] Task statistics and analytics endpoint (GET /api/stats/summary)
- [x] Server-sent events (SSE) for real-time task updates (/api/tasks/stream)
- [x] Prometheus-compatible metrics endpoint (/metrics)

## Phase 23: v6 Task Lifecycle & Recovery
- [x] Task retry/requeue — reset failed/done tasks back to pending (POST /api/tasks/:id/retry)
- [x] Task cloning — duplicate a task with same command text and fresh status
- [x] Task pinning — pin important tasks to top of listing
- [x] Webhook delivery retry with exponential backoff

## Phase 24: v7 Developer Experience & Integration
- [x] Task forwarding — forward task to different device with message (POST /api/tasks/:id/forward)
- [x] Task notes — internal annotations not shared to requester (GET/POST /api/tasks/:id/notes)
- [x] Task user search — find tasks by Feishu user ID (GET /api/tasks/user/:userId)
- [x] Feishu card message format — rich card notifications instead of plain text
- [x] API response compression (gzip/deflate via @fastify/compress)
- [x] Task dependency graph — full dependency tree endpoint (GET /api/tasks/:id/dependency-graph)

## Phase 25: v8 Task Safety & Subtasks
- [x] Task lock mechanism — TTL-based locks to prevent concurrent processing (POST /api/tasks/:id/lock, DELETE /api/tasks/:id/lock)
- [x] Task subtasks — break tasks into independently trackable child tasks (POST /api/tasks/:id/subtasks, GET /api/tasks/:id/subtasks)
- [x] Activity feed — combined chronological timeline of all task events (GET /api/tasks/:id/activity)
- [x] Task attachment download — API to download task attachment files (GET /api/tasks/:id/attachments/:attachmentIndex)
- [x] Enhanced dashboard API — time-series analytics for charts (GET /api/stats/timeseries)

## Phase 26: v9 Advanced Analytics & Data Management
- [x] Task CSV export — export task list as CSV for reporting (GET /api/tasks/export.csv)
- [x] Task archive — soft-delete completed tasks to keep active view clean (POST /api/tasks/:id/archive, POST /api/tasks/:id/unarchive)
- [x] Dashboard data caching — TTL-based cache for /api/stats/summary and /api/stats/timeseries
- [x] Task priority auto-escalation — automatically escalate overdue tasks priority
- [x] API usage analytics — track request counts, response times, error rates per user/device

## Phase 27: v10 Feishu Proactive Status Notifications
- [x] Config option feishu.notifyOnStatusChange (array of status strings to trigger notifications)
- [x] Feishu card notification on single task status update (running, failed)
- [x] Feishu card notification on bulk status update
- [x] Exported STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS from card-builder
