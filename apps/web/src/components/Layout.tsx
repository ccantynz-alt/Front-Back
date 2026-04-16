import type { JSX } from "solid-js";
import { Show, For, createSignal, createEffect, onCleanup } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { Button } from "@back-to-the-future/ui";
import { useAuth, useTheme } from "../stores";
import { NotificationCenter } from "./NotificationCenter";

// ── Sidebar nav items definition ─────────────────────────────────────

interface SidebarNavItem {
  href: string;
  label: string;
  icon: string;
}

const sidebarNavItems: readonly SidebarNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "\u25A0" },
  { href: "/builder", label: "Composer", icon: "\u26A1" },
  { href: "/chat", label: "Chat", icon: "\u{1F4AC}" },
  { href: "/projects", label: "Projects", icon: "\u{1F4C1}" },
  { href: "/templates", label: "Templates", icon: "\u{1F4CB}" },
  { href: "/repos", label: "Repos", icon: "\u{1F5C2}" },
  { href: "/ops", label: "Ops Theatre", icon: "\u25B6" },
  { href: "/flywheel", label: "Flywheel", icon: "\u27F3" },
  { href: "/settings", label: "Settings", icon: "\u2699" },
  { href: "/admin", label: "Admin", icon: "\u{1F512}" },
] as const;

// ── Nav Link (top navbar) ────────────────────────────────────────────

interface NavLinkProps {
  href: string;
  label: string;
}

