import type { ReactVariantSources } from "../../types";

const INIT = `const INITIAL_CART = [
  { id: 1, title: "Aeris Headphones", price: 199, qty: 1, emoji: "🎧" },
  { id: 2, title: "Nimbus Speaker",   price: 129, qty: 2, emoji: "🔊" },
  { id: 5, title: "Orbit Mouse",      price:  49, qty: 1, emoji: "🖱️" },
];`;

const HANDLERS_TS = `function setQty(id: number, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
    );
  }
  function remove(id: number) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = cart.length === 0 ? 0 : 6;
  const total = subtotal + shipping;`;

const HANDLERS_JS = `function setQty(id, delta) {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
    );
  }
  function remove(id) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = cart.length === 0 ? 0 : 6;
  const total = subtotal + shipping;`;

export const sources: ReactVariantSources = {
  "shadcn-tailwind": {
    notes: "Install: npx shadcn@latest add card button\nPlace under src/CartPage.tsx.",
    files: [
      {
        filename: "CartPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

${INIT}

export default function CartPage() {
  const [cart, setCart] = useState(INITIAL_CART);

  ${HANDLERS_TS}

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-[1fr_18rem]">
      <section>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">Your cart</h1>
        {cart.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-sm font-medium">Your cart is empty</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Add a product to get started.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cart.map((i) => (
              <li key={i.id}>
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-md text-2xl">
                      {i.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.title}</p>
                      <p className="text-muted-foreground text-xs">\${i.price.toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" onClick={() => setQty(i.id, -1)} aria-label="Decrease">−</Button>
                      <span className="w-8 text-center text-sm tabular-nums">{i.qty}</span>
                      <Button size="icon" variant="outline" onClick={() => setQty(i.id, +1)} aria-label="Increase">+</Button>
                    </div>
                    <span className="w-20 text-right text-sm font-medium tabular-nums">
                      \${(i.price * i.qty).toFixed(2)}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => remove(i.id)}>Remove</Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <h2 className="text-base font-semibold">Order summary</h2>
            <Row label="Subtotal" value={subtotal} />
            <Row label="Shipping" value={shipping} />
            <div className="border-t pt-3">
              <Row label="Total" value={total} bold />
            </div>
            <Button className="mt-2 w-full" disabled={cart.length === 0}>
              Checkout
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={"flex items-center justify-between text-sm" + (bold ? " font-semibold" : "")}>
      <span>{label}</span>
      <span className="tabular-nums">\${value.toFixed(2)}</span>
    </div>
  );
}
`,
      },
    ],
  },

  "plain-tailwind": {
    notes: "No shadcn — native elements + Tailwind utilities. Place under src/CartPage.jsx.",
    files: [
      {
        filename: "CartPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";

${INIT}

export default function CartPage() {
  const [cart, setCart] = useState(INITIAL_CART);

  ${HANDLERS_JS}

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-6 text-gray-900 lg:grid-cols-[1fr_18rem]">
      <section>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">Your cart</h1>
        {cart.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
            <p className="text-sm font-medium">Your cart is empty</p>
            <p className="mt-1 text-xs text-gray-500">Add a product to get started.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cart.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-gray-100 text-2xl">
                  {i.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.title}</p>
                  <p className="text-xs text-gray-500">\${i.price.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="h-8 w-8 rounded-md border border-gray-300 hover:bg-gray-50" onClick={() => setQty(i.id, -1)}>−</button>
                  <span className="w-8 text-center text-sm tabular-nums">{i.qty}</span>
                  <button className="h-8 w-8 rounded-md border border-gray-300 hover:bg-gray-50" onClick={() => setQty(i.id, +1)}>+</button>
                </div>
                <span className="w-20 text-right text-sm font-medium tabular-nums">
                  \${(i.price * i.qty).toFixed(2)}
                </span>
                <button className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" onClick={() => remove(i.id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Order summary</h2>
          <Row label="Subtotal" value={subtotal} />
          <Row label="Shipping" value={shipping} />
          <div className="mt-2 border-t border-gray-200 pt-3">
            <Row label="Total" value={total} bold />
          </div>
          <button
            disabled={cart.length === 0}
            className="mt-3 w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Checkout
          </button>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={"flex items-center justify-between text-sm py-1 " + (bold ? "font-semibold" : "")}>
      <span>{label}</span>
      <span className="tabular-nums">\${value.toFixed(2)}</span>
    </div>
  );
}
`,
      },
    ],
  },

  "plain-css": {
    notes: "Two files. Place CartPage.jsx and CartPage.css side-by-side.",
    files: [
      {
        filename: "CartPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";
import "./CartPage.css";

${INIT}

export default function CartPage() {
  const [cart, setCart] = useState(INITIAL_CART);

  ${HANDLERS_JS}

  return (
    <div className="cart">
      <section>
        <h1 className="cart__heading">Your cart</h1>
        {cart.length === 0 ? (
          <div className="cart__empty">
            <p className="cart__emptyTitle">Your cart is empty</p>
            <p className="cart__emptySub">Add a product to get started.</p>
          </div>
        ) : (
          <ul className="cart__list">
            {cart.map((i) => (
              <li key={i.id} className="cart__row">
                <div className="cart__thumb">{i.emoji}</div>
                <div className="cart__rowMain">
                  <p className="cart__title">{i.title}</p>
                  <p className="cart__each">\${i.price.toFixed(2)} each</p>
                </div>
                <div className="cart__stepper">
                  <button className="cart__step" onClick={() => setQty(i.id, -1)}>−</button>
                  <span className="cart__qty">{i.qty}</span>
                  <button className="cart__step" onClick={() => setQty(i.id, +1)}>+</button>
                </div>
                <span className="cart__line">\${(i.price * i.qty).toFixed(2)}</span>
                <button className="cart__remove" onClick={() => remove(i.id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="cart__aside">
        <div className="summary">
          <h2 className="summary__heading">Order summary</h2>
          <Row label="Subtotal" value={subtotal} />
          <Row label="Shipping" value={shipping} />
          <div className="summary__totalWrap">
            <Row label="Total" value={total} bold />
          </div>
          <button className="summary__checkout" disabled={cart.length === 0}>Checkout</button>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={"summary__row" + (bold ? " summary__row--bold" : "")}>
      <span>{label}</span>
      <span className="summary__num">\${value.toFixed(2)}</span>
    </div>
  );
}
`,
      },
      {
        filename: "CartPage.css",
        language: "css",
        code: `.cart {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: grid;
  gap: 1.5rem;
  color: #111827;
}
@media (min-width: 1024px) {
  .cart { grid-template-columns: 1fr 18rem; }
}
.cart__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 1rem;
}
.cart__empty {
  border: 1px dashed #d1d5db;
  border-radius: 0.5rem;
  padding: 2.5rem;
  text-align: center;
}
.cart__emptyTitle { font-size: 0.875rem; font-weight: 500; margin: 0; }
.cart__emptySub  { font-size: 0.75rem; color: #6b7280; margin: 0.25rem 0 0; }
.cart__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.cart__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.cart__thumb {
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border-radius: 0.375rem;
  font-size: 1.5rem;
}
.cart__rowMain { min-width: 0; flex: 1; }
.cart__title {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cart__each { font-size: 0.75rem; color: #6b7280; margin: 0; }
.cart__stepper { display: flex; align-items: center; gap: 0.25rem; }
.cart__step {
  width: 2rem;
  height: 2rem;
  border: 1px solid #d1d5db;
  background: #ffffff;
  border-radius: 0.375rem;
  cursor: pointer;
}
.cart__step:hover { background: #f9fafb; }
.cart__qty { width: 2rem; text-align: center; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
.cart__line { width: 5rem; text-align: right; font-size: 0.875rem; font-weight: 500; font-variant-numeric: tabular-nums; }
.cart__remove {
  background: transparent;
  border: 0;
  color: #4b5563;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  cursor: pointer;
}
.cart__remove:hover { background: #f3f4f6; }

.cart__aside { align-self: start; }
@media (min-width: 1024px) {
  .cart__aside { position: sticky; top: 1.5rem; }
}
.summary {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.summary__heading { font-size: 1rem; font-weight: 600; margin: 0 0 0.5rem; }
.summary__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
  padding: 0.25rem 0;
}
.summary__row--bold { font-weight: 600; }
.summary__num { font-variant-numeric: tabular-nums; }
.summary__totalWrap {
  border-top: 1px solid #e5e7eb;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
}
.summary__checkout {
  width: 100%;
  margin-top: 0.75rem;
  background: #111827;
  color: #ffffff;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.summary__checkout:disabled { opacity: 0.5; cursor: not-allowed; }
.summary__checkout:not(:disabled):hover { background: #1f2937; }
`,
      },
    ],
  },

  "shadcn-css": {
    notes:
      "Shadcn primitives + colocated CSS (no Tailwind).\nInstall: npx shadcn@latest add card button\nPlace CartPage.tsx and CartPage.css together.",
    files: [
      {
        filename: "CartPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import "./CartPage.css";

${INIT}

export default function CartPage() {
  const [cart, setCart] = useState(INITIAL_CART);

  ${HANDLERS_TS}

  return (
    <div className="cart">
      <section>
        <h1 className="cart__heading">Your cart</h1>
        {cart.length === 0 ? (
          <div className="cart__empty">
            <p className="cart__emptyTitle">Your cart is empty</p>
            <p className="cart__emptySub">Add a product to get started.</p>
          </div>
        ) : (
          <ul className="cart__list">
            {cart.map((i) => (
              <li key={i.id}>
                <Card>
                  <CardContent className="cart__row">
                    <div className="cart__thumb">{i.emoji}</div>
                    <div className="cart__rowMain">
                      <p className="cart__title">{i.title}</p>
                      <p className="cart__each">\${i.price.toFixed(2)} each</p>
                    </div>
                    <div className="cart__stepper">
                      <Button size="icon" variant="outline" onClick={() => setQty(i.id, -1)} aria-label="Decrease">−</Button>
                      <span className="cart__qty">{i.qty}</span>
                      <Button size="icon" variant="outline" onClick={() => setQty(i.id, +1)} aria-label="Increase">+</Button>
                    </div>
                    <span className="cart__line">\${(i.price * i.qty).toFixed(2)}</span>
                    <Button size="sm" variant="ghost" onClick={() => remove(i.id)}>Remove</Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="cart__aside">
        <Card>
          <CardContent className="summary">
            <h2 className="summary__heading">Order summary</h2>
            <Row label="Subtotal" value={subtotal} />
            <Row label="Shipping" value={shipping} />
            <div className="summary__totalWrap">
              <Row label="Total" value={total} bold />
            </div>
            <Button className="summary__checkout" disabled={cart.length === 0}>Checkout</Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={"summary__row" + (bold ? " summary__row--bold" : "")}>
      <span>{label}</span>
      <span className="summary__num">\${value.toFixed(2)}</span>
    </div>
  );
}
`,
      },
      {
        filename: "CartPage.css",
        language: "css",
        code: `.cart {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: grid;
  gap: 1.5rem;
}
@media (min-width: 1024px) {
  .cart { grid-template-columns: 1fr 18rem; }
}
.cart__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 1rem;
}
.cart__empty {
  border: 1px dashed hsl(var(--border));
  border-radius: 0.5rem;
  padding: 2.5rem;
  text-align: center;
}
.cart__emptyTitle { font-size: 0.875rem; font-weight: 500; margin: 0; }
.cart__emptySub  { font-size: 0.75rem; color: hsl(var(--muted-foreground)); margin: 0.25rem 0 0; }
.cart__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.cart__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
}
.cart__thumb {
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--muted));
  border-radius: 0.375rem;
  font-size: 1.5rem;
}
.cart__rowMain { min-width: 0; flex: 1; }
.cart__title {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cart__each { font-size: 0.75rem; color: hsl(var(--muted-foreground)); margin: 0; }
.cart__stepper { display: flex; align-items: center; gap: 0.25rem; }
.cart__qty { width: 2rem; text-align: center; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
.cart__line {
  width: 5rem;
  text-align: right;
  font-size: 0.875rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.cart__aside { align-self: start; }
@media (min-width: 1024px) {
  .cart__aside { position: sticky; top: 1.5rem; }
}
.summary { padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
.summary__heading { font-size: 1rem; font-weight: 600; margin: 0 0 0.5rem; }
.summary__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
  padding: 0.25rem 0;
}
.summary__row--bold { font-weight: 600; }
.summary__num { font-variant-numeric: tabular-nums; }
.summary__totalWrap {
  border-top: 1px solid hsl(var(--border));
  margin-top: 0.5rem;
  padding-top: 0.5rem;
}
.summary__checkout { margin-top: 0.75rem; }
`,
      },
    ],
  },
};
