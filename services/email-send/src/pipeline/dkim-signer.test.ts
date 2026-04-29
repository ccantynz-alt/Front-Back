import { describe, expect, test } from "bun:test";
import { applyDkim } from "./dkim-signer.ts";

describe("applyDkim", () => {
  test("prepends a DKIM-Signature header containing selector and domain", async () => {
    const raw = "From: a@x.com\r\nTo: b@y.com\r\nSubject: hi\r\n\r\nbody";
    const signed = await applyDkim(raw, {
      domain: "x.com",
      selector: "default",
      privateKeyPem: "PEM",
    });
    expect(signed.startsWith("DKIM-Signature:")).toBe(true);
    expect(signed).toContain("d=x.com");
    expect(signed).toContain("s=default");
    expect(signed).toContain("a=rsa-sha256");
    expect(signed).toContain("bh=");
    expect(signed).toContain("\r\nFrom: a@x.com");
  });

  test("body hash differs for different bodies", async () => {
    const a = await applyDkim("From: a@x.com\r\n\r\none", {
      domain: "x.com",
      selector: "s",
      privateKeyPem: "PEM",
    });
    const b = await applyDkim("From: a@x.com\r\n\r\ntwo", {
      domain: "x.com",
      selector: "s",
      privateKeyPem: "PEM",
    });
    const aBh = /bh=([^;]+)/.exec(a)?.[1];
    const bBh = /bh=([^;]+)/.exec(b)?.[1];
    expect(aBh).toBeDefined();
    expect(bBh).toBeDefined();
    expect(aBh).not.toBe(bBh);
  });
});
