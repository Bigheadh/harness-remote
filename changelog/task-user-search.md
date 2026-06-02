# Task User Search — find tasks by Feishu user ID

## Summary
Added a new endpoint `GET /api/tasks/user/:userId` that returns all tasks created by a specific Feishu user, plus a corresponding MCP tool `list_user_tasks` for Codex CLI integration.

## Changes

### 1. src/server/tasks/store.ts — TaskStore interface & implementation

**Interface** — Added `listTasksByUser(userId: string, limit?: number): Promise<Task[]>` method.

**Implementation** — Added SQL query `SELECT * FROM tasks WHERE feishu_user_id = ? ORDER BY created_at DESC LIMIT ?` with configurable limit (default 20, max 100).

### 2. src/server/tasks/routes.ts — New API route

**Added** `GET /api/tasks/user/:userId` — Requires `tasks.read` permission. Returns `{ tasks, count }` sorted by creation time (newest first). Registered before `GET /api/tasks/:id` to avoid Fastify parameter matching conflicts.

### 3. src/mcp-server/client.ts — TaskApiClient interface & HTTP client

**Interface** — Added `listTasksByUser(userId: string, limit?: number): Promise<Task[]>`.

**Implementation** — HTTP GET to `/api/tasks/user/{userId}` with optional `limit` query parameter.

### 4. src/mcp-server/tools.ts — MCP tool registration

**Added** `list_user_tasks` tool — Accepts `userId` (required) and `limit` (optional, 1-100). Returns tasks, count, and userId in JSON response.

### 5. FEATURES.md — Updated feature tracker

Marked `Task user search` as `[x]` complete.

### 6. test/mcp-server/tools.test.ts — Test updates

- Added `listTasksByUser` mock to `createMockClient()`
- Updated tool count assertion from 50 → 51
- Added 3 test cases: basic list, limit passthrough, error handling

## Risk
- **Low** — Purely additive feature, no existing endpoints modified.
- Route ordering ensured by registering before `:id` param route.

## Verification
- `npm run typecheck` — ✅ PASS
- `npm run build` — ✅ PASS
- `npm run test` — ✅ 226/226 tests pass
