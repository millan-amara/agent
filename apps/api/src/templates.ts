import type { BusinessProfile } from "./agent/prompt.js";

/**
 * Vertical templates: the engine is one product; verticals are pre-built
 * configuration. A new tenant picks one and lands ~80% configured.
 */
export interface VerticalTemplate {
  id: string;
  label: string;
  emoji: string;
  stages: string[];
  profile: BusinessProfile;
}

const sharedTone = "Warm, professional, and concise.";

export const TEMPLATES: VerticalTemplate[] = [
  {
    id: "clinic",
    label: "Clinic / Health practice",
    emoji: "🩺",
    stages: ["New Lead", "Qualified", "Booking Requested", "Booked", "Visited", "Lost"],
    profile: {
      description:
        "A health practice. Describe what you treat, who your practitioners are, and what a first visit looks like.",
      tone: "Warm, reassuring, and professional — people often message when worried or in pain.",
      neverSay: [
        "Diagnose a condition or promise recovery outcomes",
        "Recommend medication",
        "Quote prices not in the services list",
      ],
      services: [],
      faqs: [],
    },
  },
  {
    id: "real_estate",
    label: "Real estate",
    emoji: "🏠",
    stages: ["Inquiry", "Qualified", "Viewing Scheduled", "Negotiation", "Closed", "Lost"],
    profile: {
      description:
        "A real estate agency. Describe the areas you cover, property types, and whether you handle sales, rentals, or both.",
      tone: sharedTone,
      neverSay: [
        "Quote prices or availability for specific properties not listed",
        "Promise approval, financing, or legal outcomes",
      ],
      services: [],
      faqs: [],
    },
  },
  {
    id: "restaurant",
    label: "Restaurant / Café",
    emoji: "🍽️",
    stages: ["New Inquiry", "Reservation Requested", "Confirmed", "Seated", "Lost"],
    profile: {
      description:
        "A restaurant. Describe your cuisine, location, seating, and how reservations work.",
      tone: "Friendly and upbeat.",
      neverSay: ["Confirm reservations for times outside business hours", "Invent menu items or prices"],
      services: [],
      faqs: [],
    },
  },
  {
    id: "school",
    label: "School / Training",
    emoji: "🎓",
    stages: ["Inquiry", "Qualified", "Visit Scheduled", "Application", "Enrolled", "Lost"],
    profile: {
      description:
        "An education provider. Describe your programs, age groups or levels, intake periods, and admissions process.",
      tone: sharedTone,
      neverSay: ["Guarantee admission", "Quote fees not in the services list"],
      services: [],
      faqs: [],
    },
  },
  {
    id: "gym",
    label: "Gym / Fitness",
    emoji: "💪",
    stages: ["New Lead", "Qualified", "Trial Booked", "Member", "Lost"],
    profile: {
      description:
        "A fitness business. Describe your facilities, classes, trainers, and membership options.",
      tone: "Energetic and encouraging.",
      neverSay: ["Give medical or injury advice", "Quote prices not in the services list"],
      services: [],
      faqs: [],
    },
  },
  {
    id: "general",
    label: "Other business",
    emoji: "💼",
    stages: ["New Lead", "Qualified", "Proposal Sent", "Won", "Lost"],
    profile: {
      description: "Describe what your business does, who your customers are, and how you sell.",
      tone: sharedTone,
      neverSay: ["Quote prices not in the services list", "Make commitments on delivery dates"],
      services: [],
      faqs: [],
    },
  },
];

export function getTemplate(id: string): VerticalTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1]!;
}
