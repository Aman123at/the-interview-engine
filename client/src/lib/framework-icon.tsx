import { createElement } from "react";
import {
  Atom,
  Boxes,
  Code2,
  FileCode2,
  Flame,
  Hexagon,
  Layers,
  Leaf,
  Triangle,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

function pickIcon(hint: string | undefined, fallbackId?: string): LucideIcon {
  const k = (hint ?? fallbackId ?? "").toLowerCase();
  switch (k) {
    case "fullstack":
    case "full stack":
    case "full-stack":
      return Layers;
    case "next":
    case "next.js":
    case "nextjs":
      return Triangle;
    case "react":
      return Atom;
    case "vue":
      return Hexagon;
    case "svelte":
      return Flame;
    case "angular":
      return Boxes;
    case "node":
    case "nodejs":
    case "node.js":
      return Leaf;
    case "express":
    case "fastify":
    case "vite":
      return Zap;
    case "remix":
      return Layers;
    case "tailwind":
      return Wind;
    case "typescript":
    case "ts":
      return FileCode2;
    default:
      return Code2;
  }
}

interface FrameworkIconProps {
  /** Server-provided icon hint (e.g. "react", "next"). */
  hint?: string;
  /** Framework id, used as a fallback hint. */
  id?: string;
  className?: string;
}

/**
 * Module-scope wrapper so callers don't bind a component to a render-local
 * variable (which the React-compiler-aware lint rule rejects).
 */
export function FrameworkIcon({ hint, id, className }: FrameworkIconProps) {
  // Use createElement so the icon component isn't bound to a local capitalized
  // variable in render scope — keeps `react-hooks/static-components` happy.
  return createElement(pickIcon(hint, id), {
    className,
    "aria-hidden": true,
  });
}
