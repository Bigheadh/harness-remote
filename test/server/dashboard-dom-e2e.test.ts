import { describe, it, expect } from "vitest";
import vm from "node:vm";
import {
  DASHBOARD_JS_MODULES,
  getDashboardJsModule,
  renderDashboardHTML,
} from "../../src/server/dashboard/templates/dashboard.js";

interface MockElement {
  id: string;
  innerHTML: string;
  textContent: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  style: Record<string, string>;
  dataset: Record<string, string>;
  classList: {
    _set: Set<string>;
    add: (...cls: string[]) => void;
    remove: (...cls: string[]) => void;
    toggle: (cls: string, force?: boolean) => boolean;
    contains: (cls: string) => boolean;
  };
  addEventListener: (ev: string, fn: (...args: unknown[]) => void) => void;
  appendChild: (child: MockElement) => MockElement;
  children: MockElement[];
  className: string;
  querySelectorAll: (sel: string) => MockElement[];
  querySelector: (sel: string) => MockElement | null;
  focus: () => void;
  click: () => void;
}

function makeMockElement(id: string): MockElement {
  const classes = new Set<string>();
  const children: MockElement[] = [];
  return {
    id,
    innerHTML: "",
    textContent: "",
    value: "",
    checked: false,
    disabled: false,
    className: "",
    style: {},
    dataset: {},
    children,
    classList: {
      _set: classes,
      add: (...cls) => cls.forEach((c) => classes.add(c)),
      remove: (...cls) => cls.forEach((c) => classes.delete(c)),
      toggle: (cls, force) => {
        const next = force !== undefined ? force : !classes.has(cls);
        if (next) classes.add(cls);
        else classes.delete(cls);
        return next;
      },
      contains: (cls) => classes.has(cls),
    },
    addEventListener: () => {},
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    focus: () => {},
    click: () => {},
  };
}

function createDashboardSandbox(
  fetchHandler: (url: string, opts?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>,
) {
  const html = renderDashboardHTML("http://localhost:3000");
  const elements = new Map<string, MockElement>();

  // Populate every id="..." declared in index.html
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
    elements.set(m[1], makeMockElement(m[1]));
  }

  const sseUrls: string[] = [];
  class MockEventSource {
    url: string;
    onmessage: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    constructor(url: string) {
      this.url = url;
      sseUrls.push(url);
    }
    addEventListener() {}
    close() {}
  }

  const locationObj = {
    origin: "http://localhost:3000",
    href: "http://localhost:3000/dashboard",
  };

  const documentObj = {
    getElementById: (id: string) => {
      if (!elements.has(id)) {
        elements.set(id, makeMockElement(id));
      }
      return elements.get(id)!;
    },
    querySelectorAll: () => [],
    querySelector: (sel: string) => makeMockElement(`qs_${sel}`),
    createElement: (tag: string) => makeMockElement(`created_${tag}`),
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
    addEventListener: () => {},
  };

  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    Date,
    Math,
    JSON,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Promise,
    Error,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    Blob: class {},
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    EventSource: MockEventSource,
    document: documentObj,
    location: locationObj,
    fetch: fetchHandler,
    alert: () => {},
    confirm: () => true,
    prompt: () => "",
  };
  sandbox["window"] = sandbox;
  sandbox["globalThis"] = sandbox;

  const ctx = vm.createContext(sandbox);

  // Execute all 4 modular dashboard JS files in exact <script defer> order
  for (const mod of DASHBOARD_JS_MODULES) {
    const code = getDashboardJsModule(mod);
    if (!code) throw new Error(`Missing dashboard JS module: ${mod}`);
    vm.runInContext(code, ctx, { filename: mod });
  }

  return { ctx, html, elements, sseUrls, locationObj };
}

