# Change Log: Task Templates (Phase 21, Item 1)

**Date:** 2026-06-02
**Feature:** Task templates — reusable task definitions for common operations
**Commit:** ce6abd8
**Files modified:** 7

## Overview

| Item | Value |
|------|-------|
| Date | 2026-06-02 |
| Task | Implement task templates (Phase 21, v4 Enterprise Features) |
| Files modified | 7 |
| Lines added | ~678 |
| Lines removed | ~4 |

## Per-File Changes

### 1. `src/shared/types.ts`

**Change:** Added `TaskTemplate` interface (18 lines added at end of file)

**Before:**
```ts
export interface User {
  id: string;
  username: string;
  token: string;
  role: UserRole;
  feishuUserId?: string;
  createdAt: string;
  updatedAt: string;
}
```

**After:**
```ts
export interface User {
  id: string;
  username: string;
  token: string;
  role: UserRole;
  feishuUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/** A reusable task definition — templates let users quickly create common tasks */
export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  commandText: string;
  priority?: TaskPriority;
  tags?: string[];
  assignedDeviceId?: string;
  dueDateOffsetMs?: number;
  reminderOffsetMs?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

**Reason:** Defines the shared type for task templates used across server, MCP client, and MCP tools layers.

**Impact:** All layers now have access to the `TaskTemplate` type. No breaking changes.

---

### 2. `src/server/tasks/store.ts`

**Changes:**
- Added `TaskTemplate` import (line 5)
- Added `task_templates` table creation SQL (23 lines)
- Added `rowToTemplate` helper function (16 lines)
- Added 5 template methods to `TaskStore` interface (5 lines)
- Added 5 template implementation methods in `createTaskStore()` (~90 lines)

**Before (interface):**
```ts
bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }>;
}
```

**After (interface):**
```ts
bulkDelete(ids: string[]): Promise<{ deleted: number; errors: string[] }>;
createTemplate(template: Omit<TaskTemplate, "id" | "createdAt" | "updatedAt">): Promise<TaskTemplate>;
listTemplates(): Promise<TaskTemplate[]>;
getTemplate(id: string): Promise<TaskTemplate | undefined>;
updateTemplate(id: string, updates: Partial<Pick<TaskTemplate, "name" | "description" | "commandText" | "priority" | "tags" | "assignedDeviceId" | "dueDateOffsetMs" | "reminderOffsetMs">>): Promise<TaskTemplate>;
deleteTemplate(id: string): Promise<boolean>;
}
```

**Reason:** Persists task templates in SQLite with full CRUD operations. Uses `parseTags` helper for JSON tag serialization.

**Impact:** New `task_templates` table created automatically on startup. No migration issues — `CREATE TABLE IF NOT EXISTS` is idempotent.

---

### 3. `src/server/tasks/routes.ts`

**Changes:** Added 5 new HTTP endpoints before parameterized `:id` routes (170 lines)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/templates` | List all templates |
| `GET` | `/api/templates/:id` | Get template by ID |
| `POST` | `/api/templates` | Create template |
| `PUT` | `/api/templates/:id` | Update template |
| `DELETE` | `/api/templates/:id` | Delete template |

**Reason:** Exposes template CRUD via HTTP API. Routes use `authorize(authCtx, "tasks.read")` or `authorize(authCtx, "tasks.write")` for RBAC.

**Impact:** New endpoints are additive. No existing routes affected. Static routes registered before parameterized routes to avoid Fastify radix-tree conflicts.

---

### 4. `src/mcp-server/client.ts`

**Changes:**
- Added `TaskTemplate` import (line 2)
- Added 5 template methods to `TaskApiClient` interface (5 lines)
- Added 5 template HTTP client implementations (~60 lines)

**Reason:** Allows the local MCP server to call template CRUD APIs on the remote server.

**Impact:** Additive only. Existing methods unchanged.

---

### 5. `src/mcp-server/tools.ts`

**Changes:** Added 5 new MCP tool registrations (~213 lines)

| Tool Name | Description |
|-----------|-------------|
| `list_templates` | List all saved task templates |
| `get_template` | Get template details by ID |
| `create_template` | Create a new reusable template |
| `update_template` | Update an existing template (partial update) |
| `delete_template` | Delete a template (irreversible) |

**Reason:** Exposes template management to Codex CLI via MCP stdio interface.

**Impact:** 5 new tools added. Codex CLI can now manage templates directly.

---

### 6. `FEATURES.md`

**Change:** Marked `Task templates (reusable task definitions for common operations)` as `[x]` (completed).

---

### 7. `test/mcp-server/tools.test.ts`

**Changes:**
- Added 5 mock methods to `createMockClient()` (~74 lines)
- Updated tool count assertion: `toHaveLength(17)` → `toHaveLength(22)`

**Reason:** Keeps mock client in sync with `TaskApiClient` interface. Ensures all 22 tools are registered.

---

## Structural Summary

**New:**
- `TaskTemplate` shared type interface
- `task_templates` SQLite table with index on `name`
- `rowToTemplate()` helper for DB row → TypeScript conversion
- 5 store methods: `createTemplate`, `listTemplates`, `getTemplate`, `updateTemplate`, `deleteTemplate`
- 5 API routes: `GET/POST /api/templates`, `GET/PUT/DELETE /api/templates/:id`
- 5 MCP client methods
- 5 MCP tools: `list_templates`, `get_template`, `create_template`, `update_template`, `delete_template`

**Modified:**
- `TaskStore` interface (5 new methods)
- `TaskApiClient` interface (5 new methods)
- Tool count in tests (17 → 22)

## Risk Assessment

- **Low risk.** All changes are additive — no existing functionality modified.
- New SQLite table is created with `CREATE TABLE IF NOT EXISTS`, safe for existing databases.
- Template CRUD uses standard patterns consistent with existing store/routes/tools architecture.
- No breaking changes to any existing API contracts.

## Verification

- [x] `npm run typecheck` passes (exit 0)
- [x] `npm run build` passes (exit 0)
- [x] `npm run test` — 223 tests pass across 9 test files
- [x] Git commit: `ce6abd8`
- [x] Git push to `origin/master` successful
