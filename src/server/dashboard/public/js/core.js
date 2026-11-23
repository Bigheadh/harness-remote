const API_BASE = (window.__HARNESS_CONFIG__ && window.__HARNESS_CONFIG__.apiBaseUrl) || window.location.origin;
    const TOKEN = (window.__HARNESS_CONFIG__ && window.__HARNESS_CONFIG__.token) || '';

    function safeUrl(raw) {
      if (typeof raw !== 'string') return '#';
      try {
        const u = new URL(raw, window.location.origin);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          return u.href;
        }
      } catch {}
      return '#';
    }

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
      const authHeaders = TOKEN ? { 'Authorization': 'Bearer ' + TOKEN } : {};
      const res = await fetch(API_BASE + path, {
        credentials: 'same-origin',
        ...opts,
        headers: {
          ...authHeaders,
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
          '<div class="empty">Failed to load archived tasks: ' + escapeHtml(e.message) + '</div>';
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
        'onclick="filterByStatus(\'' + (s.label.toLowerCase() === 'total' ? '' : s.label.toLowerCase()) + '\')">' +
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

        const _acls = showArchived ? ' archived-row' : '';
        const safeId = escapeHtml(t.id);
        return '<tr class="' + _acls.trim() + '" onclick="showDetail(\'' + safeId + '\')" style="cursor:pointer">' +
          '<td onclick="event.stopPropagation()"><input type="checkbox" class="row-cb" data-id="' + safeId + '" onchange="onRowSelect()" /></td>' +
          '<td class="task-id" title="' + safeId + '">' + escapeHtml(t.id.slice(0, 12)) + pin + '</td>' +
          '<td><span class="status status-' + escapeHtml(t.status) + '">' + escapeHtml(t.status) + '</span></td>' +
          '<td><span class="priority priority-' + escapeHtml(t.priority) + '">' + escapeHtml(t.priority) + '</span></td>' +
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
