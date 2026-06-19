"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Canonical preview = shadcn + Tailwind. The string variant in sources.ts
 * mirrors this; we accept the small duplication so authoring needs no
 * raw-loader/webpack config.
 */
export default function HelloPreview() {
  const [count, setCount] = useState(0);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Hello, library!</h1>
      <Card className="p-4">
        <p className="text-muted-foreground text-sm">
          You clicked the button {count} time{count === 1 ? "" : "s"}.
        </p>
        <Button className="mt-3" onClick={() => setCount((n) => n + 1)}>
          Click me
        </Button>
      </Card>
    </div>
  );
}
