"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DmxController_js_1 = require("./dmx/DmxController.js");
const SceneManager_js_1 = require("./scenes/SceneManager.js");
const server_js_1 = require("./server/server.js");
const DMX_DEVICE = process.env.DMX_DEVICE ?? '/dev/ttyUSB0';
const HTTP_PORT = parseInt(process.env.PORT ?? '3000', 10);
const SCENES_CONFIG = process.env.SCENES_CONFIG ?? 'config/scenes.json';
async function main() {
    console.log('[DMX Macro Pad] Starting...');
    const dmx = new DmxController_js_1.DmxController(DMX_DEVICE);
    try {
        await dmx.open();
    }
    catch (err) {
        console.error(`[DMX Macro Pad] Failed to open DMX port ${DMX_DEVICE}:`, err);
        console.error('[DMX Macro Pad] Continuing without hardware (channels will be tracked in memory)');
        // Allow running without hardware for dev/testing
    }
    const sceneManager = new SceneManager_js_1.SceneManager(dmx, SCENES_CONFIG);
    // Reload scenes on SIGHUP
    process.on('SIGHUP', () => sceneManager.reload());
    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('[DMX Macro Pad] Shutting down...');
        await dmx.close();
        process.exit(0);
    });
    process.on('SIGINT', async () => {
        console.log('[DMX Macro Pad] Shutting down...');
        await dmx.close();
        process.exit(0);
    });
    await (0, server_js_1.createServer)(sceneManager, dmx, HTTP_PORT);
    console.log(`[DMX Macro Pad] Ready — DMX: ${DMX_DEVICE}, HTTP: :${HTTP_PORT}`);
}
main().catch((err) => {
    console.error('[DMX Macro Pad] Fatal error:', err);
    process.exit(1);
});
