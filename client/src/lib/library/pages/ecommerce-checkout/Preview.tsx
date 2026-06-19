"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ITEMS = [
  { id: 1, title: "Aeris Headphones", price: 199, qty: 1 },
  { id: 2, title: "Nimbus Speaker", price: 129, qty: 2 },
];
const SHIPPING = 6;

interface Form {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  zip: string;
  country: string;
}
const EMPTY: Form = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  zip: "",
  country: "United States",
};

function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) e.name = "Required";
  if (!f.line1.trim()) e.line1 = "Required";
  if (!f.city.trim()) e.city = "Required";
  if (!f.region.trim()) e.region = "Required";
  if (!/^[A-Za-z0-9 -]{3,10}$/.test(f.zip.trim())) e.zip = "Invalid postal code";
  if (!f.country.trim()) e.country = "Required";
  return e;
}

export default function CheckoutPreview() {
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
    if (Object.keys(eMap).length === 0) setSubmitted(true);
  }

  const subtotal = ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + SHIPPING;

  return (
    <div className="grid gap-4 p-2 lg:grid-cols-[1fr_16rem]">
      <Card>
        <CardContent className="p-4">
          {submitted ? (
            <p className="text-sm">Thanks — your order was placed.</p>
          ) : (
            <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" error={errors.name} span2>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
              </Field>
              <Field label="Address" error={errors.line1} span2>
                <Input value={form.line1} onChange={(e) => set("line1", e.target.value)} aria-invalid={!!errors.line1} />
              </Field>
              <Field label="City" error={errors.city}>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} aria-invalid={!!errors.city} />
              </Field>
              <Field label="Region" error={errors.region}>
                <Input value={form.region} onChange={(e) => set("region", e.target.value)} aria-invalid={!!errors.region} />
              </Field>
              <Field label="ZIP" error={errors.zip}>
                <Input value={form.zip} onChange={(e) => set("zip", e.target.value)} aria-invalid={!!errors.zip} />
              </Field>
              <Field label="Country" error={errors.country}>
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} aria-invalid={!!errors.country} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" className="w-full">Checkout</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <aside>
        <Card>
          <CardContent className="flex flex-col gap-2 p-3">
            <h3 className="text-sm font-semibold">Order summary</h3>
            <ul className="flex flex-col gap-1">
              {ITEMS.map((i) => (
                <li key={i.id} className="flex justify-between text-xs">
                  <span className="truncate">{i.title} × {i.qty}</span>
                  <span className="tabular-nums">${(i.price * i.qty).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t pt-2 text-xs">
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
    <div className={"flex flex-col gap-1 " + (span2 ? "sm:col-span-2" : "")}>
      <Label className="text-xs">{label}</Label>
      {children}
      {error ? <p className="text-destructive text-[11px]">{error}</p> : null}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={"flex items-center justify-between py-0.5" + (bold ? " font-semibold" : "")}>
      <span>{label}</span>
      <span className="tabular-nums">${value.toFixed(2)}</span>
    </div>
  );
}
