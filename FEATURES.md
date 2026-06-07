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

## Phase 28: Task Processing Time Tracking
- [x] Task pickedAt, startedAt, completedAt timestamps (auto-set on status transitions)
- [x] GET /api/stats/processing endpoint (queue wait, processing time, p50/p95 analytics)
- [x] Feishu card shows processing duration on task completion

## Phase 29: Task Description & Enhanced Feishu Interaction
- [x] Task description field (DB column, shared type, store, API, MCP tool, Feishu parsing)
- [x] Enhanced Feishu cards — show priority badge, tags, due date on task cards
- [x] Per-user task statistics endpoint (GET /api/stats/users)

## Phase 30: Feishu Bot Interactive Commands
- [x] Slash command parsing (/help, /list, /status, /cancel, /stats, /search, /overdue, /mine)
- [x] Command detection in Feishu event handler (route commands before task creation)
- [x] Feishu card responses for each command
- [x] Partial task ID matching for /status and /cancel
- [x] Audit logging for command events
- [x] Task cancellation (set pending to failed with cancellation note)

## Phase 31: Enhanced Dashboard
- [x] Rich task list with tags, due dates, pinned status, device assignment columns
- [x] Tag filter and enhanced search (searches description, tags, result summary)
- [x] Detail panel with sections: basic info, tags, description, schedule, command, attachments, dependencies, result
- [x] Subtasks section in detail panel (loaded async from /api/tasks/:id/subtasks)
- [x] Comments section in detail panel (loaded async from /api/tasks/:id/comments)
- [x] Activity timeline in detail panel (loaded async from /api/tasks/:id/activity)
- [x] SSE real-time updates (auto-reconnect, replaces 30s polling)
- [x] Processing timestamps display (pickedAt, startedAt, completedAt)
- [x] Overdue due date highlighting

## Phase 32: Dashboard Interactive Features
- [x] Task creation form (POST /api/tasks endpoint + dashboard modal with command, priority, tags, device, due date)
- [x] Dashboard CSV export button (one-click download via /api/tasks/export.csv)
- [x] Task detail action buttons (start, done, fail, retry, pin/unpin, clone)
- [x] Comment form in task detail panel (add comments without leaving the dashboard)
- [x] Keyboard shortcuts (Ctrl+N to create, Escape to close modals)
- [x] Date range filter (filter tasks by creation date range in toolbar)
- [x] Bulk selection with actions (checkbox selection + bulk status update/assign/delete)

## Phase 33: Advanced Dashboard UX
- [x] Sortable columns (click headers to sort by status, priority, created date, due date)
- [x] Bulk tag operations (add/remove tags from selected tasks)
- [x] Task quick-create from detail panel (clone with modification)
- [x] Dashboard task count summary in page title (Tab title shows counts)

## Phase 34: v11 Dashboard Bulk Archive
- [x] Dashboard bulk archive button (archive multiple tasks from dashboard)
- [x] Dashboard bulk unarchive button (restore multiple archived tasks from dashboard)
- [x] POST /api/tasks/bulk/archive endpoint (bulk soft-delete with audit logging)
- [x] POST /api/tasks/bulk/unarchive endpoint (bulk restore with audit logging)
- [x] MCP bulk_archive_tasks tool (archive multiple tasks via MCP)
- [x] MCP bulk_unarchive_tasks tool (restore multiple tasks via MCP)

## Phase 35: v12 Dashboard Analytics View
- [x] Tab-based navigation (Tasks / Analytics views)
- [x] Task status distribution bar chart
- [x] Priority distribution bar chart
- [x] Task creation trend (30-day bar chart)
- [x] Task completion trend (30-day bar chart)
- [x] Processing time metrics (avg, p50, p95, success rate)
- [x] Per-user task count horizontal bar chart

## Phase 36: v13 Priority Filtering for Task Listing & Search
- [x] Store layer: priority filter in listTasks() and searchTasks()
- [x] API routes: priority query parameter on GET /api/tasks and GET /api/tasks/search
- [x] MCP client: priority parameter on listTasks() and searchTasks()
- [x] MCP tools: priority filter on list_tasks and search_tasks tools
- [x] Updated mock client in tests for new interface

