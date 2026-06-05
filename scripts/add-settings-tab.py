#!/usr/bin/env python3
"""Add Settings/Management tab to the dashboard template."""
import re

DASHBOARD = "src/server/dashboard/templates/dashboard.ts"

with open(DASHBOARD, "r") as f:
    content = f.read()

# 1. Add Settings tab button in nav
old_nav = '''      <button class="view-tab active" onclick="switchView('tasks')">📋 Tasks</button>
      <button class="view-tab" onclick="switchView('analytics')">📊 Analytics</button>
    </nav>'''
new_nav = '''      <button class="view-tab active" onclick="switchView('tasks')">📋 Tasks</button>
      <button class="view-tab" onclick="switchView('analytics')">📊 Analytics</button>
      <button class="view-tab" onclick="switchView('settings')">⚙️ Settings</button>
    </nav>'''
assert old_nav in content, "Could not find nav tabs"
content = content.replace(old_nav, new_nav, 1)

# 2. Add Settings view panel after analyticsView
old_analytics = '''    <!-- Analytics view -->
    <div class="view-panel" id="analyticsView">
      <div id="analyticsContent"><div class="analytics-loading">Loading analytics...</div></div>
    </div>

  </div>'''
new_analytics = '''    <!-- Analytics view -->
    <div class="view-panel" id="analyticsView">
      <div id="analyticsContent"><div class="analytics-loading">Loading analytics...</div></div>
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
        </div>
        <div class="settings-card">
          <h3>💻 Devices</h3>
          <div id="settingsDevices"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openRegisterDeviceModal()">+ Register Device</button>
          </div>
        </div>
        <div class="settings-card">
          <h3>🔔 Webhooks</h3>
          <div id="settingsWebhooks"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateWebhookModal()">+ Add Webhook</button>
          </div>
        </div>
        <div class="settings-card">
          <h3>📋 Templates</h3>
          <div id="settingsTemplates"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateTemplateModal()">+ Add Template</button>
          </div>
        </div>
        <div class="settings-card">
          <h3>⏱️ Scheduled Tasks</h3>
          <div id="settingsScheduled"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateScheduledModal()">+ Add Schedule</button>
          </div>
        </div>
        <div class="settings-card">
          <h3>📏 SLA Policies</h3>
          <div id="settingsSla"><div class="loading">Loading...</div></div>
          <div style="margin-top:12px">
            <button class="btn" onclick="openCreateSlaModal()">+ Add Policy</button>
          </div>
        </div>
      </div>
    </div>

  </div>'''
assert old_analytics in content, "Could not find analytics view"
content = content.replace(old_analytics, new_analytics, 1)

# 3. Add CSS for settings view before </style>
settings_css = '''
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
    .role-viewer { background: rgba(139,143,163,0.15); color: var(--text-dim); }'''

old_style_end = '  </style>'
assert old_style_end in content, "Could not find </style>"
content = content.replace(old_style_end, settings_css + '\n' + old_style_end, 1)

# 4. Update switchView function
old_switch = """    function switchView(view) {
      currentView = view;
      document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
      if (view === 'tasks') {
        document.querySelector('.view-tab:nth-child(1)').classList.add('active');
        document.getElementById('tasksView').classList.add('active');
      } else {
        document.querySelector('.view-tab:nth-child(2)').classList.add('active');
        document.getElementById('analyticsView').classList.add('active');
        loadAnalytics();
      }
    }"""
new_switch = """    function switchView(view) {
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
      } else if (view === 'settings') {
        document.querySelector('.view-tab:nth-child(3)').classList.add('active');
        document.getElementById('settingsView').classList.add('active');
        loadSettings();
      }
    }"""
assert old_switch in content, "Could not find switchView function"
content = content.replace(old_switch, new_switch, 1)

# 5. Add Settings JS functions before // Init
settings_js = r'''
    // Settings/Management
    async function loadSettings() {
      loadSettingsUsers();
      loadSettingsDevices();
      loadSettingsWebhooks();
      loadSettingsTemplates();
      loadSettingsScheduled();
      loadSettingsSla();
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

'''

old_init = '    // Init\n'
assert old_init in content, "Could not find // Init"
content = content.replace(old_init, settings_js + '\n    // Init\n', 1)

# 6. Add form HTML for each section inside the settings cards
# We need to add forms AFTER each card's button. Let me use a different approach - 
# add all forms at the end of the settings view before </div> of settingsView

# Actually, let me add inline forms. Let me replace the card contents to include forms.

# User form
content = content.replace(
    '''<button class="btn" onclick="openCreateUserModal()">+ Add User</button>
          </div>
        </div>''',
    '''<button class="btn" onclick="openCreateUserModal()">+ Add User</button>
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
        </div>''', 1)

# Device form
content = content.replace(
    '''<button class="btn" onclick="openRegisterDeviceModal()">+ Register Device</button>
          </div>
        </div>''',
    '''<button class="btn" onclick="openRegisterDeviceModal()">+ Register Device</button>
          </div>
          <div class="settings-form" id="registerDeviceForm">
            <input id="newDeviceName" placeholder="Device name" />
            <input id="newDeviceCaps" placeholder="Capabilities (optional)" />
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('registerDeviceForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitRegisterDevice()">Register</button>
            </div>
          </div>
        </div>''', 1)

# Webhook form
content = content.replace(
    '''<button class="btn" onclick="openCreateWebhookModal()">+ Add Webhook</button>
          </div>
        </div>''',
    '''<button class="btn" onclick="openCreateWebhookModal()">+ Add Webhook</button>
          </div>
          <div class="settings-form" id="createWebhookForm">
            <input id="newWebhookUrl" placeholder="Callback URL" />
            <input id="newWebhookEvents" placeholder="Events (comma-separated, e.g. task.created,task.status_changed)" />
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createWebhookForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateWebhook()">Create</button>
            </div>
          </div>
        </div>''', 1)

# Template form
content = content.replace(
    '''<button class="btn" onclick="openCreateTemplateModal()">+ Add Template</button>
          </div>
        </div>''',
    '''<button class="btn" onclick="openCreateTemplateModal()">+ Add Template</button>
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
        </div>''', 1)

# Scheduled form
content = content.replace(
    '''<button class="btn" onclick="openCreateScheduledModal()">+ Add Schedule</button>
          </div>
        </div>''',
    '''<button class="btn" onclick="openCreateScheduledModal()">+ Add Schedule</button>
          </div>
          <div class="settings-form" id="createScheduledForm">
            <textarea id="newScheduledCmd" placeholder="Command text" rows="2" style="width:100%;background:var(--bg-card);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:6px;font-size:12px;outline:none;font-family:inherit;resize:vertical"></textarea>
            <select id="newScheduledFreq"><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
            <div class="settings-form-actions">
              <button class="btn btn-outline" onclick="document.getElementById('createScheduledForm').classList.remove('open')">Cancel</button>
              <button class="btn" onclick="submitCreateScheduled()">Create</button>
            </div>
          </div>
        </div>''', 1)

# SLA form
content = content.replace(
    '''<button class="btn" onclick="openCreateSlaModal()">+ Add Policy</button>
          </div>
        </div>''',
    '''<button class="btn" onclick="openCreateSlaModal()">+ Add Policy</button>
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
        </div>''', 1)

with open(DASHBOARD, "w") as f:
    f.write(content)

print("SUCCESS: Settings tab added to dashboard")
