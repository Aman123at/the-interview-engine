import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Component Library — Interview Sandbox",
  description: "Public, copy-paste-ready prebuilt pages.",
};

export default function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No auth guard — the library is intentionally public so candidates inside
  // a shared (read-only) session can open it too.
  return <div className="flex min-h-[100dvh] flex-col">{children}</div>;
}
