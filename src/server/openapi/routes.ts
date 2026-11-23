import type { FastifyInstance } from "fastify";
import { buildOpenApiSpec } from "./spec.js";

const DOCS_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join("; ");

function renderApiDocsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>harness-remote — OpenAPI Reference</title>
  <style>
    :root { --bg: #0f1117; --card: #1a1d27; --border: #2a2e3f; --text: #e4e6ed; --muted: #8b92a8; --accent: #3b82f6; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 24px; line-height: 1.5; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 20px; }
    h1 { font-size: 20px; }
    .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
    .controls { display: flex; gap: 8px; align-items: center; }
    input { background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; font-size: 13px; width: 260px; }
    a.btn { color: #fff; background: var(--accent); text-decoration: none; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; }
    .tag-group { margin-bottom: 24px; }
    .tag-title { font-size: 15px; color: #93c5fd; margin-bottom: 10px; border-left: 3px solid var(--accent); padding-left: 10px; }
    .endpoint { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }
    .ep-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .method { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .GET { background: #1e3a5f; color: #60a5fa; }
    .POST { background: #14532d; color: #4ade80; }
    .PUT { background: #713f12; color: #facc15; }
    .DELETE { background: #7f1d1d; color: #f87171; }
    .path { font-family: monospace; font-size: 14px; font-weight: 600; }
    .summary { color: var(--muted); font-size: 13px; margin-left: auto; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>harness-remote OpenAPI 3.1 Reference</h1>
      <div class="sub" id="meta">Loading specification...</div>
    </div>
    <div class="controls">
      <input id="filter" type="search" placeholder="Filter endpoints or tags..." />
      <a class="btn" href="/api/openapi.json" target="_blank">OpenAPI JSON</a>
    </div>
  </header>
  <main id="content"></main>
  <script>
    (async function () {
      const res = await fetch('/api/openapi.json');
      const spec = await res.json();
      document.getElementById('meta').textContent =
        spec.info.title + ' v' + spec.info.version + ' — ' + Object.keys(spec.paths).length + ' documented paths';

      const content = document.getElementById('content');
      const filterInput = document.getElementById('filter');

      function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function render(query) {
        const q = (query || '').trim().toLowerCase();
        const groups = {};
        for (const [path, methods] of Object.entries(spec.paths)) {
          for (const [method, op] of Object.entries(methods)) {
            const tag = (op.tags && op.tags[0]) || 'General';
            const hay = (method + ' ' + path + ' ' + tag + ' ' + (op.summary || '')).toLowerCase();
            if (q && !hay.includes(q)) continue;
            (groups[tag] = groups[tag] || []).push({ method: method.toUpperCase(), path, summary: op.summary || '' });
          }
        }
        content.innerHTML = Object.entries(groups).map(([tag, eps]) =>
          '<section class="tag-group"><h2 class="tag-title">' + esc(tag) + '</h2>' +
          eps.map(ep =>
            '<div class="endpoint"><div class="ep-head">' +
            '<span class="method ' + esc(ep.method) + '">' + esc(ep.method) + '</span>' +
            '<span class="path">' + esc(ep.path) + '</span>' +
            '<span class="summary">' + esc(ep.summary) + '</span>' +
            '</div></div>'
          ).join('') +
          '</section>'
        ).join('') || '<p class="sub">No matching endpoints.</p>';
      }

      filterInput.addEventListener('input', () => render(filterInput.value));
      render('');
    })();
  </script>
</body>
</html>`;
}

/**
 * Register OpenAPI 3.1 JSON spec and offline-friendly interactive API explorer routes.
 */
export function registerOpenApiRoutes(
  server: FastifyInstance,
  publicBaseUrl = "http://localhost:3000",
): void {
  const spec = buildOpenApiSpec(publicBaseUrl);
  const docsHtml = renderApiDocsHtml();

  server.get("/api/openapi.json", async (_req, reply) => {
    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Cache-Control", "public, max-age=300")
      .send(spec);
  });

  server.get("/api/docs", async (_req, reply) => {
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("X-Frame-Options", "DENY")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", DOCS_CSP)
      .send(docsHtml);
  });
}
