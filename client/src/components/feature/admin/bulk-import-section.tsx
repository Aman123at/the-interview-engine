"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FadeIn } from "@/components/feature/fade-in";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BULK_IMPORT_MAX_ROWS,
  BULK_MAX_TYPE_COLUMNS,
  LEVELS,
  type BulkRowError,
  type BulkTemplateKind,
  type InterviewType,
  type Level,
} from "@/contracts";

// ---------------------------------------------------------------------------
// Draft persistence (localStorage with a ~5 minute TTL)
// ---------------------------------------------------------------------------

const DRAFT_KEY = "hr.bulk-import.draft.v1";
const DRAFT_TTL_MS = 5 * 60 * 1000;
/** Loose upper bound to avoid pushing 500 rows × wide cells past localStorage. */
const DRAFT_MAX_BYTES = 250_000;

interface CandidateRow {
  name: string;
  externalId: string;
  /** Fixed-length slot array so edits keep stable per-cell identity. */
  types: string[]; // length BULK_MAX_TYPE_COLUMNS
}

interface InterviewerSpecSlot {
  typeKey: string;
  level: string; // "" | Level
}

interface InterviewerRow {
  displayName: string;
  email: string;
  specs: InterviewerSpecSlot[]; // length BULK_MAX_TYPE_COLUMNS
}

type Row = CandidateRow | InterviewerRow;

interface DraftEnvelope {
  kind: BulkTemplateKind;
  rows: Row[];
  savedAt: number;
}

function readDraft(): DraftEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftEnvelope>;
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.rows) ||
      (parsed.kind !== "candidates" && parsed.kind !== "interviewers")
    ) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed as DraftEnvelope;
  } catch {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function writeDraft(env: DraftEnvelope): void {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(env);
    if (json.length > DRAFT_MAX_BYTES) return; // silently skip oversize
    window.localStorage.setItem(DRAFT_KEY, json);
  } catch {
    /* ignore quota/serialization errors */
  }
}

function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Column shape — must match the server's template
// (`src/services/bulkTemplateService.ts`)
// ---------------------------------------------------------------------------

const CANDIDATE_TEXT_HEADERS = ["Candidate Name", "Candidate ID"] as const;
const INTERVIEWER_TEXT_HEADERS = ["Display Name", "Email"] as const;

function candidateTypeHeader(i: number): string {
  return i === 1 ? `Interview Type ${i} (required)` : `Interview Type ${i}`;
}
function interviewerLevelHeader(i: number): string {
  return i === 1 ? `Level ${i} (required)` : `Level ${i}`;
}

