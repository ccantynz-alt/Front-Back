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
      class="group relative px-3 py-2 text-sm font-medium transition-all duration-300 cursor-pointer"
      classList={{
        "text-white": isActive(),
        "text-neutral-400 hover:text-white": !isActive(),
      }}
    >
      <span class="relative z-10">{props.label}</span>

      {/* Hover glow background */}
      <span
        class="absolute inset-0 rounded-lg bg-white/[0.04] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      />

      {/* Active gradient underline */}
      <span
        class="absolute bottom-0 left-1/2 h-[2px] -translate-x-1/2 rounded-full transition-all duration-400 ease-out"
        classList={{
          "w-4/5 bg-gradient-to-r from-violet-500 via-violet-400 to-cyan-500 shadow-[0_0_8px_rgba(139,92,246,0.4)]": isActive(),
          "w-0 group-hover:w-3/5 bg-white/20": !isActive(),
        }}
      />
    </A>
  );
}

// ── User Menu (premium dropdown) ─────────────────────────────────────

function UserMenu(): JSX.Element {
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;

  // Close dropdown when clicking outside
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

  const roleBadgeColor = (): string => {
    const role = auth.currentUser()?.role;
    if (role === "admin") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (role === "editor") return "bg-violet-500/20 text-violet-400 border-violet-500/30";
    return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
  };

  return (
    <div class="relative" ref={menuRef}>
      {/* Avatar button with animated gradient ring */}
      <button
        class="relative flex items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-all duration-300 hover:scale-110 active:scale-95 group"
        onClick={() => setMenuOpen(!menuOpen())}
        type="button"
        aria-label="User menu"
      >
        {/* Outer glow on hover */}
        <span class="absolute -inset-1 rounded-full bg-gradient-to-br from-violet-500/0 to-cyan-500/0 group-hover:from-violet-500/20 group-hover:to-cyan-500/20 transition-all duration-300 blur-sm" />

        {/* Gradient border ring with animation */}
        <span class="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 p-[1.5px] transition-all duration-300 group-hover:from-violet-400 group-hover:to-cyan-400">
          <span class="flex items-center justify-center w-full h-full rounded-full bg-[#0d0d0d] transition-colors duration-300 group-hover:bg-[#111111]">
            <span class="text-sm font-bold text-white">{userInitial()}</span>
          </span>
        </span>
      </button>

      <Show when={menuOpen()}>
        <div
          class="absolute right-0 top-full mt-3 w-72 rounded-2xl border border-white/[0.08] bg-[#0d0d0d]/98 backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden z-50"
          style="animation: crontech-menu-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
        >
          {/* User info header with subtle gradient */}
          <div class="px-5 py-4 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
            <div class="flex items-center gap-3.5">
              {/* Larger avatar in dropdown */}
              <span class="relative flex items-center justify-center w-11 h-11 rounded-full shrink-0">
                <span class="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 p-[1.5px]">
                  <span class="flex items-center justify-center w-full h-full rounded-full bg-[#0d0d0d]">
                    <span class="text-base font-bold text-white">{userInitial()}</span>
                  </span>
                </span>
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-white truncate leading-tight">
                  {auth.currentUser()?.displayName}
                </p>
                <p class="text-xs text-neutral-500 truncate mt-0.5">
                  {auth.currentUser()?.email}
                </p>
                <Show when={auth.currentUser()?.role}>
                  <span
                    class={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border ${roleBadgeColor()}`}
                  >
                    {auth.currentUser()?.role}
                  </span>
                </Show>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div class="py-1.5 px-1.5">
            <A
              href="/dashboard"
              class="group flex items-center gap-3 px-3.5 py-2.5 text-sm text-neutral-300 hover:text-white rounded-xl hover:bg-white/[0.05] transition-all duration-200 cursor-pointer"
              onClick={() => setMenuOpen(false)}
            >
              <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20 transition-colors duration-200 text-sm">{"\u25A0"}</span>
              <span class="font-medium">Dashboard</span>
            </A>
            <A
              href="/settings"
              class="group flex items-center gap-3 px-3.5 py-2.5 text-sm text-neutral-300 hover:text-white rounded-xl hover:bg-white/[0.05] transition-all duration-200 cursor-pointer"
              onClick={() => setMenuOpen(false)}
            >
              <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors duration-200 text-sm">{"\u2699"}</span>
              <span class="font-medium">Settings</span>
            </A>
          </div>

          {/* Sign out */}
          <div class="border-t border-white/[0.06] p-1.5">
            <button
              class="group flex items-center gap-3 w-full px-3.5 py-2.5 text-sm text-neutral-400 hover:text-red-400 rounded-xl hover:bg-red-500/[0.08] transition-all duration-200 cursor-pointer"
              onClick={() => {
                setMenuOpen(false);
                auth.logout();
              }}
              type="button"
            >
              <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-500/10 text-neutral-500 group-hover:bg-red-500/15 group-hover:text-red-400 transition-colors duration-200 text-sm">{"\u{279C}"}</span>
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
      class="group flex items-center justify-center w-9 h-9 rounded-xl text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all duration-300 cursor-pointer active:scale-90"
      onClick={toggleTheme}
      aria-label={isDark() ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      <Show when={isDark()} fallback={<span class="text-lg transition-transform duration-300 group-hover:rotate-[-20deg]">{"\u263E"}</span>}>
        <span class="text-lg transition-transform duration-300 group-hover:rotate-45">{"\u2600"}</span>
      </Show>
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
      class="relative flex flex-col shrink-0 border-r border-white/[0.06] bg-[#080808] transition-all duration-300 ease-out"
      classList={{
        "w-[68px]": props.collapsed,
        "w-60": !props.collapsed,
      }}
    >
      {/* Subtle gradient glow along the right edge */}
      <div class="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-violet-500/20 via-transparent to-cyan-500/20 pointer-events-none" />

      {/* Toggle button */}
      <div
        class="flex items-center h-12 border-b border-white/[0.04]"
        classList={{
          "justify-center": props.collapsed,
          "justify-end pr-3": !props.collapsed,
        }}
      >
        <button
          class="flex items-center justify-center w-7 h-7 rounded-lg text-neutral-600 hover:text-neutral-300 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer text-xs active:scale-90"
          onClick={props.onToggle}
          type="button"
          aria-label={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {props.collapsed ? "\u25B6" : "\u25C0"}
        </button>
      </div>

      {/* Nav items */}
      <nav class="flex-1 py-3 px-2 overflow-y-auto">
        <For each={sidebarNavItems}>
          {(item) => (
            <A
              href={item.href}
              class="group relative flex items-center gap-3 my-0.5 rounded-xl transition-all duration-200 cursor-pointer"
              classList={{
                "justify-center px-0 py-3": props.collapsed,
                "px-3 py-2.5": !props.collapsed,
              }}
              title={props.collapsed ? item.label : undefined}
            >
              {/* Active background glow */}
              <Show when={isActive(item.href)}>
                <span class="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/12 via-violet-500/8 to-cyan-500/6" />
                {/* Left edge accent bar */}
                <span class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-violet-400 to-cyan-400 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
              </Show>

              {/* Hover background */}
              <Show when={!isActive(item.href)}>
                <span class="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-200" />
              </Show>

              {/* Icon */}
              <span
                class="relative z-10 text-base shrink-0 transition-all duration-200"
                classList={{
                  "w-5 text-center": !props.collapsed,
                  "text-violet-400": isActive(item.href),
                  "text-neutral-500 group-hover:text-neutral-300 group-hover:scale-110": !isActive(item.href),
                }}
              >
                {item.icon}
              </span>

              <Show when={!props.collapsed}>
                <span
                  class="relative z-10 text-sm font-medium truncate transition-colors duration-200"
                  classList={{
                    "text-white": isActive(item.href),
                    "text-neutral-400 group-hover:text-white": !isActive(item.href),
                  }}
                >
                  {item.label}
                </span>
              </Show>
            </A>
          )}
        </For>
      </nav>

      {/* Sidebar footer branding */}
      <Show when={!props.collapsed}>
        <div class="px-4 py-3 border-t border-white/[0.04]">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-neutral-700">{"\u26A1"}</span>
            <p class="text-[10px] text-neutral-600 uppercase tracking-[0.2em] font-medium">
              Crontech
            </p>
          </div>
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
    <div class="flex flex-col min-h-screen bg-[#060606] text-white">
      {/* ── Navbar (frosted glass, sticky, premium) ──────────────── */}
      <header class="sticky top-0 z-50 backdrop-blur-2xl bg-[#060606]/75 border-b border-white/[0.06]">
        {/* Top accent line -- subtle gradient */}
        <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />

        <div class="flex items-center justify-between h-14 px-4 md:px-6">
          {/* Left: Logo + nav links */}
          <div class="flex items-center gap-8">
            {/* Logo with premium treatment */}
            <A href="/" class="flex items-center gap-2.5 cursor-pointer group relative">
              {/* Logo glow on hover */}
              <span class="absolute -inset-3 rounded-2xl bg-gradient-to-r from-violet-500/0 to-cyan-500/0 group-hover:from-violet-500/5 group-hover:to-cyan-500/5 transition-all duration-500 blur-lg" />

              <span class="relative text-xl transition-all duration-500 group-hover:rotate-12 group-hover:scale-110">{"\u26A1"}</span>
              <span
                class="relative text-xl font-extrabold tracking-tight bg-gradient-to-r from-violet-500 via-violet-400 to-cyan-500 bg-clip-text"
                style="-webkit-background-clip: text; -webkit-text-fill-color: transparent;"
              >
                Crontech
              </span>
            </A>

            {/* Navigation links */}
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

          {/* Right: Actions cluster */}
          <div class="flex items-center gap-1.5">
            <ThemeToggle />
            <Show when={auth.isAuthenticated()}>
              <NotificationCenter />
            </Show>
            <Show
              when={auth.isAuthenticated()}
              fallback={
                <A href="/login" class="ml-2">
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

      {/* ── Body (sidebar + content) ──────────────────────────────── */}
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

      {/* ── Footer (premium) ──────────────────────────────────────── */}
      <footer class="relative border-t border-white/[0.06] bg-[#080808]">
        {/* Top accent line */}
        <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        <div class="flex flex-col md:flex-row items-center justify-between gap-4 px-6 py-5">
          {/* Left: branding */}
          <div class="flex items-center gap-6">
            <div class="flex items-center gap-2">
              <span class="text-sm">{"\u26A1"}</span>
              <span
                class="text-sm font-bold tracking-tight bg-gradient-to-r from-violet-500 to-cyan-500 bg-clip-text"
                style="-webkit-background-clip: text; -webkit-text-fill-color: transparent;"
              >
                Crontech
              </span>
            </div>
            <span class="hidden md:inline-block w-px h-4 bg-white/[0.08]" />
            <span class="text-xs text-neutral-600">
              {"\u00A9"} {new Date().getFullYear()} Crontech. All rights reserved.
            </span>
          </div>

          {/* Right: legal links */}
          <nav class="flex items-center gap-1">
            <A href="/legal/terms" class="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300 rounded-md hover:bg-white/[0.03] transition-all duration-200 cursor-pointer">
              Terms
            </A>
            <A href="/legal/privacy" class="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300 rounded-md hover:bg-white/[0.03] transition-all duration-200 cursor-pointer">
              Privacy
            </A>
            <A href="/legal/dmca" class="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300 rounded-md hover:bg-white/[0.03] transition-all duration-200 cursor-pointer">
              DMCA
            </A>
            <A href="/legal/cookies" class="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300 rounded-md hover:bg-white/[0.03] transition-all duration-200 cursor-pointer">
              Cookies
            </A>
            <A href="/legal/acceptable-use" class="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300 rounded-md hover:bg-white/[0.03] transition-all duration-200 cursor-pointer">
              Acceptable Use
            </A>
          </nav>
        </div>
      </footer>

      {/* ── Inline keyframes for animations ───────────────────────── */}
      <style>{`
        @keyframes crontech-menu-enter {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(-8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
