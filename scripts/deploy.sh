#!/bin/bash
set -euo pipefail

# harness-remote deploy script
# Usage: ./scripts/deploy.sh [--install-service] [--service-user USER]

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="harness-remote"
NODE_BIN="$(which node)"
NPM_BIN="$(which npm)"

INSTALL_SERVICE=false
SERVICE_USER=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-service)
      INSTALL_SERVICE=true
      shift
      ;;
    --service-user)
      SERVICE_USER="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--install-service] [--service-user USER]"
      echo ""
      echo "Options:"
      echo "  --install-service   Install systemd service file"
      echo "  --service-user USER User to run the service as (default: current user)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== harness-remote deploy ==="
echo "Project dir: $PROJECT_DIR"
echo "Node: $NODE_BIN"
echo ""

# Step 1: Install dependencies
echo "[1/5] Installing dependencies..."
cd "$PROJECT_DIR"
$NPM_BIN ci --omit=dev 2>/dev/null || $NPM_BIN install --omit=dev

# Step 2: Build
echo "[2/5] Building TypeScript..."
$NPM_BIN run build

# Step 3: Create data directory
echo "[3/5] Creating data directory..."
mkdir -p "$PROJECT_DIR/data"

# Step 4: Validate config exists
echo "[4/5] Checking configuration..."
if [ ! -f "$PROJECT_DIR/config/server.json" ]; then
  echo ""
  echo "WARNING: config/server.json not found."
  echo "Creating from template..."
  cp "$PROJECT_DIR/config/server.example.json" "$PROJECT_DIR/config/server.json"
  echo ""
  echo "  !! Please edit config/server.json with your actual values:"
  echo "     - personalToken"
  echo "     - feishu.appId / appSecret"
  echo "     - feishu.verificationToken"
  echo "     - feishu.encryptKey"
  echo "     - feishu.allowedUserIds"
  echo "     - publicBaseUrl"
  echo ""
fi

# Step 5: Install systemd service
if [ "$INSTALL_SERVICE" = true ]; then
  echo "[5/5] Installing systemd service..."

  if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Must be root to install systemd service (use sudo)"
    exit 1
  fi

  # Determine service user
  if [ -z "$SERVICE_USER" ]; then
    SERVICE_USER="$(logname 2>/dev/null || echo root)"
  fi

  # Create service user if needed
  if ! id "$SERVICE_USER" &>/dev/null; then
    echo "Creating user: $SERVICE_USER"
    useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER" 2>/dev/null || true
  fi

  # Set ownership
  chown -R "$SERVICE_USER:$SERVICE_USER" "$PROJECT_DIR"

  # Generate service file from template
  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=harness-remote server (Feishu task inbox)
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE_BIN $PROJECT_DIR/dist/server/index.js --config $PROJECT_DIR/config/server.json
Restart=on-failure
RestartSec=5
StartLimitBurst=3
StartLimitIntervalSec=60

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$PROJECT_DIR/data $PROJECT_DIR/config
PrivateTmp=true

# Environment
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--experimental-sqlite

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl start "$SERVICE_NAME"

  echo "Service installed and started."
  echo "  Status: systemctl status $SERVICE_NAME"
  echo "  Logs:   journalctl -u $SERVICE_NAME -f"
else
  echo "[5/5] Skipping systemd service (--install-service not set)"
fi

echo ""
echo "=== Deploy complete ==="
echo ""
echo "Next steps:"
if [ "$INSTALL_SERVICE" = true ]; then
  echo "  1. Verify service: systemctl status $SERVICE_NAME"
  echo "  2. Check logs: journalctl -u $SERVICE_NAME -f"
else
  echo "  1. Start server: cd $PROJECT_DIR && node dist/server/index.js --config config/server.json"
  echo "  2. Or install as service: sudo $0 --install-service"
fi
echo "  3. Test health: curl http://localhost:\$(node -e \"console.log(require('./config/server.json').port)\")/health"
