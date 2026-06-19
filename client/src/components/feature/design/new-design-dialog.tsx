"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DesignDbEngine, DesignDocKind } from "@/contracts";

interface NewDesignDialogProps {
  kind: DesignDocKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful POST + navigation kicks off. */
  onCreated?: () => void;
}

const DB_ENGINES: { id: DesignDbEngine; label: string; help: string }[] = [
  {
    id: "postgresql",
    label: "PostgreSQL",
    help: "Relational tables, PK/FK relationships",
  },
  {
    id: "mysql",
    label: "MySQL",
    help: "Relational tables with MySQL datatypes",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    help: "Document collections with embedded fields",
  },
];

/**
 * Pre-creation dialog for design documents.
 *
 * - `kind === "db_design"`: asks for title + DB engine. The engine drives the
 *   canvas mode in Phase 20 (relational vs document) and is required on the
 *   server (contract's discriminated union).
 * - `kind === "system_design"`: asks for title only.
 *
 * On submit POSTs `/design-docs` and navigates to the right canvas route.
 */
export function NewDesignDialog({
  kind,
  open,
  onOpenChange,
  onCreated,
}: NewDesignDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [engine, setEngine] = useState<DesignDbEngine>("postgresql");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Re-seed defaults when the dialog opens — synchronous setState here is
    // fine; we're driving local form state from an external open/kind pair.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(
      kind === "db_design" ? "Untitled schema" : "Untitled system design",
    );
    setEngine("postgresql");
    setError(null);
  }, [open, kind]);

  async function submit() {
    if (submitting) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give it a title.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res =
        kind === "db_design"
          ? await api.designDocs.create({
              kind: "db_design",
              title: trimmed,
              dbEngine: engine,
            })
          : await api.designDocs.create({
              kind: "system_design",
              title: trimmed,
            });
      onOpenChange(false);
      onCreated?.();
      const segment = kind === "db_design" ? "db" : "system";
      router.push(`/design/${segment}/${res.document.id}`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.body?.message ?? e.message
          : "Couldn't create the design.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  const isDb = kind === "db_design";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isDb ? "Start a database design" : "Start a system design"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="design-title">Title</Label>
            <Input
              id="design-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>

          {isDb ? (
            <fieldset
              aria-labelledby="db-engine-label"
              className="flex flex-col gap-2 border-0 p-0"
              disabled={submitting}
            >
              <legend
                id="db-engine-label"
                className="text-foreground text-sm font-medium"
              >
                Database engine
              </legend>
              <p className="text-muted-foreground text-xs">
                Drives the canvas mode — tables for SQL, JSON collections for
                Mongo.
              </p>
              <RadioGroup
                value={engine}
                onValueChange={(v) =>
                  typeof v === "string" && setEngine(v as DesignDbEngine)
                }
                className="gap-2"
              >
                {DB_ENGINES.map((opt) => {
                  const id = `engine-${opt.id}`;
                  return (
                    <label
                      key={opt.id}
                      htmlFor={id}
                      className="border-border/60 hover:bg-accent/40 has-data-checked:border-primary/60 has-data-checked:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors"
                    >
                      <RadioGroupItem
                        value={opt.id}
                        id={id}
                        className="mt-0.5"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-foreground text-sm">
                          {opt.label}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {opt.help}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </fieldset>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className={cn(
              "border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
            )}
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        <DialogFooter className="sm:items-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
