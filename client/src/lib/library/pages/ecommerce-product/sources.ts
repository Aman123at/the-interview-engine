import type { ReactVariantSources } from "../../types";

const PRODUCTS = `const PRODUCTS = [
  { id: 1, title: "Aeris Headphones",   description: "Wireless, 40h battery",      price: 199, emoji: "🎧" },
  { id: 2, title: "Nimbus Speaker",     description: "Portable, room-filling",    price: 129, emoji: "🔊" },
  { id: 3, title: "Vega Smartwatch",    description: "Always-on display, GPS",    price: 249, emoji: "⌚" },
  { id: 4, title: "Lumen Desk Lamp",    description: "Warm/cool, dimmable",       price:  79, emoji: "💡" },
  { id: 5, title: "Orbit Mouse",        description: "Ergonomic, silent click",   price:  49, emoji: "🖱️" },
  { id: 6, title: "Pebble Keyboard",    description: "Low-profile mechanical",    price: 139, emoji: "⌨️" },
];
const PAGE_SIZE = 6;`;

export const sources: ReactVariantSources = {
  "shadcn-tailwind": {
    notes:
      "Install: npx shadcn@latest add card button\nPlace under src/ProductsPage.tsx.",
    files: [
      {
        filename: "ProductsPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

${PRODUCTS}

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(PRODUCTS.length / PAGE_SIZE));
  const visible = PRODUCTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function onAdd(id: number) {
    // Dummy handler — wire to your cart store / toast / API.
    console.log("add to cart:", id);
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Shop</h1>
        <p className="text-muted-foreground text-sm">Featured products</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <CardHeader>
              <div className="bg-muted text-muted-foreground mb-2 flex aspect-[4/3] items-center justify-center rounded-md text-5xl">
                {p.emoji}
              </div>
              <CardTitle>{p.title}</CardTitle>
              <CardDescription>{p.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto" />
            <CardFooter className="flex items-center justify-between">
              <span className="text-base font-medium">\${p.price}</span>
              <Button onClick={() => onAdd(p.id)}>Add to cart</Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {page} of {totalPages} · {PRODUCTS.length} products
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
`,
      },
    ],
  },

  "plain-tailwind": {
    notes: "No shadcn — native elements + Tailwind utilities. Place under src/ProductsPage.jsx.",
    files: [
      {
        filename: "ProductsPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";

${PRODUCTS}

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(PRODUCTS.length / PAGE_SIZE));
  const visible = PRODUCTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function onAdd(id) {
    console.log("add to cart:", id);
  }

  return (
    <div className="mx-auto max-w-6xl p-6 text-gray-900">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Shop</h1>
        <p className="text-sm text-gray-500">Featured products</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <div
            key={p.id}
            className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex aspect-[4/3] items-center justify-center rounded-md bg-gray-100 text-5xl">
              {p.emoji}
            </div>
            <p className="text-base font-medium">{p.title}</p>
            <p className="text-sm text-gray-500">{p.description}</p>
            <div className="mt-auto flex items-center justify-between pt-4">
              <span className="text-base font-medium">\${p.price}</span>
              <button
                onClick={() => onAdd(p.id)}
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Add to cart
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <span className="text-gray-500">
          Page {page} of {totalPages} · {PRODUCTS.length} products
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
`,
      },
    ],
  },

  "plain-css": {
    notes: "Two files. Place ProductsPage.jsx and ProductsPage.css side-by-side.",
    files: [
      {
        filename: "ProductsPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";
import "./ProductsPage.css";

${PRODUCTS}

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(PRODUCTS.length / PAGE_SIZE));
  const visible = PRODUCTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function onAdd(id) {
    console.log("add to cart:", id);
  }

  return (
    <div className="shop">
      <header className="shop__header">
        <h1 className="shop__heading">Shop</h1>
        <p className="shop__sub">Featured products</p>
      </header>
      <div className="shop__grid">
        {visible.map((p) => (
          <div key={p.id} className="card">
            <div className="card__thumb">{p.emoji}</div>
            <p className="card__title">{p.title}</p>
            <p className="card__desc">{p.description}</p>
            <div className="card__footer">
              <span className="card__price">\${p.price}</span>
              <button className="card__btn" onClick={() => onAdd(p.id)}>
                Add to cart
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="shop__pager">
        <span className="shop__pageInfo">
          Page {page} of {totalPages} · {PRODUCTS.length} products
        </span>
        <div className="shop__pagerBtns">
          <button
            className="shop__pageBtn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            className="shop__pageBtn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
`,
      },
      {
        filename: "ProductsPage.css",
        language: "css",
        code: `.shop {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1.5rem;
  color: #111827;
}
.shop__header { margin-bottom: 1.5rem; }
.shop__heading { font-size: 1.5rem; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.shop__sub { font-size: 0.875rem; color: #6b7280; margin: 0.25rem 0 0; }
.shop__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) { .shop__grid { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1024px) { .shop__grid { grid-template-columns: 1fr 1fr 1fr; } }
.card {
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.card__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 4 / 3;
  background: #f3f4f6;
  border-radius: 0.375rem;
  font-size: 3rem;
  margin-bottom: 0.75rem;
}
.card__title { font-size: 1rem; font-weight: 500; margin: 0; }
.card__desc { font-size: 0.875rem; color: #6b7280; margin: 0.25rem 0 0; }
.card__footer {
  margin-top: auto;
  padding-top: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card__price { font-size: 1rem; font-weight: 500; }
.card__btn {
  background: #111827;
  color: #ffffff;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.card__btn:hover { background: #1f2937; }

.shop__pager {
  margin-top: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
}
.shop__pageInfo { color: #6b7280; }
.shop__pagerBtns { display: flex; align-items: center; gap: 0.5rem; }
.shop__pageBtn {
  border: 1px solid #d1d5db;
  background: #ffffff;
  border-radius: 0.375rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
}
.shop__pageBtn:hover:not(:disabled) { background: #f9fafb; }
.shop__pageBtn:disabled { opacity: 0.5; cursor: not-allowed; }
`,
      },
    ],
  },

  "shadcn-css": {
    notes:
      "Shadcn primitives + colocated CSS (no Tailwind).\nInstall: npx shadcn@latest add card button\nPlace ProductsPage.tsx and ProductsPage.css together.",
    files: [
      {
        filename: "ProductsPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import "./ProductsPage.css";

${PRODUCTS}

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(PRODUCTS.length / PAGE_SIZE));
  const visible = PRODUCTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function onAdd(id: number) {
    console.log("add to cart:", id);
  }

  return (
    <div className="shop">
      <header className="shop__header">
        <h1 className="shop__heading">Shop</h1>
        <p className="shop__sub">Featured products</p>
      </header>
      <div className="shop__grid">
        {visible.map((p) => (
          <Card key={p.id} className="card">
            <CardHeader>
              <div className="card__thumb">{p.emoji}</div>
              <CardTitle>{p.title}</CardTitle>
              <CardDescription>{p.description}</CardDescription>
            </CardHeader>
            <CardContent />
            <CardFooter className="card__footer">
              <span className="card__price">\${p.price}</span>
              <Button onClick={() => onAdd(p.id)}>Add to cart</Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="shop__pager">
        <span className="shop__pageInfo">
          Page {page} of {totalPages} · {PRODUCTS.length} products
        </span>
        <div className="shop__pagerBtns">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
`,
      },
      {
        filename: "ProductsPage.css",
        language: "css",
        code: `.shop {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1.5rem;
}
.shop__header { margin-bottom: 1.5rem; }
.shop__heading { font-size: 1.5rem; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.shop__sub { font-size: 0.875rem; color: hsl(var(--muted-foreground)); margin: 0.25rem 0 0; }
.shop__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) { .shop__grid { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1024px) { .shop__grid { grid-template-columns: 1fr 1fr 1fr; } }
.card { display: flex; flex-direction: column; }
.card__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 4 / 3;
  background: hsl(var(--muted));
  border-radius: 0.375rem;
  font-size: 3rem;
  margin-bottom: 0.5rem;
}
.card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card__price { font-size: 1rem; font-weight: 500; }

.shop__pager {
  margin-top: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
}
.shop__pageInfo { color: hsl(var(--muted-foreground)); }
.shop__pagerBtns { display: flex; align-items: center; gap: 0.5rem; }
`,
      },
    ],
  },
};
