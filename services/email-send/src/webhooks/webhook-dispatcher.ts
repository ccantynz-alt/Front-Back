import type { FetchLike } from "../clients/domain-client.ts";
import type { DeliveryEvent, WebhookConfig } from "../types.ts";

/**
 * HMAC-SHA256-signed webhook delivery. Customer-configured per tenant.
 */
export class WebhookDispatcher {
  private readonly configs = new Map<string, WebhookConfig>();

  constructor(private readonly fetcher: FetchLike = fetch) {}

  configure(config: WebhookConfig): void {
    this.configs.set(config.tenantId, config);
  }

  remove(tenantId: string): void {
    this.configs.delete(tenantId);
  }

  get(tenantId: string): WebhookConfig | undefined {
    return this.configs.get(tenantId);
  }

  async dispatch(tenantId: string, event: DeliveryEvent): Promise<boolean> {
    const cfg = this.configs.get(tenantId);
    if (!cfg) return false;
    if (!cfg.events.includes(event.type)) return false;

    const body = JSON.stringify({ tenantId, event });
    const signature = await this.sign(cfg.secret, body);

    try {
      const res = await this.fetcher(cfg.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-crontech-signature": signature,
          "x-crontech-event": event.type,
        },
        body,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async sign(secret: string, payload: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const bytes = new Uint8Array(sig);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return `sha256=${hex}`;
  }
}
