import type { NumberCapabilities, NumberType, PhoneNumberRecord } from "../types.ts";

export interface RegisterNumberInput {
  numberId: string;
  tenantId: string;
  e164: string;
  capabilities: NumberCapabilities;
  carrier: string;
  type: NumberType;
}

/**
 * In-memory phone-number registry. Tracks tenant ownership, carrier
 * attribution, and the A2P 10DLC linkage between a long-code number and
 * its registered campaign.
 */
export class NumberRegistry {
  private readonly byE164 = new Map<string, PhoneNumberRecord>();
  private readonly byId = new Map<string, PhoneNumberRecord>();

  register(input: RegisterNumberInput): PhoneNumberRecord {
    if (this.byE164.has(input.e164)) {
      throw new Error(`Number already registered: ${input.e164}`);
    }
    if (this.byId.has(input.numberId)) {
      throw new Error(`Duplicate numberId: ${input.numberId}`);
    }
    const record: PhoneNumberRecord = {
      numberId: input.numberId,
      tenantId: input.tenantId,
      e164: input.e164,
      capabilities: { ...input.capabilities },
      carrier: input.carrier,
      type: input.type,
    };
    this.byE164.set(record.e164, record);
    this.byId.set(record.numberId, record);
    return { ...record };
  }

  getByE164(e164: string): PhoneNumberRecord | undefined {
    const r = this.byE164.get(e164);
    return r ? { ...r } : undefined;
  }

  getById(numberId: string): PhoneNumberRecord | undefined {
    const r = this.byId.get(numberId);
    return r ? { ...r } : undefined;
  }

  attachA2p(numberId: string, brandId: string, campaignId: string): PhoneNumberRecord {
    const current = this.byId.get(numberId);
    if (!current) {
      throw new Error(`Unknown numberId: ${numberId}`);
    }
    if (current.type !== "long-code") {
      throw new Error(`A2P 10DLC only applies to long-code numbers (got ${current.type})`);
    }
    const next: PhoneNumberRecord = {
      ...current,
      a2pBrandId: brandId,
      a2pCampaignId: campaignId,
    };
    this.byId.set(numberId, next);
    this.byE164.set(next.e164, next);
    return { ...next };
  }

  list(tenantId: string): PhoneNumberRecord[] {
    const out: PhoneNumberRecord[] = [];
    for (const r of this.byId.values()) {
      if (r.tenantId === tenantId) out.push({ ...r });
    }
    return out;
  }
}
