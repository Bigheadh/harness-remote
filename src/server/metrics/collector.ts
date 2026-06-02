/**
 * In-memory Prometheus metrics collector.
 *
 * Tracks HTTP requests, task operations, SSE connections, and server uptime
 * without external dependencies. The collector exposes metrics in Prometheus
 * exposition format via the /metrics endpoint.
 */

import { getClientCount } from "../sse/broadcaster.js";

/** Server start time for uptime calculation */
const serverStartTime = Date.now();

/** HTTP request counters by method + path + status */
const httpRequests: Map<string, number> = new Map();

/** HTTP request duration buckets (in seconds) */
const httpDurationBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const httpDurationCounts: Map<string, number[]> = new Map();

/** Task creation counter */
let tasksCreated = 0;

/** Task completion counter by status */
const tasksCompleted: Map<string, number> = new Map();

/** Task status transition counter */
const taskStatusChanges: Map<string, number> = new Map();

/** Events processed counter */
let eventsProcessed = 0;

/** Rate limit rejections counter */
let rateLimitRejections = 0;

/** Feishu reply counter */
const feishuReplies: Map<string, number> = new Map();

/** SLA breach/warning counter */
const slaEvents: Map<string, number> = new Map();

/** Webhook delivery counter */
const webhookDeliveries: Map<string, number> = new Map();

/** API key operations counter */
const apiKeyOps: Map<string, number> = new Map();

/**
 * Record an HTTP request.
 */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationSeconds: number,
): void {
  // Normalize path: strip query params and numeric IDs
  const normalizedPath = normalizePath(path);
  const key = `${method}:${normalizedPath}:${statusCode}`;
  httpRequests.set(key, (httpRequests.get(key) ?? 0) + 1);

  // Duration histogram
  const bucketKey = `${method}:${normalizedPath}`;
  if (!httpDurationCounts.has(bucketKey)) {
    httpDurationCounts.set(bucketKey, new Array(httpDurationBuckets.length + 1).fill(0));
  }
  const buckets = httpDurationCounts.get(bucketKey)!;
  let placed = false;
  for (let i = 0; i < httpDurationBuckets.length; i++) {
    if (durationSeconds <= httpDurationBuckets[i]) {
      buckets[i]++;
      placed = true;
      break;
    }
  }
  if (!placed) {
    buckets[httpDurationBuckets.length]++; // +Inf bucket
  }
}

/**
 * Record a task creation event.
 */
export function recordTaskCreated(): void {
  tasksCreated++;
}

/**
 * Record a task completion.
 */
export function recordTaskCompleted(status: string): void {
  tasksCompleted.set(status, (tasksCompleted.get(status) ?? 0) + 1);
}

/**
 * Record a task status change.
 */
export function recordTaskStatusChange(from: string, to: string): void {
  const key = `${from}:${to}`;
  taskStatusChanges.set(key, (taskStatusChanges.get(key) ?? 0) + 1);
}

/**
 * Record an event being processed.
 */
export function recordEventProcessed(): void {
  eventsProcessed++;
}

/**
 * Record a rate limit rejection.
 */
export function recordRateLimitRejection(): void {
  rateLimitRejections++;
}

/**
 * Record a Feishu reply attempt.
 */
export function recordFeishuReply(success: boolean): void {
  const key = success ? "success" : "failure";
  feishuReplies.set(key, (feishuReplies.get(key) ?? 0) + 1);
}

/**
 * Record an SLA event (warning or breach).
 */
export function recordSlaEvent(type: string): void {
  slaEvents.set(type, (slaEvents.get(type) ?? 0) + 1);
}

/**
 * Record a webhook delivery attempt.
 */
export function recordWebhookDelivery(success: boolean): void {
  const key = success ? "success" : "failure";
  webhookDeliveries.set(key, (webhookDeliveries.get(key) ?? 0) + 1);
}

/**
 * Record an API key operation.
 */
export function recordApiKeyOp(op: string): void {
  apiKeyOps.set(op, (apiKeyOps.get(op) ?? 0) + 1);
}

/**
 * Generate Prometheus exposition format text.
 */
