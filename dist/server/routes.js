"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastState = broadcastState;
exports.registerRoutes = registerRoutes;
// SSE clients waiting for state updates
const sseClients = new Set();
/** Broadcast current state to all SSE subscribers. */
function broadcastState(sceneManager) {
    const payload = JSON.stringify({
        activeSceneIds: sceneManager.getActiveSceneIds(),
    });
    const msg = `data: ${payload}\n\n`;
    for (const send of sseClients) {
        send(msg);
    }
}
function registerRoutes(app, sceneManager, dmx) {
    // GET /api/scenes — list all scene groups + active scene IDs
    app.get('/api/scenes', (_req, reply) => {
        reply.send({
            groups: sceneManager.getGroups(),
            activeSceneIds: sceneManager.getActiveSceneIds(),
        });
    });
    // POST /api/scenes/:id/activate — toggle a scene
    app.post('/api/scenes/:id/activate', (req, reply) => {
        const { id } = req.params;
        const ok = sceneManager.activateScene(id);
        if (!ok) {
            reply.status(404).send({ error: `Scene '${id}' not found` });
            return;
        }
        broadcastState(sceneManager);
        reply.send({ ok: true, activeSceneIds: sceneManager.getActiveSceneIds() });
    });
    // POST /api/blackout — zero all channels
    app.post('/api/blackout', (_req, reply) => {
        sceneManager.blackout();
        broadcastState(sceneManager);
        reply.send({ ok: true, activeSceneIds: [] });
    });
    // GET /api/status — active scenes + raw channel values
    app.get('/api/status', (_req, reply) => {
        const channels = dmx.getChannels();
        reply.send({
            activeSceneIds: sceneManager.getActiveSceneIds(),
            channels: Array.from(channels),
        });
    });
    // GET /api/events — SSE stream for real-time state push
    app.get('/api/events', (req, reply) => {
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        // Send initial state immediately
        const initial = JSON.stringify({
            activeSceneIds: sceneManager.getActiveSceneIds(),
        });
        reply.raw.write(`data: ${initial}\n\n`);
        const send = (msg) => reply.raw.write(msg);
        sseClients.add(send);
        req.raw.on('close', () => {
            sseClients.delete(send);
        });
    });
}
