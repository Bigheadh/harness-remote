/**
 * Shared config validation helpers used by both server and MCP config loaders.
 */
import { readFileSync } from "node:fs";

export function validateRequired(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing or empty required config field: ${fieldName}`);
  }
}

export function validateUrl(value: string, fieldName: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(
        `Config field ${fieldName} must use https or http protocol, got: ${url.protocol}`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("protocol")) {
      throw e;
    }
    throw new Error(`Config field ${fieldName} is not a valid URL: ${value}`);
  }
}

export function parseJsonConfig(filePath: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(`Failed to read config file: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${filePath}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Config file must contain a JSON object");
  }

  return parsed as Record<string, unknown>;
}
