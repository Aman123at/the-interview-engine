"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Trash2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { DESIGN_ROOM_MAX_PEERS } from "@/contracts";

interface ShareDesignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: string;
  /** If already shared, pre-fill the existing token instead of minting fresh. */
  initialToken?: string | null;
  onTokenChange?: (token: string | null) => void;
}

/**
 * Multi-user share dialog for system_design canvases. Up to N anonymous guests
 * can open the link and collaborate live — they each get a random name + a
 * unique cursor color. Distinct from `ShareSessionDialog` (code-session share)
 * because the model is multi-user and there's no read-only swap.
 */
export function ShareDesignDialog({
  open,
  onOpenChange,
  docId,
  initialToken,
  onTokenChange,
}: ShareDesignDialogProps) {
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [minting, setMinting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open → if there's no token yet, mint one. Idempotent on the server.
  useEffect(() => {
    if (!open || token) return;
    let cancelled = false;
    setMinting(true);
    setError(null);
    api.designDocs
      .share(docId)
      .then((r) => {
        if (cancelled) return;
        setToken(r.shareToken);
        onTokenChange?.(r.shareToken);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't enable sharing");
      })
      .finally(() => {
        if (!cancelled) setMinting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docId, open, token, onTokenChange]);

  const url = token ? `${origin()}/d/${token}` : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the user can select+copy manually */
    }
  }

  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      await api.designDocs.unshare(docId);
      setToken(null);
      onTokenChange?.(null);
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't revoke sharing");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden />
            Share this design canvas
          </DialogTitle>
          <DialogDescription>
            Anyone with this link can join — no login needed. Up to{" "}
            {DESIGN_ROOM_MAX_PEERS} people can draw at the same time, each with
            their own colored cursor and a friendly name. Live edits and stencil
            drags broadcast to everyone in the room and autosave to this
            document.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={url ?? (minting ? "Generating link…" : "")}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
            aria-label="Design share link"
          />
          <Button
            size="sm"
            onClick={copy}
            disabled={!url}
            aria-label="Copy link"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {error ? (
          <p className="text-destructive text-xs">{error}</p>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-muted-foreground text-[11px]">
            Revoking turns the existing link off immediately and disconnects any
            guests in the room.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={revoke}
            disabled={!token || revoking}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Revoke
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function origin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}
