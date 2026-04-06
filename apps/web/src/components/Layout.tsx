import type { JSX } from "solid-js";
import { Show, createSignal } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { Button, Text } from "@back-to-the-future/ui";
import { useAuth, useTheme } from "../stores";
import { NotificationCenter } from "./NotificationCenter";

// ── Nav Link ──────────────────────────────────────────────────────────

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
      class={`nav-link ${isActive() ? "nav-link-active" : ""}`}
    >
      {props.label}
    </A>
  );
}

// ── User Menu ─────────────────────────────────────────────────────────

function UserMenu(): JSX.Element {
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = createSignal(false);

  return (
    <div class="user-menu">
      <button
        class="user-menu-trigger"
        onClick={() => setMenuOpen(!menuOpen())}
        type="button"
      >
        <span class="user-avatar">
          {auth.currentUser()?.displayName?.charAt(0).toUpperCase() ?? "?"}
        </span>
      </button>
      <Show when={menuOpen()}>
        <div class="user-menu-dropdown">
          <Text variant="caption" class="user-menu-name">
            {auth.currentUser()?.displayName}
          </Text>
          <Text variant="caption" class="user-menu-email">
            {auth.currentUser()?.email}
          </Text>
          <hr class="user-menu-divider" />
          <button
            class="user-menu-item"
            onClick={() => {
              setMenuOpen(false);
              auth.logout();
            }}
            type="button"
          >
            Sign Out
          </button>
        </div>
      </Show>
    </div>
  );
}

// ── Theme Toggle ──────────────────────────────────────────────────────

function ThemeToggle(): JSX.Element {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      class="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark() ? "Switch to light mode" : "Switch to dark mode"}
      type="button"
    >
      <Show when={isDark()} fallback={<span class="theme-icon">&#9790;</span>}>
        <span class="theme-icon">&#9728;</span>
      </Show>
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function isAccountingContext(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  const path = window.location.pathname;
  return host.startsWith("accounting.") || path === "/accounting" || path.startsWith("/accounting/");
}

function Sidebar(props: SidebarProps): JSX.Element {
  const accounting = isAccountingContext();
  return (
    <aside class={`sidebar ${props.collapsed ? "sidebar-collapsed" : ""}`}>
      <button class="sidebar-toggle" onClick={props.onToggle} type="button">
        {props.collapsed ? "\u25B6" : "\u25C0"}
      </button>
      <Show when={!props.collapsed}>
        <Show
          when={accounting}
          fallback={
            <nav class="sidebar-nav">
              <NavLink href="/dashboard" label="Dashboard" />
              <NavLink href="/builder" label="AI Builder" />
              <NavLink href="/collab" label="Collaboration" />
              <NavLink href="/video" label="Video Editor" />
              <NavLink href="/pricing" label="Pricing" />
              <NavLink href="/settings" label="Settings" />
              <NavLink href="/admin" label="Admin" />
              <NavLink href="/about" label="About" />
            </nav>
          }
        >
          <nav class="sidebar-nav">
            <NavLink href="/accounting/dashboard" label="Dashboard" />
            <NavLink href="/accounting/clients" label="Clients" />
            <NavLink href="/accounting/invoices" label="Invoices" />
            <NavLink href="/accounting/expenses" label="Expenses" />
            <NavLink href="/accounting/reports" label="Reports" />
            <NavLink href="/settings" label="Settings" />
          </nav>
        </Show>
      </Show>
    </aside>
  );
}

// ── Layout ────────────────────────────────────────────────────────────

interface LayoutProps {
  children: JSX.Element;
}

export function Layout(props: LayoutProps): JSX.Element {
  const auth = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);

  return (
    <div class="layout">
      <header class="navbar">
        <div class="navbar-left">
          <A href="/" class="navbar-logo">
            <Text variant="h4" weight="bold">BTF</Text>
          </A>
          <nav class="navbar-links">
            <NavLink href="/" label="Home" />
            <Show when={auth.isAuthenticated()}>
              <NavLink href="/dashboard" label="Dashboard" />
              <NavLink href="/builder" label="Builder" />
              <NavLink href="/collab" label="Collab" />
              <NavLink href="/video" label="Video" />
            </Show>
            <NavLink href="/pricing" label="Pricing" />
          </nav>
        </div>
        <div class="navbar-right">
          <ThemeToggle />
          <Show when={auth.isAuthenticated()}>
            <NotificationCenter />
          </Show>
          <Show
            when={auth.isAuthenticated()}
            fallback={
              <A href="/login">
                <Button variant="primary" size="sm">Sign In</Button>
              </A>
            }
          >
            <UserMenu />
          </Show>
        </div>
      </header>

      <div class="layout-body">
        <Show when={auth.isAuthenticated()}>
          <Sidebar
            collapsed={sidebarCollapsed()}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed())}
          />
        </Show>
        <main class="layout-content">
          {props.children}
        </main>
      </div>

      <footer class="layout-footer">
        <nav class="footer-links">
          <A href="/legal/terms">Terms</A>
          <A href="/legal/privacy">Privacy</A>
          <A href="/legal/dmca">DMCA</A>
          <A href="/legal/cookies">Cookies</A>
          <A href="/legal/acceptable-use">Acceptable Use</A>
        </nav>
        <Text variant="caption" class="text-muted">
          Marco Reid Platform
        </Text>
      </footer>
    </div>
  );
}
