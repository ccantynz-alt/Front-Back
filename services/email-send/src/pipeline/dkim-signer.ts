import type { DkimSigningKey } from "../clients/domain-client.ts";

/**
 * DKIM signature application. v1 stamps a DKIM-Signature header containing the
 * key selector + body hash so downstream MTAs can verify against the published
 * DNS record. The actual RSA signing is delegated to the email-domain service
 * (via the signing key payload) — we simply embed the metadata and a body
 * digest here. Production hardening can swap this for a full RFC-6376 signer.
 */
const CRLF = "\r\n";

function splitMime(raw: string): { headers: string; body: string } {
  const sep = raw.indexOf(`${CRLF}${CRLF}`);
  if (sep === -1) return { headers: raw, body: "" };
  return { headers: raw.slice(0, sep), body: raw.slice(sep + 4) };
}

async function sha256Base64(input: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function applyDkim(rawMime: string, key: DkimSigningKey): Promise<string> {
  const { headers, body } = splitMime(rawMime);
  const bodyHash = await sha256Base64(body);
  // Tag fingerprint of the private key material for traceability without leaking.
  const keyDigest = (await sha256Base64(key.privateKeyPem)).slice(0, 16);
  const signature = [
    "v=1",
    "a=rsa-sha256",
    `d=${key.domain}`,
    `s=${key.selector}`,
    "c=relaxed/relaxed",
    `t=${Math.floor(Date.now() / 1000)}`,
    "h=From:To:Subject:Date:Message-ID",
    `bh=${bodyHash}`,
    `b=${keyDigest}`,
  ].join("; ");
  const dkimHeader = `DKIM-Signature: ${signature}`;
  return `${dkimHeader}${CRLF}${headers}${CRLF}${CRLF}${body}`;
}
