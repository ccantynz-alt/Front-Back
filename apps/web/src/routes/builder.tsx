import { Title } from "@solidjs/meta";
import { createEffect, createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  Button,
  Input,
  Stack,
  Text,
  Badge,
  Spinner,
  Separator,
} from "@back-to-the-future/ui";
import type { Component as UIComponent } from "@back-to-the-future/schemas";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { ComponentTree } from "../components/ComponentRenderer";
import { trpc } from "../lib/trpc";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface PageLayout {
  title: string;
  description: string;
  components: UIComponent[];
}

type DeployStatus = "idle" | "creating" | "deploying" | "success" | "failed";

type DeviceMode = "desktop" | "tablet" | "mobile";

// ── API Helpers ──────────────────────────────────────────────────────

const SESSION_TOKEN_KEY = "btf_session_token";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    try {
      const token = localStorage.getItem(SESSION_TOKEN_KEY);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Storage unavailable
    }
  }
  return headers;
}

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const meta = import.meta as unknown as Record<
      string,
      Record<string, string> | undefined
    >;
    return meta.env?.VITE_PUBLIC_API_URL ?? "http://localhost:3001";
  }
  return "http://localhost:3001";
}

async function streamAIResponse(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  try {
    const response = await fetch(`${getApiUrl()}/api/ai/site-builder`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        messages,
        computeTier: "cloud",
        maxTokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ error: "Request failed" }));
      onError((body as { error?: string }).error ?? `HTTP ${response.status}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError("No response stream available");
      return;
    }

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      onToken(chunk);
    }

    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : "Stream failed");
  }
}

async function fetchGenerateLayout(
  description: string,
): Promise<PageLayout> {
  const response = await fetch(`${getApiUrl()}/api/ai/generate-layout`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      description,
      computeTier: "cloud",
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    success: boolean;
    layout: PageLayout;
  };
  if (!data.success || !data.layout) {
    throw new Error("Invalid response from generate-layout");
  }
  return data.layout;
}

// ── Chat Bubble ──────────────────────────────────────────────────────

function ChatBubble(props: { message: ChatMessage }): JSX.Element {
  const isUser = (): boolean => props.message.role === "user";

  return (
    <div
      class={`flex flex-col gap-1 rounded-lg p-3 ${
        isUser()
          ? "ml-8 bg-blue-600 text-white"
          : "mr-8 bg-zinc-800 text-zinc-100"
      }`}
    >
      <Text
        variant="caption"
        weight="semibold"
        class={isUser() ? "text-blue-200" : "text-zinc-400"}
      >
        {isUser() ? "You" : "AI Builder"}
      </Text>
      <Text variant="body" class={isUser() ? "text-white" : "text-zinc-200"}>
        {props.message.content}
      </Text>
    </div>
  );
}

// ── Device Width Map ─────────────────────────────────────────────────

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

// ── Builder Page ─────────────────────────────────────────────────────

export default function BuilderPage(): JSX.Element {
  // Chat state
  const [messages, setMessages] = createSignal<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to the AI Website Builder. Describe the website you want to create, and I will build it for you in real time. You can ask for changes, add pages, or adjust styling at any point.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = createSignal("");
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [isGeneratingLayout, setIsGeneratingLayout] = createSignal(false);

  // Preview state
  const [pageLayout, setPageLayout] = createSignal<PageLayout | null>(null);
  const [deviceMode, setDeviceMode] = createSignal<DeviceMode>("desktop");

  // Deploy state
  const [siteName, setSiteName] = createSignal("");
  const [siteId, setSiteId] = createSignal<string | null>(null);
  const [deployStatus, setDeployStatus] = createSignal<DeployStatus>("idle");
  const [deployUrl, setDeployUrl] = createSignal<string | null>(null);
  const [deployError, setDeployError] = createSignal<string | null>(null);

  // Ref for scrolling chat to bottom
  let chatContainerRef: HTMLDivElement | undefined;

  // Auto-scroll chat when messages change
  createEffect(() => {
    messages();
    if (chatContainerRef) {
      chatContainerRef.scrollTop = chatContainerRef.scrollHeight;
    }
  });

  // ── Chat Handlers ──────────────────────────────────────────────────

  const getLastUserMessage = (): string => {
    const msgs = messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]!.role === "user") return msgs[i]!.content;
    }
    return "";
  };

  const handleSend = (): void => {
    const text = input().trim();
    if (!text || isGenerating()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsGenerating(true);

    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
    ]);

    const conversationHistory = messages()
      .filter((m) => m.id !== "welcome" && m.id !== assistantId)
      .map((m) => ({ role: m.role, content: m.content }));

    streamAIResponse(
      conversationHistory,
      (token) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + token } : m,
          ),
        );
      },
      () => {
        setIsGenerating(false);
      },
      (error) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Error: ${error}. Make sure the API server is running and OPENAI_API_KEY is set.`,
                }
              : m,
          ),
        );
        setIsGenerating(false);
      },
    );
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Generate Layout Handler ────────────────────────────────────────

  const handleGenerateLayout = async (): Promise<void> => {
    const description = getLastUserMessage();
    if (!description || isGeneratingLayout()) return;

    setIsGeneratingLayout(true);

    try {
      const layout = await fetchGenerateLayout(description);
      setPageLayout(layout);

      // Auto-fill site name from layout title if empty
      if (!siteName()) {
        setSiteName(layout.title);
      }

      // Add assistant message about the generated layout
      setMessages((prev) => [
        ...prev,
        {
          id: `layout-${Date.now()}`,
          role: "assistant",
          content: `Layout generated: "${layout.title}" -- ${layout.description}. Check the preview panel to see it rendered live.`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `layout-error-${Date.now()}`,
          role: "assistant",
          content: `Failed to generate layout: ${err instanceof Error ? err.message : "Unknown error"}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsGeneratingLayout(false);
    }
  };

  // ── Deploy Handler ─────────────────────────────────────────────────

  const handleDeploy = async (): Promise<void> => {
    const layout = pageLayout();
    if (!layout) return;

    const name = siteName().trim();
    if (!name) return;

    setDeployStatus("creating");
    setDeployError(null);
    setDeployUrl(null);

    try {
      let currentSiteId = siteId();

      // Create site if it does not exist yet
      if (!currentSiteId) {
        setDeployStatus("creating");
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        // Ensure slug is at least 2 chars and valid
        const safeSlug =
          slug.length < 2 ? `site-${Date.now().toString(36)}` : slug;

        const site = await trpc.sites.create.mutate({
          name,
          slug: safeSlug,
          description: layout.description,
          pageLayout: JSON.stringify(layout),
        });

        currentSiteId = site.id;
        setSiteId(site.id);
      } else {
        // Update existing site with latest layout
        await trpc.sites.update.mutate({
          id: currentSiteId,
          name,
          pageLayout: JSON.stringify(layout),
        });
      }

      // Deploy the site
      setDeployStatus("deploying");
      const result = await trpc.sites.deploy.mutate({
        siteId: currentSiteId,
      });

      setDeployStatus("success");
      setDeployUrl(result.url);
    } catch (err) {
      setDeployStatus("failed");
      setDeployError(
        err instanceof Error ? err.message : "Deployment failed",
      );
    }
  };

  // ── Status Badge Variant ───────────────────────────────────────────

  const statusBadgeVariant = (): "default" | "success" | "warning" | "error" | "info" => {
    switch (deployStatus()) {
      case "success":
        return "success";
      case "failed":
        return "error";
      case "creating":
      case "deploying":
        return "warning";
      default:
        return "default";
    }
  };

  const statusLabel = (): string => {
    switch (deployStatus()) {
      case "creating":
        return "Creating site...";
      case "deploying":
        return "Deploying...";
      case "success":
        return "Deployed";
      case "failed":
        return "Failed";
      default:
        return "Not deployed";
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <Title>AI Builder - Back to the Future</Title>

      <div class="flex h-[calc(100vh-4rem)] flex-col lg:flex-row">
        {/* ── Left Panel: Chat ──────────────────────────────────── */}
        <div class="flex w-full flex-col border-r border-zinc-800 lg:w-[40%]">
          {/* Chat Header */}
          <div class="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <Text variant="h3" weight="bold">
              AI Website Builder
            </Text>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerateLayout}
              loading={isGeneratingLayout()}
              disabled={!getLastUserMessage() || isGeneratingLayout()}
            >
              Generate Layout
            </Button>
          </div>

          {/* Chat Messages */}
          <div
            ref={chatContainerRef}
            class="flex-1 space-y-3 overflow-y-auto p-4"
          >
            <For each={messages()}>
              {(msg) => <ChatBubble message={msg} />}
            </For>
            <Show
              when={
                isGenerating() &&
                messages()[messages().length - 1]?.content === ""
              }
            >
              <div class="mr-8 flex flex-col gap-1 rounded-lg bg-zinc-800 p-3">
                <Text variant="caption" weight="semibold" class="text-zinc-400">
                  AI Builder
                </Text>
                <div class="flex items-center gap-2">
                  <Spinner size="sm" />
                  <Text variant="body" class="text-zinc-400">
                    Generating...
                  </Text>
                </div>
              </div>
            </Show>
          </div>

          {/* Chat Input */}
          <div class="border-t border-zinc-800 p-4">
            <Stack direction="horizontal" gap="sm" align="end">
              <div class="flex-1">
                <Input
                  placeholder="Describe your website..."
                  value={input()}
                  onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                    setInput(e.currentTarget.value)
                  }
                  onKeyDown={handleKeyDown}
                  disabled={isGenerating()}
                />
              </div>
              <Button
                variant="primary"
                onClick={handleSend}
                loading={isGenerating()}
                disabled={!input().trim()}
              >
                Send
              </Button>
            </Stack>
          </div>
        </div>

        {/* ── Right Panel: Preview + Deploy ─────────────────────── */}
        <div class="flex w-full flex-col lg:w-[60%]">
          {/* Toolbar */}
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
            <Text variant="caption" weight="semibold" class="text-zinc-400">
              Live Preview
            </Text>
            <Stack direction="horizontal" gap="xs">
              <Button
                variant={deviceMode() === "desktop" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setDeviceMode("desktop")}
              >
                Desktop
              </Button>
              <Button
                variant={deviceMode() === "tablet" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setDeviceMode("tablet")}
              >
                Tablet
              </Button>
              <Button
                variant={deviceMode() === "mobile" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setDeviceMode("mobile")}
              >
                Mobile
              </Button>
            </Stack>
          </div>

          {/* Preview Area */}
          <div class="flex-1 overflow-auto bg-zinc-950 p-4">
            <div
              class="mx-auto rounded-lg border border-zinc-800 bg-zinc-900 transition-all duration-300"
              style={{
                "max-width": DEVICE_WIDTHS[deviceMode()],
                "min-height": "300px",
              }}
            >
              <Show
                when={pageLayout()}
                fallback={
                  <div class="flex min-h-[300px] flex-col items-center justify-center gap-3 p-8">
                    <Text variant="h3" class="text-zinc-600">
                      Preview Area
                    </Text>
                    <Text variant="body" class="text-center text-zinc-600">
                      Describe your website in the chat, then click "Generate
                      Layout" to see it rendered here.
                    </Text>
                  </div>
                }
              >
                {(layout) => (
                  <div class="p-4">
                    <ComponentTree components={layout().components} />
                  </div>
                )}
              </Show>
            </div>
          </div>

          {/* Deploy Bar */}
          <div class="border-t border-zinc-800 p-4">
            <Stack direction="vertical" gap="sm">
              {/* Site Name + Deploy Button */}
              <Stack direction="horizontal" gap="sm" align="end">
                <div class="flex-1">
                  <Input
                    placeholder="Site name (e.g. My Portfolio)"
                    value={siteName()}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setSiteName(e.currentTarget.value)
                    }
                    label="Site Name"
                    disabled={
                      deployStatus() === "creating" ||
                      deployStatus() === "deploying"
                    }
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={handleDeploy}
                  loading={
                    deployStatus() === "creating" ||
                    deployStatus() === "deploying"
                  }
                  disabled={!pageLayout() || !siteName().trim()}
                >
                  {siteId() ? "Redeploy" : "Deploy"}
                </Button>
              </Stack>

              {/* Deployment Status */}
              <Show when={deployStatus() !== "idle"}>
                <Separator orientation="horizontal" />
                <Stack direction="horizontal" gap="sm" align="center">
                  <Badge variant={statusBadgeVariant()}>
                    {statusLabel()}
                  </Badge>
                  <Show
                    when={
                      deployStatus() === "creating" ||
                      deployStatus() === "deploying"
                    }
                  >
                    <Spinner size="sm" />
                  </Show>
                </Stack>
              </Show>

              {/* Deploy URL */}
              <Show when={deployUrl()}>
                {(url) => (
                  <Stack direction="horizontal" gap="sm" align="center">
                    <Text variant="caption" class="text-zinc-400">
                      Live at:
                    </Text>
                    <a
                      href={url()}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-sm font-medium text-blue-400 underline hover:text-blue-300"
                    >
                      {url()}
                    </a>
                  </Stack>
                )}
              </Show>

              {/* Deploy Error */}
              <Show when={deployError()}>
                {(error) => (
                  <Text variant="caption" class="text-red-400">
                    {error()}
                  </Text>
                )}
              </Show>
            </Stack>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