## Phase 37: v14 Description-Aware Search
- [x] Store layer: description LIKE filter in searchTasks() full-text query
- [x] MCP tools: updated search_tasks description and q parameter docs

## Phase 38: Dashboard Settings/Management Tab
- [x] Settings tab with CSS (settings-grid, settings-card, settings-table, settings-form, role-badge styles)
- [x] Users management (list, create, delete, token regeneration)
- [x] Devices management (list, register, delete)
- [x] Webhooks management (list, create, delete)
- [x] Templates management (list, create, delete)
- [x] Scheduled tasks management (list, create, delete)
- [x] SLA policies management (list, create, delete)
- [x] Updated switchView to handle 3 tabs (tasks, analytics, settings)

## Phase 39: Webhook Management MCP Tools
- [x] Client interface: 6 new webhook methods (listWebhooks, getWebhook, createWebhook, updateWebhook, deleteWebhook, listWebhookDeliveries)
- [x] Client implementation: HTTP client methods calling existing webhook API routes
- [x] MCP tools: list_webhooks — list all webhook subscriptions
- [x] MCP tools: get_webhook — get webhook details by ID
- [x] MCP tools: create_webhook — create new webhook with URL and event subscriptions
- [x] MCP tools: update_webhook — update webhook URL, events, enabled status
- [x] MCP tools: delete_webhook — permanently remove webhook subscription
- [x] MCP tools: list_webhook_deliveries — view delivery history with success/fail summary
- [x] Updated mock client in tests for 6 new interface methods
- [x] Updated tool count assertion (69 → 75)
- [x] Added 13 new tests for webhook MCP tools

## Phase 40: Kanban Board View
- [x] Shared types: KanbanColumn and KanbanBoard interfaces
- [x] Store layer: getKanbanBoard() method — groups tasks by status with priority sorting
- [x] API route: GET /api/tasks/kanban — returns kanban board data with limit/deviceId filters
- [x] MCP client: getKanbanBoard() HTTP client method
- [x] MCP tool: get_kanban_board — AI agents can query kanban board state
- [x] Dashboard: Kanban tab with card-based board view (status columns, priority badges, tags, due dates)
- [x] Store tests: 4 new tests for getKanbanBoard (column count, grouping, limit, archived exclusion)
- [x] MCP tools tests: 4 new tests for get_kanban_board tool (registration, columns, params, errors)
- [x] Updated tool count assertion (75 → 76)

## Phase 41: Create Task from Template
- [x] API route: POST /api/templates/:id/create-task (optional overrides for commandText, priority, tags, device, dueDate, reminderAt)
- [x] MCP client: createTaskFromTemplate(templateId, overrides?) method
- [x] MCP tool: create_task_from_template — create a task from a template with optional field overrides
- [x] Template defaults: dueDateOffsetMs → computed due date, reminderOffsetMs → computed reminder time
- [x] Updated mock client in tests for new interface method
- [x] Updated tool count assertion (76 → 77)
- [x] Added 4 new tests for create_task_from_template tool

## Phase 42: Device Management MCP Tools
- [x] Client interface: 3 new device methods (listDevices, getDevice, deleteDevice)
- [x] Client implementation: HTTP client methods calling existing device API routes
- [x] MCP tool: list_devices — list all registered devices with name, capabilities, last seen
- [x] MCP tool: get_device — get device details by ID (name, token, capabilities, timestamps)
- [x] MCP tool: delete_device — permanently remove a device
- [x] Updated mock client in tests for 3 new interface methods
- [x] Updated tool count assertion (77 → 80)
- [x] Added 9 new tests for device MCP tools (registration, listing, details, deletion, error cases)

