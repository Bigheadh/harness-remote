# Phase 30: Feishu Bot Interactive Commands

**Date:** 2026-06-03
**Task:** Add interactive slash commands to Feishu bot
**Files Modified:** 3 files (1 new, 2 modified)
**Lines Added:** ~400
**Lines Removed:** ~0

## Overview

Transformed the Feishu bot from a one-way task creator into an interactive task management interface. Users can now send slash commands directly in Feishu to query, search, and manage tasks without needing to open Codex CLI on the company computer.

## Changes by File

### 1. `src/server/feishu/commands.ts` (NEW)

**Purpose:** Command parser, executor, and card builders for all Feishu bot commands.

**What was added:**
- `ParsedCommand` interface and `parseCommand()` function — parses `/command args` format
- `isCommand()` helper — checks if message starts with `/`
- `executeCommand()` — routes parsed commands to appropriate handlers
- Card builders for 8 commands:
  - `buildHelpCard()` — lists all available commands with usage tips
  - `buildListCard()` — lists tasks filtered by status (default: pending), up to 10
  - `buildStatusCard()` — shows full task details with partial ID matching
  - `buildCancelCard()` — cancels pending tasks by setting status to failed
  - `buildStatsCard()` — shows task statistics (total, by status, completion rate, overdue, avg resolution)
  - `buildSearchCard()` — full-text search across tasks
  - `buildOverdueCard()` — lists tasks past their due date
  - `buildMineCard()` — lists tasks created by the sender's Feishu user ID

**Design decisions:**
- Commands execute asynchronously after returning HTTP 200 to Feishu (Feishu requires fast response)
- Partial ID matching for `/status` and `/cancel` — users can type first 8+ chars of a task ID
- `/cancel` only works on pending tasks; other statuses return an error card
- All responses are Feishu interactive cards (rich format) for consistent UX

### 2. `src/server/feishu/events.ts` (MODIFIED)

**Changes:**
- Added import: `isCommand`, `parseCommand`, `executeCommand` from `./commands.js`
- Added command detection block before task creation (lines 363-385):
  - If message text starts with `/`, parse as command
  - Log the command for audit
  - Log `event.command` to audit store
  - Mark event as processed (prevents dedup re-delivery)
  - Execute command asynchronously (non-blocking)
  - Return HTTP 200 immediately with `{ ok: true, command: "..." }`
  - Skip task creation for commands

**Before:** All messages from allowed users created tasks.
**After:** Messages starting with `/` are routed to command handler; only non-command messages create tasks.

### 3. `src/shared/types.ts` (MODIFIED)

**Change:** Added `"event.command"` to `AuditAction` union type (line 129).

**Before:** `AuditAction` included `event.received`, `event.duplicate`, `event.non_allowed_user`
**After:** Added `event.command` for tracking slash command usage in audit logs.

### 4. `FEATURES.md` (MODIFIED)

**Change:** Added Phase 30 section with 6 completed feature items.

## Risk Assessment

**Low risk:**
- New file only — no changes to existing command processing logic
- Commands are additive — existing task creation flow is unchanged for non-slash messages
- Async execution means even if command processing fails, the HTTP response is already sent
- No new database schema changes

**Potential issues:**
- Users who prefix messages with `/` will get commands instead of tasks — this is intentional but could surprise users
- `/cancel` is a destructive action with no undo — mitigated by only allowing cancellation of pending tasks

## Verification

1. `npm run typecheck` — passes
2. `npm run build` — passes
3. `npm test` — 270 tests pass (11 test files)
4. Manual verification: send `/help` to Feishu bot, expect help card response
