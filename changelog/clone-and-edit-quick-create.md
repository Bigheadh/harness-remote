# Changelog: Task Quick-Create from Detail Panel (Clone with Modification)

## Date
2026-06-04

## Overview
| Metric | Value |
|--------|-------|
| Files modified | 2 |
| Lines added | ~30 |
| Lines removed | 0 |

## Files Changed

### 1. src/server/dashboard/templates/dashboard.ts

#### Change 1: Added "Clone & Edit" button in detail panel actions
- **Location**: `showDetail()` function, action buttons section (~line 726)
- **Before**: Only a "📋 Clone" button existed
- **After**: Added a "📝 Clone & Edit" button next to the existing Clone button
- **Reason**: Users need a way to create similar tasks without starting from scratch — clone opens the create form pre-filled with the source task's data
- **Impact**: New UI element in task detail panel action bar

#### Change 2: Added `taskCloneAndEdit(id)` function
- **Location**: After the existing `taskClone()` function (~line 997)
- **Before**: Only `taskClone()` existed (exact duplicate via API)
- **After**: New `taskCloneAndEdit(id)` function that:
  - Fetches the source task data via `GET /api/tasks/:id`
  - Sets modal title to "Clone & Edit Task"
  - Pre-fills all form fields: commandText, description, priority, tags, assignedDeviceId, dueDate
  - Opens the create modal with pre-filled data
  - Closes the detail panel
- **Reason**: Enables "clone with modification" — user can edit any field before creating
- **Impact**: New async function, fetches task data before opening modal

#### Change 3: Updated `openCreateModal()` to reset title
- **Location**: `openCreateModal()` function (~line 1020)
- **Before**: Did not set modal title
- **After**: Sets title to "Create Task" on every normal open
- **Reason**: Ensures the title resets after a Clone & Edit session
- **Impact**: One added line, no behavior change for normal flow

### 2. FEATURES.md
- **Change**: Marked "Task quick-create from detail panel (clone with modification)" as `[x]`

## Risk Assessment
- **Risk level**: Low
- **Description**: Pure UI change — no backend modifications. The existing `GET /api/tasks/:id` and `POST /api/tasks` endpoints are reused. No new API surface.
- **Rollback**: Revert the 3 patches in dashboard.ts

## Verification Steps
1. `npm run typecheck` — PASS
2. `npm run build` — PASS
3. `npm run test` — 270 tests passed, 11 test files
4. Manual: Open detail panel → click "Clone & Edit" → verify modal opens pre-filled → edit fields → submit → verify new task created