describe("Dashboard Modular Client DOM & Behavior Verification", () => {
  it("defines every onclick handler referenced in index.html and all 4 modular JS templates", () => {
    const { ctx, html } = createDashboardSandbox(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tasks: [] }),
      text: async () => "{}",
    }));

    const keywords = new Set(["if", "for", "while", "switch", "return", "void", "typeof", "event"]);
    const handlerNames = new Set<string>();
    const allSources = [
      html,
      ...DASHBOARD_JS_MODULES.map((m) => getDashboardJsModule(m) ?? ""),
    ];
    for (const source of allSources) {
      for (const m of source.matchAll(/onclick="([^"]+)"/g)) {
        for (const call of m[1].matchAll(/(?<![.\w$])([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g)) {
          if (!keywords.has(call[1])) {
            handlerNames.add(call[1]);
          }
        }
      }
    }
    expect(handlerNames.size).toBeGreaterThan(20);

    const missing: string[] = [];
    for (const fnName of handlerNames) {
      if (vm.runInContext(`typeof ${fnName}`, ctx) !== "function") {
        missing.push(fnName);
      }
    }
    expect(missing).toEqual([]);

    // Single quotes and HTML special chars are all escaped safely
    expect(vm.runInContext(`escapeHtml("Bob's <script> & \\"x\\"")`, ctx)).toBe(
      "Bob&#39;s &lt;script&gt; &amp; &quot;x&quot;",
    );
  });

  it("loads tasks via cookie auth, escapes XSS payloads, neutralizes javascript: links, and handles logout", async () => {
    const fetchCalls: Array<{ url: string; method: string; credentials?: RequestCredentials; headers?: HeadersInit }> = [];

    const sampleTasks = [
      {
        id: "t_xss_1",
        source: "web",
        commandText: '<script>alert("xss")</script> Deploy prod',
        status: "pending",
        priority: "urgent",
        tags: ["ops", '<b>tag</b>'],
        createdAt: "2026-11-24T01:00:00.000Z",
        updatedAt: "2026-11-24T01:00:00.000Z",
        pinned: true,
      },
      {
        id: "t_done_2",
        source: "feishu",
        commandText: "Completed audit",
        status: "done",
        priority: "normal",
        createdAt: "2026-11-24T00:30:00.000Z",
        updatedAt: "2026-11-24T00:45:00.000Z",
        pinned: false,
      },
    ];

    const { ctx, elements, sseUrls, locationObj } = createDashboardSandbox(async (url, opts) => {
      fetchCalls.push({
        url,
        method: opts?.method ?? "GET",
        credentials: opts?.credentials,
        headers: opts?.headers,
      });

      if (url.includes("/api/tasks/t_xss_1/links")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            links: [
              { id: 1, title: "Evil", url: "javascript:alert(1)" },
              { id: 2, title: "Docs", url: "https://docs.example.com/guide" },
            ],
          }),
          text: async () => "",
        };
      }
      if (url.includes("/api/tasks/t_xss_1/subtasks")) {
        return { ok: true, status: 200, json: async () => ({ subtasks: [] }), text: async () => "" };
      }
      if (url.includes("/api/tasks/t_xss_1/comments")) {
        return { ok: true, status: 200, json: async () => ({ comments: [] }), text: async () => "" };
      }
      if (url.includes("/api/tasks/t_xss_1/activity")) {
        return { ok: true, status: 200, json: async () => ({ items: [] }), text: async () => "" };
      }
      if (url.includes("/api/tasks/t_xss_1/dependencies")) {
        return { ok: true, status: 200, json: async () => ({ dependencies: [], dependentIds: [] }), text: async () => "" };
      }
      if (url.includes("/api/tasks/t_xss_1/time-entries")) {
        return { ok: true, status: 200, json: async () => ({ entries: [] }), text: async () => "" };
      }
      if (url.includes("/api/tasks/t_xss_1/watchers")) {
        return { ok: true, status: 200, json: async () => ({ watchers: [] }), text: async () => "" };
      }
      if (url.includes("/api/tasks/t_xss_1/notes")) {
        return { ok: true, status: 200, json: async () => ({ notes: [] }), text: async () => "" };
      }
      if (url.includes("/api/tasks/t_xss_1/relationships")) {
        return { ok: true, status: 200, json: async () => ({ relationships: [] }), text: async () => "" };
      }
      if (url.includes("/api/tasks/t_xss_1/sla")) {
        return { ok: true, status: 200, json: async () => ({ status: "no_sla" }), text: async () => "" };
      }
      if (url.endsWith("/api/tasks/t_xss_1")) {
        return { ok: true, status: 200, json: async () => ({ task: sampleTasks[0] }), text: async () => "" };
      }
      if (url.includes("/api/tasks/kanban")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            columns: [{ status: "pending", label: "Pending", count: 1, tasks: [sampleTasks[0]] }],
            totalTasks: 1,
          }),
          text: async () => "",
        };
      }
      if (url.includes("/dashboard/logout")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "" };
      }
      if (url.includes("/api/tasks") && opts?.method === "POST") {
        return { ok: true, status: 201, json: async () => ({ task: sampleTasks[0] }), text: async () => "" };
      }
      return { ok: true, status: 200, json: async () => ({ tasks: sampleTasks }), text: async () => "" };
    });

    // Wait a tick for initial loadTasks() promise to settle
    await new Promise((r) => setTimeout(r, 30));

    // 1. SSE connected without token query string (relies on HttpOnly cookie)
    expect(sseUrls[0]).toBe("http://localhost:3000/api/tasks/stream");
    expect(sseUrls[0]).not.toContain("token=");

    // 2. apiFetch uses credentials: 'same-origin' and no Authorization header when no raw token is embedded
    expect(fetchCalls[0].credentials).toBe("same-origin");
    expect((fetchCalls[0].headers as Record<string, string>)["Authorization"]).toBeUndefined();

    // 3. Stats & task table rendered with XSS payload escaped
    const statsHtml = elements.get("stats")?.innerHTML ?? "";
    expect(statsHtml).toContain("Total");
    const tableHtml = elements.get("taskList")?.innerHTML ?? "";
    expect(tableHtml).not.toContain('<script>alert("xss")</script>');
    expect(tableHtml).toContain("&lt;script&gt;");

    // 4. safeUrl blocks javascript: and data: while permitting https:
    expect(vm.runInContext("safeUrl('javascript:alert(1)')", ctx)).toBe("#");
    expect(vm.runInContext("safeUrl('data:text/html,evil')", ctx)).toBe("#");
    expect(vm.runInContext("safeUrl('https://docs.example.com/guide')", ctx)).toBe("https://docs.example.com/guide");

    // 5. showDetail loads links and neutralizes javascript: href
    await vm.runInContext("showDetail('t_xss_1')", ctx);
    await new Promise((r) => setTimeout(r, 30));
    const detailChildrenHtml = (elements.get("detailBody")?.children ?? [])
      .map((c) => c.innerHTML)
      .join("\n");
    expect(detailChildrenHtml).not.toContain('href="javascript:alert(1)"');
    expect(detailChildrenHtml).toContain("https://docs.example.com/guide");

    // 6. Create task modal submission sends POST /api/tasks
    elements.get("createCommand")!.value = "New dashboard task";
    elements.get("createPriority")!.value = "high";
    await vm.runInContext("submitCreateTask()", ctx);
    expect(fetchCalls.some((c) => c.method === "POST" && c.url.endsWith("/api/tasks"))).toBe(true);

    // 7. Kanban view switch renders board
    vm.runInContext("switchView('kanban')", ctx);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchCalls.some((c) => c.url.includes("/api/tasks/kanban"))).toBe(true);

    // 8. Logout calls POST /dashboard/logout and redirects to /dashboard
    await vm.runInContext("logout()", ctx);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchCalls.some((c) => c.method === "POST" && c.url.includes("/dashboard/logout"))).toBe(true);
    expect(locationObj.href).toBe("/dashboard");
  });
});
