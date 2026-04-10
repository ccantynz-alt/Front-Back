/**
 * WebGPU-accelerated video frame processor with Canvas2D fallback.
 * Detects GPU capabilities and routes processing accordingly.
 */

import { effectRegistry } from "./effects";
import { shaderSources } from "./shaders";
import type { AppliedEffect } from "./timeline";

export type ProcessorBackend = "webgpu" | "canvas2d";

export interface ProcessorStats {
  readonly backend: ProcessorBackend;
  readonly lastFrameTimeMs: number;
  readonly framesProcessed: number;
}

interface GPUPipelineEntry {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class VideoProcessor {
  private readonly backend: ProcessorBackend;
  private readonly canvas: OffscreenCanvas;
  private readonly ctx2d: OffscreenCanvasRenderingContext2D | null;
  private device: GPUDevice | null;
  private pipelineCache: Map<string, GPUPipelineEntry>;
  private lastFrameTimeMs: number;
  private framesProcessed: number;
  private _destroyed: boolean;

  private constructor(
    backend: ProcessorBackend,
    device: GPUDevice | null,
  ) {
    this.backend = backend;
    this.device = device;
    this.canvas = new OffscreenCanvas(1, 1);
    this.ctx2d = this.canvas.getContext("2d");
    this.pipelineCache = new Map();
    this.lastFrameTimeMs = 0;
    this.framesProcessed = 0;
    this._destroyed = false;
  }

  /** Detect WebGPU and create processor with best available backend */
  static async create(): Promise<VideoProcessor> {
    // Try WebGPU first
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      try {
        const gpu = navigator.gpu;
        const adapter = await gpu.requestAdapter();
        if (adapter) {
          const device = await adapter.requestDevice();
          return new VideoProcessor("webgpu", device);
        }
      } catch {
        // Fall through to Canvas2D
      }
    }
    return new VideoProcessor("canvas2d", null);
  }

  get stats(): ProcessorStats {
    return {
      backend: this.backend,
      lastFrameTimeMs: this.lastFrameTimeMs,
      framesProcessed: this.framesProcessed,
    };
  }

  get isWebGPU(): boolean {
    return this.backend === "webgpu";
  }

