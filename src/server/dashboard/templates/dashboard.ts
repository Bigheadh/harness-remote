import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

let cachedIndexHtml: string | undefined;
let cachedCss: string | undefined;
let cachedJs: string | undefined;

export function getDashboardCss(): string {
  if (!cachedCss) {
    cachedCss = readFileSync(join(PUBLIC_DIR, "dashboard.css"), "utf8");
  }
  return cachedCss;
}

export function getDashboardJs(): string {
  if (!cachedJs) {
    cachedJs = readFileSync(join(PUBLIC_DIR, "dashboard.js"), "utf8");
  }
  return cachedJs;
}

function getIndexHtmlTemplate(): string {
  if (!cachedIndexHtml) {
    cachedIndexHtml = readFileSync(join(PUBLIC_DIR, "index.html"), "utf8");
  }
  return cachedIndexHtml;
}

/**
 * Render the Dashboard HTML page.
 *
 * Authentication uses an HttpOnly encrypted session cookie set by `/dashboard` or `/dashboard/login`,
 * so no bearer token is ever embedded in the rendered HTML or exposed to client-side scripts.
 */
export function renderDashboardHTML(
  _apiBaseUrl?: string,
  _token?: string,
): string {
  return getIndexHtmlTemplate();
}

/**
 * Render a minimal, CSP-friendly login page that exchanges a token for an HttpOnly session cookie.
 */
export function renderLoginHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Harness Remote - Login</title>
  <link rel="stylesheet" href="/dashboard/assets/dashboard.css">
  <style>
    .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .login-card { width: 100%; max-width: 400px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
    .login-card h1 { font-size: 20px; margin-bottom: 8px; }
    .login-card p { font-size: 13px; color: var(--text-dim); margin-bottom: 20px; }
    .login-card input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 14px; margin-bottom: 14px; }
    .login-card button { width: 100%; padding: 10px; border-radius: 8px; border: none; background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; font-size: 14px; }
    .login-error { color: var(--red); font-size: 13px; margin-top: 10px; min-height: 18px; }
  </style>
</head>
<body>
  <div class="login-wrap">
    <form class="login-card" id="loginForm">
      <h1>Harness Remote Dashboard</h1>
      <p>Enter your personal token, user token, or API key to sign in.</p>
      <input id="tokenInput" type="password" placeholder="Bearer token" autocomplete="current-password" required />
      <button type="submit">Sign In</button>
      <div class="login-error" id="loginError"></div>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var errEl = document.getElementById('loginError');
      errEl.textContent = '';
      var token = document.getElementById('tokenInput').value.trim();
      try {
        var res = await fetch('/dashboard/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token })
        });
        if (!res.ok) {
          var data = await res.json().catch(function () { return {}; });
          errEl.textContent = (data.error && data.error.message) || 'Authentication failed';
          return;
        }
        window.location.href = '/dashboard';
      } catch (err) {
        errEl.textContent = 'Network error: ' + err.message;
      }
    });
  </script>
</body>
</html>`;
}
