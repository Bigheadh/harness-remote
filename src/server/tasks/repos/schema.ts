import type { DatabaseSync } from "node:sqlite";

/** Current SQLite schema version tracked via PRAGMA user_version */
export const TASK_SCHEMA_VERSION = 2;

function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  return Number(row?.user_version ?? 0);
}

function addColumnIfMissing(db: DatabaseSync, table: string, columnDef: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch {
    // Column already exists
  }
}

/**
 * Initialize SQLite pragmas and run versioned schema migrations (`PRAGMA user_version`):
 * - v1: Base tables, indexes, and legacy column upgrades
 * - v2: FTS5 trigram full-text search virtual table (`tasks_fts`) + triggers + backfill
 */
export function initializeTaskSchema(db: DatabaseSync): void {
  db.exec(`PRAGMA journal_mode=WAL;`);
  db.exec(`PRAGMA foreign_keys=ON;`);
  db.exec(`PRAGMA busy_timeout=5000;`);

  let version = getSchemaVersion(db);

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        feishu_message_id TEXT NOT NULL,
        feishu_chat_id TEXT NOT NULL,
        feishu_user_id TEXT NOT NULL,
        command_text TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        tags TEXT,
        attachments TEXT,
        assigned_device_id TEXT,
        due_date TEXT,
        reminder_at TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT,
        picked_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        description TEXT,
        estimated_minutes INTEGER,
        cycle_id TEXT,
        reopened_count INTEGER DEFAULT 0,
        module_id TEXT,
        result_summary TEXT,
        result_details TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Backwards-compatible column upgrades for databases created before versioned migrations
    addColumnIfMissing(db, "tasks", "priority TEXT NOT NULL DEFAULT 'normal'");
    addColumnIfMissing(db, "tasks", "attachments TEXT");
    addColumnIfMissing(db, "tasks", "assigned_device_id TEXT");
    addColumnIfMissing(db, "tasks", "tags TEXT");
    addColumnIfMissing(db, "tasks", "due_date TEXT");
    addColumnIfMissing(db, "tasks", "reminder_at TEXT");
    addColumnIfMissing(db, "tasks", "pinned INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing(db, "tasks", "archived_at TEXT");
    addColumnIfMissing(db, "tasks", "picked_at TEXT");
    addColumnIfMissing(db, "tasks", "started_at TEXT");
    addColumnIfMissing(db, "tasks", "completed_at TEXT");
    addColumnIfMissing(db, "tasks", "description TEXT");
    addColumnIfMissing(db, "tasks", "estimated_minutes INTEGER");
    addColumnIfMissing(db, "tasks", "cycle_id TEXT");
    addColumnIfMissing(db, "tasks", "reopened_count INTEGER DEFAULT 0");
    addColumnIfMissing(db, "tasks", "module_id TEXT");

    // Core query indexes on tasks table
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_archived_status_created ON tasks(archived_at, status, created_at DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned_device_status ON tasks(assigned_device_id, status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_feishu_user_id ON tasks(feishu_user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_feishu_message_id ON tasks(feishu_message_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_module_id ON tasks(module_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_cycle_id ON tasks(cycle_id)`);

    // Time entries table (Phase 49: Task Time Tracking)
    db.exec(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_minutes REAL NOT NULL DEFAULT 0,
        description TEXT,
        logged_by TEXT NOT NULL DEFAULT 'system',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON time_entries(task_id)`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS processed_events (
        event_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      )
    `);

    // Task comments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL,
        author_type TEXT NOT NULL DEFAULT 'api',
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id)`);

    // Task templates table
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        command_text TEXT NOT NULL,
        priority TEXT DEFAULT 'normal',
        tags TEXT,
        assigned_device_id TEXT,
        due_date_offset_ms INTEGER,
        reminder_offset_ms INTEGER,
        usage_count INTEGER DEFAULT 0,
        variables TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_templates_name ON task_templates(name)`);
    addColumnIfMissing(db, "task_templates", "usage_count INTEGER DEFAULT 0");
    addColumnIfMissing(db, "task_templates", "variables TEXT");

    // Scheduled tasks table
    db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        template_id TEXT,
        command_text TEXT NOT NULL,
        frequency TEXT NOT NULL DEFAULT 'daily',
        priority TEXT DEFAULT 'normal',
        tags TEXT,
        assigned_device_id TEXT,
        next_run_at TEXT NOT NULL,
        last_run_at TEXT,
        last_task_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at, enabled)`);

    // Task dependencies table (many-to-many prerequisite & typed relationships)
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL DEFAULT 'depends_on',
        created_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (task_id, depends_on_task_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
    addColumnIfMissing(db, "task_dependencies", "relationship_type TEXT NOT NULL DEFAULT 'depends_on'");
    addColumnIfMissing(db, "task_dependencies", "created_at TEXT NOT NULL DEFAULT ''");
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id)`);

    // SLA policies & breach log tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS sla_policies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        target_minutes INTEGER NOT NULL,
        warning_threshold_percent INTEGER NOT NULL DEFAULT 80,
        match_priorities TEXT,
        match_tags TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS sla_breach_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        policy_name TEXT NOT NULL,
        breach_type TEXT NOT NULL,
        target_minutes INTEGER NOT NULL,
        actual_minutes REAL NOT NULL,
        detected_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (policy_id) REFERENCES sla_policies(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sla_breach_log_task_id ON sla_breach_log(task_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sla_breach_log_policy_id ON sla_breach_log(policy_id)`);

    // Task notes, links, locks, subtasks, saved views, watchers
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id)`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS task_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        added_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_links_task_id ON task_links(task_id)`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS task_locks (
        task_id TEXT PRIMARY KEY,
        locked_by TEXT NOT NULL,
        locked_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS task_subtasks (
        id TEXT PRIMARY KEY,
        parent_task_id TEXT NOT NULL,
        title TEXT NOT NULL,
        command_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result_summary TEXT,
        result_details TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_subtasks_parent ON task_subtasks(parent_task_id)`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_views (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        filters TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_saved_views_created_by ON saved_views(created_by)`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS task_watchers (
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (task_id, user_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_watchers_user_id ON task_watchers(user_id)`);

    // Modules & Cycles tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'planned',
        start_date TEXT,
        end_date TEXT,
        target_completion_percent INTEGER,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_modules_status ON modules(status)`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS cycles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'upcoming',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cycles_status ON cycles(status)`);

    db.exec(`PRAGMA user_version = 1;`);
    version = 1;
  }

  if (version < 2) {
    // External-content FTS5 virtual table with trigram tokenizer for indexed substring search
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
        command_text,
        result_summary,
        description,
        content='tasks',
        content_rowid='rowid',
        tokenize='trigram'
      );
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS tasks_fts_ai AFTER INSERT ON tasks BEGIN
        INSERT INTO tasks_fts(rowid, command_text, result_summary, description)
        VALUES (new.rowid, new.command_text, new.result_summary, new.description);
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS tasks_fts_ad AFTER DELETE ON tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, command_text, result_summary, description)
        VALUES ('delete', old.rowid, old.command_text, old.result_summary, old.description);
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS tasks_fts_au AFTER UPDATE OF command_text, result_summary, description ON tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, command_text, result_summary, description)
        VALUES ('delete', old.rowid, old.command_text, old.result_summary, old.description);
        INSERT INTO tasks_fts(rowid, command_text, result_summary, description)
        VALUES (new.rowid, new.command_text, new.result_summary, new.description);
      END;
    `);

    // Backfill any pre-existing tasks into the FTS5 index
    db.exec(`INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');`);
    db.exec(`PRAGMA user_version = 2;`);
  }
}
