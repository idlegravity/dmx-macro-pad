# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # run via tsx (no compile step, for development)
npm run build    # compile TypeScript src/ → dist/
npm start        # run compiled dist/index.js
```

Deploying to the Pi:
```bash
# Sync and restart (Pi reachable at dmx-macro-pad.local or 192.168.4.1)
rsync -av --exclude=node_modules --exclude='.git' \
  -e "sshpass -p dmx-macro-pad ssh -o StrictHostKeyChecking=no" \
  ~/dev/dmx-macro-pad/ dmx-macro-pad@dmx-macro-pad.local:~/dmx-macro-pad/

# Restart the app on the Pi
sshpass -p dmx-macro-pad ssh dmx-macro-pad@dmx-macro-pad.local \
  'sudo systemctl restart dmx-macro-pad'

# Reload scenes without restart (SIGHUP)
sshpass -p dmx-macro-pad ssh dmx-macro-pad@dmx-macro-pad.local \
  'sudo systemctl kill -s HUP dmx-macro-pad'
```

## Code Intelligence

Prefer LSP over Grep/Read for code navigation — it's faster, precise, and avoids reading entire files:
- `workspaceSymbol` to find where something is defined
- `findReferences` to see all usages across the codebase
- `goToDefinition` / `goToImplementation` to jump to source
- `hover` for type info without reading the file

Use Grep/Read only when LSP isn't available or for text/pattern searches (comments, strings, config).

After writing or editing code, check LSP diagnostics and fix errors before proceeding.

## Architecture

The app runs on a Raspberry Pi and sends DMX512 frames at 40 Hz over a USB-RS485 adapter (`/dev/ttyUSB0`, FTDI FT232RL). A Fastify HTTP server on port 3000 serves the mobile UI and REST API. The Pi acts as a WiFi hotspot (192.168.4.1); phones connect directly to it.

**Data flow:** `routes.ts` → `SceneManager` → `DmxController` → serialport → hardware

### Key files

- **`src/dmx/DmxController.ts`** — Opens the serial port at 250000 baud 8N2. Sends DMX512 frames in a `setInterval` loop: BREAK (`port.set({brk:true})`), MAB, then a 513-byte packet (0x00 start code + 512 channel bytes). Exposes `patchChannels(Record<string,number>)` for sparse channel updates and `blackout()`.

- **`src/scenes/SceneManager.ts`** — Loads `config/scenes.json`. Maintains a `Set<string>` of active scene IDs (multiple scenes can be active simultaneously). `activateScene(id)` toggles: if already active, zeros only that scene's channels; if inactive, patches its channels. Applies `channelStart` offset as `actualChannel = channelStart + channel - 1`. Group `exclusive: true` (default) deactivates siblings before activating.

- **`src/server/routes.ts`** — REST API + SSE. Maintains a `Set` of SSE client callbacks; `broadcastState()` pushes `{activeSceneIds}` to all on every toggle. Routes: `GET /api/scenes`, `POST /api/scenes/:id/activate`, `POST /api/blackout`, `GET /api/status`, `GET /api/events`.

- **`config/scenes.json`** — The only user-edited file in normal operation. Groups contain scenes. Scene IDs must be globally unique. Key group properties: `exclusive` (default `true`), `channelStart` (default `1`). Scene `channelStart` overrides group. Channel values 0–255.

- **`public/app.js`** — Vanilla JS, no framework. Connects to `/api/events` SSE on load. Tracks `activeSceneIds` as a `Set`. Optimistically toggles UI before API response. Persists group collapse state to `localStorage` under key `dmx-macro-pad-collapsed`.

### channelStart math

`channelStart` is 1-indexed (DMX convention). A scene with `channelStart: 15` and `channels: {"1": 255}` sets DMX channel 15, not 16. Formula: `actualChannel = channelStart + channel - 1`. Default `channelStart` is `1` (channels are absolute addresses).

### Pi deployment details

- Project is installed at `~/dmx-macro-pad` on the Pi (user: `dmxecute`)
- Service name: `dmx-macro-pad` (`/etc/systemd/system/dmx-macro-pad.service`)
- WiFi hotspot managed by NetworkManager connection `dmx-macro-pad-hotspot`
- The local repo at `~/dev/dmx-macro-pad` is the source of truth; `dist/` is committed and synced directly to avoid needing a build step on the Pi
