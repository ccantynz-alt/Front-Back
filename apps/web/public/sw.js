/// <reference lib="webworker" />

/**
 * Back to the Future - Service Worker
 * Offline-first PWA with aggressive caching and background sync.
 *
 * Cache strategies:
 *   - Cache-First: static assets (JS, CSS, fonts, images)
 *   - Network-First: API calls (/api/*)
 *   - Stale-While-Revalidate: HTML pages
 *
 * Background sync queues failed mutations for retry when online.
 */

const CACHE_VERSION = "btf-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

/** Critical assets precached on install (app shell). */
const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
];

/** Queue for failed mutations to retry when back online. */
const MUTATION_QUEUE_KEY = "btf-mutation-queue";

// ---------------------------------------------------------------------------
// Install: precache app shell, skip waiting for immediate activation
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ---------------------------------------------------------------------------
// Activate: clean up old caches, claim all clients immediately
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// Fetch: route requests to the right cache strategy
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Mutations (POST/PUT/DELETE/PATCH) — attempt network, queue on failure
  if (request.method !== "GET") {
    event.respondWith(handleMutation(request));
    return;
  }

  // API calls — Network-First
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/trpc/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Static assets — Cache-First
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML pages — Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
});

// ---------------------------------------------------------------------------
// Message handler: communicate with main thread
// ---------------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "GET_PENDING_COUNT") {
    getMutationQueue().then((queue) => {
      event.source.postMessage({
        type: "PENDING_COUNT",
        count: queue.length,
      });
    });
  }

  if (event.data && event.data.type === "RETRY_MUTATIONS") {
    retryMutations();
  }
});

// ---------------------------------------------------------------------------
// Online event: retry queued mutations
// ---------------------------------------------------------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "btf-mutation-sync") {
    event.waitUntil(retryMutations());
  }
});

// ---------------------------------------------------------------------------
// Cache Strategies
// ---------------------------------------------------------------------------

/**
 * Cache-First: serve from cache, update in background.
 * Best for static assets that change infrequently.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    // Update cache in background (non-blocking)
    fetchAndCache(request, cacheName);
    return cached;
  }
  return fetchAndCache(request, cacheName);
}

/**
 * Network-First: try network, fall back to cached response.
 * Best for API calls where freshness matters.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(
      JSON.stringify({ error: "offline", message: "You are offline and this data is not cached." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

/**
 * Stale-While-Revalidate: serve cached immediately, update in background.
 * Best for HTML pages where speed matters but freshness is nice.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const fetchPromise = fetchAndCache(request, cacheName);

  if (cached) {
    // Revalidate in background, serve stale immediately
    return cached;
  }

  // Nothing cached — must wait for network
  try {
    return await fetchPromise;
  } catch (_error) {
    return offlineFallback();
  }
}

/**
 * Handle mutations (POST/PUT/DELETE/PATCH).
 * Try network first; on failure, queue for background sync.
 */
async function handleMutation(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch (_error) {
    // Queue the mutation for retry when back online
    await queueMutation(request);
    // Register for background sync if available
    if (self.registration && self.registration.sync) {
      try {
        await self.registration.sync.register("btf-mutation-sync");
      } catch (_syncError) {
        // Background Sync API not available — will retry on next online event
      }
    }
    // Notify clients about pending mutation count
    broadcastPendingCount();
    return new Response(
      JSON.stringify({ error: "queued", message: "Mutation queued for retry when online." }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch a request and store it in the cache. Returns the response. */
async function fetchAndCache(request, cacheName) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

/** Check if a pathname points to a static asset. */
function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|wasm)(\?.*)?$/.test(
    pathname,
  );
}

/** Return an offline fallback response for HTML pages. */
function offlineFallback() {
  return new Response(
    [
      "<!DOCTYPE html>",
      '<html lang="en">',
      "<head>",
      '  <meta charset="utf-8"/>',
      '  <meta name="viewport" content="width=device-width,initial-scale=1"/>',
      "  <title>Offline - Back to the Future</title>",
      "  <style>",
      "    body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}",
      "    .c{text-align:center;max-width:420px;padding:2rem}",
      "    h1{font-size:1.5rem;margin-bottom:.5rem}",
      "    p{color:#a3a3a3;line-height:1.6}",
      "    button{margin-top:1.5rem;padding:.75rem 1.5rem;background:#2563eb;color:#fff;border:none;border-radius:.5rem;font-size:1rem;cursor:pointer}",
      "    button:hover{background:#1d4ed8}",
      "  </style>",
      "</head>",
      "<body>",
      '  <div class="c">',
      "    <h1>You are offline</h1>",
      "    <p>The page you requested is not available offline. Please check your connection and try again.</p>",
      '    <button onclick="location.reload()">Retry</button>',
      "  </div>",
      "</body>",
      "</html>",
    ].join("\n"),
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

// ---------------------------------------------------------------------------
// Mutation Queue (IndexedDB-backed via simple key-value in Cache API)
// ---------------------------------------------------------------------------

/** Serialize a request into a storable object. */
async function serializeRequest(request) {
  const body = await request.text();
  return {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: body || null,
    timestamp: Date.now(),
  };
}

/** Get the current mutation queue from cache storage. */
async function getMutationQueue() {
  try {
    const cache = await caches.open(MUTATION_QUEUE_KEY);
    const response = await cache.match("queue");
    if (response) {
      return await response.json();
    }
  } catch (_e) {
    // Ignore errors — return empty queue
  }
  return [];
}

/** Save the mutation queue to cache storage. */
async function saveMutationQueue(queue) {
  const cache = await caches.open(MUTATION_QUEUE_KEY);
  await cache.put(
    "queue",
    new Response(JSON.stringify(queue), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** Add a failed mutation to the queue. */
async function queueMutation(request) {
  const serialized = await serializeRequest(request);
  const queue = await getMutationQueue();
  queue.push(serialized);
  await saveMutationQueue(queue);
}

/** Retry all queued mutations. Removes successful ones from the queue. */
async function retryMutations() {
  const queue = await getMutationQueue();
  if (queue.length === 0) return;

  const remaining = [];

  for (const entry of queue) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
      });
      if (!response.ok && response.status >= 500) {
        // Server error — keep in queue for retry
        remaining.push(entry);
      }
      // 4xx errors are not retried (client error)
    } catch (_error) {
      // Still offline — keep in queue
      remaining.push(entry);
    }
  }

  await saveMutationQueue(remaining);
  broadcastPendingCount();
}

/** Broadcast the current pending mutation count to all clients. */
async function broadcastPendingCount() {
  const queue = await getMutationQueue();
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({
      type: "PENDING_COUNT",
      count: queue.length,
    });
  }
}
