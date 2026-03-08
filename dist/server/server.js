"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const fastify_1 = __importDefault(require("fastify"));
const static_1 = __importDefault(require("@fastify/static"));
const path_1 = require("path");
const routes_js_1 = require("./routes.js");
async function createServer(sceneManager, dmx, port = 3000) {
    const app = (0, fastify_1.default)({ logger: false });
    // Serve public/ as static files at /
    await app.register(static_1.default, {
        root: (0, path_1.resolve)(process.cwd(), 'public'),
        prefix: '/',
    });
    (0, routes_js_1.registerRoutes)(app, sceneManager, dmx);
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`[Server] Listening on 0.0.0.0:${port}`);
}
