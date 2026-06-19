"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ShareSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The full candidate URL, or null while it's being minted. */
  url: string | null;
}

export function ShareSessionDialog({ open, onOpenChange, url }: ShareSessionDialogProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the user can still select + copy manually */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this session</DialogTitle>
          <DialogDescription>
            Send this link to the candidate — no login needed. While they have it
            open, your view becomes read-only and they can edit the files,
            terminal, and API client. When they leave (or close the tab), you
            regain control to review their work.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={url ?? "Generating link…"}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
            aria-label="Candidate share link"
          />
          <Button size="sm" onClick={copy} disabled={!url} aria-label="Copy link">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
