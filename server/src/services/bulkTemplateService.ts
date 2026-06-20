/**
 * Phase 35 — HR bulk-onboarding xlsx templates.
 *
 * Builds two flavours via exceljs:
 *   - candidates:    Name, Candidate ID, Interview Type 1..N
 *   - interviewers:  Display Name, Email, Type 1 + Level 1, .., Type N + Level N
 *
 * A hidden "Reference" sheet carries the catalogue keys (loaded from
 * `interview_types WHERE is_active`) and the static L1/L2/L3 levels, then
 * every type/level cell in the Data sheet gets list data-validation pointing
 * at those ranges so Excel renders a dropdown and rejects off-list values.
 */
import ExcelJS from 'exceljs';
import { BULK_MAX_TYPE_COLUMNS, LEVELS, type BulkTemplateKind } from '@/contracts/index.js';
import type { InterviewType } from '@/db/schema/index.js';

/** Number of dropdown-validated DATA rows rendered in the template. */
const TEMPLATE_DATA_ROWS = 200;

function colLetter(i: number): string {
  // 1-indexed -> A, B, C, ..., AA, AB, ...
  let s = '';
  let n = i;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Build the workbook in memory and return the xlsx bytes. The result is small
 * (a few KiB even with 200 rows of validation), so a buffer is fine — no need
 * for the streaming writer used by the sessions export.
 */
export async function buildBulkTemplateXlsx(
  kind: BulkTemplateKind,
  types: InterviewType[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'interview-sandbox';
  wb.created = new Date();

  // ---- Hidden Reference sheet ---------------------------------------------
  const ref = wb.addWorksheet('Reference', { state: 'hidden' });
  // Column A drives the type dropdown — it holds the user-friendly LABEL so
  // candidates see e.g. "Node", "C++" in the picker (the underlying key is
  // mapped server-side from the label on import).
  ref.columns = [
    { header: 'Type Label', key: 'label', width: 28 },
    { header: 'Type Key',   key: 'key',   width: 20 },
    { header: 'Level',      key: 'level', width: 10 },
  ];
  const activeTypes = types.filter((t) => t.isActive);
  activeTypes.forEach((t) => ref.addRow({ label: t.label, key: t.key }));
  LEVELS.forEach((l, i) => {
    const r = ref.getRow(i + 2);
    r.getCell('level').value = l;
    r.commit();
  });

  // Build the absolute (sheet-qualified) ranges Excel needs in a formula.
  const typeRange =
    activeTypes.length > 0
      ? `Reference!$A$2:$A$${activeTypes.length + 1}`
      : 'Reference!$A$2:$A$2';
  const levelRange = `Reference!$C$2:$C$${LEVELS.length + 1}`;

  // ---- Visible Data sheet --------------------------------------------------
  const data = wb.addWorksheet('Data');

  let columns: Array<{ header: string; key: string; width: number; kind: 'text' | 'type' | 'level' }>;
  if (kind === 'candidates') {
    columns = [
      { header: 'Candidate Name', key: 'name',       width: 28, kind: 'text' },
      { header: 'Candidate ID',   key: 'externalId', width: 22, kind: 'text' },
    ];
    for (let i = 1; i <= BULK_MAX_TYPE_COLUMNS; i += 1) {
      columns.push({
        header: i === 1 ? `Interview Type ${i} (required)` : `Interview Type ${i}`,
        key: `type${i}`,
        width: 22,
        kind: 'type',
      });
    }
  } else {
    columns = [
      { header: 'Display Name', key: 'displayName', width: 28, kind: 'text' },
      { header: 'Email',        key: 'email',       width: 32, kind: 'text' },
    ];
    for (let i = 1; i <= BULK_MAX_TYPE_COLUMNS; i += 1) {
      columns.push({
        header: i === 1 ? `Interview Type ${i} (required)` : `Interview Type ${i}`,
        key: `type${i}`,
        width: 22,
        kind: 'type',
      });
      columns.push({
        header: i === 1 ? `Level ${i} (required)` : `Level ${i}`,
        key: `level${i}`,
        width: 10,
        kind: 'level',
      });
    }
  }

  data.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeader(data);

  // Per-column list data-validation across the visible data rows. exceljs
  // assigns validation by writing to `cell.dataValidation`.
  columns.forEach((c, idx) => {
    if (c.kind === 'text') return;
    const letter = colLetter(idx + 1);
    const formula = c.kind === 'type' ? `=${typeRange}` : `=${levelRange}`;
    for (let row = 2; row <= TEMPLATE_DATA_ROWS + 1; row += 1) {
      data.getCell(`${letter}${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'Invalid value',
        error:
          c.kind === 'type'
            ? 'Pick an interview type from the dropdown.'
            : 'Level must be L1, L2 or L3.',
      };
    }
  });

  // ---- Instructions sheet --------------------------------------------------
  const help = wb.addWorksheet('Instructions');
  help.columns = [{ header: 'How to fill this template', key: 'note', width: 100 }];
  styleHeader(help);
  const notes =
    kind === 'candidates'
      ? [
          'Fill in one candidate per row on the "Data" sheet.',
          'Candidate Name and Candidate ID are required and must be unique per Candidate ID.',
          'Pick at least one Interview Type from the dropdown (Type 1 is required).',
          'Leave Type 2 / Type 3 blank if not applicable.',
          'Upload the saved file via the HR bulk-import dialog.',
        ]
      : [
          'Fill in one interviewer per row on the "Data" sheet.',
          'Display Name and Email are required; Email must be unique.',
          'Pick at least one Interview Type + matching Level pair (Type 1 + Level 1 are required).',
          'Levels are L1, L2 or L3 — pick from the dropdown.',
          'A temporary password is generated server-side and returned ONCE in the import response.',
        ];
  notes.forEach((n) => help.addRow({ note: n }));

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

export function templateFilename(kind: BulkTemplateKind): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `bulk-${kind}-template_${stamp}.xlsx`;
}