function NavLink(props: NavLinkProps): JSX.Element {
  const location = useLocation();
  const isActive = (): boolean => location.pathname === props.href;

  return (
    <A
      href={props.href}
      class="relative px-3 py-2 text-sm font-medium rounded-md transition-colors duration-150 cursor-pointer"
      style={{
        color: isActive() ? "var(--color-text)" : "var(--color-text-muted)",
        background: isActive() ? "var(--color-bg-muted)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive()) {
          e.currentTarget.style.color = "var(--color-text)";
          e.currentTarget.style.background = "var(--color-bg-muted)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive()) {
          e.currentTarget.style.color = "var(--color-text-muted)";
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {props.label}
    </A>
  );
}

// ── User Menu ────────────────────────────────────────────────────────

function UserMenu(): JSX.Element {
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent): void => {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  };

  createEffect(() => {
    if (menuOpen()) {
      document.addEventListener("click", handleClickOutside);
    } else {
      document.removeEventListener("click", handleClickOutside);
    }
  });

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
  });

  const userInitial = (): string =>
    auth.currentUser()?.displayName?.charAt(0).toUpperCase() ?? "?";

  const roleBadge = (): { bg: string; text: string } => {
    const role = auth.currentUser()?.role;
    if (role === "admin") return { bg: "var(--color-danger-bg)", text: "var(--color-danger-text)" };
    if (role === "editor") return { bg: "var(--color-primary-light)", text: "var(--color-primary-text)" };
    return { bg: "var(--color-success-bg)", text: "var(--color-success-text)" };
  };

  return (
    <div class="relative" ref={menuRef}>
      <button
        class="flex items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-opacity duration-150 hover:opacity-80 active:scale-95 text-sm font-semibold text-white"
        style={{ background: "var(--color-primary)" }}
        onClick={() => setMenuOpen(!menuOpen())}
        type="button"
        aria-label="User menu"
      >
        {userInitial()}
      </button>

      <Show when={menuOpen()}>
        <div
          class="absolute right-0 top-full mt-2 w-64 rounded-lg overflow-hidden z-50"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-elevated)",
            "box-shadow": "var(--shadow-lg)",
            animation: "dropdown-enter 0.15s ease",
          }}
        >
          <div
            class="px-4 py-3"
            style={{ "border-bottom": "1px solid var(--color-border)" }}
          >
            <div class="flex items-center gap-3">
              <span
                class="flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold text-white shrink-0"
                style={{ background: "var(--color-primary)" }}
              >
                {userInitial()}
              </span>
              <div class="min-w-0 flex-1">
                <p
                  class="text-sm font-semibold truncate"
                  style={{ color: "var(--color-text)" }}
                >
                  {auth.currentUser()?.displayName}
                </p>
                <p
                  class="text-xs truncate mt-0.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {auth.currentUser()?.email}
                </p>
                <Show when={auth.currentUser()?.role}>
                  <span
                    class="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full"
                    style={{
                      background: roleBadge().bg,
                      color: roleBadge().text,
                    }}
                  >
                    {auth.currentUser()?.role}
                  </span>
                </Show>
              </div>
            </div>
          </div>

          <div class="py-1 px-1">
            <A
              href="/dashboard"
              class="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors duration-150 cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-bg-muted)";
                e.currentTarget.style.color = "var(--color-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
              onClick={() => setMenuOpen(false)}
            >
              <span class="text-sm">{"\u25A0"}</span>
              <span class="font-medium">Dashboard</span>
            </A>
            <A
              href="/settings"
              class="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors duration-150 cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-bg-muted)";
                e.currentTarget.style.color = "var(--color-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
              onClick={() => setMenuOpen(false)}
            >
              <span class="text-sm">{"\u2699"}</span>
              <span class="font-medium">Settings</span>
            </A>
          </div>

          <div class="px-1 py-1" style={{ "border-top": "1px solid var(--color-border)" }}>
            <button
              class="flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-md transition-colors duration-150 cursor-pointer"
              style={{ color: "var(--color-danger)" }}
              onClick={() => {
                setMenuOpen(false);
                auth.logout();
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-danger-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              type="button"
            >
              <span class="text-sm">{"\u{279C}"}</span>
              <span class="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ── Theme Toggle ─────────────────────────────────────────────────────

function ThemeToggle(): JSX.Element {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      class="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark() ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      <span class="theme-icon">
        <Show when={isDark()} fallback={<span>{"\u263E"}</span>}>
          <span>{"\u2600"}</span>
        </Show>
      </span>
    </button>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function Sidebar(props: SidebarProps): JSX.Element {
  const location = useLocation();
  const isActive = (href: string): boolean => location.pathname === href;

  return (
    <aside
      class="flex flex-col shrink-0 transition-all duration-200 ease-out overflow-y-auto overflow-x-hidden"
      style={{
        width: props.collapsed ? "52px" : "220px",
        "border-right": "1px solid var(--color-border)",
        background: "var(--color-bg-subtle)",
      }}
    >
      <div
        class="flex items-center h-11"
        style={{
          "justify-content": props.collapsed ? "center" : "flex-end",
          "padding-right": props.collapsed ? "0" : "0.75rem",
          "border-bottom": "1px solid var(--color-border)",
        }}
      >
        <button
          class="flex items-center justify-center w-7 h-7 rounded-md text-xs cursor-pointer transition-colors duration-150"
          style={{
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
          }}
          onClick={props.onToggle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-bg-muted)";
            e.currentTarget.style.color = "var(--color-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--color-text-muted)";
          }}
          type="button"
          aria-label={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {props.collapsed ? "\u25B6" : "\u25C0"}
        </button>
      </div>

      <nav class="flex-1 py-2 px-1.5">
        <For each={sidebarNavItems}>
          {(item) => (
            <A
              href={item.href}
              class="relative flex items-center gap-2.5 my-0.5 rounded-md transition-colors duration-150 cursor-pointer"
              style={{
                "justify-content": props.collapsed ? "center" : "flex-start",
                padding: props.collapsed ? "0.625rem 0" : "0.5rem 0.75rem",
                background: isActive(item.href) ? "var(--color-primary-light)" : "transparent",
                color: isActive(item.href) ? "var(--color-primary-text)" : "var(--color-text-secondary)",
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.href)) {
                  e.currentTarget.style.background = "var(--color-bg-muted)";
                  e.currentTarget.style.color = "var(--color-text)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.href)) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--color-text-secondary)";
                }
              }}
              title={props.collapsed ? item.label : undefined}
            >
              <Show when={isActive(item.href)}>
                <span
                  class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full"
                  style={{ background: "var(--color-primary)" }}
                />
              </Show>

              <span
                class="text-sm shrink-0"
                style={{
                  width: props.collapsed ? "auto" : "1.25rem",
                  "text-align": "center",
                }}
              >
                {item.icon}
              </span>

              <Show when={!props.collapsed}>
                <span class="text-sm font-medium truncate">
                  {item.label}
                </span>
              </Show>
            </A>
          )}
        </For>
      </nav>

      <Show when={!props.collapsed}>
        <div
          class="px-3 py-2.5"
          style={{ "border-top": "1px solid var(--color-border)" }}
        >
          <p
            class="text-[10px] uppercase tracking-[0.15em] font-medium"
            style={{ color: "var(--color-text-faint)" }}
          >
            Crontech
          </p>
        </div>
      </Show>
    </aside>
  );
}

