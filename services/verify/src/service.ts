import { InMemoryAuditSink, type AuditSink } from "./audit.js";
import {
  constantTimeEqualsHex,
  generateCode,
  generateUuid,
  hashCode,
  hashIdentifier,
  type Rng,
  systemRng,
  urlSafeToken,
} from "./crypto.js";
import { DispatcherRegistry } from "./dispatchers.js";
import { RateLimiter } from "./rate-limit.js";
import {
  buildOtpAuthUri,
  generateBackupCodes,
  generateSecret,
  verifyTotp,
} from "./totp.js";
import type {
  Channel,
  CreateVerificationRequest,
  MagicLink,
  MagicLinkRequest,
  TotpRecord,
  TotpSecretRequest,
  Verification,
  VerificationStatus,
} from "./types.js";

export interface FraudScorer {
  score(input: {
    tenantId: string;
    identifierHash: string;
    action: "create" | "check" | "resend";
    channel?: Channel;
  }): Promise<{ score: number; allow: boolean; reason?: string }>;
}

export class AllowAllFraudScorer implements FraudScorer {
  async score(): Promise<{ score: number; allow: boolean }> {
    return { score: 0, allow: true };
  }
}

export interface VerifyServiceOptions {
  hashSecret: string;
  defaultTtlSeconds?: number;
  defaultCodeLength?: number;
  maxAttempts?: number;
  /** Per-identifier rate limit. */
  identifierRateLimit?: { max: number; windowMs: number };
  /** Per-tenant global rate limit. */
  tenantRateLimit?: { max: number; windowMs: number };
  rng?: Rng;
  now?: () => number;
  dispatchers?: DispatcherRegistry;
  audit?: AuditSink;
  fraud?: FraudScorer;
  issuer?: string;
}

export interface CreateVerificationResult {
  verificationId: string;
  status: VerificationStatus;
  expiresAt: number;
  /** ONLY populated when channel === "totp" or in test mode — never the OTP code. */
  channelDispatch?: {
    ok: boolean;
    error?: string;
  };
}

export interface CheckVerificationResult {
  status: "approved" | "rejected" | "expired" | "locked";
  attemptsRemaining: number;
}

export interface MagicLinkCreateResult {
  linkId: string;
  url: string;
  expiresAt: number;
}

export interface MagicLinkConsumeResult {
  ok: boolean;
  redirectUrl?: string;
  reason?: "not_found" | "expired" | "already_consumed" | "invalid_token";
}

export interface TotpSetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export class VerifyService {
  private readonly verifications = new Map<string, Verification>();
  private readonly magicLinks = new Map<string, MagicLink>();
  private readonly totpRecords = new Map<string, TotpRecord>();
  private readonly identifierLimiter: RateLimiter;
  private readonly tenantLimiter: RateLimiter;
  private readonly hashSecret: string;
  private readonly defaultTtl: number;
  private readonly defaultLen: number;
  private readonly maxAttempts: number;
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly dispatchers: DispatcherRegistry;
  private readonly audit: AuditSink;
  private readonly fraud: FraudScorer;
  private readonly issuer: string;

  constructor(opts: VerifyServiceOptions) {
    this.hashSecret = opts.hashSecret;
    this.defaultTtl = opts.defaultTtlSeconds ?? 600;
    this.defaultLen = opts.defaultCodeLength ?? 6;
    this.maxAttempts = opts.maxAttempts ?? 5;
    this.rng = opts.rng ?? systemRng;
    this.now = opts.now ?? (() => Date.now());
    this.dispatchers = opts.dispatchers ?? new DispatcherRegistry();
    this.audit = opts.audit ?? new InMemoryAuditSink();
    this.fraud = opts.fraud ?? new AllowAllFraudScorer();
    this.issuer = opts.issuer ?? "Crontech";
    this.identifierLimiter = new RateLimiter({
      max: opts.identifierRateLimit?.max ?? 5,
      windowMs: opts.identifierRateLimit?.windowMs ?? 15 * 60 * 1000,
      now: this.now,
    });
    this.tenantLimiter = new RateLimiter({
      max: opts.tenantRateLimit?.max ?? 1000,
      windowMs: opts.tenantRateLimit?.windowMs ?? 60 * 1000,
      now: this.now,
    });
  }

