"use client";

import { LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SessionBackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeaveRunning: () => void;
  onClose: () => void;
  closing: boolean;
}

/**
 * Confirm dialog shown when the user clicks the back arrow in the workspace
 * top bar. Three choices:
 *
 *   • Stay              → cancel; remain in the workspace.
 *   • Leave running     → navigate to /dashboard, keep the container alive.
 *                         The dashboard will show a "Resume" card for it.
 *   • Close session     → run the full close flow (DELETE /sessions/:id).
 *
 * We deliberately make "Stay" the easiest target (cancel = Esc + outside
 * click) and put "Leave running" as the default-styled primary, since most
 * users back-arrowing want to pause not destroy.
 */
export function SessionBackDialog({
  open,
  onOpenChange,
  onLeaveRunning,
  onClose,
  closing,
}: SessionBackDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leave this session?</DialogTitle>
          <DialogDescription>
            Your sandbox is still running. You can leave it running and pick
            it back up from the dashboard, or close it now and persist all
            your files.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:items-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={closing}
          >
            Stay
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={closing}
          >
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {closing ? "Closing…" : "Close session"}
          </Button>
          <Button type="button" onClick={onLeaveRunning} disabled={closing}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Leave running
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
