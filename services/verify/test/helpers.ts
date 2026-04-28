import {
  type ChannelDispatcher,
  DispatcherRegistry,
} from "../src/dispatchers.js";
import type { Channel } from "../src/types.js";

export interface CapturedDispatch {
  tenantId: string;
  identifier: string;
  channel: Channel;
  code: string;
}

export class CapturingDispatcher implements ChannelDispatcher {
  readonly captured: CapturedDispatch[] = [];
  constructor(public readonly channel: Channel) {}
  async dispatch(req: {
    tenantId: string;
    identifier: string;
    channel: Channel;
    code: string;
  }): Promise<{ ok: boolean; channel: Channel; providerMessageId: string }> {
    this.captured.push({
      tenantId: req.tenantId,
      identifier: req.identifier,
      channel: req.channel,
      code: req.code,
    });
    return { ok: true, channel: req.channel, providerMessageId: `cap-${this.captured.length}` };
  }
}

export function buildRegistry(channels: Channel[]): {
  reg: DispatcherRegistry;
  caps: Map<Channel, CapturingDispatcher>;
} {
  const reg = new DispatcherRegistry();
  const caps = new Map<Channel, CapturingDispatcher>();
  for (const c of channels) {
    const d = new CapturingDispatcher(c);
    reg.register(d);
    caps.set(c, d);
  }
  return { reg, caps };
}
