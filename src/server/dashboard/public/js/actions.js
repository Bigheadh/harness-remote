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
      if (s === null || s === undefined) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    async function logout() {
      try {
        await fetch(API_BASE + '/dashboard/logout', {
          method: 'POST',
          credentials: 'same-origin',
        });
      } catch { /* ignore network errors on logout */ }
      try { localStorage.removeItem('harness_token'); } catch {}
      location.href = '/dashboard';
    }

    async function refresh() {
      document.getElementById('taskList').innerHTML = '<div class="loading">Loading...</div>';
      await loadTasks();
    }

    // SSE real-time updates with deduplicated exponential backoff
    let eventSource = null;
    let sseReconnectTimer = null;
    let sseReconnectDelay = 3000;
    const SSE_MAX_RECONNECT_DELAY = 30000;
    const SSE_TASK_EVENTS = [
      'task.created',
      'task.updated',
      'task.deleted',
      'task.status_changed',
      'task.result_reported',
      'task.assigned',
    ];

    function connectSSE() {
      const indicator = document.getElementById('sseIndicator');
      const label = document.getElementById('sseLabel');
      indicator.className = 'sse-indicator';
      label.textContent = 'Connecting...';

      if (sseReconnectTimer) {
        clearTimeout(sseReconnectTimer);
        sseReconnectTimer = null;
      }
      if (eventSource) { eventSource.close(); }
      const sseUrl = TOKEN
        ? API_BASE + '/api/tasks/stream?token=' + encodeURIComponent(TOKEN)
        : API_BASE + '/api/tasks/stream';
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        sseReconnectDelay = 3000;
        indicator.className = 'sse-indicator connected';
        label.textContent = 'Live';
      };

      // Named SSE events emitted by server/sse/broadcaster.ts
      for (const evType of SSE_TASK_EVENTS) {
        eventSource.addEventListener(evType, () => {
          loadTasks();
        });
      }

      // Fallback for unnamed message events
      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type && event.type.startsWith('task.')) {
            loadTasks();
          }
        } catch { /* ignore parse errors */ }
      };

      eventSource.onerror = () => {
        indicator.className = 'sse-indicator';
        label.textContent = 'Reconnecting...';
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!sseReconnectTimer) {
          const delay = sseReconnectDelay;
          sseReconnectDelay = Math.min(sseReconnectDelay * 2, SSE_MAX_RECONNECT_DELAY);
          sseReconnectTimer = setTimeout(() => {
            sseReconnectTimer = null;
            connectSSE();
          }, delay);
        }
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
