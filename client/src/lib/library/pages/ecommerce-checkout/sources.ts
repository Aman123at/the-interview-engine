import type { ReactVariantSources } from "../../types";

const ITEMS = `const ITEMS = [
  { id: 1, title: "Aeris Headphones", price: 199, qty: 1 },
  { id: 2, title: "Nimbus Speaker",   price: 129, qty: 2 },
];
const SHIPPING = 6;`;

const VALIDATE_TS = `interface Form {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  zip: string;
  country: string;
}
const EMPTY: Form = { name: "", line1: "", line2: "", city: "", region: "", zip: "", country: "United States" };

function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) e.name = "Required";
  if (!f.line1.trim()) e.line1 = "Required";
  if (!f.city.trim()) e.city = "Required";
  if (!f.region.trim()) e.region = "Required";
  if (!/^[A-Za-z0-9 \\-]{3,10}$/.test(f.zip.trim())) e.zip = "Invalid postal code";
  if (!f.country.trim()) e.country = "Required";
  return e;
}`;

const VALIDATE_JS = `const EMPTY = { name: "", line1: "", line2: "", city: "", region: "", zip: "", country: "United States" };

function validate(f) {
  const e = {};
  if (!f.name.trim()) e.name = "Required";
  if (!f.line1.trim()) e.line1 = "Required";
  if (!f.city.trim()) e.city = "Required";
  if (!f.region.trim()) e.region = "Required";
  if (!/^[A-Za-z0-9 \\-]{3,10}$/.test(f.zip.trim())) e.zip = "Invalid postal code";
  if (!f.country.trim()) e.country = "Required";
  return e;
}`;

