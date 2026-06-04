/**
 * Enhanced Dashboard HTML template (Phase 31).
 * Features:
 * - Rich task list with tags, due dates, pinned status, device assignment
 * - Detail panel with subtasks, comments, activity timeline, SLA info
 * - SSE real-time updates (auto-reconnect)
 * - Tag filter, date range filter
 * - Responsive design
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
    .header h1 { font-size: 20px; font-weight: 600; }
    .header-actions { display: flex; gap: 12px; align-items: center; }
    .sse-indicator {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--red); transition: background 0.3s;
    }
    .sse-indicator.connected { background: var(--green); }
    .sse-label { font-size: 11px; color: var(--text-dim); }
    .btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn-outline {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-dim);
    }
    .btn-outline:hover { border-color: var(--accent); color: var(--text); }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px 24px; }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .stat-card:hover { border-color: var(--accent); transform: translateY(-1px); }
    .stat-card.active { border-color: var(--accent); background: rgba(108,92,231,0.1); }
    .stat-label { font-size: 12px; color: var(--text-dim); margin-bottom: 4px; }
    .stat-value { font-size: 24px; font-weight: 700; }
    .stat-value.pending { color: var(--yellow); }
    .stat-value.picked { color: var(--blue); }
    .stat-value.running { color: var(--orange); }
    .stat-value.done { color: var(--green); }
    .stat-value.failed { color: var(--red); }
    .toolbar {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      flex-wrap: wrap;
      align-items: center;
    }
    .toolbar input, .toolbar select {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 7px 12px;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
    }
    .toolbar input:focus, .toolbar select:focus { border-color: var(--accent); }
    .toolbar input { flex: 1; min-width: 200px; }
    .toolbar input[type="date"] {
      max-width: 150px;
      flex: none;
    }
    .toolbar label.date-label {
      font-size: 11px;
      color: var(--text-dim);
    }
    .toolbar .date-range-group {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: none;
    }
    .task-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-card);
      border-radius: 8px;
      overflow: hidden;
    }
    .task-table th {
      text-align: left;
      padding: 10px 14px;
      font-size: 12px;
      color: var(--text-dim);
      border-bottom: 1px solid var(--border);
      font-weight: 500;
    }
    .task-table td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .task-table tr:hover td { background: var(--bg-hover); }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-pending { background: rgba(255,165,2,0.15); color: var(--yellow); }
    .badge-picked { background: rgba(30,144,255,0.15); color: var(--blue); }
    .badge-running { background: rgba(255,99,72,0.15); color: var(--orange); }
    .badge-done { background: rgba(46,213,115,0.15); color: var(--green); }
    .badge-failed { background: rgba(255,71,87,0.15); color: var(--red); }
    .priority {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }
    .priority-urgent { background: rgba(255,71,87,0.2); color: var(--red); }
    .priority-high { background: rgba(255,99,72,0.2); color: var(--orange); }
    .priority-normal { background: rgba(139,143,163,0.15); color: var(--text-dim); }
    .priority-low { background: rgba(139,143,163,0.1); color: var(--text-dim); }
    .tag {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      background: rgba(108,92,231,0.15);
      color: var(--accent);
      margin-right: 4px;
    }
    .pin-icon { color: var(--yellow); font-size: 12px; }
    .empty { text-align: center; padding: 40px; color: var(--text-dim); }
    .loading { text-align: center; padding: 40px; color: var(--text-dim); }

    /* Detail overlay */
    .detail-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      justify-content: flex-end;
      z-index: 100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }
    .detail-overlay.open { opacity: 1; pointer-events: all; }
    .detail-panel {
      width: 560px;
      max-width: 90vw;
      height: 100vh;
      background: var(--bg-card);
      border-left: 1px solid var(--border);
      overflow-y: auto;
      transform: translateX(30px);
      transition: transform 0.2s;
    }
    .detail-overlay.open .detail-panel { transform: translateX(0); }
    .detail-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      background: var(--bg-card);
      z-index: 1;
    }
    .detail-header h2 { font-size: 16px; font-weight: 600; }
    .detail-close {
      background: none;
      border: none;
      color: var(--text-dim);
      font-size: 24px;
      cursor: pointer;
    }
    .detail-close:hover { color: var(--text); }
    .detail-body { padding: 20px; }
    .detail-section {
      margin-bottom: 20px;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .detail-section-header {
      padding: 10px 14px;
      background: rgba(108,92,231,0.05);
      font-size: 13px;
      font-weight: 600;
      color: var(--accent);
      border-bottom: 1px solid var(--border);
    }
    .detail-section-body { padding: 12px 14px; }
    .detail-grid {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px 12px;
      font-size: 13px;
    }
    .detail-label { color: var(--text-dim); font-weight: 500; }
    .detail-value { word-break: break-all; }
    .detail-textarea {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font-size: 13px;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
    }
    .subtask-item {
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .subtask-item:last-child { border-bottom: none; }
    .comment-item {
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
    }
    .comment-item:last-child { border-bottom: none; }
    .comment-meta { font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
    .comment-body { font-size: 13px; }
    .activity-item {
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      margin-top: 5px;
      flex-shrink: 0;
    }
    .activity-text { font-size: 13px; }
    .activity-time { font-size: 11px; color: var(--text-dim); }
    .overdue { color: var(--red); font-weight: 600; }
    .no-data { color: var(--text-dim); font-size: 12px; font-style: italic; }

    /* Create task modal */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 200; opacity: 0; pointer-events: none; transition: opacity 0.2s;
    }
    .modal-overlay.open { opacity: 1; pointer-events: all; }
    .modal {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
      width: 500px; max-width: 90vw; max-height: 85vh; overflow-y: auto;
    }
    .modal-header {
      padding: 16px 20px; border-bottom: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-header h2 { font-size: 16px; font-weight: 600; }
    .modal-body { padding: 20px; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 4px; font-weight: 500; }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%; background: var(--bg); border: 1px solid var(--border);
      color: var(--text); padding: 8px 12px; border-radius: 6px; font-size: 13px; outline: none;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--accent); }
    .form-group textarea { resize: vertical; min-height: 60px; font-family: inherit; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }

    /* Action buttons in detail */
    .action-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 5px; cursor: pointer; border: 1px solid var(--border); background: var(--bg); color: var(--text-dim); }
    .btn-sm:hover { border-color: var(--accent); color: var(--text); }
    .btn-sm.green { border-color: var(--green); color: var(--green); }
    .btn-sm.green:hover { background: rgba(46,213,115,0.1); }
    .btn-sm.red { border-color: var(--red); color: var(--red); }
    .btn-sm.red:hover { background: rgba(255,71,87,0.1); }
    .btn-sm.orange { border-color: var(--orange); color: var(--orange); }
    .btn-sm.orange:hover { background: rgba(255,99,72,0.1); }
    .btn-sm.blue { border-color: var(--blue); color: var(--blue); }
    .btn-sm.blue:hover { background: rgba(30,144,255,0.1); }

    /* Comment form in detail */
   .comment-form { display: flex; gap: 8px; margin-top: 10px; }
   .comment-form input { flex: 1; }
        .task-table th.sortable { cursor: pointer; user-select: none; }
    .task-table th.sortable:hover { color: var(--accent); }
    .task-table th .sort-arrow { font-size: 10px; margin-left: 4px; opacity: 0.5; }
    .task-table th.sort-asc .sort-arrow,
    .task-table th.sort-desc .sort-arrow { opacity: 1; color: var(--accent); }

    /* Bulk selection */
    .bulk-bar {
      display: none;
      background: var(--bg-card);
      border: 1px solid var(--accent);
      border-radius: 8px;
      padding: 10px 16px;
      margin-bottom: 12px;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .bulk-bar.visible { display: flex; }
    .bulk-bar .bulk-count { font-size: 13px; color: var(--accent); font-weight: 600; }
    .bulk-bar .bulk-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .task-table th:first-child,
    .task-table td:first-child { width: 36px; text-align: center; }
    .task-table input[type="checkbox"] {
      accent-color: var(--accent);
      width: 15px; height: 15px; cursor: pointer;
    }
    .bulk-select-modal {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
      width: 340px; max-width: 90vw;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ Harness Remote</h1>
    <div class="header-actions">
      <div style="display:flex;align-items:center;gap:6px">
        <div class="sse-indicator" id="sseIndicator"></div>
        <span class="sse-label" id="sseLabel">Connecting...</span>
      </div>
      <button class="btn" onclick="openCreateModal()">+ New Task</button>
      <button class="btn btn-outline" onclick="exportCSV()">⬇ CSV</button>
      <button class="btn btn-outline" onclick="refresh()">↻ Refresh</button>
      <button class="btn btn-outline" onclick="logout()">Logout</button>
    </div>
  </div>

  <div class="container">
    <div class="stats-row" id="stats"></div>

    <div class="toolbar">
      <input id="search" type="text" placeholder="Search tasks (ID, command, tags, description)..." />
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
      <input id="tagFilter" type="text" placeholder="Filter by tag..." style="max-width:160px;flex:none" />
      <div class="date-range-group">
        <label class="date-label">From</label>
        <input id="dateFrom" type="date" title="Filter by creation date (start)" />
      </div>
      <div class="date-range-group">
        <label class="date-label">To</label>
        <input id="dateTo" type="date" title="Filter by creation date (end)" />
      </div>
    </div>

    <div id="taskList"><div class="loading">Loading...</div></div>

    <!-- Bulk actions bar -->
    <div class="bulk-bar" id="bulkBar">
      <span class="bulk-count" id="bulkCount">0 selected</span>
      <div class="bulk-actions">
        <button class="btn-sm green" onclick="bulkAction('done')">✅ Mark Done</button>
        <button class="btn-sm orange" onclick="bulkAction('running')">▶ Start</button>
        <button class="btn-sm red" onclick="bulkAction('failed')">❌ Mark Failed</button>
        <button class="btn-sm blue" onclick="bulkAssign()">💻 Assign Device</button>
        <button class="btn-sm blue" onclick="bulkAddTags()">🏷️ Add Tags</button>
        <button class="btn-sm orange" onclick="bulkRemoveTag()">🏷️ Remove Tag</button>
        <button class="btn-sm red" onclick="bulkDelete()">🗑️ Delete</button>
        <button class="btn-sm" onclick="clearSelection()">✕ Clear</button>
      </div>
    </div>
  </div>

  <!-- Detail overlay -->
  <div class="detail-overlay" id="detailOverlay" onclick="if(event.target===this)closeDetail()">
    <div class="detail-panel">
      <div class="detail-header">
        <h2 id="detailTitle">Task Detail</h2>
        <button class="detail-close" onclick="closeDetail()">&times;</button>
      </div>
      <div class="detail-body" id="detailBody"></div>
    </div>
  </div>

  <!-- Create task modal -->
  <div class="modal-overlay" id="createModal" onclick="if(event.target===this)closeCreateModal()">
    <div class="modal">
      <div class="modal-header">
        <h2>Create Task</h2>
        <button class="detail-close" onclick="closeCreateModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Command Text *</label>
          <textarea id="createCommand" placeholder="What should be done?" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="createDescription" placeholder="Optional details..." rows="2"></textarea>
        </div>
        <div style="display:flex;gap:10px">
          <div class="form-group" style="flex:1">
            <label>Priority</label>
            <select id="createPriority">
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label>Tags (comma-separated)</label>
            <input id="createTags" placeholder="bug, frontend, urgent" />
          </div>
        </div>
        <div style="display:flex;gap:10px">
          <div class="form-group" style="flex:1">
            <label>Assigned Device</label>
            <input id="createDevice" placeholder="device ID (optional)" />
          </div>
          <div class="form-group" style="flex:1">
            <label>Due Date</label>
            <input id="createDueDate" type="datetime-local" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-outline" onclick="closeCreateModal()">Cancel</button>
          <button class="btn" id="createSubmitBtn" onclick="submitCreateTask()">Create Task</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = '${apiBaseUrl}';
    const TOKEN = '${escapedToken}';

    let allTasks = [];
    let currentFilter = '';
    let currentPriorityFilter = '';
    let searchQuery = '';
    let tagQuery = '';
    let dateFrom = '';
    let dateTo = '';
    let allTags = new Set();
    let sortCol = '';
    let sortDir = 'asc';

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
        const params = new URLSearchParams({ limit: '500' });
        if (dateFrom) params.set('from', dateFrom);
        if (dateTo) {
          // Append T23:59:59 to include tasks created on the "to" date
          params.set('to', dateTo + 'T23:59:59');
        }
        const data = await apiFetch('/api/tasks?' + params);
        allTasks = data.tasks || [];
        // Collect all tags
        allTags = new Set();
        allTasks.forEach(t => {
          if (t.tags) t.tags.forEach(tag => allTags.add(tag));
        });
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
      ].map(s =>
        '<div class="stat-card ' + (currentFilter === s.label.toLowerCase() ? 'active' : '') + '" ' +
        'onclick="filterByStatus(\\'' + (s.label.toLowerCase() === 'total' ? '' : s.label.toLowerCase()) + '\\')">' +
        '<div class="stat-label">' + s.label + '</div>' +
        '<div class="stat-value ' + s.cls + '">' + s.value + '</div></div>'
      ).join('');

      // Update page title with counts
      const active = counts.pending + counts.picked + counts.running;
      document.title = (active > 0 ? '(' + active + ') ' : '') + 'Harness Remote - Task Dashboard';
    }

    function renderTasks() {
      let filtered = allTasks;

      // Sort
      if (sortCol) {
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        const statusOrder = { pending: 0, picked: 1, running: 2, failed: 3, done: 4 };
        filtered = [...filtered].sort((a, b) => {
          let va = a[sortCol], vb = b[sortCol];
          if (sortCol === 'priority') { va = priorityOrder[va] ?? 9; vb = priorityOrder[vb] ?? 9; }
          else if (sortCol === 'status') { va = statusOrder[va] ?? 9; vb = statusOrder[vb] ?? 9; }
          else if (sortCol === 'dueDate' || sortCol === 'createdAt') {
            va = va ? new Date(va).getTime() : 0;
            vb = vb ? new Date(vb).getTime() : 0;
          }
          else if (sortCol === 'id') { va = (va || '').slice(0, 16); vb = (vb || '').slice(0, 16); }
          if (va < vb) return sortDir === 'asc' ? -1 : 1;
          if (va > vb) return sortDir === 'asc' ? 1 : -1;
          return 0;
        });
      }

      if (currentFilter) {
        filtered = filtered.filter(t => t.status === currentFilter);
      }
      if (currentPriorityFilter) {
        filtered = filtered.filter(t => t.priority === currentPriorityFilter);
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(t =>
          t.id.toLowerCase().includes(q) ||
          t.commandText.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.resultSummary || '').toLowerCase().includes(q) ||
          (t.tags || []).some(tag => tag.toLowerCase().includes(q))
        );
      }
      if (tagQuery) {
        const tq = tagQuery.toLowerCase();
        filtered = filtered.filter(t =>
          (t.tags || []).some(tag => tag.toLowerCase().includes(tq))
        );
      }

      if (filtered.length === 0) {
        document.getElementById('taskList').innerHTML = '<div class="empty">No tasks found</div>';
        return;
      }

      const rows = filtered.map(t => {
        const tags = (t.tags || []).map(tag =>
          '<span class="tag">' + escapeHtml(tag) + '</span>'
        ).join('');
        const pin = t.pinned ? ' <span class="pin-icon">📌</span>' : '';
        const device = t.assignedDeviceId
          ? '<span style="font-size:11px;color:var(--text-dim)">' + escapeHtml(t.assignedDeviceId.slice(0,12)) + '</span>'
          : '<span style="font-size:11px;color:var(--text-dim)">—</span>';
        const dueDate = t.dueDate
          ? (new Date(t.dueDate) < new Date() && t.status !== 'done' && t.status !== 'failed'
            ? '<span class="overdue">⏰ ' + formatTime(t.dueDate) + '</span>'
            : '<span style="font-size:12px">📅 ' + formatTime(t.dueDate) + '</span>')
          : '<span style="color:var(--text-dim);font-size:12px">—</span>';

        return '<tr onclick="showDetail(\\'' + t.id + '\\')" style="cursor:pointer">' +
          '<td onclick="event.stopPropagation()"><input type="checkbox" class="row-cb" data-id="' + t.id + '" onchange="onRowSelect()" /></td>' +
          '<td><code style="font-size:12px;color:var(--text-dim)">' + t.id.slice(0, 16) + '...</code></td>' +
          '<td><span class="badge badge-' + t.status + '">' + t.status + '</span>' + pin + '</td>' +
          '<td><span class="priority priority-' + t.priority + '">' + t.priority + '</span></td>' +
          '<td title="' + escapeHtml(t.commandText) + '">' + escapeHtml(t.commandText.slice(0, 60)) + (t.commandText.length > 60 ? '...' : '') + '</td>' +
          '<td>' + (tags || '<span style="color:var(--text-dim)">—</span>') + '</td>' +
          '<td>' + dueDate + '</td>' +
          '<td>' + device + '</td>' +
          '<td style="color:var(--text-dim);font-size:12px">' + formatTime(t.createdAt) + '</td>' +
        '</tr>';
      }).join('');

      document.getElementById('taskList').innerHTML =
        '<table class="task-table">' +
          '<thead><tr>' +
            '<th><input type="checkbox" id="selectAll" onchange="toggleSelectAll(this.checked)" title="Select all" /></th>' +
            '<th class="sortable" onclick="sortBy(\'id\')">ID <span class="sort-arrow">⇅</span></th>' +
            '<th class="sortable" onclick="sortBy(\'status\')">Status <span class="sort-arrow">⇅</span></th>' +
            '<th class="sortable" onclick="sortBy(\'priority\')">Priority <span class="sort-arrow">⇅</span></th>' +
            '<th>Command</th>' +
            '<th>Tags</th>' +
            '<th class="sortable" onclick="sortBy(\'dueDate\')">Due Date <span class="sort-arrow">⇅</span></th>' +
            '<th>Device</th>' +
            '<th class="sortable" onclick="sortBy(\'createdAt\')">Created <span class="sort-arrow">⇅</span></th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>';
    }

    async function showDetail(id) {
      try {
        const data = await apiFetch('/api/tasks/' + id);
        const t = data.task;
        if (!t) return;

        document.getElementById('detailTitle').textContent = 'Task ' + t.id.slice(0, 20);

        let html = '';

        // Basic info section
        html += '<div class="detail-section"><div class="detail-section-header">📋 Basic Info</div><div class="detail-section-body">';
        html += '<div class="detail-grid">';
        html += field('ID', t.id);
        html += field('Status', '<span class="badge badge-' + t.status + '">' + t.status + '</span>');
        html += field('Priority', '<span class="priority priority-' + t.priority + '">' + t.priority + '</span>');
        html += field('Source', t.source);
        html += field('Feishu User', t.feishuUserId);
        html += field('Feishu Chat', t.feishuChatId);
        html += field('Assigned Device', t.assignedDeviceId || '—');
        if (t.pinned) html += field('Pinned', '📌 Yes');
        html += field('Created', formatTime(t.createdAt));
        html += field('Updated', formatTime(t.updatedAt));
        if (t.pickedAt) html += field('Picked At', formatTime(t.pickedAt));
        if (t.startedAt) html += field('Started At', formatTime(t.startedAt));
        if (t.completedAt) html += field('Completed At', formatTime(t.completedAt));
        html += '</div></div></div>';

        // Action buttons
        html += '<div class=\"detail-section\"><div class=\"detail-section-header\">⚡ Actions</div><div class=\"detail-section-body\">';
        html += '<div class=\"action-bar\" id=\"actionBar\">';
        if (t.status === 'pending' || t.status === 'picked') {
          html += '<button class=\"btn-sm orange\" onclick=\"taskAction(\\'' + t.id + '\\',\\'running\\')\">▶ Start</button>';
        }
        if (t.status === 'running' || t.status === 'picked') {
          html += '<button class=\"btn-sm green\" onclick=\"taskAction(\\'' + t.id + '\\',\\'done\\')\">✅ Done</button>';
          html += '<button class=\"btn-sm red\" onclick=\"taskAction(\\'' + t.id + '\\',\\'failed\\')\">❌ Fail</button>';
        }
        if (t.status === 'done' || t.status === 'failed') {
          html += '<button class=\"btn-sm blue\" onclick=\"taskRetry(\\'' + t.id + '\\')\">🔄 Retry</button>';
        }
        if (t.pinned) {
          html += '<button class=\"btn-sm\" onclick=\"taskUnpin(\\'' + t.id + '\\')\">📌 Unpin</button>';
        } else {
          html += '<button class=\"btn-sm\" onclick=\"taskPin(\\'' + t.id + '\\')\">📌 Pin</button>';
        }
        html += '<button class=\"btn-sm\" onclick=\"taskClone(\\'' + t.id + '\\')\">📋 Clone</button>';
        html += '</div></div></div>';

        // Tags section
        if (t.tags && t.tags.length > 0) {
          html += '<div class="detail-section"><div class="detail-section-header">🏷️ Tags</div><div class="detail-section-body">';
          html += t.tags.map(tag => '<span class="tag">' + escapeHtml(tag) + '</span>').join(' ');
          html += '</div></div>';
        }

        // Description
        if (t.description) {
          html += '<div class="detail-section"><div class="detail-section-header">📝 Description</div><div class="detail-section-body">';
          html += '<div class="detail-textarea">' + escapeHtml(t.description) + '</div>';
          html += '</div></div>';
        }

        // Due date & reminder
        if (t.dueDate || t.reminderAt) {
          html += '<div class="detail-section"><div class="detail-section-header">📅 Schedule</div><div class="detail-section-body">';
          html += '<div class="detail-grid">';
          if (t.dueDate) {
            const overdue = new Date(t.dueDate) < new Date() && t.status !== 'done' && t.status !== 'failed';
            html += field('Due Date', (overdue ? '<span class="overdue">⏰ OVERDUE - ' : '') + formatTime(t.dueDate) + (overdue ? '</span>' : ''));
          }
          if (t.reminderAt) html += field('Reminder', '🔔 ' + formatTime(t.reminderAt));
          html += '</div></div></div>';
        }

        // Command
        html += '<div class="detail-section"><div class="detail-section-header">💻 Command</div><div class="detail-section-body">';
        html += '<div class="detail-textarea">' + escapeHtml(t.commandText) + '</div>';
        html += '</div></div>';

        // Attachments
        if (t.attachments && t.attachments.length > 0) {
          html += '<div class="detail-section"><div class="detail-section-header">📎 Attachments (' + t.attachments.length + ')</div><div class="detail-section-body">';
          html += t.attachments.map(a =>
            '<div style="padding:4px 0;font-size:13px">📄 ' + escapeHtml(a.fileName) + ' <span style="color:var(--text-dim)">(' + a.fileType + ')</span></div>'
          ).join('');
          html += '</div></div>';
        }

        // Dependencies
        if (t.dependsOn && t.dependsOn.length > 0) {
          html += '<div class="detail-section"><div class="detail-section-header">🔗 Dependencies (' + t.dependsOn.length + ')</div><div class="detail-section-body">';
          html += t.dependsOn.map(depId =>
            '<div style="padding:4px 0;font-size:13px"><code>' + depId.slice(0, 16) + '...</code></div>'
          ).join('');
          html += '</div></div>';
        }

        // Result
        if (t.resultSummary) {
          html += '<div class="detail-section"><div class="detail-section-header">✅ Result</div><div class="detail-section-body">';
          html += '<div class="detail-textarea">' + escapeHtml(t.resultSummary) + '</div>';
          html += '</div></div>';
        }
        if (t.resultDetails) {
          html += '<div class="detail-section"><div class="detail-section-header">📋 Details</div><div class="detail-section-body">';
          html += '<div class="detail-textarea" style="max-height:300px">' + escapeHtml(t.resultDetails) + '</div>';
          html += '</div></div>';
        }

        document.getElementById('detailBody').innerHTML = html;
        document.getElementById('detailOverlay').classList.add('open');

        // Load subtasks, comments, activity in parallel
        loadSubtasks(id);
        loadComments(id);
        loadActivity(id);
      } catch (e) {
        alert('Failed to load task: ' + e.message);
      }
    }

    async function loadSubtasks(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/subtasks');
        const subtasks = data.subtasks || [];
        if (subtasks.length === 0) return;

        const section = document.createElement('div');
        section.className = 'detail-section';
        section.innerHTML = '<div class="detail-section-header">🧩 Subtasks (' + subtasks.length + ')</div>' +
          '<div class="detail-section-body">' +
          subtasks.map(st =>
            '<div class="subtask-item">' +
              '<span class="badge badge-' + st.status + '">' + st.status + '</span>' +
              '<span style="flex:1;font-size:13px">' + escapeHtml(st.title) + '</span>' +
              (st.resultSummary ? '<span style="font-size:11px;color:var(--text-dim)" title="' + escapeHtml(st.resultSummary) + '">✓</span>' : '') +
            '</div>'
          ).join('') +
          '</div>';
        document.getElementById('detailBody').appendChild(section);
      } catch { /* subtasks endpoint may not exist */ }
    }

    async function loadComments(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/comments');
        const comments = data.comments || [];

        const section = document.createElement('div');
        section.className = 'detail-section';
        let inner = '<div class="detail-section-header">💬 Comments (' + comments.length + ')</div>';
        inner += '<div class="detail-section-body">';
        if (comments.length > 0) {
          inner += comments.map(c =>
            '<div class="comment-item">' +
              '<div class="comment-meta">' + escapeHtml(c.author) + ' · ' + formatTime(c.createdAt) + '</div>' +
              '<div class="comment-body">' + escapeHtml(c.body) + '</div>' +
            '</div>'
          ).join('');
        }
        inner += '<div class="comment-form">' +
          '<input id="commentInput" type="text" placeholder="Add a comment..." />' +
          '<button class="btn-sm blue" onclick="addComment('' + taskId + '')">Send</button>' +
          '</div>';
        inner += '</div>';
        section.innerHTML = inner;
        document.getElementById('detailBody').appendChild(section);
      } catch { /* comments endpoint may not exist */ }
    }

    async function addComment(taskId) {
      const input = document.getElementById('commentInput');
      if (!input || !input.value.trim()) return;
      try {
        await apiFetch('/api/tasks/' + taskId + '/comments', {
          method: 'POST',
          body: JSON.stringify({ body: input.value.trim() }),
        });
        input.value = '';
        showDetail(taskId);
      } catch (e) { alert('Comment failed: ' + e.message); }
    }

    async function loadActivity(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/activity');
        const items = data.activity || [];
        if (items.length === 0) return;

        const section = document.createElement('div');
        section.className = 'detail-section';
        section.innerHTML = '<div class="detail-section-header">📜 Activity (' + items.length + ')</div>' +
          '<div class="detail-section-body">' +
          items.slice(0, 20).map(item =>
            '<div class="activity-item">' +
              '<div class="activity-dot"></div>' +
              '<div><div class="activity-text">' + escapeHtml(item.action) +
                (item.details && item.details.status ? ' → <span class="badge badge-' + item.details.status + '">' + item.details.status + '</span>' : '') +
              '</div>' +
              '<div class="activity-time">' + escapeHtml(item.actor) + ' · ' + formatTime(item.timestamp) + '</div></div>' +
            '</div>'
          ).join('') +
          '</div>';
        document.getElementById('detailBody').appendChild(section);
      } catch { /* activity endpoint may not exist */ }
    }

    function field(label, value) {
      return '<div class="detail-label">' + label + '</div><div class="detail-value">' + value + '</div>';
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

    // SSE real-time updates
    let eventSource = null;
    function connectSSE() {
      const indicator = document.getElementById('sseIndicator');
      const label = document.getElementById('sseLabel');
      indicator.className = 'sse-indicator';
      label.textContent = 'Connecting...';

      if (eventSource) { eventSource.close(); }
      eventSource = new EventSource(API_BASE + '/api/tasks/stream?token=' + TOKEN);

      eventSource.onopen = () => {
        indicator.className = 'sse-indicator connected';
        label.textContent = 'Live';
      };

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          // Refresh task list on any task event
          if (event.type && event.type.startsWith('task.')) {
            loadTasks();
          }
        } catch { /* ignore parse errors */ }
      };

      eventSource.onerror = () => {
        indicator.className = 'sse-indicator';
        label.textContent = 'Reconnecting...';
        // Auto-reconnect after 3s
        setTimeout(connectSSE, 3000);
      };
    }

    // Task actions from detail panel
    let currentDetailId = null;
    async function taskAction(id, status) {
      try {
        await apiFetch('/api/tasks/' + id + '/status', {
          method: 'POST',
          body: JSON.stringify({ status }),
        });
        closeDetail();
        loadTasks();
      } catch (e) { alert('Action failed: ' + e.message); }
    }
    async function taskRetry(id) {
      try {
        await apiFetch('/api/tasks/' + id + '/retry', { method: 'POST' });
        closeDetail();
        loadTasks();
      } catch (e) { alert('Retry failed: ' + e.message); }
    }
    async function taskPin(id) {
      try {
        await apiFetch('/api/tasks/' + id + '/pin', { method: 'POST' });
        closeDetail();
        loadTasks();
      } catch (e) { alert('Pin failed: ' + e.message); }
    }
    async function taskUnpin(id) {
      try {
        await apiFetch('/api/tasks/' + id + '/unpin', { method: 'POST' });
        closeDetail();
        loadTasks();
      } catch (e) { alert('Unpin failed: ' + e.message); }
    }
    async function taskClone(id) {
      try {
        await apiFetch('/api/tasks/' + id + '/clone', { method: 'POST' });
        loadTasks();
      } catch (e) { alert('Clone failed: ' + e.message); }
    }

    // Create task modal
    function openCreateModal() {
      document.getElementById('createModal').classList.add('open');
      document.getElementById('createCommand').focus();
    }
    function closeCreateModal() {
      document.getElementById('createModal').classList.remove('open');
      document.getElementById('createCommand').value = '';
      document.getElementById('createDescription').value = '';
      document.getElementById('createPriority').value = 'normal';
      document.getElementById('createTags').value = '';
      document.getElementById('createDevice').value = '';
      document.getElementById('createDueDate').value = '';
    }
    async function submitCreateTask() {
      const commandText = document.getElementById('createCommand').value.trim();
      if (!commandText) { alert('Command text is required'); return; }
      const body = {
        commandText,
        description: document.getElementById('createDescription').value.trim() || undefined,
        priority: document.getElementById('createPriority').value,
        tags: document.getElementById('createTags').value.split(',').map(s => s.trim()).filter(Boolean),
        assignedDeviceId: document.getElementById('createDevice').value.trim() || undefined,
        dueDate: document.getElementById('createDueDate').value ? new Date(document.getElementById('createDueDate').value).toISOString() : undefined,
      };
      try {
        await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
        closeCreateModal();
        loadTasks();
      } catch (e) { alert('Create failed: ' + e.message); }
    }

    // CSV export
    function exportCSV() {
      window.open(API_BASE + '/api/tasks/export.csv', '_blank');
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
    document.getElementById('tagFilter').addEventListener('input', e => {
      tagQuery = e.target.value;
      renderTasks();
    });
    document.getElementById('dateFrom').addEventListener('change', e => {
      dateFrom = e.target.value;
      loadTasks();
    });
    document.getElementById('dateTo').addEventListener('change', e => {
      dateTo = e.target.value;
      loadTasks();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (document.getElementById('createModal').classList.contains('open')) {
          closeCreateModal();
        } else {
          closeDetail();
        }
      }
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        openCreateModal();
      }
    });


    // Column sorting
    function sortBy(col) {
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      // Update header indicators
      document.querySelectorAll('.task-table th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        th.querySelector('.sort-arrow').textContent = '⇅';
      });
      const headers = document.querySelectorAll('.task-table th.sortable');
      headers.forEach(th => {
        if (th.textContent.trim().startsWith(col.charAt(0).toUpperCase() + col.slice(1)) ||
            (col === 'id' && th.textContent.includes('ID')) ||
            (col === 'dueDate' && th.textContent.includes('Due'))) {
          th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
          th.querySelector('.sort-arrow').textContent = sortDir === 'asc' ? '↑' : '↓';
        }
      });
      renderTasks();
    }

    // Bulk selection
    let selectedIds = new Set();

    function onRowSelect() {
      const checkboxes = document.querySelectorAll('.row-cb');
      selectedIds.clear();
      checkboxes.forEach(cb => { if (cb.checked) selectedIds.add(cb.dataset.id); });
      updateBulkBar();
    }

    function toggleSelectAll(checked) {
      const checkboxes = document.querySelectorAll('.row-cb');
      selectedIds.clear();
      checkboxes.forEach(cb => {
        cb.checked = checked;
        if (checked) selectedIds.add(cb.dataset.id);
      });
      updateBulkBar();
    }

    function clearSelection() {
      selectedIds.clear();
      document.querySelectorAll('.row-cb').forEach(cb => cb.checked = false);
      const sa = document.getElementById('selectAll');
      if (sa) sa.checked = false;
      updateBulkBar();
    }

    function updateBulkBar() {
      const bar = document.getElementById('bulkBar');
      const count = document.getElementById('bulkCount');
      if (selectedIds.size > 0) {
        bar.classList.add('visible');
        count.textContent = selectedIds.size + ' selected';
      } else {
        bar.classList.remove('visible');
      }
    }

    async function bulkAction(status) {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      if (!confirm('Set ' + ids.length + ' task(s) to ' + status + '?')) return;
      try {
        const data = await apiFetch('/api/tasks/bulk/status', {
          method: 'POST',
          body: JSON.stringify({ ids, status }),
        });
        alert('Updated ' + (data.updated || 0) + ' task(s)' + (data.errors && data.errors.length ? '\nErrors: ' + data.errors.join(', ') : ''));
        clearSelection();
        loadTasks();
      } catch (e) { alert('Bulk status failed: ' + e.message); }
    }

    async function bulkAssign() {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      const deviceId = prompt('Enter device ID to assign to:');
      if (!deviceId || !deviceId.trim()) return;
      try {
        const data = await apiFetch('/api/tasks/bulk/assign', {
          method: 'POST',
          body: JSON.stringify({ ids, deviceId: deviceId.trim() }),
        });
        alert('Assigned ' + (data.updated || 0) + ' task(s)' + (data.errors && data.errors.length ? '\nErrors: ' + data.errors.join(', ') : ''));
        clearSelection();
        loadTasks();
      } catch (e) { alert('Bulk assign failed: ' + e.message); }
    }

    async function bulkDelete() {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      if (!confirm('Delete ' + ids.length + ' task(s)? This cannot be undone.')) return;
      try {
        const data = await apiFetch('/api/tasks/bulk/delete', {
          method: 'POST',
          body: JSON.stringify({ ids }),
        });
        alert('Deleted ' + (data.deleted || 0) + ' task(s)' + (data.errors && data.errors.length ? '\nErrors: ' + data.errors.join(', ') : ''));
        clearSelection();
        loadTasks();
      } catch (e) { alert('Bulk delete failed: ' + e.message); }
    }

    async function bulkAddTags() {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      const tagsInput = prompt('Enter tags to add (comma-separated):');
      if (!tagsInput || !tagsInput.trim()) return;
      const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
      if (tags.length === 0) return;
      try {
        const data = await apiFetch('/api/tasks/bulk/tags/add', {
          method: 'POST',
          body: JSON.stringify({ ids, tags }),
        });
        alert('Added tags to ' + (data.updated || 0) + ' task(s)' + (data.errors && data.errors.length ? '\nErrors: ' + data.errors.join(', ') : ''));
        clearSelection();
        loadTasks();
      } catch (e) { alert('Bulk add tags failed: ' + e.message); }
    }

    async function bulkRemoveTag() {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      const tag = prompt('Enter tag to remove:');
      if (!tag || !tag.trim()) return;
      try {
        const data = await apiFetch('/api/tasks/bulk/tags/remove', {
          method: 'POST',
          body: JSON.stringify({ ids, tag: tag.trim() }),
        });
        alert('Removed tag from ' + (data.updated || 0) + ' task(s)' + (data.errors && data.errors.length ? '\nErrors: ' + data.errors.join(', ') : ''));
        clearSelection();
        loadTasks();
      } catch (e) { alert('Bulk remove tag failed: ' + e.message); }
    }

    // Init
    // Init
    loadTasks();
    connectSSE();
  </script>
</body>
</html>`;
}
