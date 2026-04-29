/**
 * Standalone server entry — starts a Hono app exposing the admin API.
 * The customer-facing WAF middleware is exported from `./middleware.ts` and
 * meant to be mounted into apps/api at request-time. This server is for the
 * admin dashboard and for local development.
 */
import { Hono } from "hono";
import { createAdminApp } from "./admin";
import { InMemoryEventStore, InMemoryRuleStore } from "./store";

const adminToken = process.env["WAF_ADMIN_TOKEN"];
if (!adminToken) {
  console.error("WAF_ADMIN_TOKEN environment variable is required");
  process.exit(1);
}

const rules = new InMemoryRuleStore();
const events = new InMemoryEventStore();

const root = new Hono();
root.get("/healthz", (c) => c.json({ ok: true, service: "waf" }));
root.route("/admin", createAdminApp({ rules, events, adminToken }));

const port = Number.parseInt(process.env["PORT"] ?? "8788", 10);

export default {
  port,
  fetch: root.fetch,
};
