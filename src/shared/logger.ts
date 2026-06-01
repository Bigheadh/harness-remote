/**
 * Structured logger with automatic redaction of sensitive values.
 *
 * Sensitive patterns are replaced with `[REDACTED]` before output.
 * Long string values are truncated to prevent log bloat from large Feishu messages.
 */

// --- Redaction patterns ---------------------------------------------------

/** Patterns that indicate secret/sensitive values. Matched case-insensitively. */
const SECRET_PATTERNS: RegExp[] = [
  // Bearer tokens in headers or log lines
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // Key=value pairs for known sensitive fields
  /(?:token|secret|password|appSecret|verificationToken|encryptKey|personalToken)\s*[=:]\s*["']?[A-Za-z0-9\-._~+/]{4,}["']?/gi,
  // Raw hex/base64 strings longer than 32 chars that look like tokens
  /["']([A-Za-z0-9\-._~+/]{32,})["']/g,
];

/** Maximum length for a single string value in log output. */
const MAX_VALUE_LENGTH = 200;

/**
 * Replace sensitive substrings in a string with `[REDACTED]`.
 */
export function redact(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => {
      // For key=value patterns, keep the key name but redact the value
      const eqIndex = match.search(/[=:]/);
      if (eqIndex !== -1) {
        const key = match.slice(0, eqIndex + 1);
        return `${key}[REDACTED]`;
      }
      return "[REDACTED]";
    });
  }
  return result;
}

/**
 * Truncate a string to MAX_VALUE_LENGTH, appending `[TRUNCATED]` if cut.
 */
export function truncate(input: string): string {
  if (input.length <= MAX_VALUE_LENGTH) {
    return input;
  }
  return input.slice(0, MAX_VALUE_LENGTH) + "[TRUNCATED]";
}

// --- Logger ----------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error";

function levelPriority(level: LogLevel): number {
  switch (level) {
    case "debug": return 0;
    case "info":  return 1;
    case "warn":  return 2;
    case "error": return 3;
  }
}

export interface LoggerOptions {
  level?: LogLevel;
  /** If true, extra detail fields are included (default: false). */
  debug?: boolean;
}

/**
 * Minimal structured logger with automatic redaction.
 *
 * Usage:
 *   const log = createLogger({ level: "info" });
 *   log.info({ taskId: "task_123", action: "created" }, "Task created");
 *   log.error({ err, url: "/feishu/events" }, "Request failed");
 */
export function createLogger(opts: LoggerOptions = {}) {
  const minLevel = levelPriority(opts.level ?? "info");
  const debug = opts.debug ?? false;

  function emit(level: LogLevel, meta: Record<string, unknown>, msg: string) {
    if (levelPriority(level) < minLevel) return;

    // Redact and truncate all string values in meta
    const safeMeta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === "string") {
        safeMeta[key] = truncate(redact(value));
      } else if (value instanceof Error) {
        safeMeta[key] = {
          message: redact(value.message),
          stack: debug ? value.stack : undefined,
        };
      } else {
        safeMeta[key] = value;
      }
    }

    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      msg: truncate(redact(msg)),
      ...safeMeta,
    });

    if (level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }

  return {
    debug(meta: Record<string, unknown>, msg: string) {
      emit("debug", meta, msg);
    },
    info(meta: Record<string, unknown>, msg: string) {
      emit("info", meta, msg);
    },
    warn(meta: Record<string, unknown>, msg: string) {
      emit("warn", meta, msg);
    },
    error(meta: Record<string, unknown>, msg: string) {
      emit("error", meta, msg);
    },
  };
}