export const sources: ReactVariantSources = {
  "shadcn-tailwind": {
    notes: "Install: npx shadcn@latest add card button input label\nPlace under src/CheckoutPage.tsx.",
    files: [
      {
        filename: "CheckoutPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

${ITEMS}

${VALIDATE_TS}

export default function CheckoutPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitted, setSubmitted] = useState(false);

  function set<K extends keyof Form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length === 0) {
      setSubmitted(true);
      // Dummy submit — wire to your checkout API here.
      console.log("checkout:", form);
    }
  }

  const subtotal = ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + SHIPPING;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-[1fr_18rem]">
      <Card>
        <CardContent className="p-6">
          <h1 className="mb-4 text-2xl font-semibold tracking-tight">Checkout</h1>
          {submitted ? (
            <p className="text-sm">Thanks — your order was placed.</p>
          ) : (
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={errors.name} className="sm:col-span-2">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
              </Field>
              <Field label="Address line 1" error={errors.line1} className="sm:col-span-2">
                <Input value={form.line1} onChange={(e) => set("line1", e.target.value)} aria-invalid={!!errors.line1} />
              </Field>
              <Field label="Address line 2 (optional)" className="sm:col-span-2">
                <Input value={form.line2} onChange={(e) => set("line2", e.target.value)} />
              </Field>
              <Field label="City" error={errors.city}>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} aria-invalid={!!errors.city} />
              </Field>
              <Field label="State / Region" error={errors.region}>
                <Input value={form.region} onChange={(e) => set("region", e.target.value)} aria-invalid={!!errors.region} />
              </Field>
              <Field label="ZIP / Postal code" error={errors.zip}>
                <Input value={form.zip} onChange={(e) => set("zip", e.target.value)} aria-invalid={!!errors.zip} />
              </Field>
              <Field label="Country" error={errors.country}>
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} aria-invalid={!!errors.country} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" className="w-full">Checkout</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <h2 className="text-base font-semibold">Order summary</h2>
            <ul className="flex flex-col gap-1">
              {ITEMS.map((i) => (
                <li key={i.id} className="flex justify-between text-sm">
                  <span className="truncate">{i.title} × {i.qty}</span>
                  <span className="tabular-nums">\${(i.price * i.qty).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t pt-3 text-sm">
              <Row label="Subtotal" value={subtotal} />
              <Row label="Shipping" value={SHIPPING} />
              <Row label="Total" value={total} bold />
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={"flex flex-col gap-1.5 " + (className ?? "")}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={"flex items-center justify-between py-0.5" + (bold ? " font-semibold" : "")}>
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
    notes: "No shadcn — native elements + Tailwind. Place under src/CheckoutPage.jsx.",
    files: [
      {
        filename: "CheckoutPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";

${ITEMS}

${VALIDATE_JS}

export default function CheckoutPage() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onSubmit(e) {
    e.preventDefault();
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length === 0) {
      setSubmitted(true);
      console.log("checkout:", form);
    }
  }

  const subtotal = ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + SHIPPING;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-6 text-gray-900 lg:grid-cols-[1fr_18rem]">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">Checkout</h1>
        {submitted ? (
          <p className="text-sm">Thanks — your order was placed.</p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.name} span2>
              <input className="inp" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Address line 1" error={errors.line1} span2>
              <input className="inp" value={form.line1} onChange={(e) => set("line1", e.target.value)} />
            </Field>
            <Field label="Address line 2 (optional)" span2>
              <input className="inp" value={form.line2} onChange={(e) => set("line2", e.target.value)} />
            </Field>
            <Field label="City" error={errors.city}>
              <input className="inp" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="State / Region" error={errors.region}>
              <input className="inp" value={form.region} onChange={(e) => set("region", e.target.value)} />
            </Field>
            <Field label="ZIP / Postal code" error={errors.zip}>
              <input className="inp" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
            </Field>
            <Field label="Country" error={errors.country}>
              <input className="inp" value={form.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Checkout
              </button>
            </div>

            {/* Tailwind doesn't support :where for arbitrary class composition; declared inline via a single utility selector reused with a custom class. */}
            <style>{\`.inp{width:100%;border:1px solid #d1d5db;border-radius:0.375rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none;background:#fff}.inp:focus{border-color:#6b7280;box-shadow:0 0 0 2px #e5e7eb}\`}</style>
          </form>
        )}
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Order summary</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {ITEMS.map((i) => (
              <li key={i.id} className="flex justify-between text-sm">
                <span className="truncate">{i.title} × {i.qty}</span>
                <span className="tabular-nums">\${(i.price * i.qty).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-gray-200 pt-3 text-sm">
            <Row label="Subtotal" value={subtotal} />
            <Row label="Shipping" value={SHIPPING} />
            <Row label="Total" value={total} bold />
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, error, span2, children }) {
  return (
    <div className={"flex flex-col gap-1.5 " + (span2 ? "sm:col-span-2" : "")}>
      <label className="text-xs font-medium">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={"flex items-center justify-between py-0.5 " + (bold ? "font-semibold" : "")}>
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
    notes: "Two files. Place CheckoutPage.jsx and CheckoutPage.css side-by-side.",
    files: [
      {
        filename: "CheckoutPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";
import "./CheckoutPage.css";

${ITEMS}

${VALIDATE_JS}

export default function CheckoutPage() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onSubmit(e) {
    e.preventDefault();
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length === 0) {
      setSubmitted(true);
      console.log("checkout:", form);
    }
  }

  const subtotal = ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + SHIPPING;

  return (
    <div className="co">
      <div className="co__card">
        <h1 className="co__heading">Checkout</h1>
        {submitted ? (
          <p className="co__done">Thanks — your order was placed.</p>
        ) : (
          <form onSubmit={onSubmit} className="co__form">
            <Field label="Full name" error={errors.name} span2>
              <input className="co__inp" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Address line 1" error={errors.line1} span2>
              <input className="co__inp" value={form.line1} onChange={(e) => set("line1", e.target.value)} />
            </Field>
            <Field label="Address line 2 (optional)" span2>
              <input className="co__inp" value={form.line2} onChange={(e) => set("line2", e.target.value)} />
            </Field>
            <Field label="City" error={errors.city}>
              <input className="co__inp" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="State / Region" error={errors.region}>
              <input className="co__inp" value={form.region} onChange={(e) => set("region", e.target.value)} />
            </Field>
            <Field label="ZIP / Postal code" error={errors.zip}>
              <input className="co__inp" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
            </Field>
            <Field label="Country" error={errors.country}>
              <input className="co__inp" value={form.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
            <div className="co__field co__field--span2">
              <button type="submit" className="co__submit">Checkout</button>
            </div>
          </form>
        )}
      </div>

      <aside className="co__aside">
        <div className="summary">
          <h2 className="summary__heading">Order summary</h2>
          <ul className="summary__items">
            {ITEMS.map((i) => (
              <li key={i.id} className="summary__item">
                <span className="summary__name">{i.title} × {i.qty}</span>
                <span className="summary__num">\${(i.price * i.qty).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="summary__totals">
            <Row label="Subtotal" value={subtotal} />
            <Row label="Shipping" value={SHIPPING} />
            <Row label="Total" value={total} bold />
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, error, span2, children }) {
  return (
    <div className={"co__field" + (span2 ? " co__field--span2" : "")}>
      <label className="co__label">{label}</label>
      {children}
      {error ? <p className="co__err">{error}</p> : null}
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
        filename: "CheckoutPage.css",
        language: "css",
        code: `.co {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: grid;
  gap: 1.5rem;
  color: #111827;
}
@media (min-width: 1024px) {
  .co { grid-template-columns: 1fr 18rem; }
}
.co__card {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.co__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 1rem;
}
.co__done { font-size: 0.875rem; margin: 0; }
.co__form {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) { .co__form { grid-template-columns: 1fr 1fr; } }
.co__field { display: flex; flex-direction: column; gap: 0.375rem; }
.co__field--span2 { grid-column: 1 / -1; }
.co__label { font-size: 0.75rem; font-weight: 500; }
.co__inp {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  outline: none;
  background: #ffffff;
}
.co__inp:focus { border-color: #6b7280; box-shadow: 0 0 0 2px #e5e7eb; }
.co__err { font-size: 0.75rem; color: #dc2626; margin: 0; }
.co__submit {
  width: 100%;
  background: #111827;
  color: #ffffff;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.co__submit:hover { background: #1f2937; }

.co__aside { align-self: start; }
@media (min-width: 1024px) {
  .co__aside { position: sticky; top: 1.5rem; }
}
.summary {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.summary__heading { font-size: 1rem; font-weight: 600; margin: 0; }
.summary__items {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.summary__item {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}
.summary__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.summary__totals {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e5e7eb;
  font-size: 0.875rem;
}
.summary__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.125rem 0;
}
.summary__row--bold { font-weight: 600; }
.summary__num { font-variant-numeric: tabular-nums; }
`,
      },
    ],
  },

  "shadcn-css": {
    notes:
      "Shadcn primitives + colocated CSS (no Tailwind).\nInstall: npx shadcn@latest add card button input label\nPlace CheckoutPage.tsx and CheckoutPage.css together.",
    files: [
      {
        filename: "CheckoutPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./CheckoutPage.css";

${ITEMS}

${VALIDATE_TS}

export default function CheckoutPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitted, setSubmitted] = useState(false);

  function set<K extends keyof Form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length === 0) {
      setSubmitted(true);
      console.log("checkout:", form);
    }
  }

  const subtotal = ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + SHIPPING;

  return (
    <div className="co">
      <Card>
        <CardContent className="co__card">
          <h1 className="co__heading">Checkout</h1>
          {submitted ? (
            <p className="co__done">Thanks — your order was placed.</p>
          ) : (
            <form onSubmit={onSubmit} className="co__form">
              <Field label="Full name" error={errors.name} span2>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
              </Field>
              <Field label="Address line 1" error={errors.line1} span2>
                <Input value={form.line1} onChange={(e) => set("line1", e.target.value)} aria-invalid={!!errors.line1} />
              </Field>
              <Field label="Address line 2 (optional)" span2>
                <Input value={form.line2} onChange={(e) => set("line2", e.target.value)} />
              </Field>
              <Field label="City" error={errors.city}>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} aria-invalid={!!errors.city} />
              </Field>
              <Field label="State / Region" error={errors.region}>
                <Input value={form.region} onChange={(e) => set("region", e.target.value)} aria-invalid={!!errors.region} />
              </Field>
              <Field label="ZIP / Postal code" error={errors.zip}>
                <Input value={form.zip} onChange={(e) => set("zip", e.target.value)} aria-invalid={!!errors.zip} />
              </Field>
              <Field label="Country" error={errors.country}>
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} aria-invalid={!!errors.country} />
              </Field>
              <div className="co__field co__field--span2">
                <Button type="submit" className="co__submit">Checkout</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <aside className="co__aside">
        <Card>
          <CardContent className="summary">
            <h2 className="summary__heading">Order summary</h2>
            <ul className="summary__items">
              {ITEMS.map((i) => (
                <li key={i.id} className="summary__item">
                  <span className="summary__name">{i.title} × {i.qty}</span>
                  <span className="summary__num">\${(i.price * i.qty).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="summary__totals">
              <Row label="Subtotal" value={subtotal} />
              <Row label="Shipping" value={SHIPPING} />
              <Row label="Total" value={total} bold />
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Field({
  label,
  error,
  span2,
  children,
}: {
  label: string;
  error?: string;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={"co__field" + (span2 ? " co__field--span2" : "")}>
      <Label className="co__label">{label}</Label>
      {children}
      {error ? <p className="co__err">{error}</p> : null}
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
        filename: "CheckoutPage.css",
        language: "css",
        code: `.co {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: grid;
  gap: 1.5rem;
}
@media (min-width: 1024px) {
  .co { grid-template-columns: 1fr 18rem; }
}
.co__card { padding: 1.5rem; }
.co__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 1rem;
}
.co__done { font-size: 0.875rem; margin: 0; }
.co__form {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) { .co__form { grid-template-columns: 1fr 1fr; } }
.co__field { display: flex; flex-direction: column; gap: 0.375rem; }
.co__field--span2 { grid-column: 1 / -1; }
.co__label { font-size: 0.75rem; font-weight: 500; }
.co__err {
  font-size: 0.75rem;
  color: hsl(var(--destructive));
  margin: 0;
}
.co__submit { width: 100%; }

.co__aside { align-self: start; }
@media (min-width: 1024px) {
  .co__aside { position: sticky; top: 1.5rem; }
}
.summary { padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
.summary__heading { font-size: 1rem; font-weight: 600; margin: 0; }
.summary__items {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.summary__item { display: flex; justify-content: space-between; font-size: 0.875rem; }
.summary__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.summary__totals {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid hsl(var(--border));
  font-size: 0.875rem;
}
.summary__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.125rem 0;
}
.summary__row--bold { font-weight: 600; }
.summary__num { font-variant-numeric: tabular-nums; }
`,
      },
    ],
  },
};
