"use client";

import type { AdminInterviewerUser } from "@/contracts";

/** Generic compact table used by the admin/HR consoles. */
export function StaffTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
}) {
  return (
    <div className="border-border/60 overflow-hidden rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className={`px-3 py-2 font-medium ${i === columns.length - 1 ? "text-right" : ""}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-border/60 border-t">
              {r.cells.map((cell, i) => (
                <td
                  key={i}
                  className={`px-3 py-2 align-middle ${i === r.cells.length - 1 ? "text-right" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
      Active
    </span>
  ) : (
    <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
      Inactive
    </span>
  );
}

export function SpecializationBadges({
  specs,
}: {
  specs: AdminInterviewerUser["specializations"];
}) {
  if (specs.length === 0) {
    return <span className="text-muted-foreground text-xs italic">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {specs.map((s) => (
        <span
          key={s.interviewTypeId}
          className="border-border/60 bg-muted/40 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
        >
          <span className="text-foreground font-medium">
            {s.interviewType.label}
          </span>
          <span className="text-muted-foreground">{s.level}</span>
        </span>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="border-border/60 text-muted-foreground rounded-md border border-dashed py-10 text-center text-sm">
      <p className="text-foreground font-medium">{title}</p>
      <p className="mt-1 text-xs">{hint}</p>
    </div>
  );
}
