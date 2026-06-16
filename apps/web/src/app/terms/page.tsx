import type { Metadata } from "next";
import { LegalShell } from "@/components/marketing/LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service — Azayon",
  description:
    "The terms that govern your use of Azayon, operated by Peskaya Limited (Kenya) — accounts, plans, payments, acceptable use, and your responsibilities.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="15 June 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Azayon
        (&ldquo;Azayon&rdquo;, the &ldquo;Service&rdquo;), operated by <strong>Peskaya Limited</strong>
        , a company registered in Kenya (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By
        creating an account or using the Service, you agree to these Terms. If you are agreeing on
        behalf of a business, you confirm you are authorised to bind that business.
      </p>
      <p>
        Please also read our <a href="/privacy">Privacy Policy</a>, which explains how we handle
        personal data and forms part of these Terms.
      </p>

      <h2 id="service">1. The Service</h2>
      <p>
        Azayon is a WhatsApp-based assistant that helps businesses reply to customers, capture and
        qualify leads, book appointments, send invoices, generate payment links, and run follow-ups.
        Features may change, improve, or be discontinued over time. We will give reasonable notice of
        material changes that reduce core functionality of a paid plan.
      </p>

      <h2 id="accounts">2. Accounts &amp; eligibility</h2>
      <p>
        You must be at least 18 and use Azayon for a lawful business purpose. You are responsible for
        the accuracy of the information you provide, for keeping your password secure, and for all
        activity that happens under your account. Tell us promptly at{" "}
        <a href="mailto:hello@azayon.com">hello@azayon.com</a> if you suspect unauthorised use.
      </p>

      <h2 id="responsibilities">3. Your responsibilities</h2>
      <p>
        Because Azayon sends and receives messages on your behalf, you are responsible for how it is
        used with your customers. In particular, you agree that:
      </p>
      <ul>
        <li>
          you have a lawful basis (such as consent or legitimate interest) to message the customers
          you communicate with, and you comply with the{" "}
          <strong>WhatsApp Business Messaging Policy</strong> and Meta&apos;s platform terms;
        </li>
        <li>
          the business details, prices, policies, and knowledge-base content you give Azayon are
          accurate and lawful, and you keep them up to date;
        </li>
        <li>
          you honour opt-out requests and do not use Azayon to send spam, unsolicited bulk messages,
          or content that is unlawful, misleading, or harmful;
        </li>
        <li>
          you are the data controller for your customers&apos; data, and you comply with the{" "}
          <strong>Kenya Data Protection Act, 2019</strong> and any other applicable law.
        </li>
      </ul>

      <h2 id="acceptable-use">4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use Azayon for any unlawful, fraudulent, or deceptive purpose;</li>
        <li>
          send messages promoting prohibited goods or services, or content that is hateful, abusive,
          or infringes others&apos; rights;
        </li>
        <li>
          attempt to disrupt, reverse engineer, scrape, or gain unauthorised access to the Service or
          its systems;
        </li>
        <li>resell or provide the Service to third parties except as expressly permitted; or</li>
        <li>use the Service in a way that could damage our reputation or that of WhatsApp/Meta.</li>
      </ul>
      <p>
        We may investigate suspected breaches and may suspend or limit accounts that put the Service,
        our other customers, or our platform relationships at risk.
      </p>

      <h2 id="plans">5. Plans, trials &amp; billing</h2>
      <p>
        New accounts include a <strong>14-day free trial</strong> of the full Service. After the
        trial, continued use requires an active paid subscription to one of our plans (Starter,
        Growth, or Pro). Plans are billed in advance on a recurring basis through our payment
        processor, <a href="https://paystack.com">Paystack</a>, at the prices shown on our{" "}
        <a href="/pricing">pricing page</a> (in KES).
      </p>
      <ul>
        <li>
          Each plan includes a monthly allowance of active conversations. If you exceed it, new
          conversations may be paused until you upgrade or the next billing cycle begins; existing
          conversations keep working.
        </li>
        <li>
          If a renewal payment fails or your trial expires without a subscription, your account may
          become <strong>read-only</strong> and the AI will pause until billing is resolved.
        </li>
        <li>
          You can upgrade, downgrade, or cancel at any time from your account. Cancellation takes
          effect at the end of the current billing period.
        </li>
        <li>
          Except where required by law, fees already paid are non-refundable. We may change prices
          with at least 14 days&apos; notice; changes apply from your next billing cycle.
        </li>
      </ul>

      <h2 id="payments">6. Payments you collect from your customers</h2>
      <p>
        If you enable in-chat payments, Azayon can generate Paystack payment links so your customers
        pay <strong>you</strong> directly. Those funds settle to your own Paystack account, not ours,
        and your use of Paystack is subject to Paystack&apos;s own terms. We are not a party to the
        transaction between you and your customer, and we are not responsible for the goods or
        services you provide, refunds, chargebacks, or tax on those sales.
      </p>

      <h2 id="ai">7. AI-generated content</h2>
      <p>
        Azayon uses automated systems to understand messages and generate replies on your behalf.
        While we work to make these responses helpful and accurate, <strong>AI can make
        mistakes</strong> — it may misunderstand a message or produce an incorrect reply. You are
        responsible for configuring the assistant appropriately, reviewing sensitive actions, and
        using the available controls (such as human handoff and payment approval). You remain
        responsible for all messages sent from your WhatsApp number through Azayon.
      </p>

      <h2 id="ip">8. Intellectual property</h2>
      <p>
        Azayon, including its software, design, and content, is owned by Peskaya Limited and protected
        by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable right
        to use the Service during your subscription. You retain ownership of your own content and
        data; you grant us the rights needed to host and process it in order to provide the Service.
      </p>

      <h2 id="data">9. Data protection</h2>
      <p>
        Our handling of personal data is described in our <a href="/privacy">Privacy Policy</a>. For
        your customers&apos; data, you are the controller and we act as your processor, handling that
        data only to provide the Service and on your instructions.
      </p>

      <h2 id="third-party">10. Third-party services</h2>
      <p>
        The Service relies on third parties — including Meta (WhatsApp), Paystack, and the providers
        listed in our Privacy Policy. Their availability and terms are outside our control, and we are
        not responsible for outages or changes they make. Your use of WhatsApp is also subject to
        Meta&apos;s terms.
      </p>

      <h2 id="availability">11. Availability &amp; warranties</h2>
      <p>
        We work hard to keep Azayon available and reliable, but the Service is provided{" "}
        <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong> without warranties of any
        kind, whether express or implied, to the fullest extent permitted by law. We do not warrant
        that the Service will be uninterrupted, error-free, or that it will achieve any particular
        business result.
      </p>

      <h2 id="liability">12. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, neither party is liable for indirect, incidental, or
        consequential losses, or for lost profits, revenue, data, or goodwill. Our total aggregate
        liability arising out of or relating to the Service is limited to the amount you paid us for
        the Service in the <strong>three (3) months</strong> before the event giving rise to the
        claim. Nothing in these Terms excludes liability that cannot be excluded under Kenyan law.
      </p>

      <h2 id="indemnity">13. Indemnity</h2>
      <p>
        You agree to indemnify and hold Peskaya Limited harmless from claims, losses, and costs
        arising out of your use of the Service in breach of these Terms or of applicable law,
        including claims by your customers relating to messages sent through your account.
      </p>

      <h2 id="suspension">14. Suspension &amp; termination</h2>
      <p>
        You may stop using Azayon and close your account at any time. We may suspend or terminate your
        access if you materially breach these Terms, fail to pay, or use the Service in a way that
        risks our platform relationships or other customers. On termination, your right to use the
        Service ends; we handle your data as set out in the Privacy Policy, and you can export it
        before closing your account.
      </p>

      <h2 id="changes">15. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If a change is material, we&apos;ll notify
        registered users and post it here before it takes effect. Continuing to use the Service after
        a change means you accept the updated Terms.
      </p>

      <h2 id="law">16. Governing law</h2>
      <p>
        These Terms are governed by the laws of <strong>Kenya</strong>, and the courts of Kenya have
        exclusive jurisdiction over any dispute, without prejudice to any mandatory consumer
        protections available to you.
      </p>

      <h2 id="contact">17. Contact</h2>
      <p>Questions about these Terms:</p>
      <p>
        <strong>Peskaya Limited</strong>
        <br />
        Nairobi, Kenya
        <br />
        Email: <a href="mailto:hello@azayon.com">hello@azayon.com</a>
      </p>
    </LegalShell>
  );
}
