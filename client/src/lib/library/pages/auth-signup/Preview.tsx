"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMPTY = { name: "", email: "", password: "", confirm: "", accept: false };

type Errors = Partial<Record<"name" | "email" | "password" | "confirm" | "accept", string>>;

function validate(form: typeof EMPTY): Errors {
  const e: Errors = {};
  if (form.name.trim().length < 2) e.name = "Enter your full name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";
  if (form.password.length < 8) e.password = "Must be at least 8 characters";
  if (form.confirm !== form.password) e.confirm = "Passwords don't match";
  if (!form.accept) e.accept = "Please accept the terms";
  return e;
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const label = ["Too short", "Weak", "Okay", "Good", "Strong"][s] ?? "";
  return { score: s, label };
}

const BAR_COLORS = ["#e5e7eb", "#ef4444", "#f97316", "#eab308", "#10b981"];

export default function SignupPreview() {
  const [form, setForm] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const meter = useMemo(() => strength(form.password), [form.password]);

  function set<K extends keyof typeof EMPTY>(k: K, v: typeof EMPTY[K]) {
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
            <h2 className="text-base font-semibold">Create your account</h2>
            <p className="text-muted-foreground mt-1 text-xs">Takes less than a minute.</p>
          </header>

          {done ? (
            <p className="text-sm">Account created. Check your email to verify.</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label="Full name" error={errors.name}>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
              </Field>

              <Field label="Password" error={errors.password}>
                <div className="relative">
                  <Input
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
                {form.password ? (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex flex-1 gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className="h-1 flex-1 rounded-full"
                          style={{ background: i <= meter.score ? BAR_COLORS[meter.score] : "#e5e7eb" }}
                        />
                      ))}
                    </div>
                    <span className="text-muted-foreground text-[10px]">{meter.label}</span>
                  </div>
                ) : null}
              </Field>

              <Field label="Confirm password" error={errors.confirm}>
                <Input
                  type={show ? "text" : "password"}
                  value={form.confirm}
                  onChange={(e) => set("confirm", e.target.value)}
                  aria-invalid={!!errors.confirm}
                />
              </Field>

              <label className="flex items-start gap-2 text-xs">
                <Checkbox
                  checked={form.accept}
                  onCheckedChange={(v) => set("accept", Boolean(v))}
                  aria-invalid={!!errors.accept}
                />
                <span>
                  I agree to the <span className="font-medium">Terms</span> and{" "}
                  <span className="font-medium">Privacy Policy</span>.
                </span>
              </label>
              {errors.accept ? <p className="text-destructive -mt-1 text-[11px]">{errors.accept}</p> : null}

              <Button type="submit" size="sm" disabled={submitting} className="w-full">
                {submitting ? "Creating…" : "Create account"}
              </Button>

              <p className="text-muted-foreground text-center text-xs">
                Already have an account?{" "}
                <span className="text-foreground font-medium">Sign in</span>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {error ? <p className="text-destructive text-[11px]">{error}</p> : null}
    </div>
  );
}
