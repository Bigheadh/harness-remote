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
