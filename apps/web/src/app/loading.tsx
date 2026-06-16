import { Loader2 } from "lucide-react";

/** Shown in the content area while a route segment loads. */
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary-600" />
    </div>
  );
}
