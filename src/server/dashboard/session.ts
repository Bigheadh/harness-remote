import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "harness_session";
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SessionPayload {
  token: string;
  exp: number;
}

function deriveKey(personalToken: string): Buffer {
  return createHash("sha256").update(`harness-dashboard-session:${personalToken}`).digest();
}

/**
 * Encrypt the caller's bearer token into an authenticated AES-256-GCM session cookie value.
 */
export function createSessionCookieValue(
  callerToken: string,
  personalToken: string,
  ttlMs: number = DEFAULT_SESSION_TTL_MS,
): string {
  const key = deriveKey(personalToken);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload: SessionPayload = {
    token: callerToken,
    exp: Date.now() + ttlMs,
  };
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

/**
 * Extract a named cookie from a raw HTTP Cookie header.
 */
function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

/**
 * Decrypt and verify the `harness_session` cookie, returning the caller's token if valid and unexpired.
 */
export function readTokenFromSessionCookie(
  cookieHeader: string | undefined,
  personalToken: string,
): string | undefined {
  const raw = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (!raw) return undefined;

  try {
    const buf = Buffer.from(raw, "base64url");
    if (buf.length < 12 + 16 + 2) return undefined;
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const key = deriveKey(personalToken);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decrypted) as Partial<SessionPayload>;
    if (typeof parsed.token !== "string" || typeof parsed.exp !== "number") {
      return undefined;
    }
    if (Date.now() > parsed.exp) {
      return undefined;
    }
    return parsed.token;
  } catch {
    return undefined;
  }
}

export function formatSetSessionCookie(
  value: string,
  options?: { secure?: boolean; maxAgeSec?: number },
): string {
  const maxAge = options?.maxAgeSec ?? Math.floor(DEFAULT_SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (options?.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function formatClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
