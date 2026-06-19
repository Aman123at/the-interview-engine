"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /**
   * Max rotation, in degrees, at the card's furthest corner. ~6° feels
   * substantial without being theatrical. Tune per-surface (lower on big
   * cards, higher on small ones).
   */
  maxTilt?: number;
  /** Lift the card up on hover (px translateZ). 6 is a nice subtle pop. */
  liftPx?: number;
  /** Show a soft top-down glare that follows the cursor. Off by default to
   *  keep the design calm; enable on hero/marquee tiles. */
  glare?: boolean;
  /** Forwarded to the outer element so callers can route ARIA, role, etc. */
  ariaLabel?: string;
}

/**
 * 3D tilt card — perspective rotation tracks the cursor, soft elevation
 * shadow lifts on hover, GPU-friendly (transform/opacity only). Works in
 * both themes because every color comes from CSS tokens.
 *
 * Reduced motion: returns a static container with no tilt, no lift, no
 * glare. Children render identically so layout never shifts between modes.
 *
 * Don't use inside the editor / terminal / preview panes — those need to
 * stay jank-free for input handling.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 6,
  liftPx = 6,
  glare = false,
  ariaLabel,
}: TiltCardProps) {
  const reduce = useReducedMotion();

  // Normalized cursor position in [-0.5, 0.5] for both axes. Springs smooth
  // out jitter; stiffness/damping picked for a "settled in ~150ms" feel.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 220, damping: 22, mass: 0.4 });
  const sy = useSpring(py, { stiffness: 220, damping: 22, mass: 0.4 });

  // Rotations are inverted on the X axis so moving the cursor UP tilts the
  // TOP of the card AWAY from you (matches physical expectation).
  const rotateX = useTransform(sy, [-0.5, 0.5], [maxTilt, -maxTilt]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-maxTilt, maxTilt]);

  // Glare position in % — cursor-anchored radial gradient.
  const glareX = useTransform(sx, [-0.5, 0.5], ["20%", "80%"]);
  const glareY = useTransform(sy, [-0.5, 0.5], ["20%", "80%"]);

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    px.set(x);
    py.set(y);
  }

  function onPointerLeave() {
    px.set(0);
    py.set(0);
  }

  // Reduced-motion fallback — a plain div with the same outer styles + a
  // hover:bg-accent/40 affordance from the consumer's className. We keep
  // the same DOM shape so React reconciliation is cheap on theme/motion
  // pref changes.
  if (reduce) {
    return (
      <div
        aria-label={ariaLabel}
        className={cn(
          "relative isolate rounded-lg",
          // Soft drop shadow — same elevation as the tilted card's rest
          // state. Tokens come from globals.css.
          "shadow-[0_1px_2px_oklch(0_0_0/6%)] dark:shadow-[0_1px_2px_oklch(0_0_0/30%)]",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.div
      aria-label={ariaLabel}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      // perspective drives the depth of the tilt; transformStyle keeps the
      // inner content rotating with the parent.
      style={
        {
          perspective: 800,
          transformStyle: "preserve-3d",
        } as CSSProperties
      }
      className={cn("relative isolate rounded-lg", className)}
      // Outer wrapper handles the hover lift via Y translate so it composes
      // cleanly with the inner rotation (no transform conflicts).
      whileHover={{ y: -liftPx / 2 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className={cn(
          "relative h-full w-full rounded-[inherit]",
          // Elevation: a calm shadow at rest, a touch stronger on hover via
          // the wrapper's lift. Token-backed in both themes.
          "shadow-[0_1px_2px_oklch(0_0_0/6%),0_8px_20px_-12px_oklch(0_0_0/12%)]",
          "dark:shadow-[0_1px_2px_oklch(0_0_0/30%),0_12px_28px_-12px_oklch(0_0_0/60%)]",
        )}
      >
        {children}
        {glare ? (
          <motion.span
            aria-hidden
            style={{
              background: `radial-gradient(circle at var(--gx) var(--gy), oklch(1 0 0 / 16%), transparent 55%)`,
              ["--gx" as string]: glareX,
              ["--gy" as string]: glareY,
            }}
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
        ) : null}
      </motion.div>
    </motion.div>
  );
}
