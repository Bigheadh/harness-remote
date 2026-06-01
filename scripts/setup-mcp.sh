#!/bin/bash
set -euo pipefail

# setup-mcp.sh — Setup script for company computer (MCP client side)
# This script helps configure the MCP server for Codex CLI on the company computer.

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(which node)"

echo "=== harness-remote MCP setup (Company Computer) ==="
echo "Project dir: $PROJECT_DIR"
echo ""

# Step 1: Check Node.js version
echo "[1/3] Checking Node.js..."
NODE_VERSION=$($NODE_BIN --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js 20+ required, found v$($NODE_BIN --version)"
  exit 1
fi
echo "  Node.js $NODE_VERSION OK"

# Step 2: Build
echo "[2/3] Building MCP server..."
cd "$PROJECT_DIR"
npm run build 2>/dev/null || echo "WARNING: Build failed. Run 'npm run build' manually."

# Step 3: Configure
echo "[3/3] Checking MCP config..."
if [ ! -f "$PROJECT_DIR/config/mcp.json" ]; then
  echo ""
  echo "Creating config/mcp.json from template..."
  cp "$PROJECT_DIR/config/mcp.example.json" "$PROJECT_DIR/config/mcp.json"
  echo ""
  echo "  !! Please edit config/mcp.json:"
  echo "     - serverBaseUrl: https://your-server.com"
  echo "     - personalToken: your-server-personal-token"
  echo ""
fi

# Show Codex CLI config
echo ""
echo "=== Add this to your Codex CLI MCP config ==="
echo ""
echo "[mcp_servers.harness_remote]"
echo "command = \"$NODE_BIN\""
echo "args = [\"$PROJECT_DIR/dist/mcp-server/index.js\", \"--config\", \"$PROJECT_DIR/config/mcp.json\"]"
echo ""
echo "Config file locations:"
echo "  - macOS: ~/.codex/config.toml"
echo "  - Linux: ~/.codex/config.toml"
echo ""
echo "=== Setup complete ==="
