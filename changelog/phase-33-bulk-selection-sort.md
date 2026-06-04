# Phase 33: Bulk Selection & Sortable Columns

**Date:** 2026-06-04
**Task:** Add bulk selection with actions and sortable columns to dashboard
**Files modified:** 2 (FEATURES.md, src/server/dashboard/templates/dashboard.ts)
**Lines added:** ~130 | **Lines removed:** 0

## Overview

| # | File | Change | Reason |
|---|------|--------|--------|
| 1 | `src/server/dashboard/templates/dashboard.ts` | Added checkbox column, bulk action bar, sortable columns, tab title counts | Complete Phase 32 bulk selection + Phase 33 sortable columns and tab title |
| 2 | `FEATURES.md` | Marked bulk selection as [x], added Phase 33 items | Tracker update |

## Detailed Changes

### 1. `src/server/dashboard/templates/dashboard.ts`

#### CSS additions (~35 lines)
- `.bulk-bar` — Fixed action bar below toolbar, shown when tasks selected
- `.bulk-count` — Purple accent text showing count
- `.bulk-actions` — Flex container for bulk action buttons
- `.task-table th:first-child/td:first-child` — Narrow checkbox column
- `.task-table input[type="checkbox"]` — Accent-colored checkboxes
- `.sortable` — Cursor pointer + hover color for sortable headers
- `.sort-arrow` — Small arrow indicator (⇅/↑/↓) in headers

#### HTML additions (~13 lines)
- Bulk action bar (`#bulkBar`) with buttons: Mark Done, Start, Mark Failed, Assign Device, Delete, Clear
- Select-all checkbox in table header
- Row checkbox in each task row (with `event.stopPropagation()`)

#### JavaScript additions (~110 lines)
- **Selection state**: `selectedIds` Set, `onRowSelect()`, `toggleSelectAll()`, `clearSelection()`, `updateBulkBar()`
- **Bulk operations**: `bulkAction(status)`, `bulkAssign()`, `bulkDelete()` — call existing `/api/tasks/bulk/*` endpoints
- **Column sorting**: `sortCol`, `sortDir` state, `sortBy(col)` — sorts by id, status, priority, dueDate, createdAt with proper comparators
- **Tab title**: Updates `document.title` with active task count in parentheses

### 2. `FEATURES.md`
- Phase 32 `Bulk selection with actions` → `[x]`
- Added Phase 33 section with 4 items (2 implemented this run)

## Risk Assessment
- **Low risk** — All changes are in the dashboard HTML template (client-side only)
- No backend changes, no DB changes
- Existing bulk API endpoints were already implemented and tested

## Verification
- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [x] Bulk selection UI renders with checkboxes
- [x] Sortable headers show arrows and sort correctly
- [x] Tab title shows active task count
