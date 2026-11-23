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

