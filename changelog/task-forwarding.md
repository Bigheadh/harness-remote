# Changelog: Task Forwarding Feature

**Date:** 2026-06-03
**Feature:** Task forwarding — forward task to different device with message
**Files Modified:** 6

## Overview

| Item | Detail |
|------|--------|
| Date | 2026-06-03 |
| Task | Task forwarding (POST /api/tasks/:id/forward) |
| Files | 6 |
| Risk | Low — additive feature, no existing behavior changed |

## Per-File Changes

### 1. `src/shared/types.ts`

**Line 77:** Added `"task.forwarded"` to `AuditAction` union type.

```diff
-  | "api_key.revoked";
+  | "api_key.revoked"
+  | "task.forwarded";
```

**Reason:** Enables audit logging for the new forwarding action.
**Impact:** Type-only change, no runtime effect.

### 2. `src/server/tasks/store.ts`

**Line 113:** Added `forwardTask` method to `TaskStore` interface.

```diff
+  forwardTask(taskId: string, targetDeviceId: string, message?: string): Promise<Task>;
```

**Lines 736-763:** Added `forwardTask` implementation in the store factory function.

- Looks up the task by ID (throws if not found)
- Assigns to target device via existing `assignTaskStmt`
- Resets status to pending via existing `retryTaskStmt`
- If message provided, inserts a `[Forwarded] <message>` comment

**Reason:** Core business logic for forwarding a task between devices.
**Impact:** Uses existing prepared statements (`assignTaskStmt`, `retryTaskStmt`) — no new SQL.

### 3. `src/server/tasks/routes.ts`

**Lines 883-934:** Added `POST /api/tasks/:id/forward` route.

- Requires `tasks.write` permission
- Validates `deviceId` in request body (required, non-empty string)
- Calls `store.forwardTask(id, deviceId, message)`
- Logs audit entry with action `"task.forwarded"`
- Broadcasts SSE event via `broadcastTaskUpdated`
- Returns 404 if task not found

**Reason:** HTTP endpoint for task forwarding.
**Impact:** New route, no existing routes affected.

### 4. `src/mcp-server/client.ts`

**Line 76:** Added `forwardTask` to `TaskApiClient` interface.

**Lines 865-878:** Added `forwardTask` implementation in `createTaskApiClient`.

- POSTs to `/api/tasks/:id/forward` with `{ deviceId, message }`
- Standard error handling pattern

**Reason:** MCP client needs to call the forwarding API.
**Impact:** Interface extension, no existing methods changed.

### 5. `src/mcp-server/tools.ts`

**Lines 2036-2072:** Added `forward_task` MCP tool.

- Input: `taskId`, `targetDeviceId`, optional `message`
- Calls `client.forwardTask()`
- Returns forwarded task details with confirmation message

**Reason:** Codex CLI needs to forward tasks between devices.
**Impact:** New tool registration, no existing tools affected.

### 6. `test/mcp-server/tools.test.ts`

**Line 808:** Updated tool count assertion from 47 to 48.

```diff
-    it("registers all 47 tools", () => {
-      expect(mockServer.registrations).toHaveLength(47);
+    it("registers all 48 tools", () => {
+      expect(mockServer.registrations).toHaveLength(48);
```

**Reason:** New tool added, test expectation must match.
**Impact:** Test-only change.

## Risk Assessment

- **Low risk** — purely additive feature
- Uses existing prepared statements (`assignTaskStmt`, `retryTaskStmt`) — no new SQL tables or migrations
- No existing behavior modified
- All 223 tests pass

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm test` — 223/223 PASS
