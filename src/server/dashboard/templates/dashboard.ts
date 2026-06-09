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

    .archived-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text); font-size: 13px; cursor: pointer; transition: all 0.2s; flex: none; }
    .archived-toggle:hover { border-color: var(--accent); }
    .archived-toggle.active { background: rgba(108,92,231,0.15); border-color: var(--accent); color: var(--accent); }
    tr.archived-row { opacity: 0.55; }
    tr.archived-row:hover { opacity: 0.8; }
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
    .dep-item {
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dep-item:last-child { border-bottom: none; }
    .dep-arrow { color: var(--text-dim); font-size: 12px; }
    .dep-status { font-size: 12px; }
    .time-entry-item {
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .time-entry-item:last-child { border-bottom: none; }
    .time-entry-duration { font-size: 12px; font-weight: 600; color: var(--accent); }
    .time-entry-meta { font-size: 11px; color: var(--text-dim); }
    .time-entry-active { color: var(--green); }
    .watcher-item {
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .watcher-item:last-child { border-bottom: none; }
    .link-item {
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .link-item:last-child { border-bottom: none; }
    .link-item a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 500;
    }
    .link-item a:hover { text-decoration: underline; }
    .link-meta { font-size: 11px; color: var(--text-dim); margin-left: auto; }
    .global-activity-item {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .global-activity-item:last-child { border-bottom: none; }
    .global-activity-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
    .global-activity-body { flex: 1; min-width: 0; }
    .global-activity-text { line-height: 1.4; }
    .global-activity-text strong { color: var(--text); }
    .global-activity-meta { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .global-activity-task { color: var(--accent); text-decoration: none; font-weight: 500; }
    .global-activity-task:hover { text-decoration: underline; }
    .global-activity-empty { padding: 40px; text-align: center; color: var(--text-dim); font-size: 13px; }

    .audit-log-filters { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
    .audit-log-filters select, .audit-log-filters input { font-size: 12px; padding: 4px 8px; background: var(--bg-input); color: var(--text); border: 1px solid var(--border); border-radius: 4px; }
    .audit-log-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
    .audit-log-item:last-child { border-bottom: none; }
    .audit-log-icon { font-size: 16px; width: 24px; text-align: center; flex-shrink: 0; }
    .audit-log-body { flex: 1; min-width: 0; }
    .audit-log-text { color: var(--text); }
    .audit-log-text strong { color: var(--accent); }
    .audit-log-meta { color: var(--text-dim); font-size: 11px; margin-top: 2px; }
    .audit-log-meta a { color: var(--accent); text-decoration: none; }
    .audit-log-meta a:hover { text-decoration: underline; }
    .audit-log-empty { color: var(--text-dim); text-align: center; padding: 40px 0; font-size: 13px; }
    .audit-log-count { color: var(--text-dim); font-size: 12px; margin-bottom: 8px; }

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

    /* Analytics view */
    .view-tabs { display: flex; gap: 0; margin: 0; }
    .view-tab { padding: 8px 20px; cursor: pointer; font-size: 13px; font-weight: 500;
      color: var(--text-dim); border-bottom: 2px solid transparent; transition: all 0.15s;
      background: transparent; border-top: none; border-left: none; border-right: none; }
    .view-tab:hover { color: var(--text); }
    .view-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    .view-panel { display: none; }
    .view-panel.active { display: block; }
    .analytics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; padding: 16px 0; }
    .chart-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
    .chart-card h3 { font-size: 14px; font-weight: 600; margin-bottom: 14px; color: var(--text); }
    /* Kanban board view */
    .kanban-board { display: flex; gap: 12px; padding: 16px 0; overflow-x: auto; min-height: 400px; }
    .kanban-column { flex: 1; min-width: 220px; max-width: 320px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; display: flex; flex-direction: column; }
    .kanban-column-header { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
    .kanban-column-title { font-size: 13px; font-weight: 600; color: var(--text); }
    .kanban-column-count { font-size: 11px; color: var(--text-dim); background: var(--bg); padding: 2px 8px; border-radius: 10px; }
    .kanban-column-body { flex: 1; padding: 8px; overflow-y: auto; max-height: 500px; display: flex; flex-direction: column; gap: 6px; }
    .kanban-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; cursor: pointer; transition: border-color 0.15s; }
    .kanban-card:hover { border-color: var(--accent); }
    .kanban-card-id { font-size: 10px; color: var(--text-dim); font-family: monospace; margin-bottom: 4px; }
    .kanban-card-command { font-size: 12px; color: var(--text); line-height: 1.4; word-break: break-word; }
    .kanban-card-meta { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
    .kanban-card-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(108,92,231,0.15); color: var(--accent); }
    .kanban-card-priority { font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
    .kanban-card-priority.urgent { background: rgba(255,71,87,0.15); color: var(--red); }
    .kanban-card-priority.high { background: rgba(255,99,72,0.15); color: var(--orange); }
    .kanban-card-priority.normal { background: rgba(30,144,255,0.15); color: var(--blue); }
    .kanban-card-priority.low { background: rgba(139,143,163,0.15); color: var(--text-dim); }
    .kanban-card-due { font-size: 10px; color: var(--red); }
    .kanban-card-pinned { font-size: 10px; color: var(--yellow); }
    .kanban-empty { text-align: center; color: var(--text-dim); font-size: 12px; padding: 20px; }

    .bar-chart { display: flex; flex-direction: column; gap: 6px; }
    .bar-row { display: flex; align-items: center; gap: 8px; }
    .bar-label { width: 80px; font-size: 11px; color: var(--text-dim); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { flex: 1; height: 22px; background: var(--bg); border-radius: 4px; overflow: hidden; position: relative; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; min-width: 2px; }
    .bar-fill.pending { background: #f59e0b; }
    .bar-fill.picked { background: #8b5cf6; }
    .bar-fill.running { background: #3b82f6; }
    .bar-fill.done { background: #22c55e; }
    .bar-fill.failed { background: #ef4444; }
    .bar-fill.created { background: #3b82f6; }
    .bar-fill.completed { background: #22c55e; }
    .bar-fill.urgent { background: #ef4444; }
    .bar-fill.high { background: #f59e0b; }
    .bar-fill.normal { background: #3b82f6; }
    .bar-fill.low { background: #6b7280; }
    .bar-value { width: 40px; font-size: 12px; font-weight: 600; color: var(--text); }
    .trend-chart { display: flex; align-items: flex-end; gap: 2px; height: 120px; padding: 0 4px; }
    .trend-bar { flex: 1; border-radius: 3px 3px 0 0; transition: height 0.3s ease; min-width: 4px; cursor: default; position: relative; }
    .trend-bar.created { background: var(--accent); opacity: 0.85; }
    .trend-bar.completed { background: #22c55e; opacity: 0.85; }
    .trend-bar:hover { opacity: 1; }
    .trend-labels { display: flex; justify-content: space-between; padding: 4px 4px 0; }
    .trend-labels span { font-size: 10px; color: var(--text-dim); }
    .stat-metric { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .metric-card { background: var(--bg); border-radius: 8px; padding: 12px; text-align: center; }
    .metric-value { font-size: 22px; font-weight: 700; color: var(--accent); }
    .metric-label { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .chart-empty { color: var(--text-dim); font-size: 13px; text-align: center; padding: 30px 0; }
    .analytics-loading { color: var(--text-dim); font-size: 13px; text-align: center; padding: 40px 0; }

    /* Settings view */
    .settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; padding: 16px 0; }
    .settings-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
    .settings-card h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text); }
    .settings-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .settings-table th { text-align: left; padding: 6px 8px; color: var(--text-dim); border-bottom: 1px solid var(--border); font-weight: 500; }
    .settings-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
    .settings-table tr:hover td { background: var(--bg-hover); }
    .settings-table .id-cell { font-family: monospace; font-size: 11px; color: var(--text-dim); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .settings-empty { color: var(--text-dim); font-size: 12px; font-style: italic; padding: 12px 0; }
    .settings-form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; padding: 12px; background: var(--bg); border-radius: 8px; display: none; }
    .settings-form.open { display: flex; }
    .settings-form input, .settings-form select { background: var(--bg-card); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 6px; font-size: 12px; outline: none; }
    .settings-form input:focus, .settings-form select:focus { border-color: var(--accent); }
    .settings-form-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .role-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
    .role-admin { background: rgba(255,71,87,0.15); color: var(--red); }
    .role-operator { background: rgba(30,144,255,0.15); color: var(--blue); }
    .role-viewer { background: rgba(139,143,163,0.15); color: var(--text-dim); }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ Harness Remote</h1>
    <nav class="view-tabs" id="viewTabs">
      <button class="view-tab active" onclick="switchView('tasks')">📋 Tasks</button>
      <button class="view-tab" onclick="switchView('analytics')">📊 Analytics</button>
      <button class="view-tab" onclick="switchView('kanban')">📌 Kanban</button>
      <button class="view-tab" onclick="switchView('activity')">🔄 Activity</button>
      <button class="view-tab" onclick="switchView('audit')">📜 Audit</button>
      <button class="view-tab" onclick="switchView('settings')">⚙️ Settings</button>
    </nav>
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
    <div class="view-panel active" id="tasksView">
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

      <button class=\"archived-toggle\" id=\"archivedToggle\" onclick=\"toggleArchived()\">&#128230; Archived</button>
    <div id="taskList"><div class="loading">Loading...</div></div>

    <!-- Bulk actions bar -->
    <div class="bulk-bar" id="bulkBar">
      <span class="bulk-count" id="bulkCount">0 selected</span>
      <div class="bulk-actions" id="bulkActionsActive">
        <button class="btn-sm green" onclick="bulkAction('done')">✅ Mark Done</button>
        <button class="btn-sm orange" onclick="bulkAction('running')">▶ Start</button>
        <button class="btn-sm red" onclick="bulkAction('failed')">❌ Mark Failed</button>
        <button class="btn-sm blue" onclick="bulkAssign()">💻 Assign Device</button>
        <button class="btn-sm blue" onclick="bulkAddTags()">🏷️ Add Tags</button>
        <button class="btn-sm orange" onclick="bulkRemoveTag()">🏷️ Remove Tag</button>
        <button class="btn-sm purple" onclick="bulkArchive()">📦 Archive</button>
        <button class="btn-sm orange" onclick="bulkUnarchive()">📤 Unarchive</button>
        <button class="btn-sm red" onclick="bulkDelete()">🗑️ Delete</button>
        <button class="btn-sm" onclick="clearSelection()">✕ Clear</button>
      </div>
    </div>
    </div><!-- /tasksView -->

    <!-- Analytics view -->
    <div class="view-panel" id="analyticsView">
      <div id="analyticsContent"><div class="analytics-loading">Loading analytics...</div></div>
    </div>

    <!-- Kanban view -->
    <div class="view-panel" id="kanbanView">
      <div id="kanbanContent"><div class="kanban-empty">Loading kanban board...</div></div>
    </div>

    <!-- Activity view -->
    <div class="view-panel" id="activityView">
      <div id="activityContent"><div class="global-activity-empty">Loading activity feed...</div></div>
    </div>

    <!-- Audit log view -->
    <div class="view-panel" id="auditView">
      <div style="padding:16px 0">
        <div class="audit-log-filters">
          <select id="auditActionFilter">
            <option value="">All Actions</option>
            <option value="task.created">Task Created</option>
            <option value="task.status_changed">Status Changed</option>
            <option value="task.assigned">Task Assigned</option>
            <option value="task.archived">Task Archived</option>
            <option value="task.reopened">Task Reopened</option>
            <option value="task.pinned">Task Pinned</option>
            <option value="task.link_added">Link Added</option>
            <option value="task.link_removed">Link Removed</option>
            <option value="comment.added">Comment Added</option>
            <option value="note.added">Note Added</option>
            <option value="subtask.created">Subtask Created</option>
            <option value="subtask.completed">Subtask Completed</option>
            <option value="sla.breach">SLA Breach</option>
            <option value="sla.warning">SLA Warning</option>
          </select>
          <select id="auditActorTypeFilter">
            <option value="">All Actors</option>
            <option value="feishu">Feishu</option>
            <option value="device">Device</option>
            <option value="api">API</option>
            <option value="system">System</option>
          </select>
          <input id="auditActorFilter" type="text" placeholder="Actor ID..." style="max-width:160px" />
          <input id="auditDateFrom" type="date" title="From date" />
          <input id="auditDateTo" type="date" title="To date" />
          <button class="btn btn-outline" onclick="loadAuditLog()">🔍 Filter</button>
        </div>
        <div class="audit-log-count" id="auditCount"></div>
        <div id="auditContent"><div class="audit-log-empty">Loading audit log...</div></div>
      </div>
    </div>

    <!-- Settings view -->
    <div class="view-panel" id="settingsView">
      <div class="settings-grid">
        <div class="settings-card">
          <h3>👥 Users</h3>
          <div id="settingsUsers"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateUserModal()">+ Add User</button>
          </div>
          <div class="settings-form" id="createUserForm">
            <input id="newUsername" placeholder="Username" />
            <select id="newUserRole"><option value="viewer">Viewer</option><option value="operator">Operator</option><option value="admin">Admin</option></select>
            <input id="newUserFeishu" placeholder="Feishu User ID (optional)" />
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createUserForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateUser()">Create</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>💻 Devices</h3>
          <div id="settingsDevices"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openRegisterDeviceModal()">+ Register Device</button>
          </div>
          <div class="settings-form" id="registerDeviceForm">
            <input id="newDeviceName" placeholder="Device name" />
            <input id="newDeviceCaps" placeholder="Capabilities (optional)" />
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('registerDeviceForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitRegisterDevice()">Register</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>🔔 Webhooks</h3>
          <div id="settingsWebhooks"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateWebhookModal()">+ Add Webhook</button>
          </div>
          <div class="settings-form" id="createWebhookForm">
            <input id="newWebhookUrl" placeholder="Callback URL" />
            <input id="newWebhookEvents" placeholder="Events (comma-separated, e.g. task.created,task.status_changed)" />
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createWebhookForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateWebhook()">Create</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>📋 Templates</h3>
          <div id="settingsTemplates"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateTemplateModal()">+ Add Template</button>
          </div>
          <div class="settings-form" id="createTemplateForm">
            <input id="newTemplateName" placeholder="Template name" />
            <textarea id="newTemplateCmd" placeholder="Command text" rows="2" style="width:100%;background:var(--bg-card);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:6px;font-size:12px;outline:none;font-family:inherit;resize:vertical"></textarea>
            <select id="newTemplatePriority"><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="high">High</option><option value="low">Low</option></select>
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createTemplateForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateTemplate()">Create</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>⏱️ Scheduled Tasks</h3>
          <div id="settingsScheduled"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateScheduledModal()">+ Add Schedule</button>
          </div>
          <div class="settings-form" id="createScheduledForm">
            <textarea id="newScheduledCmd" placeholder="Command text" rows="2" style="width:100%;background:var(--bg-card);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:6px;font-size:12px;outline:none;font-family:inherit;resize:vertical"></textarea>
            <select id="newScheduledFreq"><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createScheduledForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateScheduled()">Create</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>📏 SLA Policies</h3>
          <div id="settingsSla"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateSlaModal()">+ Add Policy</button>
          </div>
          <div class="settings-form" id="createSlaForm">
            <input id="newSlaName" placeholder="Policy name" />
            <input id="newSlaTarget" type="number" placeholder="Target resolution time (minutes)" />
            <input id="newSlaWarning" type="number" placeholder="Warning threshold % (default: 80)" />
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createSlaForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateSla()">Create</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>👁️ Saved Views</h3>
          <div id="settingsSavedViews"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateSavedViewModal()">+ Add View</button>
          </div>
          <div class="settings-form" id="createSavedViewForm">
            <input id="newSavedViewName" placeholder="View name" />
            <input id="newSavedViewFilters" placeholder='Filters JSON (e.g. {"status":"pending"})' />
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createSavedViewForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateSavedView()">Create</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>📦 Modules (Epics)</h3>
          <div id="settingsModules"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateModuleModal()">+ Add Module</button>
          </div>
          <div class="settings-form" id="createModuleForm">
            <input id="newModuleName" placeholder="Module name" />
            <input id="newModuleDescription" placeholder="Description (optional)" />
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createModuleForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateModule()">Create</button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

        <div class="settings-card">
          <h3>🔄 Cycles (Sprints)</h3>
          <div id="settingsCycles"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateCycleModal()">+ Add Cycle</button>
          </div>
          <div class="settings-form" id="createCycleForm">
            <input id="newCycleName" placeholder="Cycle name (e.g. Sprint 1)" />
            <input id="newCycleDescription" placeholder="Description (optional)" />
            <input id="newCycleStart" type="date" />
            <input id="newCycleEnd" type="date" />
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createCycleForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateCycle()">Create</button>
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
    let showArchived = false;
    let archivedTasks = [];
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


    async function loadArchivedTasks() {
      try {
        const data = await apiFetch('/api/tasks/archived?limit=500');
        archivedTasks = data.tasks || [];
        allTags = new Set();
        archivedTasks.forEach(t => {
          if (t.tags) t.tags.forEach(tag => allTags.add(tag));
        });
        renderStats();
        renderTasks();
      } catch (e) {
        document.getElementById('taskList').innerHTML =
          '<div class=\"empty\">Failed to load archived tasks: ' + escapeHtml(e.message) + '</div>';
      }
    }

    function toggleArchived() {
      showArchived = !showArchived;
      const btn = document.getElementById('archivedToggle');
      btn.classList.toggle('active', showArchived);
      currentFilter = '';
      currentPriorityFilter = '';
      searchQuery = '';
      tagQuery = '';
      document.getElementById('search').value = '';
      document.getElementById('statusFilter').value = '';
      document.getElementById('priorityFilter').value = '';
      document.getElementById('tagFilter').value = '';
      document.getElementById('bulkActionsActive').style.display = showArchived ? 'none' : '';
      document.getElementById('bulkActionsArchived').style.display = showArchived ? '' : 'none';
      if (showArchived) {
        loadArchivedTasks();
      } else {
        loadTasks();
      }
    }

    function renderStats() {
      const counts = { pending: 0, picked: 0, running: 0, done: 0, failed: 0 };
      const _tasks = showArchived ? archivedTasks : allTasks;
      _tasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
      const total = _tasks.length;
      const _pfx = showArchived ? '&#128230; ' : '';

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
      if (showArchived) {
        document.title = '&#128230; Archived (' + total + ') - Harness Remote';
      } else {
      const active = counts.pending + counts.picked + counts.running;
      document.title = (active > 0 ? '(' + active + ') ' : '') + 'Harness Remote - Task Dashboard';
    }
      }

    function renderTasks() {
      let filtered = showArchived ? archivedTasks : allTasks;

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
        const _acls = showArchived ? ' archived-row' : '';
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
        html += '<button class=\"btn-sm blue\" onclick=\"taskCloneAndEdit(\\'' + t.id + '\\')\">📝 Clone & Edit</button>';
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
        loadDependencies(id);
        loadTimeEntries(id);
        loadWatchers(id);
        loadNotes(id);
        loadRelationships(id);
        loadLinks(id);
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

    async function loadDependencies(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/dependencies');
        const deps = data.dependencies || data.blockedBy || [];
        const section = document.createElement('div');
        section.className = 'detail-section';
        if (deps.length === 0) {
          section.innerHTML = '<div class="detail-section-header">🔗 Dependencies (0)</div><div class="detail-section-body"><div class="no-data">No dependencies</div></div>';
        } else {
          section.innerHTML = '<div class="detail-section-header">🔗 Dependencies (' + deps.length + ')</div>' +
            '<div class="detail-section-body">' +
            deps.map(d =>
              '<div class="dep-item">' +
                '<span class="badge badge-' + (d.dependsOnStatus || d.status || 'pending') + '">' + (d.dependsOnStatus || d.status || 'pending') + '</span>' +
                '<span style="flex:1;font-size:13px">' + escapeHtml(d.dependsOnTitle || d.title || d.dependsOnId || d.id) + '</span>' +
                '<span class="dep-arrow">' + escapeHtml(d.type || 'blocks') + '</span>' +
              '</div>'
            ).join('') +
            '</div>';
        }
        document.getElementById('detailBody').appendChild(section);
      } catch { /* dependencies endpoint may not exist */ }
    }

    async function loadTimeEntries(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/time-entries');
        const entries = data.entries || data.timeEntries || [];
        const section = document.createElement('div');
        section.className = 'detail-section';
        if (entries.length === 0) {
          section.innerHTML = '<div class="detail-section-header">⏱️ Time Tracking (0)</div><div class="detail-section-body"><div class="no-data">No time entries</div></div>';
        } else {
          const totalMin = entries.reduce((s, e) => s + (e.durationMinutes || 0), 0);
          const hrs = Math.floor(totalMin / 60);
          const mins = totalMin % 60;
          section.innerHTML = '<div class="detail-section-header">⏱️ Time Tracking (' + entries.length + ' · ' + (hrs > 0 ? hrs + 'h ' : '') + mins + 'm total)</div>' +
            '<div class="detail-section-body">' +
            entries.slice(0, 10).map(e =>
              '<div class="time-entry-item">' +
                '<div>' +
                  '<div style="font-size:13px">' + escapeHtml(e.description || 'No description') + '</div>' +
                  '<div class="time-entry-meta">' + escapeHtml(e.user || e.userId || 'unknown') + ' · ' + formatTime(e.startedAt) +
                    (e.endedAt ? ' → ' + formatTime(e.endedAt) : ' <span class="time-entry-active">● active</span>') +
                  '</div>' +
                '</div>' +
                '<div class="time-entry-duration">' + (e.durationMinutes || 0) + 'm</div>' +
              '</div>'
            ).join('') +
            (entries.length > 10 ? '<div class="no-data">...and ' + (entries.length - 10) + ' more</div>' : '') +
            '</div>';
        }
        document.getElementById('detailBody').appendChild(section);
      } catch { /* time-entries endpoint may not exist */ }
    }

    async function loadWatchers(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/watchers');
        const watchers = data.watchers || [];
        const section = document.createElement('div');
        section.className = 'detail-section';
        if (watchers.length === 0) {
          section.innerHTML = '<div class="detail-section-header">👁️ Watchers (0)</div><div class="detail-section-body"><div class="no-data">No watchers</div></div>';
        } else {
          section.innerHTML = '<div class="detail-section-header">👁️ Watchers (' + watchers.length + ')</div>' +
            '<div class="detail-section-body">' +
            watchers.map(w =>
              '<div class="watcher-item">👤 ' + escapeHtml(w.username || w.userId || w.id) +
                (w.addedAt ? ' <span class="time-entry-meta">· ' + formatTime(w.addedAt) + '</span>' : '') +
              '</div>'
            ).join('') +
            '</div>';
        }
        document.getElementById('detailBody').appendChild(section);
      } catch { /* watchers endpoint may not exist */ }
    }

    async function loadNotes(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/notes');
        const notes = data.notes || [];
        const section = document.createElement('div');
        section.className = 'detail-section';
        if (notes.length === 0) {
          section.innerHTML = '<div class="detail-section-header">📝 Notes (0)</div><div class="detail-section-body"><div class="no-data">No notes</div></div>';
        } else {
          section.innerHTML = '<div class="detail-section-header">📝 Notes (' + notes.length + ')</div>' +
            '<div class="detail-section-body">' +
            notes.map(n =>
              '<div class="comment-item">' +
                '<div class="comment-meta">' + escapeHtml(n.author) + ' · ' + formatTime(n.createdAt) + '</div>' +
                '<div class="comment-body">' + escapeHtml(n.body) + '</div>' +
              '</div>'
            ).join('') +
            '</div>';
        }
        document.getElementById('detailBody').appendChild(section);
      } catch { /* notes endpoint may not exist */ }
    }

    async function loadRelationships(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/relationships');
        const rels = data.relationships || [];
        const section = document.createElement('div');
        section.className = 'detail-section';
        if (rels.length === 0) {
          section.innerHTML = '<div class="detail-section-header">🔀 Relationships (0)</div><div class="detail-section-body"><div class="no-data">No relationships</div></div>';
        } else {
          const typeLabels = { depends_on: '⬇️ depends on', blocks: '🚫 blocks', relates_to: '🔗 relates to', duplicates: '📋 duplicates' };
          section.innerHTML = '<div class="detail-section-header">🔀 Relationships (' + rels.length + ')</div>' +
            '<div class="detail-section-body">' +
            rels.map(r =>
              '<div class="dep-item">' +
                '<span style="font-size:12px;color:var(--text-dim)">' + (typeLabels[r.relationshipType] || r.relationshipType) + '</span>' +
                '<span style="flex:1;font-size:13px">' + escapeHtml(r.relatedTaskId) + '</span>' +
                '<span style="font-size:11px;color:var(--text-dim)">' + formatTime(r.createdAt) + '</span>' +
              '</div>'
            ).join('') +
            '</div>';
        }
        document.getElementById('detailBody').appendChild(section);
      } catch { /* relationships endpoint may not exist */ }
    }

    async function loadLinks(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/links');
        const links = data.links || [];
        const section = document.createElement('div');
        section.className = 'detail-section';
        if (links.length === 0) {
          section.innerHTML = '<div class="detail-section-header">🔗 Links (0)</div><div class="detail-section-body"><div class="no-data">No external links</div></div>';
        } else {
          section.innerHTML = '<div class="detail-section-header">🔗 Links (' + links.length + ')</div>' +
            '<div class="detail-section-body">' +
            links.map(l =>
              '<div class="link-item">' +
                '<span>📄</span>' +
                '<a href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener">' + escapeHtml(l.title || l.url) + '</a>' +
                '<span class="link-meta">' + escapeHtml(l.addedBy || 'unknown') + ' · ' + formatTime(l.createdAt) + '</span>' +
              '</div>'
            ).join('') +
            '</div>';
        }
        document.getElementById('detailBody').appendChild(section);
      } catch { /* links endpoint may not exist */ }
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
    async function taskCloneAndEdit(id) {
      try {
        const data = await apiFetch('/api/tasks/' + id);
        const t = data.task;
        if (!t) return;
        // Set modal title to indicate clone mode
        document.querySelector('#createModal .modal-header h2').textContent = 'Clone & Edit Task';
        // Pre-fill form fields
        document.getElementById('createCommand').value = t.commandText || '';
        document.getElementById('createDescription').value = t.description || '';
        document.getElementById('createPriority').value = t.priority || 'normal';
        document.getElementById('createTags').value = (t.tags || []).join(', ');
        document.getElementById('createDevice').value = t.assignedDeviceId || '';
        document.getElementById('createDueDate').value = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 16) : '';
        // Show modal
        document.getElementById('createModal').classList.add('open');
        document.getElementById('createCommand').focus();
        // Close the detail panel
        closeDetail();
      } catch (e) { alert('Failed to load task for cloning: ' + e.message); }
    }

    // Create task modal
    function openCreateModal() {
      document.querySelector('#createModal .modal-header h2').textContent = 'Create Task';
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

    async function bulkArchive() {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      if (!confirm('Archive ' + ids.length + ' task(s)? They will be hidden from the active view.')) return;
      try {
        const data = await apiFetch('/api/tasks/bulk/archive', {
          method: 'POST',
          body: JSON.stringify({ ids }),
        });
        alert('Archived ' + (data.archived || 0) + ' task(s)' + (data.errors && data.errors.length ? '\nErrors: ' + data.errors.join(', ') : ''));
        clearSelection();
        loadTasks();
      } catch (e) { alert('Bulk archive failed: ' + e.message); }
    }

    async function bulkUnarchive() {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      if (!confirm('Restore ' + ids.length + ' archived task(s)?')) return;
      try {
        const data = await apiFetch('/api/tasks/bulk/unarchive', {
          method: 'POST',
          body: JSON.stringify({ ids }),
        });
        alert('Restored ' + (data.restored || 0) + ' task(s)' + (data.errors && data.errors.length ? '\nErrors: ' + data.errors.join(', ') : ''));
        clearSelection();
        loadTasks();
      } catch (e) { alert('Bulk unarchive failed: ' + e.message); }
    }


    // Settings/Management
    async function loadSettings() {
      loadSettingsUsers();
      loadSettingsDevices();
      loadSettingsWebhooks();
      loadSettingsTemplates();
      loadSettingsScheduled();
      loadSettingsSla();
      loadSettingsSavedViews();
      loadSettingsModules();
      loadSettingsCycles();
    }

    // Users
    async function loadSettingsUsers() {
      const el = document.getElementById('settingsUsers');
      try {
        const data = await apiFetch('/api/users');
        const users = data.users || [];
        if (users.length === 0) { el.innerHTML = '<div class="settings-empty">No users configured</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>Username</th><th>Role</th><th>Feishu ID</th><th>Actions</th></tr></thead><tbody>';
        users.forEach(u => {
          html += '<tr><td>' + escapeHtml(u.username) + '</td><td><span class="role-badge role-' + u.role + '">' + u.role + '</span></td><td class="id-cell">' + escapeHtml(u.feishuUserId || '—') + '</td><td>';
          html += '<button class="btn-sm" onclick="regenerateUserToken(\'' + u.id + '\')">🔑</button> ';
          html += '<button class="btn-sm red" onclick="deleteUser(\'' + u.id + '\',\'' + escapeHtml(u.username) + '\')">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openCreateUserModal() {
      const form = document.getElementById('createUserForm');
      form.classList.toggle('open');
    }

    async function submitCreateUser() {
      const username = document.getElementById('newUsername').value.trim();
      const role = document.getElementById('newUserRole').value;
      const feishuUserId = document.getElementById('newUserFeishu').value.trim();
      if (!username) { alert('Username is required'); return; }
      try {
        const body = { username, role };
        if (feishuUserId) body.feishuUserId = feishuUserId;
        const data = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(body) });
        alert('User created! Token: ' + data.user.token);
        document.getElementById('createUserForm').classList.remove('open');
        document.getElementById('newUsername').value = '';
        document.getElementById('newUserFeishu').value = '';
        loadSettingsUsers();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function deleteUser(id, name) {
      if (!confirm('Delete user "' + name + '"?')) return;
      try {
        await apiFetch('/api/users/' + id, { method: 'DELETE' });
        loadSettingsUsers();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function regenerateUserToken(id) {
      if (!confirm('Regenerate token for this user? The old token will stop working.')) return;
      try {
        const data = await apiFetch('/api/users/' + id + '/token/regenerate', { method: 'POST' });
        alert('New token: ' + data.user.token);
      } catch (e) { alert('Failed: ' + e.message); }
    }

    // Devices
    async function loadSettingsDevices() {
      const el = document.getElementById('settingsDevices');
      try {
        const data = await apiFetch('/api/devices');
        const devices = data.devices || [];
        if (devices.length === 0) { el.innerHTML = '<div class="settings-empty">No devices registered</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>Name</th><th>ID</th><th>Capabilities</th><th>Last Seen</th><th>Actions</th></tr></thead><tbody>';
        devices.forEach(d => {
          html += '<tr><td>' + escapeHtml(d.name) + '</td><td class="id-cell">' + escapeHtml(d.id) + '</td><td>' + escapeHtml(d.capabilities || '—') + '</td><td>' + (d.lastSeen ? formatTime(d.lastSeen) : 'Never') + '</td><td>';
          html += '<button class="btn-sm red" onclick="deleteDevice(\'' + d.id + '\',\'' + escapeHtml(d.name) + '\')">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openRegisterDeviceModal() {
      document.getElementById('registerDeviceForm').classList.toggle('open');
    }

    async function submitRegisterDevice() {
      const name = document.getElementById('newDeviceName').value.trim();
      const caps = document.getElementById('newDeviceCaps').value.trim();
      if (!name) { alert('Device name is required'); return; }
      try {
        const body = { name };
        if (caps) body.capabilities = caps;
        const data = await apiFetch('/api/devices', { method: 'POST', body: JSON.stringify(body) });
        alert('Device registered! Token: ' + data.device.token);
        document.getElementById('registerDeviceForm').classList.remove('open');
        document.getElementById('newDeviceName').value = '';
        document.getElementById('newDeviceCaps').value = '';
        loadSettingsDevices();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function deleteDevice(id, name) {
      if (!confirm('Delete device "' + name + '"?')) return;
      try {
        await apiFetch('/api/devices/' + id, { method: 'DELETE' });
        loadSettingsDevices();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    // Webhooks
    async function loadSettingsWebhooks() {
      const el = document.getElementById('settingsWebhooks');
      try {
        const data = await apiFetch('/api/webhooks');
        const webhooks = data.webhooks || [];
        if (webhooks.length === 0) { el.innerHTML = '<div class="settings-empty">No webhooks configured</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>URL</th><th>Events</th><th>Enabled</th><th>Actions</th></tr></thead><tbody>';
        webhooks.forEach(w => {
          html += '<tr><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(w.url) + '">' + escapeHtml(w.url) + '</td><td>' + (w.events || []).join(', ') + '</td><td>' + (w.enabled ? '✅' : '❌') + '</td><td>';
          html += '<button class="btn-sm red" onclick="deleteWebhook(\'' + w.id + '\')">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openCreateWebhookModal() {
      document.getElementById('createWebhookForm').classList.toggle('open');
    }

    async function submitCreateWebhook() {
      const url = document.getElementById('newWebhookUrl').value.trim();
      const eventsStr = document.getElementById('newWebhookEvents').value.trim();
      if (!url) { alert('URL is required'); return; }
      const events = eventsStr ? eventsStr.split(',').map(e => e.trim()).filter(Boolean) : ['task.created', 'task.status_changed'];
      try {
        await apiFetch('/api/webhooks', { method: 'POST', body: JSON.stringify({ url, events }) });
        document.getElementById('createWebhookForm').classList.remove('open');
        document.getElementById('newWebhookUrl').value = '';
        document.getElementById('newWebhookEvents').value = '';
        loadSettingsWebhooks();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function deleteWebhook(id) {
      if (!confirm('Delete this webhook?')) return;
      try {
        await apiFetch('/api/webhooks/' + id, { method: 'DELETE' });
        loadSettingsWebhooks();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    // Templates
    async function loadSettingsTemplates() {
      const el = document.getElementById('settingsTemplates');
      try {
        const data = await apiFetch('/api/templates');
        const templates = data.templates || [];
        if (templates.length === 0) { el.innerHTML = '<div class="settings-empty">No templates created</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>Name</th><th>Command</th><th>Priority</th><th>Actions</th></tr></thead><tbody>';
        templates.forEach(t => {
          html += '<tr><td>' + escapeHtml(t.name) + '</td><td title="' + escapeHtml(t.commandText) + '">' + escapeHtml(t.commandText.slice(0, 40)) + (t.commandText.length > 40 ? '...' : '') + '</td><td>' + (t.priority || 'normal') + '</td><td>';
          html += '<button class="btn-sm red" onclick="deleteTemplate(\'' + t.id + '\')">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openCreateTemplateModal() {
      document.getElementById('createTemplateForm').classList.toggle('open');
    }

    async function submitCreateTemplate() {
      const name = document.getElementById('newTemplateName').value.trim();
      const cmd = document.getElementById('newTemplateCmd').value.trim();
      const priority = document.getElementById('newTemplatePriority').value;
      if (!name || !cmd) { alert('Name and command are required'); return; }
      try {
        await apiFetch('/api/templates', { method: 'POST', body: JSON.stringify({ name, commandText: cmd, priority }) });
        document.getElementById('createTemplateForm').classList.remove('open');
        document.getElementById('newTemplateName').value = '';
        document.getElementById('newTemplateCmd').value = '';
        loadSettingsTemplates();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function deleteTemplate(id) {
      if (!confirm('Delete this template?')) return;
      try {
        await apiFetch('/api/templates/' + id, { method: 'DELETE' });
        loadSettingsTemplates();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    // Scheduled Tasks
    async function loadSettingsScheduled() {
      const el = document.getElementById('settingsScheduled');
      try {
        const data = await apiFetch('/api/scheduled-tasks');
        const schedules = data.scheduledTasks || [];
        if (schedules.length === 0) { el.innerHTML = '<div class="settings-empty">No scheduled tasks</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>Command</th><th>Frequency</th><th>Next Run</th><th>Enabled</th><th>Actions</th></tr></thead><tbody>';
        schedules.forEach(s => {
          html += '<tr><td title="' + escapeHtml(s.commandText) + '">' + escapeHtml(s.commandText.slice(0, 30)) + (s.commandText.length > 30 ? '...' : '') + '</td><td>' + s.frequency + '</td><td>' + formatTime(s.nextRunAt) + '</td><td>' + (s.enabled ? '✅' : '❌') + '</td><td>';
          html += '<button class="btn-sm red" onclick="deleteScheduled(\'' + s.id + '\')">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openCreateScheduledModal() {
      document.getElementById('createScheduledForm').classList.toggle('open');
    }

    async function submitCreateScheduled() {
      const cmd = document.getElementById('newScheduledCmd').value.trim();
      const freq = document.getElementById('newScheduledFreq').value;
      if (!cmd) { alert('Command text is required'); return; }
      try {
        const nextRun = new Date().toISOString();
        await apiFetch('/api/scheduled-tasks', { method: 'POST', body: JSON.stringify({ commandText: cmd, frequency: freq, nextRunAt: nextRun }) });
        document.getElementById('createScheduledForm').classList.remove('open');
        document.getElementById('newScheduledCmd').value = '';
        loadSettingsScheduled();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function deleteScheduled(id) {
      if (!confirm('Delete this scheduled task?')) return;
      try {
        await apiFetch('/api/scheduled-tasks/' + id, { method: 'DELETE' });
        loadSettingsScheduled();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    // Saved Views
    async function loadSettingsSavedViews() {
      const el = document.getElementById('settingsSavedViews');
      try {
        const data = await apiFetch('/api/saved-views');
        const views = data.views || [];
        if (views.length === 0) { el.innerHTML = '<div class="settings-empty">No saved views</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>Name</th><th>Filters</th><th>By</th><th>Actions</th></tr></thead><tbody>';
        views.forEach(v => {
          const filterStr = v.filters ? JSON.stringify(v.filters) : '{}';
          html += '<tr><td>' + escapeHtml(v.name) + '</td><td class="id-cell" title="' + escapeHtml(filterStr) + '">' + escapeHtml(filterStr.slice(0, 40)) + '</td><td>' + escapeHtml(v.createdBy || '') + '</td><td>';
          html += '<button class="btn-sm red" onclick="deleteSavedView(\'' + v.id + '\')">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openCreateSavedViewModal() {
      document.getElementById('createSavedViewForm').classList.toggle('open');
    }

    async function submitCreateSavedView() {
      const name = document.getElementById('newSavedViewName').value.trim();
      const filtersStr = document.getElementById('newSavedViewFilters').value.trim();
      if (!name) { alert('View name is required'); return; }
      let filters = {};
      if (filtersStr) {
        try { filters = JSON.parse(filtersStr); } catch { alert('Invalid JSON in filters'); return; }
      }
      try {
        await apiFetch('/api/saved-views', { method: 'POST', body: JSON.stringify({ name, filters }) });
        document.getElementById('createSavedViewForm').classList.remove('open');
        document.getElementById('newSavedViewName').value = '';
        document.getElementById('newSavedViewFilters').value = '';
        loadSettingsSavedViews();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function deleteSavedView(id) {
      if (!confirm('Delete this saved view?')) return;
      try {
        await apiFetch('/api/saved-views/' + id, { method: 'DELETE' });
        loadSettingsSavedViews();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    // Modules (Epics)
    async function loadSettingsModules() {
      const el = document.getElementById('settingsModules');
      try {
        const data = await apiFetch('/api/modules');
        const modules = data.modules || [];
        if (modules.length === 0) { el.innerHTML = '<div class="settings-empty">No modules</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>Name</th><th>Status</th><th>Tasks</th><th>Actions</th></tr></thead><tbody>';
        modules.forEach(m => {
          html += '<tr><td>' + escapeHtml(m.name) + '</td><td>' + escapeHtml(m.status || 'active') + '</td><td>' + (m.taskCount || 0) + '<td>';
          html += '<button class="btn-sm red" onclick="deleteModule(\'' + m.id + '\')">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openCreateModuleModal() {
      document.getElementById('createModuleForm').classList.toggle('open');
    }

    async function submitCreateModule() {
      const name = document.getElementById('newModuleName').value.trim();
      const description = document.getElementById('newModuleDescription').value.trim();
      if (!name) { alert('Module name is required'); return; }
      try {
        await apiFetch('/api/modules', { method: 'POST', body: JSON.stringify({ name, description: description || undefined }) });
        document.getElementById('createModuleForm').classList.remove('open');
        document.getElementById('newModuleName').value = '';
        document.getElementById('newModuleDescription').value = '';
        loadSettingsModules();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function deleteModule(id) {
      if (!confirm('Delete this module? Tasks will be unlinked, not deleted.')) return;
      try {
        await apiFetch('/api/modules/' + id, { method: 'DELETE' });
        loadSettingsModules();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    // Cycles (Sprints)
    async function loadSettingsCycles() {
      const el = document.getElementById('settingsCycles');
      try {
        const data = await apiFetch('/api/cycles');
        const cycles = data.cycles || [];
        if (cycles.length === 0) { el.innerHTML = '<div class="settings-empty">No cycles</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>Name</th><th>Status</th><th>Dates</th><th>Tasks</th><th>Actions</th></tr></thead><tbody>';
        cycles.forEach(c => {
          const start = c.startDate ? new Date(c.startDate).toLocaleDateString() : '—';
          const end = c.endDate ? new Date(c.endDate).toLocaleDateString() : '—';
          const statusEmoji = c.status === 'active' ? '🟢' : c.status === 'completed' ? '✅' : '🔵';
          html += '<tr><td>' + escapeHtml(c.name) + '</td><td>' + statusEmoji + ' ' + escapeHtml(c.status) + '</td><td>' + start + ' → ' + end + '</td><td>' + (c.completedTasks || 0) + '/' + (c.totalTasks || 0) + '</td><td>';
          html += '<button class="btn-sm red" onclick="deleteCycle(\'' + c.id + '\',\'' + escapeHtml(c.name) + '\')">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openCreateCycleModal() {
      document.getElementById('createCycleForm').classList.toggle('open');
    }

    async function submitCreateCycle() {
      const name = document.getElementById('newCycleName').value.trim();
      const description = document.getElementById('newCycleDescription').value.trim();
      const startDate = document.getElementById('newCycleStart').value;
      const endDate = document.getElementById('newCycleEnd').value;
      if (!name || !startDate || !endDate) { alert('Name, start date, and end date are required'); return; }
      try {
        const body = { name, startDate: startDate + 'T00:00:00.000Z', endDate: endDate + 'T23:59:59.999Z' };
        if (description) body.description = description;
        await apiFetch('/api/cycles', { method: 'POST', body: JSON.stringify(body) });
        document.getElementById('createCycleForm').classList.remove('open');
        document.getElementById('newCycleName').value = '';
        document.getElementById('newCycleDescription').value = '';
        document.getElementById('newCycleStart').value = '';
        document.getElementById('newCycleEnd').value = '';
        loadSettingsCycles();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function deleteCycle(id, name) {
      if (!confirm('Delete cycle "' + name + '"? Tasks will be unlinked, not deleted.')) return;
      try {
        await apiFetch('/api/cycles/' + id, { method: 'DELETE' });
        loadSettingsCycles();
      } catch (e) { alert('Failed: ' + e.message); }
    }

        // SLA Policies
    async function loadSettingsSla() {
      const el = document.getElementById('settingsSla');
      try {
        const data = await apiFetch('/api/sla-policies');
        const policies = data.policies || [];
        if (policies.length === 0) { el.innerHTML = '<div class="settings-empty">No SLA policies</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>Name</th><th>Target</th><th>Warning %</th><th>Priorities</th><th>Actions</th></tr></thead><tbody>';
        policies.forEach(p => {
          html += '<tr><td>' + escapeHtml(p.name) + '</td><td>' + p.targetMinutes + 'm</td><td>' + p.warningThresholdPercent + '%</td><td>' + (p.matchPriorities || []).join(', ') + '</td><td>';
          html += '<button class="btn-sm red" onclick="deleteSlaPolicy(\'' + p.id + '\')">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openCreateSlaModal() {
      document.getElementById('createSlaForm').classList.toggle('open');
    }

    async function submitCreateSla() {
      const name = document.getElementById('newSlaName').value.trim();
      const target = parseInt(document.getElementById('newSlaTarget').value, 10);
      const warning = parseInt(document.getElementById('newSlaWarning').value, 10) || 80;
      if (!name || !target) { alert('Name and target minutes are required'); return; }
      try {
        await apiFetch('/api/sla-policies', { method: 'POST', body: JSON.stringify({ name, targetMinutes: target, warningThresholdPercent: warning }) });
        document.getElementById('createSlaForm').classList.remove('open');
        document.getElementById('newSlaName').value = '';
        document.getElementById('newSlaTarget').value = '';
        loadSettingsSla();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function deleteSlaPolicy(id) {
      if (!confirm('Delete this SLA policy?')) return;
      try {
        await apiFetch('/api/sla-policies/' + id, { method: 'DELETE' });
        loadSettingsSla();
      } catch (e) { alert('Failed: ' + e.message); }
    }


    // Global activity feed
    async function loadAuditLog() {
      const container = document.getElementById('auditContent');
      const countEl = document.getElementById('auditCount');
      container.innerHTML = '<div class="audit-log-empty">Loading audit log...</div>';
      try {
        const params = new URLSearchParams();
        const action = document.getElementById('auditActionFilter').value;
        const actorType = document.getElementById('auditActorTypeFilter').value;
        const actor = document.getElementById('auditActorFilter').value.trim();
        const from = document.getElementById('auditDateFrom').value;
        const to = document.getElementById('auditDateTo').value;
        if (action) params.set('action', action);
        if (actorType) params.set('actorType', actorType);
        if (actor) params.set('actor', actor);
        if (from) params.set('from', from + 'T00:00:00Z');
        if (to) params.set('to', to + 'T23:59:59Z');
        params.set('limit', '200');
        const data = await apiFetch('/api/audit?' + params.toString());
        const entries = data.entries || [];
        countEl.textContent = entries.length + ' entries found';
        if (entries.length === 0) {
          container.innerHTML = '<div class="audit-log-empty">No audit log entries found matching your filters.</div>';
          return;
        }
        const iconMap = {
          'task.created': '📝', 'task.status_changed': '🔄', 'task.assigned': '👤',
          'task.archived': '📦', 'task.reopened': '🔁', 'task.pinned': '📌',
          'task.unpinned': '📌', 'task.command_text_changed': '✏️',
          'task.description_changed': '📝', 'task.due_date_changed': '📅',
          'task.priority_changed': '🏷️', 'task.estimated_minutes_changed': '⏱️',
          'task.reminder_changed': '🔔', 'task.link_added': '🔗', 'task.link_removed': '🔗',
          'task.note_added': '📝', 'task.relationship_added': '🔗', 'task.relationship_removed': '🔗',
          'task.locked': '🔒', 'task.unlocked': '🔓',
          'comment.added': '💬', 'comment.deleted': '💬',
          'note.added': '📝', 'note.deleted': '📝',
          'subtask.created': '📋', 'subtask.completed': '✅', 'subtask.status_changed': '🔄',
          'sla.breach': '🚨', 'sla.warning': '⚠️',
          'template.created': '📄', 'template.used': '📄',
          'webhook.created': '🔔', 'webhook.deleted': '🔔',
          'user.created': '👤', 'user.deleted': '👤', 'user.token_regenerated': '🔑',
          'device.registered': '💻', 'device.deleted': '💻',
          'api_key.created': '🔑', 'api_key.revoked': '🔑',
          'time_entry.logged': '⏱️', 'time_entry.deleted': '⏱️',
          'cycle.created': '📅', 'cycle.deleted': '📅',
          'module.created': '📦', 'module.deleted': '📦',
        };
        let html = '';
        for (const e of entries) {
          const icon = iconMap[e.action] || '📌';
          const time = formatTime(e.createdAt);
          const taskId = e.taskId
            ? '<a href="#" onclick="event.preventDefault();showDetail(\'' + e.taskId + '\')">' + escapeHtml(e.taskId.slice(0, 12)) + '...</a>'
            : '';
          const detail = e.detail ? ' - ' + escapeHtml(e.detail) : '';
          html += '<div class="audit-log-item">' +
            '<span class="audit-log-icon">' + icon + '</span>' +
            '<div class="audit-log-body">' +
              '<div class="audit-log-text"><strong>' + escapeHtml(e.action) + '</strong>' + detail + '</div>' +
              '<div class="audit-log-meta">' + escapeHtml(e.actorType + '/' + (e.actorId || 'system')) + ' &middot; ' + time +
                (taskId ? ' &middot; Task ' + taskId : '') +
              '</div>' +
            '</div>' +
          '</div>';
        }
        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = '<div class="audit-log-empty">Failed to load audit log: ' + escapeHtml(e.message) + '</div>';
      }
    }

    async function loadGlobalActivity() {
      const container = document.getElementById('activityContent');
      container.innerHTML = '<div class="global-activity-empty">Loading activity feed...</div>';
      try {
        const data = await apiFetch('/api/activity');
        const items = data.activities || [];
        if (items.length === 0) {
          container.innerHTML = '<div class="global-activity-empty">No recent activity. Tasks, comments, and status changes will appear here.</div>';
          return;
        }
        const iconMap = {
          'task.created': '📝', 'task.status_changed': '🔄', 'task.assigned': '👤',
          'task.archived': '📦', 'task.reopened': '🔁', 'task.pinned': '📌',
          'task.link_added': '🔗', 'task.link_removed': '🔗',
          'comment.added': '💬', 'note.added': '📝',
          'subtask.created': '📋', 'subtask.completed': '✅',
          'sla.breach': '🚨', 'sla.warning': '⚠️'
        };
        let html = '';
        for (const item of items) {
          const icon = iconMap[item.action] || '📌';
          const time = formatTime(item.createdAt);
          const taskLink = item.taskId
            ? '<a class="global-activity-task" href="#" onclick="event.preventDefault();showDetail(\'' + item.taskId + '\')">' + escapeHtml(item.taskId.slice(0, 12)) + '...</a>'
            : '';
          const detail = item.detail ? ' - ' + escapeHtml(item.detail) : '';
          html += '<div class="global-activity-item">' +
            '<span class="global-activity-icon">' + icon + '</span>' +
            '<div class="global-activity-body">' +
              '<div class="global-activity-text"><strong>' + escapeHtml(item.action) + '</strong>' + detail + '</div>' +
              '<div class="global-activity-meta">' + escapeHtml(item.actorType + '/' + (item.actorId || 'system')) + ' &middot; ' + time +
                (taskLink ? ' &middot; ' + taskLink : '') +
              '</div>' +
            '</div>' +
          '</div>';
        }
        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = '<div class="global-activity-empty">Failed to load activity: ' + escapeHtml(e.message) + '</div>';
      }
    }

    // Init
    // View switching
    let currentView = 'tasks';
    function switchView(view) {
      currentView = view;
      document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
      if (view === 'tasks') {
        document.querySelector('.view-tab:nth-child(1)').classList.add('active');
        document.getElementById('tasksView').classList.add('active');
      } else if (view === 'analytics') {
        document.querySelector('.view-tab:nth-child(2)').classList.add('active');
        document.getElementById('analyticsView').classList.add('active');
        loadAnalytics();
      } else if (view === 'kanban') {
        document.querySelector('.view-tab:nth-child(3)').classList.add('active');
        document.getElementById('kanbanView').classList.add('active');
        loadKanban();
      } else if (view === 'activity') {
        document.querySelector('.view-tab:nth-child(4)').classList.add('active');
        document.getElementById('activityView').classList.add('active');
        loadGlobalActivity();
      } else if (view === 'audit') {
        document.querySelector('.view-tab:nth-child(5)').classList.add('active');
        document.getElementById('auditView').classList.add('active');
        loadAuditLog();
      } else if (view === 'settings') {
        document.querySelector('.view-tab:nth-child(6)').classList.add('active');
        document.getElementById('settingsView').classList.add('active');
        loadSettings();
      }
    }


    // Kanban board
    async function loadKanban() {
      const container = document.getElementById('kanbanContent');
      container.innerHTML = '<div class="kanban-empty">Loading kanban board...</div>';
      try {
        const board = await apiFetch('/api/tasks/kanban');
        renderKanban(container, board);
      } catch (e) {
        container.innerHTML = '<div class="kanban-empty">Failed to load kanban: ' + escapeHtml(e.message) + '</div>';
      }
    }

    function renderKanban(container, board) {
      if (!board.columns || board.columns.length === 0) {
        container.innerHTML = '<div class="kanban-empty">No tasks found</div>';
        return;
      }
      const PRIORITY_CLASSES = { urgent: 'urgent', high: 'high', normal: 'normal', low: 'low' };
      let html = '<div class="kanban-board">';
      for (const col of board.columns) {
        html += '<div class="kanban-column">';
        html += '<div class="kanban-column-header">';
        html += '<span class="kanban-column-title">' + escapeHtml(col.label) + '</span>';
        html += '<span class="kanban-column-count">' + col.count + '</span>';
        html += '</div>';
        html += '<div class="kanban-column-body">';
        if (col.tasks.length === 0) {
          html += '<div class="kanban-empty">No tasks</div>';
        } else {
          for (const task of col.tasks) {
            const priClass = PRIORITY_CLASSES[task.priority] || 'normal';
            html += '<div class="kanban-card" onclick="openDetail(\'' + task.id + '\')">';
            html += '<div class="kanban-card-id">' + escapeHtml(task.id.substring(0, 16)) + '</div>';
            html += '<div class="kanban-card-command">' + escapeHtml(task.commandText.substring(0, 120)) + '</div>';
            html += '<div class="kanban-card-meta">';
            html += '<span class="kanban-card-priority ' + priClass + '">' + task.priority + '</span>';
            if (task.pinned) html += '<span class="kanban-card-pinned">📌</span>';
            if (task.dueDate) {
              const isOverdue = new Date(task.dueDate) < new Date();
              html += '<span class="kanban-card-due">' + (isOverdue ? '⚠️ ' : '') + formatTime(task.dueDate) + '</span>';
            }
            if (task.tags && task.tags.length > 0) {
              for (const tag of task.tags.slice(0, 3)) {
                html += '<span class="kanban-card-tag">' + escapeHtml(tag) + '</span>';
              }
            }
            html += '</div></div>';
          }
        }
        html += '</div></div>';
      }
      html += '</div>';
      container.innerHTML = html;
    }

    // Analytics
    async function loadAnalytics() {
      const container = document.getElementById('analyticsContent');
      container.innerHTML = '<div class="analytics-loading">Loading analytics...</div>';
      try {
        const [summary, processing, created, completed, users, timeTracking] = await Promise.all([
          apiFetch('/api/stats/summary'),
          apiFetch('/api/stats/processing').catch(() => null),
          apiFetch('/api/stats/timeseries?metric=created&interval=day').catch(() => null),
          apiFetch('/api/stats/timeseries?metric=completed&interval=day').catch(() => null),
          apiFetch('/api/stats/users').catch(() => null),
          apiFetch('/api/stats/time-tracking').catch(() => null),
        ]);
        renderAnalytics(container, summary, processing, created, completed, users, timeTracking);
      } catch (e) {
        container.innerHTML = '<div class="chart-empty">Failed to load analytics: ' + escapeHtml(e.message) + '</div>';
      }
    }

    function renderAnalytics(container, summary, processing, created, completed, users, timeTracking) {
      let html = '<div class="analytics-grid">';

      // 1. Status distribution
      html += '<div class="chart-card"><h3>📊 Task Status Distribution</h3>';
      const statusData = summary.byStatus || {};
      const statusMax = Math.max(1, ...Object.values(statusData));
      html += '<div class="bar-chart">';
      ['pending','picked','running','done','failed'].forEach(s => {
        const count = statusData[s] || 0;
        const pct = Math.round(count / statusMax * 100);
        html += '<div class="bar-row"><span class="bar-label">' + s + '</span><div class="bar-track"><div class="bar-fill ' + s + '" style="width:' + pct + '%"></div></div><span class="bar-value">' + count + '</span></div>';
      });
      html += '</div></div>';

      // 2. Priority distribution
      html += '<div class="chart-card"><h3>🏷️ Priority Distribution</h3>';
      const prioData = summary.byPriority || {};
      const prioMax = Math.max(1, ...Object.values(prioData));
      html += '<div class="bar-chart">';
      ['urgent','high','normal','low'].forEach(p => {
        const count = prioData[p] || 0;
        const pct = Math.round(count / prioMax * 100);
        html += '<div class="bar-row"><span class="bar-label">' + p + '</span><div class="bar-track"><div class="bar-fill ' + p + '" style="width:' + pct + '%"></div></div><span class="bar-value">' + count + '</span></div>';
      });
      html += '</div></div>';

      // 3. Task creation trend (last 30 days)
      html += '<div class="chart-card" style="grid-column: span 2"><h3>📈 Task Creation Trend (Last 30 Days)</h3>';
      if (created && created.dataPoints && created.dataPoints.length > 0) {
        const pts = created.dataPoints;
        const maxVal = Math.max(1, ...pts.map(p => p.value));
        html += '<div class="trend-chart">';
        pts.forEach(p => {
          const h = Math.max(2, Math.round(p.value / maxVal * 100));
          html += '<div class="trend-bar created" style="height:' + h + '%" title="' + p.bucket + ': ' + p.value + ' tasks"></div>';
        });
        html += '</div><div class="trend-labels"><span>' + (pts[0].bucket || '') + '</span><span>' + (pts[pts.length - 1].bucket || '') + '</span></div>';
      } else {
        html += '<div class="chart-empty">No data available</div>';
      }
      html += '</div>';

      // 4. Task completion trend (last 30 days)
      html += '<div class="chart-card" style="grid-column: span 2"><h3>✅ Task Completion Trend (Last 30 Days)</h3>';
      if (completed && completed.dataPoints && completed.dataPoints.length > 0) {
        const pts = completed.dataPoints;
        const maxVal = Math.max(1, ...pts.map(p => p.value));
        html += '<div class="trend-chart">';
        pts.forEach(p => {
          const h = Math.max(2, Math.round(p.value / maxVal * 100));
          html += '<div class="trend-bar completed" style="height:' + h + '%" title="' + p.bucket + ': ' + p.value + ' tasks"></div>';
        });
        html += '</div><div class="trend-labels"><span>' + (pts[0].bucket || '') + '</span><span>' + (pts[pts.length - 1].bucket || '') + '</span></div>';
      } else {
        html += '<div class="chart-empty">No data available</div>';
      }
      html += '</div>';

      // 5. Processing time metrics
      html += '<div class="chart-card"><h3>⏱️ Processing Time</h3>';
      if (processing && processing.totalCompleted > 0) {
        html += '<div class="stat-metric">';
        const metrics = [
          { label: 'Avg Duration', value: formatDuration(processing.avgDurationMs) },
          { label: 'P50 Duration', value: formatDuration(processing.p50DurationMs) },
          { label: 'P95 Duration', value: formatDuration(processing.p95DurationMs) },
          { label: 'Avg Queue Wait', value: formatDuration(processing.avgQueueWaitMs) },
          { label: 'Avg Processing', value: formatDuration(processing.avgProcessingMs) },
          { label: 'Total Done', value: (processing.byStatus && processing.byStatus.done || 0) },
          { label: 'Total Failed', value: (processing.byStatus && processing.byStatus.failed || 0) },
          { label: 'Success Rate', value: processing.totalCompleted > 0 ? Math.round((processing.byStatus && processing.byStatus.done || 0) / processing.totalCompleted * 100) + '%' : '—' },
        ];
        metrics.forEach(m => {
          html += '<div class="metric-card"><div class="metric-value">' + m.value + '</div><div class="metric-label">' + m.label + '</div></div>';
        });
        html += '</div>';
      } else {
        html += '<div class="chart-empty">No completed tasks yet</div>';
      }
      html += '</div>';

      // 6. Per-user task counts
      html += '<div class="chart-card"><h3>👥 Tasks by User</h3>';
      if (users && users.users && users.users.length > 0) {
        const userData = users.users.slice(0, 10);
        const userMax = Math.max(1, ...userData.map(u => u.total));
        html += '<div class="bar-chart">';
        userData.forEach(u => {
          const pct = Math.round(u.total / userMax * 100);
          html += '<div class="bar-row"><span class="bar-label" title="' + escapeHtml(u.userId) + '">' + escapeHtml(u.userId.slice(0, 12)) + '</span><div class="bar-track"><div class="bar-fill created" style="width:' + pct + '%"></div></div><span class="bar-value">' + u.total + '</span></div>';
        });
        html += '</div>';
      } else {
        html += '<div class="chart-empty">No user data available</div>';
      }
      html += '</div>';

      // 7. Time tracking summary
      html += '<div class="chart-card" style="grid-column: span 2"><h3>⏱️ Time Tracking Summary</h3>';
      if (timeTracking && timeTracking.totalEntries > 0) {
        html += '<div class="stat-metric">';
        const ttMetrics = [
          { label: 'Total Time', value: Math.round(timeTracking.totalMinutes / 60 * 10) / 10 + 'h' },
          { label: 'Total Entries', value: timeTracking.totalEntries },
          { label: 'Avg per Entry', value: timeTracking.avgMinutesPerEntry + 'm' },
          { label: 'Avg per Task', value: timeTracking.avgMinutesPerTask + 'm' },
          { label: 'Tasks Tracked', value: timeTracking.tasksWithEntries },
          { label: 'Active Timers', value: timeTracking.activeTimers },
        ];
        ttMetrics.forEach(m => {
          html += '<div class="metric-card"><div class="metric-value">' + m.value + '</div><div class="metric-label">' + m.label + '</div></div>';
        });
        html += '</div>';

        // Time by priority
        if (timeTracking.byPriority && Object.keys(timeTracking.byPriority).length > 0) {
          html += '<div style="margin-top:12px"><strong style="font-size:13px;color:var(--text-dim)">By Priority</strong></div>';
          html += '<div class="bar-chart" style="margin-top:8px">';
          const prioEntries = Object.entries(timeTracking.byPriority);
          const prioMax = Math.max(1, ...prioEntries.map(([, v]) => v.totalMinutes));
          prioEntries.forEach(([prio, data]) => {
            const pct = Math.round(data.totalMinutes / prioMax * 100);
            html += '<div class="bar-row"><span class="bar-label">' + prio + '</span><div class="bar-track"><div class="bar-fill ' + prio + '" style="width:' + pct + '%"></div></div><span class="bar-value">' + data.totalMinutes + 'm</span></div>';
          });
          html += '</div>';
        }

        // Time by user
        if (timeTracking.byUser && timeTracking.byUser.length > 0) {
          html += '<div style="margin-top:12px"><strong style="font-size:13px;color:var(--text-dim)">By User</strong></div>';
          html += '<div class="bar-chart" style="margin-top:8px">';
          const userMax2 = Math.max(1, ...timeTracking.byUser.map(u => u.totalMinutes));
          timeTracking.byUser.slice(0, 5).forEach(u => {
            const pct = Math.round(u.totalMinutes / userMax2 * 100);
            html += '<div class="bar-row"><span class="bar-label" title="' + escapeHtml(u.userId) + '">' + escapeHtml(u.userId.slice(0, 12)) + '</span><div class="bar-track"><div class="bar-fill created" style="width:' + pct + '%"></div></div><span class="bar-value">' + u.totalMinutes + 'm</span></div>';
          });
          html += '</div>';
        }
      } else {
        html += '<div class="chart-empty">No time entries logged yet</div>';
      }
      html += '</div>';

      html += '</div>';
      container.innerHTML = html;
    }

    function formatDuration(ms) {
      if (ms === null || ms === undefined) return '—';
      if (ms < 1000) return ms + 'ms';
      if (ms < 60000) return Math.round(ms / 1000) + 's';
      if (ms < 3600000) return Math.round(ms / 60000) + 'm';
      return Math.round(ms / 3600000) + 'h';
    }

    // Init
    loadTasks();
    connectSSE();
  </script>
</body>
</html>`;
}
