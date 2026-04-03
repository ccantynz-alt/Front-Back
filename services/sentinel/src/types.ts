/** A GitHub release detected by the collector. */
export interface Release {
  repo: string;
  tag: string;
  name: string;
  publishedAt: string;
  url: string;
}

/** An npm package version detected by the collector. */
export interface PackageVersion {
  name: string;
  version: string;
  publishedAt: string;
}

/** Severity tiers for Slack alerts. */
export type AlertSeverity = "critical" | "info" | "weekly";

/** Payload for a Slack webhook message. */
export interface SlackMessage {
  channel: string;
  text: string;
  severity: AlertSeverity;
}

/** Configuration for the sentinel scheduler. */
export interface SentinelConfig {
  /** Interval in milliseconds between GitHub release checks. */
  githubIntervalMs: number;
  /** Interval in milliseconds between npm version checks. */
  npmIntervalMs: number;
  /** Slack webhook URL (optional — alerts are skipped when absent). */
  slackWebhookUrl?: string | undefined;
}
