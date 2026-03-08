import { DmxController } from './dmx/DmxController.js';
import { SceneManager } from './scenes/SceneManager.js';
import { createServer } from './server/server.js';

const DMX_DEVICE = process.env.DMX_DEVICE ?? '/dev/ttyUSB0';
const HTTP_PORT = parseInt(process.env.PORT ?? '3000', 10);
const SCENES_CONFIG = process.env.SCENES_CONFIG ?? 'config/scenes.json';

async function main(): Promise<void> {
  console.log('[DMX Macro Pad] Starting...');

  const dmx = new DmxController(DMX_DEVICE);

  try {
    await dmx.open();
  } catch (err) {
    console.error(`[DMX Macro Pad] Failed to open DMX port ${DMX_DEVICE}:`, err);
    console.error('[DMX Macro Pad] Continuing without hardware (channels will be tracked in memory)');
    // Allow running without hardware for dev/testing
  }

  const sceneManager = new SceneManager(dmx, SCENES_CONFIG);

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

  await createServer(sceneManager, dmx, HTTP_PORT);

  console.log(`[DMX Macro Pad] Ready — DMX: ${DMX_DEVICE}, HTTP: :${HTTP_PORT}`);
}

main().catch((err) => {
  console.error('[DMX Macro Pad] Fatal error:', err);
  process.exit(1);
});
