/**
 * SolidJS video player component with custom controls,
 * keyboard shortcuts, and canvas overlay for processed frames.
 */

import { createSignal, onMount, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";

export interface VideoPlayerProps {
  /** Source URL for the video element. If not provided, only the canvas overlay is used. */
  readonly src?: string;
  /** Width of the player in pixels */
  readonly width?: number;
  /** Height of the player in pixels */
  readonly height?: number;
  /** Called when the video time updates */
  readonly onTimeUpdate?: (currentTime: number) => void;
  /** Called when the video metadata loads (duration available) */
  readonly onDurationChange?: (duration: number) => void;
  /** Called when play state changes */
  readonly onPlayStateChange?: (playing: boolean) => void;
  /** Ref callback for the canvas overlay element */
  readonly canvasRef?: (el: HTMLCanvasElement) => void;
  /** Ref callback for the video element */
  readonly videoRef?: (el: HTMLVideoElement) => void;
  /** External playing state control */
  readonly playing?: boolean;
  /** External current time control */
  readonly currentTime?: number;
  /** Duration override (for demo canvas mode without real video) */
  readonly duration?: number;
  /** Whether to show the video element (false = canvas-only mode) */
  readonly showVideo?: boolean;
  /** FPS counter value to display */
  readonly fps?: number;
  /** Backend label to display */
  readonly backendLabel?: string;
}

export function VideoPlayer(props: VideoPlayerProps): JSX.Element {
  let videoEl: HTMLVideoElement | undefined;
  let canvasEl: HTMLCanvasElement | undefined;
  let containerEl: HTMLDivElement | undefined;

  const [isPlaying, setIsPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(props.duration ?? 0);
  const [volume, setVolume] = createSignal(1);
  const [isMuted, setIsMuted] = createSignal(false);
  const [isFullscreen, setIsFullscreen] = createSignal(false);

  const effectivePlaying = (): boolean => props.playing ?? isPlaying();
  const effectiveTime = (): number => props.currentTime ?? currentTime();
  const effectiveDuration = (): number => props.duration ?? duration();

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const togglePlay = (): void => {
    if (videoEl && props.showVideo !== false) {
      if (videoEl.paused) {
        videoEl.play();
      } else {
        videoEl.pause();
      }
    }
    const next = !effectivePlaying();
    setIsPlaying(next);
    props.onPlayStateChange?.(next);
  };

  const seek = (time: number): void => {
    const clamped = Math.max(0, Math.min(effectiveDuration(), time));
    if (videoEl && props.showVideo !== false) {
      videoEl.currentTime = clamped;
    }
    setCurrentTime(clamped);
    props.onTimeUpdate?.(clamped);
  };

  const toggleMute = (): void => {
    const next = !isMuted();
    setIsMuted(next);
    if (videoEl) {
      videoEl.muted = next;
    }
  };

  const changeVolume = (v: number): void => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    if (videoEl) {
      videoEl.volume = clamped;
    }
  };

  const toggleFullscreen = (): void => {
    if (!containerEl) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerEl.requestFullscreen();
    }
  };

  const handleKeydown = (e: KeyboardEvent): void => {
    // Only handle when the player or its children are focused
    if (!containerEl?.contains(document.activeElement) && document.activeElement !== containerEl) {
      return;
    }

    switch (e.key) {
      case " ":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        seek(effectiveTime() - 5);
        break;
      case "ArrowRight":
        e.preventDefault();
        seek(effectiveTime() + 5);
        break;
      case "ArrowUp":
        e.preventDefault();
        changeVolume(volume() + 0.1);
        break;
      case "ArrowDown":
        e.preventDefault();
        changeVolume(volume() - 0.1);
        break;
      case "f":
      case "F":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "m":
      case "M":
        e.preventDefault();
        toggleMute();
        break;
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);

    const handleFullscreenChange = (): void => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    if (canvasEl && props.canvasRef) {
      props.canvasRef(canvasEl);
    }
    if (videoEl && props.videoRef) {
      props.videoRef(videoEl);
    }

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    });
  });

  const playerWidth = (): number => props.width ?? 640;
  const playerHeight = (): number => props.height ?? 360;

  return (
    <div
      ref={containerEl}
      tabIndex={0}
      class="video-player-container"
      style={{
        width: `${playerWidth()}px`,
        "max-width": "100%",
        outline: "none",
        position: "relative",
        background: "var(--color-bg)",
        "border-radius": "8px",
        overflow: "hidden",
      }}
    >
      {/* Video layer (hidden in canvas-only mode) */}
      <Show when={props.showVideo !== false && props.src}>
        <video
          ref={videoEl}
          src={props.src}
          width={playerWidth()}
          height={playerHeight()}
          style={{ display: "block", width: "100%", height: "auto" }}
          onTimeUpdate={() => {
            if (videoEl) {
              setCurrentTime(videoEl.currentTime);
              props.onTimeUpdate?.(videoEl.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (videoEl) {
              setDuration(videoEl.duration);
              props.onDurationChange?.(videoEl.duration);
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            props.onPlayStateChange?.(true);
          }}
          onPause={() => {
            setIsPlaying(false);
            props.onPlayStateChange?.(false);
          }}
        />
      </Show>

      {/* Canvas overlay for processed frames / demo content */}
      <canvas
        ref={canvasEl}
        width={playerWidth()}
        height={playerHeight()}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          position: props.showVideo !== false && props.src ? "absolute" : "relative",
          top: "0",
          left: "0",
        }}
      />

      {/* Stats overlay */}
      <div
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          display: "flex",
          gap: "6px",
        }}
      >
        <Show when={props.fps !== undefined}>
          <span
            style={{
              background: "rgba(0,0,0,0.6)",
              color: "var(--color-success)",
              padding: "2px 8px",
              "border-radius": "4px",
              "font-size": "12px",
              "font-family": "monospace",
            }}
          >
            {Math.round(props.fps ?? 0)} FPS
          </span>
        </Show>
        <Show when={props.backendLabel}>
          <span
            style={{
              background: "rgba(0,0,0,0.6)",
              color: props.backendLabel === "WebGPU" ? "var(--color-primary)" : "var(--color-warning)",
              padding: "2px 8px",
              "border-radius": "4px",
              "font-size": "12px",
              "font-family": "monospace",
            }}
          >
            {props.backendLabel}
          </span>
        </Show>
      </div>

      {/* Controls bar */}
      <div
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          right: "0",
          background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
          padding: "24px 12px 8px",
          display: "flex",
          "flex-direction": "column",
          gap: "4px",
        }}
      >
        {/* Seek bar */}
        <input
          type="range"
          min={0}
          max={effectiveDuration() || 1}
          step={0.1}
          value={effectiveTime()}
          onInput={(e) => seek(Number(e.currentTarget.value))}
          aria-label="Seek video"
          style={{
            width: "100%",
            height: "4px",
            cursor: "pointer",
            "accent-color": "var(--color-primary)",
          }}
        />

        {/* Control buttons row */}
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "8px",
            color: "var(--color-text)",
            "font-size": "13px",
          }}
        >
          <button
            type="button"
            onClick={togglePlay}
            aria-label={effectivePlaying() ? "Pause" : "Play"}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text)",
              cursor: "pointer",
              padding: "4px 8px",
              "font-size": "14px",
            }}
          >
            {effectivePlaying() ? "||" : "\u25B6"}
          </button>

          <span style={{ "font-family": "monospace", "min-width": "80px" }}>
            {formatTime(effectiveTime())} / {formatTime(effectiveDuration())}
          </span>

          <div style={{ flex: "1" }} />

          {/* Volume */}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted() || volume() === 0 ? "Unmute" : "Mute"}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text)",
              cursor: "pointer",
              padding: "4px",
              "font-size": "13px",
            }}
          >
            {isMuted() || volume() === 0 ? "MUTE" : "VOL"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted() ? 0 : volume()}
            onInput={(e) => changeVolume(Number(e.currentTarget.value))}
            aria-label="Volume"
            style={{ width: "60px", "accent-color": "var(--color-primary)" }}
          />

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen() ? "Exit fullscreen" : "Enter fullscreen"}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text)",
              cursor: "pointer",
              padding: "4px 8px",
              "font-size": "13px",
            }}
          >
            {isFullscreen() ? "EXIT" : "[ ]"}
          </button>
        </div>
      </div>
    </div>
  );
}
