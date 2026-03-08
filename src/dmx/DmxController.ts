import { SerialPort } from 'serialport';

const DMX_CHANNELS = 512;
const FRAME_INTERVAL_MS = 25; // ~40 Hz
const BREAK_MS = 1;            // >88µs min; 1ms is valid and reliable with Node timers
const MAB_MS = 1;              // mark-after-break

export class DmxController {
  private port: SerialPort | null = null;
  private channels: Uint8Array = new Uint8Array(DMX_CHANNELS);
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private sending = false;

  constructor(private readonly devicePath: string) {}

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort(
        {
          path: this.devicePath,
          baudRate: 250000,
          dataBits: 8,
          stopBits: 2,
          parity: 'none',
          autoOpen: false,
        },
        (err) => {
          if (err) reject(err);
        }
      );

      this.port.open((err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`[DMX] Port ${this.devicePath} opened`);
        this.startFrameLoop();
        resolve();
      });
    });
  }

  /** Replace all 512 channels with the provided values. */
  setAllChannels(values: Uint8Array): void {
    if (values.length !== DMX_CHANNELS) {
      throw new Error(`Expected ${DMX_CHANNELS} channel values, got ${values.length}`);
    }
    this.channels.set(values);
  }

  /** Patch a sparse set of channels (1-indexed). */
  patchChannels(patch: Record<string, number>): void {
    for (const [key, value] of Object.entries(patch)) {
      const ch = parseInt(key, 10);
      if (ch >= 1 && ch <= DMX_CHANNELS) {
        this.channels[ch - 1] = Math.max(0, Math.min(255, value));
      }
    }
  }

  /** Zero all channels (blackout). */
  blackout(): void {
    this.channels.fill(0);
  }

  /** Return a copy of the current channel state. */
  getChannels(): Uint8Array {
    return new Uint8Array(this.channels);
  }

  private startFrameLoop(): void {
    this.frameTimer = setInterval(() => {
      void this.sendFrame();
    }, FRAME_INTERVAL_MS);
  }

  private async sendFrame(): Promise<void> {
    if (this.sending || !this.port?.isOpen) return;
    this.sending = true;
    try {
      await this.sendBreak();
      await this.delay(MAB_MS);
      await this.writePacket();
    } catch (err) {
      console.error('[DMX] Frame error:', err);
    } finally {
      this.sending = false;
    }
  }

  private sendBreak(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port!.set({ brk: true }, (err) => {
        if (err) { reject(err); return; }
        setTimeout(() => {
          this.port!.set({ brk: false }, (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        }, BREAK_MS);
      });
    });
  }

  private writePacket(): Promise<void> {
    // DMX packet: start code 0x00 + 512 channel bytes
    const packet = Buffer.alloc(DMX_CHANNELS + 1);
    packet[0] = 0x00; // start code
    packet.set(this.channels, 1);

    return new Promise((resolve, reject) => {
      this.port!.write(packet, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    if (this.frameTimer) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
    return new Promise((resolve, reject) => {
      if (!this.port?.isOpen) { resolve(); return; }
      this.port.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
