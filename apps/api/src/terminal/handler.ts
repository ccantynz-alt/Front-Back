import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";

const { upgradeWebSocket, websocket: terminalWebsocket } = createBunWebSocket();

/**
 * Terminal WebSocket handler.
 *
 * Provides a PTY-like interface over WebSockets for browser-based terminal
 * access. Currently runs a mock shell that processes common commands locally.
 * In production this will connect to Docker exec or a real PTY backend.
 *
 * Mount at /api/terminal/:projectId in the main Hono app.
 */
const terminalApp = new Hono();

// ── Session token validation ────────────────────────────────────────
function validateToken(token: string | null): boolean {
  if (!token) return false;
  // In production, verify the JWT/session token against the auth system.
  // For now, accept any non-empty token to unblock development.
  return token.length > 0;
}

// ── Mock shell state per connection ─────────────────────────────────
interface ShellState {
  cwd: string;
  env: Record<string, string>;
  history: string[];
}

export function createShellState(projectId: string): ShellState {
  return {
    cwd: `/home/user/projects/${projectId}`,
    env: {
      HOME: `/home/user/projects/${projectId}`,
      USER: "crontech",
      SHELL: "/bin/bash",
      TERM: "xterm-256color",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      PROJECT_ID: projectId,
      NODE_ENV: "development",
    },
    history: [],
  };
}

