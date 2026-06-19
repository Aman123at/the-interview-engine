"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface DeleteHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionLabel: string;
  endedLabel: string | null;
  /** Whether the session has a stored volume that could be deleted. */
  hasVolume: boolean;
  deleting: boolean;
  onConfirm: (deleteVolume: boolean) => void;
}

export function DeleteHistoryDialog({
  open,
  onOpenChange,
  sessionLabel,
  endedLabel,
  hasVolume,
  deleting,
  onConfirm,
}: DeleteHistoryDialogProps) {
  const [deleteVolume, setDeleteVolume] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove session from history?</DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium">{sessionLabel}</span>
            {endedLabel ? (
              <span className="text-muted-foreground"> · ended {endedLabel}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            This hides the session from your past-sessions list. By default the
            stored code is kept so it can still be downloaded if you change
            your mind.
          </p>

          {hasVolume ? (
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                deleteVolume
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border/60 hover:bg-muted/40",
              )}
            >
              <Checkbox
                checked={deleteVolume}
                onCheckedChange={(v) => setDeleteVolume(v)}
                disabled={deleting}
                className="mt-0.5"
                aria-describedby="delete-volume-warning"
              />
              <span className="flex-1 text-sm leading-snug">
                <span className="text-foreground font-medium">
                  Also permanently delete the stored code (volume)
                </span>
                <span
                  id="delete-volume-warning"
                  className={cn(
                    "mt-1 flex items-start gap-1.5 text-xs",
                    deleteVolume
                      ? "text-destructive font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    This cannot be undone. The code will be unrecoverable and
                    can never be downloaded again.
                  </span>
                </span>
              </span>
            </label>
          ) : (
            <p className="text-muted-foreground text-xs">
              No stored code volume is associated with this session.
            </p>
          )}
        </div>

        <DialogFooter className="sm:items-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onConfirm(deleteVolume)}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Removing…
              </>
            ) : deleteVolume ? (
              "Delete forever"
            ) : (
              "Remove from history"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
