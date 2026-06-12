"use client";

import { SimulatorChat } from "@/components/SimulatorChat";

export default function SimulatorPage() {
  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto p-4 md:p-6">
      <h1 className="mb-1 font-semibold">Simulator</h1>
      <p className="mb-4 text-sm text-muted">
        Chat with your AI as if you were a customer. Nothing here touches WhatsApp — change your
        business info in Settings and test again until it sounds right.
      </p>
      <SimulatorChat height="h-[calc(100%-7rem)] min-h-[24rem]" />
    </div>
  );
}
