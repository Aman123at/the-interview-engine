"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  className?: string;
  /** Delay before the fade starts, seconds. */
  delay?: number;
  /** y-offset to start from. 6–12 reads as a calm rise. */
  y?: number;
  /** Component to render as. Defaults to `div`. */
  as?: "div" | "section" | "header" | "main";
  /** Pass-through aria-labelledby for accessible regions. */
  "aria-labelledby"?: string;
}

/**
 * Subtle entrance wrapper — fade + small upward translate. Renders a static
 * container under `prefers-reduced-motion`. Cheap to use anywhere; don't
 * stack many of these (nested fades feel laggy).
 */
export function FadeIn({
  children,
  className,
  delay = 0,
  y = 8,
  as = "div",
  "aria-labelledby": ariaLabelledby,
}: FadeInProps) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      aria-labelledby={ariaLabelledby}
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </MotionTag>
  );
}
