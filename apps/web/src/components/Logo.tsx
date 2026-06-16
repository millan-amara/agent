import Image from "next/image";
import azLogo from "./az-logo.png";
import azayonLogo from "./azayon-logo-transparent.png";
import azayonLogoWhite from "./azayon-logo-white.png";

/** Azayon mark — the az-logo tile + wordmark. `mark` renders just the tile. */
export function Logo({
  size = "md",
  wordmark = true,
}: {
  size?: "sm" | "md";
  wordmark?: boolean;
}) {
  const tile = size === "sm" ? "size-7 rounded-[8px]" : "size-8 rounded-card";
  const px = size === "sm" ? 28 : 32;
  const word = size === "sm" ? "text-base" : "text-lg";
  return (
    <span className="inline-flex items-center gap-2">
      <Image
        src={azLogo}
        alt="Azayon"
        width={px}
        height={px}
        priority
        className={`${tile} object-contain shadow-card`}
      />
      {wordmark && (
        <span className={`${word} font-semibold tracking-tight text-ink`}>Azayon</span>
      )}
    </span>
  );
}

/**
 * Full horizontal Azayon lockup (mark + wordmark) as a single image, on a
 * transparent background. Sized by height — pass an `h-*` class via `className`.
 * Use `white` on dark surfaces to render the white knockout variant.
 */
export function LogoFull({
  className = "h-9",
  white = false,
  priority = false,
}: {
  className?: string;
  white?: boolean;
  priority?: boolean;
}) {
  return (
    <Image
      src={white ? azayonLogoWhite : azayonLogo}
      alt="Azayon"
      priority={priority}
      className={`w-auto object-contain ${className}`}
    />
  );
}
