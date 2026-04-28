import { describe, expect, it } from "bun:test";
import { A2pRegistry } from "../a2p/a2p-registry.ts";
import { NumberRegistry } from "./number-registry.ts";

describe("NumberRegistry", () => {
  it("registers numbers and looks them up by E.164 / id", () => {
    const reg = new NumberRegistry();
    const n = reg.register({
      numberId: "n1",
      tenantId: "t1",
      e164: "+15551110000",
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    expect(n.numberId).toBe("n1");
    expect(reg.getByE164("+15551110000")?.tenantId).toBe("t1");
    expect(reg.getById("n1")?.e164).toBe("+15551110000");
  });

  it("rejects duplicate registrations", () => {
    const reg = new NumberRegistry();
    reg.register({
      numberId: "n1",
      tenantId: "t1",
      e164: "+15551110000",
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    expect(() =>
      reg.register({
        numberId: "n2",
        tenantId: "t1",
        e164: "+15551110000",
        capabilities: { sms: true, mms: false, voice: false },
        carrier: "twilio",
        type: "long-code",
      }),
    ).toThrow();
  });

  it("attaches A2P only on long-code numbers", () => {
    const reg = new NumberRegistry();
    reg.register({
      numberId: "tf",
      tenantId: "t1",
      e164: "+18885550100",
      capabilities: { sms: true, mms: true, voice: true },
      carrier: "bandwidth",
      type: "toll-free",
    });
    expect(() => reg.attachA2p("tf", "b1", "c1")).toThrow();
  });

  it("lists numbers per tenant", () => {
    const reg = new NumberRegistry();
    reg.register({
      numberId: "n1",
      tenantId: "t1",
      e164: "+15551110000",
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    reg.register({
      numberId: "n2",
      tenantId: "t2",
      e164: "+15551110001",
      capabilities: { sms: true, mms: false, voice: false },
      carrier: "twilio",
      type: "long-code",
    });
    expect(reg.list("t1").length).toBe(1);
    expect(reg.list("t2").length).toBe(1);
  });
});

describe("A2pRegistry", () => {
  it("requires EIN to register a brand", () => {
    const reg = new A2pRegistry();
    expect(() =>
      reg.registerBrand({
        brandId: "b",
        tenantId: "t",
        legalName: "X",
        ein: "",
        vertical: "T",
      }),
    ).toThrow();
  });

  it("approves a campaign tied to a brand", () => {
    const reg = new A2pRegistry();
    reg.registerBrand({
      brandId: "b",
      tenantId: "t",
      legalName: "X",
      ein: "11-1111111",
      vertical: "T",
    });
    const c = reg.approveCampaign({
      campaignId: "c",
      brandId: "b",
      tenantId: "t",
      useCase: "MARKETING",
      sampleMessages: ["hi"],
    });
    expect(c.campaignId).toBe("c");
  });

  it("rejects campaigns missing sample messages", () => {
    const reg = new A2pRegistry();
    reg.registerBrand({
      brandId: "b",
      tenantId: "t",
      legalName: "X",
      ein: "11-1111111",
      vertical: "T",
    });
    expect(() =>
      reg.approveCampaign({
        campaignId: "c",
        brandId: "b",
        tenantId: "t",
        useCase: "MARKETING",
        sampleMessages: [],
      }),
    ).toThrow();
  });
});
