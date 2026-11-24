# Production Deployment Templates

This directory contains ready-to-use reverse proxy and automated backup templates for `harness-remote`.

## 1. Reverse Proxy (HTTPS + SSE)

SSE (`/api/tasks/stream`) requires response buffering to be disabled so real-time task updates stream immediately without stalling:

- **Caddy (recommended, zero-config Let's Encrypt)**: [Caddyfile](./Caddyfile)
- **Nginx**: [nginx.conf](./nginx.conf)

## 2. Automated Daily Hot SQLite Backups

`scripts/backup-sqlite.sh` performs zero-downtime hot snapshots of all WAL-mode SQLite databases via Node 22's built-in `node:sqlite` (`VACUUM INTO`) and prunes snapshots older than the retention window (default 14 days).

### systemd timer (recommended)

```bash
sudo cp deploy/harness-backup.service /etc/systemd/system/
sudo cp deploy/harness-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now harness-backup.timer
systemctl list-timers harness-backup.timer
```

### Cron alternative

```cron
15 3 * * * /opt/harness-remote/scripts/backup-sqlite.sh /opt/harness-remote/data /opt/harness-remote/backups 14 >> /var/log/harness-backup.log 2>&1
```

## 3. Restore Verification

```bash
# Stop server, copy desired snapshot into data/, and restart
ls -la /opt/harness-remote/backups/
cp /opt/harness-remote/backups/<TIMESTAMP>/*.sqlite /opt/harness-remote/data/
```
