import type { ReactVariantSources } from "../../types";

const VALIDATE_TS = `function validate(form: { name: string; email: string; password: string; confirm: string; accept: boolean }) {
  const e: Partial<Record<"name" | "email" | "password" | "confirm" | "accept", string>> = {};
  if (form.name.trim().length < 2) e.name = "Enter your full name";
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";
  if (form.password.length < 8) e.password = "Must be at least 8 characters";
  if (form.confirm !== form.password) e.confirm = "Passwords don't match";
  if (!form.accept) e.accept = "Please accept the terms";
  return e;
}

function strength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const label = ["Too short", "Weak", "Okay", "Good", "Strong"][s] ?? "";
  return { score: s as 0 | 1 | 2 | 3 | 4, label };
}`;

const VALIDATE_JS = `function validate(form) {
  const e = {};
  if (form.name.trim().length < 2) e.name = "Enter your full name";
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";
  if (form.password.length < 8) e.password = "Must be at least 8 characters";
  if (form.confirm !== form.password) e.confirm = "Passwords don't match";
  if (!form.accept) e.accept = "Please accept the terms";
  return e;
}

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const label = ["Too short", "Weak", "Okay", "Good", "Strong"][s] ?? "";
  return { score: s, label };
}`;

const EMPTY = `const EMPTY = { name: "", email: "", password: "", confirm: "", accept: false };`;

