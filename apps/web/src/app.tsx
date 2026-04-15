import { MetaProvider, Title } from "@solidjs/meta";
import { Router, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, onMount, createEffect, onCleanup } from "solid-js";
import { AuthProvider, ThemeProvider, FeatureFlagProvider } from "./stores";
import { Layout } from "./components/Layout";
import { CommandPalette } from "./components/CommandPalette";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/Toast";
import { VoiceGlobal } from "./components/VoiceGlobal";
import { BuildTrack } from "./components/BuildTrack";
import { LaunchChecklist } from "./components/LaunchChecklist";
import { initAnalytics, stopAnalytics, trackPageView } from "./lib/analytics";
import { connectLiveUpdates, disconnectLiveUpdates } from "./lib/live-updates";
import "./app.css";

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
                  <CommandPalette />
                  <ToastContainer />
                  <VoiceGlobal />
                  <BuildTrack />
                  <LaunchChecklist />
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
