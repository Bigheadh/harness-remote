# Phase 88: Bulk Due Date Update MCP Tool

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-06-10 |
| Feature | Bulk Due Date Update |
| Files Modified | 5 |
| Tests Added | 4 |
| Risk | Low |

## Changes

### 1. Store Interface (`src/server/tasks/store.ts`)

**Line 80** - Added method signature to `TaskStore` interface:
```typescript
// Before:
bulkCloneTasks(ids: string[]): Promise<{ cloned: number; errors: string[]; taskIds: string[] }>;

// After:
bulkCloneTasks(ids: string[]): Promise<{ cloned: number; errors: string[]; taskIds: string[] }>;
bulkUpdateDueDate(ids: string[], dueDate: string | null): Promise<{ updated: number; errors: string[] }>;
```

**Line ~1697** - Added implementation method after `bulkUpdatePriority`:
```typescript
async bulkUpdateDueDate(ids: string[], dueDate: string | null): Promise<{ updated: number; errors: string[] }> {
  // Validates date format if provided
  // Iterates task IDs, validates existence, updates due_date column
  // Returns updated count and per-task errors
}
```

### 2. API Route (`src/server/tasks/routes.ts`)

**Line ~1047** - Added new endpoint before `bulk/clone`:
```
POST /api/tasks/bulk/due-date
Body: { ids: string[], dueDate: string | null }
Auth: tasks.write permission
Validation: ids array non-empty, date format ISO 8601 if provided
Audit: logs task.status_changed with bulk: true
SSE: broadcasts task updates for each modified task
```

### 3. MCP Client (`src/mcp-server/client.ts`)

**Line 51** - Added interface method:
```typescript
bulkUpdateDueDate(ids: string[], dueDate: string | null): Promise<{ updated: number; errors: string[] }>;
```

**Line ~889** - Added implementation:
```typescript
async bulkUpdateDueDate(ids: string[], dueDate: string | null): Promise<...> {
  // POST to /api/tasks/bulk/due-date
  // Parses response, throws on non-OK status
}
```

### 4. MCP Tool (`src/mcp-server/tools.ts`)

**Line ~3796** - Registered new tool:
```
Name: bulk_update_due_date
Description: "Update the due date of multiple tasks at once..."
Input: ids (string[], 1-100), dueDate (string | null)
```

### 5. Tests (`test/mcp-server/tools.test.ts`)

**Line ~413** - Added mock client method:
```typescript
async bulkUpdateDueDate(ids, dueDate): Promise<{ updated, errors }> { ... }
```

**Line 2119** - Updated tool count assertion: 156 -> 157

**Line ~3984** - Added 4 tests:
1. Registration with correct description
2. Updates due date for multiple tasks (sets date)
3. Clears due date when null is passed
4. Returns error when bulkUpdateDueDate fails

## Reason
Fills a gap in the bulk operations toolkit. Users had `bulk_update_status`, `bulk_update_priority`, and `bulk_assign_tasks` but no way to batch-set due dates — a common need for sprint planning and deadline management.

## Risk
- **Low**: Follows the exact same pattern as `bulk_update_priority` (proven code path)
- Date validation at both route and store layers prevents invalid data
- SSE broadcast ensures dashboard stays in sync

## Verification
1. `npm run typecheck` — passes
2. `npm run build` — passes
3. `npm test` — 568/568 tests pass (4 new)
4. `grep -c "registerTool" src/mcp-server/tools.ts` — 157 (was 156)