export const sources: ReactVariantSources = {
  "shadcn-tailwind": {
    notes:
      "Install: npx shadcn@latest add card button input label checkbox\nPlace under src/SignupPage.tsx.",
    files: [
      {
        filename: "SignupPage.tsx",
        language: "tsx",
        code: `import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

${EMPTY}

${VALIDATE_TS}

const BAR_COLORS = ["bg-muted", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-emerald-500"];

export default function SignupPage() {
  const [form, setForm] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
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
    await new Promise((r) => setTimeout(r, 600));
    console.log("signup:", form);
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          <header className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Takes less than a minute.
            </p>
          </header>

          {done ? (
            <p className="text-sm">Account created. Check your email to verify.</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <Field label="Full name" error={errors.name}>
                <Input
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  aria-invalid={!!errors.name}
                />
              </Field>

              <Field label="Email" error={errors.email}>
                <Input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  aria-invalid={!!errors.email}
                />
              </Field>

              <Field label="Password" error={errors.password}>
                <div className="relative">
                  <Input
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
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
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {form.password ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex flex-1 gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className={"h-1 flex-1 rounded-full " + (i <= meter.score ? BAR_COLORS[meter.score] : "bg-muted")}
                        />
                      ))}
                    </div>
                    <span className="text-muted-foreground text-[11px]">{meter.label}</span>
                  </div>
                ) : null}
              </Field>

              <Field label="Confirm password" error={errors.confirm}>
                <Input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) => set("confirm", e.target.value)}
                  aria-invalid={!!errors.confirm}
                />
              </Field>

              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={form.accept}
                  onCheckedChange={(v) => set("accept", Boolean(v))}
                  aria-invalid={!!errors.accept}
                />
                <span>
                  I agree to the{" "}
                  <a href="/terms" className="underline-offset-2 hover:underline">Terms</a> and{" "}
                  <a href="/privacy" className="underline-offset-2 hover:underline">Privacy Policy</a>.
                </span>
              </label>
              {errors.accept ? <p className="text-destructive -mt-2 text-xs">{errors.accept}</p> : null}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Creating account…" : "Create account"}
              </Button>

              <p className="text-muted-foreground text-center text-sm">
                Already have an account?{" "}
                <a href="/login" className="text-foreground font-medium underline-offset-2 hover:underline">
                  Sign in
                </a>
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
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
`,
      },
    ],
  },

  "plain-tailwind": {
    notes: "No shadcn — native elements + Tailwind utilities. Place under src/SignupPage.jsx.",
    files: [
      {
        filename: "SignupPage.jsx",
        language: "jsx",
        code: `import { useMemo, useState } from "react";

${EMPTY}

${VALIDATE_JS}

const BAR_COLORS = ["bg-gray-200", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-emerald-500"];

export default function SignupPage() {
  const [form, setForm] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const meter = useMemo(() => strength(form.password), [form.password]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function onSubmit(e) {
    e.preventDefault();
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    console.log("signup:", form);
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-gray-900">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Takes less than a minute.</p>
        </header>

        {done ? (
          <p className="text-sm">Account created. Check your email to verify.</p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Full name" error={errors.name}>
              <input className="inp" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>

            <Field label="Email" error={errors.email}>
              <input className="inp" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>

            <Field label="Password" error={errors.password}>
              <div className="relative">
                <input
                  className="inp pr-10"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-900"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              {form.password ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <span key={i} className={"h-1 flex-1 rounded-full " + (i <= meter.score ? BAR_COLORS[meter.score] : "bg-gray-200")} />
                    ))}
                  </div>
                  <span className="text-[11px] text-gray-500">{meter.label}</span>
                </div>
              ) : null}
            </Field>

            <Field label="Confirm password" error={errors.confirm}>
              <input
                className="inp"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => set("confirm", e.target.value)}
              />
            </Field>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.accept}
                onChange={(e) => set("accept", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span>
                I agree to the{" "}
                <a href="/terms" className="hover:underline">Terms</a> and{" "}
                <a href="/privacy" className="hover:underline">Privacy Policy</a>.
              </span>
            </label>
            {errors.accept ? <p className="-mt-2 text-xs text-red-600">{errors.accept}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already have an account?{" "}
              <a href="/login" className="font-medium text-gray-900 hover:underline">Sign in</a>
            </p>

            <style>{\`.inp{width:100%;border:1px solid #d1d5db;border-radius:0.375rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none;background:#fff}.inp:focus{border-color:#6b7280;box-shadow:0 0 0 2px #e5e7eb}\`}</style>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
`,
      },
    ],
  },

  "plain-css": {
    notes: "Two files. Place SignupPage.jsx and SignupPage.css side-by-side.",
    files: [
      {
        filename: "SignupPage.jsx",
        language: "jsx",
        code: `import { useMemo, useState } from "react";
import "./SignupPage.css";

${EMPTY}

${VALIDATE_JS}

const BAR_COLORS = ["#e5e7eb", "#ef4444", "#f97316", "#eab308", "#10b981"];

export default function SignupPage() {
  const [form, setForm] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const meter = useMemo(() => strength(form.password), [form.password]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function onSubmit(e) {
    e.preventDefault();
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    console.log("signup:", form);
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <header className="auth__header">
          <h1 className="auth__title">Create your account</h1>
          <p className="auth__sub">Takes less than a minute.</p>
        </header>

        {done ? (
          <p className="auth__done">Account created. Check your email to verify.</p>
        ) : (
          <form onSubmit={onSubmit} className="auth__form">
            <Field label="Full name" error={errors.name}>
              <input className="auth__input" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>

            <Field label="Email" error={errors.email}>
              <input className="auth__input" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>

            <Field label="Password" error={errors.password}>
              <div className="auth__pwWrap">
                <input
                  className="auth__input auth__input--pw"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                />
                <button
                  type="button"
                  className="auth__toggle"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              {form.password ? (
                <div className="auth__meter">
                  <div className="auth__bars">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="auth__bar"
                        style={{ background: i <= meter.score ? BAR_COLORS[meter.score] : "#e5e7eb" }}
                      />
                    ))}
                  </div>
                  <span className="auth__meterLabel">{meter.label}</span>
                </div>
              ) : null}
            </Field>

            <Field label="Confirm password" error={errors.confirm}>
              <input
                className="auth__input"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => set("confirm", e.target.value)}
              />
            </Field>

            <label className="auth__terms">
              <input
                type="checkbox"
                checked={form.accept}
                onChange={(e) => set("accept", e.target.checked)}
              />
              <span>
                I agree to the <a className="auth__link" href="/terms">Terms</a> and{" "}
                <a className="auth__link" href="/privacy">Privacy Policy</a>.
              </span>
            </label>
            {errors.accept ? <p className="auth__err auth__err--accept">{errors.accept}</p> : null}

            <button type="submit" disabled={submitting} className="auth__submit">
              {submitting ? "Creating account…" : "Create account"}
            </button>

            <p className="auth__footer">
              Already have an account? <a href="/login" className="auth__link">Sign in</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div className="auth__field">
      <label className="auth__label">{label}</label>
      {children}
      {error ? <p className="auth__err">{error}</p> : null}
    </div>
  );
}
`,
      },
      {
        filename: "SignupPage.css",
        language: "css",
        code: `.auth {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: #f9fafb;
  color: #111827;
}
.auth__card {
  width: 100%;
  max-width: 22rem;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.auth__header { margin-bottom: 1.5rem; text-align: center; }
.auth__title { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
.auth__sub { font-size: 0.875rem; color: #6b7280; margin: 0.25rem 0 0; }
.auth__done { font-size: 0.875rem; margin: 0; }
.auth__form { display: flex; flex-direction: column; gap: 1rem; }
.auth__field { display: flex; flex-direction: column; gap: 0.375rem; }
.auth__label { font-size: 0.75rem; font-weight: 500; }
.auth__input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  outline: none;
  background: #ffffff;
}
.auth__input:focus { border-color: #6b7280; box-shadow: 0 0 0 2px #e5e7eb; }
.auth__pwWrap { position: relative; }
.auth__input--pw { padding-right: 3rem; }
.auth__toggle {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: 0;
  font-size: 0.75rem;
  color: #6b7280;
  cursor: pointer;
}
.auth__toggle:hover { color: #111827; }
.auth__err { font-size: 0.75rem; color: #dc2626; margin: 0; }
.auth__err--accept { margin-top: -0.5rem; }
.auth__meter { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem; }
.auth__bars { display: flex; flex: 1; gap: 0.25rem; }
.auth__bar { height: 4px; flex: 1; border-radius: 999px; }
.auth__meterLabel { font-size: 0.6875rem; color: #6b7280; }
.auth__terms {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.auth__submit {
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
.auth__submit:disabled { opacity: 0.5; cursor: not-allowed; }
.auth__submit:not(:disabled):hover { background: #1f2937; }
.auth__footer { text-align: center; font-size: 0.875rem; color: #6b7280; margin: 0; }
.auth__link { color: #111827; font-weight: 500; text-decoration: none; }
.auth__link:hover { text-decoration: underline; }
`,
      },
    ],
  },

  "shadcn-css": {
    notes:
      "Shadcn primitives + colocated CSS (no Tailwind).\nInstall: npx shadcn@latest add card button input label checkbox\nPlace SignupPage.tsx and SignupPage.css together.",
    files: [
      {
        filename: "SignupPage.tsx",
        language: "tsx",
        code: `import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./SignupPage.css";

${EMPTY}

${VALIDATE_TS}

const BAR_COLORS = ["#e5e7eb", "#ef4444", "#f97316", "#eab308", "#10b981"];

export default function SignupPage() {
  const [form, setForm] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
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
    await new Promise((r) => setTimeout(r, 600));
    console.log("signup:", form);
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="auth">
      <Card className="auth__card">
        <CardContent className="auth__cardInner">
          <header className="auth__header">
            <h1 className="auth__title">Create your account</h1>
            <p className="auth__sub">Takes less than a minute.</p>
          </header>

          {done ? (
            <p className="auth__done">Account created. Check your email to verify.</p>
          ) : (
            <form onSubmit={onSubmit} className="auth__form">
              <Field label="Full name" error={errors.name}>
                <Input
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  aria-invalid={!!errors.name}
                />
              </Field>

              <Field label="Email" error={errors.email}>
                <Input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  aria-invalid={!!errors.email}
                />
              </Field>

              <Field label="Password" error={errors.password}>
                <div className="auth__pwWrap">
                  <Input
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    aria-invalid={!!errors.password}
                    className="auth__input--pw"
                  />
                  <button
                    type="button"
                    className="auth__toggle"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? "Hide" : "Show"}
                  </button>
                </div>
                {form.password ? (
                  <div className="auth__meter">
                    <div className="auth__bars">
                      {[1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className="auth__bar"
                          style={{ background: i <= meter.score ? BAR_COLORS[meter.score] : "#e5e7eb" }}
                        />
                      ))}
                    </div>
                    <span className="auth__meterLabel">{meter.label}</span>
                  </div>
                ) : null}
              </Field>

              <Field label="Confirm password" error={errors.confirm}>
                <Input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) => set("confirm", e.target.value)}
                  aria-invalid={!!errors.confirm}
                />
              </Field>

              <label className="auth__terms">
                <Checkbox
                  checked={form.accept}
                  onCheckedChange={(v) => set("accept", Boolean(v))}
                  aria-invalid={!!errors.accept}
                />
                <span>
                  I agree to the <a className="auth__link" href="/terms">Terms</a> and{" "}
                  <a className="auth__link" href="/privacy">Privacy Policy</a>.
                </span>
              </label>
              {errors.accept ? <p className="auth__err auth__err--accept">{errors.accept}</p> : null}

              <Button type="submit" disabled={submitting} className="auth__submit">
                {submitting ? "Creating account…" : "Create account"}
              </Button>

              <p className="auth__footer">
                Already have an account? <a href="/login" className="auth__link">Sign in</a>
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
    <div className="auth__field">
      <Label className="auth__label">{label}</Label>
      {children}
      {error ? <p className="auth__err">{error}</p> : null}
    </div>
  );
}
`,
      },
      {
        filename: "SignupPage.css",
        language: "css",
        code: `.auth {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: hsl(var(--muted) / 0.3);
}
.auth__card { width: 100%; max-width: 22rem; }
.auth__cardInner { padding: 1.5rem; }
.auth__header { margin-bottom: 1.5rem; text-align: center; }
.auth__title { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
.auth__sub { font-size: 0.875rem; color: hsl(var(--muted-foreground)); margin: 0.25rem 0 0; }
.auth__done { font-size: 0.875rem; margin: 0; }
.auth__form { display: flex; flex-direction: column; gap: 1rem; }
.auth__field { display: flex; flex-direction: column; gap: 0.375rem; }
.auth__label { font-size: 0.75rem; font-weight: 500; }
.auth__pwWrap { position: relative; }
.auth__input--pw { padding-right: 3rem; }
.auth__toggle {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: 0;
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
}
.auth__toggle:hover { color: hsl(var(--foreground)); }
.auth__err { font-size: 0.75rem; color: hsl(var(--destructive)); margin: 0; }
.auth__err--accept { margin-top: -0.5rem; }
.auth__meter { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem; }
.auth__bars { display: flex; flex: 1; gap: 0.25rem; }
.auth__bar { height: 4px; flex: 1; border-radius: 999px; }
.auth__meterLabel { font-size: 0.6875rem; color: hsl(var(--muted-foreground)); }
.auth__terms {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.auth__submit { width: 100%; }
.auth__footer {
  text-align: center;
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
  margin: 0;
}
.auth__link {
  color: hsl(var(--foreground));
  font-weight: 500;
  text-decoration: none;
}
.auth__link:hover { text-decoration: underline; }
`,
      },
    ],
  },
};
