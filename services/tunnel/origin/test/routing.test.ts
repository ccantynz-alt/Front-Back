import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ROUTING,
  type RoutingConfig,
  buildLocalUrl,
  extractPath,
  resolveLocalPort,
} from "../src/routing";
import type { RequestFrame } from "../../shared/frame";

const routing: RoutingConfig = DEFAULT_ROUTING;

describe("origin/routing: extractPath", () => {
  test("returns path-only urls untouched", () => {
    expect(extractPath("/dashboard")).toBe("/dashboard");
  });
  test("extracts path from absolute urls", () => {
    expect(extractPath("https://demo.crontech.app/api/echo")).toBe("/api/echo");
  });
  test("preserves query string", () => {
    expect(extractPath("https://demo.crontech.app/api/echo?x=1")).toBe("/api/echo?x=1");
  });
  test("returns / on garbage input", () => {
    expect(extractPath("not-a-url")).toBe("/");
  });
});

describe("origin/routing: resolveLocalPort", () => {
  test("API paths route to the API port", () => {
    expect(resolveLocalPort("/api/foo", routing)).toBe(3001);
    expect(resolveLocalPort("/trpc/projects.list", routing)).toBe(3001);
    expect(resolveLocalPort("/healthz", routing)).toBe(3001);
    expect(resolveLocalPort("/auth/login", routing)).toBe(3001);
  });
  test("non-API paths fall through to default", () => {
    expect(resolveLocalPort("/", routing)).toBe(3000);
    expect(resolveLocalPort("/dashboard", routing)).toBe(3000);
  });
  test("absolute URLs are normalised before routing", () => {
    expect(resolveLocalPort("https://demo.crontech.app/api/foo", routing)).toBe(3001);
    expect(resolveLocalPort("https://demo.crontech.app/", routing)).toBe(3000);
  });
  test("first matching rule wins", () => {
    const custom: RoutingConfig = {
      rules: [
        { pathPrefix: "/api/v2", port: 9000 },
        { pathPrefix: "/api", port: 3001 },
      ],
      defaultPort: 3000,
    };
    expect(resolveLocalPort("/api/v2/foo", custom)).toBe(9000);
    expect(resolveLocalPort("/api/v1/foo", custom)).toBe(3001);
  });
});

describe("origin/routing: buildLocalUrl", () => {
  test("preserves path and ignores host", () => {
    const req: RequestFrame = {
      type: "request",
      id: "x",
      hostname: "demo.crontech.app",
      method: "GET",
      url: "https://demo.crontech.app/dashboard",
      headers: {},
      body: "",
    };
    expect(buildLocalUrl(req, 3000)).toBe("http://127.0.0.1:3000/dashboard");
  });
});
