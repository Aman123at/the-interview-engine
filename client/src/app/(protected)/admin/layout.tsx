"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { homeForRole, useAuth } from "@/lib/auth/auth-context";

/**
 * Admin route gate. The server is the source of truth (admin-only writes are
 * role-checked server-side); this layout just keeps non-admins from seeing
 * the UI. HR / interviewers are bounced to their role home.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    if (user.role !== "admin") {
      router.replace(homeForRole(user.role));
    }
  }, [loading, user, router]);

  if (loading || user?.role !== "admin") {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  return <>{children}</>;
}
