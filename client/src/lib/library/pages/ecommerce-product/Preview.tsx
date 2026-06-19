"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PRODUCTS = [
  { id: 1, title: "Aeris Headphones", description: "Wireless, 40h battery", price: 199, emoji: "🎧" },
  { id: 2, title: "Nimbus Speaker", description: "Portable, room-filling", price: 129, emoji: "🔊" },
  { id: 3, title: "Vega Smartwatch", description: "Always-on display, GPS", price: 249, emoji: "⌚" },
  { id: 4, title: "Lumen Desk Lamp", description: "Warm/cool, dimmable", price: 79, emoji: "💡" },
  { id: 5, title: "Orbit Mouse", description: "Ergonomic, silent click", price: 49, emoji: "🖱️" },
  { id: 6, title: "Pebble Keyboard", description: "Low-profile mechanical", price: 139, emoji: "⌨️" },
];

const PAGE_SIZE = 3;

export default function ProductsPreview() {
  const [last, setLast] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(PRODUCTS.length / PAGE_SIZE));
  const visible = PRODUCTS.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function onAdd(id: number) {
    const p = PRODUCTS.find((x) => x.id === id);
    setLast(p ? `Added “${p.title}” to cart` : null);
  }

  return (
    <div className="p-2">
      {last ? (
        <p className="text-muted-foreground mb-3 text-xs">{last}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <CardHeader>
              <div className="bg-muted text-muted-foreground mb-2 flex aspect-[4/3] items-center justify-center rounded-md text-4xl">
                {p.emoji}
              </div>
              <CardTitle className="text-sm">{p.title}</CardTitle>
              <CardDescription className="text-xs">{p.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto" />
            <CardFooter className="flex items-center justify-between">
              <span className="text-sm font-medium">${p.price}</span>
              <Button size="sm" onClick={() => onAdd(p.id)}>
                Add to cart
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
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
