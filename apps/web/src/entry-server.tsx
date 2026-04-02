// @refresh reload
import { StartServer, createHandler } from "@solidjs/start/server";

const speculationRules = JSON.stringify({
  prerender: [
    {
      urls: ["/dashboard", "/builder", "/about"],
      eagerness: "eager",
    },
  ],
  prefetch: [
    {
      urls: ["/login", "/register"],
      eagerness: "moderate",
    },
  ],
});

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content="#2563eb" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <link rel="icon" href="/favicon.ico" />
          <script
            type="speculationrules"
            innerHTML={speculationRules}
          />
          <link rel="manifest" href="/manifest.json" />
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
