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
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href={homeForRole(user.role)}
          className="flex items-center gap-2 text-sm font-medium tracking-tight"
        >
          <span
            className="bg-primary/10 text-primary inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-[10px] font-semibold"
            aria-hidden
          >
            IS
          </span>
          <span>Interview Sandbox</span>
        </Link>

        <div className="flex items-center gap-3">
          <LibraryButton />
          <ThemeToggle />
          <Menu.Root>
            <Menu.Trigger
              className={cn(
                "focus-visible:ring-ring/60 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 py-1 pl-1 pr-2 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2",
              )}
              aria-label={`Account menu for ${display}`}
            >
              <span
                className="bg-primary/15 text-primary inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold uppercase"
                aria-hidden
              >
                {initials}
              </span>
              <span className="text-foreground hidden max-w-[10rem] truncate sm:block">
                {display}
              </span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={8} align="end" className="z-50">
                <Menu.Popup
                  className={cn(
                    "border-border/60 bg-popover text-popover-foreground min-w-[14rem] overflow-hidden rounded-md border p-1 shadow-md outline-none",
                    "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150",
                  )}
                >
                  <div className="px-2 py-1.5">
                    <p className="text-foreground truncate text-sm">{display}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {user.email}
                    </p>
                  </div>
                  <div className="border-border/60 my-1 border-t" />
                  {user.role === "interviewer" && (
                    <Menu.Item
                      className="hover:bg-accent focus:bg-accent flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none"
                      onClick={() => router.push("/sessions/history")}
                    >
                      <History className="h-4 w-4" />
                      Past Sessions
                    </Menu.Item>
                  )}
                  <Menu.Item
                    className="hover:bg-accent focus:bg-accent flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none disabled:opacity-50"
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
