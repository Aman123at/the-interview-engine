"use client";

import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LibraryButtonProps {
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

/** Opens /library in a new tab. The library is public — no auth required. */
export function LibraryButton({
  size = "sm",
  variant = "outline",
  className,
}: LibraryButtonProps) {
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={() => window.open("/library", "_blank", "noopener,noreferrer")}
    >
      <Library className="mr-1.5 h-4 w-4" aria-hidden />
      Access Component Library
    </Button>
  );
}
