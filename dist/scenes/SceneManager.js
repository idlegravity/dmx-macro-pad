"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneManager = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
class SceneManager {
    dmx;
    groups = [];
    scenes = new Map();
    channelStarts = new Map();
    sceneToGroup = new Map();
    activeSceneIds = new Set();
    configPath;
    constructor(dmx, configPath) {
        this.dmx = dmx;
        this.configPath = (0, path_1.resolve)(configPath);
        this.loadConfig();
    }
    loadConfig() {
        try {
            const raw = (0, fs_1.readFileSync)(this.configPath, 'utf8');
            const config = JSON.parse(raw);
            if (config.groups) {
                this.groups = config.groups;
            }
            else if (config.scenes) {
                // Legacy flat format — wrap in a single unnamed group
                this.groups = [{ id: '__default__', name: '', scenes: config.scenes }];
            }
            else {
                this.groups = [];
            }
            // Flatten into maps for fast lookup
            this.scenes.clear();
            this.channelStarts.clear();
            this.sceneToGroup.clear();
            for (const group of this.groups) {
                for (const scene of group.scenes) {
                    this.scenes.set(scene.id, scene);
                    this.sceneToGroup.set(scene.id, group);
                    // Scene-level channelStart overrides group-level; default 1 (1-indexed, no offset)
                    const start = scene.channelStart ?? group.channelStart ?? 1;
                    this.channelStarts.set(scene.id, start);
                }
            }
            console.log(`[Scenes] Loaded ${this.scenes.size} scene(s) across ${this.groups.length} group(s) from ${this.configPath}`);
        }
        catch (err) {
            console.error('[Scenes] Failed to load config:', err);
        }
    }
    /** Apply channelStart offset to a channel map (1-indexed: actualChannel = channelStart + ch - 1). */
    applyOffset(channels, channelStart) {
        if (channelStart === 1)
            return channels;
        return Object.fromEntries(Object.entries(channels).map(([ch, val]) => [String(parseInt(ch, 10) + channelStart - 1), val]));
    }
    /** Deactivate a scene without toggling — always turns it off. */
    deactivateScene(id) {
        const scene = this.scenes.get(id);
        if (!scene || !this.activeSceneIds.has(id))
            return;
        const channelStart = this.channelStarts.get(id) ?? 1;
        const zeros = Object.fromEntries(Object.keys(scene.channels).map((k) => [k, 0]));
        this.dmx.patchChannels(this.applyOffset(zeros, channelStart));
        this.activeSceneIds.delete(id);
        console.log(`[Scenes] Deactivated: ${scene.name}`);
    }
    /** Reload config from disk (call on SIGHUP). */
    reload() {
        console.log('[Scenes] Reloading config...');
        this.loadConfig();
        // Re-apply all currently active scenes that still exist
        const previouslyActive = new Set(this.activeSceneIds);
        this.activeSceneIds.clear();
        for (const id of previouslyActive) {
            if (this.scenes.has(id)) {
                this.activateScene(id);
            }
        }
    }
    getGroups() {
        return this.groups;
    }
    getAllScenes() {
        return Array.from(this.scenes.values());
    }
    getActiveSceneIds() {
        return Array.from(this.activeSceneIds);
    }
    activateScene(id) {
        const scene = this.scenes.get(id);
        if (!scene)
            return false;
        const channelStart = this.channelStarts.get(id) ?? 1;
        if (this.activeSceneIds.has(id)) {
            // Toggle off
            const zeros = Object.fromEntries(Object.keys(scene.channels).map((k) => [k, 0]));
            this.dmx.patchChannels(this.applyOffset(zeros, channelStart));
            this.activeSceneIds.delete(id);
            console.log(`[Scenes] Deactivated: ${scene.name}`);
        }
        else {
            // If the group is exclusive (default), deactivate any sibling scenes first
            const group = this.sceneToGroup.get(id);
            if (group && (group.exclusive ?? true)) {
                for (const sibling of group.scenes) {
                    if (sibling.id !== id)
                        this.deactivateScene(sibling.id);
                }
            }
            this.dmx.patchChannels(this.applyOffset(scene.channels, channelStart));
            this.activeSceneIds.add(id);
            console.log(`[Scenes] Activated: ${scene.name}${channelStart !== 1 ? ` (channelStart: ${channelStart})` : ''}`);
        }
        return true;
    }
    blackout() {
        this.dmx.blackout();
        this.activeSceneIds.clear();
        console.log('[Scenes] Blackout');
    }
}
exports.SceneManager = SceneManager;
