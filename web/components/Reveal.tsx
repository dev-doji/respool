"use client";
// Fades a section in as it scrolls into view. Sections already on screen, and visitors who prefer reduced
// motion, are left alone, so server-rendered content is never hidden.
import { useEffect, useRef, type ElementType, type HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLElement> & { as?: ElementType };

export function Reveal({ as: Tag = "section", className = "", ...rest }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    el.classList.add("pre");
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { el.classList.add("in"); io.disconnect(); }
    }, { threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`rise ${className}`} {...rest} />;
}
