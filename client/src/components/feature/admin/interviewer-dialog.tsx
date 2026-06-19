"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
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
import { LEVELS } from "@/contracts";
import type {
  AdminInterviewerUser,
  InterviewType,
  Level,
  SpecializationInput,
} from "@/contracts";
import { describeStaffError } from "./errors";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: InterviewType[];
  user?: AdminInterviewerUser | null;
  onSaved: (u: AdminInterviewerUser) => void;
}

export function InterviewerDialog({
  open,
  onOpenChange,
  types,
  user,
  onSaved,
}: Props) {
  const editing = !!user;
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [specs, setSpecs] = useState<SpecializationInput[]>([]);
  const [pickType, setPickType] = useState<string>("");
  const [pickLevel, setPickLevel] = useState<Level>("L1");
  const [busy, setBusy] = useState(false);

  const activeTypes = useMemo(
    () => types.filter((t) => t.isActive),
    [types],
  );

  useEffect(() => {
    if (!open) return;
    setEmail(user?.email ?? "");
    setDisplayName(user?.displayName ?? "");
    setPassword("");
    setIsActive(user?.isActive ?? true);
    setSpecs(
      user?.specializations.map((s) => ({
        interviewTypeKey: s.interviewType.key,
        level: s.level,
      })) ?? [],
    );
    setPickType(activeTypes[0]?.key ?? "");
    setPickLevel("L1");
  }, [open, user, activeTypes]);

  const typeByKey = useMemo(() => {
    const m = new Map<string, InterviewType>();
    for (const t of types) m.set(t.key, t);
    return m;
  }, [types]);

  function addSpec() {
    if (!pickType) return;
    setSpecs((prev) => {
      const next = prev.filter((s) => s.interviewTypeKey !== pickType);
      next.push({ interviewTypeKey: pickType, level: pickLevel });
      return next;
    });
  }

  function removeSpec(key: string) {
    setSpecs((prev) => prev.filter((s) => s.interviewTypeKey !== key));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (editing && user) {
        const body: Parameters<typeof api.admin.updateInterviewer>[1] = {};
        if (displayName !== user.displayName) body.displayName = displayName;
        if (isActive !== user.isActive) body.isActive = isActive;
        if (password.trim().length > 0) body.password = password;
        // Always send specializations on edit — REPLACES the set server-side.
        // Cheap way to keep "remove all" working without a separate flag.
        const before = user.specializations
          .map((s) => `${s.interviewType.key}:${s.level}`)
          .sort()
          .join(",");
        const after = specs
          .map((s) => `${s.interviewTypeKey}:${s.level}`)
          .sort()
          .join(",");
        if (before !== after) body.specializations = specs;
        if (Object.keys(body).length === 0) {
          onOpenChange(false);
          return;
        }
        const res = await api.admin.updateInterviewer(user.id, body);
        toast.success(`Updated ${res.user.displayName}.`);
        onSaved(res.user);
      } else {
        const res = await api.admin.onboardInterviewer({
          email,
          displayName,
          password,
          specializations: specs,
        });
        toast.success(`Onboarded ${res.user.displayName}.`);
        onSaved(res.user);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(
        describeStaffError(
          err,
          editing ? "Couldn't update interviewer." : "Couldn't onboard interviewer.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit interviewer" : "Onboard interviewer"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update profile, status, and the assigned interview types & levels."
                : "Create an interviewer account and assign interview types & levels."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="iv-email">Email</Label>
              <Input
                id="iv-email"
                type="email"
                autoComplete="off"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={editing || busy}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="iv-name">Full name</Label>
              <Input
                id="iv-name"
                autoComplete="off"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="iv-password">
                {editing ? "Reset password (optional)" : "Initial password"}
              </Label>
              <Input
                id="iv-password"
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

            <div className="border-border/60 mt-1 grid gap-2 rounded-md border p-3">
              <div>
                <Label className="text-foreground">Specializations</Label>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Add one or more interview-type + level pairs. Adding a type a
                  second time overrides its level.
                </p>
              </div>

              {specs.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {specs.map((s) => {
                    const t = typeByKey.get(s.interviewTypeKey);
                    return (
                      <li
                        key={s.interviewTypeKey}
                        className="border-border/60 bg-muted/40 inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-xs"
                      >
                        <span className="text-foreground font-medium">
                          {t?.label ?? s.interviewTypeKey}
                        </span>
                        <span className="text-muted-foreground">{s.level}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${t?.label ?? s.interviewTypeKey}`}
                          onClick={() => removeSpec(s.interviewTypeKey)}
                          disabled={busy}
                          className="hover:bg-destructive/10 hover:text-destructive ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  No specializations assigned yet.
                </p>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <div className="grid flex-1 min-w-[10rem] gap-1">
                  <Label htmlFor="iv-pick-type" className="text-xs">
                    Interview type
                  </Label>
                  <select
                    id="iv-pick-type"
                    value={pickType}
                    onChange={(e) => setPickType(e.target.value)}
                    disabled={busy || activeTypes.length === 0}
                    className="border-input bg-background focus-visible:ring-ring/60 h-8 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
                  >
                    {activeTypes.length === 0 ? (
                      <option value="">No types available</option>
                    ) : (
                      activeTypes.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="grid w-24 gap-1">
                  <Label htmlFor="iv-pick-level" className="text-xs">
                    Level
                  </Label>
                  <select
                    id="iv-pick-level"
                    value={pickLevel}
                    onChange={(e) => setPickLevel(e.target.value as Level)}
                    disabled={busy}
                    className="border-input bg-background focus-visible:ring-ring/60 h-8 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSpec}
                  disabled={busy || !pickType}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </div>
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
                "Onboard interviewer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
