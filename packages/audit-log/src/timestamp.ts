// ── RFC 3161 Timestamp Authority Interface ─────────────────────────
// A Timestamping Authority (TSA) issues a signed token asserting
// that a given hash existed at a given time. For court admissibility
// under FRE 902(14), the token MUST come from a trusted third party
// — freetsa.org, DigiCert, SectigoTSA, or an in-house TSA backed by
// an HSM. This file defines the adapter interface only; concrete
// providers are contributed by downstream packages.
//
// The interface is deliberately transport-agnostic: implementations
// can hit an HTTP TSA endpoint, call a local HSM via PKCS#11, or
// produce a mocked token for tests. The returned token is treated
// as an opaque blob by the audit log — verification is delegated
// back to the TSA implementation that issued it.

export interface TsaToken {
  /** Token blob, base64-encoded, as supplied by the TSA. */
  token: string;
  /** Timestamp claimed by the TSA (ISO 8601, from the tstInfo). */
  issuedAt: string;
  /** Human-readable TSA identifier, e.g. "freetsa.org" or "hsm:local". */
  issuer: string;
}

export interface TimestampAuthority {
  /**
   * Request a timestamp token for the given SHA-256 hex digest.
   * Implementations are expected to embed the hash in an RFC 3161
   * TimeStampReq and return the base64-encoded TimeStampResp
   * (or an equivalent opaque blob).
   */
  stamp(hashHex: string): Promise<TsaToken>;

  /**
   * Verify that `token` was issued for `hashHex` and is valid at
   * the time this method is called. Implementations should check
   * signature validity, certificate chain, and that the embedded
   * message imprint matches the supplied hash.
   */
  verify(hashHex: string, token: TsaToken): Promise<boolean>;
}

// ── NullTsa ─────────────────────────────────────────────────────────
// Default TSA used when no trusted timestamp is required (dev, tests,
// Sentinel internal logs). Produces a deterministic fake token that
// round-trips through verify() successfully but is **not**
// court-admissible. Downstream consumers that need admissibility
// must supply a real TsA implementation.

export class NullTsa implements TimestampAuthority {
  async stamp(hashHex: string): Promise<TsaToken> {
    return {
      token: Buffer.from(`null-tsa:${hashHex}`).toString("base64"),
      issuedAt: new Date().toISOString(),
      issuer: "null-tsa",
    };
  }

  async verify(hashHex: string, token: TsaToken): Promise<boolean> {
    if (token.issuer !== "null-tsa") return false;
    const expected = Buffer.from(`null-tsa:${hashHex}`).toString("base64");
    return token.token === expected;
  }
}
