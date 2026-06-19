"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import type { AdminStaffUser } from "@/contracts";
import { describeStaffError } from "./errors";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an HR to edit; omit to onboard a new one. */
  user?: AdminStaffUser | null;
  onSaved: (u: AdminStaffUser) => void;
}

export function HrDialog({ open, onOpenChange, user, onSaved }: Props) {
  const editing = !!user;
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(user?.email ?? "");
    setDisplayName(user?.displayName ?? "");
    setPassword("");
    setIsActive(user?.isActive ?? true);
  }, [open, user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (editing && user) {
        const body: Parameters<typeof api.admin.updateHr>[1] = {};
        if (displayName !== user.displayName) body.displayName = displayName;
        if (isActive !== user.isActive) body.isActive = isActive;
        if (password.trim().length > 0) body.password = password;
        if (Object.keys(body).length === 0) {
          onOpenChange(false);
          return;
        }
        const res = await api.admin.updateHr(user.id, body);
        toast.success(`Updated ${res.user.displayName}.`);
        onSaved(res.user);
      } else {
        const res = await api.admin.onboardHr({ email, displayName, password });
        toast.success(`Onboarded ${res.user.displayName}.`);
        onSaved(res.user);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(
        describeStaffError(err, editing ? "Couldn't update HR." : "Couldn't onboard HR."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit HR" : "Onboard HR"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update profile, status, or reset the password."
                : "Create an HR account. They'll sign in with these credentials."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="hr-email">Email</Label>
              <Input
                id="hr-email"
                type="email"
                autoComplete="off"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={editing || busy}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hr-name">Full name</Label>
              <Input
                id="hr-name"
                autoComplete="off"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hr-password">
                {editing ? "Reset password (optional)" : "Initial password"}
              </Label>
              <Input
                id="hr-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required={!editing}
                placeholder={editing ? "Leave blank to keep current" : "Min 8 characters"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            {editing ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={isActive}
                  onCheckedChange={(v) => setIsActive(v)}
                  disabled={busy}
                />
                <span>Active</span>
              </label>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : editing ? (
                "Save changes"
              ) : (
                "Onboard HR"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
