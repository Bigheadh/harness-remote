# Task Retry/Requeue Feature

**Date:** 2026-06-03
**Phase:** 23 — v6 Task Lifecycle & Recovery
**Feature:** Task retry/requeue — reset failed/done tasks back to pending

## Summary

Added the ability to retry completed or failed tasks by resetting them back to `pending` status. Previously, `done` and `failed` were strict terminal states with no way to reprocess a task. This feature allows operators to requeue tasks that need to be attempted again (e.g., after a transient failure, or when a completed task's result needs to be re-evaluated).

## Files Modified

### 1. `src/server/tasks/store.ts`

**Change:** Added `retryTask` method to `TaskStore` interface and implementation.

- **Interface addition** (line ~107): Added `retryTask(taskId: string): Promise<Task>` to the `TaskStore` interface.
- **Prepared statement** (line ~456): Added `retryTaskStmt` — an UPDATE that sets `status = 'pending'`, clears `result_summary` and `result_details` to NULL, and updates `updated_at`.
- **Method implementation** (line ~626-647): Validates the task exists, checks that current status is `done` or `failed` (throws on other statuses), executes the retry update, and returns the refreshed task.

**Before:**
```ts
// No retryTask method existed
// Terminal states (done/failed) had no transitions
```

**After:**
```ts
// TaskStore interface:
retryTask(taskId: string): Promise<Task>;

// Implementation:
async retryTask(taskId: string): Promise<Task> {
  // Validates task exists
  // Only allows retry from 'done' or 'failed' status
  // Resets status to 'pending', clears results
  // Returns updated task
}
```

**Reason:** Tasks stuck in terminal states had no recovery path. This enables retrying transient failures and reprocessing completed tasks.

### 2. `src/server/tasks/routes.ts`

**Change:** Added `POST /api/tasks/:id/retry` route.

- **Route** (line ~720-764): New POST endpoint that requires `tasks.write` permission. Calls `store.retryTask()`, logs to audit store, broadcasts SSE event, and returns the updated task.
- **Error handling:** Returns 404 if task not found, 409 (invalid_status) if task is not in a retryable state.

**Before:**
```ts
// No retry endpoint
```

**After:**
```ts
// POST /api/tasks/:id/retry - requeue a failed/done task back to pending
server.post<{ Params: { id: string } }>("/api/tasks/:id/retry", async (req, reply) => {
  // Requires tasks.write permission
  // Calls store.retryTask(id)
  // Logs audit entry with action: "task.status_changed", details: { action: "retry" }
  // Broadcasts SSE event
  // Returns 409 for non-retryable states
});
```

**Reason:** Exposes the retry functionality via HTTP API for both MCP tools and direct API consumers.

### 3. `src/mcp-server/client.ts`

**Change:** Added `retryTask` to `TaskApiClient` interface and HTTP client implementation.

- **Interface** (line ~68): Added `retryTask(taskId: string): Promise<Task>`.
- **Implementation** (line ~806-817): POST to `/api/tasks/${taskId}/retry`, parses the returned task.

**Before:**
```ts
// No retryTask method in client
```

**After:**
```ts
// Interface:
retryTask(taskId: string): Promise<Task>;

// Implementation:
async retryTask(taskId: string): Promise<Task> {
  const response = await fetch(`${serverBaseUrl}/api/tasks/${taskId}/retry`, {
    method: "POST",
    headers,
  });
  // Error handling...
  const data = (await response.json()) as { task: Task };
  return data.task;
}
```

**Reason:** Enables MCP tools and local Codex CLI to retry tasks.

### 4. `src/mcp-server/tools.ts`

**Change:** Added `retry_task` MCP tool registration.

- **Tool** (line ~1898-1929): Registered `retry_task` tool with description and `taskId` input parameter.

**Before:**
```ts
// No retry_task tool
```

**After:**
```ts
server.registerTool("retry_task", {
  description: "Retry a failed or completed task by resetting it back to pending status...",
  inputSchema: {
    taskId: z.string().describe("The task ID to retry"),
  },
}, async (args) => { ... });
```

**Reason:** Allows Codex CLI users to retry tasks directly from the CLI interface.

### 5. `test/mcp-server/tools.test.ts`

**Change:** Updated mock client and tool count assertion.

- **Mock** (line ~687-702): Added `retryTask` mock method returning a pending task.
- **Count** (line ~758-759): Updated tool count from 43 to 44.

**Before:**
```ts
expect(mockServer.registrations).toHaveLength(43);
```

**After:**
```ts
expect(mockServer.registrations).toHaveLength(44);
```

**Reason:** The new tool registration must be reflected in the test assertion. Mock must implement the new interface method.

### 6. `FEATURES.md`

**Change:** Added Phase 23 section with task retry as first completed feature, plus 3 planned items.

## Risk Assessment

- **Low risk.** This is an additive feature — no existing behavior changes.
- The retry operation only affects tasks in terminal states (`done`/`failed`), which previously had no transitions.
- Audit logging and SSE broadcasting are included for observability.
- The `retryTask` prepared statement clears result fields to prevent stale data confusion.

## Verification

- `npm run typecheck` — passes (exit 0)
- `npm run build` — passes (exit 0)
- `npm run test` — 223/223 tests pass
- Feature is backward compatible: existing API consumers are unaffected
