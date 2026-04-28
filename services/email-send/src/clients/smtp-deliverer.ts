export interface DeliveryAttempt {
  recipient: string;
  raw: string;
  mx: string;
}

export interface DeliveryResult {
  recipient: string;
  ok: boolean;
  /** SMTP response code we want the pipeline to react to. */
  smtpCode: number;
  message: string;
}

export interface SmtpDeliverer {
  deliver(attempt: DeliveryAttempt): Promise<DeliveryResult>;
}

/**
 * Test deliverer driven by a static script keyed by recipient.
 * The pipeline contract: 2xx → delivered, 4xx → retry, 5xx → hard-bounce.
 */
export class ScriptedSmtpDeliverer implements SmtpDeliverer {
  constructor(
    private readonly script: Record<string, { smtpCode: number; message?: string }>,
    private readonly defaults: { smtpCode: number; message: string } = {
      smtpCode: 250,
      message: "OK",
    },
  ) {}

  async deliver(attempt: DeliveryAttempt): Promise<DeliveryResult> {
    const entry = this.script[attempt.recipient.toLowerCase()] ?? this.defaults;
    const ok = entry.smtpCode >= 200 && entry.smtpCode < 300;
    return {
      recipient: attempt.recipient,
      ok,
      smtpCode: entry.smtpCode,
      message: entry.message ?? (ok ? "OK" : `code-${entry.smtpCode}`),
    };
  }
}
