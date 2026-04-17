import { createSignal, onMount, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Badge, Button } from "@back-to-the-future/ui";
import "xterm/css/xterm.css";

// ── Types ────────────────────────────────────────────────────────────

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface TerminalProps {
  projectId: string;
}

interface TerminalMessage {
  type: string;
  data?: string;
}

// ── API URL helper ──────────────────────────────────────────────────

function getWsUrl(projectId: string): string {
  const token = getSessionToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";

    // Production
    if (hostname === "crontech.ai" || hostname === "www.crontech.ai") {
      return `wss://api.crontech.ai/api/terminal/${projectId}${tokenParam}`;
    }
    // Cloudflare Pages preview
    if (hostname.endsWith(".pages.dev")) {
      return `${wsProtocol}//${hostname}/api/terminal/${projectId}${tokenParam}`;
    }
    // Local development — API runs on port 3001
    const apiPort = port === "3000" ? "3001" : port;
    return `${wsProtocol}//${hostname}:${apiPort}/api/terminal/${projectId}${tokenParam}`;
  }

  return `ws://localhost:3001/api/terminal/${projectId}${tokenParam}`;
}

function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("btf_session_token");
  } catch {
    return null;
  }
}

// ── Terminal Component ──────────────────────────────────────────────

export function Terminal(props: TerminalProps): JSX.Element {
  const [status, setStatus] = createSignal<ConnectionStatus>("disconnected");
  const [errorMessage, setErrorMessage] = createSignal<string>("");

  let containerRef: HTMLDivElement | undefined;
  let terminal: import("xterm").Terminal | undefined;
  let fitAddon: import("@xterm/addon-fit").FitAddon | undefined;
  let ws: WebSocket | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

  // ── Connect WebSocket ───────────────────────────────────────────
  function connect(): void {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    setStatus("connecting");
    setErrorMessage("");

    const url = getWsUrl(props.projectId);
    ws = new WebSocket(url);

    ws.onopen = (): void => {
      setStatus("connected");
      setErrorMessage("");
      terminal?.focus();
    };

    ws.onmessage = (event: MessageEvent): void => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data) as TerminalMessage;
        if (msg.type === "output" && typeof msg.data === "string") {
          terminal?.write(msg.data);
        } else if (msg.type === "error" && typeof msg.data === "string") {
          terminal?.write(`\r\n\x1b[1;31mError: ${msg.data}\x1b[0m\r\n`);
          setErrorMessage(msg.data);
        }
      } catch {
        // Non-JSON data — write raw
        terminal?.write(String(event.data));
      }
    };

    ws.onclose = (event: CloseEvent): void => {
      setStatus("disconnected");
      if (event.code === 4001) {
        setErrorMessage("Authentication failed. Please log in and try again.");
        terminal?.write("\r\n\x1b[1;31mSession expired. Please reconnect.\x1b[0m\r\n");
      } else if (event.code !== 1000) {
        setErrorMessage("Connection lost. Click Reconnect to try again.");
        terminal?.write("\r\n\x1b[1;33mConnection closed.\x1b[0m\r\n");
      }
    };

    ws.onerror = (): void => {
      setStatus("disconnected");
      setErrorMessage("Failed to connect to terminal server.");
    };
  }

  // ── Disconnect ──────────────────────────────────────────────────
  function disconnect(): void {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = undefined;
    }
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.onopen = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "User disconnected");
      }
      ws = undefined;
    }
  }

  // ── Reconnect ───────────────────────────────────────────────────
  function reconnect(): void {
    disconnect();
    terminal?.clear();
    connect();
  }

  // ── Initialize ──────────────────────────────────────────────────
  onMount(async () => {
    if (!containerRef) return;

    // Dynamic import to avoid SSR issues with xterm.js
    const [xtermMod, fitMod] = await Promise.all([
      import("xterm"),
      import("@xterm/addon-fit"),
    ]);

    const XTerminal = xtermMod.Terminal;
    const FitAddon = fitMod.FitAddon;

    // Create terminal instance with Crontech dark theme
    terminal = new XTerminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      fontSize: 14,
      lineHeight: 1.4,
      letterSpacing: 0.5,
      allowProposedApi: true,
      scrollback: 10000,
      theme: {
        background: "#0a0a0a",
        foreground: "#e0e0e0",
        cursor: "#22d3ee",
        cursorAccent: "#0a0a0a",
        selectionBackground: "#2563eb44",
        selectionForeground: "#ffffff",
        black: "#1a1a1a",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e0e0e0",
        brightBlack: "#404040",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde68a",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#ffffff",
      },
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Mount terminal into the DOM
    terminal.open(containerRef);

    // Fit to container
    requestAnimationFrame(() => {
      fitAddon?.fit();
    });

    // Handle user input — send to WebSocket
    terminal.onData((data: string) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Handle resize events — notify the server
    terminal.onResize((size: { cols: number; rows: number }) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
      }
    });

    // Observe container resizes for auto-fit
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon?.fit();
      });
    });
    resizeObserver.observe(containerRef);

    // Connect to the terminal server
    connect();
  });

  // ── Cleanup ─────────────────────────────────────────────────────
  onCleanup(() => {
    disconnect();
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = undefined;
    }
    if (terminal) {
      terminal.dispose();
      terminal = undefined;
    }
    fitAddon = undefined;
  });

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div class="terminal-wrapper flex flex-col h-full w-full">
      {/* Status bar */}
      <div class="terminal-status-bar flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]" style={{ background: "var(--color-bg-elevated)" }}>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div
              class="h-2.5 w-2.5 rounded-full transition-colors duration-300"
              classList={{
                "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]": status() === "connected",
                "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] animate-pulse": status() === "connecting",
                "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]": status() === "disconnected",
              }}
            />
            <Badge
              variant={status() === "connected" ? "success" : status() === "connecting" ? "warning" : "error"}
            >
              {status() === "connected" ? "Connected" : status() === "connecting" ? "Connecting..." : "Disconnected"}
            </Badge>
          </div>

          <span class="text-xs text-gray-500 font-mono">
            project:{props.projectId}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <Show when={status() === "disconnected"}>
            <Button
              variant="primary"
              size="sm"
              onClick={reconnect}
            >
              Reconnect
            </Button>
          </Show>
          <Show when={status() === "connected"}>
            <Button
              variant="ghost"
              size="sm"
              onClick={disconnect}
            >
              Disconnect
            </Button>
          </Show>
        </div>
      </div>

      {/* Error banner */}
      <Show when={errorMessage()}>
        <div class="px-4 py-2 text-xs font-medium text-red-300 border-b border-red-500/20" style={{ background: "rgba(220,38,38,0.1)" }}>
          {errorMessage()}
        </div>
      </Show>

      {/* Terminal container */}
      <div
        ref={containerRef}
        class="terminal-container flex-1 min-h-0"
        style={{
          background: "#0a0a0a",
          padding: "8px",
        }}
      />

      {/* xterm.js base CSS */}
      <style>{`
        .terminal-container .xterm {
          height: 100%;
          padding: 4px;
        }
        .terminal-container .xterm-viewport {
          overflow-y: auto;
        }
        .terminal-container .xterm-viewport::-webkit-scrollbar {
          width: 8px;
        }
        .terminal-container .xterm-viewport::-webkit-scrollbar-track {
          background: transparent;
        }
        .terminal-container .xterm-viewport::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .terminal-container .xterm-viewport::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .terminal-container .xterm-screen {
          height: 100%;
        }
      `}</style>
    </div>
  );
}
