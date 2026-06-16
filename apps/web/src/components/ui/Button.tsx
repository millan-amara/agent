import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-card font-semibold whitespace-nowrap " +
  "transition-colors disabled:opacity-50 disabled:pointer-events-none";

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs [&_svg]:size-4",
  md: "h-10 px-4 text-sm [&_svg]:size-4",
  lg: "h-11 px-5 text-sm [&_svg]:size-[18px]",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary-700 text-white hover:bg-primary-800 shadow-card",
  secondary: "border border-line bg-white text-ink hover:bg-canvas",
  ghost: "text-muted hover:bg-canvas hover:text-ink",
  subtle: "bg-primary-soft text-primary-700 hover:bg-primary-100",
  danger: "bg-danger text-white hover:bg-red-700 shadow-card",
};

/** Class string for the button look — use on <Link> or <a> so anchors match. */
export function buttonStyles(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return `${base} ${sizes[size]} ${variants[variant]}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${buttonStyles(variant, size)} ${className}`}
      {...props}
    />
  );
});
