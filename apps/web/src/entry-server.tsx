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
          <link rel="icon" href="/favicon.ico" />
          <script
            type="speculationrules"
            innerHTML={speculationRules}
          />
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
