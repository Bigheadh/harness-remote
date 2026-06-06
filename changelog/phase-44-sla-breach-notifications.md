# Changelog: Phase 44 — SLA Breach Feishu Notifications

**Date:** 2026-06-07
**Author:** Hermes Agent (automated)
**Risk:** Low — adds notification layer to existing SLA detection, no breaking changes

## Overview

| Item | Value |
|------|-------|
| Files changed | 6 |
| Lines added | ~200 |
| Lines removed | ~5 |
| Tests added | 6 |
| Test files modified | 2 |

## Per-File Changes

### 1. `src/shared/types.ts`
**Change:** Added `SlaBreachNotification` interface
**Before:** No type for SLA breach notification details
**After:** New interface with taskId, taskCommandText, taskPriority, taskStatus, taskTags, taskFeishuMessageId, policyName, breachType, targetMinutes, actualMinutes
**Reason:** Need structured data to pass breach details from store to route for Feishu notification
**Impact:** No breaking changes — new type only

### 2. `src/server/feishu/card-builder.ts`
**Change:** Added `buildSlaBreachCard` function + imported `SlaBreachType`
**Before:** No SLA breach card builder
**After:** New function that builds rich Feishu interactive cards with breach/warning emoji, policy name, task details, priority badge, target vs elapsed times, tags, and timestamp
**Reason:** Users need visual notification when SLAs are breached or at risk
**Impact:** New export only — no changes to existing functions

### 3. `src/server/tasks/store.ts`
**Change:** Modified `checkAndRecordSlaBreaches` return type and implementation
**Before:** Returns `{ warnings: number; breaches: number }`
**After:** Returns `{ warnings: number; breaches: number; details: SlaBreachNotification[] }`
**Reason:** Route needs breach details to build and send Feishu notification cards
**Impact:** Return type change — all callers must handle new `details` field (already done in routes and client)

### 4. `src/mcp-server/client.ts`
**Change:** Updated `checkSlaBreaches` interface and implementation return types
**Before:** Returns `{ warnings: number; breaches: number }`
**After:** Returns `{ warnings: number; breaches: number; details: SlaBreachNotification[] }`
**Reason:** Keep client interface in sync with store return type
**Impact:** Interface change — mock client in tests updated

### 5. `src/server/tasks/routes.ts`
**Change:** Added Feishu notification logic to SLA check endpoint + imported `buildSlaBreachCard`
**Before:** SLA check only recorded breaches to DB and returned counts
**After:** After recording breaches, iterates over details and sends Feishu card notifications for each breach/warning with a feishuMessageId
**Reason:** Users need proactive notification when SLAs are at risk
**Impact:** Non-blocking notifications with error logging — no impact on existing behavior

### 6. `test/server/feishu.card-builder.test.ts`
**Change:** Added 6 tests for `buildSlaBreachCard`
**Before:** No SLA breach card tests
**After:** Tests for breach/warning cards, task details, timing, tags, no-tags case
**Reason:** Ensure card builder produces correct output for all scenarios
**Impact:** Test-only — no production code changes

### 7. `test/mcp-server/tools.test.ts`
**Change:** Updated mock client `checkSlaBreaches` return type
**Before:** Returns `{ warnings: number; breaches: number }`
**After:** Returns `{ warnings: number; breaches: number; details: [] }`
**Reason:** Mock must match updated interface
**Impact:** Test-only — no production code changes

## Risk Assessment

- **Low risk** — Adds notification layer on top of existing SLA detection
- **No breaking changes** — New type and function only, existing code unaffected
- **Non-blocking** — Feishu notifications are fire-and-forget with error logging
- **Backward compatible** — `details` field is optional in API response (`?? []`)

## Verification

```bash
npm run typecheck  # ✅ passes
npm run build      # ✅ passes
npm test           # ✅ 322 tests pass (was 316)
```
