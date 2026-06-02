# Changelog: Task Notes (internal annotations)

**Date:** 2026-06-03  
**Feature:** Task notes — internal annotations not shared to requester  
**Files modified:** 6  
**Lines added:** ~180  
**Lines removed:** ~4

## Summary

Added internal task notes feature — private annotations that operators can add to tasks but which are NEVER shared back to the Feishu requester. Unlike comments (which appear in the activity timeline), notes are strictly internal.

## Per-File Changes

### 1. `src/shared/types.ts`

**Change:** Added `TaskNote` interface and two new audit action types.

```typescript
// BEFORE:
export interface TaskComment {
  id: number;
  taskId: string;
  author: string;
  authorType: AuditLogEntry["actorType"];
  body: string;
  createdAt: string;
}

// AFTER:
export interface TaskComment {
  id: number;
  taskId: string;
  author: string;
  authorType: AuditLogEntry["actorType"];
  body: string;
  createdAt: string;
}

/** An internal note on a task — NOT shared back to the Feishu requester */
export interface TaskNote {
  id: number;
  taskId: string;
  author: string;
  body: string;
  createdAt: string;
}
```

**Change:** Added audit action types for note lifecycle.

```typescript
// BEFORE:
  | "task.forwarded";

// AFTER:
  | "task.forwarded"
  | "task.note_added"
  | "task.note_deleted";
```

**Reason:** Define the data shape for task notes and enable audit logging for note operations.

### 2. `src/server/tasks/store.ts`

**Change:** Added `task_notes` table, import, interface methods, and implementation.

- Added `TaskNote` import from shared types
- Added 3 methods to `TaskStore` interface: `addNote`, `listNotes`, `deleteNote`
- Added `task_notes` SQLite table with auto-increment ID, foreign key to tasks, and index on `task_id`
- Implemented `addNote()` — verifies task exists, inserts note, returns created note
- Implemented `listNotes()` — returns all notes for a task in chronological order
- Implemented `deleteNote()` — deletes note by ID scoped to task

**Reason:** Persist internal notes in the database alongside tasks. Notes are separate from comments to enforce the "not shared to requester" contract.

### 3. `src/server/tasks/routes.ts`

**Change:** Added 3 new API endpoints for notes.

- `GET /api/tasks/:id/notes` — list notes (requires `tasks.read`)
- `POST /api/tasks/:id/notes` — add note (requires `tasks.write`)
- `DELETE /api/tasks/:id/notes/:noteId` — delete note (requires `tasks.write`)

All endpoints follow the same auth/error pattern as existing comment routes. POST and DELETE include audit logging.

**Reason:** Expose note CRUD via HTTP API for both MCP clients and direct API consumers.

### 4. `src/mcp-server/client.ts`

**Change:** Added `TaskNote` import and 2 client methods.

```typescript
// Interface additions:
listNotes(taskId: string): Promise<TaskNote[]>;
addNote(taskId: string, body: string): Promise<TaskNote>;
```

**Reason:** Enable MCP tools to interact with the notes API.

### 5. `src/mcp-server/tools.ts`

**Change:** Added 2 new MCP tools.

- `list_task_notes` — list internal notes for a task
- `add_task_note` — add an internal note to a task (emphasizes NOT shared with requester)

**Reason:** Let Codex CLI users view and add internal notes via MCP tools.

### 6. `test/mcp-server/tools.test.ts`

**Change:** Updated mock client, tool count, and added mock implementations.

- Added `TaskNote` import
- Added `listNotes` and `addNote` mock methods to `createMockClient()`
- Updated tool count assertion from 48 → 50

**Reason:** Maintain test coverage for new tools and ensure mock client satisfies the updated `TaskApiClient` interface.

## Risk

- **Low risk** — New feature, no existing behavior changed
- Notes table uses `ON DELETE CASCADE` so deleting a task cleans up its notes
- Notes are explicitly separate from comments — no confusion about what's shared vs internal

## Verification

- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [x] All 223 tests pass (9 test files)
- [x] Tool count assertion updated: 48 → 50
