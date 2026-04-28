/**
 * HTTP server for the email-domain service.
 *
 * Routes:
 *   POST   /domains                         add a domain
 *   GET    /domains/:id                     fetch a domain
 *   POST   /domains/:id/verify              run DNS verification
 *   POST   /domains/:id/rotate-dkim         issue a fresh DKIM key
 *   POST   /sign                            return a DKIM-Signature header
 *   POST   /dmarc-reports                   ingest an aggregate report
 *
 * The transport is intentionally raw `Request` / `Response` so this module
 * runs unchanged on Bun, Cloudflare Workers, and Node 22+.
 */

import { z } from "zod";
import { signDkim } from "./crypto/dkim.ts";
import { parseDmarcReport } from "./dmarc-reports.ts";
import type { DmarcReport } from "./types.ts";
import { DomainRegistry } from "./registry.ts";

const AddDomainBody = z.object({
	tenantId: z.string().min(1),
	domain: z.string().min(3),
	spfMechanisms: z.array(z.string()).optional(),
	dmarcPolicy: z.enum(["none", "quarantine", "reject"]).optional(),
	dmarcRua: z.string().optional(),
});

const SignBody = z.object({
	tenantId: z.string().min(1),
	domainId: z.string().min(1),
	headers: z.record(z.string(), z.string()),
	body: z.string(),
	signedHeaders: z.array(z.string()).optional(),
});

export interface ServerDeps {
	readonly registry: DomainRegistry;
	/** Bucket of received DMARC reports, keyed by tenantId. */
	readonly dmarcStore?: Map<string, DmarcReport[]>;
}

export function createServer(deps: ServerDeps): (req: Request) => Promise<Response> {
	const dmarcStore = deps.dmarcStore ?? new Map<string, DmarcReport[]>();

	return async (req) => {
		const url = new URL(req.url);
		const { method } = req;

		try {
			if (method === "POST" && url.pathname === "/domains") {
				const json = await req.json();
				const parsed = AddDomainBody.safeParse(json);
				if (!parsed.success) return jsonResp(400, { error: parsed.error.issues });
				const addArgs = {
					tenantId: parsed.data.tenantId,
					domain: parsed.data.domain,
					...(parsed.data.spfMechanisms !== undefined
						? { spfMechanisms: parsed.data.spfMechanisms }
						: {}),
					...(parsed.data.dmarcPolicy !== undefined ? { dmarcPolicy: parsed.data.dmarcPolicy } : {}),
					...(parsed.data.dmarcRua !== undefined ? { dmarcRua: parsed.data.dmarcRua } : {}),
				};
				const result = await deps.registry.addDomain(addArgs);
				return jsonResp(201, {
					domain: serialiseDomain(result.domain),
					dnsRecords: result.dnsRecords,
				});
			}

			const domainMatch = url.pathname.match(/^\/domains\/([^/]+)(?:\/(verify|rotate-dkim))?$/);
			if (domainMatch) {
				const id = domainMatch[1];
				const action = domainMatch[2];
				if (!id) return jsonResp(404, { error: "domain id required" });
				if (method === "GET" && !action) {
					const d = deps.registry.get(id);
					if (!d) return jsonResp(404, { error: "domain not found" });
					return jsonResp(200, { domain: serialiseDomain(d) });
				}
				if (method === "POST" && action === "verify") {
					const result = await deps.registry.verify(id);
					return jsonResp(200, result);
				}
				if (method === "POST" && action === "rotate-dkim") {
					try {
						const result = await deps.registry.rotateDkim(id);
						return jsonResp(200, {
							domain: serialiseDomain(result.domain),
							dnsRecord: result.dnsRecord,
						});
					} catch (err) {
						return jsonResp(404, { error: (err as Error).message });
					}
				}
			}

			if (method === "POST" && url.pathname === "/sign") {
				const json = await req.json();
				const parsed = SignBody.safeParse(json);
				if (!parsed.success) return jsonResp(400, { error: parsed.error.issues });
				const domain = deps.registry.get(parsed.data.domainId);
				if (!domain) return jsonResp(404, { error: "domain not found" });
				if (domain.tenantId !== parsed.data.tenantId) {
					return jsonResp(403, { error: "tenant mismatch" });
				}
				const privateKeyPem = deps.registry.loadActivePrivateKey({
					domainId: parsed.data.domainId,
					tenantId: parsed.data.tenantId,
				});
				const signArgs: Parameters<typeof signDkim>[0] = {
					domain: domain.domain,
					selector: domain.dkimActive.selector,
					privateKeyPem,
					headers: parsed.data.headers,
					body: parsed.data.body,
				};
				if (parsed.data.signedHeaders) {
					Object.assign(signArgs, { signedHeaders: parsed.data.signedHeaders });
				}
				const dkimSignature = signDkim(signArgs);
				return jsonResp(200, { dkimSignature });
			}

			if (method === "POST" && url.pathname === "/dmarc-reports") {
				const tenantId = url.searchParams.get("tenantId");
				if (!tenantId) return jsonResp(400, { error: "tenantId query param required" });
				const buf = Buffer.from(await req.arrayBuffer());
				const report = parseDmarcReport(buf);
				const list = dmarcStore.get(tenantId) ?? [];
				list.push(report);
				dmarcStore.set(tenantId, list);
				return jsonResp(202, { received: true, records: report.records.length });
			}

			if (method === "GET" && url.pathname === "/dmarc-reports") {
				const tenantId = url.searchParams.get("tenantId");
				if (!tenantId) return jsonResp(400, { error: "tenantId query param required" });
				return jsonResp(200, { reports: dmarcStore.get(tenantId) ?? [] });
			}

			if (method === "GET" && url.pathname === "/health") {
				return jsonResp(200, { ok: true });
			}

			return jsonResp(404, { error: "not found" });
		} catch (err) {
			return jsonResp(500, { error: (err as Error).message });
		}
	};
}

function jsonResp(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function serialiseDomain(d: ReturnType<DomainRegistry["get"]> & object) {
	return {
		domainId: d.domainId,
		tenantId: d.tenantId,
		domain: d.domain,
		status: d.status,
		spfRecord: d.spfRecord,
		dmarcRecord: d.dmarcRecord,
		dkim: {
			activeSelector: d.dkimActive.selector,
			activePublicKey: d.dkimActive.publicKeyPem,
			retiredSelectors: d.dkimRetired.map((k) => k.selector),
		},
		verifiedAt: d.verifiedAt ?? null,
		createdAt: d.createdAt,
	};
}

/* Allow `bun run src/server.ts` to start a real listener. */
declare global {
	// biome-ignore lint/suspicious/noRedeclare: ambient declaration
	var Bun: { serve(opts: { port: number; fetch: (req: Request) => Promise<Response> }): unknown } | undefined;
}

if (typeof Bun !== "undefined" && import.meta.main) {
	const { loadMasterKek } = await import("./crypto/kek.ts");
	const { SystemDnsResolver } = await import("./dns/resolver.ts");
	const registry = new DomainRegistry({
		kek: loadMasterKek(),
		resolver: new SystemDnsResolver(),
	});
	const handler = createServer({ registry });
	Bun.serve({ port: Number(process.env["PORT"] ?? 8081), fetch: handler });
	// eslint-disable-next-line no-console
	console.log("[email-domain] listening on", process.env["PORT"] ?? 8081);
}
