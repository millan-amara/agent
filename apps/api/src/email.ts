import { config } from "./config.js";
import { fetchWithTimeout } from "./http.js";

/**
 * Transactional email via Resend. Used for password reset, email verification,
 * and compliance alerts (quality-rating drops). When RESEND_API_KEY is unset
 * (dev), emails are logged to the console instead of sent, so flows are still
 * testable — the link/body is printed.
 */
const RESEND_SEND = "https://api.resend.com/emails";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  if (!config.RESEND_API_KEY) {
    console.log(
      `[email:dev] to=${opts.to} subject="${opts.subject}"\n${opts.text ?? opts.html}`,
    );
    return;
  }
  const res = await fetchWithTimeout(RESEND_SEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
  }
}
