/**
 * Dashboard HTML template.
 * Returns a complete HTML page with embedded CSS and vanilla JS.
 * The page authenticates via token in URL query param or localStorage.
 * All data is fetched from existing /api/tasks/* endpoints.
 */
export function renderDashboardHTML(
  apiBaseUrl: string,
  token: string,
): string {
  // Token is embedded in the page so JS can use it for API calls
  // (escaped for safe embedding in JS string)
  const escapedToken = token.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Harness Remote - Task Dashboard</title>
  <style>
    :root {
      --bg: #0f1117;
      --bg-card: #1a1d27;
      --bg-hover: #242835;
      --border: #2a2e3a;
      --text: #e1e4ea;
      --text-dim: #8b8fa3;
      --accent: #6c5ce7;
      --accent-hover: #7c6ef7;
      --green: #2ed573;
      --yellow: #ffa502;
      --red: #ff4757;
      --blue: #1e90ff;
      --orange: #ff6348;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .header {
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 {
      font-size: 18px;
      font-weight: 600;
    }
    .header h1 span { color: var(--accent); }
    .header-actions { display: flex; gap: 8px; align-items: center; }
    .btn {
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg-card);
      color: var(--text);
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    .btn:hover { background: var(--bg-hover); border-color: var(--accent); }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .btn-primary:hover { background: var(--accent-hover); }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

    /* Stats cards */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .stat-card:hover { border-color: var(--accent); transform: translateY(-1px); }
    .stat-card.active { border-color: var(--accent); background: #1e2133; }
    .stat-label { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-size: 28px; font-weight: 700; margin-top: 4px; }
    .stat-value.pending { color: var(--yellow); }
    .stat-value.picked { color: var(--blue); }
    .stat-value.running { color: var(--orange); }
    .stat-value.done { color: var(--green); }
    .stat-value.failed { color: var(--red); }

    /* Toolbar */
    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
      align-items: center;
    }
    .search-input {
      flex: 1;
      min-width: 200px;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg-card);
      color: var(--text);
      font-size: 14px;
      outline: none;
    }
    .search-input:focus { border-color: var(--accent); }
    .search-input::placeholder { color: var(--text-dim); }
    select {
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg-card);
      color: var(--text);
      font-size: 14px;
      outline: none;
    }

    /* Task table */
    .task-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .task-table th {
      text-align: left;
      padding: 12px 16px;
      font-size: 12px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border);
      background: #151822;
      cursor: pointer;
      user-select: none;
    }
    .task-table th:hover { color: var(--text); }
    .task-table td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .task-table tr:hover td { background: var(--bg-hover); }
    .task-table tr:last-child td { border-bottom: none; }
    .task-table tr.selected td { background: #1e2133; }

    /* Status badges */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-pending { background: #3d2e00; color: var(--yellow); }
    .badge-picked { background: #0d2137; color: var(--blue); }
    .badge-running { background: #3d1a0d; color: var(--orange); }
    .badge-done { background: #0d3320; color: var(--green); }
    .badge-failed { background: #3d0d15; color: var(--red); }

    /* Priority badges */
    .priority {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
    }
    .priority-urgent { background: #ff4757; color: #fff; }
    .priority-high { background: #ff6348; color: #fff; }
    .priority-normal { background: var(--border); color: var(--text-dim); }
    .priority-low { background: #1a1d27; color: var(--text-dim); border: 1px solid var(--border); }

    /* Detail panel */
    .detail-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 100;
    }
    .detail-overlay.open { display: flex; align-items: center; justify-content: center; }
    .detail-panel {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      width: 90%;
      max-width: 640px;
      max-height: 80vh;
      overflow-y: auto;
      padding: 24px;
    }
    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .detail-header h2 { font-size: 16px; }
    .detail-close {
      background: none;
      border: none;
      color: var(--text-dim);
      font-size: 24px;
      cursor: pointer;
    }
    .detail-close:hover { color: var(--text); }
    .detail-grid {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px 16px;
      font-size: 14px;
    }
    .detail-label { color: var(--text-dim); font-weight: 500; }
    .detail-value { word-break: break-all; }
    .detail-textarea {
      width: 100%;
      min-height: 80px;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font-family: inherit;
      font-size: 13px;
      resize: vertical;
      margin-top: 4px;
    }
    .detail-attachments { margin-top: 8px; }
    .attachment-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
      margin: 2px;
    }

    /* Empty state */
    .empty {
      text-align: center;
      padding: 48px;
      color: var(--text-dim);
    }

    /* Loading */
    .loading { text-align: center; padding: 24px; color: var(--text-dim); }

    /* Responsive */
    @media (max-width: 768px) {
      .stats { grid-template-columns: repeat(3, 1fr); }
      .task-table { font-size: 12px; }
      .task-table td, .task-table th { padding: 8px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ <span>Harness</span> Remote</h1>
    <div class="header-actions">
      <button class="btn" onclick="refresh()" title="Refresh">↻ Refresh</button>
      <button class="btn" onclick="logout()">Logout</button>
    </div>
  </div>

  <div class="container">
    <div class="stats" id="stats"></div>

    <div class="toolbar">
      <input class="search-input" id="search" type="text" placeholder="Search tasks..." />
      <select id="statusFilter">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="picked">Picked</option>
        <option value="running">Running</option>
        <option value="done">Done</option>
        <option value="failed">Failed</option>
      </select>
      <select id="priorityFilter">
        <option value="">All Priority</option>
        <option value="urgent">Urgent</option>
        <option value="high">High</option>
        <option value="normal">Normal</option>
        <option value="low">Low</option>
      </select>
    </div>

    <div id="taskList"><div class="loading">Loading...</div></div>
  </div>

  <!-- Detail overlay -->
  <div class="detail-overlay" id="detailOverlay" onclick="if(event.target===this)closeDetail()">
    <div class="detail-panel">
      <div class="detail-header">
        <h2 id="detailTitle">Task Detail</h2>
        <button class="detail-close" onclick="closeDetail()">&times;</button>
      </div>
      <div class="detail-grid" id="detailGrid"></div>
    </div>
  </div>

  <script>
    const API_BASE = '${apiBaseUrl}';
    const TOKEN = '${escapedToken}';

    let allTasks = [];
    let currentFilter = '';
    let currentPriorityFilter = '';
    let searchQuery = '';

    async function apiFetch(path, opts = {}) {
      const res = await fetch(API_BASE + path, {
        ...opts,
        headers: {
          'Authorization': 'Bearer ' + TOKEN,
          'Content-Type': 'application/json',
          ...(opts.headers || {}),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'API error ' + res.status);
      }
      return res.json();
    }

    async function loadTasks() {
      try {
        // Fetch all tasks (no status filter, high limit)
        const params = new URLSearchParams({ limit: '200' });
        const data = await apiFetch('/api/tasks?' + params);
        allTasks = data.tasks || [];
        renderStats();
        renderTasks();
      } catch (e) {
        document.getElementById('taskList').innerHTML =
          '<div class="empty">Failed to load tasks: ' + escapeHtml(e.message) + '</div>';
      }
    }

    function renderStats() {
      const counts = { pending: 0, picked: 0, running: 0, done: 0, failed: 0 };
      allTasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
      const total = allTasks.length;

      document.getElementById('stats').innerHTML = [
        { label: 'Total', value: total, cls: '' },
        { label: 'Pending', value: counts.pending, cls: 'pending' },
        { label: 'Picked', value: counts.picked, cls: 'picked' },
        { label: 'Running', value: counts.running, cls: 'running' },
        { label: 'Done', value: counts.done, cls: 'done' },
        { label: 'Failed', value: counts.failed, cls: 'failed' },
      ].map(s => \`
        <div class="stat-card \${currentFilter === s.label.toLowerCase() ? 'active' : ''}"
             onclick="filterByStatus('\${s.label.toLowerCase() === 'total' ? '' : s.label.toLowerCase()}')">
          <div class="stat-label">\${s.label}</div>
          <div class="stat-value \${s.cls}">\${s.value}</div>
        </div>
      \`).join('');
    }

    function renderTasks() {
      let filtered = allTasks;

      if (currentFilter) {
        filtered = filtered.filter(t => t.status === currentFilter);
      }
      if (currentPriorityFilter) {
        filtered = filtered.filter(t => t.priority === currentPriorityFilter);
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(t =>
          t.commandText.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.resultSummary || '').toLowerCase().includes(q)
        );
      }

      if (filtered.length === 0) {
        document.getElementById('taskList').innerHTML = '<div class="empty">No tasks found</div>';
        return;
      }

      const rows = filtered.map(t => \`
        <tr onclick="showDetail('\${t.id}')" style="cursor:pointer">
          <td><code style="font-size:12px;color:var(--text-dim)">\${t.id.slice(0, 16)}...</code></td>
          <td><span class="badge badge-\${t.status}">\${t.status}</span></td>
          <td><span class="priority priority-\${t.priority}">\${t.priority}</span></td>
          <td title="\${escapeHtml(t.commandText)}">\${escapeHtml(t.commandText)}</td>
          <td style="color:var(--text-dim);font-size:12px">\${formatTime(t.createdAt)}</td>
          <td style="color:var(--text-dim);font-size:12px">\${formatTime(t.updatedAt)}</td>
        </tr>
      \`).join('');

      document.getElementById('taskList').innerHTML = \`
        <table class="task-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Command</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>\${rows}</tbody>
        </table>
      \`;
    }

    async function showDetail(id) {
      try {
        const data = await apiFetch('/api/tasks/' + id);
        const t = data.task;
        if (!t) return;

        document.getElementById('detailTitle').textContent = 'Task ' + t.id;

        const fields = [
          ['ID', t.id],
          ['Status', \`<span class="badge badge-\${t.status}">\${t.status}</span>\`],
          ['Priority', \`<span class="priority priority-\${t.priority}">\${t.priority}</span>\`],
          ['Source', t.source],
          ['Feishu User', t.feishuUserId],
          ['Feishu Chat', t.feishuChatId],
          ['Message ID', t.feishuMessageId],
          ['Created', formatTime(t.createdAt)],
          ['Updated', formatTime(t.updatedAt)],
          ['Attachments', renderAttachments(t.attachments)],
        ];

        let html = fields.map(([label, val]) =>
          \`<div class="detail-label">\${label}</div><div class="detail-value">\${val}</div>\`
        ).join('');

        html += \`<div class="detail-label">Command</div><div class="detail-value">
          <div class="detail-textarea" style="min-height:60px">\${escapeHtml(t.commandText)}</div></div>\`;

        if (t.resultSummary) {
          html += \`<div class="detail-label">Result</div><div class="detail-value">
            <div class="detail-textarea">\${escapeHtml(t.resultSummary)}</div></div>\`;
        }
        if (t.resultDetails) {
          html += \`<div class="detail-label">Details</div><div class="detail-value">
            <div class="detail-textarea">\${escapeHtml(t.resultDetails)}</div></div>\`;
        }

        document.getElementById('detailGrid').innerHTML = html;
        document.getElementById('detailOverlay').classList.add('open');
      } catch (e) {
        alert('Failed to load task: ' + e.message);
      }
    }

    function renderAttachments(attachments) {
      if (!attachments || attachments.length === 0) return '<span style="color:var(--text-dim)">None</span>';
      return attachments.map(a =>
        \`<span class="attachment-item">📎 \${escapeHtml(a.fileName)} (\${a.fileType})</span>\`
      ).join('');
    }

    function closeDetail() {
      document.getElementById('detailOverlay').classList.remove('open');
    }

    function filterByStatus(status) {
      currentFilter = status;
      document.getElementById('statusFilter').value = status;
      renderStats();
      renderTasks();
    }

    function formatTime(iso) {
      if (!iso) return '-';
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function escapeHtml(s) {
      if (!s) return '';
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function logout() {
      localStorage.removeItem('harness_token');
      location.reload();
    }

    async function refresh() {
      document.getElementById('taskList').innerHTML = '<div class="loading">Loading...</div>';
      await loadTasks();
    }

    // Event listeners
    document.getElementById('search').addEventListener('input', e => {
      searchQuery = e.target.value;
      renderTasks();
    });
    document.getElementById('statusFilter').addEventListener('change', e => {
      currentFilter = e.target.value;
      renderStats();
      renderTasks();
    });
    document.getElementById('priorityFilter').addEventListener('change', e => {
      currentPriorityFilter = e.target.value;
      renderTasks();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDetail();
    });

    // Init
    loadTasks();
    // Auto-refresh every 30 seconds
    setInterval(loadTasks, 30000);
  </script>
</body>
</html>`;
}
