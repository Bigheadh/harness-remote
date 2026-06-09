# Phase 87: Dashboard Task Detail Panel - Reopen, Forward, Archive Actions

## Date
2026-06-10

## Summary
Added Reopen, Forward, Archive, and Unarchive action buttons to the dashboard task detail panel. These actions were already fully implemented on the backend (store methods, API routes, MCP tools) but lacked dashboard UI exposure.

## Files Modified

### src/server/dashboard/templates/dashboard.ts

#### Change 1: Action buttons in detail panel (lines ~1183-1193)
**Before:**
```
html += '<button ...>📝 Clone & Edit</button>';
html += '</div></div></div>';
```
**After:**
```
html += '<button ...>📝 Clone & Edit</button>';
if (t.status === 'done' || t.status === 'failed') {
  html += '<button ...>🔁 Reopen</button>';
}
if (t.status !== 'archived' && t.archivedAt == null) {
  html += '<button ...>➡️ Forward</button>';
}
if (!t.archivedAt) {
  html += '<button ...>📦 Archive</button>';
} else {
  html += '<button ...>📤 Unarchive</button>';
}
html += '</div></div></div>';
```
**Reason:** Wire up existing backend capabilities to the dashboard UI.
**Impact:** Users can now reopen, forward, and archive/unarchive tasks directly from the detail panel.

#### Change 2: New JS functions (lines ~1819-1865)
**Before:** No taskReopen, taskForward, taskArchive, taskUnarchive functions.
**After:** Four new async functions added before bulkAction():
- `taskReopen(id)` - POST /api/tasks/:id/reopen
- `taskForward(id)` - Fetches device list, prompts for target, POST /api/tasks/:id/forward
- `taskArchive(id)` - POST /api/tasks/:id/archive
- `taskUnarchive(id)` - POST /api/tasks/:id/unarchive
**Reason:** Each function follows the existing pattern (apiFetch, closeDetail, loadTasks).
**Impact:** Full lifecycle management from the dashboard.

### FEATURES.md
- Added Phase 87 section with 8 completed items.

## Risk
- Low risk: all backend endpoints already exist and are tested.
- Forward action uses prompt() for device selection - functional but not pretty. Could be enhanced with a modal in a future phase.

## Verification
- `npm run build` passes
- `npm test` passes (564/564)
- Manual verification: detail panel shows Reopen (done/failed), Forward (non-archived), Archive/Unarchive buttons
