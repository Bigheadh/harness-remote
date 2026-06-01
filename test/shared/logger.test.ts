import { describe, it, expect } from "vitest";
import { redact, truncate, createLogger } from "../../src/shared/logger.js";

describe("redact", () => {
  it("redacts Bearer tokens", () => {
    const input = 'Authorization: Bearer abc123def456ghi789jkl012mno345';
    expect(redact(input)).toBe("Authorization: [REDACTED]");
  });

  it("redacts token= values", () => {
    const input = "token=sk-live-abcdef1234567890abcdef1234567890";
    expect(redact(input)).toContain("[REDACTED]");
    expect(redact(input)).not.toContain("sk-live-");
  });

  it("redacts appSecret values", () => {
    const input = "appSecret=verysecretvalue1234567890abcdef";
    expect(redact(input)).toContain("[REDACTED]");
    expect(redact(input)).not.toContain("verysecretvalue");
  });

  it("redacts personalToken values", () => {
    const input = 'personalToken: "my-long-personal-token-value-12345678"';
    expect(redact(input)).toContain("[REDACTED]");
    expect(redact(input)).not.toContain("my-long-personal-token");
  });

  it("does not redact short non-secret strings", () => {
    const input = "task_123456 status=pending";
    expect(redact(input)).toBe("task_123456 status=pending");
  });

  it("redacts long quoted strings that look like tokens", () => {
    const input = 'token = "abcdefghijklmnopqrstuvwxyz12345678"';
    expect(redact(input)).toContain("[REDACTED]");
  });

  it("handles multiple secrets in one string", () => {
    const input = "Bearer abcdef1234567890abcdef1234567890 secret=xyz1234567890abcdef1234567890";
    const result = redact(input);
    expect(result).not.toContain("abcdef1234567890abcdef1234567890");
    expect(result).not.toContain("xyz1234567890abcdef1234567890");
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello")).toBe("hello");
  });

  it("truncates long strings", () => {
    const long = "a".repeat(300);
    const result = truncate(long);
    expect(result.length).toBeLessThan(300);
    expect(result).toMatch(/\[TRUNCATED\]$/);
  });
});

describe("createLogger", () => {
  it("emits JSON lines to stdout for info level", () => {
    const logs: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      logs.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const log = createLogger({ level: "info" });
      log.info({ taskId: "task_123" }, "Task created");

      expect(logs.length).toBe(1);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.level).toBe("info");
      expect(parsed.taskId).toBe("task_123");
      expect(parsed.msg).toBe("Task created");
      expect(parsed.time).toBeDefined();
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it("redacts sensitive values in log messages", () => {
    const logs: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      logs.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const log = createLogger({ level: "info" });
      log.info({ auth: "Bearer sk-secret1234567890abcdef" }, "Got auth header");

      const parsed = JSON.parse(logs[0]);
      expect(parsed.auth).toContain("[REDACTED]");
      expect(parsed.auth).not.toContain("sk-secret1234567890abcdef");
      expect(parsed.msg).not.toContain("sk-secret1234567890abcdef");
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it("truncates long string values in meta", () => {
    const logs: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      logs.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const log = createLogger({ level: "info" });
      const longText = "x".repeat(500);
      log.info({ body: longText }, "Got body");

      const parsed = JSON.parse(logs[0]);
      expect(parsed.body.length).toBeLessThan(500);
      expect(parsed.body).toMatch(/\[TRUNCATED\]$/);
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it("filters out messages below the configured level", () => {
    const stdoutLogs: string[] = [];
    const stderrLogs: string[] = [];
    const originalWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutLogs.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrLogs.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      const log = createLogger({ level: "warn" });
      log.debug({ x: 1 }, "should not appear");
      log.info({ x: 2 }, "should not appear");
      log.warn({ x: 3 }, "should appear");
      log.error({ x: 4 }, "should appear");

      expect(stdoutLogs.length).toBe(1);
      expect(stderrLogs.length).toBe(1);
      expect(JSON.parse(stdoutLogs[0]).level).toBe("warn");
      expect(JSON.parse(stderrLogs[0]).level).toBe("error");
    } finally {
      process.stdout.write = originalWrite;
      process.stderr.write = originalStderrWrite;
    }
  });
});
