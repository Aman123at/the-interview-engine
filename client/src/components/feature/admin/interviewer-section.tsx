"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import type { AdminInterviewerUser, InterviewType } from "@/contracts";
import { InterviewerDialog } from "./interviewer-dialog";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { StaffRowActions } from "./staff-row-actions";
import {
  EmptyState,
  SpecializationBadges,
  StaffTable,
  StatusBadge,
} from "./staff-presentational";
import { describeStaffError } from "./errors";

/**
 * Self-contained interviewer management surface. Used by both /admin (Phase
 * 30b) and /hr (Phase 30c) — server's `/admin/interviewers` route is shared
 * (`requireRole('admin','hr')`), so the same API client works for both.
 */
export function InterviewerSection() {
  const [interviewers, setInterviewers] = useState<
    AdminInterviewerUser[] | null
  >(null);
  const [types, setTypes] = useState<InterviewType[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminInterviewerUser | null>(null);
  const [deleting, setDeleting] = useState<AdminInterviewerUser | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [ivRes, tyRes] = await Promise.all([
          api.admin.listInterviewers(),
          api.admin.listInterviewTypes(),
        ]);
        setInterviewers(ivRes.users);
        setTypes(tyRes.types);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : "Couldn't load interviewers.";
        toast.error(msg);
      }
    })();
  }, []);

  const upsert = useCallback((u: AdminInterviewerUser) => {
    setInterviewers((prev) => {
      if (!prev) return [u];
      const i = prev.findIndex((x) => x.id === u.id);
      if (i === -1) return [u, ...prev];
      const next = prev.slice();
      next[i] = u;
      return next;
    });
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.admin.deleteInterviewer(deleting.id);
      toast.success(`Removed ${deleting.displayName}.`);
      setInterviewers((prev) => prev?.filter((x) => x.id !== deleting.id) ?? null);
      setDeleting(null);
    } catch (err) {
      toast.error(describeStaffError(err, "Couldn't remove interviewer."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {interviewers
            ? `${interviewers.length} interviewer${interviewers.length === 1 ? "" : "s"}`
            : ""}
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          disabled={types.length === 0}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Onboard interviewer
        </Button>
      </div>

      {interviewers === null ? (
        <Skeleton className="h-40 w-full" />
      ) : interviewers.length === 0 ? (
        <EmptyState
          title="No interviewers yet"
          hint="Click “Onboard interviewer” to add one."
        />
      ) : (
        <StaffTable
          columns={["Name", "Email", "Specializations", "Status", ""]}
          rows={interviewers.map((u) => ({
            key: u.id,
            cells: [
              <span key="n" className="text-foreground font-medium">
                {u.displayName}
              </span>,
              <span key="e" className="text-muted-foreground">
                {u.email}
              </span>,
              <SpecializationBadges key="sp" specs={u.specializations} />,
              <StatusBadge key="s" active={u.isActive} />,
              <StaffRowActions
                key="a"
                onEdit={() => {
                  setEditing(u);
                  setDialogOpen(true);
                }}
                onDelete={() => setDeleting(u)}
              />,
            ],
          }))}
        />
      )}

      <InterviewerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        types={types}
        user={editing}
        onSaved={upsert}
      />

      <ConfirmDeleteDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove interviewer?"
        description={
          deleting ? (
            <>
              Remove{" "}
              <span className="text-foreground font-medium">
                {deleting.displayName}
              </span>{" "}
              ({deleting.email}). Their account will be deactivated and they
              won't be able to sign in.
            </>
          ) : null
        }
        confirmLabel="Remove interviewer"
        busy={busy}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
