import type { ReactVariantSources } from "../../types";

const VALIDATE_TS = `function validate(form: { email: string; password: string }) {
  const e: { email?: string; password?: string } = {};
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";
  if (form.password.length < 8) e.password = "Must be at least 8 characters";
  return e;
}`;

const VALIDATE_JS = `function validate(form) {
  const e = {};
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";
  if (form.password.length < 8) e.password = "Must be at least 8 characters";
  return e;
}`;

export const sources: ReactVariantSources = {
  "shadcn-tailwind": {
    notes:
      "Install: npx shadcn@latest add card button input label checkbox\nPlace under src/LoginPage.tsx.",
    files: [
      {
        filename: "LoginPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

${VALIDATE_TS}

export default function LoginPage() {
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
    // Dummy submit — wire to your auth API here.
    await new Promise((r) => setTimeout(r, 600));
    console.log("login:", { ...form, remember });
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6">
          <header className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Sign in to continue to your account.
            </p>
          </header>

          {done ? (
            <p className="text-sm">Signed in. Redirecting…</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  aria-invalid={!!errors.email}
                />
                {errors.email ? <p className="text-destructive text-xs">{errors.email}</p> : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <a className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline" href="/forgot-password">
                    Forgot?
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
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
                {errors.password ? <p className="text-destructive text-xs">{errors.password}</p> : null}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
                <span>Remember me on this device</span>
              </label>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Signing in…" : "Sign in"}
              </Button>

              <p className="text-muted-foreground text-center text-sm">
                Don&apos;t have an account?{" "}
                <a href="/signup" className="text-foreground font-medium underline-offset-2 hover:underline">
                  Create one
                </a>
              </p>
            </form>
          )}
        </CardContent>
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
      "No shadcn — native elements + Tailwind utilities. Place under src/LoginPage.jsx.",
    files: [
      {
        filename: "LoginPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";

${VALIDATE_JS}

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    console.log("login:", { ...form, remember });
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-gray-900">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to continue to your account.</p>
        </header>

        {done ? (
          <p className="text-sm">Signed in. Redirecting…</p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
              {errors.email ? <p className="text-xs text-red-600">{errors.email}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium">Password</label>
                <a className="text-xs text-gray-500 hover:underline" href="/forgot-password">Forgot?</a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-900"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password ? <p className="text-xs text-red-600">{errors.password}</p> : null}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span>Remember me on this device</span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-center text-sm text-gray-500">
              Don't have an account?{" "}
              <a href="/signup" className="font-medium text-gray-900 hover:underline">Create one</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
`,
      },
    ],
  },

  "plain-css": {
    notes: "Two files. Place LoginPage.jsx and LoginPage.css side-by-side.",
    files: [
      {
        filename: "LoginPage.jsx",
        language: "jsx",
        code: `import { useState } from "react";
import "./LoginPage.css";

${VALIDATE_JS}

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const eMap = validate(form);
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    console.log("login:", { ...form, remember });
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <header className="auth__header">
          <h1 className="auth__title">Welcome back</h1>
          <p className="auth__sub">Sign in to continue to your account.</p>
        </header>

        {done ? (
          <p className="auth__done">Signed in. Redirecting…</p>
        ) : (
          <form onSubmit={onSubmit} className="auth__form">
            <div className="auth__field">
              <label htmlFor="email" className="auth__label">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="auth__input"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
              {errors.email ? <p className="auth__err">{errors.email}</p> : null}
            </div>

            <div className="auth__field">
              <div className="auth__labelRow">
                <label htmlFor="password" className="auth__label">Password</label>
                <a className="auth__forgot" href="/forgot-password">Forgot?</a>
              </div>
              <div className="auth__pwWrap">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  className="auth__input auth__input--pw"
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
              {errors.password ? <p className="auth__err">{errors.password}</p> : null}
            </div>

            <label className="auth__remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Remember me on this device</span>
            </label>

            <button type="submit" disabled={submitting} className="auth__submit">
              {submitting ? "Signing in…" : "Sign in"}
            </button>

            <p className="auth__footer">
              Don't have an account? <a href="/signup" className="auth__link">Create one</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
`,
      },
      {
        filename: "LoginPage.css",
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
.auth__labelRow { display: flex; align-items: center; justify-content: space-between; }
.auth__label { font-size: 0.75rem; font-weight: 500; }
.auth__forgot { font-size: 0.75rem; color: #6b7280; text-decoration: none; }
.auth__forgot:hover { color: #111827; text-decoration: underline; }
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
.auth__remember { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
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
      "Shadcn primitives + colocated CSS (no Tailwind).\nInstall: npx shadcn@latest add card button input label checkbox\nPlace LoginPage.tsx and LoginPage.css together.",
    files: [
      {
        filename: "LoginPage.tsx",
        language: "tsx",
        code: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./LoginPage.css";

${VALIDATE_TS}

export default function LoginPage() {
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
    await new Promise((r) => setTimeout(r, 600));
    console.log("login:", { ...form, remember });
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="auth">
      <Card className="auth__card">
        <CardContent className="auth__cardInner">
          <header className="auth__header">
            <h1 className="auth__title">Welcome back</h1>
            <p className="auth__sub">Sign in to continue to your account.</p>
          </header>

          {done ? (
            <p className="auth__done">Signed in. Redirecting…</p>
          ) : (
            <form onSubmit={onSubmit} className="auth__form">
              <div className="auth__field">
                <Label htmlFor="email" className="auth__label">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  aria-invalid={!!errors.email}
                />
                {errors.email ? <p className="auth__err">{errors.email}</p> : null}
              </div>

              <div className="auth__field">
                <div className="auth__labelRow">
                  <Label htmlFor="password" className="auth__label">Password</Label>
                  <a className="auth__forgot" href="/forgot-password">Forgot?</a>
                </div>
                <div className="auth__pwWrap">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
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
                {errors.password ? <p className="auth__err">{errors.password}</p> : null}
              </div>

              <label className="auth__remember">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
                <span>Remember me on this device</span>
              </label>

              <Button type="submit" disabled={submitting} className="auth__submit">
                {submitting ? "Signing in…" : "Sign in"}
              </Button>

              <p className="auth__footer">
                Don't have an account? <a href="/signup" className="auth__link">Create one</a>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
`,
      },
      {
        filename: "LoginPage.css",
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
.auth__labelRow { display: flex; align-items: center; justify-content: space-between; }
.auth__label { font-size: 0.75rem; font-weight: 500; }
.auth__forgot {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  text-decoration: none;
}
.auth__forgot:hover { color: hsl(var(--foreground)); text-decoration: underline; }
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
.auth__remember { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
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
