"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

interface FieldErrors {
  identifier?: string;
  password?: string;
  form?: string;
}

function validate(identifier: string, password: string): FieldErrors {
  const errs: FieldErrors = {};
  if (!identifier.trim()) {
    errs.identifier = "Enter your email or username.";
  } else if (identifier.includes("@")) {
    // Light email shape check, only when it looks like an email.
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());
    if (!ok) errs.identifier = "That doesn't look like a valid email.";
  }
  if (!password) {
    errs.password = "Enter your password.";
  } else if (password.length < 6) {
    errs.password = "Password must be at least 6 characters.";
  }
  return errs;
}

function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 400) {
      return "Incorrect email/username or password.";
    }
    if (e.status === 429) {
      return "Too many attempts. Please wait a minute and try again.";
    }
    if (e.status === 0) {
      return "Couldn't reach the server. Check your connection.";
    }
    if (e.status >= 500) {
      return "The server is having trouble. Please try again shortly.";
    }
    return e.message || "Login failed.";
  }
  return "Something went wrong. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validate(identifier, password);
    setErrors(v);
    if (v.identifier || v.password) return;

    setSubmitting(true);
    try {
      await login({ identifier: identifier.trim(), password });
      // Redirect to ?next= if it's a safe in-app path, otherwise /dashboard.
      const safe = next.startsWith("/") && !next.startsWith("//");
      router.replace(safe ? next : "/dashboard");
    } catch (e) {
      const msg = friendlyError(e);
      setErrors({ form: msg });
      toast.error("Login failed", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use the credentials provided by your interviewer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-5"
          aria-describedby={errors.form ? "login-form-error" : undefined}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="identifier">Email or username</Label>
            <Input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              autoFocus
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (errors.identifier) {
                  setErrors((prev) => ({ ...prev, identifier: undefined }));
                }
              }}
              aria-invalid={!!errors.identifier}
              aria-describedby={
                errors.identifier ? "identifier-error" : undefined
              }
              disabled={submitting}
            />
            {errors.identifier ? (
              <p
                id="identifier-error"
                className="text-destructive text-xs"
                role="alert"
              >
                {errors.identifier}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              disabled={submitting}
            />
            {errors.password ? (
              <p
                id="password-error"
                className="text-destructive text-xs"
                role="alert"
              >
                {errors.password}
              </p>
            ) : null}
          </div>

          {errors.form ? (
            <p
              id="login-form-error"
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs"
              role="alert"
            >
              {errors.form}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
