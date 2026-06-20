"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { History, LogOut } from "lucide-react";
import { homeForRole, useAuth } from "@/lib/auth/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { LibraryButton } from "@/components/feature/library-button";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/contracts";

interface TopBarProps {
  user: PublicUser;
}

export function TopBar({ user }: TopBarProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function onLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  const display = user.displayName || user.email;
  const initials = getInitials(display, user.email);

  return (
    <>
      {/* Fixed 2px accent gradient bar across the very top of the viewport. */}
      <div className="aurora-top-line" aria-hidden />
      <header className="border-bd bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 border-b backdrop-blur-[14px]">
      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-10 py-[13px]">
        <Link
          href={homeForRole(user.role)}
          className="flex items-center gap-2.5 font-display text-[15px] font-semibold tracking-tight text-t-hi"
        >
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] font-mono text-[12px] font-bold text-white"
            style={{
              background: "var(--accent-grad)",
              boxShadow: "0 6px 18px var(--accent-shadow)",
            }}
            aria-hidden
          >
            IS
          </span>
          <span>Interview Sandbox</span>
        </Link>

        <div className="flex items-center gap-2.5">
          <LibraryButton />
          <ThemeToggle />
          <Menu.Root>
            <Menu.Trigger
              className={cn(
                "focus-visible:ring-accent-main/40 inline-flex items-center gap-2 rounded-[22px] border border-bd-2 bg-background/70 py-1 pl-1 pr-3 text-sm transition-colors outline-none hover:bg-panel-2 focus-visible:ring-2",
              )}
              aria-label={`Account menu for ${display}`}
            >
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold uppercase text-white"
                style={{ background: "var(--accent-grad-b)" }}
                aria-hidden
              >
                {initials}
              </span>
              <span className="text-t-hi hidden max-w-[10rem] truncate sm:block">
                {display}
              </span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8} align="end" className="z-50">
                <Menu.Popup
                  className={cn(
                    "border-bd-2 bg-modal text-popover-foreground w-[268px] overflow-hidden rounded-2xl border p-2 outline-none animate-aurora-pop-in",
                    "shadow-[0_24px_70px_rgba(0,0,0,0.55)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.55)]",
                  )}
                >
                  <div className="px-3 py-2">
                    <p className="font-display text-[15px] font-semibold text-t-hi">{display}</p>
                    <p className="text-t-lo truncate font-mono text-xs">
                      {user.email}
                    </p>
                  </div>
                  <div className="border-bd my-1 border-t" />
                  {user.role === "interviewer" && (
                    <Menu.Item
                      className="hover:bg-panel-2 focus:bg-panel-2 flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-[11px] text-sm outline-none text-t-mid hover:text-t-hi"
                      onClick={() => router.push("/sessions/history")}
                    >
                      <History className="h-4 w-4" />
                      Past Sessions
                    </Menu.Item>
                  )}
                  <Menu.Item
                    className="hover:bg-panel-2 focus:bg-panel-2 flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-[11px] text-sm outline-none disabled:opacity-50 text-t-mid hover:text-t-hi"
                    onClick={onLogout}
                    disabled={signingOut}
                  >
                    <LogOut className="h-4 w-4" />
                    {signingOut ? "Signing out…" : "Log out"}
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>
    </header>
    </>
  );
}

function getInitials(display: string, email: string): string {
  const source = (display || email).trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const first = parts[0] ?? source;
  return first.slice(0, 2).toUpperCase();
}
