"use client";

import { toJpeg, toPng } from "html-to-image";

/** What part of the canvas DOM to capture. We always shoot the React Flow
 *  pane (`.react-flow__viewport` lives inside this root) so the export
 *  matches what's on screen, fit-padded. */
function getReactFlowRoot(wrapper: HTMLElement | null): HTMLElement | null {
  if (!wrapper) return null;
  return (
    wrapper.querySelector<HTMLElement>(".react-flow") ?? wrapper
  );
}

interface CaptureOptions {
  /** Background fill — needs to match the theme bg so PNGs aren't transparent
   *  on dark / patchy on light. Pass a CSS color. */
  background: string;
  /** Pixel ratio — 2 keeps thumbnails crisp on retina without bloating the
   *  upload. */
  pixelRatio?: number;
  /** Optional explicit width/height override (used for thumbnails). */
  width?: number;
  height?: number;
}

export async function captureCanvasPng(
  wrapper: HTMLElement | null,
  opts: CaptureOptions,
): Promise<string | null> {
  const root = getReactFlowRoot(wrapper);
  if (!root) return null;
  try {
    return await toPng(root, {
      backgroundColor: opts.background,
      pixelRatio: opts.pixelRatio ?? 2,
      cacheBust: true,
      width: opts.width,
      height: opts.height,
      // Skip control / minimap overlays so the screenshot is the schema only.
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.classList.contains("react-flow__controls")) return false;
        if (node.classList.contains("react-flow__minimap")) return false;
        if (node.classList.contains("react-flow__attribution")) return false;
        return true;
      },
    });
  } catch (e) {
    console.error("[design] PNG export failed", e);
    return null;
  }
}

export async function captureCanvasJpeg(
  wrapper: HTMLElement | null,
  opts: CaptureOptions,
): Promise<string | null> {
  const root = getReactFlowRoot(wrapper);
  if (!root) return null;
  try {
    return await toJpeg(root, {
      backgroundColor: opts.background,
      pixelRatio: opts.pixelRatio ?? 2,
      quality: 0.92,
      cacheBust: true,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.classList.contains("react-flow__controls")) return false;
        if (node.classList.contains("react-flow__minimap")) return false;
        if (node.classList.contains("react-flow__attribution")) return false;
        return true;
      },
    });
  } catch (e) {
    console.error("[design] JPG export failed", e);
    return null;
  }
}

/** Trigger a browser download from a data URL. */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Resolve a theme-appropriate background by reading the CSS token. */
export function resolveCanvasBackground(): string {
  if (typeof window === "undefined") return "#ffffff";
  const css = getComputedStyle(document.documentElement);
  const val = css.getPropertyValue("--background").trim();
  // CSS oklch values render correctly in canvas in modern browsers; fall back
  // to white if the token is somehow missing.
  return val || "#ffffff";
}
