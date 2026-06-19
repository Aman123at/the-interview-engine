"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { CandidateDto, InterviewType } from "@/contracts";
import { describeStaffError } from "./errors";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: InterviewType[];
  /** Pass to edit an existing candidate; omit to add a new one. */
  candidate?: CandidateDto | null;
  onSaved: (c: CandidateDto) => void;
}

export function CandidateDialog({
  open,
  onOpenChange,
  types,
  candidate,
  onSaved,
}: Props) {
  const editing = !!candidate;
  const [externalId, setExternalId] = useState("");
  const [name, setName] = useState("");
  const [typeKeys, setTypeKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const activeTypes = useMemo(() => types.filter((t) => t.isActive), [types]);

  useEffect(() => {
    if (!open) return;
    setExternalId(candidate?.externalId ?? "");
    setName(candidate?.name ?? "");
    setTypeKeys(new Set(candidate?.interviewTypes.map((t) => t.key) ?? []));
  }, [open, candidate]);

  function toggleType(key: string, checked: boolean) {
    setTypeKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (typeKeys.size === 0) {
      toast.error("Pick at least one interview type.");
      return;
    }
    setBusy(true);
    try {
      const keys = Array.from(typeKeys);
      if (editing && candidate) {
        const body: Parameters<typeof api.candidates.update>[1] = {};
        if (externalId.trim() !== candidate.externalId)
          body.externalId = externalId.trim();
        if (name.trim() !== candidate.name) body.name = name.trim();
        const before = candidate.interviewTypes
          .map((t) => t.key)
          .sort()
          .join(",");
        const after = keys.slice().sort().join(",");
        if (before !== after) body.interviewTypeKeys = keys;
        if (Object.keys(body).length === 0) {
          onOpenChange(false);
          return;
        }
        const res = await api.candidates.update(candidate.id, body);
        toast.success(`Updated ${res.candidate.name}.`);
        onSaved(res.candidate);
      } else {
        const res = await api.candidates.create({
          externalId: externalId.trim(),
          name: name.trim(),
          interviewTypeKeys: keys,
        });
        toast.success(`Added ${res.candidate.name}.`);
        onSaved(res.candidate);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(
        describeStaffError(
          err,
          editing ? "Couldn't update candidate." : "Couldn't add candidate.",
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
              {editing ? "Edit candidate" : "Add candidate"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Edit the candidate's name, manual ID, and assigned interview types. The internal UUID never changes."
                : "Create a candidate record. Pick at least one interview type."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {editing && candidate ? (
              <div className="grid gap-1">
                <Label className="text-muted-foreground text-xs">
                  Internal UUID
                </Label>
                <code className="border-border/60 bg-muted/40 text-muted-foreground select-all rounded-md border px-2 py-1.5 text-xs">
                  {candidate.id}
                </code>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="cd-ext-id">Candidate ID</Label>
              <Input
                id="cd-ext-id"
                autoComplete="off"
                required
                placeholder="e.g. C-1234"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                disabled={busy}
              />
              <p className="text-muted-foreground text-xs">
                Your editable identifier (e.g. ATS ticket, candidate ref).
                Must be unique across active candidates.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="cd-name">Full name</Label>
              <Input
                id="cd-name"
                autoComplete="off"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </div>

            <div className="border-border/60 grid gap-2 rounded-md border p-3">
              <div>
                <Label className="text-foreground">Interview types</Label>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Select all the types this candidate will interview for.
                </p>
              </div>
              {activeTypes.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">
                  No interview types available.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {activeTypes.map((t) => {
                    const checked = typeKeys.has(t.key);
                    return (
                      <li key={t.key}>
                        <label className="hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => toggleType(t.key, !!v)}
                            disabled={busy}
                          />
                          <span className="text-foreground">{t.label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
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
                "Add candidate"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
