import { buildDefaultApp } from "./app";

const { app } = buildDefaultApp({
  statsOrigins: (process.env["ANALYTICS_STATS_ORIGINS"] ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim()),
  collectPerMinute: Number(process.env["ANALYTICS_COLLECT_PER_MINUTE"] ?? 600),
});

export default {
  port: Number(process.env["PORT"] ?? 8788),
  fetch: app.fetch,
};
