#!/usr/bin/env bash
# install.sh — One-shot installer for DMX Macro Pad
# Run as root after cloning: sudo bash scripts/install.sh
#
# What this does:
#   1. Installs Node.js 22.x if not already installed
#   2. Configures the WiFi hotspot (calls setup-hotspot.sh)
#   3. Builds the app and installs the systemd service (calls install-service.sh)
#
# Environment variables (all optional):
#   SSID        — WiFi network name  (default: "DMX Macro Pad")
#   PASSPHRASE  — WiFi password       (default: "macropad")
#   STATIC_IP   — Pi IP address       (default: 192.168.4.1)
#   INSTALL_DIR — where to install    (default: ~/dmx-macro-pad)

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root (sudo bash $0)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Install Node.js ─────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "==> Node.js not found. Installing Node.js 22.x..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  echo "==> Node.js $(node --version) installed."
else
  echo "==> Node.js $(node --version) already installed, skipping."
fi

# ── 2. Configure WiFi hotspot ──────────────────────────────────────────────
echo ""
echo "── Configuring WiFi hotspot ──────────────────────────────────────────"
bash "${SCRIPT_DIR}/setup-hotspot.sh"

# ── 3. Build and install the systemd service ──────────────────────────────
echo ""
echo "── Installing service ────────────────────────────────────────────────"
bash "${SCRIPT_DIR}/install-service.sh"

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "  Installation complete!"
echo ""
echo "  Reboot to activate everything:"
echo "    sudo reboot"
echo ""
echo "  After reboot:"
echo "    • WiFi network: ${SSID:-DMX Macro Pad}"
echo "    • Password:     ${PASSPHRASE:-macropad}"
echo "    • UI URL:       http://${STATIC_IP:-192.168.4.1}"
echo "════════════════════════════════════════════════"
