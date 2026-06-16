"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api, type Conversation } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { StatePill } from "@/components/StatePill";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Conversation[]>([]);

  const refresh = useCallback(() => {
    api.conversations().then(setContacts).catch(() => {});
  }, []);

  useEffect(() => refresh(), [refresh]);
  useLive(useCallback(() => refresh(), [refresh]));

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto p-4 md:p-8">
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length} ${contacts.length === 1 ? "person" : "people"} who have messaged you.`}
      />

      {contacts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Contacts are created automatically the moment a customer messages your WhatsApp."
          />
        </Card>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="space-y-2 md:hidden">
            {contacts.map((c) => (
              <Card key={c.id} className="flex items-center gap-3 p-3">
                <Avatar name={c.name} phone={c.phone} attention={c.needsHuman} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{c.name ?? "Unknown"}</div>
                  <div className="tnum truncate text-xs text-muted">{c.phone}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span>{c.stage}</span>
                    {c.source && <span>· {c.source}</span>}
                  </div>
                </div>
                <StatePill contact={c} />
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} phone={c.phone} size="sm" attention={c.needsHuman} />
                        <span className="font-medium">{c.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="tnum px-4 py-2.5 text-muted">{c.phone}</td>
                    <td className="px-4 py-2.5">{c.stage}</td>
                    <td className="px-4 py-2.5 text-muted">{c.source ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <StatePill contact={c} size="md" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
