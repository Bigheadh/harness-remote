# Phase 72: Feishu /digest Slash Command

## Overview

| Metric | Value |
|--------|-------|
| Date | 2026-06-08 |
| Task | Add /digest slash command for Feishu daily task summary |
| Files Modified | 3 |
| Files Added | 2 |
| Tests Added | 8 |
| Test Count | 528 → 536 |

## Changes

### 1. src/server/feishu/commands.ts

**Added `/digest` command handler and `buildDigestCard` function.**

- **Line 17**: Added `/digest` to the command documentation comment
- **Line 106-108**: Added `case "digest"` to `executeCommand` switch statement
- **Line 151**: Added `**/digest** — Daily task summary` to help card
- **Lines 477-632**: Added `buildDigestCard()` async function

**Before:** No digest command existed. Users had to run `/stats`, `/overdue`, `/mine` separately to get task overview.

**After:** Users send `/digest` in Feishu and receive a comprehensive card showing:
- Summary line: pending count, in-progress count, overdue count (with warning emoji), due-today count, completed-today count
- Overdue tasks section (with priority badges and truncated command text)
- Due today tasks section
- In-progress tasks section (picked + running)
- Completed today section
- Empty state message when no tasks exist
- Card header turns red when overdue tasks exist (visual urgency)

**Reason:** The project evolved through 71 phases but lacked a single-command task summary. Popular tools like Linear, Plane, and ClickUp all offer daily digest or briefing features. This fills a real UX gap — users currently need 3+ commands to get the same overview.

**Impact:** High user-facing value. Feishu bot becomes more useful for quick task triage.

**Risk:** Low. Pure additive feature — no existing behavior changed.

### 2. src/server/feishu/card-builder.ts

**Exported `CardElement` interface.**

- **Line 67**: Changed `interface CardElement` to `export interface CardElement`

**Before:** `CardElement` was a module-internal interface, only used within card-builder.ts.

**After:** `CardElement` is exported and can be imported by other modules (commands.ts uses it for the digest card element types).

**Reason:** The `buildDigestCard` function in commands.ts needs to reference `CardElement[]` for type safety. Without the export, TypeScript reports `TS2694: Namespace has no exported member 'CardElement'`.

**Impact:** No behavioral change — purely a type-level export.

**Risk:** None. Adding an export doesn't break existing consumers.

### 3. test/server/feishu.commands.test.ts (NEW)

**Added 8 tests for the digest command.**

- `parseCommand` tests: parses `/digest` and `/digest extra`
- `executeCommand /digest` tests:
  - Sends a digest card when called
  - Shows empty state when no tasks
  - Shows overdue tasks with red header
  - Shows pending tasks in summary
  - Shows in-progress tasks
  - Handles errors gracefully

**Before:** No tests existed for the Feishu commands module.

**After:** Full test coverage for the digest command including happy paths, edge cases, and error handling.

**Reason:** All features should have test coverage. The commands module had zero tests — this adds the first test file for it.

**Risk:** None. Tests are additive.

## Verification

- [x] `npm run typecheck` — passes
- [x] `npm run build` — passes
- [x] `npm test` — 536 tests pass (528 existing + 8 new)
- [x] No TODO/FIXME/HACK introduced
