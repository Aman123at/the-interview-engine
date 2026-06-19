"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/feature/fade-in";
import { api, ApiError } from "@/lib/api";
import type { AdminStaffUser } from "@/contracts";
import { HrDialog } from "@/components/feature/admin/hr-dialog";
import { ConfirmDeleteDialog } from "@/components/feature/admin/confirm-delete-dialog";
import { StaffRowActions } from "@/components/feature/admin/staff-row-actions";
import {
  EmptyState,
  StaffTable,
  StatusBadge,
} from "@/components/feature/admin/staff-presentational";
import { describeStaffError } from "@/components/feature/admin/errors";
import { InterviewerSection } from "@/components/feature/admin/interviewer-section";

type AdminTab = "hrs" | "interviewers";

export default function AdminHomePage() {
  const [tab, setTab] = useState<AdminTab>("hrs");

  const [hrs, setHrs] = useState<AdminStaffUser[] | null>(null);
  const [hrDialogOpen, setHrDialogOpen] = useState(false);
  const [hrEditing, setHrEditing] = useState<AdminStaffUser | null>(null);
  const [hrDeleting, setHrDeleting] = useState<AdminStaffUser | null>(null);
  const [hrBusy, setHrBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const hrRes = await api.admin.listHrs();
        setHrs(hrRes.users);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Couldn't load HRs.";
        toast.error(msg);
      }
    })();
  }, []);

  const upsertHr = useCallback((u: AdminStaffUser) => {
    setHrs((prev) => {
      if (!prev) return [u];
      const i = prev.findIndex((x) => x.id === u.id);
      if (i === -1) return [u, ...prev];
      const next = prev.slice();
      next[i] = u;
      return next;
    });
  }, []);

  async function confirmDeleteHr() {
    if (!hrDeleting) return;
    setHrBusy(true);
    try {
      await api.admin.deleteHr(hrDeleting.id);
      toast.success(`Removed ${hrDeleting.displayName}.`);
      setHrs((prev) => prev?.filter((x) => x.id !== hrDeleting.id) ?? null);
      setHrDeleting(null);
    } catch (err) {
      toast.error(describeStaffError(err, "Couldn't remove HR."));
    } finally {
      setHrBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <FadeIn y={12}>
        <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.18em]">
          admin
        </p>
        <h1 className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
          Staff management
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Onboard, edit, and remove the HRs and interviewers in your
          organization.
        </p>
      </FadeIn>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as AdminTab)}
        className="gap-6"
      >
        <TabsList variant="line" className="self-start">
          <TabsTrigger value="hrs">
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            HRs
          </TabsTrigger>
          <TabsTrigger value="interviewers">
            <Users className="mr-1.5 h-4 w-4" />
            Interviewers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hrs" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {hrs ? `${hrs.length} HR account${hrs.length === 1 ? "" : "s"}` : ""}
            </p>
            <Button
              onClick={() => {
                setHrEditing(null);
                setHrDialogOpen(true);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Onboard HR
            </Button>
          </div>

          {hrs === null ? (
            <Skeleton className="h-40 w-full" />
          ) : hrs.length === 0 ? (
            <EmptyState
              title="No HRs yet"
              hint="Click “Onboard HR” to create the first one."
            />
          ) : (
            <StaffTable
              columns={["Name", "Email", "Status", ""]}
              rows={hrs.map((u) => ({
                key: u.id,
                cells: [
                  <span key="n" className="text-foreground font-medium">
                    {u.displayName}
                  </span>,
                  <span key="e" className="text-muted-foreground">
                    {u.email}
                  </span>,
                  <StatusBadge key="s" active={u.isActive} />,
                  <StaffRowActions
                    key="a"
                    onEdit={() => {
                      setHrEditing(u);
                      setHrDialogOpen(true);
                    }}
                    onDelete={() => setHrDeleting(u)}
                  />,
                ],
              }))}
            />
          )}
        </TabsContent>

        <TabsContent value="interviewers">
          <InterviewerSection />
        </TabsContent>
      </Tabs>

      <HrDialog
        open={hrDialogOpen}
        onOpenChange={setHrDialogOpen}
        user={hrEditing}
        onSaved={upsertHr}
      />

      <ConfirmDeleteDialog
        open={!!hrDeleting}
        onOpenChange={(o) => !o && setHrDeleting(null)}
        title="Remove HR?"
        description={
          hrDeleting ? (
            <>
              Remove{" "}
              <span className="text-foreground font-medium">
                {hrDeleting.displayName}
              </span>{" "}
              ({hrDeleting.email}). Their account will be deactivated and they
              won't be able to sign in.
            </>
          ) : null
        }
        confirmLabel="Remove HR"
        busy={hrBusy}
        onConfirm={confirmDeleteHr}
      />
    </main>
  );
}
