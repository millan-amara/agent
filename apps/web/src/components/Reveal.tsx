"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-triggered reveal. Renders a wrapper that starts hidden (via the
 * `.reveal` / `.reveal-group` classes in globals.css) and animates in the first
 * time it scrolls into view. With `stagger`, the wrapper stays in normal flow
 * (so it can itself be the grid/flex container) and its direct children animate
 * in sequence.
 *
 * Reduced-motion users get the final state instantly: the CSS guards skip the
 * hidden start state, so even before this observer runs the content is visible.
 */
export function Reveal({
  className = "",
  stagger = false,
  children,
}: {
  className?: string;
  stagger?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (or already in view on a tiny viewport): just show.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const base = stagger ? "reveal-group" : "reveal";
  return (
    <div ref={ref} className={`${base}${visible ? " is-visible" : ""} ${className}`}>
      {children}
    </div>
  );
}
