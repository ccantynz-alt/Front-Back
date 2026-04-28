import type { BrandRecord, CampaignRecord, PhoneNumberRecord } from "../types.ts";

export interface RegisterBrandInput {
  brandId: string;
  tenantId: string;
  legalName: string;
  ein: string;
  vertical: string;
}

export interface RegisterCampaignInput {
  campaignId: string;
  brandId: string;
  tenantId: string;
  useCase: string;
  sampleMessages: string[];
}

/**
 * A2P 10DLC compliance registry. In the US, long-code SMS (standard
 * 10-digit numbers) MUST be sent through a registered brand + campaign
 * pair or carriers will silently filter the messages. We model the same
 * gates here — every long-code send is rejected unless its number has
 * been linked to an approved campaign.
 */
export class A2pRegistry {
  private readonly brands = new Map<string, BrandRecord>();
  private readonly campaigns = new Map<string, CampaignRecord>();

  registerBrand(input: RegisterBrandInput): BrandRecord {
    if (this.brands.has(input.brandId)) {
      throw new Error(`Duplicate brandId: ${input.brandId}`);
    }
    if (input.ein.trim().length === 0) {
      throw new Error("EIN is required for A2P brand registration");
    }
    const record: BrandRecord = {
      brandId: input.brandId,
      tenantId: input.tenantId,
      legalName: input.legalName,
      ein: input.ein,
      vertical: input.vertical,
      registeredAt: Date.now(),
    };
    this.brands.set(record.brandId, record);
    return { ...record };
  }

  approveCampaign(input: RegisterCampaignInput): CampaignRecord {
    const brand = this.brands.get(input.brandId);
    if (!brand) {
      throw new Error(`Unknown brandId: ${input.brandId}`);
    }
    if (brand.tenantId !== input.tenantId) {
      throw new Error("Brand and campaign tenants must match");
    }
    if (input.sampleMessages.length === 0) {
      throw new Error("At least one sample message is required");
    }
    const record: CampaignRecord = {
      campaignId: input.campaignId,
      brandId: input.brandId,
      tenantId: input.tenantId,
      useCase: input.useCase,
      sampleMessages: [...input.sampleMessages],
      approvedAt: Date.now(),
    };
    this.campaigns.set(record.campaignId, record);
    return { ...record };
  }

  getBrand(brandId: string): BrandRecord | undefined {
    const b = this.brands.get(brandId);
    return b ? { ...b } : undefined;
  }

  getCampaign(campaignId: string): CampaignRecord | undefined {
    const c = this.campaigns.get(campaignId);
    return c ? { ...c, sampleMessages: [...c.sampleMessages] } : undefined;
  }

  /**
   * Enforce A2P 10DLC compliance for an outbound SMS. Returns null when
   * the send is allowed; returns an error string when it must be
   * rejected. Short-codes and toll-free numbers bypass the gate (they
   * have their own carrier-level approval flows).
   */
  enforceForSend(number: PhoneNumberRecord): string | null {
    if (number.type !== "long-code") return null;
    if (!number.a2pBrandId || !number.a2pCampaignId) {
      return `A2P 10DLC not configured for long-code number ${number.e164}`;
    }
    const brand = this.brands.get(number.a2pBrandId);
    if (!brand) {
      return `A2P brand ${number.a2pBrandId} not found`;
    }
    const campaign = this.campaigns.get(number.a2pCampaignId);
    if (!campaign) {
      return `A2P campaign ${number.a2pCampaignId} not found`;
    }
    if (campaign.brandId !== number.a2pBrandId) {
      return "A2P campaign does not belong to attached brand";
    }
    if (campaign.tenantId !== number.tenantId) {
      return "A2P campaign tenant does not match number tenant";
    }
    return null;
  }
}
