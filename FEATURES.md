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
- [ ] mcp-server/tools.test.ts - Tool contracts
- [ ] Integration test: end-to-end flow

## Phase 14: Polish & Deploy
- [ ] Deploy script / systemd service
- [ ] README update with working quick start
- [ ] Error logging with redaction
- [ ] Data directory auto-creation
- [ ] Git initial commit + push to GitHub
