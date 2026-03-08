# DMX Macro Pad

A headless Raspberry Pi app that sends DMX512 signals to lighting equipment via a USB-to-RS485 adapter, controlled by a mobile-optimized web UI served directly from the Pi. The Pi acts as its own WiFi hotspot — no router needed. Connect your phone, open a browser, and tap to control your lights.

---

## Hardware Requirements

- Raspberry Pi 4 or 5
- [DSD TECH SH-RS09B](https://www.amazon.com/dp/B07WV6P5W6) USB-to-RS485 adapter (FTDI FT232RL chip)
- USB cable to connect the adapter to the Pi
- DMX512 lighting fixtures

The SH-RS09B is plug-and-play on Linux — no drivers needed. It appears as `/dev/ttyUSB0`.

---

## How It Works

```
Phone (browser) ──WiFi──► Pi Hotspot (192.168.4.1)
                                    │
                          HTTP Server (port 3000 → 80)
                                    │
                             Scene Manager
                                    │
                            DMX Controller
                                    │
                   USB-RS485 (/dev/ttyUSB0)
                                    │
                          DMX512 lighting fixtures
```

The app continuously transmits DMX512 frames at 40 Hz. Tapping a scene button in the UI patches the configured channels instantly. Scenes act as toggles — tap to activate, tap again to deactivate. Multiple scenes can be active simultaneously (unless the group is configured as exclusive).

---

## Installation

### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
```

### 2. Clone the project

```bash
git clone https://github.com/idlegravity/dmx-macro-pad.git ~/dmx-macro-pad
cd ~/dmx-macro-pad
```

### 3. Set up the WiFi hotspot

```bash
sudo bash scripts/setup-hotspot.sh
```

This uses NetworkManager to create a persistent WiFi access point that starts automatically on every boot.

**Default settings:**

| Setting | Value |
|---------|-------|
| SSID | `DMX Macro Pad` |
| Password | `macropad` |
| Pi IP | `192.168.4.1` |
| UI URL | `http://192.168.4.1` |

You can override any of these with environment variables:

```bash
sudo SSID="My Lights" PASSPHRASE="mypassword" bash scripts/setup-hotspot.sh
```

### 4. Install and enable the service

```bash
sudo bash scripts/install-service.sh
```

This builds the app, installs it to `~/dmx-macro-pad`, and registers a systemd service that starts automatically on every boot.

### 5. Reboot

```bash
sudo reboot
```

After reboot, the `DMX Macro Pad` WiFi network will appear and the app will be running.

---

## Usage

1. Connect your phone to the **DMX Macro Pad** WiFi network (password: `macropad`)
2. Open **`http://192.168.4.1`** in your browser
3. Tap a scene button to activate it — the button highlights to show it's active
4. Tap it again to deactivate (channels return to 0)
5. Tap **BLACKOUT** to zero all channels immediately

The UI updates in real time across all connected devices via Server-Sent Events (SSE).

---

## Configuring Scenes

Edit `config/scenes.json` to define your fixtures and scenes. The app reloads this file on startup. If the service is running, send it a SIGHUP to reload without restarting:

```bash
sudo systemctl kill -s HUP dmx-macro-pad
```

### Scene config format

```json
{
  "groups": [
    {
      "id": "my-fixture",
      "name": "My Fixture",
      "exclusive": true,
      "channelStart": 1,
      "scenes": [
        {
          "id": "my-scene",
          "name": "Scene Name",
          "color": "#ff8800",
          "channels": { "1": 255, "3": 128 }
        }
      ]
    }
  ]
}
```

### Group properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | string | required | Unique identifier |
| `name` | string | required | Display name in the UI |
| `exclusive` | boolean | `true` | If true, only one scene in the group can be active at a time |
| `channelStart` | number | `1` | DMX start address of the fixture (see below) |

### Scene properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | string | required | Unique identifier (must be unique across all groups) |
| `name` | string | required | Button label in the UI |
| `color` | string | none | Hex color for the button accent (e.g. `"#ff0000"`) |
| `channelStart` | number | inherits from group | Overrides the group's `channelStart` for this scene only |
| `channels` | object | required | Map of channel number → value (0–255) |

### `channelStart` — fixture addressing

DMX fixtures are patched at a start address. Rather than manually adding the offset to every channel number, set `channelStart` to the fixture's DMX start address and write channel numbers relative to the fixture (starting at 1).

**Formula:** `actual DMX channel = channelStart + channel - 1`

**Example:** Fixture patched at address 20, channel 3 of the fixture:

```json
{
  "channelStart": 20,
  "channels": { "3": 255 }
}
```

→ Sets DMX channel **22** (20 + 3 − 1) to 255.

If `channelStart` is omitted or set to `1`, channel numbers in `channels` are treated as absolute DMX addresses.

### `exclusive` — one-at-a-time vs independent

- **`exclusive: true`** (default) — activating a scene automatically deactivates any other active scene in the same group. Use this for fixtures where only one mode makes sense at a time (e.g. a moving head).
- **`exclusive: false`** — scenes in the group are independent toggles. Multiple can be active simultaneously. Use this for relay switches or independent channels.

---

## Service Management

```bash
# Check status
sudo systemctl status dmx-macro-pad

# View live logs
sudo journalctl -u dmx-macro-pad -f

# Restart
sudo systemctl restart dmx-macro-pad

# Reload scenes without restarting
sudo systemctl kill -s HUP dmx-macro-pad
```

---

## Development

To run without installing the service (useful for testing on a Mac or without the USB adapter):

```bash
npm install
npm run dev
```

The app will start without the serial port and track channel state in memory. Access the UI at `http://localhost:3000`.

To build the TypeScript manually:

```bash
npm run build    # compiles src/ → dist/
npm start        # runs dist/index.js
```

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `DMX_DEVICE` | `/dev/ttyUSB0` | Serial device path |
| `PORT` | `3000` | HTTP server port |
| `SCENES_CONFIG` | `config/scenes.json` | Path to scenes config |

---

## Project Structure

```
dmx-macro-pad/
├── src/
│   ├── dmx/
│   │   └── DmxController.ts    # Serial port, DMX frame loop (40 Hz)
│   ├── scenes/
│   │   └── SceneManager.ts     # Load config, activate/toggle scenes
│   ├── server/
│   │   ├── server.ts           # Fastify HTTP server
│   │   └── routes.ts           # REST API + SSE
│   └── index.ts                # Entry point
├── public/
│   ├── index.html              # Mobile web UI
│   ├── app.js                  # Frontend logic
│   └── style.css               # Dark theme, touch-optimized
├── config/
│   └── scenes.json             # Your fixture and scene definitions
├── scripts/
│   ├── setup-hotspot.sh        # Configure WiFi hotspot (NetworkManager)
│   └── install-service.sh      # Build + install systemd service
└── dmx-macro-pad.service       # Reference systemd unit (generated by install script)
```

---

## API

The app exposes a simple REST API if you want to integrate with other tools.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/scenes` | List all groups and scenes, plus active scene IDs |
| `POST` | `/api/scenes/:id/activate` | Toggle a scene on/off |
| `POST` | `/api/blackout` | Zero all DMX channels |
| `GET` | `/api/status` | Active scene IDs + all 512 raw channel values |
| `GET` | `/api/events` | SSE stream — pushes state changes to all clients |

---

## Permissions & udev

The install script adds your user to the `dialout` group for serial port access. The setup script installs a udev rule that creates a stable symlink `/dev/dmx0` for the FTDI adapter:

```
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", SYMLINK+="dmx0", MODE="0666"
```

If you prefer to use the symlink, set `DMX_DEVICE=/dev/dmx0` in the systemd service.
