"use client";

import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";
import type { CandidateDto, CloseSessionRequest } from "@/contracts";
import { CandidatePicker } from "@/components/feature/candidate-picker";

type Rating = 1 | 2 | 3 | 4 | 5;

interface CloseSessionDialogProps {
  open: boolean;
  /** Called when the dialog should close (only from Skip/Submit buttons). */
  onOpenChange: (open: boolean) => void;
  /** Called with the (possibly empty) body. Caller drives the close request. */
  onConfirm: (body: CloseSessionRequest) => void;
  /** Whether the close request is in flight — disables both buttons. */
  closing: boolean;
  /**
   * If provided, the dialog will attach/detach the picked candidate via
   * `PATCH /sessions/:id/candidate` BEFORE invoking `onConfirm`. The
   * candidate's `externalId` snapshot then stamps automatically into the
   * Phase-25 `candidateId` text column server-side.
   */
  sessionId?: string;
  /** Currently attached candidate record id (if any). */
  attachedCandidateRecordId?: string | null;
}

export function CloseSessionDialog({
  open,
  onOpenChange,
  onConfirm,
  closing,
  sessionId,
  attachedCandidateRecordId,
}: CloseSessionDialogProps) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [hoverRating, setHoverRating] = useState<Rating | null>(null);
  const [candidate, setCandidate] = useState<CandidateDto | null>(null);
  // We don't need to fetch the attached candidate detail — the picker shows
  // the chip only when the local `candidate` is non-null. The PATCH below
  // diffs against `attachedCandidateRecordId` so a no-op attach is skipped.
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    if (!open) {
      setCandidate(null);
      setRating(null);
      setHoverRating(null);
    }
  }, [open]);

  const busy = closing || attaching;

  function buildBody(): CloseSessionRequest {
    const body: CloseSessionRequest = {};
    if (rating !== null) body.candidateRating = rating;
    return body;
  }

  async function syncCandidateThen(after: () => void) {
    if (!sessionId) {
      after();
      return;
    }
    const nextId = candidate?.id ?? null;
    const currentId = attachedCandidateRecordId ?? null;
    if (nextId === currentId) {
      after();
      return;
    }
    setAttaching(true);
    try {
      await api.sessions.attachCandidate(sessionId, {
        candidateRecordId: nextId,
      });
      after();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.body?.message || err.message
          : "Couldn't attach the candidate.";
      toast.error(msg);
    } finally {
      setAttaching(false);
    }
  }

  function onSubmit() {
    void syncCandidateThen(() => onConfirm(buildBody()));
  }

  function onSkip() {
    // Skip also commits a candidate change if the interviewer picked one
    // but chose to not rate — the link is independent of the rating.
    void syncCandidateThen(() => onConfirm({}));
  }

  // Only Skip / Submit can close this dialog. We swallow `open === false`
  // emitted by outside-click / escape / scrim so the interviewer never
  // silently loses their input.
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) return;
        onOpenChange(o);
      }}
      disablePointerDismissal
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Wrapping up the interview</DialogTitle>
          <DialogDescription>
            Optionally capture the candidate and a rating before we close the
            session. Both are optional — you can skip and close right away.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="close-rating">Candidate technical rating</Label>
            <div
              id="close-rating"
              className="flex items-center gap-1"
              role="radiogroup"
              aria-label="Candidate technical rating"
            >
              {[1, 2, 3, 4, 5].map((nRaw) => {
                const n = nRaw as Rating;
                const filled = (hoverRating ?? rating ?? 0) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} out of 5`}
                    disabled={busy}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(null)}
                    onFocus={() => setHoverRating(n)}
                    onBlur={() => setHoverRating(null)}
                    onClick={() => setRating(rating === n ? null : n)}
                    className="focus-visible:ring-ring/50 rounded-sm p-0.5 outline-none focus-visible:ring-2 disabled:opacity-50"
                  >
                    <Star
                      className={cn(
                        "h-6 w-6 transition-colors",
                        filled
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setRating(null)}
                disabled={busy || rating === null}
                className="text-muted-foreground hover:text-foreground ml-2 text-xs underline-offset-2 hover:underline disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Candidate</Label>
            <CandidatePicker
              value={candidate}
              onChange={setCandidate}
              disabled={busy}
            />
            <p className="text-muted-foreground text-xs">
              Pick from your type-scoped candidate list. Filed under HR
              reports against this session.
            </p>
          </div>
        </div>

        <DialogFooter className="sm:items-center">
          <Button type="button" variant="ghost" onClick={onSkip} disabled={busy}>
            {busy ? "Closing…" : "Skip"}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Closing…
              </>
            ) : (
              "Submit & close"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