## Phase 43: Stats & Analytics MCP Tools
- [x] Client interface: 4 new stats methods (getProcessingStats, getTaskStatsSummary, getUserStats, getTaskTimeSeries)
- [x] Client implementation: HTTP client methods calling existing stats API routes
- [x] MCP tool: get_processing_stats — task processing time analytics (avg, p50, p95, success/fail counts)
- [x] MCP tool: get_task_stats_summary — comprehensive task statistics summary (status distribution, priority breakdown)
- [x] MCP tool: get_user_stats — per-user task statistics (counts, resolution time, last activity)
- [x] MCP tool: get_task_timeseries — time-series analytics with interval/metric filters for trend analysis
- [x] Updated mock client in tests for 4 new interface methods
- [x] Updated tool count assertion (80 → 84)
- [x] Added 12 new tests for stats MCP tools (registration, data return, error cases)

## Phase 44: SLA Breach Feishu Notifications
- [x] Shared types: SlaBreachNotification interface (taskId, taskCommandText, taskPriority, taskStatus, taskTags, taskFeishuMessageId, policyName, breachType, targetMinutes, actualMinutes)
- [x] Card builder: buildSlaBreachCard — rich Feishu card with breach/warning emoji, policy name, task details, priority badge, target vs elapsed times, tags
- [x] Store layer: checkAndRecordSlaBreaches returns breach details array (not just counts)
- [x] Client interface: checkSlaBreaches return type updated to include details
- [x] Client implementation: HTTP client parses details from API response
- [x] SLA check route: sends Feishu card notifications for each breach/warning with a feishuMessageId
- [x] Updated mock client in tests for new return type
- [x] Added 6 new tests for buildSlaBreachCard (breach/warning cards, task details, timing, tags)

## Phase 45: User Management MCP Tools
- [x] Client interface: 6 new user methods (listUsers, getUser, createUser, updateUserRole, deleteUser, regenerateUserToken)
- [x] Client implementation: HTTP client methods calling existing user API routes
- [x] MCP tool: list_users — list all registered users with roles and tokens
- [x] MCP tool: get_user — get user details by ID
- [x] MCP tool: create_user — create new user with username, role, and optional Feishu user ID
- [x] MCP tool: update_user_role — change a user's role (admin/operator/viewer)
- [x] MCP tool: delete_user — permanently remove a user account
- [x] MCP tool: regenerate_user_token — generate a new auth token for a user
- [x] Updated mock client in tests for 6 new interface methods
- [x] Updated tool count assertion (84 → 90)
- [x] Added 12 new tests for user management MCP tools (registration, CRUD, error cases)

