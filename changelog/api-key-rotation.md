# Changelog: API Key Rotation with Grace Period

**Date**: 2026-06-02
**Feature**: API key rotation with grace period (auto-expire old tokens after rotation)
**Files changed**: 9

## Overview

| Metric | Value |
|--------|-------|
| Files modified | 8 |
| Files created | 2 |
| Lines added | ~250 |
| Lines removed | ~5 |

## Changes by File

### 1. `src/shared/types.ts` (Modified)
- **What**: Added `api_key.created`, `api_key.rotated`, `api_key.revoked` to `AuditAction` union type
- **Why**: Need audit trail actions for API key lifecycle events
- **Impact**: Extends audit logging capability; no breaking changes

### 2. `src/server/auth/apikeys/store.ts` (Created)
- **What**: New SQLite-backed API key store with rotation support
- **Key features**:
  - `createApiKey(name, userId, role)` — generate a new API key
  - `rotateApiKey(id, gracePeriodMs)` — move current key to `previous_key`, generate new key
  - `revokeApiKey(id)` — permanently delete a key
  - `enableApiKey(id)` / `disableApiKey(id)` — toggle key status
  - `markLastUsed(id)` — update last usage timestamp
  - `deleteExpiredPreviousKeys()` — cleanup expired grace-period keys
  - `getApiKeyByKey(key)` — lookup by key string (supports current and previous keys)
- **Why**: Dedicated store for API key lifecycle management with grace period support
- **Impact**: New table `api_keys` in separate SQLite file (`.apikeys.sqlite`)

### 3. `src/server/auth/apikeys/routes.ts` (Created)
- **What**: REST API for API key management
- **Endpoints**:
  - `POST /api/keys` — create a new API key
  - `GET /api/keys` — list all API keys (optional `?userId=` filter)
  - `GET /api/keys/:id` — get key details
  - `POST /api/keys/:id/rotate` — rotate key with configurable grace period (default 24h, max 7d)
  - `POST /api/keys/:id/revoke` — permanently delete a key
  - `POST /api/keys/:id/enable` — re-enable a disabled key
  - `POST /api/keys/:id/disable` — disable a key
  - `POST /api/keys/cleanup-expired` — cleanup expired previous keys
- **Why**: Admin interface for managing API keys with rotation
- **Impact**: All endpoints require `users.write` permission (admin/operator only)

### 4. `src/server/auth/middleware.ts` (Modified)
- **What**: Extended `authenticate()` to accept optional `ApiKeyStore` parameter
- **New flow**: personalToken → per-user token → API key (current) → API key (previous/grace period)
- **Grace period**: Previous key remains valid until `previousKeyExpiresAt` timestamp
- **Why**: API keys need to work as authentication credentials alongside existing token system
- **Impact**: Backward compatible — `apiKeyStore` is optional; existing auth still works

### 5. `src/server/tasks/routes.ts` (Modified)
- **What**: Added `apiKeyStore` parameter, passed to `authenticate()`
- **Impact**: Task API now supports API key authentication

### 6. `src/server/audit/routes.ts` (Modified)
- **What**: Added `apiKeyStore` parameter, passed to `authenticate()`
- **Impact**: Audit API now supports API key authentication

### 7. `src/server/devices/routes.ts` (Modified)
- **What**: Added `apiKeyStore` parameter, passed to `authenticate()`
- **Impact**: Device API now supports API key authentication

### 8. `src/server/webhooks/routes.ts` (Modified)
- **What**: Added `apiKeyStore` parameter, passed to `authenticate()`
- **Impact**: Webhook API now supports API key authentication

### 9. `src/server/dashboard/routes.ts` (Modified)
- **What**: Added `apiKeyStore` parameter, passed to all 4 `authenticate()` calls
- **Impact**: Dashboard now supports API key authentication via header and query param

### 10. `src/server/auth/routes.ts` (Modified)
- **What**: Added `apiKeyStore` parameter, passed to `authenticate()`
- **Impact**: User management API now supports API key authentication

### 11. `src/server/index.ts` (Modified)
- **What**: Creates `apiKeyStore`, passes it to all route registrations
- **Impact**: API key store initialized on server startup with dedicated SQLite file

## Risk Assessment
- **Low risk**: All changes are additive; existing authentication flow unchanged
- **Grace period default**: 24 hours — configurable per rotation
- **Max grace period**: 7 days — prevents indefinite old key validity
- **Previous key lookup**: Scans all keys for previous key match (acceptable for small key counts)

## Verification Steps
1. `npm run typecheck` — passes
2. `npm run build` — passes
3. `npm run test` — 223/223 tests pass
4. New API key endpoints available at `/api/keys/*`
5. Authentication middleware now checks API keys as third auth method
