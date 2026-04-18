import type { JSX } from "solid-js";
import { Stack, Text, Card } from "@back-to-the-future/ui";
import { SEOHead } from "../../components/SEOHead";

export default function SLAPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Service Level Agreement"
        description="Crontech's uptime commitments, service credits, support response times, and maintenance windows. Transparent SLA for Pro, Team, and Enterprise tiers."
        path="/legal/sla"
      />
      <Stack direction="vertical" gap="lg" class="page-padded legal-page">
        {/* Header */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h1" weight="bold">Service Level Agreement</Text>
          <Text variant="caption" class="text-muted">
            Last updated: April 8, 2026 | Effective: May 8, 2026
          </Text>
          <Text variant="body" class="text-muted">
            This Service Level Agreement ("SLA") describes the uptime commitments, service credit
            policies, support response times, and maintenance practices for the Crontech platform
            (the "Service"). This SLA is incorporated by reference into the Crontech Terms of Service
            and applies to all paid subscription tiers. By subscribing to a paid plan, you agree to
            the terms of this SLA.
          </Text>
        </Stack>

        {/* Section 1: Scope & Applicability */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">1. Scope and Applicability</Text>
            <Text variant="body">
              This SLA applies to the following subscription tiers with the following commitments:
            </Text>
            <Stack direction="vertical" gap="xs" class="pl-4">
              <Text variant="body">
                <Text weight="semibold" as="span">Pro Tier:</Text> Covered by this SLA with 99.9%
                monthly uptime commitment. Includes standard support response times and service
                credit eligibility as described below.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">Team Tier:</Text> Covered by this SLA with 99.9%
                monthly uptime commitment. Includes enhanced support response times and service
                credit eligibility as described below.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">Enterprise Tier:</Text> Covered by this SLA with
                99.99% monthly uptime commitment. Includes priority support response times, service
                credit eligibility, and a dedicated account manager. Enterprise customers may
                negotiate custom SLA terms.
              </Text>
            </Stack>
            <Text variant="body">
              <Text weight="semibold" as="span">Free Tier:</Text> The Free tier is provided on a
              best-effort basis. No uptime commitment, service credits, or guaranteed support response
              times apply to the Free tier. We will make commercially reasonable efforts to maintain
              availability, but the Free tier is explicitly excluded from all SLA guarantees. Free
              tier users are not eligible for service credits under any circumstances.
            </Text>
          </Stack>
        </Card>

        {/* Section 2: Uptime Commitment */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">2. Uptime Commitment</Text>
            <Text variant="body">
              Crontech commits to the following monthly uptime percentages for the Service:
            </Text>
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left border-collapse">
                <thead>
                  <tr class="border-b border-[var(--color-border)]">
                    <th class="py-2 pr-4 font-semibold text-[var(--color-text)]">Tier</th>
                    <th class="py-2 pr-4 font-semibold text-[var(--color-text)]">Monthly Uptime</th>
                    <th class="py-2 pr-4 font-semibold text-[var(--color-text)]">Max Monthly Downtime</th>
                  </tr>
                </thead>
                <tbody class="text-[var(--color-text-muted)]">
                  <tr class="border-b border-[var(--color-bg-subtle)]">
                    <td class="py-2 pr-4">Pro</td>
                    <td class="py-2 pr-4">99.9%</td>
                    <td class="py-2 pr-4">43 minutes 49 seconds</td>
                  </tr>
                  <tr class="border-b border-[var(--color-bg-subtle)]">
                    <td class="py-2 pr-4">Team</td>
                    <td class="py-2 pr-4">99.9%</td>
                    <td class="py-2 pr-4">43 minutes 49 seconds</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4">Enterprise</td>
                    <td class="py-2 pr-4">99.99%</td>
                    <td class="py-2 pr-4">4 minutes 23 seconds</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Text variant="body">
              "Uptime" means the Service is accessible and materially functional for its intended
              purpose. Uptime is measured on a calendar month basis, beginning at 00:00:00 UTC on the
              first day of the month and ending at 23:59:59 UTC on the last day of the month.
            </Text>
          </Stack>
        </Card>

        {/* Section 3: Uptime Calculation */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">3. Uptime Calculation</Text>
            <Text variant="body">
              Monthly Uptime Percentage is calculated using the following formula:
            </Text>
            <div class="bg-[var(--color-bg-subtle)] rounded-lg p-4 font-mono text-sm text-[var(--color-text-secondary)]">
              <Text variant="body" class="font-mono">
                Monthly Uptime % = ((Total Minutes in Month - Downtime Minutes) / Total Minutes in Month) x 100
              </Text>
            </div>
            <Text variant="body">
              <Text weight="semibold" as="span">"Downtime"</Text> is defined as any period of five
              (5) or more consecutive minutes during which the Service is materially unavailable, as
              determined by our monitoring systems. Intermittent errors lasting less than five
              consecutive minutes are not counted as Downtime.
            </Text>
            <Text variant="body">
              <Text weight="semibold" as="span">"Downtime Minutes"</Text> are the total number of
              minutes of Downtime in a calendar month, excluding any minutes attributable to
              Exclusions defined in Section 4.
            </Text>
          </Stack>
        </Card>

        {/* Section 4: Exclusions */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">4. Exclusions</Text>
            <Text variant="body">
              The following events are excluded from Downtime calculations and do not count against
              the uptime commitment:
            </Text>
            <Stack direction="vertical" gap="xs" class="pl-4">
              <Text variant="body">
                <Text weight="semibold" as="span">4.1 Scheduled Maintenance.</Text> Planned
                maintenance windows for which at least 48 hours' advance notice has been provided via
                the Service's status page and email notification. See Section 9 for our maintenance
                window policy.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">4.2 Force Majeure.</Text> Events beyond our
                reasonable control, including but not limited to: natural disasters, acts of
                government, war, terrorism, pandemics, widespread internet outages, power grid
                failures, or acts of God.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">4.3 Customer-Side Issues.</Text> Issues caused by
                the customer's internet connectivity, hardware, software, or network infrastructure.
                This includes local ISP outages, misconfigured DNS, browser incompatibilities, and
                client-side firewall or proxy interference.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">4.4 Third-Party Services.</Text> Outages or
                degraded performance of third-party services that the Service integrates with but does
                not control, including but not limited to: payment processors (Stripe), third-party
                AI model providers (OpenAI, Anthropic), authentication providers (Google OAuth), and
                external APIs. We will make commercially reasonable efforts to minimize the impact of
                third-party outages.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">4.5 API Abuse or Excessive Usage.</Text> Service
                degradation caused by the customer's use of the Service in violation of our Terms of
                Service, Acceptable Use Policy, or documented rate limits. This includes but is not
                limited to: API abuse, automated scraping without authorization, denial-of-service
                attacks originating from the customer's infrastructure, and usage that materially
                exceeds contracted limits.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">4.6 Emergency Maintenance.</Text> Unplanned
                maintenance required to address critical security vulnerabilities or imminent threats
                to data integrity. We will provide as much advance notice as reasonably practicable
                and will make every effort to minimize the duration and impact.
              </Text>
            </Stack>
          </Stack>
        </Card>

        {/* Section 5: Service Credits */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">5. Service Credits</Text>
            <Text variant="body">
              If the Service fails to meet the uptime commitment for a given calendar month, affected
              customers are eligible for service credits as described below. Service credits are the
              sole and exclusive remedy for any failure to meet the uptime commitment.
            </Text>
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left border-collapse">
                <thead>
                  <tr class="border-b border-[var(--color-border)]">
                    <th class="py-2 pr-4 font-semibold text-[var(--color-text)]">Monthly Uptime %</th>
                    <th class="py-2 pr-4 font-semibold text-[var(--color-text)]">Service Credit</th>
                  </tr>
                </thead>
                <tbody class="text-[var(--color-text-muted)]">
                  <tr class="border-b border-[var(--color-bg-subtle)]">
                    <td class="py-2 pr-4">99.0% to &lt; 99.9% (or &lt; 99.99% for Enterprise)</td>
                    <td class="py-2 pr-4">10% of monthly subscription fee</td>
                  </tr>
                  <tr class="border-b border-[var(--color-bg-subtle)]">
                    <td class="py-2 pr-4">95.0% to &lt; 99.0%</td>
                    <td class="py-2 pr-4">25% of monthly subscription fee</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4">Below 95.0%</td>
                    <td class="py-2 pr-4">50% of monthly subscription fee</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Text variant="body" weight="semibold">Service credit terms:</Text>
            <Stack direction="vertical" gap="xs" class="pl-4">
              <Text variant="body">
                Service credits are applied as a credit against the next billing cycle. Credits are
                not refundable as cash and cannot be transferred to another account.
              </Text>
              <Text variant="body">
                The maximum aggregate service credit for any single calendar month shall not exceed
                50% of the monthly subscription fee for that month.
              </Text>
              <Text variant="body">
                Service credits are calculated based on the subscription fee for the month in which
                the Downtime occurred, not future months.
              </Text>
              <Text variant="body">
                Customers who are in arrears or in breach of the Terms of Service at the time of the
                Downtime event are not eligible for service credits.
              </Text>
            </Stack>
          </Stack>
        </Card>

        {/* Section 6: Claiming Service Credits */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">6. Claiming Service Credits</Text>
            <Text variant="body">
              To claim a service credit, you must submit a request that meets the following
              requirements:
            </Text>
            <Stack direction="vertical" gap="xs" class="pl-4">
              <Text variant="body">
                <Text weight="semibold" as="span">6.1 Timing.</Text> Credit requests must be
                submitted within thirty (30) calendar days of the end of the month in which the
                Downtime occurred. Requests submitted after this period will not be eligible for
                credits.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">6.2 Submission Method.</Text> Send credit requests
                via email to sla@crontech.dev with the subject line "SLA Credit Request — [Month
                Year]".
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">6.3 Required Information.</Text> Each request must
                include: (a) your account identifier or registered email address; (b) the dates and
                times (in UTC) of the Downtime incidents; (c) a brief description of the impact on
                your use of the Service; and (d) any supporting evidence such as screenshots, error
                logs, or status page references.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">6.4 Review Period.</Text> We will review and
                respond to credit requests within fifteen (15) business days. If the credit is
                approved, it will be applied to the next billing cycle. If denied, we will provide a
                written explanation.
              </Text>
            </Stack>
          </Stack>
        </Card>

        {/* Section 7: Monitoring */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">7. Monitoring and Measurement</Text>
            <Text variant="body">
              Crontech uses internal monitoring systems to measure Service availability and
              performance. Our monitoring infrastructure includes synthetic health checks from multiple
              geographic regions, real-time alerting, and automated incident detection.
            </Text>
            <Text variant="body">
              <Text weight="semibold" as="span">Our measurement is authoritative.</Text> In the event
              of a dispute regarding Downtime, our internal monitoring data is the authoritative source
              of truth for determining whether the uptime commitment was met. We publish real-time
              status and incident history on our public status page at status.crontech.dev.
            </Text>
            <Text variant="body">
              Customers may use their own monitoring tools for independent verification. If there is a
              material discrepancy between our monitoring data and the customer's monitoring data, we
              will investigate in good faith and provide an explanation. However, our internal
              monitoring data remains the definitive measurement for SLA purposes.
            </Text>
          </Stack>
        </Card>

        {/* Section 8: Support Response Times */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">8. Support Response Times</Text>
            <Text variant="body">
              Support response times are measured from the time a support request is received to the
              time a human support agent sends an initial substantive response (automated
              acknowledgments do not count). Response times apply during business hours (Monday through
              Friday, 09:00-18:00 UTC) unless otherwise noted.
            </Text>
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left border-collapse">
                <thead>
                  <tr class="border-b border-[var(--color-border)]">
                    <th class="py-2 pr-4 font-semibold text-[var(--color-text)]">Severity</th>
                    <th class="py-2 pr-4 font-semibold text-[var(--color-text)]">Enterprise</th>
                    <th class="py-2 pr-4 font-semibold text-[var(--color-text)]">Team</th>
                    <th class="py-2 font-semibold text-[var(--color-text)]">Pro</th>
                  </tr>
                </thead>
                <tbody class="text-[var(--color-text-muted)]">
                  <tr class="border-b border-[var(--color-bg-subtle)]">
                    <td class="py-2 pr-4 font-semibold text-[var(--color-text-secondary)]">Critical</td>
                    <td class="py-2 pr-4">1 hour (24/7)</td>
                    <td class="py-2 pr-4">4 hours</td>
                    <td class="py-2">24 hours</td>
                  </tr>
                  <tr class="border-b border-[var(--color-bg-subtle)]">
                    <td class="py-2 pr-4 font-semibold text-[var(--color-text-secondary)]">High</td>
                    <td class="py-2 pr-4">4 hours</td>
                    <td class="py-2 pr-4">8 hours</td>
                    <td class="py-2">48 hours</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4 font-semibold text-[var(--color-text-secondary)]">Medium</td>
                    <td class="py-2 pr-4">24 hours</td>
                    <td class="py-2 pr-4">48 hours</td>
                    <td class="py-2">5 business days</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Text variant="body" weight="semibold">Severity definitions:</Text>
            <Stack direction="vertical" gap="xs" class="pl-4">
              <Text variant="body">
                <Text weight="semibold" as="span">Critical:</Text> The Service is completely
                unavailable or a core function is non-operational, affecting all or substantially all
                users on the account. No workaround exists. Examples: complete platform outage,
                authentication system failure, data loss or corruption.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">High:</Text> A major feature is significantly
                impaired but the Service is still partially operational. A workaround may exist but
                is not sustainable. Examples: AI features unavailable, real-time collaboration
                degraded, intermittent errors on critical workflows.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">Medium:</Text> A non-critical feature is impaired
                or a minor issue affects a limited number of users. A reasonable workaround exists.
                Examples: UI rendering issues, non-critical integrations failing, performance
                degradation for specific operations.
              </Text>
            </Stack>
            <Text variant="body">
              Enterprise tier Critical severity support operates 24 hours a day, 7 days a week,
              including holidays. All other severity levels and tiers operate during business hours.
            </Text>
          </Stack>
        </Card>

        {/* Section 9: Scheduled Maintenance */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">9. Scheduled Maintenance</Text>
            <Text variant="body">
              Scheduled maintenance is performed during our preferred maintenance window:
            </Text>
            <div class="bg-[var(--color-bg-subtle)] rounded-lg p-4">
              <Text variant="body" weight="semibold" class="text-[var(--color-text)]">
                Preferred Window: Sundays, 02:00 - 06:00 UTC
              </Text>
            </div>
            <Stack direction="vertical" gap="xs" class="pl-4">
              <Text variant="body">
                <Text weight="semibold" as="span">Advance Notice:</Text> We will provide at least 48
                hours' advance notice of all scheduled maintenance via: (a) the public status page at
                status.crontech.dev; (b) in-app notification banner; and (c) email to account
                administrators. Enterprise customers will receive additional direct notification from
                their account manager.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">Duration:</Text> We will make commercially
                reasonable efforts to keep scheduled maintenance windows as short as possible and to
                complete maintenance within the preferred window. If maintenance is expected to exceed
                the standard window, extended advance notice will be provided.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">Frequency:</Text> Routine scheduled maintenance is
                typically performed no more than twice per month. We leverage our edge-first
                architecture and rolling deployment strategy to minimize the need for full-platform
                maintenance windows.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">Zero-Downtime Deployments:</Text> Most updates are
                deployed via rolling edge deployments with zero downtime. Scheduled maintenance is
                reserved for changes that require coordinated downtime across infrastructure
                components (database migrations, infrastructure provider upgrades, etc.).
              </Text>
            </Stack>
          </Stack>
        </Card>

        {/* Section 10: Incident Communication */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">10. Incident Communication</Text>
            <Text variant="body">
              During an unplanned outage or service degradation, we commit to the following
              communication cadence:
            </Text>
            <Stack direction="vertical" gap="xs" class="pl-4">
              <Text variant="body">
                <Text weight="semibold" as="span">Initial Acknowledgment:</Text> Within 15 minutes
                of detecting an incident, we will post an update to the public status page confirming
                that we are aware of the issue and are investigating.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">Regular Updates:</Text> During an active incident,
                status updates will be posted at least every 30 minutes until the incident is
                resolved.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">Resolution Notification:</Text> When the incident
                is resolved, a final update will be posted confirming resolution and summarizing the
                impact.
              </Text>
              <Text variant="body">
                <Text weight="semibold" as="span">Post-Incident Report:</Text> For incidents that
                result in material Downtime, a post-incident report (PIR) will be published within
                five (5) business days. The PIR will include: root cause analysis, timeline of
                events, impact assessment, and corrective actions taken to prevent recurrence.
              </Text>
            </Stack>
          </Stack>
        </Card>

        {/* Section 11: SLA Limitations */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">11. Limitations</Text>
            <Text variant="body">
              This SLA does not apply to: (a) features explicitly designated as "Alpha," "Beta," or
              "Preview"; (b) free tier accounts; (c) services accessed through unsupported browsers or
              clients; or (d) any period during which the customer's account is suspended for
              non-payment or policy violations.
            </Text>
            <Text variant="body">
              Service credits constitute the sole and exclusive remedy for any failure to meet the
              uptime commitment described in this SLA. This SLA does not modify, amend, or supplement
              any other limitation of liability provisions in the Terms of Service.
            </Text>
            <Text variant="body">
              Crontech reserves the right to modify this SLA with at least 30 days' written notice.
              Material changes that reduce uptime commitments or service credit percentages will not
              apply retroactively and will take effect only at the start of the next billing cycle
              following the notice period.
            </Text>
          </Stack>
        </Card>

        {/* Section 12: Contact */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">12. Contact</Text>
            <Text variant="body">
              For SLA-related inquiries, service credit requests, or to report an outage:
            </Text>
            <Stack direction="vertical" gap="xs" class="pl-4">
              <Text variant="body">
                Email: sla@crontech.dev
              </Text>
              <Text variant="body">
                Status Page: status.crontech.dev
              </Text>
              <Text variant="body">
                Enterprise customers: Contact your dedicated account manager directly or use the
                priority support channel provided during onboarding.
              </Text>
            </Stack>
          </Stack>
        </Card>

        {/* Section 13: Additional Protections - DRAFT */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              13. Additional Protections (DRAFT &mdash; requires attorney review)
            </Text>
            <Text variant="body">
              DRAFT &mdash; requires attorney review. Nothing in this SLA waives,
              diminishes, or otherwise limits any protection, disclaimer,
              limitation of liability, indemnification, class-action waiver,
              binding-arbitration clause, AS-IS / AS-AVAILABLE disclaimer,
              no-consequential-damages exclusion, governing-law choice,
              export-controls clause, 18+ age requirement, or 30-day notice
              provision set forth in the Terms of Service.
            </Text>
            <Text variant="body">
              Service credits as described in this SLA are the sole and
              exclusive remedy for any failure to meet the uptime commitment.
              Crontech's total aggregate liability remains capped per the
              Terms of Service at the greater of (a) fees paid in the twelve
              (12) months preceding the claim or (b) one hundred U.S. dollars
              ($100), subject to the lower $50 cap during any beta or early
              access phase per the Beta Disclaimer.
            </Text>
            <Text variant="body">
              No Consequential Damages. Crontech is not liable for lost
              profits, lost revenue, lost data, lost goodwill, business
              interruption, or any indirect, incidental, special,
              consequential, exemplary, or punitive damages arising from
              Downtime, service degradation, or any SLA dispute, even if
              advised of the possibility.
            </Text>
            <Text variant="body">
              AS-IS / AS-AVAILABLE. The Service, including uptime monitoring,
              service credit calculations, and incident communications, is
              provided AS-IS and AS-AVAILABLE without warranties of any kind.
            </Text>
            <Text variant="body">
              AI Output Disclaimer. AI features that participate in the
              Service are informational only and are not a substitute for
              professional advice. You are responsible for independent
              verification. Downtime of AI features is excluded from uptime
              calculations to the extent caused by third-party AI model
              provider outages (see Section 4.4).
            </Text>
            <Text variant="body">
              Customer Indemnification. You agree to indemnify Crontech for
              any claim arising from your use of the Service, your content,
              your code, your configurations, your integrations, and any
              service-credit claim submitted in bad faith.
            </Text>
            <Text variant="body">
              Unilateral Suspension and Termination. Crontech reserves the
              right to suspend or terminate the Service or your account,
              unilaterally, for any reason, with notice where reasonably
              practicable. SLA obligations do not survive suspension or
              termination for cause.
            </Text>
            <Text variant="body">
              Reverse Engineering Prohibited. You may not reverse engineer
              the Service's monitoring, uptime-measurement, or
              incident-communication infrastructure, except where such
              prohibition is unenforceable under applicable law.
            </Text>
            <Text variant="body">
              Force Majeure. Force majeure events (as defined in Section 4.2
              above and in the Terms of Service) are excluded from Downtime
              and from Crontech's liability.
            </Text>
            <Text variant="body">
              Binding Individual Arbitration and Class-Action Waiver.
              Disputes relating to this SLA, including disputes over whether
              a service credit is owed, are subject to the binding
              individual arbitration clause and class-action waiver in the
              Terms of Service, including the 30-day opt-out and
              small-claims carve-out. We intend these disputes to be heard
              by AAA or JAMS.
            </Text>
            <Text variant="body">
              Governing Law: New Zealand. We intend that this SLA be
              governed by the laws of New Zealand, subject to mandatory
              local law and to the US-facing carve-outs advised by counsel.
            </Text>
            <Text variant="body">
              Export Controls / US Sanctions. You represent that you are
              not located in, and will not access the Service from, any
              jurisdiction under comprehensive US economic sanctions, and
              that you are not on any US government restricted-party list.
            </Text>
            <Text variant="body">
              Age Requirement: 18+. You must be at least eighteen (18)
              years of age to subscribe to a paid plan covered by this SLA.
            </Text>
            <Text variant="body">
              30-Day Notice for Terms Changes. Reaffirming Section 11: we
              intend to provide at least 30 days' notice for any material
              change to this SLA.
            </Text>
            <Text variant="body">
              Severability and Entire Agreement. If any provision of this
              SLA is unenforceable, the remainder remains in full force.
              This SLA, together with the Terms of Service and incorporated
              policies, constitutes the entire agreement with respect to
              uptime commitments and service credits.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
