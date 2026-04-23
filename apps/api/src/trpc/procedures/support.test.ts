// BLK-013 — support router module-load smoke test.
//
// A recent session introduced a `submitPublic: publicProcedure` procedure
// to the support router but forgot to import `publicProcedure` from
// `../init`. Because the router is lazily built, every other test that
// touched the router through its re-export graph failed with a
// `ReferenceError: publicProcedure is not defined` at module-load time,
// turning 97 tests red across the API package.
//
// This smoke test loads the router at the top of the tests so that any
// future "use the symbol, forget the import" regression surfaces here
// instead of in the downstream tests that pull the router in
// transitively. It intentionally does not call any procedure — the
// point is the module-load assertion, not business logic.

import { describe, test, expect } from "bun:test";
import { supportRouter } from "./support";
import { appRouter } from "../router";

describe("support router — module load", () => {
  test("supportRouter is defined and exports a tRPC router", () => {
    expect(supportRouter).toBeDefined();
    expect(typeof supportRouter).toBe("object");
  });

  test("supportRouter exposes the admin-facing procedures used by /admin/support", () => {
    const procs = (supportRouter as unknown as { _def: { record: Record<string, unknown> } })._def
      .record;
    expect(procs["listTickets"]).toBeDefined();
    expect(procs["getTicket"]).toBeDefined();
    expect(procs["approveDraft"]).toBeDefined();
    expect(procs["editAndSend"]).toBeDefined();
    expect(procs["updateStatus"]).toBeDefined();
    expect(procs["getStats"]).toBeDefined();
  });

  test("supportRouter exposes the submitPublic procedure used by the /support page", () => {
    const procs = (supportRouter as unknown as { _def: { record: Record<string, unknown> } })._def
      .record;
    expect(procs["submitPublic"]).toBeDefined();
    expect(procs["submitRequest"]).toBeDefined();
  });

  test("appRouter mounts the support namespace", () => {
    const procs = (appRouter as unknown as { _def: { record: Record<string, unknown> } })._def
      .record;
    expect(procs["support"]).toBeDefined();
  });
});
