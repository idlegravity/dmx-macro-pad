#!/usr/bin/env bash
# Remote installer for DMX Macro Pad
#
# Usage (on the Pi):
#   curl -fsSL https://raw.githubusercontent.com/idlegravity/dmx-macro-pad/main/install.sh | sudo bash
#
# Optionally override defaults with environment variables:
#   sudo SSID="My Lights" PASSPHRASE="secret" bash <(curl -fsSL ...)
#
# What this does:
#   1. Installs git if not present
#   2. Clones the repo (or pulls latest if already cloned)
#   3. Hands off to scripts/install.sh, which installs Node.js,
#      configures the WiFi hotspot, and registers the systemd service

set -euo pipefail

REPO_URL="https://github.com/idlegravity/dmx-macro-pad.git"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root: curl -fsSL ... | sudo bash" >&2
  exit 1
fi

# Detect the real user (not root) for correct file ownership
REAL_USER="${SUDO_USER:-$(whoami)}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)
INSTALL_DIR="${INSTALL_DIR:-${REAL_HOME}/dmx-macro-pad}"

# ── Ensure git is available ────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  echo "==> Installing git..."
  apt-get update -q && apt-get install -y -q git
fi

# ── Clone or update the repo ───────────────────────────────────────────────
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  echo "==> Repo exists at ${INSTALL_DIR} — pulling latest..."
  sudo -u "$REAL_USER" git -C "${INSTALL_DIR}" pull --ff-only
else
  echo "==> Cloning to ${INSTALL_DIR}..."
  sudo -u "$REAL_USER" git clone "$REPO_URL" "${INSTALL_DIR}"
fi

# ── Hand off to the full installer ────────────────────────────────────────
# All env vars (SSID, PASSPHRASE, STATIC_IP, etc.) pass through automatically.
exec bash "${INSTALL_DIR}/scripts/install.sh"
