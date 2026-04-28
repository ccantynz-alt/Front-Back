import { z } from "zod";

export const AttachmentSchema = z.object({
  filename: z.string().min(1),
  contentBase64: z.string(),
  contentType: z.string().min(1),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const SendMessageInputSchema = z.object({
  from: z.string().email(),
  to: z.array(z.string().email()).min(1).max(1000),
  cc: z.array(z.string().email()).max(1000).optional(),
  bcc: z.array(z.string().email()).max(1000).optional(),
  subject: z.string().min(1).max(998),
  html: z.string().optional(),
  text: z.string().optional(),
  attachments: z.array(AttachmentSchema).max(50).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  scheduledAt: z.string().datetime().optional(),
  tenantId: z.string().min(1),
  priority: z.enum(["low", "normal", "high"]).optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export type MessageStatus =
  | "queued"
  | "scheduled"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "dropped"
  | "suppressed";

export type EventType =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "dropped"
  | "opened"
  | "clicked"
  | "suppressed";

export interface DeliveryEvent {
  id: string;
  messageId: string;
  type: EventType;
  recipient?: string;
  detail?: string;
  smtpCode?: number;
  occurredAt: string;
}

export interface StoredMessage {
  id: string;
  tenantId: string;
  input: SendMessageInput;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  scheduledAt?: string;
  events: DeliveryEvent[];
}

export interface WebhookConfig {
  tenantId: string;
  url: string;
  secret: string;
  events: EventType[];
}

export type Priority = "low" | "normal" | "high";
