"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Conversation } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { StatePill } from "@/components/StatePill";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Conversation[]>([]);

  const refresh = useCallback(() => {
    api.conversations().then(setContacts).catch(() => {});
  }, []);

  useEffect(() => refresh(), [refresh]);
  useLive(useCallback(() => refresh(), [refresh]));

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="mb-3 font-semibold">Contacts</h1>
      <div className="overflow-hidden rounded-card border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-medium">{c.name ?? "—"}</td>
                <td className="tnum px-3 py-2 text-muted">{c.phone}</td>
                <td className="px-3 py-2">{c.stage}</td>
                <td className="px-3 py-2 text-muted">{c.source ?? "—"}</td>
                <td className="px-3 py-2">
                  <StatePill contact={c} size="md" />
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  No contacts yet — they&apos;re created automatically when customers message.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
