export type DomainType = "custom" | "subdomain";

/** A domain is a subdomain if it has 3+ labels (e.g. app.example.com). */
export function classifyDomain(domain: string): DomainType {
  const labels = domain.split(".").filter((l) => l.length > 0);
  return labels.length >= 3 ? "subdomain" : "custom";
}
