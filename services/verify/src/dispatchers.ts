import type { Channel } from "./types.js";

export interface DispatchRequest {
  tenantId: string;
  identifier: string;
  channel: Channel;
  code: string;
  locale?: string;
}

export interface DispatchResult {
  ok: boolean;
  channel: Channel;
  providerMessageId?: string;
  error?: string;
}

export interface ChannelDispatcher {
  channel: Channel;
  dispatch(req: DispatchRequest): Promise<DispatchResult>;
}

/**
 * Mock SMS dispatcher — calls the (fictional) services/sms HTTP API.
 * We never import that package directly; communication is via HTTP fetch
 * to keep services decoupled.
 */
export class SmsDispatcher implements ChannelDispatcher {
  readonly channel: Channel = "sms";
  constructor(private readonly endpoint?: string) {}
  async dispatch(req: DispatchRequest): Promise<DispatchResult> {
    if (!this.endpoint) {
      return { ok: true, channel: "sms", providerMessageId: `mock-sms-${req.tenantId}` };
    }
    try {
      const res = await fetch(`${this.endpoint}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: req.tenantId,
          to: req.identifier,
          body: `Your verification code is ${req.code}`,
        }),
      });
      if (!res.ok) {
        return { ok: false, channel: "sms", error: `sms upstream ${res.status}` };
      }
      const j = (await res.json()) as { id?: string };
      return { ok: true, channel: "sms", ...(j.id ? { providerMessageId: j.id } : {}) };
    } catch (err) {
      return { ok: false, channel: "sms", error: (err as Error).message };
    }
  }
}

export class VoiceDispatcher implements ChannelDispatcher {
  readonly channel: Channel = "voice";
  constructor(private readonly endpoint?: string) {}
  async dispatch(req: DispatchRequest): Promise<DispatchResult> {
    if (!this.endpoint) {
      return { ok: true, channel: "voice", providerMessageId: `mock-voice-${req.tenantId}` };
    }
    try {
      const res = await fetch(`${this.endpoint}/v1/calls`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: req.tenantId,
          to: req.identifier,
          tts: `Your verification code is ${req.code.split("").join(", ")}`,
        }),
      });
      if (!res.ok) {
        return { ok: false, channel: "voice", error: `voice upstream ${res.status}` };
      }
      const j = (await res.json()) as { id?: string };
      return { ok: true, channel: "voice", ...(j.id ? { providerMessageId: j.id } : {}) };
    } catch (err) {
      return { ok: false, channel: "voice", error: (err as Error).message };
    }
  }
}

export class EmailDispatcher implements ChannelDispatcher {
  readonly channel: Channel = "email";
  constructor(private readonly endpoint?: string) {}
  async dispatch(req: DispatchRequest): Promise<DispatchResult> {
    if (!this.endpoint) {
      return { ok: true, channel: "email", providerMessageId: `mock-email-${req.tenantId}` };
    }
    try {
      const res = await fetch(`${this.endpoint}/v1/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: req.tenantId,
          to: req.identifier,
          subject: "Your verification code",
          text: `Your verification code is ${req.code}`,
        }),
      });
      if (!res.ok) {
        return { ok: false, channel: "email", error: `email upstream ${res.status}` };
      }
      const j = (await res.json()) as { id?: string };
      return { ok: true, channel: "email", ...(j.id ? { providerMessageId: j.id } : {}) };
    } catch (err) {
      return { ok: false, channel: "email", error: (err as Error).message };
    }
  }
}

export class PushDispatcher implements ChannelDispatcher {
  readonly channel: Channel = "push";
  // Push channel is mock-only for v1; we still accept the full request shape so
  // future implementations can wire SNS / FCM / APNs without breaking callers.
  async dispatch(req: DispatchRequest): Promise<DispatchResult> {
    return {
      ok: true,
      channel: "push",
      providerMessageId: `mock-push-${req.tenantId}-${req.identifier.length}`,
    };
  }
}

export class DispatcherRegistry {
  private readonly map = new Map<Channel, ChannelDispatcher>();

  register(d: ChannelDispatcher): void {
    this.map.set(d.channel, d);
  }

  get(channel: Channel): ChannelDispatcher | undefined {
    return this.map.get(channel);
  }
}

export function defaultDispatchers(env: {
  smsEndpoint?: string;
  voiceEndpoint?: string;
  emailEndpoint?: string;
}): DispatcherRegistry {
  const reg = new DispatcherRegistry();
  reg.register(new SmsDispatcher(env.smsEndpoint));
  reg.register(new VoiceDispatcher(env.voiceEndpoint));
  reg.register(new EmailDispatcher(env.emailEndpoint));
  reg.register(new PushDispatcher());
  return reg;
}
