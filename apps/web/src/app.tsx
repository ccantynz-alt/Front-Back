import { MetaProvider, Title } from "@solidjs/meta";
import { Router, useLocation, useNavigate } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, lazy, onMount, createEffect, onCleanup } from "solid-js";
import { AuthProvider, ThemeProvider, FeatureFlagProvider } from "./stores";
import { Layout } from "./components/Layout";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/Toast";
import { VoiceGlobal } from "./components/VoiceGlobal";
import { PreLaunchBanner } from "./components/PreLaunchBanner";
import { KeyboardHelp } from "./components/KeyboardHelp";
import { registerShortcut } from "./lib/keyboard";
import { initAnalytics, stopAnalytics, trackPageView } from "./lib/analytics";
import { connectLiveUpdates, disconnectLiveUpdates } from "./lib/live-updates";
import "./app.css";

// ── Lazy-loaded overlays (perf: keep out of initial bundle) ──────────
// CommandPalette: opens on Cmd+K → users rarely hit it on first paint.
// BuildTrack + LaunchChecklist: admin-only HUDs, ~50KB of JSX gated
// behind `user.role === "admin"` or a localStorage force flag. Loading
// them eagerly shipped that code to every visitor. See CLAUDE.md §6.6
// (initial JS < 50KB). Suspense fallbacks render nothing — no UI impact.
const CommandPalette = lazy(() =>
  import("./components/CommandPalette").then((m) => ({
    default: m.CommandPalette,
  })),
);
const BuildTrack = lazy(() =>
  import("./components/BuildTrack").then((m) => ({ default: m.BuildTrack })),
);
const LaunchChecklist = lazy(() =>
  import("./components/LaunchChecklist").then((m) => ({
    default: m.LaunchChecklist,
  })),
);

function AnalyticsTracker(): null {
  const location = useLocation();

  onMount(() => {
    initAnalytics();
    trackPageView(location.pathname);
    connectLiveUpdates();
  });

  createEffect(() => {
    trackPageView(location.pathname);
  });

  onCleanup(() => {
    stopAnalytics();
    disconnectLiveUpdates();
  });

  return null;
}

// ── Global Navigation Shortcuts ─────────────────────────────────────
// Registered once at the root so `g d`, `g p`, `g b` work from any
// route. Per-page shortcuts (Create, Next deploy, etc.) live in the
// pages themselves so they automatically scope to their context.
function GlobalShortcuts(): null {
  const navigate = useNavigate();

  onMount(() => {
    const offs = [
      registerShortcut({
        keys: "g d",
        description: "Go to Dashboard",
        group: "Navigation",
        action: () => navigate("/dashboard"),
      }),
      registerShortcut({
        keys: "g p",
        description: "Go to Projects",
        group: "Navigation",
        action: () => navigate("/projects"),
      }),
      registerShortcut({
        keys: "g b",
        description: "Go to Billing",
        group: "Navigation",
        action: () => navigate("/billing"),
      }),
    ];
    onCleanup(() => {
      for (const off of offs) off();
    });
  });

  return null;
}

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>Crontech</Title>
          <ThemeProvider>
            <AuthProvider>
              <FeatureFlagProvider>
                <AppErrorBoundary>
                  <AnalyticsTracker />
                  <GlobalShortcuts />
                  <KeyboardHelp />
                  <Suspense>
                    <CommandPalette />
                  </Suspense>
                  <ToastContainer />
                  <VoiceGlobal />
                  <Suspense>
                    <BuildTrack />
                  </Suspense>
                  <Suspense>
                    <LaunchChecklist />
                  </Suspense>
                  <PreLaunchBanner />
                  <Layout>
                    <Suspense>{props.children}</Suspense>
                  </Layout>
                </AppErrorBoundary>
              </FeatureFlagProvider>
            </AuthProvider>
          </ThemeProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