  async createVerification(
    req: CreateVerificationRequest,
  ): Promise<CreateVerificationResult> {
    const idHash = hashIdentifier(this.hashSecret, req.identifier);

    // Tenant-level rate limit first (covers DDOS / mass abuse).
    const tenantOk = this.tenantLimiter.allow(`tenant:${req.tenantId}`);
    if (!tenantOk.allowed) {
      this.audit.log({
        verificationId: "-",
        tenantId: req.tenantId,
        identifierHash: idHash,
        action: "create",
        result: "rate_limited",
        channel: req.channel,
        ...(req.requesterId ? { requesterId: req.requesterId } : {}),
        timestamp: this.now(),
      });
      throw new VerifyError("rate_limited", "tenant rate limit exceeded");
    }

    // Per-identifier rate limit.
    const idOk = this.identifierLimiter.allow(`id:${req.tenantId}:${idHash}`);
    if (!idOk.allowed) {
      this.audit.log({
        verificationId: "-",
        tenantId: req.tenantId,
        identifierHash: idHash,
        action: "create",
        result: "rate_limited",
        channel: req.channel,
        ...(req.requesterId ? { requesterId: req.requesterId } : {}),
        timestamp: this.now(),
      });
      throw new VerifyError("rate_limited", "identifier rate limit exceeded");
    }

    const fraud = await this.fraud.score({
      tenantId: req.tenantId,
      identifierHash: idHash,
      action: "create",
      channel: req.channel,
    });
    if (!fraud.allow) {
      this.audit.log({
        verificationId: "-",
        tenantId: req.tenantId,
        identifierHash: idHash,
        action: "create",
        result: "rejected",
        channel: req.channel,
        ...(req.requesterId ? { requesterId: req.requesterId } : {}),
        timestamp: this.now(),
      });
      throw new VerifyError("fraud_blocked", fraud.reason ?? "fraud score too high");
    }

    if (req.channel === "totp") {
      throw new VerifyError(
        "invalid_channel",
        "use POST /v1/totp/secrets to provision TOTP, then check with /v1/verifications/:id/check",
      );
    }
    if (req.channel === "magic_link") {
      throw new VerifyError(
        "invalid_channel",
        "use POST /v1/magic-links for magic-link flow",
      );
    }

    const verificationId = generateUuid(this.rng);
    const len = req.codeLength ?? this.defaultLen;
    const code = req.customCode ?? generateCode(len, this.rng);
    const ttl = (req.ttlSeconds ?? this.defaultTtl) * 1000;
    const t = this.now();

    const dispatcher = this.dispatchers.get(req.channel);
    if (!dispatcher) {
      throw new VerifyError(
        "no_dispatcher",
        `no dispatcher registered for channel ${req.channel}`,
      );
    }

    const record: Verification = {
      verificationId,
      tenantId: req.tenantId,
      identifierHash: idHash,
      channel: req.channel,
      codeHash: hashCode(this.hashSecret, code),
      status: "pending",
      attempts: 0,
      maxAttempts: this.maxAttempts,
      createdAt: t,
      expiresAt: t + ttl,
    };
    this.verifications.set(verificationId, record);

    const dispatch = await dispatcher.dispatch({
      tenantId: req.tenantId,
      identifier: req.identifier,
      channel: req.channel,
      code,
      ...(req.locale ? { locale: req.locale } : {}),
    });

    this.audit.log({
      verificationId,
      tenantId: req.tenantId,
      identifierHash: idHash,
      action: "create",
      result: dispatch.ok ? "success" : "failure",
      channel: req.channel,
      ...(req.requesterId ? { requesterId: req.requesterId } : {}),
      timestamp: this.now(),
    });

    return {
      verificationId,
      status: "pending",
      expiresAt: record.expiresAt,
      channelDispatch: { ok: dispatch.ok, ...(dispatch.error ? { error: dispatch.error } : {}) },
    };
  }

