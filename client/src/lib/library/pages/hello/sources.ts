import type { ReactVariantSources } from "../../types";

export const sources: ReactVariantSources = {
  "shadcn-tailwind": {
    notes:
      "Install shadcn primitives:\n  npx shadcn@latest add button card\nPlace this file under your React app's src/ (e.g. src/HelloPage.tsx).",
    files: [
      {
        filename: "HelloPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HelloPage() {
  const [count, setCount] = useState(0);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Hello, library!</h1>
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          You clicked the button {count} time{count === 1 ? "" : "s"}.
        </p>
        <Button className="mt-3" onClick={() => setCount((n) => n + 1)}>
          Click me
        </Button>
      </Card>
    </div>
  );
}
`,
      },
    ],
  },

  "plain-tailwind": {
    notes:
      "No shadcn — uses native elements + Tailwind utilities only. Place under src/HelloPage.jsx (or .tsx).",
    files: [
      {
        filename: "HelloPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";

export default function HelloPage() {
  const [count, setCount] = useState(0);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Hello, library!</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-gray-500">
          You clicked the button {count} time{count === 1 ? "" : "s"}.
        </p>
        <button
          className="mt-3 inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          onClick={() => setCount((n) => n + 1)}
        >
          Click me
        </button>
      </div>
    </div>
  );
}
`,
      },
    ],
  },

  "plain-css": {
    notes:
      "Two files. Place HelloPage.jsx and HelloPage.css next to each other; the component imports its stylesheet.",
    files: [
      {
        filename: "HelloPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";
import "./HelloPage.css";

export default function HelloPage() {
  const [count, setCount] = useState(0);
  return (
    <div className="hello">
      <h1 className="hello__title">Hello, library!</h1>
      <div className="hello__card">
        <p className="hello__text">
          You clicked the button {count} time{count === 1 ? "" : "s"}.
        </p>
        <button className="hello__button" onClick={() => setCount((n) => n + 1)}>
          Click me
        </button>
      </div>
    </div>
  );
}
`,
      },
      {
        filename: "HelloPage.css",
        language: "css",
        code: `.hello {
  max-width: 28rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.hello__title {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.hello__card {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.hello__text {
  font-size: 0.875rem;
  color: #6b7280;
}
.hello__button {
  margin-top: 0.75rem;
  background: #111827;
  color: #ffffff;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.hello__button:hover {
  background: #1f2937;
}
`,
      },
    ],
  },

  "shadcn-css": {
    notes:
      "Unusual combo: shadcn primitives for controls, layout via a colocated CSS file (no Tailwind utilities).\nInstall: npx shadcn@latest add button card\nPlace HelloPage.tsx and HelloPage.css together.",
    files: [
      {
        filename: "HelloPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import "./HelloPage.css";

export default function HelloPage() {
  const [count, setCount] = useState(0);
  return (
    <div className="hello">
      <h1 className="hello__title">Hello, library!</h1>
      <Card className="hello__card">
        <p className="hello__text">
          You clicked the button {count} time{count === 1 ? "" : "s"}.
        </p>
        <Button className="hello__button" onClick={() => setCount((n) => n + 1)}>
          Click me
        </Button>
      </Card>
    </div>
  );
}
`,
      },
      {
        filename: "HelloPage.css",
        language: "css",
        code: `.hello {
  max-width: 28rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.hello__title {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.hello__card {
  padding: 1rem;
}
.hello__text {
  font-size: 0.875rem;
  opacity: 0.7;
}
.hello__button {
  margin-top: 0.75rem;
}
`,
      },
    ],
  },
};