## Phase 46: API Key Management MCP Tools
- [x] Client interface: 8 new API key methods (listApiKeys, getApiKey, createApiKey, rotateApiKey, revokeApiKey, enableApiKey, disableApiKey, cleanupExpiredApiKeys)
- [x] Client implementation: HTTP client methods calling existing API key routes (/api/keys/*)
- [x] MCP tool: list_api_keys — list all API keys, optionally filtered by user ID
- [x] MCP tool: get_api_key — get API key details by ID (name, role, enabled status, last used, previous key info)
- [x] MCP tool: create_api_key — create new API key with name, user assignment, and optional role
- [x] MCP tool: rotate_api_key — rotate API key with configurable grace period (0-7 days)
- [x] MCP tool: revoke_api_key — permanently delete an API key
- [x] MCP tool: enable_api_key — re-enable a disabled API key
- [x] MCP tool: disable_api_key — temporarily disable an API key
- [x] MCP tool: cleanup_expired_api_keys — delete expired previous keys from rotations
- [x] Updated mock client in tests for 8 new interface methods
- [x] Updated tool count assertion (90 → 98)
- [x] Added 22 new tests for API key MCP tools (registration, CRUD, rotation, enable/disable, cleanup, error cases)

## Phase 47: Saved Views (Custom Filter Presets)
- [x] Shared types: SavedView and SavedViewFilters interfaces (name, createdBy, filters with status/priority/deviceId/tags/dateRange/query)
- [x] Store layer: saved_views SQLite table with CRUD methods (createSavedView, listSavedViews, getSavedView, updateSavedView, deleteSavedView)
- [x] API routes: GET/POST /api/saved-views, GET/PUT/DELETE /api/saved-views/:id (requires auth + RBAC)
- [x] MCP client: 5 new methods (listSavedViews, getSavedView, createSavedView, updateSavedView, deleteSavedView)
- [x] MCP tools: list_saved_views — list all saved filter views with optional creator filter
- [x] MCP tools: get_saved_view — get saved view details and filter parameters
- [x] MCP tools: create_saved_view — create named filter preset (status, priority, tags, device, date range, query)
- [x] MCP tools: update_saved_view — update view name or filter parameters
- [x] MCP tools: delete_saved_view — permanently delete a saved view
- [x] Updated mock client in tests for 5 new interface methods
- [x] Updated tool count assertion (98 → 103)
- [x] Added 19 new tests for saved views MCP tools (registration, CRUD, filtering, error cases)

## Phase 48: Maintenance MCP Tools (Stale Task Reset & Event Cleanup)
- [x] Client interface: 2 new maintenance methods (resetStaleTasks, cleanupProcessedEvents)
- [x] Client implementation: HTTP client methods calling existing API routes (/api/tasks/reset-stale, /api/tasks/cleanup-events)
- [x] MCP tool: reset_stale_tasks — reset tasks stuck in picked/running state back to pending (configurable timeout)
- [x] MCP tool: cleanup_processed_events — delete old Feishu dedup events (configurable retention period)
- [x] Updated mock client in tests for 2 new interface methods
- [x] Updated tool count assertion (103 → 105)
- [x] Added 8 new tests for maintenance MCP tools (registration, default/custom params, error cases)

## Phase 49: Task Watchers (Subscribe to Task Updates)
- [x] Store layer: task_watchers SQLite table with CRUD methods (addWatcher, removeWatcher, listWatchers, isWatching)
- [x] API routes: GET/POST/DELETE /api/tasks/:id/watchers (requires auth + RBAC)
- [x] MCP client: 3 new methods (watchTask, unwatchTask, listTaskWatchers)
- [x] MCP tools: watch_task — subscribe to task updates for notifications
- [x] MCP tools: unwatch_task — unsubscribe from task updates
- [x] MCP tools: list_task_watchers — list all users watching a specific task
- [x] Updated mock client in tests for 3 new interface methods
- [x] Updated tool count assertion (105 → 108)

## Phase 50: Task Watcher Notifications
- [x] Feishu client: sendDirectCardMessage — send card messages directly to users by Feishu user ID
- [x] Card builder: buildWatcherNotificationCard — rich notification card with task details, status transition, priority, tags
- [x] Status update route: notify all task watchers via direct Feishu message when task status changes
- [x] Bulk status update route: notify watchers for each updated task in bulk operations
- [x] Card builder tests: 9 new tests for buildWatcherNotificationCard (info display, status transition, tags, description truncation, serialization)

## Phase 51: Wire Up Unused Prometheus Metrics Recorders
- [x] Feishu client: recordFeishuReply(true/false) after replyToMessage, sendCardMessage, sendDirectCardMessage
- [x] Webhook dispatcher: recordWebhookDelivery(true/false) after successful/failed webhook delivery
- [x] SLA check route: recordSlaEvent("warning"/"breach") for each detected SLA event
- [x] API key routes: recordApiKeyOp("create"/"rotate"/"revoke"/"enable"/"disable"/"cleanup") after each operation

## Phase 52: Time Entry Management
- [x] Store layer: createTimeEntry, listTimeEntries, getTimeEntry, deleteTimeEntry, stopTimeEntry with duration auto-computation
- [x] API routes: GET/POST /api/tasks/:id/time-entries, POST start/stop, DELETE /api/tasks/:id/time-entries/:entryId
- [x] MCP client: 5 new methods (listTimeEntries, createTimeEntry, startTimeEntry, stopTimeEntry, deleteTimeEntry)
- [x] MCP tools: list_time_entries, log_time_entry, start_time_tracking, stop_time_tracking, delete_time_entry
- [x] Updated mock client in tests for 5 new interface methods
- [x] Updated tool count assertion (108 → 113)
- [x] Added 15 new tests for time entry MCP tools (registration, CRUD, timers, errors)

## Phase 53: Time Tracking Summary & Dashboard Visualization
- [x] Shared types: TimeTrackingSummary interface (totalEntries, totalMinutes, avgMinutes, byUser, byPriority, recentDaily)
- [x] Store layer: getTimeTrackingSummary() — SQL aggregation with JOIN for priority breakdown
- [x] API route: GET /api/stats/time-tracking — aggregated time tracking stats with caching
- [x] MCP client: getTimeTrackingStats() — HTTP client method calling the new endpoint
- [x] MCP tool: get_time_tracking_stats — AI agents can query time tracking analytics
- [x] Dashboard: Time tracking section in analytics view (total time, entries, averages, by-priority chart, by-user chart)
- [x] Store tests: 4 new tests for getTimeTrackingSummary (zeroed state, aggregation, active timers, priority breakdown)
- [x] MCP tools tests: 4 new tests for get_time_tracking_stats tool (registration, data return, client call, error handling)
- [x] Updated tool count assertion (113 → 114)

## Phase 54: Task Activity Feed MCP Tool
- [x] MCP client: getActivityFeed method — calls GET /api/tasks/:id/activity endpoint
- [x] MCP tool: get_task_activity — AI agents can query the full chronological activity timeline of a task (creation, status changes, comments, notes, subtask events, assignments, SLA events)
- [x] Updated mock client in test for 1 new interface method
- [x] Updated tool count assertion (114 → 115)
- [x] Added 4 new tests for get_task_activity tool (registration, data return, client call, error handling)

## Phase 55: Keyword-Based Auto-Detection
- [x] Priority auto-detection from natural language keywords (urgent, important, minor, etc.)
- [x] Tag auto-detection from natural language keywords (bug, feature, question, etc.)
- [x] Due date auto-detection from natural language (today, tomorrow, next week, etc.)
- [x] Chinese language support for all detection patterns
- [x] Explicit #priority:/#tag:/#due: markers take precedence over keyword detection
- [x] 14 new tests for keyword detection (priority, tags, due dates, precedence)
## Phase 56: Dashboard Task Detail Enhancements - Dependencies, Time Entries & Watchers
- [x] Added CSS styles for dependency items, time entry items, and watcher items in detail panel
- [x] Added loadDependencies function - fetches and renders task dependency graph in detail panel
- [x] Added loadTimeEntries function - fetches and renders time tracking entries with duration totals
- [x] Added loadWatchers function - fetches and renders task watcher list
- [x] Wired all 3 new sections into showDetail flow (load after subtasks/comments/activity)

## Phase 57: Set Task Priority MCP Tool
- [x] Store layer: setTaskPriority(taskId, priority) method with validation
- [x] API route: POST /api/tasks/:id/priority endpoint with auth and priority validation
- [x] MCP client: setPriority(taskId, priority) HTTP client method
- [x] MCP tool: set_task_priority — AI agents can change task priority (low/normal/high/urgent)
- [x] Updated mock client in tests for new interface method
- [x] Updated tool count assertion (115 → 116)
- [x] Added 4 new tests for set_task_priority tool (registration, urgent/low priority, error case)

## Phase 58: Task Relationship Types
- [x] Shared types: TaskRelationshipType union (depends_on, blocks, relates_to, duplicates) and TaskRelationship interface
- [x] Store migration: added relationship_type and created_at columns to task_dependencies table
- [x] Store layer: addRelationship, removeRelationship, listRelationships methods
- [x] API routes: GET/POST/DELETE /api/tasks/:id/relationships (auth via global hook)
- [x] MCP client: 3 new methods (addRelationship, removeRelationship, listRelationships)
- [x] MCP tools: add_task_relationship — create typed links between tasks (blocks, relates_to, duplicates)
- [x] MCP tools: remove_task_relationship — remove specific or all relationships between tasks
- [x] MCP tools: list_task_relationships — list all incoming/outgoing relationships for a task
- [x] Updated mock client in tests for 3 new interface methods
- [x] Updated tool count assertion (117 → 120)
- [x] Added 9 new tests for relationship MCP tools (registration, CRUD, error cases)

## Phase 59: Feishu Card Action Callbacks
- [x] Added CardButton interface and action element types to card-builder.ts
- [x] Added interactive action buttons (Pick Task, Mark Done, Archive) to task creation cards
- [x] Added POST /api/feishu/card-action endpoint to handle card button callbacks
- [x] Card action handler supports pick_task, complete_task, and archive_task actions
- [x] Status transitions validated (e.g. can't pick a non-pending task)
- [x] Audit logging for card action status changes and archivals
- [x] Webhook dispatch and SSE broadcast on card-triggered status changes
- [x] Added "task.archived" to AuditAction union type in shared/types.ts

## Phase 60: Task Time Estimate Setter
- [x] Store layer: setTaskEstimatedMinutes(taskId, minutes) method with validation
- [x] API route: POST /api/tasks/:id/estimated-minutes endpoint with auth and validation
- [x] MCP client: setEstimatedMinutes(taskId, minutes) HTTP client method
- [x] MCP tool: set_task_estimated_minutes — AI agents can set/clear task time estimates
- [x] Updated mock client in tests for new interface method
- [x] Updated tool count assertion (120 → 121)
- [x] Added 4 new tests for set_task_estimated_minutes tool (registration, set value, clear, error)

## Phase 61: Bulk Priority Update MCP Tool
- [x] Store layer: bulkUpdatePriority(ids, priority) method with per-task error handling
- [x] API route: POST /api/tasks/bulk/priority endpoint with auth and priority validation
- [x] MCP client: bulkUpdatePriority(ids, priority) HTTP client method
- [x] MCP tool: bulk_update_priority — AI agents can update priority for multiple tasks at once
- [x] Updated mock client in tests for new interface method
- [x] Updated tool count assertion (121 → 122)
- [x] Added 3 new tests for bulk_update_priority tool (registration, batch update, error case)

## Phase 62: Individual Task Assignment MCP Tools
- [x] Client interface: 2 new methods (assignTask, unassignTask)
- [x] Client implementation: HTTP client methods calling existing API routes (POST /api/tasks/:id/assign, POST /api/tasks/:id/unassign)
- [x] MCP tool: assign_task — assign a single task to a specific device
- [x] MCP tool: unassign_task — unassign a task from its current device
- [x] Updated mock client in tests for 2 new interface methods
- [x] Updated tool count assertion (122 → 124)
- [x] Added 6 new tests for assignment MCP tools (registration, assign, unassign, error cases)

## Phase 63: Cycle (Sprint) Management MCP Tools
- [x] MCP tool: list_cycles — list all cycles (sprints) with optional status filter
- [x] MCP tool: get_cycle — get cycle details by ID (name, description, dates, status, task counts)
- [x] MCP tool: create_cycle — create new cycle with name, start/end dates, optional description
- [x] MCP tool: update_cycle — update cycle name, description, dates, or status
- [x] MCP tool: delete_cycle — permanently delete a cycle (tasks are unlinked, not deleted)
- [x] MCP tool: add_task_to_cycle — assign a task to a cycle for sprint planning
- [x] MCP tool: remove_task_from_cycle — unlink a task from its current cycle
- [x] MCP tool: list_cycle_tasks — list all tasks in a specific cycle
- [x] Updated mock client in tests for 8 new interface methods
- [x] Updated tool count assertion (124 → 132)
- [x] Added 25 new tests for cycle MCP tools (registration, CRUD, task assignment, error cases)

## Phase 64: Comment & Note Deletion MCP Tools
- [x] Client interface: 2 new methods (deleteTaskComment, deleteTaskNote)
- [x] Client implementation: HTTP client methods calling existing API routes (DELETE /api/tasks/:id/comments/:commentId, DELETE /api/tasks/:id/notes/:noteId)
- [x] MCP tool: delete_task_comment — permanently remove a comment from a task's activity timeline
- [x] MCP tool: delete_task_note — permanently remove an internal note from a task
- [x] Updated mock client in tests for 2 new interface methods
- [x] Updated tool count assertion (135 → 137)
- [x] Added 10 new tests (registration + success + error for both tools, plus add/list note tests)
