import { db } from "./db.js";
import type { Tenant } from "@prisma/client";
import type { BusinessProfile } from "./agent/prompt.js";

/**
 * Slice 1 runs single-tenant with this hardcoded example business
 * (a Nairobi physio clinic — the pilot vertical). Slice 3 replaces this
 * with real tenant onboarding + the vertical template library.
 */
const PROFILE: BusinessProfile = {
  description:
    "ABC Physio is a physiotherapy clinic in Kilimani, Nairobi. We treat back pain, sports injuries, and post-surgery rehabilitation. First visit is a 45-minute assessment with a licensed physiotherapist.",
  businessHours: "Mon–Fri 8am–6pm, Sat 9am–1pm. Closed Sundays.",
  bookingInfo:
    "Appointments are booked by our front desk. To book, collect the customer's name and preferred day/time, then tell them the team will confirm shortly.",
  services: [
    { name: "Initial assessment (45 min)", price: "KES 3,500" },
    { name: "Follow-up physiotherapy session (45 min)", price: "KES 3,000" },
    { name: "Sports massage (60 min)", price: "KES 4,000" },
    { name: "Home visit (within Nairobi)", price: "KES 6,500" },
  ],
  faqs: [
    {
      q: "Do you accept insurance?",
      a: "Yes — we accept Jubilee, AAR, and Madison. Bring your insurance card to your first visit.",
    },
    {
      q: "Where are you located?",
      a: "Wood Avenue, Kilimani, Nairobi — 2nd floor of Wood Avenue Court. Parking available.",
    },
    {
      q: "Do I need a doctor's referral?",
      a: "No referral needed — you can book an assessment directly.",
    },
  ],
  tone: "Warm, reassuring, and professional — people often message in pain or worried.",
  neverSay: [
    "Diagnose a condition or promise recovery outcomes",
    "Recommend medication",
    "Quote prices not in the services list",
  ],
};

const STAGES = ["New Lead", "Qualified", "Booking Requested", "Booked", "Visited", "Lost"];

export async function ensureDevTenant(): Promise<Tenant> {
  const waPhoneNumberId = process.env.WA_PHONE_NUMBER_ID || null;
  const waWabaId = process.env.WA_WABA_ID || null;
  const existing = await db.tenant.findFirst({ where: { name: "ABC Physio (dev)" } });
  if (existing) {
    // Keep the tenant bound to whatever number .env points at — the webhook
    // matches tenants by phone_number_id, and creds often land after first seed.
    if (existing.waPhoneNumberId !== waPhoneNumberId || existing.waWabaId !== waWabaId) {
      return db.tenant.update({
        where: { id: existing.id },
        data: { waPhoneNumberId, waWabaId },
      });
    }
    return existing;
  }
  return db.tenant.create({
    data: {
      name: "ABC Physio (dev)",
      businessProfile: JSON.stringify(PROFILE),
      stages: JSON.stringify(STAGES),
      waPhoneNumberId,
      waWabaId,
    },
  });
}
