// ── WebGPU Compute Abstraction ──────────────────────────────────────
// General-purpose GPU compute class. Create buffers, run WGSL shaders,
// read results. Handles device lost events and auto-recovery.

// ── Types ────────────────────────────────────────────────────────────

export interface ShaderBinding {
  binding: number;
  buffer: GPUBuffer;
}

export interface WorkgroupSize {
  x: number;
  y?: number;
  z?: number;
}

// ── Helper: Strip undefined from descriptor objects ─────────────────
// WebGPU descriptors use exactOptionalPropertyTypes — we cannot pass
// label: undefined. This helper builds descriptors cleanly.

function withLabel<T extends Record<string, unknown>>(
  obj: T,
  label: string | undefined,
): T {
  if (label !== undefined) {
    return { ...obj, label };
  }
  return obj;
}

// ── WebGPU Compute Class ────────────────────────────────────────────

export class WebGPUCompute {
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private _isInitialized = false;
  private _isRecovering = false;

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  // ── Initialization ──────────────────────────────────────────────

  async init(): Promise<void> {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      throw new Error("WebGPU is not supported in this environment");
    }

    const gpu = navigator.gpu;

    this.adapter = await gpu.requestAdapter({
      powerPreference: "high-performance",
    });

    if (!this.adapter) {
      throw new Error("Failed to request WebGPU adapter");
    }

    // Request device with maximum limits for compute
    const requiredFeatures: GPUFeatureName[] = [];
    if (this.adapter.features.has("shader-f16")) {
      requiredFeatures.push("shader-f16");
    }
    if (this.adapter.features.has("timestamp-query")) {
      requiredFeatures.push("timestamp-query");
    }

    this.device = await this.adapter.requestDevice({
      requiredFeatures,
      requiredLimits: {
        maxStorageBufferBindingSize: this.adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: this.adapter.limits.maxBufferSize,
        maxComputeWorkgroupsPerDimension: this.adapter.limits.maxComputeWorkgroupsPerDimension,
        maxComputeInvocationsPerWorkgroup: this.adapter.limits.maxComputeInvocationsPerWorkgroup,
        maxComputeWorkgroupStorageSize: this.adapter.limits.maxComputeWorkgroupStorageSize,
      },
    });

    // Handle device lost — attempt recovery
    this.device.lost.then((info) => {
      console.error(`WebGPU device lost: ${info.reason} — ${info.message}`);
      this._isInitialized = false;

      // Only auto-recover if the loss was not intentional
      if (info.reason !== "destroyed") {
        this.recover();
      }
    });