function expectedHeaders(kind: BulkTemplateKind): string[] {
  if (kind === "candidates") {
    const out: string[] = [...CANDIDATE_TEXT_HEADERS];
    for (let i = 1; i <= BULK_MAX_TYPE_COLUMNS; i++) {
      out.push(candidateTypeHeader(i));
    }
    return out;
  }
  const out: string[] = [...INTERVIEWER_TEXT_HEADERS];
  for (let i = 1; i <= BULK_MAX_TYPE_COLUMNS; i++) {
    out.push(candidateTypeHeader(i));
    out.push(interviewerLevelHeader(i));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Empty / shape helpers
// ---------------------------------------------------------------------------

function emptyCandidate(): CandidateRow {
  return {
    name: "",
    externalId: "",
    types: Array.from({ length: BULK_MAX_TYPE_COLUMNS }, () => ""),
  };
}
function emptyInterviewer(): InterviewerRow {
  return {
    displayName: "",
    email: "",
    specs: Array.from({ length: BULK_MAX_TYPE_COLUMNS }, () => ({
      typeKey: "",
      level: "",
    })),
  };
}

function isCandidateRow(r: Row): r is CandidateRow {
  return (r as CandidateRow).types !== undefined;
}

function rowIsBlank(r: Row): boolean {
  if (isCandidateRow(r)) {
    return (
      !r.name.trim() &&
      !r.externalId.trim() &&
      r.types.every((t) => !t.trim())
    );
  }
  return (
    !r.displayName.trim() &&
    !r.email.trim() &&
    r.specs.every((s) => !s.typeKey.trim() && !s.level.trim())
  );
}

// ---------------------------------------------------------------------------
// Parsing — SheetJS is dynamic-imported so the bundle pays only when used.
// ---------------------------------------------------------------------------

interface ParseResult {
  rows: Row[];
  missing: string[];
  unexpected: string[];
}

async function parseWorkbook(
  file: File,
  kind: BulkTemplateKind,
): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === "data") ?? wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], missing: expectedHeaders(kind), unexpected: [] };
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return { rows: [], missing: expectedHeaders(kind), unexpected: [] };
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const headerRowRaw = (matrix[0] ?? []) as unknown[];
  const headers = headerRowRaw.map((c) => String(c ?? "").trim());
  const expected = expectedHeaders(kind);
  const headerSet = new Set(headers);
  const missing = expected.filter((h) => !headerSet.has(h));
  const expectedSet = new Set(expected);
  const unexpected = headers.filter((h) => h && !expectedSet.has(h));
  if (missing.length > 0) return { rows: [], missing, unexpected };

  // Build a header → column index map so column order in the file doesn't
  // matter as long as every expected header is present.
  const idx = (h: string): number => headers.indexOf(h);
  const dataRows = matrix.slice(1).map((r) => r as unknown[]);

  const rows: Row[] = [];
  for (const r of dataRows) {
    const cell = (h: string): string => {
      const i = idx(h);
      if (i < 0) return "";
      const v = r[i];
      return v == null ? "" : String(v).trim();
    };
    if (kind === "candidates") {
      const candidate: CandidateRow = {
        name: cell("Candidate Name"),
        externalId: cell("Candidate ID"),
        types: Array.from({ length: BULK_MAX_TYPE_COLUMNS }, (_, i) =>
          cell(candidateTypeHeader(i + 1)),
        ),
      };
      if (!rowIsBlank(candidate)) rows.push(candidate);
    } else {
      const interviewer: InterviewerRow = {
        displayName: cell("Display Name"),
        email: cell("Email"),
        specs: Array.from({ length: BULK_MAX_TYPE_COLUMNS }, (_, i) => ({
          typeKey: cell(candidateTypeHeader(i + 1)),
          level: cell(interviewerLevelHeader(i + 1)),
        })),
      };
      if (!rowIsBlank(interviewer)) rows.push(interviewer);
    }
  }
  return { rows, missing: [], unexpected };
}

// ---------------------------------------------------------------------------
// Validation — mirrors server semantics so users see issues before POST.
// Per-cell errors are keyed by `${rowIndex}:${field}` to mirror BulkRowError.
// ---------------------------------------------------------------------------

type CellErrors = Map<string, string>;

function cellKey(rowIndex: number, field: string): string {
  return `${rowIndex}:${field}`;
}

function setErr(m: CellErrors, rowIndex: number, field: string, msg: string) {
  const k = cellKey(rowIndex, field);
  if (!m.has(k)) m.set(k, msg);
}

