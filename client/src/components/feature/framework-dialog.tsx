"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api, ApiError } from "@/lib/api";
import { FrameworkIcon } from "@/lib/framework-icon";
import {
  seedSelection,
  validateSelection,
  type CustomizationSelection,
} from "@/lib/customization";
import type { CandidateDto, FrameworkDef } from "@/contracts";
import { CandidatePicker } from "@/components/feature/candidate-picker";
import { useAuth } from "@/lib/auth/auth-context";

type FrameworkGroup = FrameworkDef["groups"][number];

interface FrameworkDialogProps {
  framework: FrameworkDef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FrameworkDialog({
  framework,
  open,
  onOpenChange,
}: FrameworkDialogProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [selection, setSelection] = useState<CustomizationSelection>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<CandidateDto | null>(null);

  // Re-seed defaults whenever a different framework is opened. The state
  // here is derived from `framework` + the open event, not synchronized with
  // an external system — the rule's guidance doesn't fit this case.
  useEffect(() => {
    if (open && framework) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelection(seedSelection(framework));
      setErrors({});
      setConflict(null);
      setCandidate(null);
    }
  }, [open, framework]);

  function setValue(id: string, value: string | string[]) {
    setSelection((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function onStart() {
    if (!framework || submitting) return;

    const v = validateSelection(framework, selection);
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setSubmitting(true);
    setConflict(null);
    try {
      const res = await api.sessions.create({
        framework: framework.id,
        customization: selection,
        ...(candidate ? { candidateRecordId: candidate.id } : {}),
      });
      onOpenChange(false);
      router.push(`/session/${res.session.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(
          e.body?.message ??
            "You already have an active session. Resume or close it before starting a new one.",
        );
      }
      // Non-409 errors already surfaced as toasts by the API client? No —
      // api.sessions.create is silent. Show a generic inline error.
      else if (e instanceof ApiError) {
        setConflict(
          e.body?.message ??
            e.message ??
            "Couldn't start the sandbox. Please try again.",
        );
      } else {
        setConflict("Couldn't start the sandbox. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Wider than the default sm:max-w-sm so options breathe.
        className="sm:max-w-lg"
        // Keep focus inside the dialog; base-ui handles ESC + outside click.
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            {framework ? (
              <span
                className="bg-primary/10 text-primary inline-flex h-9 w-9 items-center justify-center rounded-md"
                aria-hidden
              >
                <FrameworkIcon id={framework.id} className="h-4 w-4" />
              </span>
            ) : null}
            <div className="flex flex-col gap-0.5">
              <DialogTitle>
                {framework ? `Start a ${framework.label} sandbox` : "Sandbox"}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        {framework ? (
          <div
            className="-mx-1 max-h-[55vh] overflow-y-auto px-1"
            tabIndex={-1}
          >
            <div className="flex flex-col gap-6 py-2">
              {user?.role === "interviewer" ? (
                <fieldset
                  className="flex flex-col gap-2 border-0 p-0"
                  disabled={submitting}
                >
                  <legend className="text-foreground text-sm font-medium">
                    Candidate
                    <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
                      optional
                    </span>
                  </legend>
                  <p className="text-muted-foreground text-xs">
                    Only candidates tagged with your interview type(s) appear
                    here. You can also attach one later from the close dialog.
                  </p>
                  <CandidatePicker
                    value={candidate}
                    onChange={setCandidate}
                    disabled={submitting}
                  />
                </fieldset>
              ) : null}

              {framework.groups.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No customizations for this framework — just hit Start.
                </p>
              ) : (
                framework.groups.map((g) => (
                  <GroupField
                    key={g.id}
                    group={g}
                    value={selection[g.id]}
                    error={errors[g.id]}
                    disabled={submitting}
                    onChange={(v) => setValue(g.id, v)}
                  />
                ))
              )}
            </div>
          </div>
        ) : null}

        {conflict ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{conflict}</span>
          </div>
        ) : null}

        <DialogFooter className="sm:items-center">
          <p className="text-muted-foreground hidden text-[11px] sm:mr-auto sm:block">
            Defaults applied — adjust before starting.
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onStart} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                Starting…
              </>
            ) : (
              "Start"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface GroupFieldProps {
  group: FrameworkGroup;
  value: string | string[] | undefined;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string | string[]) => void;
}

function GroupField({
  group: g,
  value,
  error,
  disabled,
  onChange,
}: GroupFieldProps) {
  const headingId = `cust-${g.id}-label`;
  const errorId = error ? `cust-${g.id}-error` : undefined;
  const optional = !g.required;

  return (
    <fieldset
      aria-labelledby={headingId}
      aria-describedby={errorId}
      className="flex flex-col gap-2 border-0 p-0"
      disabled={disabled}
    >
      <div className="flex items-baseline justify-between gap-3">
        <legend id={headingId} className="text-foreground text-sm font-medium">
          {g.label}
          {optional ? (
            <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
              optional
            </span>
          ) : null}
        </legend>
        {g.type === "radio" && optional && value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px] underline-offset-2 hover:underline"
            disabled={disabled}
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Clear
          </button>
        ) : null}
      </div>
      {g.type === "radio" ? (
        <RadioField
          group={g}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      ) : (
        <CheckboxField
          group={g}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
        />
      )}

      {error ? (
        <p id={errorId} className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function RadioField({
  group: g,
  value,
  onChange,
}: {
  group: FrameworkGroup;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(typeof v === "string" ? v : "")}
      className="gap-2"
    >
      {g.options.map((opt) => {
        const id = `cust-${g.id}-${opt.id}`;
        return (
          <label
            key={opt.id}
            htmlFor={id}
            className="border-border/60 hover:bg-accent/40 has-data-checked:border-primary/60 has-data-checked:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors"
          >
            <RadioGroupItem value={opt.id} id={id} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground text-sm">{opt.label}</span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

function CheckboxField({
  group: g,
  value,
  onChange,
}: {
  group: FrameworkGroup;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(optId: string, checked: boolean) {
    if (checked) {
      if (value.includes(optId)) return;
      onChange([...value, optId]);
    } else {
      onChange(value.filter((v) => v !== optId));
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {g.options.map((opt) => {
        const id = `cust-${g.id}-${opt.id}`;
        const checked = value.includes(opt.id);
        return (
          <label
            key={opt.id}
            htmlFor={id}
            className="border-border/60 hover:bg-accent/40 has-data-checked:border-primary/60 has-data-checked:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors"
          >
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(v) => toggle(opt.id, v === true)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground text-sm">{opt.label}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
