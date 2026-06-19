"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { homeForRole, useAuth } from "@/lib/auth/auth-context";

/**
 * Design documents (DB + System) are interviewer-only — POST /design-docs is
 * gated by `requireRole('interviewer')` on the server. Non-interviewers are
 * bounced to their role home.
 */
export default function DesignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    if (user.role !== "interviewer") {
      router.replace(homeForRole(user.role));
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== "interviewer") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  return <>{children}</>;
}
