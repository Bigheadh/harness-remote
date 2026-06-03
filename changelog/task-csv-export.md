# Task CSV Export — GET /api/tasks/export.csv

**Date**: 2026-06-03  
**Feature**: CSV export endpoint for task reporting  
**Files Modified**: 3  
**Lines Added**: ~80  
**Lines Removed**: 0

## Overview

Added `GET /api/tasks/export.csv` — downloads all tasks as a CSV file with proper RFC 4180 escaping. Useful for reporting in Excel/Google Sheets, data migration, and auditing.

## Per-File Changes

### 1. `src/server/tasks/store.ts`

| Change | Details |
|--------|---------|
| **Added** `getAllTasks()` to `TaskStore` interface (line ~112) | Returns all tasks without the 100-row limit of `searchTasks()` |
| **Added** `getAllTasks()` implementation (line ~2439) | Simple `SELECT * FROM tasks ORDER BY created_at DESC` — no limit, no filters |

**Why**: `searchTasks()` caps at 100 rows. CSV export needs all tasks.

### 2. `src/server/tasks/routes.ts`

| Change | Details |
|--------|---------|
| **Added** `GET /api/tasks/export.csv` route (line ~583) | Auth required (`tasks.read`), generates CSV with proper escaping |
| **Added** `csvEscape()` helper (inline) | RFC 4180 compliant: escapes commas, double-quotes, and newlines |
| **CSV columns** | id, source, feishuMessageId, feishuChatId, feishuUserId, commandText, status, priority, assignedDeviceId, dueDate, reminderAt, pinned, createdAt, updatedAt, resultSummary, resultDetails, tags |
| **Content headers** | `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="tasks-YYYY-MM-DD.csv"` |

**Why**: Route registered before `/api/tasks/:id` to avoid Fastify's radix tree matching "export.csv" as an `:id` parameter.

### 3. `FEATURES.md`

| Change | Details |
|--------|---------|
| **Updated** Phase 26 item | Marked Task CSV export as `[x]` |

## Risk Assessment

- **Low risk**: Additive-only change. No existing code modified.
- **Performance**: Uses `getAllTasks()` which loads all tasks into memory. For very large datasets (10k+), this could be slow. Acceptable for current scale.

## Verification Steps

1. ✅ `npm run typecheck` — passes
2. ✅ `npm run build` — passes
3. ✅ `npm test` — all 246 tests pass
4. Manual: `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/tasks/export.csv` returns CSV file
