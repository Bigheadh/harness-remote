# Changelog: Rate Limiting per User/Device

## Overview

| Date | Task | Files Changed | Lines Added | Lines Removed |
|------|------|---------------|-------------|---------------|
| 2026-06-02 | Rate limiting per user/device (API abuse prevention) | 6 | ~180 | ~5 |

## File-by-File Changes

### 1. `src/server/ratelimit/limiter.ts` (NEW)

**Purpose**: In-memory sliding window rate limiter core.

- **Lines 1-98**: Full implementation of `RateLimiter` class
  - `consume(key)` — Check and consume one request, returns allowed/remaining/resetMs
  - `peek(key)` — Read current state without consuming
  - `getEffectiveConfig(key)` — Apply per-key overrides from config
  - `cleanup()` — Periodic eviction of expired window entries (every 5 min)
  - Constructor accepts `RateLimitConfig` with `maxRequests`, `windowMs`, and optional `overrides`
  - Timer uses `.unref()` so it doesn't prevent process exit

**Reason**: Central rate limiting logic, decoupled from HTTP framework for testability.

### 2. `src/server/ratelimit/middleware.ts` (NEW)

**Purpose**: Fastify hook that applies rate limiting to `/api/*` routes.

- **Lines 1-65**: Middleware implementation
  - `deriveKey(req, authCtx)` — Derives rate limit key from user ID, device ID, token hash, or IP
  - `registerRateLimitHook(server, limiter)` — Registers `onRequest` hook on Fastify
  - Sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
  - Returns 429 with `rate_limited` error code when exceeded
  - Only applies to `/api/*` routes (skips health, feishu events, dashboard)

**Reason**: Integrates rate limiter with Fastify request lifecycle. Key derivation prioritizes device ID > user ID > token hash > IP for multi-level granularity.

### 3. `src/shared/errors.ts` (MODIFIED)

- **Line 8**: Added `"rate_limited"` to `ErrorCode` union type

**Reason**: Rate limit violations need a distinct error code for proper HTTP 429 mapping.

### 4. `src/server/config.ts` (MODIFIED)

- **Lines 21-29**: Added `rateLimit` optional config field to `ServerConfig` interface
  - `maxRequests?: number` — Default 60
  - `windowMs?: number` — Default 60000
  - `overrides?: Record<string, ...>` — Per-key config overrides
- **Lines 78-93**: Added config parsing in `loadServerConfig()`
  - Parses optional `rateLimit` section from server.json
  - Validates numeric fields are positive
  - Passes through to config object

**Reason**: Rate limiting is opt-in and configurable per deployment.

### 5. `src/server/index.ts` (MODIFIED)

- **Lines 17-18**: Added imports for `RateLimiter` and `registerRateLimitHook`
- **Lines 86-92**: Created rate limiter instance and registered hook
  - Registered AFTER route registration so auth hook runs first
  - Uses config values with sensible defaults (60 req/min)

**Reason**: Wires rate limiting into server startup lifecycle.

### 6. `src/server/tasks/routes.ts` (MODIFIED)

- **Lines 1001-1003**: Added `rate_limited` → 429 mapping in error handler

**Reason**: AppError-based rate limit errors from middleware get proper HTTP status.

### 7. `test/server/ratelimit.test.ts` (NEW)

- **Lines 1-126**: 9 test cases covering:
  - Requests within limit are allowed
  - Requests exceeding limit are blocked
  - Different keys tracked independently
  - Window reset after expiry
  - Correct `resetMs` calculation
  - Per-key overrides
  - `peek()` doesn't consume requests
  - `size` reflects tracked keys
  - `cleanup()` removes expired entries

### 8. `FEATURES.md` (MODIFIED)

- Marked "Rate limiting per user/device" as `[x]`
- Added Phase 21: v4 Enterprise Features with 6 new `- [ ]` items

## Risk Assessment

- **Low risk**: Rate limiter is in-memory only — no persistence across restarts (acceptable for abuse prevention)
- **Low risk**: Hook runs after auth, so unauthenticated requests are still blocked by auth hook first
- **Medium risk**: Token hash fallback means super admin requests are rate-limited by token, not IP. If multiple clients share the same token, they share the limit. Mitigated by per-user RBAC tokens.
- **Low risk**: Cleanup timer uses `.unref()` so it won't prevent clean shutdown

## Verification Steps

1. `npm run typecheck` — Passes (0 errors)
2. `npm run build` — Passes
3. `npm run test` — 223 tests pass (9 new rate limit tests)
4. Manual: Server returns 429 after exceeding limit
5. Manual: `X-RateLimit-*` headers present on all `/api/*` responses
