import {
  type Collector,
  type CollectorResult,
  type IntelligenceItem,
  TRACKED_NPM_PACKAGES,
} from "./types";
import { fetchWithRetry } from "../utils/fetch";

const lastSeenVersions = new Map<string, string>();

async function checkPackage(name: string): Promise<IntelligenceItem | null> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
  const response = await fetchWithRetry(url, {
    headers: { "User-Agent": "MarcoReid-Sentinel/1.0" },
  });

  if (!response.ok) return null;

  const data = await response.json() as { version: string; description?: string };
  const lastVersion = lastSeenVersions.get(name);

  if (lastVersion === data.version) return null;
  lastSeenVersions.set(name, data.version);

  if (!lastVersion) return null; // First run, just record

  const isMajor = data.version.startsWith(lastVersion.split(".")[0] ?? "") === false;

  return {
    id: `npm-${name}-${data.version}`,
    source: "npm-registry",
    title: `${name}@${data.version} published`,
    description: data.description ?? `New version of ${name}`,
    url: `https://www.npmjs.com/package/${name}`,
    severity: isMajor ? "high" : "medium",
    tags: [name, "npm", "release"],
    metadata: { package: name, version: data.version, previousVersion: lastVersion },
    collectedAt: new Date().toISOString(),
  };
}

export const npmRegistryCollector: Collector = {
  name: "npm-registry",
  cronExpression: "0 * * * *",
  intervalMs: 60 * 60 * 1000,

  async collect(): Promise<CollectorResult> {
    const start = performance.now();
    const items: IntelligenceItem[] = [];
    const errors: string[] = [];

    for (const pkg of TRACKED_NPM_PACKAGES) {
      try {
        const item = await checkPackage(pkg);
        if (item) items.push(item);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Error checking ${pkg}`);
      }
    }

    return {
      source: "npm-registry",
      items,
      collectedAt: new Date().toISOString(),
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      durationMs: Math.round(performance.now() - start),
    };
  },
};
