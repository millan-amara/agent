/** Initials avatar. Tone shifts to amber when the contact needs a human. */
export function Avatar({
  name,
  phone,
  size = "md",
  attention = false,
}: {
  name?: string | null;
  phone?: string;
  size?: "sm" | "md" | "lg";
  attention?: boolean;
}) {
  const source = (name ?? phone ?? "?").trim();
  const initials = source
    .replace(/^\+/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const sz =
    size === "sm" ? "size-7 text-[11px]" : size === "lg" ? "size-11 text-base" : "size-9 text-xs";
  const tone = attention
    ? "bg-attentionSoft text-attention"
    : "bg-primary-soft text-primary-700";

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${sz} ${tone}`}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
