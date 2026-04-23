// ── /docs/getting-started/custom-domain — article 4 of the series ───
//
// Fourth article. Walks through wiring a custom domain to a deployed
// project. Honest about what the DNS + SSL flow looks like today:
// dashboard-driven (CLI not shipped), Cloudflare-backed SSL
// auto-provisioning, CNAME vs apex-record guidance.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
  ScreenshotSlot,
} from "../../../components/docs/DocsArticle";

export default function CustomDomainArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Wire a custom domain"
        description="Point your own domain at a Crontech project. DNS records, automatic SSL provisioning, www vs apex, and how to cut over with zero downtime."
        path="/docs/getting-started/custom-domain"
      />

      <DocsArticle
        eyebrow="Getting Started"
        title="Wire a custom domain"
        subtitle="The *.crontech.app preview URL is great for shipping, but eventually you want your project to answer on a domain you own. Here's the full DNS and SSL flow."
        readTime="4 min"
        updated="April 2026"
        nextStep={{
          label: "Pick a plan and manage billing",
          href: "/docs/getting-started/billing",
          description:
            "Tour the plans, the Stripe portal, and what's live vs pending on the billing surface today.",
        }}
      >
        <p>
          Custom domains on Crontech get automatic SSL certificates, HTTP/3,
          and the same Anycast routing as the default{" "}
          <code>*.crontech.app</code> URL. You point DNS at us, we handle
          everything downstream of the record.
        </p>

        <h2>Step 1 — Add the domain to the project</h2>
        <p>
          Open the project's <a href="/domains">Domains</a> page and
          click <strong>Add domain</strong>. Type the hostname you want
          to wire — for example <code>app.your-domain.com</code> — and
          hit submit.
        </p>

        <ScreenshotSlot caption="Domains page with the Add domain modal open and a hostname field ready to accept input." />

        <p>
          The dashboard validates that the hostname is a well-formed
          domain you can actually own (public TLD, not reserved, not
          already claimed by another Crontech account) and then shows
          you the DNS record you need to create.
        </p>

        <Callout tone="info">
          Crontech supports apex domains (<code>your-domain.com</code>),
          subdomains (<code>app.your-domain.com</code>), and wildcards
          (<code>*.your-domain.com</code> — on Pro and above). Wildcards
          give you per-tenant subdomains without re-adding each one.
        </Callout>

        <h2>Step 2 — Create the DNS record</h2>
        <p>
          The exact record depends on whether you're wiring a subdomain
          or an apex domain. The dashboard shows you the right one; the
          table below covers both cases.
        </p>

        <KeyList
          items={[
            {
              term: "Subdomain (app.your-domain.com)",
              description:
                "Add a CNAME record with value cname.crontech.app. TTL 300 seconds or whatever your registrar's minimum is.",
            },
            {
              term: "Apex domain (your-domain.com)",
              description:
                "CNAME flattening (Cloudflare, Route53) or an ALIAS / ANAME record is preferred. If your DNS provider doesn't support either, the dashboard also surfaces a set of A records you can use instead.",
            },
            {
              term: "Wildcard (*.your-domain.com)",
              description:
                "Same CNAME target as a regular subdomain — cname.crontech.app — with the hostname set to *.your-domain.com. Pro plan and above.",
            },
          ]}
        />

        <Callout tone="note">
          If your DNS is on Cloudflare you can turn on the{" "}
          <em>proxy</em> toggle if you want — Crontech will tunnel
          traffic through your Cloudflare zone transparently. If the
          record is grey-cloud (DNS only) it still works; you just lose
          Cloudflare's edge features in favour of ours.
        </Callout>

        <h2>Step 3 — Wait for propagation</h2>
        <p>
          The domains page polls DNS for the new record every few
          seconds. Once the record is visible from the Crontech edge —
          usually within a minute on a low TTL — the domain row flips
          from <strong>Pending DNS</strong> to{" "}
          <strong>Verifying</strong>.
        </p>

        <Steps>
          <li>
            Leave the dashboard open. The row updates in place as each
            check passes; you don't need to refresh.
          </li>
          <li>
            If the DNS check stays pending for more than 10 minutes,
            click <strong>Recheck now</strong>. This bypasses the poll
            cadence and forces an immediate lookup.
          </li>
          <li>
            If a lookup is failing, the error column names the exact
            reason — wrong target, TTL too high, NXDOMAIN — so you can
            fix it at the registrar.
          </li>
        </Steps>

        <h2>Step 4 — SSL provisioning (automatic)</h2>
        <p>
          As soon as the DNS record verifies, we kick off an ACME
          challenge against the domain. No action needed from you. The
          certificate is issued by Let's Encrypt via our edge, stored
          encrypted at rest, and rotated automatically 30 days before
          expiry for as long as the domain is connected.
        </p>

        <KeyList
          items={[
            {
              term: "TLS 1.3 + HTTP/3",
              description:
                "Every Crontech-issued certificate serves TLS 1.3 with modern ciphers and supports HTTP/3 (QUIC) out of the box.",
            },
            {
              term: "HSTS on by default",
              description:
                "We emit a Strict-Transport-Security header with a 1-year max-age and the includeSubDomains directive. Preload is opt-in from the domain settings.",
            },
            {
              term: "Automatic renewal",
              description:
                "Certificates renew 30 days before expiry. If the renewal fails (e.g. the DNS record has been removed) the domains page surfaces a red banner weeks before it would ever impact production traffic.",
            },
          ]}
        />

        <Callout tone="warn">
          If you're migrating a live domain from another host, plan the
          DNS cutover for a low-traffic window. The SSL provisioning
          step needs the record to point at Crontech before we can
          complete the challenge — during that window, requests will
          hit Crontech and may 404 until the project's deployment is
          live. Deploy first, then cut DNS.
        </Callout>

        <h2>Setting the primary domain</h2>
        <p>
          A project can have as many domains as it wants. Pick one as
          the <strong>primary</strong> from the domains page and every
          other connected domain 301-redirects to it. That's how you
          collapse <code>www.your-domain.com</code> into{" "}
          <code>your-domain.com</code> (or vice versa) without writing
          any redirect code.
        </p>

        <h2>Removing a domain</h2>
        <p>
          Click <strong>Remove</strong> on any connected domain. The
          connection is severed immediately, the certificate is
          revoked, and traffic to that hostname stops resolving to
          Crontech. Your DNS record stays where it is — you can repoint
          it to another host whenever you like.
        </p>

        <h2>Your project is on your domain.</h2>
        <p>
          That's the full DNS and SSL flow. The last article in the
          series covers billing: picking a plan, the Stripe portal, and
          an honest look at what's live vs still landing on the pricing
          side.
        </p>
      </DocsArticle>
    </>
  );
}
