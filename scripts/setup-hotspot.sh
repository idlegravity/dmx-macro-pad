#!/usr/bin/env bash
# setup-hotspot.sh — Configure the Raspberry Pi as a WiFi hotspot
# Run as root: sudo bash scripts/setup-hotspot.sh
#
# Uses NetworkManager (nmcli) — compatible with Raspberry Pi OS Bookworm/Trixie
# and any modern Debian/Ubuntu-based system.
#
# After this script:
#   Pi SSID:     DMX Macro Pad
#   Pi IP:       192.168.4.1
#   DHCP range:  assigned automatically by NetworkManager
#   Connect to:  http://192.168.4.1  (port 80 via iptables redirect from 3000)

set -euo pipefail

SSID="${SSID:-DMX Macro Pad}"
PASSPHRASE="${PASSPHRASE:-macropad}"      # min 8 chars required by WPA2
STATIC_IP="${STATIC_IP:-192.168.4.1}"
CON_NAME="${CON_NAME:-dmx-macro-pad-hotspot}"
APP_PORT="${APP_PORT:-3000}"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root (sudo bash $0)" >&2
  exit 1
fi

# Detect the user who invoked sudo (falls back to current user)
REAL_USER="${SUDO_USER:-$(whoami)}"

# ── Verify nmcli is available ──────────────────────────────────────────────
if ! command -v nmcli &>/dev/null; then
  echo "ERROR: nmcli not found. Install NetworkManager: apt install network-manager" >&2
  exit 1
fi

# ── Detect WiFi interface ──────────────────────────────────────────────────
if [[ -z "${INTERFACE:-}" ]]; then
  INTERFACE=$(nmcli -t -f DEVICE,TYPE device | awk -F: '$2=="wifi"{print $1; exit}')
  if [[ -z "${INTERFACE}" ]]; then
    echo "ERROR: No WiFi device found. Check 'nmcli device' for available interfaces." >&2
    exit 1
  fi
  echo "==> Auto-detected WiFi interface: ${INTERFACE}"
fi

# ── Clean up legacy hostapd/dnsmasq/dhcpcd config if present ──────────────
echo "==> Cleaning up legacy hotspot config (if any)..."
systemctl stop hostapd dnsmasq 2>/dev/null || true
systemctl disable hostapd dnsmasq 2>/dev/null || true
sed -i '/# DMX Macro Pad static/,/^[[:space:]]*$/d' /etc/dhcpcd.conf 2>/dev/null || true
rm -f /etc/hostapd/hostapd.conf 2>/dev/null || true

# ── Remove existing NM hotspot connection if present ──────────────────────
echo "==> Removing any existing hotspot connection..."
nmcli con delete "${CON_NAME}" 2>/dev/null || true

# ── Create NetworkManager access point connection ─────────────────────────
echo "==> Creating WiFi hotspot (SSID: ${SSID})..."
nmcli con add \
  type wifi \
  ifname "${INTERFACE}" \
  con-name "${CON_NAME}" \
  autoconnect yes \
  ssid "${SSID}"

nmcli con modify "${CON_NAME}" \
  802-11-wireless.mode ap \
  802-11-wireless.band bg \
  wifi-sec.key-mgmt wpa-psk \
  wifi-sec.psk "${PASSPHRASE}" \
  ipv4.method shared \
  ipv4.addresses "${STATIC_IP}/24"

echo "==> Bringing up hotspot..."
nmcli con up "${CON_NAME}"

# ── iptables redirect 80 → APP_PORT ───────────────────────────────────────
echo "==> Adding iptables rule: port 80 → ${APP_PORT}..."
if ! command -v iptables &>/dev/null; then
  echo "==> Installing iptables..."
  apt-get install -y -q iptables
fi
iptables -t nat -F PREROUTING 2>/dev/null || true
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port "${APP_PORT}"

# Persist iptables rules across reboots
if ! dpkg -l iptables-persistent &>/dev/null 2>&1; then
  echo "==> Installing iptables-persistent..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q iptables-persistent
fi
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4

# ── udev rule for consistent DMX device naming ─────────────────────────────
echo "==> Creating udev rule for USB-RS485 adapter (FTDI FT232)..."
cat > /etc/udev/rules.d/99-dmx.rules <<'EOF'
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", SYMLINK+="dmx0", MODE="0666"
EOF
udevadm control --reload-rules

# ── dialout group for the invoking user ───────────────────────────────────
echo "==> Adding ${REAL_USER} to dialout group..."
usermod -a -G dialout "${REAL_USER}"

echo ""
echo "✓ Hotspot configured!"
echo "  SSID:     ${SSID}"
echo "  Password: ${PASSPHRASE}"
echo "  Pi IP:    ${STATIC_IP}"
echo "  UI URL:   http://${STATIC_IP}"
echo ""
echo "The hotspot is active now and will auto-start on every boot."
echo "If the Pi is connected to ethernet, both WiFi hotspot and ethernet will work simultaneously."
