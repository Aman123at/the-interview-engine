/**
 * Phase 30e — HR cross-interviewer reporting + xlsx export.
 *
 *   GET /hr/sessions             — paginated, filterable list across all interviewers.
 *   GET /hr/sessions/export.xlsx — same filters + REQUIRED date range, streamed xlsx.
 *
 * `requireRole('hr')` on every route. Reads only — no schema changes.
 *
 * The export uses exceljs' streaming writer (`workbook.xlsx.write(res)`) so a
 * large date range doesn't buffer the whole file in memory.
 */
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireRole } from '@/middleware/auth.js';
import {
  bulkImportRequest,
  bulkTemplateQuery,
  hrSessionsExportQuery,
  hrSessionsQuery,
  type BulkImportResponse,
  type HrSessionRow,
  type HrSessionsResponse,
} from '@/contracts/index.js';
import { interviewTypesDal, sessionsDal } from '@/dal/index.js';
import { buildBulkTemplateXlsx, templateFilename } from '@/services/bulkTemplateService.js';
import { runBulkImport } from '@/services/bulkImportService.js';

export const hrRouter = Router();
hrRouter.use(requireAuth, requireRole('hr'));

function toDateOrNull(v: Date | string | null): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}

// ---------- GET /hr/sessions ----------
hrRouter.get('/sessions', async (req, res, next) => {
  try {
    const q = hrSessionsQuery.parse({
      interviewerSearch: req.query.interviewerSearch,
      candidateSearch: req.query.candidateSearch,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    const { items, nextCursor } = await sessionsDal.listForHr({
      interviewerSearch: q.interviewerSearch,
      candidateSearch: q.candidateSearch,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      limit: q.limit,
      cursor: q.cursor ?? null,
    });
    const body: HrSessionsResponse = {
      items: items.map(
        (r): HrSessionRow => ({
          id: r.session.id,
          framework: r.session.framework,
          status: r.session.status,
          startedAt: r.session.startedAt,
          endedAt: r.session.endedAt,
          candidateRating: r.session.candidateRating,
          interviewer: r.interviewer,
          candidate: r.candidate,
          candidateInterviewTypes: r.candidateInterviewTypes,
        }),
      ),
      nextCursor,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// ---------- GET /hr/sessions/export.xlsx ----------
hrRouter.get('/sessions/export.xlsx', async (req, res, next) => {
  try {
    const q = hrSessionsExportQuery.parse({
      interviewerSearch: req.query.interviewerSearch,
      candidateSearch: req.query.candidateSearch,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    });

    // Filename — yyyy-mm-dd_yyyy-mm-dd.xlsx in UTC for stability.
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const filename = `interview-sessions_${fmt(q.dateFrom)}_${fmt(q.dateTo)}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Streaming writer — flushes rows as they're added so a wide date range
    // doesn't sit in memory before the response starts.
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
    const sheet = workbook.addWorksheet('Sessions');

    sheet.columns = [
      { header: 'Session',           key: 'sessionShort', width: 14 },
      { header: 'Interviewer Name',  key: 'interviewerName', width: 26 },
      { header: 'Interviewer Email', key: 'interviewerEmail', width: 32 },
      { header: 'Candidate Name',    key: 'candidateName', width: 26 },
      { header: 'Candidate ID',      key: 'candidateExternalId', width: 18 },
      { header: 'Interview Type',    key: 'interviewType', width: 22 },
      { header: 'Framework',         key: 'framework', width: 14 },
      { header: 'Status',            key: 'status', width: 14 },
      { header: 'Started At',        key: 'startedAt', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
      { header: 'Ended At',          key: 'endedAt',   width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
      { header: 'Rating',            key: 'rating', width: 8 },
    ];

    // Style the header row.
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' }, // slate-800
    };
    header.alignment = { vertical: 'middle', horizontal: 'left' };
    header.height = 22;
    header.commit();

    // Page through the result set. A practical date range is a few hundred
    // rows; cap at 5000 per export to avoid runaway queries.
    const HARD_CAP = 5000;
    let cursor: string | null = null;
    let written = 0;
    do {
      const { items, nextCursor } = await sessionsDal.listForHr({
        interviewerSearch: q.interviewerSearch,
        candidateSearch: q.candidateSearch,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        limit: 200,
        cursor,
      });
      for (const r of items) {
        const row = sheet.addRow({
          sessionShort: r.session.id.slice(0, 8),
          interviewerName: r.interviewer?.displayName ?? '',
          interviewerEmail: r.interviewer?.email ?? '',
          candidateName: r.candidate?.name ?? '',
          candidateExternalId: r.candidate?.externalId ?? '',
          interviewType: r.candidateInterviewTypes.map((t) => t.label).join(', '),
          framework: r.session.framework,
          status: r.session.status,
          startedAt: toDateOrNull(r.session.startedAt),
          endedAt: toDateOrNull(r.session.endedAt),
          rating: r.session.candidateRating ?? '',
        });
        row.commit();
        written += 1;
        if (written >= HARD_CAP) break;
      }
      cursor = nextCursor;
      if (written >= HARD_CAP) break;
    } while (cursor);

    await sheet.commit();
    await workbook.commit();
    req.log.info(
      { written, dateFrom: q.dateFrom, dateTo: q.dateTo },
      'hr exported sessions xlsx',
    );
  } catch (err) {
    next(err);
  }
});

// ---------- GET /hr/bulk/template?kind=candidates|interviewers ----------
hrRouter.get('/bulk/template', async (req, res, next) => {
  try {
    const { kind } = bulkTemplateQuery.parse({ kind: req.query.kind });
    const types = await interviewTypesDal.list();
    const xlsx = await buildBulkTemplateXlsx(kind, types);
    const filename = templateFilename(kind);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(xlsx.length));
    res.end(xlsx);
  } catch (err) {
    next(err);
  }
});

// ---------- POST /hr/bulk/import ----------
hrRouter.post('/bulk/import', async (req, res, next) => {
  try {
    // Body shape (kind discriminator + row arrays) is contract-validated. Any
    // bad TS/email/level here surfaces as a 400 via the global handler before
    // we touch the DB.
    const body = bulkImportRequest.parse(req.body);
    const result = await runBulkImport(body, req.user!.id);
    if (!result.ok) {
      // 422 with the FULL row-error list — no inserts happened.
      res.status(422).json({
        error: {
          code: 'VALIDATION',
          message: 'Bulk import has row-level errors. Fix the file and retry.',
          requestId: req.id,
          details: { rowErrors: result.rowErrors },
        },
      });
      return;
    }
    const resp: BulkImportResponse = {
      kind: result.kind,
      inserted: result.inserted,
      created: result.created,
      ...(result.generatedPasswords ? { generatedPasswords: result.generatedPasswords } : {}),
    };
    req.log.info(
      { kind: result.kind, inserted: result.inserted, hrUserId: req.user!.id },
      'hr bulk import succeeded',
    );
    res.status(201).json(resp);
  } catch (err) {
    next(err);
  }
});
