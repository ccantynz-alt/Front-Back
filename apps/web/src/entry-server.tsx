// @refresh reload
import { StartServer, createHandler } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover"
          />
          {/* Instant theme flash prevention */}
          <meta name="color-scheme" content="light dark" />
          {/* Enable DNS prefetching globally */}
          <meta http-equiv="X-DNS-Prefetch-Control" content="on" />
          {/* API server resource hints */}
          <link rel="preconnect" href="http://localhost:3001" />
          <link rel="dns-prefetch" href="http://localhost:3001" />
          <link rel="icon" href="/favicon.ico" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
