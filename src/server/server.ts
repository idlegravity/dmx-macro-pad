import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve } from 'path';
import type { SceneManager } from '../scenes/SceneManager.js';
import type { DmxController } from '../dmx/DmxController.js';
import { registerRoutes } from './routes.js';

export async function createServer(
  sceneManager: SceneManager,
  dmx: DmxController,
  port: number = 3000
): Promise<void> {
  const app = Fastify({ logger: false });

  // Serve public/ as static files at /
  await app.register(fastifyStatic, {
    root: resolve(process.cwd(), 'public'),
    prefix: '/',
  });

  registerRoutes(app, sceneManager, dmx);

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[Server] Listening on 0.0.0.0:${port}`);
}
