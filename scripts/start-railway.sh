#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-/data/workspace}"
PORT="${PORT:-18789}"

mkdir -p "$STATE_DIR" "$WORKSPACE_DIR"

# Write default config only if one doesn't exist yet.
# Enables Slack plugin. Additional plugins can be enabled via the Control UI.
if [ ! -f "$STATE_DIR/openclaw.json" ]; then
  cat > "$STATE_DIR/openclaw.json" <<EOF
{
  "agents": {
    "defaults": {
      "workspace": "$WORKSPACE_DIR"
    }
  },
  "channels": {
    "slack": {
      "enabled": true,
      "mode": "socket"
    }
  },
  "gateway": {
    "mode": "local"
  }
}
EOF
fi

exec node openclaw.mjs gateway --allow-unconfigured --bind lan --port "$PORT"
