import { describe, expect, test } from "bun:test";
import { verifyHandshake } from "../src/accept";
import { generateNonce, signTunnelToken } from "../../shared/auth";

const SECRET = "edge-shared-secret";

describe("edge/accept: verifyHandshake", () => {
  test("accepts a freshly signed token whose claims match advertise", async () => {
    const claims = {
      id: "vps-1",
      ts: Math.floor(Date.now() / 1000),
      nonce: generateNonce(),
      hostnames: ["demo.crontech.app"],
    };
    const token = await signTunnelToken(claims, SECRET);
    const result = await verifyHandshake(token, ["demo.crontech.app"], SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.id).toBe("vps-1");
    }
  });

  test("rejects a token signed with a different secret", async () => {
    const token = await signTunnelToken(
      {
        id: "vps-1",
        ts: Math.floor(Date.now() / 1000),
        nonce: generateNonce(),
        hostnames: ["demo.crontech.app"],
      },
      "wrong-secret",
    );
    const result = await verifyHandshake(token, ["demo.crontech.app"], SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  test("rejects an advertise hostname not present in token claims", async () => {
    const token = await signTunnelToken(
      {
        id: "vps-1",
        ts: Math.floor(Date.now() / 1000),
        nonce: generateNonce(),
        hostnames: ["demo.crontech.app"],
      },
      SECRET,
    );
    const result = await verifyHandshake(token, ["evil.crontech.app"], SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  test("rejects when no hostnames are advertised", async () => {
    const token = await signTunnelToken(
      {
        id: "vps-1",
        ts: Math.floor(Date.now() / 1000),
        nonce: generateNonce(),
        hostnames: ["demo.crontech.app"],
      },
      SECRET,
    );
    const result = await verifyHandshake(token, [], SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  test("rejects when the edge has no shared secret configured", async () => {
    const result = await verifyHandshake("anytoken", ["demo.crontech.app"], "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
    }
  });
});
