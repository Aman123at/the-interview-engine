"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { homeForRole, useAuth } from "@/lib/auth/auth-context";

/**
 * HR route gate. Server enforces role on the actual HR endpoints; this
 * layout just keeps non-HRs out of the UI.
 */
export default function HrLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    if (user.role !== "hr") {
      router.replace(homeForRole(user.role));
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== "hr") {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  return <>{children}</>;
}
