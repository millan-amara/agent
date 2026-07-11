/**
 * The customer's own brand in the app shell — their logo and business name, not ours.
 * Azayon is white-labelled here: the operator sees their business, with a small
 * "Powered by Azayon" line kept out of the way at the foot of the rail.
 *
 * `logoUrl` is a base64 data: URL (see /api/tenant/logo), so it's a plain <img> —
 * next/image would try to run it through the optimizer for no benefit.
 */
export function TenantBrand({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="size-9 shrink-0 rounded-card border border-line bg-white object-contain"
        />
      ) : (
        <Monogram name={name} />
      )}
      <span className="min-w-0 truncate text-base font-semibold tracking-tight text-ink" title={name}>
        {name}
      </span>
    </span>
  );
}

/** Stand-in until the owner uploads a logo — their initials on the brand tile. */
function Monogram({ name }: { name: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-card bg-primary-700 text-sm font-semibold text-white shadow-card"
    >
      {initials}
    </span>
  );
}
