# Paystack live-payment verification (pilot gate)

The in-chat payment path is implemented end-to-end:
`create_invoice` tool → `createPaymentLink` ([apps/api/src/paystack.ts](../apps/api/src/paystack.ts)) →
hosted checkout (M-Pesa + card) → Paystack `charge.success` →
`/webhooks/paystack` (per-tenant HMAC-SHA512 verify) → `markInvoicePaid` →
invoice flips to `paid`, a timeline event is written, and the inbox updates live.

Before charging a real customer, verify it works against the **deployed** domain.

## Prerequisites
- Phase A deployed (stable API domain on Railway).
- A tenant connected to a **Paystack test** account; its **test secret key**
  (`sk_test_…`) saved in Settings → Payments.

## Register the webhook
Paystack dashboard → **Settings → API Keys & Webhooks** → Webhook URL:
```
https://<api-domain>/webhooks/paystack
```
(One URL for the integration; our handler resolves the tenant by invoice
reference and verifies the signature with *that tenant's* key.)

## End-to-end test (test mode)
1. In the in-app **Simulator** (or a real WhatsApp chat for that tenant), drive
   the AI to a purchase so it calls `create_invoice` — it returns a pay link.
2. Open the link. Confirm the hosted page offers **M-Pesa** and **card** for KES.
3. Pay with a [Paystack test method](https://paystack.com/docs/payments/test-payments/):
   - Card: `4084 0840 8408 4081`, any future expiry, CVV `408`, OTP `123456`.
   - M-Pesa test: follow the test prompt.
4. Confirm within a few seconds:
   - The invoice row flips to `paid` (`paidAt` set).
   - A "Payment received — KES …" event appears in the conversation timeline.
   - The contact's lead panel shows the invoice as paid.

## Checks
- **Idempotency**: re-deliver the same `charge.success` (Paystack dashboard →
  webhook → resend). `markInvoicePaid` no-ops on an already-paid invoice.
- **Signature**: a tampered body returns 401; a `[paystack] webhook signature
  mismatch` warning is captured in Sentry (if `SENTRY_DSN` is set).
- **Speed**: the handler acks fast and does no model work.

## Go-live
Swap the tenant's key to the **live** secret key (`sk_live_…`) in Settings →
Payments and run one small real KES transaction end-to-end before opening it to
customers.
