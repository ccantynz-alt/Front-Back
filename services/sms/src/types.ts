/**
 * SMS service domain types.
 *
 * These describe the public surface that the REST API, the carrier
 * adapters, and the storage layer all share. Anything that crosses a
 * boundary is mirrored as a Zod schema in the modules that consume it.
 */

export type MessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed";

export type NumberType = "long-code" | "short-code" | "toll-free";

export interface NumberCapabilities {
  sms: boolean;
  mms: boolean;
  voice: boolean;
}

export interface PhoneNumberRecord {
  numberId: string;
  tenantId: string;
  e164: string;
  capabilities: NumberCapabilities;
  carrier: string;
  type: NumberType;
  /** A2P 10DLC brand id — required for long-code SMS in the US. */
  a2pBrandId?: string;
  /** A2P 10DLC campaign id — required for long-code SMS in the US. */
  a2pCampaignId?: string;
}

export interface BrandRecord {
  brandId: string;
  tenantId: string;
  legalName: string;
  ein: string;
  vertical: string;
  registeredAt: number;
}

export interface CampaignRecord {
  campaignId: string;
  brandId: string;
  tenantId: string;
  useCase: string;
  sampleMessages: string[];
  approvedAt: number;
}

export interface DeliveryEvent {
  ts: number;
  status: MessageStatus;
  detail?: string;
  carrierCode?: string;
}

export interface MessageRecord {
  messageId: string;
  tenantId: string;
  from: string;
  to: string;
  body: string;
  mediaUrls: string[];
  status: MessageStatus;
  carrier: string;
  createdAt: number;
  updatedAt: number;
  events: DeliveryEvent[];
  statusWebhook?: string;
  carrierMessageId?: string;
}

export interface SendRequest {
  from: string;
  to: string;
  body: string;
  mediaUrls?: string[];
  tenantId: string;
  statusWebhook?: string;
}

export interface InboundMessage {
  carrierMessageId: string;
  from: string;
  to: string;
  body: string;
  mediaUrls: string[];
  receivedAt: number;
}

export interface CarrierSendInput {
  from: string;
  to: string;
  body: string;
  mediaUrls: string[];
}

export interface CarrierSendResult {
  carrierMessageId: string;
  /** The status the carrier reports immediately on accept. */
  acceptedStatus: MessageStatus;
}

/**
 * The pluggable carrier interface. Real implementations (Twilio,
 * MessageBird, Bandwidth) live behind this contract; tests use a
 * deterministic in-memory mock so the pipeline is exercised end-to-end
 * without network calls.
 */
export interface Carrier {
  readonly name: string;
  send(input: CarrierSendInput): Promise<CarrierSendResult>;
  /**
   * Validate an inbound webhook signature. Carriers each have a
   * different scheme (HMAC-SHA256, HMAC-SHA1, etc.); the contract here
   * only requires that an invalid signature returns false.
   */
  verifyInboundSignature(rawBody: string, signature: string): boolean;
  /** Parse a carrier-specific inbound webhook payload into our shape. */
  parseInbound(rawBody: string): InboundMessage;
}
