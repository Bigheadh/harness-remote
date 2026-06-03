# Changelog: Phase 31 — Enhanced Dashboard

## Overview

| Date | Task | Files Changed | Lines Added | Lines Removed |
|------|------|---------------|-------------|---------------|
| 2026-06-03 | Enhanced Dashboard with rich task details, subtasks, comments, activity feed, SSE real-time updates | 2 | 416 | 208 |

## File Changes

### 1. `src/server/dashboard/templates/dashboard.ts`

**Replaced**: Entire dashboard template (was 546 lines, now ~560 lines of JS + CSS)

**Before**: Basic read-only dashboard showing only ID, status, priority, command text, created/updated columns. Detail panel showed only basic fields. Used 30-second polling for refresh.

**After**: Rich dashboard with:
- **Task list columns**: ID, Status, Priority, Command, Tags, Due Date, Device, Created
- **Tag filter**: New input field to filter tasks by tag
- **Enhanced search**: Now searches description, tags, and result summary in addition to ID/command
- **Detail panel sections**:
  - 📋 Basic Info: ID, status, priority, source, feishu user/chat, assigned device, pinned, timestamps (created/updated/picked/started/completed)
  - 🏷️ Tags: Display all tags with styled badges
  - 📝 Description: Show task description if present
  - 📅 Schedule: Due date (with overdue highlighting in red) and reminder time
  - 💻 Command: Full command text
  - 📎 Attachments: List all attachments with file type
  - 🔗 Dependencies: List dependent task IDs
  - ✅ Result: Show result summary
  - 📋 Details: Show full result details
  - 🧩 Subtasks: Loaded async from `/api/tasks/:id/subtasks`
  - 💬 Comments: Loaded async from `/api/tasks/:id/comments`
  - 📜 Activity: Loaded async from `/api/tasks/:id/activity` (last 20 items)
- **SSE real-time updates**: Connects to `/api/tasks/stream` with auto-reconnect. Green indicator when live, red when disconnected. Refreshes task list on any task event.
- **Overdue highlighting**: Due dates in the past show in red with ⏰ emoji
- **Processing timestamps**: Shows pickedAt, startedAt, completedAt in detail panel
- **Responsive design**: Works on mobile with max-width panel

**Reason**: The dashboard was the biggest user-facing gap in the project. It only showed basic task info despite the backend having rich data (tags, due dates, descriptions, subtasks, comments, activity, SLA). This enhancement makes the dashboard a proper management interface.

**Impact**: User-facing only. No API changes, no store changes, no type changes. Pure template rewrite.

**Risk**: Low. Template is self-contained HTML/CSS/JS. Subtasks/comments/activity loading uses try/catch with empty fallbacks so missing endpoints don't break the UI.

### 2. `FEATURES.md`

**Added**: Phase 31 section with 9 feature items, all marked `[x]`.

## Structural Summary

- **Added**: Tag filter input, enhanced search, SSE connection, detail panel sections for subtasks/comments/activity
- **Refactored**: Complete rewrite of dashboard template with modular section rendering
- **No new files**: All changes in existing files

## Verification

- [x] `npm run typecheck` — passes
- [x] `npm run build` — passes
- [x] `npm run test` — 270/270 pass
- [x] `git push` — successful
