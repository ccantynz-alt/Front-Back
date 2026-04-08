import type { JSX } from "solid-js";
import { Stack, Text, Card } from "@back-to-the-future/ui";
import { SEOHead } from "../../components/SEOHead";

export default function DMCAPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="DMCA Copyright Policy"
        description="DMCA Copyright Policy for the Crontech platform. How to file a takedown notice, counter-notification procedures, repeat infringer policy, and designated agent information."
        path="/legal/dmca"
      />
      <Stack direction="vertical" gap="lg" class="page-padded legal-page">
        <Stack direction="vertical" gap="sm">
          <Text variant="h1" weight="bold">
            DMCA Copyright Policy
          </Text>
          <Text variant="caption" class="text-muted">
            Last Updated: April 8, 2026
          </Text>
        </Stack>

        {/* Introduction */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="body">
              Crontech respects the intellectual property rights of others and
              expects all users of the Crontech platform, including all
              websites, APIs, AI features, collaboration tools, and related
              services (collectively, the "Service"), to do the same. In
              accordance with the Digital Millennium Copyright Act of 1998
              ("DMCA"), codified at 17 U.S.C. Section 512, Crontech will
              respond expeditiously to claims of copyright infringement
              committed using the Service that are reported to our designated
              copyright agent identified below. This DMCA Copyright Policy
              ("Policy") is incorporated by reference into the Crontech Terms
              of Service.
            </Text>
          </Stack>
        </Card>

        {/* Section 1: Commitment to Intellectual Property */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              1. Commitment to Intellectual Property Protection
            </Text>
            <Text variant="body">
              Crontech is committed to protecting the rights of copyright
              holders and to complying fully with the DMCA. We maintain
              policies and procedures to ensure that claims of copyright
              infringement are addressed promptly and fairly. We encourage
              copyright holders who believe their works have been infringed
              through the Service to contact us using the procedures described
              below.
            </Text>
            <Text variant="body">
              Crontech takes copyright infringement seriously. We will
              investigate all valid notices of claimed infringement and take
              appropriate action, including removing or disabling access to
              material that is claimed to be infringing or that is the subject
              of infringing activity.
            </Text>
          </Stack>
        </Card>

        {/* Section 2: Filing a Takedown Notice */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              2. Filing a DMCA Takedown Notice
            </Text>
            <Text variant="body">
              If you are a copyright owner or an agent authorized to act on
              behalf of a copyright owner, and you believe that content
              available through the Service infringes one or more of your
              copyrights, you may submit a written notification of claimed
              infringement pursuant to 17 U.S.C. Section 512(c)(3) by
              providing our designated copyright agent with the following
              information:
            </Text>
            <Text variant="body">
              2.1. Identification of the Copyrighted Work. A description of
              the copyrighted work that you claim has been infringed,
              including the registration number (if any) from the U.S.
              Copyright Office. If multiple copyrighted works at a single
              online site are covered by a single notification, a
              representative list of such works at that site.
            </Text>
            <Text variant="body">
              2.2. Identification of the Infringing Material. Identification
              of the material that you claim is infringing and that you
              request be removed or access to which be disabled, together with
              information reasonably sufficient to permit Crontech to locate
              the material on the Service. Please provide the specific URL(s)
              or other identifying information for each item of content that
              you claim to be infringing.
            </Text>
            <Text variant="body">
              2.3. Contact Information. Information reasonably sufficient to
              permit Crontech to contact you, including your full legal name,
              mailing address, telephone number, and email address.
            </Text>
            <Text variant="body">
              2.4. Good Faith Statement. A statement that you have a good
              faith belief that use of the material identified in Section 2.2
              in the manner complained of is not authorized by the copyright
              owner, its agent, or the law.
            </Text>
            <Text variant="body">
              2.5. Accuracy Statement Under Penalty of Perjury. A statement
              that the information in the notification is accurate and, under
              penalty of perjury, that you are the copyright owner or are
              authorized to act on behalf of the owner of an exclusive right
              that is allegedly infringed. Please be advised that under 17
              U.S.C. Section 512(f), any person who knowingly materially
              misrepresents that material or activity is infringing may be
              subject to liability for damages, including costs and attorneys'
              fees.
            </Text>
            <Text variant="body">
              2.6. Signature. A physical or electronic signature of the
              copyright owner or a person authorized to act on behalf of the
              copyright owner. For purposes of this Policy, a typed full legal
              name or a scanned handwritten signature satisfies this
              requirement.
            </Text>
            <Text variant="body">
              Failure to include all of the above information may result in a
              delay in processing your notice or may render it insufficient
              under the DMCA. Crontech will not act on incomplete or deficient
              notices.
            </Text>
          </Stack>
        </Card>

        {/* Section 3: Processing of Takedown Notices */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              3. Processing of Takedown Notices
            </Text>
            <Text variant="body">
              3.1. Upon receipt of a valid and complete DMCA takedown notice
              that satisfies the requirements of Section 2, Crontech will act
              expeditiously to remove or disable access to the allegedly
              infringing material.
            </Text>
            <Text variant="body">
              3.2. Crontech will promptly notify the user who posted or
              uploaded the allegedly infringing material (the "Alleged
              Infringer") that the material has been removed or that access to
              it has been disabled. The notification will include a copy of the
              takedown notice (with the reporting party's personal contact
              information redacted to the extent required by applicable law)
              and information about the counter-notification process described
              in Section 4 below.
            </Text>
            <Text variant="body">
              3.3. In appropriate circumstances, Crontech may forward the
              takedown notice to the Alleged Infringer without redaction if
              required by law or necessary to facilitate resolution of the
              dispute.
            </Text>
          </Stack>
        </Card>

        {/* Section 4: Counter-Notification Process */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              4. Counter-Notification Process
            </Text>
            <Text variant="body">
              If you believe that material you posted on or through the
              Service was removed or access to it was disabled by mistake or
              misidentification, you may file a counter-notification with our
              designated copyright agent pursuant to 17 U.S.C. Section
              512(g)(3). Your counter-notification must include the following:
            </Text>
            <Text variant="body">
              4.1. Identification of Removed Material. Identification of the
              material that has been removed or to which access has been
              disabled, together with the location at which the material
              appeared before it was removed or access was disabled (including
              the specific URL(s) where the material was located on the
              Service).
            </Text>
            <Text variant="body">
              4.2. Good Faith Statement Under Penalty of Perjury. A statement,
              under penalty of perjury, that you have a good faith belief that
              the material was removed or disabled as a result of mistake or
              misidentification of the material to be removed or disabled.
            </Text>
            <Text variant="body">
              4.3. Contact Information. Your full legal name, mailing address,
              and telephone number.
            </Text>
            <Text variant="body">
              4.4. Consent to Jurisdiction. A statement that you consent to
              the jurisdiction of the Federal District Court for the judicial
              district in which your address is located (or, if your address
              is outside the United States, for any judicial district in which
              Crontech may be found), and that you will accept service of
              process from the person who provided the original takedown
              notification or an agent of such person.
            </Text>
            <Text variant="body">
              4.5. Signature. Your physical or electronic signature. For
              purposes of this Policy, a typed full legal name or a scanned
              handwritten signature satisfies this requirement.
            </Text>
            <Text variant="body">
              Upon receipt of a valid counter-notification that satisfies the
              requirements above, Crontech will promptly forward a copy of
              the counter-notification to the original complaining party. If
              the original complaining party does not file a court action
              seeking a restraining order against the user who submitted the
              counter-notification within ten (10) business days of receiving
              the counter-notification, Crontech will restore the removed
              material or re-enable access to it within ten (10) to fourteen
              (14) business days after receipt of the counter-notification,
              unless Crontech first receives notice that the complaining party
              has filed a court action.
            </Text>
          </Stack>
        </Card>

        {/* Section 5: Repeat Infringer Policy */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              5. Repeat Infringer Policy
            </Text>
            <Text variant="body">
              5.1. In accordance with the DMCA and other applicable law,
              Crontech has adopted a policy of terminating, in appropriate
              circumstances and at Crontech's sole discretion, the accounts
              of users who are deemed to be repeat infringers.
            </Text>
            <Text variant="body">
              5.2. Crontech may also, at its sole discretion, limit access to
              the Service or terminate the accounts of any users who infringe
              the intellectual property rights of others, whether or not there
              is any repeat infringement. A user may be deemed a repeat
              infringer if they have been the subject of more than one valid
              takedown notice that was not successfully countered through the
              counter-notification process described in Section 4.
            </Text>
            <Text variant="body">
              5.3. Crontech reserves the right to determine, in its sole
              discretion, what constitutes "appropriate circumstances" and
              what constitutes a "repeat infringer" for purposes of this
              Policy. Crontech is not obligated to disclose the specific
              criteria used to make these determinations.
            </Text>
          </Stack>
        </Card>

        {/* Section 6: AI-Generated Content Notice */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              6. AI-Generated Content and Copyright
            </Text>
            <Text variant="body">
              6.1. The Service includes AI-powered features that may generate
              text, code, images, video, or other content. AI-generated
              content may inadvertently resemble or incorporate elements of
              copyrighted works. Users are solely responsible for reviewing
              all AI-generated content and ensuring that it does not infringe
              any third-party copyright before publishing, distributing, or
              otherwise using such content.
            </Text>
            <Text variant="body">
              6.2. If you believe that AI-generated content available through
              the Service infringes your copyright, you may submit a DMCA
              takedown notice following the procedures described in Section 2.
              Crontech will process such notices in the same manner as any
              other claim of infringement.
            </Text>
            <Text variant="body">
              6.3. Crontech does not guarantee that AI-generated content is
              free from copyright infringement. The use of AI features does
              not relieve users of their obligation to comply with copyright
              law.
            </Text>
          </Stack>
        </Card>

        {/* Section 7: Designated Copyright Agent */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              7. Designated Copyright Agent
            </Text>
            <Text variant="body">
              All DMCA takedown notices, counter-notifications, and
              copyright-related correspondence should be sent to Crontech's
              designated copyright agent at:
            </Text>
            <Text variant="body">
              Email: dmca@crontech.dev
            </Text>
            <Text variant="body">
              Please include "DMCA Takedown Notice" or "DMCA
              Counter-Notification" in the subject line of your email to
              ensure prompt routing and processing.
            </Text>
            <Text variant="body">
              Crontech's designated agent is registered with the U.S.
              Copyright Office in accordance with 17 U.S.C. Section 512(c)(2).
            </Text>
          </Stack>
        </Card>

        {/* Section 8: Safe Harbor */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              8. Safe Harbor Statement
            </Text>
            <Text variant="body">
              Crontech qualifies as a "service provider" under 17 U.S.C.
              Section 512 and claims the protections afforded by the safe
              harbor provisions of the DMCA. Crontech does not monitor,
              screen, or editorially control user-uploaded content prior to
              its posting on the Service, and Crontech does not have actual
              knowledge of, or awareness of facts or circumstances from which
              it would be apparent that, specific material on the Service is
              infringing, except as identified through the DMCA notice
              procedures described in this Policy.
            </Text>
            <Text variant="body">
              Upon obtaining knowledge or awareness of infringing material
              through a valid DMCA notice, Crontech acts expeditiously to
              remove or disable access to the material in accordance with
              this Policy and the DMCA. Crontech does not receive a financial
              benefit directly attributable to infringing activity in
              circumstances where it has the right and ability to control such
              activity.
            </Text>
          </Stack>
        </Card>

        {/* Section 9: Misrepresentation Warning */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              9. Misrepresentation Warning
            </Text>
            <Text variant="body">
              Under 17 U.S.C. Section 512(f), any person who knowingly
              materially misrepresents that material or activity is infringing
              -- or that material or activity was removed or disabled by
              mistake or misidentification -- may be subject to liability for
              damages, including costs and attorneys' fees incurred by the
              alleged infringer, any copyright owner or copyright owner's
              authorized licensee, or the service provider, who is injured by
              such misrepresentation as the result of Crontech relying upon
              such misrepresentation in removing or disabling access to the
              material or activity claimed to be infringing.
            </Text>
            <Text variant="body">
              Please consider this warning before submitting a takedown notice
              or counter-notification. If you are unsure whether content
              infringes your copyright or whether material was removed by
              mistake, you should consult with a qualified attorney before
              filing a notice.
            </Text>
          </Stack>
        </Card>

        {/* Section 10: Modifications */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              10. Modifications to This Policy
            </Text>
            <Text variant="body">
              Crontech reserves the right to modify this DMCA Copyright
              Policy at any time. Changes will be effective upon posting to
              this page. Your continued use of the Service after any
              modification constitutes acceptance of the updated Policy. We
              encourage you to review this Policy periodically for any
              changes.
            </Text>
          </Stack>
        </Card>

        {/* Section 11: Contact */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              11. Contact Information
            </Text>
            <Text variant="body">
              For questions about this DMCA Copyright Policy that are not
              related to a specific takedown notice or counter-notification,
              please contact us at:
            </Text>
            <Text variant="body">
              Email: dmca@crontech.dev
            </Text>
            <Text variant="body">
              We will acknowledge receipt of all DMCA notices and
              counter-notifications within two (2) business days.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
