import { Show, For, createSignal, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";
import { Button, Card, Stack, Text, Badge, Separator } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { showToast } from "../components/Toast";

interface VideoEffect {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

interface Collaborator {
  id: string;
  name: string;
  color: string;
  initials: string;
  online: boolean;
  cursorTime: number;
}

interface TimelineComment {
  id: string;
  author: string;
  color: string;
  time: number;
  text: string;
  timestamp: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
}

const defaultEffects: VideoEffect[] = [
  { id: "brightness", name: "Brightness", description: "Adjust brightness level", active: false },
  { id: "contrast", name: "Contrast", description: "Adjust contrast level", active: false },
  { id: "saturation", name: "Saturation", description: "Adjust color saturation", active: false },
  { id: "blur", name: "Blur", description: "Apply Gaussian blur", active: false },
  { id: "sharpen", name: "Sharpen", description: "Enhance edge sharpness", active: false },
  { id: "grayscale", name: "Grayscale", description: "Convert to grayscale", active: false },
];

const MOCK_COLLABORATORS: Collaborator[] = [
  { id: "1", name: "Craig", color: "#818cf8", initials: "CR", online: true, cursorTime: 34 },
  { id: "2", name: "AI Agent", color: "#34d399", initials: "AI", online: true, cursorTime: 52 },
  { id: "3", name: "Sarah", color: "#f472b6", initials: "SA", online: true, cursorTime: 18 },
  { id: "4", name: "Marcus", color: "#fbbf24", initials: "MA", online: false, cursorTime: 0 },
];

const MOCK_COMMENTS: TimelineComment[] = [
  { id: "c1", author: "Craig", color: "#818cf8", time: 12, text: "Transition needs to be smoother here", timestamp: "2 min ago" },
  { id: "c2", author: "AI Agent", color: "#34d399", time: 34, text: "Detected scene change — recommend cut at 0:34", timestamp: "1 min ago" },
  { id: "c3", author: "Sarah", color: "#f472b6", time: 52, text: "Color grading looks great in this section", timestamp: "just now" },
];

export default function VideoPage(): JSX.Element {
  const [effects, setEffects] = createSignal(defaultEffects);
  const [videoLoaded, setVideoLoaded] = createSignal(false);
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration] = createSignal(0);
  const [gpuAvailable] = createSignal(typeof navigator !== "undefined" && "gpu" in navigator);

  // ── Collaboration State ──────────────────────────────────────────
  const [showChat, setShowChat] = createSignal(true);
  const [chatInput, setChatInput] = createSignal("");
  const [chatMessages, setChatMessages] = createSignal<ChatMessage[]>([
    { id: "m1", role: "ai", text: "I'm your AI video assistant. Ask me to add transitions, apply effects, generate subtitles, or analyze scenes." },
  ]);
  const [comments, setComments] = createSignal(MOCK_COMMENTS);
  const [newComment, setNewComment] = createSignal("");
  const [showComments, setShowComments] = createSignal(true);
  const [syncStatus, setSyncStatus] = createSignal<"synced" | "syncing">("synced");
  const [roomId] = createSignal("room-" + Math.random().toString(36).slice(2, 8));

  const onlineCount = createMemo(() => MOCK_COLLABORATORS.filter((c) => c.online).length);

  function sendChatMessage() {
    const text = chatInput().trim();
    if (!text) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text };
    setChatMessages([...chatMessages(), userMsg]);
    setChatInput("");
    setSyncStatus("syncing");
    setTimeout(() => {
      const aiResponses: Record<string, string> = {
        transition: "Adding a smooth crossfade transition at the current playhead position (0:" + Math.floor(currentTime()).toString().padStart(2, "0") + "). Duration: 0.5s.",
        subtitle: "Generating subtitles using Whisper model... Detected 3 spoken segments. Subtitles added to the timeline.",
        color: "Applied cinematic color grading: contrast +15%, warmth +8%, vignette enabled. Preview updated.",
        cut: "Analyzing scene boundaries... Found 4 scene changes. Markers added to timeline at 0:12, 0:34, 0:52, 1:18.",
      };
      const key = Object.keys(aiResponses).find((k) => text.toLowerCase().includes(k)) || "";
      const response = aiResponses[key] || `Processing your request: "${text}". Applied to the current timeline. Check the preview for results.`;
      const aiMsg: ChatMessage = { id: `ai-${Date.now()}`, role: "ai", text: response };
      setChatMessages([...chatMessages(), userMsg, aiMsg]);
      setSyncStatus("synced");
    }, 1200);
  }

  function addComment() {
    const text = newComment().trim();
    if (!text) return;
    const comment: TimelineComment = {
      id: `c-${Date.now()}`,
      author: "You",
      color: "var(--color-primary)",
      time: currentTime(),
      text,
      timestamp: "just now",
    };
    setComments([...comments(), comment]);
    setNewComment("");
  }

  function shareRoom() {
    const url = `${window.location.origin}/video?room=${roomId()}`;
    navigator.clipboard.writeText(url);
    showToast("Room link copied to clipboard!", "success");
  }

  const toggleEffect = (id: string): void => {
    setEffects(
      effects().map((e) => (e.id === id ? { ...e, active: !e.active } : e)),
    );
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <ProtectedRoute>
      <SEOHead
        title="Video Editor"
        description="WebGPU-accelerated video processing directly in your browser. Apply effects, transitions, and AI enhancements with zero server cost."
        path="/video"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        {/* Header with collab controls */}
        <Stack direction="horizontal" justify="between" align="center">
          <Stack direction="vertical" gap="xs">
            <Text variant="h1" weight="bold">Video Editor</Text>
            <Stack direction="horizontal" gap="sm" align="center">
              <Text variant="body" class="text-muted">
                WebGPU-accelerated &middot; Real-time collaboration
              </Text>
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: syncStatus() === "synced"
                    ? "color-mix(in oklab, var(--color-success) 10%, transparent)"
                    : "color-mix(in oklab, var(--color-warning) 10%, transparent)",
                  color: syncStatus() === "synced"
                    ? "var(--color-success)"
                    : "var(--color-warning)",
                }}
              >
                <span
                  class={`h-1.5 w-1.5 rounded-full ${syncStatus() !== "synced" ? "animate-pulse" : ""}`}
                  style={{
                    background: syncStatus() === "synced"
                      ? "var(--color-success)"
                      : "var(--color-warning)",
                  }}
                />
                {syncStatus() === "synced" ? "Synced" : "Syncing..."}
              </span>
            </Stack>
          </Stack>
          <Stack direction="horizontal" gap="sm" align="center">
            {/* Collaborator avatars */}
            <div class="flex -space-x-2">
              <For each={MOCK_COLLABORATORS.filter((c) => c.online)}>
                {(collab) => (
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--color-bg)] text-[10px] font-bold text-white"
                    style={{ "background-color": collab.color }}
                    title={`${collab.name} (online)`}
                  >
                    {collab.initials}
                  </div>
                )}
              </For>
            </div>
            <Text variant="caption" class="text-muted">{onlineCount()} online</Text>
            <Button variant="outline" size="sm" onClick={shareRoom}>Share</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowChat(!showChat())}>
              {showChat() ? "Hide AI" : "AI Chat"}
            </Button>
            <Badge variant={gpuAvailable() ? "success" : "warning"} size="sm">
              {gpuAvailable() ? "WebGPU" : "Canvas fallback"}
            </Badge>
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
                  <Text variant="h3" class="text-muted">Drop video here or click to upload</Text>
                  <Text variant="caption" class="text-muted">
                    Supports MP4, WebM, MOV
                  </Text>
                  <Button
                    variant="primary"
                    onClick={() => setVideoLoaded(true)}
                  >
                    Load Sample Video
                  </Button>
                </Stack>
              }
            >
              <Stack direction="vertical" gap="none">
                <div class="video-canvas">
                  <Text variant="body" class="text-muted" align="center">
                    Video preview area (WebGPU canvas)
                  </Text>
                </div>
                {/* Timeline */}
                <div class="video-timeline">
                  <Stack direction="horizontal" gap="sm" align="center" class="timeline-controls">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPlaying(!playing())}
                    >
                      {playing() ? "Pause" : "Play"}
                    </Button>
                    <Text variant="caption">
                      {formatTime(currentTime())} / {formatTime(duration() || 120)}
                    </Text>
                    <input
                      type="range"
                      min="0"
                      max={duration() || 120}
                      value={currentTime()}
                      onInput={(e) => setCurrentTime(Number(e.currentTarget.value))}
                      aria-label="Timeline scrubber"
                      class="timeline-scrubber"
                    />
                  </Stack>
                </div>
              </Stack>
            </Show>
          </Card>

          {/* Effects Panel */}
          <Card padding="md" class="effects-panel">
            <Stack direction="vertical" gap="md">
              <Text variant="h4" weight="semibold">Effects</Text>
              <For each={effects()}>
                {(effect) => (
                  <button
                    type="button"
                    class={`effect-item ${effect.active ? "effect-active" : ""}`}
                    onClick={() => toggleEffect(effect.id)}
                  >
                    <Stack direction="vertical" gap="xs">
                      <Text variant="body" weight="semibold">{effect.name}</Text>
                      <Text variant="caption" class="text-muted">{effect.description}</Text>
                    </Stack>
                  </button>
                )}
              </For>
              <Separator />
              <Stack direction="vertical" gap="sm">
                <Button
                  variant="primary"
                  disabled={!videoLoaded()}
                  class="w-full"
                  onClick={() => {
                    showToast("Exporting video... this may take a moment.", "info");
                    // Placeholder: real export would run WebGPU pipeline and save blob
                    setTimeout(() => {
                      showToast("Video export complete. Download starting...", "success");
                    }, 1200);
                  }}
                >
                  Export Video
                </Button>
                <Button
                  variant="outline"
                  disabled={!videoLoaded()}
                  class="w-full"
                  onClick={() => {
                    try {
                      const canvas = document.createElement("canvas");
                      canvas.width = 1280;
                      canvas.height = 720;
                      const ctx = canvas.getContext("2d");
                      if (ctx) {
                        ctx.fillStyle = "#111";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.fillStyle = "#fff";
                        ctx.font = "24px sans-serif";
                        ctx.fillText("Frame @ " + formatTime(currentTime()), 40, 60);
                      }
                      canvas.toBlob((blob) => {
                        if (!blob) return;
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `frame-${Date.now()}.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                        showToast("Frame downloaded", "success");
                      });
                    } catch {
                      showToast("Could not download frame", "error");
                    }
                  }}
                >
                  Download Frame
                </Button>
              </Stack>
            </Stack>
          </Card>
        </div>

        {/* Collaborator cursors on timeline */}
        <Show when={videoLoaded()}>
          <Card padding="sm">
            <Stack direction="horizontal" justify="between" align="center">
              <Text variant="caption" weight="semibold" class="text-muted">Timeline Cursors</Text>
              <Button variant="ghost" size="sm" onClick={() => setShowComments(!showComments())}>
                {showComments() ? "Hide Comments" : "Show Comments"} ({comments().length})
              </Button>
            </Stack>
            <div class="relative mt-2 h-6 rounded-lg border border-[var(--color-border)] overflow-hidden" style={{ background: "var(--color-bg-subtle)" }}>
              <For each={MOCK_COLLABORATORS.filter((c) => c.online)}>
                {(collab) => (
                  <div
                    class="absolute top-0 h-full w-0.5"
                    style={{ left: `${(collab.cursorTime / (duration() || 120)) * 100}%`, "background-color": collab.color }}
                    title={`${collab.name} @ ${formatTime(collab.cursorTime)}`}
                  >
                    <div
                      class="absolute -top-5 left-1/2 -translate-x-1/2 rounded px-1.5 py-0.5 text-[9px] font-bold text-white whitespace-nowrap"
                      style={{ "background-color": collab.color }}
                    >
                      {collab.initials}
                    </div>
                  </div>
                )}
              </For>
              {/* Comment markers */}
              <For each={comments()}>
                {(comment) => (
                  <div
                    class="absolute top-0 h-full w-1 rounded-full opacity-60"
                    style={{ left: `${(comment.time / (duration() || 120)) * 100}%`, "background-color": comment.color }}
                    title={`${comment.author}: ${comment.text}`}
                  />
                )}
              </For>
            </div>
          </Card>
        </Show>

        {/* Comments Section */}
        <Show when={showComments() && videoLoaded()}>
          <Card padding="md">
            <Stack direction="vertical" gap="sm">
              <Text variant="h4" weight="semibold">Timeline Comments</Text>
              <For each={comments()}>
                {(comment) => (
                  <div class="flex items-start gap-3 rounded-lg p-3" style={{ background: "var(--color-bg-subtle)" }}>
                    <div
                      class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ "background-color": comment.color }}
                    >
                      {comment.author.slice(0, 2).toUpperCase()}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <Text variant="caption" weight="semibold">{comment.author}</Text>
                        <Text variant="caption" class="text-muted">@ {formatTime(comment.time)}</Text>
                        <Text variant="caption" class="text-muted">&middot; {comment.timestamp}</Text>
                      </div>
                      <Text variant="body" class="text-muted">{comment.text}</Text>
                    </div>
                  </div>
                )}
              </For>
              <Stack direction="horizontal" gap="sm">
                <input
                  type="text"
                  placeholder={`Comment at ${formatTime(currentTime())}...`}
                  aria-label="Add comment at current time"
                  value={newComment()}
                  onInput={(e) => setNewComment(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                  class="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--color-bg-muted)", color: "var(--color-text)" }}
                />
                <Button variant="primary" size="sm" onClick={addComment}>Post</Button>
              </Stack>
            </Stack>
          </Card>
        </Show>

        {/* AI Chat Panel */}
        <Show when={showChat()}>
          <Card padding="md">
            <Stack direction="vertical" gap="sm">
              <Stack direction="horizontal" justify="between" align="center">
                <Stack direction="horizontal" gap="sm" align="center">
                  <div class="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "color-mix(in oklab, var(--color-success) 20%, transparent)", color: "var(--color-success)" }}>AI</div>
                  <Text variant="h4" weight="semibold">AI Video Assistant</Text>
                </Stack>
                <Badge variant="default" size="sm">Client GPU &middot; $0/token</Badge>
              </Stack>
              <div class="max-h-64 overflow-y-auto space-y-2">
                <For each={chatMessages()}>
                  {(msg) => (
                    <div class={`rounded-lg p-3 text-sm border border-[var(--color-border)] ${msg.role === "ai" ? "bg-[var(--color-bg-subtle)]" : "bg-[var(--color-bg-elevated)] ml-8"}`} style={{ color: "var(--color-text-secondary)" }}>
                      <span class="font-semibold" style={{ color: "var(--color-text)" }}>{msg.role === "ai" ? "AI: " : "You: "}</span>
                      {msg.text}
                    </div>
                  )}
                </For>
              </div>
              <Stack direction="horizontal" gap="sm">
                <input
                  type="text"
                  placeholder="Ask AI: add transition, generate subtitles, apply color grading..."
                  aria-label="Ask AI video assistant"
                  value={chatInput()}
                  onInput={(e) => setChatInput(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                  class="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--color-bg-subtle)", color: "var(--color-text)" }}
                />
                <Button variant="primary" size="sm" onClick={sendChatMessage}>Send</Button>
              </Stack>
            </Stack>
          </Card>
        </Show>
      </Stack>
    </ProtectedRoute>
  );
}