  async checkVerification(
    verificationId: string,
    code: string,
    requesterId?: string,
  ): Promise<CheckVerificationResult> {
    const record = this.verifications.get(verificationId);
    if (!record) {
      throw new VerifyError("not_found", "verification not found");
    }

    const fraud = await this.fraud.score({
      tenantId: record.tenantId,
      identifierHash: record.identifierHash,
      action: "check",
      channel: record.channel,
    });
    if (!fraud.allow) {
      this.audit.log({
        verificationId,
        tenantId: record.tenantId,
        identifierHash: record.identifierHash,
        action: "check",
        result: "rejected",
        channel: record.channel,
        ...(requesterId ? { requesterId } : {}),
        timestamp: this.now(),
      });
      throw new VerifyError("fraud_blocked", fraud.reason ?? "fraud score too high");
    }

    if (record.status === "approved") {
      return { status: "approved", attemptsRemaining: 0 };
    }
    if (record.status === "locked") {
      return { status: "locked", attemptsRemaining: 0 };
    }
    if (this.now() >= record.expiresAt) {
      record.status = "expired";
      this.audit.log({
        verificationId,
        tenantId: record.tenantId,
        identifierHash: record.identifierHash,
        action: "check",
        result: "failure",
        channel: record.channel,
        ...(requesterId ? { requesterId } : {}),
        timestamp: this.now(),
      });
      return { status: "expired", attemptsRemaining: 0 };
    }

    record.attempts += 1;
    const expectedHash = record.codeHash;
    const candidateHash = hashCode(this.hashSecret, code);
    const ok = constantTimeEqualsHex(expectedHash, candidateHash);

    if (ok) {
      record.status = "approved";
      this.audit.log({
        verificationId,
        tenantId: record.tenantId,
        identifierHash: record.identifierHash,
        action: "check",
        result: "success",
        channel: record.channel,
        ...(requesterId ? { requesterId } : {}),
        timestamp: this.now(),
      });
      return { status: "approved", attemptsRemaining: 0 };
    }

    const remaining = Math.max(0, record.maxAttempts - record.attempts);
    if (remaining === 0) {
      record.status = "locked";
      this.audit.log({
        verificationId,
        tenantId: record.tenantId,
        identifierHash: record.identifierHash,
        action: "check",
        result: "locked",
        channel: record.channel,
        ...(requesterId ? { requesterId } : {}),
        timestamp: this.now(),
      });
      return { status: "locked", attemptsRemaining: 0 };
    }

    this.audit.log({
      verificationId,
      tenantId: record.tenantId,
      identifierHash: record.identifierHash,
      action: "check",
      result: "failure",
      channel: record.channel,
      ...(requesterId ? { requesterId } : {}),
      timestamp: this.now(),
    });
    return { status: "rejected", attemptsRemaining: remaining };
  }

  async resend(
    verificationId: string,
    requesterId?: string,
  ): Promise<CreateVerificationResult> {
    const record = this.verifications.get(verificationId);
    if (!record) {
      throw new VerifyError("not_found", "verification not found");
    }
    if (record.status === "approved" || record.status === "locked") {
      throw new VerifyError("invalid_state", `cannot resend in status ${record.status}`);
    }

    // resend consumes a slot in the per-identifier limiter.
    const idOk = this.identifierLimiter.allow(
      `id:${record.tenantId}:${record.identifierHash}`,
    );
    if (!idOk.allowed) {
      this.audit.log({
        verificationId,
        tenantId: record.tenantId,
        identifierHash: record.identifierHash,
        action: "resend",
        result: "rate_limited",
        channel: record.channel,
        ...(requesterId ? { requesterId } : {}),
        timestamp: this.now(),
      });
      throw new VerifyError("rate_limited", "resend rate limit exceeded");
    }

    // Generate a fresh code, replace hash, extend expiry.
    const code = generateCode(this.defaultLen, this.rng);
    record.codeHash = hashCode(this.hashSecret, code);
    record.attempts = 0;
    record.expiresAt = this.now() + this.defaultTtl * 1000;
    record.status = "pending";

    const dispatcher = this.dispatchers.get(record.channel);
    if (!dispatcher) {
      throw new VerifyError("no_dispatcher", `no dispatcher for ${record.channel}`);
    }
    // We don't have the original identifier (only its hash). For resend we
    // require the dispatcher to operate on tenant + verification context.
    // In practice the upstream caller passes identifier on each request;
    // for v1 we encode the identifier only in dispatchers that accept it.
    const dispatch = await dispatcher.dispatch({
      tenantId: record.tenantId,
      identifier: `verification:${verificationId}`,
      channel: record.channel,
      code,
    });

    this.audit.log({
      verificationId,
      tenantId: record.tenantId,
      identifierHash: record.identifierHash,
      action: "resend",
      result: dispatch.ok ? "success" : "failure",
      channel: record.channel,
      ...(requesterId ? { requesterId } : {}),
      timestamp: this.now(),
    });

    return {
      verificationId,
      status: "pending",
      expiresAt: record.expiresAt,
      channelDispatch: { ok: dispatch.ok, ...(dispatch.error ? { error: dispatch.error } : {}) },
    };
  }

  setupTotp(req: TotpSecretRequest): TotpSetupResult {
    const secret = generateSecret(20, this.rng);
    const issuer = req.issuer ?? this.issuer;
    const qrCodeUrl = buildOtpAuthUri(secret, req.identifier, issuer);
    const backupCodes = generateBackupCodes(8, this.rng);
    const key = `${req.tenantId}:${req.identifier}`;
    this.totpRecords.set(key, {
      tenantId: req.tenantId,
      identifier: req.identifier,
      secret,
      backupCodes,
    });
    this.audit.log({
      verificationId: "-",
      tenantId: req.tenantId,
      identifierHash: hashIdentifier(this.hashSecret, req.identifier),
      action: "totp_setup",
      result: "success",
      channel: "totp",
      timestamp: this.now(),
    });
    return { secret, qrCodeUrl, backupCodes };
  }

