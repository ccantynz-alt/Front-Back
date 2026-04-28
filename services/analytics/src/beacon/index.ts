/**
 * Crontech analytics beacon.
 *
 * Privacy posture (binding):
 *   - No cookies. No localStorage. No fingerprinting.
 *   - Session id is derived server-side from a daily-rotating salt.
 *   - The client only emits route, event, props, and UTM params parsed
 *     from the URL — never PII.
 *
 * Footprint target: under 1.5 KB gzipped.
 */

declare const window: {
  __ANALYTICS__?: { endpoint?: string; tenant?: string; bearer?: string };
  location: { pathname: string; search: string; href: string };
  addEventListener: (e: string, cb: () => void, o?: unknown) => void;
  history: { pushState: (...a: unknown[]) => void; replaceState: (...a: unknown[]) => void };
};
declare const document: {
  visibilityState: string;
  referrer: string;
  addEventListener: (e: string, cb: () => void) => void;
};
declare const navigator: {
  sendBeacon?: (url: string, data: string) => boolean;
};
declare const fetch: (
  url: string,
  init?: { method: string; body: string; keepalive: boolean; headers: Record<string, string> },
) => Promise<unknown>;

interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

interface Event {
  sessionId: string;
  route: string;
  event: string;
  props?: Record<string, string | number | boolean | null>;
  ts: number;
  referrer?: string;
  utm?: Utm;
  isEntry?: boolean;
}

const cfg = (typeof window !== "undefined" && window.__ANALYTICS__) || {};
const ENDPOINT = cfg.endpoint || "/a/v1/collect";
const TENANT = cfg.tenant || "default";
const BEARER = cfg.bearer;

// Client-side sessionId placeholder; server derives the canonical id.
const sid = "client-pending";

const queue: Event[] = [];
let lastRoute = "";
let isFirst = true;

const parseUtm = (search: string): Utm | undefined => {
  if (!search || search.length < 2) return undefined;
  const params = new URLSearchParams(search);
  const u: Utm = {};
  const s = params.get("utm_source");
  const m = params.get("utm_medium");
  const c = params.get("utm_campaign");
  const t = params.get("utm_term");
  const ct = params.get("utm_content");
  if (s) u.source = s.slice(0, 128);
  if (m) u.medium = m.slice(0, 128);
  if (c) u.campaign = c.slice(0, 128);
  if (t) u.term = t.slice(0, 128);
  if (ct) u.content = ct.slice(0, 128);
  return u.source || u.medium || u.campaign || u.term || u.content ? u : undefined;
};

export const track = (event: string, props?: Record<string, string | number | boolean | null>): void => {
  const route = window.location.pathname;
  const utm = parseUtm(window.location.search);
  const ev: Event = { sessionId: sid, route, event, ts: Date.now() };
  if (props) ev.props = props;
  if (document.referrer && isFirst) ev.referrer = document.referrer;
  if (utm) ev.utm = utm;
  if (isFirst) {
    ev.isEntry = true;
    isFirst = false;
  }
  queue.push(ev);
};

const pageview = (): void => {
  const route = window.location.pathname;
  if (route === lastRoute) return;
  lastRoute = route;
  track("$pageview");
};

const flush = (): void => {
  if (queue.length === 0) return;
  const events = queue.splice(0);
  const batch: { tenant: string; bearer?: string; events: Event[] } = { tenant: TENANT, events };
  if (BEARER) batch.bearer = BEARER;
  const body = JSON.stringify(batch);
  if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
  fetch(ENDPOINT, {
    method: "POST",
    body,
    keepalive: true,
    headers: { "content-type": "application/json" },
  }).catch(() => {
    /* swallow — best effort */
  });
};

// SPA route-change tracking via history-API patch. Standard pattern.
const wrap = (key: "pushState" | "replaceState"): void => {
  const orig = window.history[key];
  window.history[key] = function (this: unknown, ...args: unknown[]): unknown {
    const ret = (orig as (...a: unknown[]) => unknown).apply(this, args);
    pageview();
    return ret;
  } as typeof orig;
};
wrap("pushState");
wrap("replaceState");
window.addEventListener("popstate", pageview);

// Initial pageview.
pageview();

// Flush on page leave.
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});

// Expose track() so apps can call it from anywhere.
declare const globalThis: { __crontechTrack?: typeof track };
globalThis.__crontechTrack = track;
