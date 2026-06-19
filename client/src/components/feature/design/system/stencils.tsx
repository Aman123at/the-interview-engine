"use client";

import { Database, Globe, Server, Smartphone } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/**
 * Infra stencil definitions. Each stencil drops onto the canvas as an
 * Excalidraw rectangle + bound text label, so generic arrow binding,
 * selection, and theming "just work" against Excalidraw's primitives.
 *
 * Stroke / fill are picked from a warm-but-muted palette that reads in both
 * the light and dark canvas themes. Excalidraw's renderer applies its own
 * paper-vs-dark adjustments, so the same colors look right in both.
 */
export type StencilId =
  | "database"
  | "server"
  | "client_browser"
  | "phone_device";

export interface Stencil {
  id: StencilId;
  label: string;
  /** Excalidraw `backgroundColor` for the rectangle body. */
  backgroundColor: string;
  /** Excalidraw `strokeColor`. */
  strokeColor: string;
  width: number;
  height: number;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const STENCILS: Stencil[] = [
  {
    id: "database",
    label: "Database",
    backgroundColor: "#fce7f3",
    strokeColor: "#be185d",
    width: 180,
    height: 110,
    Icon: Database,
  },
  {
    id: "server",
    label: "Server",
    backgroundColor: "#dbeafe",
    strokeColor: "#1d4ed8",
    width: 180,
    height: 110,
    Icon: Server,
  },
  {
    id: "client_browser",
    label: "Client Browser",
    backgroundColor: "#d1fae5",
    strokeColor: "#047857",
    width: 200,
    height: 110,
    Icon: Globe,
  },
  {
    id: "phone_device",
    label: "Phone Device",
    backgroundColor: "#fef3c7",
    strokeColor: "#b45309",
    width: 130,
    height: 170,
    Icon: Smartphone,
  },
];

export function stencilById(id: string): Stencil | undefined {
  return STENCILS.find((s) => s.id === id);
}
