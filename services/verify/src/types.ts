import { z } from "zod";

export const channelSchema = z.enum([
  "sms",
  "voice",
  "email",
  "push",
  "totp",
  "magic_link",
]);

export type Channel = z.infer<typeof channelSchema>;

export const verificationStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
  "locked",
]);

export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const createVerificationRequestSchema = z.object({
  tenantId: z.string().min(1),
  identifier: z.string().min(1),
  channel: channelSchema,
  locale: z.string().optional(),
  customCode: z.string().regex(/^\d{4,10}$/).optional(),
  ttlSeconds: z.number().int().min(30).max(86400).optional(),
  codeLength: z.number().int().min(4).max(10).optional(),
  requesterId: z.string().optional(),
});

export type CreateVerificationRequest = z.infer<
  typeof createVerificationRequestSchema
>;

export const checkVerificationRequestSchema = z.object({
  code: z.string().min(1),
  requesterId: z.string().optional(),
});

export type CheckVerificationRequest = z.infer<
  typeof checkVerificationRequestSchema
>;

export const totpSecretRequestSchema = z.object({
  tenantId: z.string().min(1),
  identifier: z.string().min(1),
  issuer: z.string().optional(),
});

export type TotpSecretRequest = z.infer<typeof totpSecretRequestSchema>;

export const magicLinkRequestSchema = z.object({
  tenantId: z.string().min(1),
  identifier: z.string().min(1),
  redirectUrl: z.string().url(),
  ttlSeconds: z.number().int().min(60).max(86400).optional(),
  requesterId: z.string().optional(),
});

export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

export interface Verification {
  verificationId: string;
  tenantId: string;
  identifierHash: string;
  channel: Channel;
  codeHash: string;
  status: VerificationStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  expiresAt: number;
}

export interface MagicLink {
  linkId: string;
  tenantId: string;
  identifierHash: string;
  tokenHash: string;
  redirectUrl: string;
  consumed: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface TotpRecord {
  tenantId: string;
  identifier: string;
  secret: string;
  backupCodes: string[];
}

export interface AuditEntry {
  verificationId: string;
  tenantId: string;
  identifierHash: string;
  action:
    | "create"
    | "check"
    | "resend"
    | "totp_setup"
    | "magic_link_create"
    | "magic_link_consume";
  result: "success" | "failure" | "rejected" | "rate_limited" | "locked";
  channel?: Channel;
  requesterId?: string;
  timestamp: number;
}
