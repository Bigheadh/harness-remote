# Changelog: Error Logging with Redaction

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-06-02 |
| Feature | Error logging with redaction |
| Files changed | 4 |
| Lines added | ~120 |
| Lines removed | ~10 |

## Files Changed

### src/shared/logger.ts (NEW)

- **redact()**: Replaces Bearer tokens, `token=...`, `secret=...`, `appSecret=...`, `personalToken=...`, `verificationToken=...`, `encryptKey=...` patterns with `[REDACTED]`
- **truncate()**: Truncates strings longer than 200 chars, appending `[TRUNCATED]`
- **createLogger()**: Structured JSON logger that auto-redacts all string meta values and truncates long strings. Emits to stdout (info/warn/debug) or stderr (error)

### src/server/index.ts

- Replaced `console.log` with structured redacting logger
- Disabled Fastify's built-in logger (`logger: false`) in favor of our own
- Added startup info log with port number

### src/server/feishu/events.ts

- Added structured logging for all event processing paths:
  - URL verification challenge received
  - Non-message events ignored
  - Invalid verification token (warn)
  - Duplicate events ignored
  - Non-allowed users
  - Group messages without bot mention
  - Task creation success (with taskId, userId, chatType)

### test/shared/logger.test.ts (NEW)

- 13 tests covering redaction patterns, truncation, logger levels, and output format

## Risk

- **Low**: Purely additive logging layer. No behavior changes to existing code paths.
- The `redact()` function uses regex patterns — edge cases with unusual token formats may slip through, but covers all standard Bearer token and key=value patterns.

## Verification

```bash
npm run typecheck  # PASS
npm run build      # PASS
npm run test       # 108 tests pass (6 test files)
```