export function processCommand(input: string, state: ShellState): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";

  state.history.push(trimmed);

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0] ?? "";
  const args = parts.slice(1);

  switch (cmd) {
    case "pwd":
      return `${state.cwd}\r\n`;

    case "whoami":
      return `${state.env["USER"] ?? "crontech"}\r\n`;

    case "echo": {
      const output = args
        .map((arg) => {
          // Expand $VAR references
          if (arg.startsWith("$")) {
            return state.env[arg.slice(1)] ?? "";
          }
          return arg;
        })
        .join(" ");
      return `${output}\r\n`;
    }

    case "env":
    case "printenv":
      return `${Object.entries(state.env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\r\n")}\r\n`;

    case "cd": {
      const target = args[0];
      if (!target || target === "~") {
        state.cwd = state.env["HOME"] ?? "/home/user";
      } else if (target === "..") {
        const segments = state.cwd.split("/").filter(Boolean);
        segments.pop();
        state.cwd = segments.length > 0 ? `/${segments.join("/")}` : "/";
      } else if (target.startsWith("/")) {
        state.cwd = target;
      } else {
        state.cwd = `${state.cwd}/${target}`;
      }
      return "";
    }

    case "ls": {
      // Mock directory listing
      const files = [
        "src/",
        "public/",
        "package.json",
        "tsconfig.json",
        "biome.json",
        "bun.lockb",
        "README.md",
        ".env",
        "node_modules/",
      ];
      if (args.includes("-la") || args.includes("-l") || args.includes("-al")) {
        return `total 48\r\ndrwxr-xr-x  8 crontech crontech 4096 Apr 13 12:00 .\r\ndrwxr-xr-x  3 crontech crontech 4096 Apr 13 12:00 ..\r\n${files
          .map((f) => {
            const isDir = f.endsWith("/");
            const name = isDir ? f.slice(0, -1) : f;
            const perm = isDir ? "drwxr-xr-x" : "-rw-r--r--";
            const size = isDir ? "4096" : " 256";
            return `${perm}  1 crontech crontech ${size} Apr 13 12:00 ${name}`;
          })
          .join("\r\n")}\r\n`;
      }
      return `${files.map((f) => (f.endsWith("/") ? `\x1b[1;34m${f.slice(0, -1)}\x1b[0m` : f)).join("  ")}\r\n`;
    }

    case "cat": {
      const file = args[0];
      if (!file) return "cat: missing operand\r\n";
      if (file === "package.json") {
        return `{\r\n  "name": "project-${state.env["PROJECT_ID"] ?? "unknown"}",\r\n  "version": "1.0.0",\r\n  "type": "module",\r\n  "scripts": {\r\n    "dev": "bun run --hot src/index.ts",\r\n    "build": "bun build src/index.ts --outdir dist",\r\n    "test": "bun test"\r\n  }\r\n}\r\n`;
      }
      return `cat: ${file}: No such file or directory\r\n`;
    }

    case "date":
      return `${new Date().toUTCString()}\r\n`;

    case "uname":
      if (args.includes("-a")) {
        return "Linux crontech-edge 6.1.0-cloudflare x86_64 GNU/Linux\r\n";
      }
      return "Linux\r\n";

    case "node":
      if (args[0] === "-v" || args[0] === "--version") {
        return "v22.12.0\r\n";
      }
      return "node: interactive mode not supported in web terminal\r\n";

    case "bun":
      if (args[0] === "-v" || args[0] === "--version") {
        return "1.3.11\r\n";
      }
      return "bun: interactive mode not supported in web terminal\r\n";

    case "git":
      if (args[0] === "status") {
        return "On branch main\r\nYour branch is up to date with 'origin/main'.\r\n\r\nnothing to commit, working tree clean\r\n";
      }
      if (args[0] === "log" && args.includes("--oneline")) {
        return "a1b2c3d feat: add terminal component\r\n9e8f7g6 fix: websocket reconnection\r\n5h4i3j2 perf: reduce bundle size\r\nk1l2m3n chore: update dependencies\r\n";
      }
      return `git: '${args[0] ?? ""}' is not a supported command in web terminal\r\n`;

    case "clear":
      // Send ANSI clear screen sequence
      return "\x1b[2J\x1b[H";

    case "history":
      return `${state.history.map((h, i) => `  ${i + 1}  ${h}`).join("\r\n")}\r\n`;

    case "help":
      return [
        "\x1b[1;36mCrontech Web Terminal\x1b[0m",
        "",
        "Available commands:",
        "  \x1b[1mls\x1b[0m [-la]          List directory contents",
        "  \x1b[1mcd\x1b[0m <dir>          Change directory",
        "  \x1b[1mpwd\x1b[0m               Print working directory",
        "  \x1b[1mcat\x1b[0m <file>        Display file contents",
        "  \x1b[1mecho\x1b[0m <text>       Print text (supports $VAR)",
        "  \x1b[1menv\x1b[0m               Show environment variables",
        "  \x1b[1mwhoami\x1b[0m            Current user",
        "  \x1b[1mdate\x1b[0m              Current date/time",
        "  \x1b[1muname\x1b[0m [-a]        System information",
        "  \x1b[1mnode\x1b[0m -v           Node.js version",
        "  \x1b[1mbun\x1b[0m -v            Bun version",
        "  \x1b[1mgit\x1b[0m status|log    Git commands (limited)",
        "  \x1b[1mclear\x1b[0m             Clear screen",
        "  \x1b[1mhistory\x1b[0m           Command history",
        "  \x1b[1mhelp\x1b[0m              Show this help",
        "  \x1b[1mexit\x1b[0m              Close terminal session",
        "",
        "\x1b[2mPTY is currently unavailable in this environment. Contact support if you need terminal access.\x1b[0m",
        "",
      ].join("\r\n");

    case "exit":
      return "\x1b[1;33mSession ended. Close the terminal tab to disconnect.\x1b[0m\r\n";

    default:
      return `\x1b[1;31m${cmd}\x1b[0m: command not found. Type \x1b[1mhelp\x1b[0m for available commands.\r\n`;
  }
}

// ── WebSocket upgrade route ─────────────────────────────────────────
terminalApp.get(
  "/terminal/:projectId",
  upgradeWebSocket((c) => {
    const projectId = c.req.param("projectId") ?? "unknown";
    const token = c.req.query("token") ?? null;

    // Buffer to accumulate characters until Enter is pressed
    let inputBuffer = "";
    let shellState: ShellState | null = null;

    return {
      onOpen(_evt, ws) {
        // Validate the session token
        if (!validateToken(token)) {
          const raw = ws.raw as unknown as WebSocket;
          try {
            raw.send(
              JSON.stringify({
                type: "error",
                data: "Authentication failed. Reconnect with a valid session token.",
              }),
            );
            raw.close(4001, "Unauthorized");
          } catch {
            // Best effort
          }
          return;
        }

        shellState = createShellState(projectId);
        const raw = ws.raw as unknown as WebSocket;
        try {
          // Send welcome banner
          const banner = [
            "",
            "\x1b[1;36m  ██████╗██████╗  ██████╗ ███╗   ██╗████████╗███████╗ ██████╗██╗  ██╗\x1b[0m",
            "\x1b[1;36m ██╔════╝██╔══██╗██╔═══██╗████╗  ██║╚══██╔══╝██╔════╝██╔════╝██║  ██║\x1b[0m",
            "\x1b[1;36m ██║     ██████╔╝██║   ██║██╔██╗ ██║   ██║   █████╗  ██║     ███████║\x1b[0m",
            "\x1b[1;36m ██║     ██╔══██╗██║   ██║██║╚██╗██║   ██║   ██╔══╝  ██║     ██╔══██║\x1b[0m",
            "\x1b[1;36m ╚██████╗██║  ██║╚██████╔╝██║ ╚████║   ██║   ███████╗╚██████╗██║  ██║\x1b[0m",
            "\x1b[1;36m  ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝\x1b[0m",
            "",
            `\x1b[2m  Web Terminal \x1b[0m\x1b[2m|\x1b[0m\x1b[2m Project: ${projectId}\x1b[0m`,
            `\x1b[2m  Type \x1b[0m\x1b[1mhelp\x1b[0m\x1b[2m for available commands.\x1b[0m`,
            "",
          ].join("\r\n");

          raw.send(JSON.stringify({ type: "output", data: banner }));
          // Send initial prompt
          raw.send(
            JSON.stringify({
              type: "output",
              data: `\x1b[1;32mcrontech\x1b[0m:\x1b[1;34m${shellState.cwd}\x1b[0m$ `,
            }),
          );
        } catch {
          // Best effort
        }
      },

      onMessage(evt, ws) {
        if (!shellState) return;

        const raw = ws.raw as unknown as WebSocket;
        const data =
          typeof evt.data === "string"
            ? evt.data
            : new TextDecoder().decode(evt.data as ArrayBuffer);

        let parsed: { type: string; data?: string } | null = null;
        try {
          parsed = JSON.parse(data) as { type: string; data?: string };
        } catch {
          // Raw text input fallback
          parsed = { type: "input", data };
        }

        if (parsed.type === "input" && typeof parsed.data === "string") {
          const chars = parsed.data;

          for (const char of chars) {
            if (char === "\r" || char === "\n") {
              // Echo newline
              trySend(raw, JSON.stringify({ type: "output", data: "\r\n" }));
              // Process command
              const output = processCommand(inputBuffer, shellState);
              if (output) {
                trySend(raw, JSON.stringify({ type: "output", data: output }));
              }
              inputBuffer = "";
              // Send new prompt
              trySend(
                raw,
                JSON.stringify({
                  type: "output",
                  data: `\x1b[1;32mcrontech\x1b[0m:\x1b[1;34m${shellState.cwd}\x1b[0m$ `,
                }),
              );
            } else if (char === "\x7f" || char === "\b") {
              // Backspace
              if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1);
                trySend(raw, JSON.stringify({ type: "output", data: "\b \b" }));
              }
            } else if (char === "\x03") {
              // Ctrl+C
              inputBuffer = "";
              trySend(raw, JSON.stringify({ type: "output", data: "^C\r\n" }));
              trySend(
                raw,
                JSON.stringify({
                  type: "output",
                  data: `\x1b[1;32mcrontech\x1b[0m:\x1b[1;34m${shellState.cwd}\x1b[0m$ `,
                }),
              );
            } else if (char === "\x0c") {
              // Ctrl+L (clear)
              inputBuffer = "";
              trySend(raw, JSON.stringify({ type: "output", data: "\x1b[2J\x1b[H" }));
              trySend(
                raw,
                JSON.stringify({
                  type: "output",
                  data: `\x1b[1;32mcrontech\x1b[0m:\x1b[1;34m${shellState.cwd}\x1b[0m$ `,
                }),
              );
            } else if (char.charCodeAt(0) >= 32) {
              // Printable characters
              inputBuffer += char;
              trySend(raw, JSON.stringify({ type: "output", data: char }));
            }
          }
        }

        if (parsed.type === "resize") {
          // Acknowledge resize — in production, forward to PTY
          trySend(raw, JSON.stringify({ type: "resize-ack" }));
        }
      },

      onClose() {
        shellState = null;
        inputBuffer = "";
      },

      onError() {
        shellState = null;
        inputBuffer = "";
      },
    };
  }),
);

function trySend(ws: WebSocket, data: string): void {
  try {
    ws.send(data);
  } catch {
    // Connection already closed
  }
}

export { terminalApp, terminalWebsocket };