    this._isInitialized = true;
  }

  // ── Auto-Recovery ─────────────────────────────────────────────────

  private async recover(): Promise<void> {
    if (this._isRecovering) return;
    this._isRecovering = true;

    try {
      // Clean up old references
      this.device = null;
      this.adapter = null;

      // Wait a frame before retrying
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      await this.init();
      console.info("WebGPU device recovered successfully");
    } catch (error) {
      console.error("WebGPU device recovery failed:", error);
    } finally {
      this._isRecovering = false;
    }
  }

  // ── Buffer Operations ─────────────────────────────────────────────

  private getDevice(): GPUDevice {
    if (!this.device || !this._isInitialized) {
      throw new Error("WebGPU device not initialized. Call init() first.");
    }
    return this.device;
  }

  createBuffer(
    data: ArrayBuffer | ArrayBufferView,
    usage: GPUBufferUsageFlags,
    label?: string,
  ): GPUBuffer {
    const device = this.getDevice();
    const byteLength = data instanceof ArrayBuffer ? data.byteLength : data.byteLength;

    // Ensure size is aligned to 4 bytes (WebGPU requirement)
    const alignedSize = Math.ceil(byteLength / 4) * 4;

    const descriptor: GPUBufferDescriptor = withLabel(
      { size: alignedSize, usage, mappedAtCreation: true },
      label,
    );
    const buffer = device.createBuffer(descriptor);

    const mapped = buffer.getMappedRange();
    const src = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    new Uint8Array(mapped).set(src);
    buffer.unmap();

    return buffer;
  }

  createEmptyBuffer(
    size: number,
    usage: GPUBufferUsageFlags,
    label?: string,
  ): GPUBuffer {
    const device = this.getDevice();
    const alignedSize = Math.ceil(size / 4) * 4;

    const descriptor: GPUBufferDescriptor = withLabel(
      { size: alignedSize, usage },
      label,
    );
    return device.createBuffer(descriptor);
  }

  // ── Shader Execution ──────────────────────────────────────────────

  async runShader(
    code: string,
    bindings: ShaderBinding[],
    workgroups: WorkgroupSize,
    label?: string,
  ): Promise<void> {
    const device = this.getDevice();

    const shaderDescriptor: GPUShaderModuleDescriptor = withLabel({ code }, label ? `${label}-shader` : undefined);
    const shaderModule = device.createShaderModule(shaderDescriptor);

    // Check for compilation errors
    const compilationInfo = await shaderModule.getCompilationInfo();
    const errors = compilationInfo.messages.filter((m) => m.type === "error");
    if (errors.length > 0) {
      const errorMessages = errors.map((e) => `Line ${e.lineNum}: ${e.message}`).join("\n");
      throw new Error(`WGSL compilation failed:\n${errorMessages}`);
    }

    // Create bind group layout entries
    // Use numeric constants for GPUShaderStage and GPUBufferBindingType
    // to avoid reliance on global namespace objects that may not exist at compile time
    const SHADER_STAGE_COMPUTE = 0x4;
    const layoutEntries: GPUBindGroupLayoutEntry[] = bindings.map((b) => ({
      binding: b.binding,
      visibility: SHADER_STAGE_COMPUTE,
      buffer: { type: "storage" as const },
    }));

    const bindGroupLayout = device.createBindGroupLayout(
      withLabel({ entries: layoutEntries }, label ? `${label}-layout` : undefined),
    );

    const pipelineLayout = device.createPipelineLayout(
      withLabel({ bindGroupLayouts: [bindGroupLayout] }, label ? `${label}-pipeline-layout` : undefined),
    );

    const pipeline = device.createComputePipeline(
      withLabel(
        {
          layout: pipelineLayout,
          compute: { module: shaderModule, entryPoint: "main" },
        },
        label ? `${label}-pipeline` : undefined,
      ),
    );

    const bindGroup = device.createBindGroup(
      withLabel(
        {
          layout: bindGroupLayout,
          entries: bindings.map((b) => ({
            binding: b.binding,
            resource: { buffer: b.buffer },
          })),
        },
        label ? `${label}-bindgroup` : undefined,
      ),
    );

    const commandEncoder = device.createCommandEncoder(
      label !== undefined ? { label: `${label}-encoder` } : {},
    );

    const passEncoder = commandEncoder.beginComputePass(
      label !== undefined ? { label: `${label}-pass` } : {},
    );

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(
      workgroups.x,
      workgroups.y ?? 1,
      workgroups.z ?? 1,
    );
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  }

  // ── Read Results ──────────────────────────────────────────────────

  async readBuffer(buffer: GPUBuffer): Promise<ArrayBuffer> {
    const device = this.getDevice();

    // GPUBufferUsage constants as numeric values
    const MAP_READ = 0x0001;
    const COPY_DST = 0x0008;

    const stagingBuffer = device.createBuffer({
      label: "staging-read",
      size: buffer.size,
      usage: MAP_READ | COPY_DST,
    });

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(buffer, 0, stagingBuffer, 0, buffer.size);
    device.queue.submit([commandEncoder.finish()]);

    // GPUMapMode.READ = 0x0001
    const MAP_MODE_READ = 0x0001;
    await stagingBuffer.mapAsync(MAP_MODE_READ);
    const result = stagingBuffer.getMappedRange().slice(0);
    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return result;
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  destroy(): void {
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.adapter = null;
    this._isInitialized = false;
  }
}