  checkTotp(tenantId: string, identifier: string, code: string): boolean {
    const key = `${tenantId}:${identifier}`;
    const record = this.totpRecords.get(key);
    if (!record) {
      return false;
    }
    const ts = Math.floor(this.now() / 1000);
    if (verifyTotp(record.secret, code, ts, { window: 1 })) {
      return true;
    }
    // Backup code path.
    const idx = record.backupCodes.indexOf(code);
    if (idx >= 0) {
      record.backupCodes.splice(idx, 1);
      return true;
    }
    return false;
  }

  createMagicLink(req: MagicLinkRequest, baseUrl: string): MagicLinkCreateResult {
    const idHash = hashIdentifier(this.hashSecret, req.identifier);
    const tenantOk = this.tenantLimiter.allow(`tenant:${req.tenantId}`);
    if (!tenantOk.allowed) {
      throw new VerifyError("rate_limited", "tenant rate limit exceeded");
    }
    const idOk = this.identifierLimiter.allow(`id:${req.tenantId}:${idHash}`);
    if (!idOk.allowed) {
      throw new VerifyError("rate_limited", "identifier rate limit exceeded");
    }

    const linkId = generateUuid(this.rng);
    const token = urlSafeToken(32, this.rng);
    const ttl = (req.ttlSeconds ?? this.defaultTtl) * 1000;
    const t = this.now();
    const record: MagicLink = {
      linkId,
      tenantId: req.tenantId,
      identifierHash: idHash,
      tokenHash: hashCode(this.hashSecret, token),
      redirectUrl: req.redirectUrl,
      consumed: false,
      createdAt: t,
      expiresAt: t + ttl,
    };
    this.magicLinks.set(linkId, record);

    this.audit.log({
      verificationId: linkId,
      tenantId: req.tenantId,
      identifierHash: idHash,
      action: "magic_link_create",
      result: "success",
      channel: "magic_link",
      ...(req.requesterId ? { requesterId: req.requesterId } : {}),
      timestamp: this.now(),
    });

    const trimmed = baseUrl.replace(/\/+$/u, "");
    const url = `${trimmed}/v1/magic-links/${linkId}?token=${token}`;
    return { linkId, url, expiresAt: record.expiresAt };
  }

  consumeMagicLink(linkId: string, token: string): MagicLinkConsumeResult {
    const record = this.magicLinks.get(linkId);
    if (!record) {
      return { ok: false, reason: "not_found" };
    }
    if (record.consumed) {
      this.audit.log({
        verificationId: linkId,
        tenantId: record.tenantId,
        identifierHash: record.identifierHash,
        action: "magic_link_consume",
        result: "rejected",
        channel: "magic_link",
        timestamp: this.now(),
      });
      return { ok: false, reason: "already_consumed" };
    }
    if (this.now() >= record.expiresAt) {
      this.audit.log({
        verificationId: linkId,
        tenantId: record.tenantId,
        identifierHash: record.identifierHash,
        action: "magic_link_consume",
        result: "failure",
        channel: "magic_link",
        timestamp: this.now(),
      });
      return { ok: false, reason: "expired" };
    }
    const candidateHash = hashCode(this.hashSecret, token);
    if (!constantTimeEqualsHex(record.tokenHash, candidateHash)) {
      this.audit.log({
        verificationId: linkId,
        tenantId: record.tenantId,
        identifierHash: record.identifierHash,
        action: "magic_link_consume",
        result: "rejected",
        channel: "magic_link",
        timestamp: this.now(),
      });
      return { ok: false, reason: "invalid_token" };
    }
    record.consumed = true;
    this.audit.log({
      verificationId: linkId,
      tenantId: record.tenantId,
      identifierHash: record.identifierHash,
      action: "magic_link_consume",
      result: "success",
      channel: "magic_link",
      timestamp: this.now(),
    });
    return { ok: true, redirectUrl: record.redirectUrl };
  }

  /** Test/introspection helpers. */
  getVerification(id: string): Verification | undefined {
    return this.verifications.get(id);
  }
  getAudit(): AuditSink {
    return this.audit;
  }
}

export class VerifyError extends Error {
  constructor(
    public readonly code:
      | "rate_limited"
      | "fraud_blocked"
      | "invalid_channel"
      | "no_dispatcher"
      | "not_found"
      | "invalid_state",
    message: string,
  ) {
    super(message);
    this.name = "VerifyError";
  }
}
