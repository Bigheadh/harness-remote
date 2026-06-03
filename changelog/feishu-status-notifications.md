# Changelog: Feishu Proactive Status Change Notifications

**Date:** 2026-06-03
**Feature:** Proactive Feishu card notifications on task status transitions
**Files Modified:** 5
**Lines Added:** ~40
**Lines Removed:** 0

## Overview

When a task's status changes to a configured target status (e.g., `running`, `failed`), the server now proactively sends a Feishu interactive card message to the original conversation. This lets Feishu users know their task is being worked on — or has failed — without waiting for the final result report.

Previously, Feishu users only received notifications when `report_task_result` was called. Now they get real-time updates on key status transitions.

## Per-File Changes

### 1. `src/server/config.ts`

**What changed:** Added `notifyOnStatusChange?: string[]` to the `feishu` config section.

- **Before:** `feishu` config had `appId`, `appSecret`, `verificationToken`, `encryptKey`, `allowedUserIds`
- **After:** Added optional `notifyOnStatusChange` array field
- **Reason:** Allows users to configure which status transitions trigger Feishu notifications
- **Impact:** Backward compatible — field is optional, absent means no notifications

Also added parsing logic in `loadServerConfig()`:
- **Before:** No parsing of `notifyOnStatusChange`
- **After:** Validates the array, filters to only valid status values (`pending`, `picked`, `running`, `done`, `failed`)
- **Reason:** Prevents invalid status strings from being passed through

Also added to return value:
- **Before:** Return object didn't include `notifyOnStatusChange`
- **After:** Spread `notifyOnStatusChange` into the `feishu` return object when present

### 2. `src/server/feishu/card-builder.ts`

**What changed:** Exported `STATUS_LABELS`, `STATUS_COLORS`, and `PRIORITY_LABELS` constants.

- **Before:** These were `const` (module-private)
- **After:** Changed to `export const`
- **Reason:** Routes.ts needs `STATUS_LABELS` and `STATUS_COLORS` for bulk update notification cards
- **Impact:** Purely additive — existing internal usage unaffected, now also importable

### 3. `src/server/tasks/routes.ts`

**What changed:** Added Feishu notification logic to single and bulk status update routes.

**Import update:**
- **Before:** `import { buildTaskResultCard, buildCustomCard } from "../feishu/card-builder.js"`
- **After:** `import { buildTaskResultCard, buildTaskStatusCard, buildCustomCard, STATUS_LABELS, STATUS_COLORS } from "../feishu/card-builder.js"`
- **Reason:** Need `buildTaskStatusCard` for single-task notifications, `STATUS_LABELS`/`STATUS_COLORS` for bulk notifications

**Function signature update:**
- **Before:** `registerTaskRoutes(server, store, personalToken, feishuClient, auditStore, userStore, webhookStore, apiKeyStore)`
- **After:** Added `notifyOnStatusChange?: string[]` as 9th parameter
- **Reason:** Pass the config array into the route handler scope

**Single status update (POST /api/tasks/:id/status):**
- **Before:** After status update → audit log → webhook → SSE → return
- **After:** Added Feishu notification between SSE broadcast and return. If `feishuClient` exists, `task.feishuMessageId` exists, and `notifyOnStatusChange` includes the new status, sends a `buildTaskStatusCard` via `sendCardMessage`. Fire-and-forget with error logging.
- **Reason:** Proactively notify Feishu when task status changes to a user-relevant state

**Bulk status update (POST /api/tasks/bulk/status):**
- **Before:** After bulk update → audit log → webhooks → return
- **After:** Added Feishu notification loop after webhooks. For each successfully updated task with a `feishuMessageId`, sends a `buildCustomCard` (since previous status is unknown in bulk). Fire-and-forget with error logging.
- **Reason:** Same as single update, but for bulk operations

### 4. `src/server/index.ts`

**What changed:** Pass `config.feishu.notifyOnStatusChange` to `registerTaskRoutes`.

- **Before:** `registerTaskRoutes(server, store, config.personalToken, feishuClient, auditStore, userStore, webhookStore, apiKeyStore)`
- **After:** Added `config.feishu.notifyOnStatusChange` as 9th argument
- **Reason:** Wires the config value from `loadServerConfig()` to the route handler

### 5. `config/server.example.json`

**What changed:** Added `notifyOnStatusChange` example.

- **Before:** No `notifyOnStatusChange` field
- **After:** `"notifyOnStatusChange": ["running", "failed"]`
- **Reason:** Documents the new config option for users

## Risk Assessment

- **Low risk** — Feature is purely additive and opt-in. If `notifyOnStatusChange` is not configured, no notifications are sent (existing behavior preserved).
- **Backward compatible** — The new config field is optional. Existing `config/server.json` files without this field work unchanged.
- **Fire-and-forget** — Feishu notification failures are logged but don't block the status update response. Task status is always updated successfully regardless of Feishu notification outcome.
- **No database changes** — No schema migration needed.

## Verification

1. `npm run typecheck` — passes (EXIT: 0)
2. `npm run build` — passes (EXIT: 0)
3. `npm run test` — 267 tests pass across 11 files (EXIT: 0)
4. Config parsing: `notifyOnStatusChange: ["running", "failed"]` correctly parsed; missing field → undefined (no notifications)
5. Invalid status strings in config are filtered out
