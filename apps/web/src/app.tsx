import { MetaProvider, Title } from "@solidjs/meta";
import { Router, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, onMount, createEffect, onCleanup } from "solid-js";
import { AuthProvider, ThemeProvider, FeatureFlagProvider } from "./stores";
import { Layout } from "./components/Layout";
import { CommandPalette } from "./components/CommandPalette";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/Toast";
import { initAnalytics, stopAnalytics, trackPageView } from "./lib/analytics";
import "./app.css";

function AnalyticsTracker(): null {
  const location = useLocation();

  onMount(() => {
    initAnalytics();
    trackPageView(location.pathname);
  });

  createEffect(() => {
    trackPageView(location.pathname);
  });

  onCleanup(() => {
    stopAnalytics();
  });

  return null;
}

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>Marco Reid</Title>
          <ThemeProvider>
            <AuthProvider>
              <FeatureFlagProvider>
                <AppErrorBoundary>
                  <AnalyticsTracker />
                  <CommandPalette />
                  <ToastContainer />
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