function isEmail(s: string): boolean {
  // permissive but blocks obviously-wrong shapes — server zod re-validates.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function validate(
  rows: Row[],
  kind: BulkTemplateKind,
  knownTypeKeys: Set<string>,
): CellErrors {
  const errs: CellErrors = new Map();
  const seenExternalId = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  rows.forEach((r, i) => {
    if (isCandidateRow(r)) {
      if (!r.name.trim()) setErr(errs, i, "name", "Name is required.");
      else if (r.name.length > 120)
        setErr(errs, i, "name", "Name is too long (max 120).");
      if (!r.externalId.trim())
        setErr(errs, i, "externalId", "Candidate ID is required.");
      else {
        const k = r.externalId.trim();
        const prev = seenExternalId.get(k);
        if (prev !== undefined) {
          setErr(
            errs,
            i,
            "externalId",
            `Duplicate Candidate ID (row ${prev + 1}).`,
          );
        } else {
          seenExternalId.set(k, i);
        }
      }
      const picked = new Set<string>();
      const filled = r.types.filter((t) => t.trim()).length;
      if (filled === 0) {
        setErr(
          errs,
          i,
          "interviewTypeKeys",
          "Pick at least one interview type.",
        );
      }
      r.types.forEach((t, ti) => {
        const v = t.trim();
        if (!v) {
          if (ti === 0 && filled === 0) {
            setErr(
              errs,
              i,
              `types.${ti}`,
              "Required (pick from the dropdown).",
            );
          }
          return;
        }
        if (!knownTypeKeys.has(v)) {
          setErr(errs, i, `types.${ti}`, `Unknown interview type "${v}".`);
          return;
        }
        if (picked.has(v)) {
          setErr(errs, i, `types.${ti}`, "Duplicate type on this row.");
          return;
        }
        picked.add(v);
      });
    } else {
      if (!r.displayName.trim())
        setErr(errs, i, "displayName", "Display Name is required.");
      else if (r.displayName.length > 120)
        setErr(errs, i, "displayName", "Display Name is too long (max 120).");
      if (!r.email.trim()) setErr(errs, i, "email", "Email is required.");
      else if (!isEmail(r.email))
        setErr(errs, i, "email", "Enter a valid email address.");
      else {
        const k = r.email.trim().toLowerCase();
        const prev = seenEmail.get(k);
        if (prev !== undefined) {
          setErr(errs, i, "email", `Duplicate email (row ${prev + 1}).`);
        } else {
          seenEmail.set(k, i);
        }
      }
      const picked = new Set<string>();
      const filled = r.specs.filter(
        (s) => s.typeKey.trim() || s.level.trim(),
      ).length;
      if (filled === 0) {
        setErr(
          errs,
          i,
          "specializations",
          "Pick at least one Interview Type + Level.",
        );
      }
      r.specs.forEach((s, si) => {
        const t = s.typeKey.trim();
        const l = s.level.trim();
        const partial = (!!t && !l) || (!t && !!l);
        if (partial) {
          if (!t)
            setErr(errs, i, `specs.${si}.typeKey`, "Pair a type with the level.");
          if (!l)
            setErr(errs, i, `specs.${si}.level`, "Pair a level with the type.");
          return;
        }
        if (!t && !l) {
          if (si === 0 && filled === 0) {
            setErr(errs, i, `specs.${si}.typeKey`, "Required.");
            setErr(errs, i, `specs.${si}.level`, "Required.");
          }
          return;
        }
        if (!knownTypeKeys.has(t)) {
          setErr(errs, i, `specs.${si}.typeKey`, `Unknown interview type "${t}".`);
        } else if (picked.has(t)) {
          setErr(errs, i, `specs.${si}.typeKey`, "Duplicate type on this row.");
        } else {
          picked.add(t);
        }
        if (!(LEVELS as readonly string[]).includes(l)) {
          setErr(errs, i, `specs.${si}.level`, "Level must be L1, L2 or L3.");
        }
      });
    }
  });
  void kind;
  return errs;
}

// ---------------------------------------------------------------------------
// Shape per-row for submission. Drops empty trailing type/level slots.
// ---------------------------------------------------------------------------

function shapeForSubmit(rows: Row[], kind: BulkTemplateKind): unknown[] {
  if (kind === "candidates") {
    return (rows as CandidateRow[]).map((r) => ({
      name: r.name.trim(),
      externalId: r.externalId.trim(),
      interviewTypeKeys: r.types.map((t) => t.trim()).filter(Boolean),
    }));
  }
  return (rows as InterviewerRow[]).map((r) => ({
    displayName: r.displayName.trim(),
    email: r.email.trim(),
    specializations: r.specs
      .filter((s) => s.typeKey.trim() && s.level.trim())
      .map((s) => ({
        interviewTypeKey: s.typeKey.trim(),
        level: s.level.trim() as Level,
      })),
  }));
}

// ---------------------------------------------------------------------------
// Map server BulkRowError → cell key in our grid. The server's `field` strings
// match what we produce in `validate`, so most map 1:1.
// ---------------------------------------------------------------------------

