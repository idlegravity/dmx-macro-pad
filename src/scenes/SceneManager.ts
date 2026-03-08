import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DmxController } from '../dmx/DmxController.js';

export interface Scene {
  id: string;
  name: string;
  color?: string;
  channelStart?: number;
  channels: Record<string, number>;
}

export interface SceneGroup {
  id: string;
  name: string;
  exclusive?: boolean; // default true — only one scene in the group active at a time
  channelStart?: number;
  scenes: Scene[];
}

interface ScenesConfig {
  groups?: SceneGroup[];
  scenes?: Scene[]; // legacy flat format
}

export class SceneManager {
  private groups: SceneGroup[] = [];
  private scenes: Map<string, Scene> = new Map();
  private channelStarts: Map<string, number> = new Map();
  private sceneToGroup: Map<string, SceneGroup> = new Map();
  private activeSceneIds: Set<string> = new Set();
  private configPath: string;

  constructor(
    private readonly dmx: DmxController,
    configPath: string
  ) {
    this.configPath = resolve(configPath);
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const config: ScenesConfig = JSON.parse(raw);

      if (config.groups) {
        this.groups = config.groups;
      } else if (config.scenes) {
        // Legacy flat format — wrap in a single unnamed group
        this.groups = [{ id: '__default__', name: '', scenes: config.scenes }];
      } else {
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

      console.log(
        `[Scenes] Loaded ${this.scenes.size} scene(s) across ${this.groups.length} group(s) from ${this.configPath}`
      );
    } catch (err) {
      console.error('[Scenes] Failed to load config:', err);
    }
  }

  /** Apply channelStart offset to a channel map (1-indexed: actualChannel = channelStart + ch - 1). */
  private applyOffset(channels: Record<string, number>, channelStart: number): Record<string, number> {
    if (channelStart === 1) return channels;
    return Object.fromEntries(
      Object.entries(channels).map(([ch, val]) => [String(parseInt(ch, 10) + channelStart - 1), val])
    );
  }

  /** Deactivate a scene without toggling — always turns it off. */
  private deactivateScene(id: string): void {
    const scene = this.scenes.get(id);
    if (!scene || !this.activeSceneIds.has(id)) return;
    const channelStart = this.channelStarts.get(id) ?? 1;
    const zeros = Object.fromEntries(Object.keys(scene.channels).map((k) => [k, 0]));
    this.dmx.patchChannels(this.applyOffset(zeros, channelStart));
    this.activeSceneIds.delete(id);
    console.log(`[Scenes] Deactivated: ${scene.name}`);
  }

  /** Reload config from disk (call on SIGHUP). */
  reload(): void {
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

  getGroups(): SceneGroup[] {
    return this.groups;
  }

  getAllScenes(): Scene[] {
    return Array.from(this.scenes.values());
  }

  getActiveSceneIds(): string[] {
    return Array.from(this.activeSceneIds);
  }

  activateScene(id: string): boolean {
    const scene = this.scenes.get(id);
    if (!scene) return false;

    const channelStart = this.channelStarts.get(id) ?? 1;

    if (this.activeSceneIds.has(id)) {
      // Toggle off
      const zeros = Object.fromEntries(Object.keys(scene.channels).map((k) => [k, 0]));
      this.dmx.patchChannels(this.applyOffset(zeros, channelStart));
      this.activeSceneIds.delete(id);
      console.log(`[Scenes] Deactivated: ${scene.name}`);
    } else {
      // If the group is exclusive (default), deactivate any sibling scenes first
      const group = this.sceneToGroup.get(id);
      if (group && (group.exclusive ?? true)) {
        for (const sibling of group.scenes) {
          if (sibling.id !== id) this.deactivateScene(sibling.id);
        }
      }

      this.dmx.patchChannels(this.applyOffset(scene.channels, channelStart));
      this.activeSceneIds.add(id);
      console.log(`[Scenes] Activated: ${scene.name}${channelStart !== 1 ? ` (channelStart: ${channelStart})` : ''}`);
    }
    return true;
  }

  blackout(): void {
    this.dmx.blackout();
    this.activeSceneIds.clear();
    console.log('[Scenes] Blackout');
  }
}
