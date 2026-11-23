import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import { mkdirSync, rmSync } from "node:fs";
import {
  computeFeishuSignature,
  verifyFeishuSignature,
  encryptFeishuEvent,
  decryptFeishuEvent,
} from "../../src/server/feishu/crypto.js";
import { createTaskStore } from "../../src/server/tasks/store.js";
import { registerFeishuRoutes } from "../../src/server/feishu/events.js";

const TMP_DIR = "/tmp/harness-remote-feishu-crypto-test";
const ENCRYPT_KEY = "test_feishu_encrypt_key_secret_32";
const VERIFY_TOKEN = "test_verify_token_xyz";

function freshDir(): string {
  const dir = `${TMP_DIR}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("Feishu Crypto & Encrypted Webhook Handling", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("encrypts and decrypts Feishu event payloads round-trip", () => {
    const original = {
      schema: "2.0",
      header: { event_id: "ev_enc_1", token: VERIFY_TOKEN },
      event: { message: { text: "hello encrypted world" } },
    };

    const encrypted = encryptFeishuEvent(original, ENCRYPT_KEY);
    expect(typeof encrypted).toBe("string");
    const decrypted = decryptFeishuEvent(encrypted, ENCRYPT_KEY);
    expect(decrypted).toEqual(original);
  });

  it("rejects decryption with wrong encryptKey or tampered ciphertext", () => {
    const encrypted = encryptFeishuEvent({ challenge: "abc" }, ENCRYPT_KEY);
    expect(() => decryptFeishuEvent(encrypted, "wrong_key")).toThrow();
    expect(() => decryptFeishuEvent("not-valid-base64", ENCRYPT_KEY)).toThrow();
  });

  it("verifies X-Lark-Signature in constant time", () => {
    const ts = "1700000000";
    const nonce = "nonce_abc";
    const rawBody = JSON.stringify({ encrypt: "payload" });
    const sig = computeFeishuSignature(ts, nonce, ENCRYPT_KEY, rawBody);

    expect(verifyFeishuSignature(ts, nonce, ENCRYPT_KEY, rawBody, sig)).toBe(true);
    expect(verifyFeishuSignature(ts, nonce, ENCRYPT_KEY, rawBody, "0".repeat(64))).toBe(false);
    expect(verifyFeishuSignature(ts, nonce, ENCRYPT_KEY, rawBody + " ", sig)).toBe(false);
    expect(verifyFeishuSignature(undefined, nonce, ENCRYPT_KEY, rawBody, sig)).toBe(false);
  });

  it("handles encrypted URL challenge and encrypted message events on /feishu/events", async () => {
    const dir = freshDir();
    const store = createTaskStore(`${dir}/tasks.sqlite`);
    const server = Fastify({ logger: false });
    registerFeishuRoutes(server, store, {
      appId: "cli_test",
      appSecret: "sec_test",
      verificationToken: VERIFY_TOKEN,
      encryptKey: ENCRYPT_KEY,
      allowedUserIds: ["ou_enc_user"],
    });
    await server.ready();

    // 1. Encrypted URL verification challenge with valid X-Lark-Signature
    const challengeEncrypted = encryptFeishuEvent(
      { challenge: "challenge_999", token: VERIFY_TOKEN, type: "url_verification" },
      ENCRYPT_KEY,
    );
    const challengeRaw = JSON.stringify({ encrypt: challengeEncrypted });
    const ts = "1700000001";
    const nonce = "n1";
    const challengeSig = computeFeishuSignature(ts, nonce, ENCRYPT_KEY, challengeRaw);

    const challengeRes = await server.inject({
      method: "POST",
      url: "/feishu/events",
      headers: {
        "content-type": "application/json",
        "x-lark-request-timestamp": ts,
        "x-lark-request-nonce": nonce,
        "x-lark-signature": challengeSig,
      },
      payload: challengeRaw,
    });
    expect(challengeRes.statusCode).toBe(200);
    expect(challengeRes.json()).toEqual({ challenge: "challenge_999" });

    // 2. Tampered signature must be rejected with 401
    const badSigRes = await server.inject({
      method: "POST",
      url: "/feishu/events",
      headers: {
        "content-type": "application/json",
        "x-lark-request-timestamp": ts,
        "x-lark-request-nonce": nonce,
        "x-lark-signature": "deadbeef".repeat(8),
      },
      payload: challengeRaw,
    });
    expect(badSigRes.statusCode).toBe(401);

    // 3. Encrypted message event creates task after decryption & signature check
    const msgPayload = {
      schema: "2.0",
      header: {
        event_id: "ev_enc_msg_1",
        event_type: "im.message.receive_v1",
        token: VERIFY_TOKEN,
      },
      event: {
        sender: { sender_id: { open_id: "ou_enc_user" } },
        message: {
          message_id: "om_enc_msg_1",
          chat_id: "oc_enc_chat",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "Run encrypted deployment check" }),
        },
      },
    };
    const msgRaw = JSON.stringify({ encrypt: encryptFeishuEvent(msgPayload, ENCRYPT_KEY) });
    const msgSig = computeFeishuSignature("1700000002", "n2", ENCRYPT_KEY, msgRaw);

    const msgRes = await server.inject({
      method: "POST",
      url: "/feishu/events",
      headers: {
        "content-type": "application/json",
        "x-lark-request-timestamp": "1700000002",
        "x-lark-request-nonce": "n2",
        "x-lark-signature": msgSig,
      },
      payload: msgRaw,
    });
    expect(msgRes.statusCode).toBe(201);
    const created = msgRes.json() as { ok: boolean; taskId: string };
    const task = await store.getTask(created.taskId);
    expect(task?.commandText).toBe("Run encrypted deployment check");

    await server.close();
    store.close?.();
  });
});
