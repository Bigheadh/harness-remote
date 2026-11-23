import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Compute Feishu webhook request signature:
 *   SHA-256(timestamp + nonce + encryptKey + rawBody) -> lowercase hex
 */
export function computeFeishuSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  rawBody: string,
): string {
  return createHash("sha256")
    .update(`${timestamp}${nonce}${encryptKey}${rawBody}`)
    .digest("hex");
}

/**
 * Verify Feishu `X-Lark-Signature` header in constant time.
 */
export function verifyFeishuSignature(
  timestamp: string | undefined,
  nonce: string | undefined,
  encryptKey: string,
  rawBody: string,
  signature: string | undefined,
): boolean {
  if (!timestamp || !nonce || !signature || !encryptKey) {
    return false;
  }
  const expected = computeFeishuSignature(timestamp, nonce, encryptKey, rawBody);
  const actualBuf = Buffer.from(signature.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Decrypt a Feishu AES-256-CBC encrypted webhook payload (`body.encrypt`).
 *
 * Feishu format:
 *   key = SHA-256(encryptKey) (32 bytes)
 *   raw = Base64Decode(encryptedBase64)
 *   iv = raw[0..16), ciphertext = raw[16..)
 *   plaintext = AES-256-CBC-Decrypt(ciphertext, key, iv) with PKCS#7 unpadding
 */
export function decryptFeishuEvent(
  encryptedBase64: string,
  encryptKey: string,
): Record<string, unknown> {
  if (!encryptKey) {
    throw new Error("Feishu encryptKey is not configured");
  }
  const raw = Buffer.from(encryptedBase64, "base64");
  if (raw.length < 32) {
    throw new Error("Encrypted payload is too short");
  }
  const key = createHash("sha256").update(encryptKey).digest();
  const iv = raw.subarray(0, 16);
  const ciphertext = raw.subarray(16);

  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(decrypted) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Decrypted Feishu payload is not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/**
 * Encrypt a JSON payload using Feishu's AES-256-CBC format (useful for testing).
 */
export function encryptFeishuEvent(
  payload: Record<string, unknown>,
  encryptKey: string,
  iv: Buffer = randomBytes(16),
): string {
  const key = createHash("sha256").update(encryptKey).digest();
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, ciphertext]).toString("base64");
}