function applyServerErrors(
  rowErrors: BulkRowError[],
  base: CellErrors,
): CellErrors {
  const out = new Map(base);
  for (const e of rowErrors) {
    setErr(out, e.rowIndex, e.field, e.message);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

function CellInput({
  value,
  onChange,
  error,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <div className="min-w-0">
      <input
        aria-label={ariaLabel}
        aria-invalid={error ? "true" : undefined}
        title={error}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "border-input focus-visible:border-ring focus-visible:ring-ring/40 h-8 w-full rounded border bg-transparent px-2 py-1 text-sm outline-none transition-colors focus-visible:ring-2",
          error &&
            "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
        )}
      />
      {error ? (
        <p className="text-destructive mt-0.5 text-[11px] leading-tight">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CellSelect({
  value,
  onChange,
  options,
  error,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  ariaLabel: string;
}) {
  return (
    <div className="min-w-0">
      <select
        aria-label={ariaLabel}
        aria-invalid={error ? "true" : undefined}
        title={error}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-8 w-full rounded border px-2 py-1 text-sm outline-none transition-colors focus-visible:ring-2",
          error &&
            "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
        )}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-destructive mt-0.5 text-[11px] leading-tight">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function BulkImportSection({
  onImported,
}: {
  /** Called after a successful import so parent surfaces can re-fetch. */
  onImported?: (kind: BulkTemplateKind) => void;
}) {
  const [kind, setKind] = useState<BulkTemplateKind>("candidates");
  const [types, setTypes] = useState<InterviewType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [columnError, setColumnError] = useState<{
    missing: string[];
    unexpected: string[];
  } | null>(null);
  const [serverErrors, setServerErrors] = useState<BulkRowError[]>([]);
  const [downloading, setDownloading] = useState<BulkTemplateKind | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<DraftEnvelope | null>(null);
  const [generatedPasswords, setGeneratedPasswords] = useState<
    { email: string; tempPassword: string }[] | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  // Load type catalogue on mount (used for dropdown options + validation).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.admin.listInterviewTypes();
        if (cancelled) return;
        setTypes(r.types.filter((t) => t.isActive));
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof ApiError ? err.message : "Couldn't load interview types.";
        toast.error(msg);
      } finally {
        if (!cancelled) setTypesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Check for a resumable draft on mount.
  useEffect(() => {
    const d = readDraft();
    if (d && d.rows.length > 0) {
      setResumePrompt(d);
    }
  }, []);

  // Persist draft on every meaningful state change.
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    writeDraft({ kind, rows, savedAt: Date.now() });
  }, [rows, kind]);

  const knownTypeKeys = useMemo(
    () => new Set(types.map((t) => t.key)),
    [types],
  );

  const baseErrors = useMemo<CellErrors>(() => {
    if (!rows) return new Map();
    return validate(rows, kind, knownTypeKeys);
  }, [rows, kind, knownTypeKeys]);

  const errors = useMemo<CellErrors>(() => {
    if (serverErrors.length === 0) return baseErrors;
    return applyServerErrors(serverErrors, baseErrors);
  }, [baseErrors, serverErrors]);

  const invalidRowCount = useMemo(() => {
    if (!rows) return 0;
    const bad = new Set<number>();
    for (const k of errors.keys()) {
      const idx = Number.parseInt(k.split(":")[0] ?? "", 10);
      if (!Number.isNaN(idx)) bad.add(idx);
    }
    return bad.size;
  }, [errors, rows]);

  const canSave =
    !!rows && rows.length > 0 && errors.size === 0 && !importing && !parsing;

  // -- handlers -------------------------------------------------------------

  function resetSession() {
    setRows(null);
    setColumnError(null);
    setServerErrors([]);
    setGeneratedPasswords(null);
    clearDraft();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const onPickFile = useCallback(
    async (file: File) => {
      if (!file) return;
      if (
        !file.name.toLowerCase().endsWith(".xlsx") &&
        file.type !==
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        toast.error("Only .xlsx files are supported.");
        return;
      }
      setParsing(true);
      setServerErrors([]);
      setGeneratedPasswords(null);
      try {
        const r = await parseWorkbook(file, kind);
        if (r.missing.length > 0) {
          setColumnError({ missing: r.missing, unexpected: r.unexpected });
          setRows(null);
          return;
        }
        if (r.rows.length === 0) {
          setColumnError(null);
          setRows([]);
          toast.message("Sheet parsed", {
            description: "No data rows found — add some in the table below.",
          });
          return;
        }
        if (r.rows.length > BULK_IMPORT_MAX_ROWS) {
          toast.error(
            `Too many rows — the import is capped at ${BULK_IMPORT_MAX_ROWS}.`,
          );
          return;
        }
        setColumnError(null);
        setRows(r.rows);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Couldn't read the file. Make sure it's a valid .xlsx.";
        toast.error(msg);
      } finally {
        setParsing(false);
      }
    },
    [kind],
  );

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void onPickFile(file);
  }

  async function downloadTemplate(target: BulkTemplateKind) {
    setDownloading(target);
    try {
      const { blob, filename } = await api.hr.downloadBulkTemplate(target);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Couldn't download the template.";
      toast.error(msg);
    } finally {
      setDownloading(null);
    }
  }

  async function onSave() {
    if (!rows) return;
    setImporting(true);
    setServerErrors([]);
    try {
      const payload = {
        kind,
        rows: shapeForSubmit(rows, kind),
      };
      const res = await api.hr.bulkImport(payload);
      const label = kind === "candidates" ? "candidate(s)" : "interviewer(s)";
      toast.success(`Imported ${res.inserted} ${label}.`);
      if (res.generatedPasswords && res.generatedPasswords.length > 0) {
        setGeneratedPasswords(res.generatedPasswords);
      } else {
        resetSession();
      }
      onImported?.(kind);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.body) {
        // The server's error envelope is `{ error: { code, message, details: { rowErrors } } }`
        // (see contracts: `bulkImportErrorResponse`). Reach through the
        // wrapper to pull the row-level issues.
        const envelope = err.body as {
          error?: { details?: { rowErrors?: BulkRowError[] } };
          details?: { rowErrors?: BulkRowError[] };
        };
        const rowErrs =
          envelope.error?.details?.rowErrors ??
          envelope.details?.rowErrors ??
          [];
        if (rowErrs.length > 0) {
          setServerErrors(rowErrs);
          toast.error(
            `Couldn't import — ${rowErrs.length} issue${rowErrs.length === 1 ? "" : "s"} found. See the highlighted cells.`,
          );
          return;
        }
      }
      const msg =
        err instanceof ApiError ? err.message : "Import failed unexpectedly.";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  }

  function confirmDiscard() {
    resetSession();
    setDiscardOpen(false);
    toast.message("Bulk import cleared.");
  }

  // -- row mutators ---------------------------------------------------------

  function updateRow(i: number, patch: Partial<CandidateRow & InterviewerRow>) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const current = next[i];
      if (!current) return prev;
      // Clear any stale server-side error on the cells the user just touched.
      setServerErrors((es) =>
        es.filter((e) => {
          if (e.rowIndex !== i) return true;
          if ("name" in patch && e.field === "name") return false;
          if ("externalId" in patch && e.field === "externalId") return false;
          if ("displayName" in patch && e.field === "displayName") return false;
          if ("email" in patch && e.field === "email") return false;
          return true;
        }),
      );
      next[i] = { ...current, ...patch } as Row;
      return next;
    });
  }

  function updateTypeSlot(i: number, slot: number, value: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const current = next[i];
      if (!current || !isCandidateRow(current)) return prev;
      const types = current.types.slice();
      types[slot] = value;
      next[i] = { ...current, types };
      setServerErrors((es) =>
        es.filter((e) => !(e.rowIndex === i && e.field === `types.${slot}`)),
      );
      return next;
    });
  }

  function updateSpecSlot(
    i: number,
    slot: number,
    patch: Partial<InterviewerSpecSlot>,
  ) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const current = next[i];
      if (!current || isCandidateRow(current)) return prev;
      const specs = current.specs.slice();
      specs[slot] = { ...specs[slot]!, ...patch };
      next[i] = { ...current, specs };
      setServerErrors((es) =>
        es.filter(
          (e) =>
            !(
              e.rowIndex === i &&
              (e.field === `specs.${slot}.typeKey` ||
                e.field === `specs.${slot}.level`)
            ),
        ),
      );
      return next;
    });
  }

  function addRow() {
    setRows((prev) => {
      const list = prev ?? [];
      if (list.length >= BULK_IMPORT_MAX_ROWS) {
        toast.error(`Row cap reached (${BULK_IMPORT_MAX_ROWS}).`);
        return prev;
      }
      const fresh: Row =
        kind === "candidates" ? emptyCandidate() : emptyInterviewer();
      return [...list, fresh];
    });
  }

  function deleteRow(i: number) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      next.splice(i, 1);
      // Re-key server errors so rowIndex stays aligned.
      setServerErrors((es) =>
        es
          .filter((e) => e.rowIndex !== i)
          .map((e) =>
            e.rowIndex > i ? { ...e, rowIndex: e.rowIndex - 1 } : e,
          ),
      );
      if (next.length === 0) clearDraft();
      return next;
    });
  }

  // ---- render -----------------------------------------------------------

  const typeOptions = useMemo(
    () => types.map((t) => ({ value: t.key, label: t.label })),
    [types],
  );
  const levelOptions = useMemo(
    () => LEVELS.map((l) => ({ value: l, label: l })),
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <FadeIn y={8}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-foreground text-base font-semibold">
              Bulk import
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Onboard up to {BULK_IMPORT_MAX_ROWS} at a time from an Excel sheet.
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Bulk import kind"
            className="border-border/60 inline-flex overflow-hidden rounded-md border text-xs"
          >
            {(["candidates", "interviewers"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                aria-label={`Switch to ${k}`}
                onClick={() => {
                  if (kind === k) return;
                  if (rows && rows.length > 0) {
                    toast.message(
                      "Switching kind clears the current rows — discard or save first.",
                    );
                    return;
                  }
                  setKind(k);
                  setColumnError(null);
                  setServerErrors([]);
                }}
                className={cn(
                  "px-3 py-1.5 capitalize transition-colors",
                  kind === k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </FadeIn>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void downloadTemplate("candidates")}
          disabled={downloading !== null || typesLoading}
        >
          {downloading === "candidates" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Candidate template
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void downloadTemplate("interviewers")}
          disabled={downloading !== null || typesLoading}
        >
          {downloading === "interviewers" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Interviewer template
        </Button>
      </div>

      {/* Drag-and-drop zone ------------------------------------------------ */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={cn(
          "border-border/60 hover:border-primary/50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
          dragging && "border-primary bg-primary/5",
          parsing && "pointer-events-none opacity-70",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPickFile(f);
          }}
        />
        {parsing ? (
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        ) : (
          <Upload className="text-muted-foreground h-6 w-6" />
        )}
        <div>
          <p className="text-foreground text-sm font-medium">
            Drop the filled-in <code>.xlsx</code> here
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            or click to browse — we’ll validate columns and values before saving.
          </p>
        </div>
      </div>

      {/* Column-validation error (blocking) ------------------------------- */}
      {columnError ? (
        <div className="border-destructive/50 bg-destructive/5 text-destructive rounded-md border p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium">
                That sheet doesn’t match the {kind} template.
              </p>
              {columnError.missing.length > 0 ? (
                <p className="text-xs">
                  <span className="font-semibold">Missing columns:</span>{" "}
                  {columnError.missing.join(", ")}
                </p>
              ) : null}
              {columnError.unexpected.length > 0 ? (
                <p className="text-xs">
                  <span className="font-semibold">Unexpected columns:</span>{" "}
                  {columnError.unexpected.join(", ")}
                </p>
              ) : null}
              <p className="text-xs">
                Download a fresh template above and copy your data into it.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Review + edit table --------------------------------------------- */}
      {rows ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />
              {rows.length} row{rows.length === 1 ? "" : "s"} loaded •{" "}
              <span
                className={
                  invalidRowCount === 0 ? "text-primary" : "text-destructive"
                }
              >
                {invalidRowCount === 0
                  ? "all valid"
                  : `${invalidRowCount} need${invalidRowCount === 1 ? "s" : ""} fixing`}
              </span>
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addRow}>
                Add row
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDiscardOpen(true)}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Discard
              </Button>
              <Button size="sm" onClick={() => void onSave()} disabled={!canSave}>
                {importing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save ({rows.length})
              </Button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="border-border/60 text-muted-foreground rounded-md border border-dashed py-8 text-center text-sm">
              No rows yet — add one to start.
            </div>
          ) : kind === "candidates" ? (
            <CandidateGrid
              rows={rows as CandidateRow[]}
              errors={errors}
              typeOptions={typeOptions}
              onTextChange={(i, field, v) =>
                updateRow(i, { [field]: v } as Partial<CandidateRow>)
              }
              onTypeChange={updateTypeSlot}
              onDelete={deleteRow}
            />
          ) : (
            <InterviewerGrid
              rows={rows as InterviewerRow[]}
              errors={errors}
              typeOptions={typeOptions}
              levelOptions={levelOptions}
              onTextChange={(i, field, v) =>
                updateRow(i, { [field]: v } as Partial<InterviewerRow>)
              }
              onSpecChange={updateSpecSlot}
              onDelete={deleteRow}
            />
          )}
        </div>
      ) : null}

      {/* Generated passwords (interviewers only, shown once) -------------- */}
      <Dialog
        open={generatedPasswords !== null}
        onOpenChange={(o) => {
          if (!o) {
            setGeneratedPasswords(null);
            resetSession();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save these temporary passwords now</DialogTitle>
            <DialogDescription>
              These are shown ONCE and aren’t stored anywhere. Send each
              interviewer their credentials before closing this dialog.
            </DialogDescription>
          </DialogHeader>
          <div className="border-border/60 max-h-72 overflow-auto rounded border text-sm">
            <table className="w-full text-left">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Temporary password</th>
                </tr>
              </thead>
              <tbody>
                {generatedPasswords?.map((p) => (
                  <tr
                    key={p.email}
                    className="border-border/60 border-t font-mono text-xs"
                  >
                    <td className="px-3 py-2">{p.email}</td>
                    <td className="px-3 py-2">{p.tempPassword}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                const lines =
                  generatedPasswords
                    ?.map((p) => `${p.email}\t${p.tempPassword}`)
                    .join("\n") ?? "";
                void navigator.clipboard?.writeText(lines).then(
                  () => toast.success("Copied to clipboard."),
                  () => toast.error("Couldn’t copy — select and copy manually."),
                );
              }}
            >
              Copy all
            </Button>
            <Button
              onClick={() => {
                setGeneratedPasswords(null);
                resetSession();
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard warning ------------------------------------------------- */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard bulk import?</DialogTitle>
            <DialogDescription>
              This can’t be undone — your uploaded rows will be cleared and the
              5-minute draft removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={confirmDiscard}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resume-draft prompt --------------------------------------------- */}
      <Dialog
        open={resumePrompt !== null}
        onOpenChange={(o) => {
          if (!o) setResumePrompt(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resume your unsaved bulk import?</DialogTitle>
            <DialogDescription>
              {resumePrompt
                ? `Found a ${resumePrompt.kind} draft with ${resumePrompt.rows.length} row${resumePrompt.rows.length === 1 ? "" : "s"} from ${minutesAgo(resumePrompt.savedAt)}.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                clearDraft();
                setResumePrompt(null);
              }}
            >
              Discard draft
            </Button>
            <Button
              onClick={() => {
                if (resumePrompt) {
                  setKind(resumePrompt.kind);
                  setRows(resumePrompt.rows);
                  setColumnError(null);
                  setServerErrors([]);
                }
                setResumePrompt(null);
              }}
            >
              Resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function minutesAgo(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (m === 0) return "less than a minute ago";
  return `${m} minute${m === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Grids
// ---------------------------------------------------------------------------

function CandidateGrid({
  rows,
  errors,
  typeOptions,
  onTextChange,
  onTypeChange,
  onDelete,
}: {
  rows: CandidateRow[];
  errors: CellErrors;
  typeOptions: { value: string; label: string }[];
  onTextChange: (i: number, field: "name" | "externalId", v: string) => void;
  onTypeChange: (i: number, slot: number, v: string) => void;
  onDelete: (i: number) => void;
}) {
  return (
    <div className="border-border/60 overflow-x-auto rounded-md border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
          <tr>
            <th className="w-10 px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Candidate ID</th>
            {Array.from({ length: BULK_MAX_TYPE_COLUMNS }, (_, i) => (
              <th key={i} className="px-3 py-2 font-medium">
                Type {i + 1}
                {i === 0 ? <span className="text-destructive"> *</span> : null}
              </th>
            ))}
            <th className="w-10 px-3 py-2 text-right font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-border/60 border-t align-top">
              <td className="text-muted-foreground px-3 py-2 text-xs">
                {i + 1}
              </td>
              <td className="px-3 py-2">
                <CellInput
                  ariaLabel={`Row ${i + 1} name`}
                  value={r.name}
                  onChange={(v) => onTextChange(i, "name", v)}
                  error={errors.get(cellKey(i, "name"))}
                  placeholder="Jane Doe"
                />
              </td>
              <td className="px-3 py-2">
                <CellInput
                  ariaLabel={`Row ${i + 1} candidate id`}
                  value={r.externalId}
                  onChange={(v) => onTextChange(i, "externalId", v)}
                  error={errors.get(cellKey(i, "externalId"))}
                  placeholder="C-1234"
                />
              </td>
              {r.types.map((t, ti) => (
                <td key={ti} className="px-3 py-2">
                  <CellSelect
                    ariaLabel={`Row ${i + 1} type ${ti + 1}`}
                    value={t}
                    onChange={(v) => onTypeChange(i, ti, v)}
                    options={typeOptions}
                    error={
                      errors.get(cellKey(i, `types.${ti}`)) ??
                      (ti === 0
                        ? errors.get(cellKey(i, "interviewTypeKeys"))
                        : undefined)
                    }
                  />
                </td>
              ))}
              <td className="px-3 py-2 text-right">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete row ${i + 1}`}
                  onClick={() => onDelete(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InterviewerGrid({
  rows,
  errors,
  typeOptions,
  levelOptions,
  onTextChange,
  onSpecChange,
  onDelete,
}: {
  rows: InterviewerRow[];
  errors: CellErrors;
  typeOptions: { value: string; label: string }[];
  levelOptions: { value: string; label: string }[];
  onTextChange: (
    i: number,
    field: "displayName" | "email",
    v: string,
  ) => void;
  onSpecChange: (
    i: number,
    slot: number,
    patch: Partial<InterviewerSpecSlot>,
  ) => void;
  onDelete: (i: number) => void;
}) {
  return (
    <div className="border-border/60 overflow-x-auto rounded-md border">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
          <tr>
            <th className="w-10 px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Display name</th>
            <th className="px-3 py-2 font-medium">Email</th>
            {Array.from({ length: BULK_MAX_TYPE_COLUMNS }, (_, i) => (
              <th key={i} className="px-3 py-2 font-medium" colSpan={2}>
                Type {i + 1} / Level {i + 1}
                {i === 0 ? <span className="text-destructive"> *</span> : null}
              </th>
            ))}
            <th className="w-10 px-3 py-2 text-right font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-border/60 border-t align-top">
              <td className="text-muted-foreground px-3 py-2 text-xs">
                {i + 1}
              </td>
              <td className="px-3 py-2">
                <CellInput
                  ariaLabel={`Row ${i + 1} display name`}
                  value={r.displayName}
                  onChange={(v) => onTextChange(i, "displayName", v)}
                  error={errors.get(cellKey(i, "displayName"))}
                  placeholder="Alex Lee"
                />
              </td>
              <td className="px-3 py-2">
                <CellInput
                  ariaLabel={`Row ${i + 1} email`}
                  value={r.email}
                  onChange={(v) => onTextChange(i, "email", v)}
                  error={errors.get(cellKey(i, "email"))}
                  placeholder="alex@company.com"
                />
              </td>
              {r.specs.map((s, si) => (
                <Cells key={si}>
                  <td className="px-3 py-2">
                    <CellSelect
                      ariaLabel={`Row ${i + 1} type ${si + 1}`}
                      value={s.typeKey}
                      onChange={(v) =>
                        onSpecChange(i, si, { typeKey: v })
                      }
                      options={typeOptions}
                      error={
                        errors.get(cellKey(i, `specs.${si}.typeKey`)) ??
                        (si === 0
                          ? errors.get(cellKey(i, "specializations"))
                          : undefined)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <CellSelect
                      ariaLabel={`Row ${i + 1} level ${si + 1}`}
                      value={s.level}
                      onChange={(v) => onSpecChange(i, si, { level: v })}
                      options={levelOptions}
                      error={errors.get(cellKey(i, `specs.${si}.level`))}
                    />
                  </td>
                </Cells>
              ))}
              <td className="px-3 py-2 text-right">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete row ${i + 1}`}
                  onClick={() => onDelete(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cells({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
