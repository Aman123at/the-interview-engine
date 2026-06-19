"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/feature/login-form";
import { homeForRole, useAuth } from "@/lib/auth/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/feature/fade-in";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  // Already authenticated → bounce to the role's home (or ?next= if safe).
  useEffect(() => {
    if (loading || !user) return;
    const next = searchParams.get("next");
    const safe = !!next && next.startsWith("/") && !next.startsWith("//");
    router.replace(safe ? next! : homeForRole(user.role));
  }, [loading, user, router, searchParams]);

  if (loading || user) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <FadeIn className="flex w-full flex-col items-center gap-6" y={12}>
        <div className="text-center">
          <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.18em]">
            interview-sandbox
          </p>
          <h1 className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
        </div>
        <Suspense
          fallback={
            <div className="flex w-full max-w-sm flex-col gap-4">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-32 w-full" />
            </div>
          }
        >
          <LoginPageInner />
        </Suspense>
      </FadeIn>
    </main>
  );
}
