# Phase 94: Direct Task Creation MCP Tool

## Summary
Added a `create_task` MCP tool that allows AI agents to create tasks directly without requiring a pre-existing template. This closes the gap where the `POST /api/tasks` route existed for the web dashboard but had no corresponding MCP tool — meaning AI agents could only create tasks from templates, not from scratch.

## Files Changed

### src/mcp-server/client.ts
- **Interface** (line ~22): Added `createTask(options)` method to `TaskApiClient` interface with parameters: `commandText` (required), `description`, `priority`, `tags`, `assignedDeviceId`, `dueDate` (all optional)
- **Implementation** (after line ~327): Added `createTask()` implementation that sends HTTP POST to `/api/tasks` with the options as JSON body. Follows existing error handling pattern.

### src/mcp-server/tools.ts
- **New tool** (after line ~6374): Added `create_task` MCP tool registration with:
  - Zod inputSchema: `commandText` (string, required), `description` (string, optional), `priority` (enum: low/normal/high/urgent, optional), `tags` (string array, optional), `assignedDeviceId` (string, optional), `dueDate` (string, optional)
  - Handler: calls `client.createTask()`, returns created task summary (id, commandText, status, priority, tags, device, dueDate, description, createdAt)
  - Error handling: catches exceptions and returns isError response

### test/mcp-server/tools.test.ts
- **Mock client** (after line ~517): Added `createTask()` mock method that returns a test task object with source "mcp" and default values
- **Tool count** (line ~2168): Updated assertion from 159 to 160
- **Tests** (new describe block): Added 4 tests:
  1. Tool registration verification
  2. Create task with commandText only (minimal fields)
  3. Create task with all optional fields (description, priority, tags, device, dueDate)
  4. Error handling when client fails

### FEATURES.md
- Added Phase 94 section with all 6 completed items

## Risk
- Low risk: follows existing patterns for tool registration and client methods
- No store layer changes (reuses existing POST /api/tasks route)
- No database schema changes

## Verification
- Typecheck: ✅ passes
- Build: ✅ passes  
- Tests: ✅ 579 passed (was 575)
- Tool count: 160 registered tools
- Server: running on port 3000
