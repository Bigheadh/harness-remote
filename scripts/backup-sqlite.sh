#!/bin/bash
set -euo pipefail

# Online hot backup for all harness-remote SQLite databases using VACUUM INTO.
# Uses Node.js 22 built-in node:sqlite (no external sqlite3 CLI required).
#
# Usage:
#   ./scripts/backup-sqlite.sh [DATA_DIR] [BACKUP_ROOT] [RETENTION_DAYS]
#
# Example:
#   ./scripts/backup-sqlite.sh ./data ./backups 14

DATA_DIR="${1:-./data}"
BACKUP_ROOT="${2:-./backups}"
RETENTION_DAYS="${3:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

if [ ! -d "$DATA_DIR" ]; then
  echo "ERROR: Data directory not found: $DATA_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

node - "$DATA_DIR" "$TARGET_DIR" <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const { readdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const [dataDir, targetDir] = process.argv.slice(2);
const files = readdirSync(dataDir).filter((f) => /\.(sqlite|db)$/i.test(f));

if (files.length === 0) {
  console.log(`No SQLite database files found in ${dataDir}`);
  process.exit(0);
}

let count = 0;
for (const file of files) {
  const srcPath = join(dataDir, file);
  const dstPath = join(targetDir, file);
  if (existsSync(dstPath)) continue;

  const db = new DatabaseSync(srcPath, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout=5000;");
    const escaped = dstPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}'`);
    console.log(`Backed up ${srcPath} -> ${dstPath}`);
    count++;
  } finally {
    db.close();
  }
}

console.log(`Hot backup complete: ${count} database(s) written to ${targetDir}`);
NODE

# Prune old backup directories beyond retention window (when RETENTION_DAYS > 0)
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true
fi
