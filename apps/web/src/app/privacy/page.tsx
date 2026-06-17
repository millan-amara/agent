import type { Metadata } from "next";
import { LegalShell } from "@/components/marketing/LegalShell";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/structured-data";

const PRIVACY_DESCRIPTION =
  "How Azayon (Peskaya Limited) collects, uses, and protects your personal data and your customers' data. Aligned with the Kenya Data Protection Act, 2019.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: PRIVACY_DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: {
    url: "/privacy",
    title: "Privacy Policy · Azayon",
    description: PRIVACY_DESCRIPTION,
  },
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="15 June 2026">
      <JsonLd
        schema={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Privacy Policy", path: "/privacy" },
        ])}
      />
      <p>
        Azayon (&ldquo;Azayon&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is
        operated by <strong>Peskaya Limited</strong>, a company registered in Kenya. Azayon is a
        WhatsApp-based assistant that helps businesses capture leads and reply to their customers
        automatically. This policy explains what personal data we handle (both data about{" "}
        <strong>you</strong> as an account holder and data about <strong>your customers</strong>{" "}
        that flows through Azayon): why we handle it, who we share it with, and the rights you have
        over it. It is written to align with the{" "}
        <strong>Kenya Data Protection Act, 2019</strong> and its regulations.
      </p>
      <p>
        If anything below is unclear, email us at{" "}
        <a href="mailto:hello@azayon.com">hello@azayon.com</a> and we&apos;ll get back to you.
      </p>

      <h2 id="who">1. Who we are &amp; our two roles</h2>
      <p>The company behind Azayon is:</p>
      <p>
        <strong>Peskaya Limited</strong>
        <br />
        Nairobi, Kenya
        <br />
        Email: <a href="mailto:hello@azayon.com">hello@azayon.com</a>
      </p>
      <p>
        Azayon handles personal data in two different roles, and which one applies depends on whose
        data it is:
      </p>
      <ul>
        <li>
          <strong>Your account, and how you personally use Azayon</strong>: here Peskaya Limited is
          the <strong>data controller</strong>.
        </li>
        <li>
          <strong>Your own customers&apos; data that passes through Azayon</strong>, for example,
          the people who message your WhatsApp business number: here{" "}
          <strong>you are the data controller and Peskaya Limited acts as your data processor</strong>
          . We handle that data only to provide the service to you, on your instructions. You are
          responsible for having a lawful basis (such as your customer&apos;s consent or your
          legitimate interest) to collect their data and message them.
        </li>
      </ul>
      <p>
        For questions about this policy or your data, write to{" "}
        <a href="mailto:hello@azayon.com">hello@azayon.com</a>.
      </p>

      <h2 id="what">2. What data we collect</h2>
      <h3>Account data</h3>
      <p>
        When you create an Azayon account we collect: your name, email address, phone number, the
        name of your business, and a password (stored hashed, never in plain text).
      </p>
      <h3>Your business profile</h3>
      <p>
        To set Azayon up, you give it details about your business: a description, your services and
        prices, frequently asked questions, business hours, and any documents or FAQs you upload to
        its knowledge base. The assistant uses these to answer your customers accurately.
      </p>
      <h3>Your customers&apos; data (processed on your behalf)</h3>
      <p>
        Azayon&apos;s core job is to receive and respond to messages on your WhatsApp business
        number. When one of your customers messages that number, Azayon receives and stores,{" "}
        <strong>on your behalf</strong>:
      </p>
      <ul>
        <li>their WhatsApp phone number and WhatsApp profile name;</li>
        <li>the content of the messages they send and that are sent back to them;</li>
        <li>
          <strong>transcriptions of voice notes</strong> they send (converted to text so the
          assistant can understand them);
        </li>
        <li>
          <strong>descriptions of images</strong> they send (interpreted so the assistant can
          respond);
        </li>
        <li>message delivery and read status;</li>
        <li>
          and any qualifying details the assistant extracts from the conversation (for example a
          name, what they&apos;re interested in, budget, or appointment preference) which appear in
          your CRM.
        </li>
      </ul>
      <p>
        For all of this data <strong>you are the controller</strong>; we process it only to provide
        Azayon to you.
      </p>
      <h3>Usage data</h3>
      <p>
        We log basic information about how you use Azayon (pages visited, actions taken, feature
        usage, IP address, browser, device) to operate the service, debug problems, and improve the
        product.
      </p>
      <h3>Payment data</h3>
      <p>
        If you subscribe to a paid Azayon plan, your subscription is processed by{" "}
        <a href="https://paystack.com">Paystack</a>. Separately, if you turn on in-chat payments,
        Azayon can generate Paystack payment links so your customers can pay <strong>you</strong>{" "}
        directly. Those payments settle to your own Paystack account, not ours. In both cases we do
        not store or have access to full card numbers, M-Pesa PINs, or bank credentials. We do
        store: your subscription tier and billing status, a Paystack customer/payment reference, and
        the amount and description of any invoices raised through Azayon.
      </p>
      <h3>Communications</h3>
      <p>If you email us, we keep the message and your reply so we can follow up.</p>

      <h2 id="why">3. How we use your data</h2>
      <ul>
        <li>
          To provide Azayon&apos;s features: receiving your customers&apos; WhatsApp messages,
          understanding them, automatically replying on your behalf, capturing leads into your
          pipeline, booking appointments, generating payment links, and scheduling follow-ups.
        </li>
        <li>
          To transcribe voice notes and interpret images so the assistant can understand and respond
          to what your customers send.
        </li>
        <li>To authenticate you and keep your account secure.</li>
        <li>
          To send you transactional messages: password resets, billing notices, and account alerts.
          You can&apos;t opt out of these without closing your account, because they&apos;re how the
          service works.
        </li>
        <li>
          To send product updates and tips. You can opt out of these at any time from your account
          settings or by clicking &ldquo;unsubscribe&rdquo; in the email.
        </li>
        <li>To diagnose problems, prevent abuse, and improve performance.</li>
        <li>
          To comply with legal obligations (tax, accounting, lawful requests from authorities).
        </li>
      </ul>
      <p>
        We don&apos;t sell your data or your customers&apos; data, share it for advertising, or use
        it to train AI models that benefit other customers.
      </p>

      <h2 id="legal-basis">4. Legal basis</h2>
      <p>Under the Kenya Data Protection Act, we process your data on the following bases:</p>
      <ul>
        <li>
          <strong>Performance of a contract</strong>, to deliver the service you signed up for
          (s.30(b)).
        </li>
        <li>
          <strong>Legitimate interests</strong>, to operate, secure, and improve Azayon (s.30(f)).
        </li>
        <li>
          <strong>Consent</strong>, for optional things like marketing emails. You can withdraw
          consent at any time.
        </li>
        <li>
          <strong>Legal obligation</strong>, where the law requires us to keep records.
        </li>
      </ul>
      <p>
        Where Azayon processes <strong>your customers&apos;</strong> data, we do so as your
        processor. You are responsible for the lawful basis (such as their consent or your
        legitimate interest) for collecting their data and messaging them. Azayon honours opt-out
        requests: when a customer asks to stop (for example by replying &ldquo;STOP&rdquo;), the
        assistant marks them as opted out and stops messaging them.
      </p>

      <h2 id="share">5. Who we share data with</h2>
      <p>
        We share data only with companies that help us run Azayon (&ldquo;subprocessors&rdquo;).
        They process data on our instructions and are bound to keep it confidential. The current
        list:
      </p>
      <ul>
        <li>
          <strong>Railway</strong>: managed PostgreSQL database hosting; our primary database, where
          your account, business and customer data are stored. See{" "}
          <a href="https://railway.com/legal/privacy">railway.com/legal/privacy</a>.
        </li>
        <li>
          <strong>Anthropic (Claude API)</strong>: the AI that understands incoming messages,
          drafts and sends replies, extracts CRM details, and interprets images. The relevant message
          text and images are sent to Anthropic for processing. Anthropic does not train its models
          on this data. See <a href="https://www.anthropic.com/legal/privacy">anthropic.com/legal/privacy</a>.
        </li>
        <li>
          <strong>Groq</strong>: transcribes voice notes your customers send into text. See{" "}
          <a href="https://groq.com/privacy-policy/">groq.com/privacy-policy</a>.
        </li>
        <li>
          <strong>Voyage AI</strong>: turns your knowledge-base content into embeddings so the
          assistant can search it to answer questions.
        </li>
        <li>
          <strong>Meta (WhatsApp Business Platform)</strong>, the channel itself: receiving and
          sending messages on your WhatsApp business number. See{" "}
          <a href="https://www.whatsapp.com/legal/business-policy">WhatsApp Business policy</a>.
        </li>
        <li>
          <strong>Paystack</strong>: subscription billing, and the in-chat M-Pesa/card/bank payment
          links your customers use. See <a href="https://paystack.com/privacy">paystack.com/privacy</a>.
        </li>
        <li>
          <strong>Resend</strong>: transactional email delivery (sign-up confirmations, password
          resets, account alerts). See <a href="https://resend.com/legal/privacy-policy">resend.com/legal/privacy-policy</a>.
        </li>
        <li>
          <strong>Google (Calendar)</strong>: if you connect your Google Calendar, appointments
          booked through Azayon are synced to it. See{" "}
          <a href="https://policies.google.com/privacy">policies.google.com/privacy</a>.
        </li>
        <li>
          <strong>Sentry</strong>: error monitoring, to detect and fix faults. See{" "}
          <a href="https://sentry.io/privacy/">sentry.io/privacy</a>.
        </li>
      </ul>
      <p>
        We will also share data when legally required (for example, in response to a valid court
        order) and we will tell you when we do so unless legally prohibited from doing so.
      </p>
      <p>We never sell your data. We never share customer data with advertising networks.</p>

      <h2 id="retention">6. How long we keep it</h2>
      <ul>
        <li>
          <strong>Account data</strong>: for as long as your account is active. If you close the
          account, we delete personal data within 30 days, except where the law requires us to keep
          it longer (e.g. tax records, kept for 7 years per the Kenya Revenue Authority).
        </li>
        <li>
          <strong>Your customers&apos; data and conversations</strong>: processed on your behalf for
          as long as your account is active. Azayon lets you set a retention window that
          automatically deletes stored message content after a period you choose; contact and
          pipeline records are kept until you delete them or close the account. You can export or
          erase this data at any time.
        </li>
        <li>
          <strong>Backups</strong>: encrypted backups are retained for 90 days for disaster
          recovery; deleted records purge from backups within that window.
        </li>
        <li>
          <strong>Logs</strong>: application logs are kept for 30 days.
        </li>
      </ul>

      <h2 id="rights">7. Your rights</h2>
      <p>Under the Kenya Data Protection Act you have the right to:</p>
      <ul>
        <li>
          <strong>Access</strong> the data we hold about you.
        </li>
        <li>
          <strong>Correct</strong> data that is inaccurate or incomplete.
        </li>
        <li>
          <strong>Delete</strong> data (&ldquo;right to be forgotten&rdquo;), subject to legal
          retention obligations.
        </li>
        <li>
          <strong>Object</strong> to processing based on legitimate interests, or for marketing.
        </li>
        <li>
          <strong>Restrict</strong> processing in certain circumstances.
        </li>
        <li>
          <strong>Data portability</strong>: export your data in a machine-readable format. Azayon
          includes a full data export (contacts, conversations, appointments, and invoices) from your
          settings; for anything else email us.
        </li>
        <li>
          <strong>Withdraw consent</strong>, where we relied on consent.
        </li>
        <li>
          <strong>Lodge a complaint</strong> with the Office of the Data Protection Commissioner
          (Kenya), <a href="https://www.odpc.go.ke">odpc.go.ke</a>, or with the data protection
          authority in your country if you live elsewhere.
        </li>
      </ul>
      <p>
        To exercise any of these rights, email <a href="mailto:hello@azayon.com">hello@azayon.com</a>
        . We respond within 7 days for access and correction requests, and in any case within the 30
        days required by the DPA. If you are one of <em>our customer&apos;s</em> customers and want
        to exercise rights over data they hold in Azayon, please contact that business directly.
        They are the controller of that data, and we will help them respond.
      </p>

      <h2 id="security">8. Security</h2>
      <p>We protect your data with measures appropriate to its sensitivity:</p>
      <ul>
        <li>All traffic is encrypted in transit (HTTPS / TLS 1.2+).</li>
        <li>Data at rest is encrypted on our database hosts.</li>
        <li>
          Passwords are hashed with scrypt and a unique salt, so we never see your plaintext password.
        </li>
        <li>
          Webhook traffic from WhatsApp and Paystack is verified by cryptographic signature before we
          act on it.
        </li>
        <li>Access to production systems is limited to engineers who need it, behind 2FA.</li>
        <li>Backups are encrypted.</li>
      </ul>
      <p>
        No system is impenetrable. If we ever discover a personal-data breach we will notify you and
        the ODPC within 72 hours of becoming aware of it, as required by section 43 of the DPA.
      </p>

      <h2 id="cookies">9. Cookies</h2>
      <p>We use a small number of cookies, all strictly necessary:</p>
      <ul>
        <li>
          <strong>Authentication cookies</strong>, to keep you signed in.
        </li>
        <li>
          <strong>Session cookies</strong>, to remember your preferences within a session.
        </li>
      </ul>
      <p>
        We do not use advertising cookies. We do not embed Facebook Pixel, Google Analytics 4 with
        PII, or similar tracking scripts on the application.
      </p>

      <h2 id="international">10. International transfers</h2>
      <p>
        Some of our subprocessors operate outside Kenya. Where data leaves Kenya we rely on the
        safeguards required by section 49 of the DPA, including ensuring the recipient country
        offers adequate protection, or putting standard contractual clauses in place. Depending on
        the feature in use, data may be processed in the United States (Anthropic, Groq, Voyage AI,
        Resend, Google, Sentry), Nigeria (Paystack), and other countries where Meta operates the
        WhatsApp Business Platform.
      </p>

      <h2 id="children">11. Children</h2>
      <p>
        Azayon is a tool for businesses and is not intended for anyone under 18. We don&apos;t
        knowingly collect data from children. If you believe a child has provided us with personal
        data, email <a href="mailto:hello@azayon.com">hello@azayon.com</a> and we&apos;ll delete it.
      </p>

      <h2 id="changes">12. Changes to this policy</h2>
      <p>
        If we change this policy materially, we&apos;ll email registered users and post the change on
        this page at least 14 days before it takes effect. The &ldquo;Last updated&rdquo; date at the
        top always reflects the current version.
      </p>

      <h2 id="contact">13. Contact</h2>
      <p>Questions, complaints, or rights requests:</p>
      <p>
        <strong>Peskaya Limited</strong>, Data Protection
        <br />
        Email: <a href="mailto:hello@azayon.com">hello@azayon.com</a>
      </p>
    </LegalShell>
  );
}
