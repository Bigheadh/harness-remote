import { createHash, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "sha256:";
const HASHED_LENGTH = HASH_PREFIX.length + 64; // "sha256:" + 64 hex chars

/**
 * Check whether a stored credential value is already in `sha256:<hex>` format.
 */
export function isHashedSecret(value: string): boolean {
  return value.startsWith(HASH_PREFIX) && value.length === HASHED_LENGTH;
}

/**
 * Compute a deterministic SHA-256 digest (`sha256:<64-hex>`) for high-entropy
 * bearer tokens, API keys, and device tokens so plaintext secrets are never persisted in SQLite.
 */
export function hashSecret(rawSecret: string): string {
  return `${HASH_PREFIX}${createHash("sha256").update(rawSecret).digest("hex")}`;
}

/**
 * Return the hashed form of a credential (idempotent for migration of legacy plaintext rows).
 */
export function ensureHashedSecret(value: string): string {
  return isHashedSecret(value) ? value : hashSecret(value);
}

/**
 * Constant-time comparison between a raw incoming secret and a stored credential
 * (supports both `sha256:` hashed storage and legacy plaintext mocks).
 */
export function verifySecret(rawSecret: string, stored: string): boolean {
  const candidate = isHashedSecret(stored) ? hashSecret(rawSecret) : rawSecret;
  const a = Buffer.from(candidate);
  const b = Buffer.from(stored);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