// ── Layout ───────────────────────────────────────────────────────────

interface LayoutProps {
  children: JSX.Element;
}

export function Layout(props: LayoutProps): JSX.Element {
  const auth = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);

  return (
    <div
      class="flex flex-col min-h-screen"
      style={{
        background: "var(--color-bg)",
        color: "var(--color-text)",
      }}
    >
      {/* ── Navbar ──────────────────────────────────────────────── */}
      <header
        class="sticky top-0 z-50"
        style={{
          background: "var(--color-bg-elevated)",
          "border-bottom": "1px solid var(--color-border)",
        }}
      >
        <div class="flex items-center justify-between h-14 px-4 md:px-6">
          <div class="flex items-center gap-8">
            <A
              href="/"
              class="flex items-center gap-2 cursor-pointer"
            >
              <span class="text-lg">{"\u26A1"}</span>
              <span
                class="text-lg font-bold tracking-tight"
                style={{ color: "var(--color-text)" }}
              >
                Crontech
              </span>
            </A>

            <nav class="hidden md:flex items-center gap-0.5">
              <NavLink href="/" label="Home" />
              <Show when={auth.isAuthenticated()}>
                <NavLink href="/dashboard" label="Dashboard" />
                <NavLink href="/builder" label="Composer" />
                <NavLink href="/chat" label="Chat" />
                <NavLink href="/projects" label="Projects" />
              </Show>
              <NavLink href="/pricing" label="Pricing" />
            </nav>
          </div>

          <div class="flex items-center gap-2">
            <ThemeToggle />
            <Show when={auth.isAuthenticated()}>
              <NotificationCenter />
            </Show>
            <Show
              when={auth.isAuthenticated()}
              fallback={
                <A href="/login" class="ml-1">
                  <Button variant="primary" size="sm">
                    Sign In
                  </Button>
                </A>
              }
            >
              <UserMenu />
            </Show>
          </div>
        </div>
      </header>

      {/* ── Body (sidebar + content) ──────────────────────────── */}
      <div class="flex flex-1 overflow-hidden">
        <Show when={auth.isAuthenticated()}>
          <Sidebar
            collapsed={sidebarCollapsed()}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed())}
          />
        </Show>
        <main class="flex-1 overflow-y-auto">
          {props.children}
        </main>
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer
        style={{
          "border-top": "1px solid var(--color-border)",
          background: "var(--color-bg-elevated)",
        }}
      >
        <div class="flex flex-col md:flex-row items-center justify-between gap-3 px-6 py-4">
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1.5">
              <span class="text-sm">{"\u26A1"}</span>
              <span
                class="text-sm font-bold tracking-tight"
                style={{ color: "var(--color-text)" }}
              >
                Crontech
              </span>
            </div>
            <span
              class="hidden md:inline-block text-xs"
              style={{ color: "var(--color-text-faint)" }}
            >
              {"\u00A9"} {new Date().getFullYear()} Crontech. All rights reserved.
            </span>
          </div>

          <nav class="flex items-center gap-1">
            <For each={[
              { href: "/legal/terms", label: "Terms" },
              { href: "/legal/privacy", label: "Privacy" },
              { href: "/legal/dmca", label: "DMCA" },
              { href: "/legal/cookies", label: "Cookies" },
              { href: "/legal/acceptable-use", label: "Acceptable Use" },
            ]}>
              {(link) => (
                <A
                  href={link.href}
                  class="px-2 py-1 text-xs rounded-md transition-colors duration-150 cursor-pointer"
                  style={{ color: "var(--color-text-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--color-text)";
                    e.currentTarget.style.background = "var(--color-bg-muted)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--color-text-muted)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {link.label}
                </A>
              )}
            </For>
          </nav>
        </div>
      </footer>
    </div>
  );
}
