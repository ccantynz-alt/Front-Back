// ── /register + /login — Golden Path Regression Guards ──────────────
//
// Pins the auth routes that every prospect hits. If either regresses
// (e.g. a silent removal of the passkey branch, or a loss of the
// Google OAuth button), customers bounce and the site is broken.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REGISTER_PATH = resolve(import.meta.dir, "register.tsx");
const LOGIN_PATH = resolve(import.meta.dir, "login.tsx");

describe("register route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(REGISTER_PATH)).toBe(true);
  });

  test("offers all three auth methods (passkey, Google OAuth, email+password)", () => {
    const src = readFileSync(REGISTER_PATH, "utf-8");
    // BLK-005 Auth model locks these three as primary/fallback. The
    // page must surface all three or the mode selector lies.
    expect(src.toLowerCase()).toContain("passkey");
    expect(src.toLowerCase()).toContain("google");
    expect(src.toLowerCase()).toContain("email");
  });

  test("honest guest-explorer uses a reserved @demo.local TLD", () => {
    const src = readFileSync(REGISTER_PATH, "utf-8");
    // The guest email is synthesised from Date.now() and a
    // non-routable TLD (`@demo.local`) so we never accidentally send
    // real email to a real user's address.
    expect(src).toContain("@demo.local");
  });

  test("post-signup destination is resolved through the sanitiser, not a raw query param", () => {
    const src = readFileSync(REGISTER_PATH, "utf-8");
    // resolvePostSignupDestination whitelists safe paths; raw `next`
    // query params are not trusted.
    expect(src).toContain("resolvePostSignupDestination");
  });
});

describe("login route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(LOGIN_PATH)).toBe(true);
  });

  test("surfaces all three auth methods", () => {
    const src = readFileSync(LOGIN_PATH, "utf-8");
    expect(src.toLowerCase()).toContain("passkey");
    expect(src.toLowerCase()).toContain("google");
    expect(src.toLowerCase()).toContain("email");
  });

  test("cross-links to /register for users without an account", () => {
    const src = readFileSync(LOGIN_PATH, "utf-8");
    expect(src).toContain("/register");
  });
});
