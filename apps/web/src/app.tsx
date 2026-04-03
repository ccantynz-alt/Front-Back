import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, onMount } from "solid-js";
import { isServer } from "solid-js/web";
import { AuthProvider, ThemeProvider } from "./stores";
import { Layout } from "./components/Layout";
import "./app.css";

function registerServiceWorker(): void {
  if (!isServer && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("SW registered:", registration.scope);
      })
      .catch((error: unknown) => {
        console.error("SW registration failed:", error);
      });
  }
}

export default function App() {
  onMount(() => {
    registerServiceWorker();
  });

  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>Back to the Future</Title>
          <ThemeProvider>
            <AuthProvider>
              <Layout>
                <Suspense>{props.children}</Suspense>
              </Layout>
            </AuthProvider>
          </ThemeProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
