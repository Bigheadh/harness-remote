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
        html += '<div class="detail-section"><div class="detail-section-header">⚡ Actions</div><div class="detail-section-body">';
        html += '<div class="action-bar" id="actionBar">';
        if (t.status === 'pending' || t.status === 'picked') {
          html += '<button class="btn-sm orange" onclick="taskAction(\'' + t.id + '\',\'running\')">▶ Start</button>';
        }
        if (t.status === 'running' || t.status === 'picked') {
          html += '<button class="btn-sm green" onclick="taskAction(\'' + t.id + '\',\'done\')">✅ Done</button>';
          html += '<button class="btn-sm red" onclick="taskAction(\'' + t.id + '\',\'failed\')">❌ Fail</button>';
        }
        if (t.status === 'done' || t.status === 'failed') {
          html += '<button class="btn-sm blue" onclick="taskRetry(\'' + t.id + '\')">🔄 Retry</button>';
        }
        if (t.pinned) {
          html += '<button class="btn-sm" onclick="taskUnpin(\'' + t.id + '\')">📌 Unpin</button>';
        } else {
          html += '<button class="btn-sm" onclick="taskPin(\'' + t.id + '\')">📌 Pin</button>';
        }
        html += '<button class="btn-sm" onclick="taskClone(\'' + t.id + '\')">📋 Clone</button>';
        html += '<button class="btn-sm blue" onclick="taskCloneAndEdit(\'' + t.id + '\')">📝 Clone & Edit</button>';
        if (t.status === 'done' || t.status === 'failed') {
          html += '<button class="btn-sm purple" onclick="taskReopen(\'' + t.id + '\')">🔁 Reopen</button>';
        }
        if (t.status !== 'archived' && t.archivedAt == null) {
          html += '<button class="btn-sm blue" onclick="taskForward(\'' + t.id + '\')">➡️ Forward</button>';
        }
        if (!t.archivedAt) {
          html += '<button class="btn-sm" onclick="taskArchive(\'' + t.id + '\')">📦 Archive</button>';
        } else {
          html += '<button class="btn-sm orange" onclick="taskUnarchive(\'' + t.id + '\')">📤 Unarchive</button>';
        }
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
        loadSlaStatus(id);
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
          '<button class="btn-sm blue" onclick="addComment(\'' + escapeHtml(taskId) + '\')">Send</button>' +
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
                '<a href="' + escapeHtml(safeUrl(l.url)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(l.title || l.url) + '</a>' +
                '<span class="link-meta">' + escapeHtml(l.addedBy || 'unknown') + ' · ' + formatTime(l.createdAt) + '</span>' +
              '</div>'
            ).join('') +
            '</div>';
        }
        document.getElementById('detailBody').appendChild(section);
      } catch { /* links endpoint may not exist */ }
    }

    async function loadSlaStatus(taskId) {
      try {
        const data = await apiFetch('/api/tasks/' + taskId + '/sla');
        const section = document.createElement('div');
        section.className = 'detail-section';
        const status = data.status || 'no_policy';
        const icons = { ok: '✅', warning: '⚠️', breach: '🚨', no_policy: '📏' };
        const labels = { ok: 'Within SLA', warning: 'SLA Warning', breach: 'SLA Breached', no_policy: 'No SLA Policy' };
        let inner = '<div class="detail-section-header">📏 SLA Status</div><div class="detail-section-body">';
        inner += '<div class="sla-status-item ' + status + '">';
        inner += '<div class="sla-status-icon">' + (icons[status] || '📏') + '</div>';
        inner += '<div class="sla-status-detail">';
        inner += '<div class="sla-status-label">' + (labels[status] || status) + '</div>';
        if (data.policy && data.policy.name) {
          inner += '<div class="sla-status-meta">Policy: ' + escapeHtml(data.policy.name);
          if (data.targetMinutes) inner += ' · Target: ' + data.targetMinutes + 'm';
          inner += '</div>';
        }
        if (data.elapsedMinutes !== undefined) {
          inner += '<div class="sla-status-meta">Elapsed: ' + Math.round(data.elapsedMinutes) + 'm</div>';
        }
        inner += '</div></div>';
        if (data.targetMinutes && data.targetMinutes > 0) {
          const pct = Math.min(100, (data.elapsedMinutes / data.targetMinutes) * 100);
          const color = pct < 60 ? 'var(--green)' : pct < 80 ? '#eab308' : 'var(--red)';
          inner += '<div class="sla-progress-bar"><div class="sla-progress-fill" style="width:' + Math.round(pct) + '%;background:' + color + '"></div></div>';
        }
        inner += '</div>';
        section.innerHTML = inner;
        document.getElementById('detailBody').appendChild(section);
      } catch { /* sla endpoint may not exist */ }
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
      const params = new URLSearchParams();
      if (currentFilter) params.set('status', currentFilter);
      if (currentPriorityFilter) params.set('priority', currentPriorityFilter);
      if (tagQuery) params.set('tags', tagQuery);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo + 'T23:59:59');
      if (searchQuery) params.set('q', searchQuery);
      const qs = params.toString();
      window.open(API_BASE + '/api/tasks/export.csv' + (qs ? '?' + qs : ''), '_blank');
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

    // Reopen a done/failed task back to pending
    async function taskReopen(id) {
      try {
        await apiFetch('/api/tasks/' + id + '/reopen', { method: 'POST' });
        closeDetail();
        loadTasks();
      } catch (e) { alert('Reopen failed: ' + e.message); }
    }
    // Forward task to a different device
    async function taskForward(id) {
      try {
        const devData = await apiFetch('/api/devices');
        const devices = devData.devices || [];
        if (devices.length === 0) { alert('No devices registered'); return; }
        const devList = devices.map((d, i) => (i + 1) + '. ' + d.name + ' (' + d.id.slice(0, 12) + '...)').join('\n');
        const choice = prompt('Forward to which device?\n\n' + devList + '\n\nEnter device number or ID:');
        if (!choice) return;
        let deviceId = choice.trim();
        if (/^d+$/.test(deviceId) && parseInt(deviceId) <= devices.length) {
          deviceId = devices[parseInt(deviceId) - 1].id;
        }
        const message = prompt('Optional message for the new device:') || '';
        await apiFetch('/api/tasks/' + id + '/forward', {
          method: 'POST',
          body: JSON.stringify({ deviceId, message }),
        });
        closeDetail();
        loadTasks();
      } catch (e) { alert('Forward failed: ' + e.message); }
    }
    // Archive a task (soft-delete)
    async function taskArchive(id) {
      try {
        await apiFetch('/api/tasks/' + id + '/archive', { method: 'POST' });
        closeDetail();
        loadTasks();
      } catch (e) { alert('Archive failed: ' + e.message); }
    }
    // Unarchive a task
    async function taskUnarchive(id) {
      try {
        await apiFetch('/api/tasks/' + id + '/unarchive', { method: 'POST' });
        closeDetail();
        loadTasks();
      } catch (e) { alert('Unarchive failed: ' + e.message); }
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
      loadSettingsApiKeys();
    }
    // API Keys
    async function loadSettingsApiKeys() {
      const el = document.getElementById('settingsApiKeys');
      try {
        const data = await apiFetch('/api/keys');
        const keys = data.keys || [];
        if (keys.length === 0) { el.innerHTML = '<div class="settings-empty">No API keys configured</div>'; return; }
        let html = '<table class="settings-table"><thead><tr><th>Name</th><th>Key</th><th>User</th><th>Role</th><th>Status</th><th>Last Used</th><th>Actions</th></tr></thead><tbody>';
        keys.forEach(k => {
          const masked = k.keyPrefix ? k.keyPrefix + '****' : '****';
          const roleClass = 'role-' + (k.role || 'viewer');
          const status = k.enabled !== false ? '<span style="color:#4ade80">Active</span>' : '<span style="color:#f87171">Disabled</span>';
          html += '<tr><td>' + escapeHtml(k.name || '—') + '</td><td class="id-cell" style="font-family:monospace">' + escapeHtml(masked) + '</td><td class="id-cell">' + escapeHtml(k.userId || '—') + '</td><td><span class="role-badge ' + roleClass + '">' + (k.role || '—') + '</span></td><td>' + status + '</td><td>' + (k.lastUsedAt ? formatTime(k.lastUsedAt) : 'Never') + '</td><td>';
          if (k.enabled !== false) {
            html += '<button class="btn-sm" onclick="disableApiKey(\'' + k.id + '\')" title="Disable">⏸️</button> ';
          } else {
            html += '<button class="btn-sm" onclick="enableApiKey(\'' + k.id + '\')" title="Enable">▶️</button> ';
          }
          html += '<button class="btn-sm" onclick="rotateApiKey(\'' + k.id + '\')" title="Rotate">🔄</button> ';
          html += '<button class="btn-sm red" onclick="revokeApiKey(\'' + k.id + '\',\'' + escapeHtml(k.name || k.id) + '\')" title="Revoke">🗑️</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table>';
        el.innerHTML = html;
      } catch (e) { el.innerHTML = '<div class="settings-empty">Error: ' + escapeHtml(e.message) + '</div>'; }
    }

    function openCreateApiKeyModal() {
      document.getElementById('createApiKeyForm').classList.toggle('open');
    }

    async function submitCreateApiKey() {
      const name = document.getElementById('newApiKeyName').value.trim();
      const userId = document.getElementById('newApiKeyUserId').value.trim();
      const role = document.getElementById('newApiKeyRole').value;
      if (!name) { alert('Key name is required'); return; }
      try {
        const body = { name };
        if (userId) body.userId = userId;
        if (role) body.role = role;
        const data = await apiFetch('/api/keys', { method: 'POST', body: JSON.stringify(body) });
        alert('API Key created! Full key: ' + data.apiKey.key + '\n\nSave this key now - it won\'t be shown again!');
        document.getElementById('createApiKeyForm').classList.remove('open');
        document.getElementById('newApiKeyName').value = '';
        document.getElementById('newApiKeyUserId').value = '';
        loadSettingsApiKeys();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function disableApiKey(id) {
      try {
        await apiFetch('/api/keys/' + id + '/disable', { method: 'POST' });
        loadSettingsApiKeys();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function enableApiKey(id) {
      try {
        await apiFetch('/api/keys/' + id + '/enable', { method: 'POST' });
        loadSettingsApiKeys();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function rotateApiKey(id) {
      if (!confirm('Rotate this API key? The old key will remain valid for 24 hours.')) return;
      try {
        const data = await apiFetch('/api/keys/' + id + '/rotate', { method: 'POST' });
        alert('New key: ' + data.apiKey.key + '\n\nSave this key now - it won\'t be shown again!');
        loadSettingsApiKeys();
      } catch (e) { alert('Failed: ' + e.message); }
    }

    async function revokeApiKey(id, name) {
      if (!confirm('Permanently revoke API key "' + name + '"? This cannot be undone.')) return;
      try {
        await apiFetch('/api/keys/' + id, { method: 'DELETE' });
        loadSettingsApiKeys();
      } catch (e) { alert('Failed: ' + e.message); }
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
