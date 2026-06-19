"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const INITIAL_CART = [
  { id: 1, title: "Aeris Headphones", price: 199, qty: 1, emoji: "🎧" },
  { id: 2, title: "Nimbus Speaker", price: 129, qty: 2, emoji: "🔊" },
  { id: 5, title: "Orbit Mouse", price: 49, qty: 1, emoji: "🖱️" },
];

export default function CartPreview() {
  const [cart, setCart] = useState(INITIAL_CART);

  function setQty(id: number, delta: number) {
    setCart((prev) =>
      prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)),
    );
  }
  function remove(id: number) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = cart.length === 0 ? 0 : 6;
  const total = subtotal + shipping;

  return (
    <div className="grid gap-4 p-2 lg:grid-cols-[1fr_16rem]">
      <section>
        {cart.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm font-medium">Your cart is empty</p>
            <p className="text-muted-foreground mt-1 text-xs">Add a product to get started.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {cart.map((i) => (
              <li key={i.id}>
                <Card>
                  <CardContent className="flex items-center gap-2 p-3">
                    <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-md text-lg">
                      {i.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.title}</p>
                      <p className="text-muted-foreground text-xs">${i.price.toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.id, -1)} aria-label="Decrease">−</Button>
                      <span className="w-6 text-center text-xs tabular-nums">{i.qty}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.id, +1)} aria-label="Increase">+</Button>
                    </div>
                    <span className="w-16 text-right text-xs font-medium tabular-nums">
                      ${(i.price * i.qty).toFixed(2)}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => remove(i.id)}>Remove</Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside>
        <Card>
          <CardContent className="flex flex-col gap-2 p-3">
            <h3 className="text-sm font-semibold">Order summary</h3>
            <Row label="Subtotal" value={subtotal} />
            <Row label="Shipping" value={shipping} />
            <div className="border-t pt-2">
              <Row label="Total" value={total} bold />
            </div>
            <Button size="sm" className="mt-2 w-full" disabled={cart.length === 0}>
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
    <div className={"flex items-center justify-between text-xs" + (bold ? " font-semibold" : "")}>
      <span>{label}</span>
      <span className="tabular-nums">${value.toFixed(2)}</span>
    </div>
  );
}