export function formatMetrics(taskCounts?: {
  total: number;
  pending: number;
  picked: number;
  running: number;
  done: number;
  failed: number;
}): string {
  const lines: string[] = [];
  const uptimeSeconds = (Date.now() - serverStartTime) / 1000;

  // ── Server uptime ──
  lines.push("# HELP harness_remote_server_uptime_seconds Server uptime in seconds");
  lines.push("# TYPE harness_remote_server_uptime_seconds gauge");
  lines.push(`harness_remote_server_uptime_seconds ${uptimeSeconds.toFixed(3)}`);
  lines.push("");

  // ── SSE connections ──
  lines.push("# HELP harness_remote_sse_connections Number of currently connected SSE clients");
  lines.push("# TYPE harness_remote_sse_connections gauge");
  lines.push(`harness_remote_sse_connections ${getClientCount()}`);
  lines.push("");

  // ── Task counts by status ──
  if (taskCounts) {
    lines.push("# HELP harness_remote_tasks_total Number of tasks by status");
    lines.push("# TYPE harness_remote_tasks_total gauge");
    lines.push(`harness_remote_tasks_total{status="pending"} ${taskCounts.pending}`);
    lines.push(`harness_remote_tasks_total{status="picked"} ${taskCounts.picked}`);
    lines.push(`harness_remote_tasks_total{status="running"} ${taskCounts.running}`);
    lines.push(`harness_remote_tasks_total{status="done"} ${taskCounts.done}`);
    lines.push(`harness_remote_tasks_total{status="failed"} ${taskCounts.failed}`);
    lines.push("");

    lines.push("# HELP harness_remote_tasks_count_total Total number of tasks");
    lines.push("# TYPE harness_remote_tasks_count_total gauge");
    lines.push(`harness_remote_tasks_count_total ${taskCounts.total}`);
    lines.push("");
  }

  // ── Tasks created ──
  lines.push("# HELP harness_remote_tasks_created_total Total tasks created");
  lines.push("# TYPE harness_remote_tasks_created_total counter");
  lines.push(`harness_remote_tasks_created_total ${tasksCreated}`);
  lines.push("");

  // ── Tasks completed by status ──
  lines.push("# HELP harness_remote_tasks_completed_total Tasks completed by status");
  lines.push("# TYPE harness_remote_tasks_completed_total counter");
  for (const [status, count] of tasksCompleted) {
    lines.push(`harness_remote_tasks_completed_total{status="${status}"} ${count}`);
  }
  lines.push("");

  // ── Task status transitions ──
  if (taskStatusChanges.size > 0) {
    lines.push("# HELP harness_remote_task_status_changes_total Task status transitions");
    lines.push("# TYPE harness_remote_task_status_changes_total counter");
    for (const [transition, count] of taskStatusChanges) {
      const [from, to] = transition.split(":");
      lines.push(`harness_remote_task_status_changes_total{from="${from}",to="${to}"} ${count}`);
    }
    lines.push("");
  }

  // ── Events processed ──
  lines.push("# HELP harness_remote_events_processed_total Total Feishu events processed");
  lines.push("# TYPE harness_remote_events_processed_total counter");
  lines.push(`harness_remote_events_processed_total ${eventsProcessed}`);
  lines.push("");

  // ── HTTP requests by method + path + status ──
  lines.push("# HELP harness_remote_http_requests_total HTTP requests by method, path, and status");
  lines.push("# TYPE harness_remote_http_requests_total counter");
  for (const [key, count] of httpRequests) {
    const [method, path, status] = key.split(":");
    lines.push(`harness_remote_http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}`);
  }
  lines.push("");

  // ── HTTP request duration histogram ──
  lines.push("# HELP harness_remote_http_request_duration_seconds HTTP request duration histogram");
  lines.push("# TYPE harness_remote_http_request_duration_seconds histogram");
  for (const [key, buckets] of httpDurationCounts) {
    const [method, path] = key.split(":");
    let cumulative = 0;
    for (let i = 0; i < httpDurationBuckets.length; i++) {
      cumulative += buckets[i];
      lines.push(
        `harness_remote_http_request_duration_seconds_bucket{method="${method}",path="${path}",le="${httpDurationBuckets[i]}"} ${cumulative}`,
      );
    }
    cumulative += buckets[httpDurationBuckets.length];
    lines.push(
      `harness_remote_http_request_duration_seconds_bucket{method="${method}",path="${path}",le="+Inf"} ${cumulative}`,
    );
    lines.push(
      `harness_remote_http_request_duration_seconds_sum{method="${method}",path="${path}"} ${cumulative.toFixed(6)}`,
    );
    lines.push(
      `harness_remote_http_request_duration_seconds_count{method="${method}",path="${path}"} ${cumulative}`,
    );
  }
  lines.push("");

  // ── Rate limit rejections ──
  lines.push("# HELP harness_remote_rate_limit_rejected_total Rate-limited requests");
  lines.push("# TYPE harness_remote_rate_limit_rejected_total counter");
  lines.push(`harness_remote_rate_limit_rejected_total ${rateLimitRejections}`);
  lines.push("");

  // ── Feishu replies ──
  lines.push("# HELP harness_remote_feishu_replies_total Feishu reply attempts");
  lines.push("# TYPE harness_remote_feishu_replies_total counter");
  for (const [result, count] of feishuReplies) {
    lines.push(`harness_remote_feishu_replies_total{result="${result}"} ${count}`);
  }
  lines.push("");

  // ── SLA events ──
  if (slaEvents.size > 0) {
    lines.push("# HELP harness_remote_sla_events_total SLA warning/breach events");
    lines.push("# TYPE harness_remote_sla_events_total counter");
    for (const [type, count] of slaEvents) {
      lines.push(`harness_remote_sla_events_total{type="${type}"} ${count}`);
    }
    lines.push("");
  }

  // ── Webhook deliveries ──
  if (webhookDeliveries.size > 0) {
    lines.push("# HELP harness_remote_webhook_deliveries_total Webhook delivery attempts");
    lines.push("# TYPE harness_remote_webhook_deliveries_total counter");
    for (const [result, count] of webhookDeliveries) {
      lines.push(`harness_remote_webhook_deliveries_total{result="${result}"} ${count}`);
    }
    lines.push("");
  }

  // ── API key operations ──
  if (apiKeyOps.size > 0) {
    lines.push("# HELP harness_remote_api_key_ops_total API key operations");
    lines.push("# TYPE harness_remote_api_key_ops_total counter");
    for (const [op, count] of apiKeyOps) {
      lines.push(`harness_remote_api_key_ops_total{operation="${op}"} ${count}`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

/**
 * Normalize a URL path for metric labels.
 * Strips query params and replaces numeric/UUID segments with placeholders.
 */
function normalizePath(path: string): string {
  // Remove query string
  let normalized = path.split("?")[0];

  // Replace UUID-like segments (36 chars with hyphens)
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ":id",
  );

  // Replace task_xxx style IDs
  normalized = normalized.replace(/task_[a-zA-Z0-9_]+/g, ":id");

  // Replace numeric path segments
  normalized = normalized.replace(/\/\d+/g, "/:id");

  return normalized;
}
