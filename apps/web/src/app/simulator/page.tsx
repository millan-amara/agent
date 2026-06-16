"use client";

import { SimulatorChat } from "@/components/SimulatorChat";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SimulatorPage() {
  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto p-4 md:p-8">
      <PageHeader
        title="Simulator"
        subtitle="Chat with your AI as if you were a customer. Nothing here touches WhatsApp — change your business info in Settings and test again until it sounds right."
      />
      <SimulatorChat height="h-[calc(100%-8rem)] min-h-[24rem]" />
    </div>
  );
}
