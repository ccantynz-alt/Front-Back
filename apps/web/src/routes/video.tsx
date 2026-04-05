import { Title } from "@solidjs/meta";
import { Show, For, createSignal, onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text, Badge, Separator } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { VideoPlayer } from "../components/VideoPlayer";
import { VideoProcessor } from "../gpu/video/processor";
import type { ProcessorBackend } from "../gpu/video/processor";
import { allEffects, effectRegistry } from "../gpu/video/effects";
import type { VideoEffectDefinition } from "../gpu/video/effects";
import { Timeline } from "../gpu/video/timeline";
import type { AppliedEffect } from "../gpu/video/timeline";
import { DemoCanvasGenerator, DEMO_DURATION } from "../gpu/video/demo-canvas";

interface EffectState {
  readonly definition: VideoEffectDefinition;
  active: boolean;
  value: number;
}

export default function VideoPage(): JSX.Element {
  const [videoLoaded, setVideoLoaded] = createSignal(false);
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [fps, setFps] = createSignal(0);
  const [backend, setBackend] = createSignal<ProcessorBackend>("canvas2d");
  const [processorReady, setProcessorReady] = createSignal(false);
  const [exporting, setExporting] = createSignal(false);
  const [effectStates, setEffectStates] = createSignal<EffectState[]>(
    allEffects.map((def) => ({
      definition: def,
      active: false,
      value: def.defaultParams.value,
    })),
  );

  let processor: VideoProcessor | null = null;
  let demoGenerator: DemoCanvasGenerator | null = null;
  let playerCanvas: HTMLCanvasElement | null = null;
  let timeline: Timeline | null = null;
  let processingFrame = false;
  let frameCount = 0;
  let lastFpsTime = 0;
  let animationId: number | null = null;

  // Initialize the processor on mount
  onMount(async () => {
    try {
      processor = await VideoProcessor.create();
      setBackend(processor.stats.backend);
      setProcessorReady(true);
    } catch {
      // Processor creation failed; we will not have effects processing
      setProcessorReady(false);
    }
  });

  onCleanup(() => {
    demoGenerator?.destroy();
    processor?.destroy();
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
    }
  });

  /** Collect the currently active effects as AppliedEffect[] for the processor */
  const getActiveEffects = (): AppliedEffect[] => {
    const result: AppliedEffect[] = [];
    for (const es of effectStates()) {
      if (es.active) {
        result.push({
          id: es.definition.id,
          effectId: es.definition.id,
          params: { value: es.value },
        });
      }
    }
    return result;
  };

  /** Process the current demo frame through active effects and render to canvas */
  const processAndRender = async (): Promise<void> => {
    if (processingFrame || !demoGenerator || !playerCanvas || !processor) return;
    processingFrame = true;

    try {
      const sourceData = demoGenerator.getFrameData();
      const effects = getActiveEffects();

      let output: ImageData;
      if (effects.length > 0) {
        output = await processor.applyEffects(sourceData, effects);
      } else {
        output = sourceData;
      }

      // Render to the visible canvas
      const ctx = playerCanvas.getContext("2d");
      if (ctx) {
        ctx.putImageData(output, 0, 0);
      }

      // FPS tracking
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsTime = now;
      }
    } catch {
      // Silently handle frame processing errors
    }

    processingFrame = false;
  };

  /** The animation/processing loop that runs when effects are active and demo is loaded */
  const startProcessingLoop = (): void => {
    if (animationId !== null) return;

    lastFpsTime = performance.now();
    frameCount = 0;

    const loop = (): void => {
      processAndRender();
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);
  };

  const stopProcessingLoop = (): void => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };

  /** Called by the demo generator on each rendered frame (when playing or seeking) */
  const onDemoFrame = (timeSeconds: number): void => {
    // Wrap time around the demo duration
    const wrappedTime = timeSeconds % DEMO_DURATION;
    setCurrentTime(wrappedTime);
  };

  /** Load the demo canvas and start animation */
  const loadDemo = (): void => {
    if (!playerCanvas) return;

    // Initialize timeline
    timeline = new Timeline(DEMO_DURATION);
    timeline.addSegment(0, DEMO_DURATION);

    // Create the demo generator targeting a hidden canvas; we will read from it
    // and render processed frames to the player canvas
    const hiddenCanvas = document.createElement("canvas");
    demoGenerator = new DemoCanvasGenerator(hiddenCanvas, {
      width: playerCanvas.width,
      height: playerCanvas.height,
    });

    demoGenerator.onFrame(onDemoFrame);
    demoGenerator.start();
    setVideoLoaded(true);
    setPlaying(true);

    // Start the processing loop
    startProcessingLoop();
  };

  const togglePlay = (): void => {
    if (!demoGenerator) return;

    if (playing()) {
      demoGenerator.stop();
      stopProcessingLoop();
      setPlaying(false);
    } else {
      demoGenerator.start();
      startProcessingLoop();
      setPlaying(true);
    }
  };

  const handleSeek = (time: number): void => {
    setCurrentTime(time);
    if (demoGenerator) {
      demoGenerator.seekTo(time);
      // Process this single frame
      processAndRender();
    }
  };

  const toggleEffect = (id: string): void => {
    setEffectStates(
      effectStates().map((es) =>
        es.definition.id === id ? { ...es, active: !es.active } : es,
      ),
    );
  };

  const updateEffectValue = (id: string, value: number): void => {
    setEffectStates(
      effectStates().map((es) =>
        es.definition.id === id ? { ...es, value } : es,
      ),
    );
  };

  /** Export the current frame as a downloadable PNG */
  const exportFrame = async (): Promise<void> => {
    if (!processor || !demoGenerator) return;
    setExporting(true);

    try {
      const sourceData = demoGenerator.getFrameData();
      const effects = getActiveEffects();
      const output = effects.length > 0
        ? await processor.applyEffects(sourceData, effects)
        : sourceData;

      const blob = await processor.exportFrame(output, "image/png");
      const url = URL.createObjectURL(blob);

      // Trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = `video-frame-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Export failed
    }

    setExporting(false);
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const activeEffectCount = (): number =>
    effectStates().filter((e) => e.active).length;

  return (
    <ProtectedRoute>
      <Title>Video Editor - Back to the Future</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="horizontal" justify="between" align="center">
          <Stack direction="vertical" gap="xs">
            <Text variant="h1" weight="bold">Video Editor</Text>
            <Text variant="body" class="text-muted">
              WebGPU-accelerated video processing in the browser
            </Text>
          </Stack>
          <Stack direction="horizontal" gap="sm" align="center">
            <Show when={processorReady()}>
              <Badge
                variant={backend() === "webgpu" ? "success" : "warning"}
                size="sm"
              >
                {backend() === "webgpu" ? "WebGPU Active" : "Canvas2D Fallback"}
              </Badge>
            </Show>
            <Show when={videoLoaded()}>
              <Badge variant="default" size="sm">
                {activeEffectCount()} effect{activeEffectCount() !== 1 ? "s" : ""} active
              </Badge>
            </Show>
          </Stack>
        </Stack>

        <div class="video-editor-layout">
          {/* Video Preview */}
          <Card padding="none" class="video-preview-card">
            <Show
              when={videoLoaded()}
              fallback={
                <Stack
                  direction="vertical"
                  align="center"
                  justify="center"
                  class="video-upload-area"
                >
                  <Text variant="h3" class="text-muted">
                    Video Effects Processor
                  </Text>
                  <Text variant="caption" class="text-muted">
                    Load the demo to see real-time GPU-accelerated effects
                  </Text>
                  <Button
                    variant="primary"
                    onClick={loadDemo}
                    disabled={!processorReady()}
                  >
                    {processorReady() ? "Load Demo Canvas" : "Initializing processor..."}
                  </Button>
                </Stack>
              }
            >
              <Stack direction="vertical" gap="none">
                <VideoPlayer
                  width={640}
                  height={360}
                  showVideo={false}
                  playing={playing()}
                  currentTime={currentTime()}
                  duration={DEMO_DURATION}
                  fps={fps()}
                  backendLabel={backend() === "webgpu" ? "WebGPU" : "Canvas2D"}
                  canvasRef={(el) => {
                    playerCanvas = el;
                  }}
                  onPlayStateChange={(p) => {
                    if (p !== playing()) togglePlay();
                  }}
                  onTimeUpdate={(t) => handleSeek(t)}
                />
              </Stack>
            </Show>
          </Card>

          {/* Effects Panel */}
          <Card padding="md" class="effects-panel">
            <Stack direction="vertical" gap="md">
              <Text variant="h4" weight="semibold">Effects</Text>
              <For each={effectStates()}>
                {(effectState) => (
                  <div>
                    <button
                      type="button"
                      class={`effect-item ${effectState.active ? "effect-active" : ""}`}
                      onClick={() => toggleEffect(effectState.definition.id)}
                    >
                      <Stack direction="vertical" gap="xs">
                        <Text variant="body" weight="semibold">
                          {effectState.definition.name}
                        </Text>
                        <Text variant="caption" class="text-muted">
                          {effectState.definition.description}
                        </Text>
                      </Stack>
                    </button>
                    {/* Slider for effects that have a range */}
                    <Show when={effectState.active && effectState.definition.min !== effectState.definition.max}>
                      <div style={{ padding: "4px 12px 8px" }}>
                        <input
                          type="range"
                          min={effectState.definition.min}
                          max={effectState.definition.max}
                          step={1}
                          value={effectState.value}
                          onInput={(e) =>
                            updateEffectValue(
                              effectState.definition.id,
                              Number(e.currentTarget.value),
                            )
                          }
                          style={{ width: "100%", "accent-color": "#6366f1" }}
                        />
                        <Text variant="caption" class="text-muted">
                          Value: {effectState.value}
                        </Text>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
              <Separator />
              <Stack direction="vertical" gap="sm">
                <Button
                  variant="primary"
                  disabled={!videoLoaded() || exporting()}
                  class="w-full"
                  onClick={exportFrame}
                >
                  {exporting() ? "Exporting..." : "Download Frame (PNG)"}
                </Button>
                <Show when={videoLoaded()}>
                  <Text variant="caption" class="text-muted" align="center">
                    FPS: {fps()} | Processed: {processor?.stats.framesProcessed ?? 0} frames
                  </Text>
                </Show>
              </Stack>
            </Stack>
          </Card>
        </div>
      </Stack>
    </ProtectedRoute>
  );
}
