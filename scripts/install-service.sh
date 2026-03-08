#!/usr/bin/env bash
# install-service.sh — Build DMX Macro Pad and install the systemd service
# Run as root from the project directory: sudo bash scripts/install-service.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root (sudo bash $0)" >&2
  exit 1
fi

# Detect the user who invoked sudo (falls back to current user)
REAL_USER="${SUDO_USER:-$(whoami)}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)

INSTALL_DIR="${INSTALL_DIR:-${REAL_HOME}/dmx-macro-pad}"
SERVICE_NAME="dmx-macro-pad"
SERVICE_DEST="/etc/systemd/system/${SERVICE_NAME}.service"

# Detect project root (the directory containing this script's parent)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> User:              ${REAL_USER}"
echo "==> Project directory: ${PROJECT_DIR}"
echo "==> Install directory: ${INSTALL_DIR}"

# ── Install Node dependencies and build ───────────────────────────────────
cd "${PROJECT_DIR}"
echo "==> Installing dependencies..."
npm install

echo "==> Building TypeScript..."
npm run build

echo "==> Pruning dev dependencies..."
npm prune --omit=dev

# ── Copy project to install directory (if different) ──────────────────────
if [[ "${PROJECT_DIR}" != "${INSTALL_DIR}" ]]; then
  echo "==> Copying project to ${INSTALL_DIR}..."
  mkdir -p "${INSTALL_DIR}"
  rsync -a --exclude=node_modules --exclude='.git' "${PROJECT_DIR}/" "${INSTALL_DIR}/"
  cd "${INSTALL_DIR}"
  echo "==> Installing production dependencies in ${INSTALL_DIR}..."
  npm install --omit=dev
fi

# ── Generate and install systemd service ──────────────────────────────────
echo "==> Installing systemd service (user: ${REAL_USER}, dir: ${INSTALL_DIR})..."
cat > "${SERVICE_DEST}" <<EOF
[Unit]
Description=DMX Macro Pad lighting controller
After=network.target

[Service]
ExecStart=/usr/bin/node ${INSTALL_DIR}/dist/index.js
WorkingDirectory=${INSTALL_DIR}
Restart=always
RestartSec=3
User=${REAL_USER}
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo ""
echo "✓ Service installed and started!"
echo ""
systemctl status "${SERVICE_NAME}" --no-pager
echo ""
echo "Commands:"
echo "  sudo systemctl status  ${SERVICE_NAME}"
echo "  sudo systemctl restart ${SERVICE_NAME}"
echo "  sudo journalctl -u ${SERVICE_NAME} -f   # follow logs"