  /** Extract a single frame from video at the specified time */
  async extractFrame(video: HTMLVideoElement, time: number): Promise<ImageData> {
    return new Promise<ImageData>((resolve, reject) => {
      if (video.readyState < 2) {
        reject(new Error("Video not ready for frame extraction"));
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;

      if (w === 0 || h === 0) {
        reject(new Error("Video dimensions are zero"));
        return;
      }

      // If time matches current time, extract immediately
      if (Math.abs(video.currentTime - time) < 0.05) {
        this.drawVideoFrame(video, w, h);
        const imageData = this.ctx2d?.getImageData(0, 0, w, h);
        if (imageData) {
          resolve(imageData);
        } else {
          reject(new Error("Failed to get image data from canvas context"));
        }
        return;
      }

      // Seek to time, then extract
      const onSeeked = (): void => {
        video.removeEventListener("seeked", onSeeked);
        this.drawVideoFrame(video, w, h);
        const imageData = this.ctx2d?.getImageData(0, 0, w, h);
        if (imageData) {
          resolve(imageData);
        } else {
          reject(new Error("Failed to get image data from canvas context"));
        }
      };

      video.addEventListener("seeked", onSeeked);
      video.currentTime = time;
    });
  }

  private drawVideoFrame(video: HTMLVideoElement, w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx2d?.drawImage(video, 0, 0, w, h);
  }

  /** Apply a single effect to an ImageData frame */
  async applyEffect(frame: ImageData, effect: AppliedEffect): Promise<ImageData> {
    const start = performance.now();
    let result: ImageData;

    if (this.backend === "webgpu" && this.device && !this._destroyed) {
      result = await this.applyEffectGPU(frame, effect);
    } else {
      result = this.applyEffectCanvas(frame, effect);
    }

    this.lastFrameTimeMs = performance.now() - start;
    this.framesProcessed++;
    return result;
  }

  /** Apply multiple effects in sequence */
  async applyEffects(frame: ImageData, effects: readonly AppliedEffect[]): Promise<ImageData> {
    const start = performance.now();
    let current = frame;

    for (const effect of effects) {
      if (this.backend === "webgpu" && this.device && !this._destroyed) {
        current = await this.applyEffectGPU(current, effect);
      } else {
        current = this.applyEffectCanvas(current, effect);
      }
    }

    this.lastFrameTimeMs = performance.now() - start;
    this.framesProcessed++;
    return current;
  }

  /** Export a processed frame as a Blob */
  async exportFrame(frame: ImageData, format: string = "image/png"): Promise<Blob> {
    this.canvas.width = frame.width;
    this.canvas.height = frame.height;
    this.ctx2d?.putImageData(frame, 0, 0);
    return await this.canvas.convertToBlob({ type: format });
  }

  /** Process all frames in a segment for export */
  async processSegment(
    video: HTMLVideoElement,
    start: number,
    end: number,
    effects: readonly AppliedEffect[],
    onProgress: (pct: number) => void,
    fps: number = 30,
  ): Promise<Blob[]> {
    const blobs: Blob[] = [];
    const totalFrames = Math.ceil((end - start) * fps);
    const frameDuration = 1 / fps;

    for (let i = 0; i < totalFrames; i++) {
      const time = start + i * frameDuration;
      const frame = await this.extractFrame(video, time);
      const processed = effects.length > 0
        ? await this.applyEffects(frame, effects)
        : frame;
      const blob = await this.exportFrame(processed);
      blobs.push(blob);
      onProgress(((i + 1) / totalFrames) * 100);
    }

    return blobs;
  }

  /** Release GPU resources */
  destroy(): void {
    this._destroyed = true;
    this.pipelineCache.clear();
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
  }

  // ---- Private: WebGPU pipeline ----

  private getOrCreatePipeline(effectId: string): GPUPipelineEntry | undefined {
    if (!this.device) return undefined;

    const cached = this.pipelineCache.get(effectId);
    if (cached) return cached;

    const shaderCode = shaderSources[effectId];
    if (!shaderCode) return undefined;

    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    const entry: GPUPipelineEntry = { pipeline, bindGroupLayout };
    this.pipelineCache.set(effectId, entry);
    return entry;
  }

  private async applyEffectGPU(frame: ImageData, effect: AppliedEffect): Promise<ImageData> {
    const device = this.device;
    if (!device) return this.applyEffectCanvas(frame, effect);

    const pipelineEntry = this.getOrCreatePipeline(effect.effectId);
    if (!pipelineEntry) return this.applyEffectCanvas(frame, effect);

    const { pipeline, bindGroupLayout } = pipelineEntry;
    const pixelCount = frame.width * frame.height;

    // Pack RGBA bytes into u32 array for the shader
    const inputData = new Uint32Array(pixelCount);
    const pixels = frame.data;
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      inputData[i] =
        (pixels[offset] as number) |
        ((pixels[offset + 1] as number) << 8) |
        ((pixels[offset + 2] as number) << 16) |
        ((pixels[offset + 3] as number) << 24);
    }

    // Create GPU buffers
    const inputBuffer = device.createBuffer({
      size: inputData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(inputBuffer, 0, inputData);

    const outputBuffer = device.createBuffer({
      size: inputData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Params: value (f32), width (u32), height (u32), pad (u32)
    const paramsData = new ArrayBuffer(16);
    const paramsF32 = new Float32Array(paramsData, 0, 1);
    const paramsU32 = new Uint32Array(paramsData, 4, 3);
    paramsF32[0] = effect.params.value;
    paramsU32[0] = frame.width;
    paramsU32[1] = frame.height;
    paramsU32[2] = 0; // padding

    const paramsBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paramsBuffer, 0, paramsData);

    // Staging buffer for readback
    const stagingBuffer = device.createBuffer({
      size: inputData.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Create bind group
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ],
    });

    // Dispatch compute
    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(pixelCount / 256));
    pass.end();

    commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, inputData.byteLength);
    device.queue.submit([commandEncoder.finish()]);

    // Read back results
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Uint32Array(stagingBuffer.getMappedRange().slice(0));
    stagingBuffer.unmap();

    // Unpack u32 back to RGBA bytes
    const resultImage = new ImageData(frame.width, frame.height);
    const resultPixels = resultImage.data;
    for (let i = 0; i < pixelCount; i++) {
      const packed = resultData[i] as number;
      const offset = i * 4;
      resultPixels[offset] = packed & 0xff;
      resultPixels[offset + 1] = (packed >> 8) & 0xff;
      resultPixels[offset + 2] = (packed >> 16) & 0xff;
      resultPixels[offset + 3] = (packed >> 24) & 0xff;
    }

    // Cleanup buffers
    inputBuffer.destroy();
    outputBuffer.destroy();
    paramsBuffer.destroy();
    stagingBuffer.destroy();

    return resultImage;
  }

  private applyEffectCanvas(frame: ImageData, effect: AppliedEffect): ImageData {
    const definition = effectRegistry[effect.effectId];
    if (!definition) return frame;

    // Clone the image data so we do not mutate the original
    const clone = new ImageData(
      new Uint8ClampedArray(frame.data),
      frame.width,
      frame.height,
    );
    definition.apply(clone, effect.params);
    return clone;
  }
}
