"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function validate(form: { email: string; password: string }) {
  const e: { email?: string; password?: string } = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";
  if (form.password.length < 8) e.password = "Must be at least 8 characters";
  return e;
}

export default function LoginPreview() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function set<K extends "email" | "password">(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="bg-muted/30 flex items-center justify-center rounded-md p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-5">
          <header className="mb-5 text-center">
            <h2 className="text-base font-semibold">Welcome back</h2>
            <p className="text-muted-foreground mt-1 text-xs">Sign in to continue.</p>
          </header>

          {done ? (
            <p className="text-sm">Signed in. Redirecting…</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="lp-email" className="text-xs">Email</Label>
                <Input
                  id="lp-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  aria-invalid={!!errors.email}
                />
                {errors.email ? <p className="text-destructive text-[11px]">{errors.email}</p> : null}
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="lp-password" className="text-xs">Password</Label>
                <div className="relative">
                  <Input
                    id="lp-password"
                    type={show ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    aria-invalid={!!errors.password}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {errors.password ? <p className="text-destructive text-[11px]">{errors.password}</p> : null}
              </div>

              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
                <span>Remember me</span>
              </label>

              <Button type="submit" size="sm" disabled={submitting} className="w-full">
                {submitting ? "Signing in…" : "Sign in"}
              </Button>

              <p className="text-muted-foreground text-center text-xs">
                Don&apos;t have an account?{" "}
                <span className="text-foreground font-medium">Create one</span>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
