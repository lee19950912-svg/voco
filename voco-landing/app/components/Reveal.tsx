"use client";

// Tiny IntersectionObserver-driven fade-in wrapper. Adds `.reveal-in` once
// the wrapped element scrolls into view; the matching `.reveal-pre` baseline
// (hidden + nudged down) lives in globals.css so SSR markup paints with the
// "before" state and CSR flips it once visible. Pass `delay` (ms) to stagger
// siblings — used by FeatureTriple / FeatureContext / FeaturePrivacy.
import { useEffect, useRef, useState } from "react";

type Props = {
  delay?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  children: React.ReactNode;
};

export default function Reveal({
  delay = 0,
  className = "",
  as = "div",
  children,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (shown) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={`${shown ? "reveal-in" : "reveal-pre"} ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
    >
      {children}
    </Tag>
  );
}
