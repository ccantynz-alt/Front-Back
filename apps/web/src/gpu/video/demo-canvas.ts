/**
 * Demo canvas generator for showcasing video effects without requiring a real video file.
 * Renders animated gradients, shapes, and patterns onto a canvas at 60fps.
 */

export interface DemoCanvasOptions {
  readonly width: number;
  readonly height: number;
}

export class DemoCanvasGenerator {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private animationId: number | null;
  private startTime: number;
  private _running: boolean;
  private onFrameCallback: ((time: number) => void) | null;

  constructor(canvas: HTMLCanvasElement, options: DemoCanvasOptions) {
    this.canvas = canvas;
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get Canvas2D context for demo generator");
    }
    this.ctx = ctx;
    this.animationId = null;
    this.startTime = 0;
    this._running = false;
    this.onFrameCallback = null;
  }

  get running(): boolean {
    return this._running;
  }

  /** Set a callback that fires on every frame with elapsed time in seconds */
  onFrame(cb: (timeSeconds: number) => void): void {
    this.onFrameCallback = cb;
  }

  /** Start the animation loop */
  start(): void {
    if (this._running) return;
    this._running = true;
    this.startTime = performance.now();
    this.loop();
  }

  /** Stop the animation loop */
  stop(): void {
    this._running = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /** Seek to a specific time and render a single frame */
  seekTo(timeSeconds: number): void {
    this.renderFrame(timeSeconds);
    if (this.onFrameCallback) {
      this.onFrameCallback(timeSeconds);
    }
  }

  /** Get the current frame as ImageData */
  getFrameData(): ImageData {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Render processed ImageData back to the canvas */
  putFrameData(imageData: ImageData): void {
    this.ctx.putImageData(imageData, 0, 0);
  }

  destroy(): void {
    this.stop();
    this.onFrameCallback = null;
  }

  private loop(): void {
    if (!this._running) return;
    const elapsed = (performance.now() - this.startTime) / 1000;
    this.renderFrame(elapsed);
    if (this.onFrameCallback) {
      this.onFrameCallback(elapsed);
    }
    this.animationId = requestAnimationFrame(() => this.loop());
  }

  private renderFrame(t: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    // Background gradient that shifts over time
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    const hue1 = (t * 30) % 360;
    const hue2 = (hue1 + 120) % 360;
    const hue3 = (hue1 + 240) % 360;
    bgGrad.addColorStop(0, `hsl(${hue1}, 70%, 40%)`);
    bgGrad.addColorStop(0.5, `hsl(${hue2}, 80%, 50%)`);
    bgGrad.addColorStop(1, `hsl(${hue3}, 70%, 40%)`);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Radial gradient spotlight that moves
    const spotX = w * 0.5 + Math.cos(t * 0.8) * w * 0.3;
    const spotY = h * 0.5 + Math.sin(t * 0.6) * h * 0.3;
    const spotGrad = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, w * 0.35);
    spotGrad.addColorStop(0, "rgba(255, 255, 255, 0.3)");
    spotGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = spotGrad;
    ctx.fillRect(0, 0, w, h);

    // Animated circles
    for (let i = 0; i < 6; i++) {
      const angle = t * (0.5 + i * 0.15) + (i * Math.PI * 2) / 6;
      const radius = 20 + i * 10;
      const cx = w * 0.5 + Math.cos(angle) * (w * 0.25);
      const cy = h * 0.5 + Math.sin(angle) * (h * 0.25);
      const circHue = (hue1 + i * 60) % 360;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${circHue}, 90%, 65%, 0.7)`;
      ctx.fill();

      // Border
      ctx.lineWidth = 2;
      ctx.strokeStyle = `hsla(${circHue}, 90%, 85%, 0.9)`;
      ctx.stroke();
    }

    // Animated rectangle/bar
    const barY = h * 0.75;
    const barWidth = w * 0.6;
    const barX = (w - barWidth) / 2;
    const barHeight = 30;
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.roundRect(barX, barY, barWidth, barHeight, 8);
    ctx.fill();

    // Fill portion of the bar based on time
    const fillPct = (Math.sin(t * 0.5) + 1) / 2;
    const fillGrad = ctx.createLinearGradient(barX, barY, barX + barWidth * fillPct, barY);
    fillGrad.addColorStop(0, `hsl(${hue1}, 90%, 60%)`);
    fillGrad.addColorStop(1, `hsl(${hue2}, 90%, 60%)`);
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * fillPct, barHeight, 8);
    ctx.fill();

    // Moving sine wave
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x++) {
      const y = h * 0.4 + Math.sin((x / w) * Math.PI * 4 + t * 2) * 30;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Floating text
    ctx.font = `bold ${Math.max(16, w * 0.04)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillText("Marco Reid", w * 0.5, h * 0.2);

    ctx.font = `${Math.max(12, w * 0.025)}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillText("Video Effects Demo", w * 0.5, h * 0.2 + w * 0.04);
  }
}

/** Duration of the demo "video" in seconds */
export const DEMO_DURATION = 30;
