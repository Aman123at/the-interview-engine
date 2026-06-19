/**
 * E2E coverage for the HR Bulk Import UI (Phase 36).
 *
 * Run with: `pnpm test:bulk`.  This config (`playwright.bulk.config.ts`) boots
 * its own `next dev` on :3100 and the spec mocks every backend call via
 * `page.route`, so the suite needs no live server and no env vars.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";

const FIXTURES = resolve(process.cwd(), "tests", "bulk", "fixtures");

const API = "http://localhost:4000";

// Interview-type catalogue the mocked /admin/interview-types returns. Type
// keys MUST be a superset of every key used in the fixtures.
const TYPES = [
  { id: "00000000-0000-0000-0000-000000000001", key: "javascript", label: "JavaScript", isActive: true },
  { id: "00000000-0000-0000-0000-000000000002", key: "react",      label: "React",      isActive: true },
  { id: "00000000-0000-0000-0000-000000000003", key: "python",     label: "Python",     isActive: true },
];

const HR_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "hr@example.com",
  displayName: "HR Tester",
  role: "hr" as const,
};

// Shared CORS headers so the cross-origin (page :3100 → API :4000) fetches
// expose JSON + Content-Disposition to in-page JS. Required for the download
// helper to read the server-stamped filename.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "http://localhost:3100",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  });
}

/**
 * Intercept the cross-origin CORS preflight that the browser fires before
 * any POST/PATCH with custom headers. Returning 204 + CORS headers lets the
 * follow-up real request reach our other mocks.
 */
async function answerPreflight(page: Page) {
  await page.route(`${API}/**/*`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
    } else {
      await route.fallback();
    }
  });
}

async function installCoreMocks(page: Page) {
  await answerPreflight(page);
  // Auth + role gate — pre-seed the access token so AuthProvider hits /auth/me.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("isb.accessToken", "mock-access-token");
    } catch {
      /* ignore */
    }
  });

  await page.route(`${API}/auth/me`, (route) =>
    json(route, { user: HR_USER, specializations: undefined }),
  );
  await page.route(`${API}/auth/refresh`, (route) =>
    json(route, { user: HR_USER, accessToken: "mock-access-token" }),
  );
  await page.route(`${API}/auth/logout`, (route) => json(route, {}));

  await page.route(`${API}/admin/interview-types`, (route) =>
    json(route, { types: TYPES }),
  );

  // After a successful import the parent re-mounts CandidateSection /
  // InterviewerSection — answer the list endpoints with empty arrays so they
  // don't error.
  await page.route(/\/candidates(\?.*)?$/, (route) =>
    json(route, { candidates: [] }),
  );
  await page.route(/\/admin\/interviewers(\?.*)?$/, (route) =>
    json(route, { users: [] }),
  );
  await page.route(/\/admin\/hrs(\?.*)?$/, (route) =>
    json(route, { users: [] }),
  );
}

async function gotoBulkTab(page: Page) {
  await page.goto("/hr");
  await page.getByRole("tab", { name: /Bulk import/i }).click();
  await expect(
    page.getByRole("heading", { name: "Bulk import", level: 2 }),
  ).toBeVisible();
}

function fixturePath(name: string): string {
  return resolve(FIXTURES, name);
}

function fileInput(page: Page) {
  return page.locator('input[type="file"]');
}

// ---------------------------------------------------------------------------

test.describe("Bulk import — entry + template download", () => {
  test.beforeEach(async ({ page }) => {
    await installCoreMocks(page);
  });

  test("downloads both kinds of templates", async ({ page }) => {
    // Tiny stub xlsx body — the spec doesn't inspect its content, it just
    // verifies the download fires with the server-stamped filename per kind.
    await page.route(/\/hr\/bulk\/template\?kind=(\w+)/, (route) => {
      const url = new URL(route.request().url());
      const kind = url.searchParams.get("kind") ?? "unknown";
      return route.fulfill({
        status: 200,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers: {
          ...CORS_HEADERS,
          "Content-Disposition": `attachment; filename="bulk-${kind}-template_2026-06-15.xlsx"`,
        },
        body: Buffer.from("PK\x03\x04 stub xlsx bytes"),
      });
    });

    await gotoBulkTab(page);

    for (const label of ["Candidate template", "Interviewer template"] as const) {
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: label }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(
        /^bulk-(candidates|interviewers)-template_2026-06-15\.xlsx$/,
      );
    }
  });
});

// ---------------------------------------------------------------------------

test.describe("Bulk import — upload + column validation", () => {
  test.beforeEach(async ({ page }) => {
    await installCoreMocks(page);
  });

  test("valid candidate fixture renders the review grid", async ({ page }) => {
    await gotoBulkTab(page);
    await fileInput(page).setInputFiles(fixturePath("candidates-valid.xlsx"));

    // 2 rows loaded, all valid → Save enabled.
    await expect(page.getByText(/2 rows loaded/)).toBeVisible();
    await expect(page.getByText("all valid")).toBeVisible();
    await expect(page.getByRole("button", { name: /Save \(2\)/ })).toBeEnabled();

    // Cells reflect the fixture content.
    await expect(page.getByLabel("Row 1 name")).toHaveValue("Ada Lovelace");
    await expect(page.getByLabel("Row 1 candidate id")).toHaveValue("C-1001");
    await expect(page.getByLabel("Row 2 name")).toHaveValue("Grace Hopper");
  });

  test("missing-column fixture blocks the review table", async ({ page }) => {
    await gotoBulkTab(page);
    await fileInput(page).setInputFiles(
      fixturePath("candidates-missing-column.xlsx"),
    );

    await expect(
      page.getByText(/doesn’t match the candidates template/),
    ).toBeVisible();
    await expect(page.getByText(/Missing columns:/)).toBeVisible();
    // The fixture removes Candidate ID + the required Type 1 header.
    await expect(page.getByText(/Candidate ID/)).toBeVisible();
    await expect(page.getByText(/Interview Type 1 \(required\)/)).toBeVisible();
    // Unexpected branch also reported.
    await expect(page.getByText(/Unexpected columns:.*Type 1/)).toBeVisible();
    // The review grid never rendered.
    await expect(page.getByRole("button", { name: /Save \(/ })).toHaveCount(0);
  });

  test("invalid-values fixture flags the right cells and editing clears errors", async ({
    page,
  }) => {
    await gotoBulkTab(page);
    await fileInput(page).setInputFiles(fixturePath("candidates-invalid.xlsx"));

    // 3 rows loaded, all three have at least one issue.
    await expect(page.getByText(/3 rows loaded/)).toBeVisible();
    await expect(page.getByText(/3 needs? fixing/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Save \(3\)/ })).toBeDisabled();

    // Row 1 — empty name surfaces the required error.
    await expect(page.getByLabel("Row 1 name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByText("Name is required.")).toBeVisible();

    // Row 2 — unknown type key on slot 0.
    await expect(page.getByLabel("Row 2 type 1")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      page.getByText(/Unknown interview type "not-a-real-type"\./),
    ).toBeVisible();

    // Row 3 — duplicate Candidate ID with row 1.
    await expect(page.getByLabel("Row 3 candidate id")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      page.getByText(/Duplicate Candidate ID \(row 1\)\./),
    ).toBeVisible();

    // Fix row 2 by picking a real type from the dropdown.
    await page.getByLabel("Row 2 type 1").selectOption("javascript");
    await expect(page.getByLabel("Row 2 type 1")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );

    // Delete row 1 (empty-name row) — duplicate marker on the remaining row
    // disappears because the dup pair is gone.
    await page.getByRole("button", { name: "Delete row 1" }).click();
    await expect(page.getByText(/2 rows loaded/)).toBeVisible();
    await expect(
      page.getByText(/Duplicate Candidate ID \(row 1\)\./),
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------

test.describe("Bulk import — save + server error mapping", () => {
  test.beforeEach(async ({ page }) => {
    await installCoreMocks(page);
  });

  test("candidates save (success) clears the draft and the grid", async ({
    page,
  }) => {
    let importBody: unknown = null;
    await page.route(`${API}/hr/bulk/import`, async (route) => {
      importBody = JSON.parse(route.request().postData() ?? "{}");
      return json(
        route,
        {
          kind: "candidates",
          inserted: 2,
          created: [],
        },
        201,
      );
    });

    await gotoBulkTab(page);
    await fileInput(page).setInputFiles(fixturePath("candidates-valid.xlsx"));
    await expect(page.getByRole("button", { name: /Save \(2\)/ })).toBeEnabled();
    await page.getByRole("button", { name: /Save \(2\)/ }).click();

    // The component clears local state on success → review grid is gone.
    await expect(page.getByRole("button", { name: /Save \(/ })).toHaveCount(0, {
      timeout: 10_000,
    });

    // Draft has been wiped from localStorage.
    const draft = await page.evaluate(() =>
      window.localStorage.getItem("hr.bulk-import.draft.v1"),
    );
    expect(draft).toBeNull();

    // Sanity: payload shape matches the server contract.
    expect(importBody).toMatchObject({
      kind: "candidates",
      rows: [
        {
          name: "Ada Lovelace",
          externalId: "C-1001",
          interviewTypeKeys: ["javascript", "react"],
        },
        {
          name: "Grace Hopper",
          externalId: "C-1002",
          interviewTypeKeys: ["python"],
        },
      ],
    });
  });

  test("422 row errors map back onto the offending cells", async ({ page }) => {
    await page.route(`${API}/hr/bulk/import`, (route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: {
            code: "VALIDATION",
            message: "Row validation failed.",
            details: {
              rowErrors: [
                {
                  rowIndex: 0,
                  field: "externalId",
                  message: "Candidate ID already exists.",
                },
                {
                  rowIndex: 1,
                  field: "name",
                  message: "Name is reserved.",
                },
              ],
            },
          },
        }),
      }),
    );

    await gotoBulkTab(page);
    await fileInput(page).setInputFiles(fixturePath("candidates-valid.xlsx"));
    await page.getByRole("button", { name: /Save \(2\)/ }).click();

    // Both server messages now sit under the right cells.
    await expect(
      page.getByText("Candidate ID already exists."),
    ).toBeVisible();
    await expect(page.getByText("Name is reserved.")).toBeVisible();

    // The grid stays visible so the user can fix and retry.
    await expect(page.getByRole("button", { name: /Save \(2\)/ })).toBeVisible();

    // Editing the externalId cell clears the server error on that cell.
    await page.getByLabel("Row 1 candidate id").fill("C-9999");
    await expect(
      page.getByText("Candidate ID already exists."),
    ).toHaveCount(0);
  });

  test("interviewers save surfaces generated temp passwords once", async ({
    page,
  }) => {
    await page.route(`${API}/hr/bulk/import`, (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: CORS_HEADERS,
        body: JSON.stringify({
          kind: "interviewers",
          inserted: 2,
          created: [],
          generatedPasswords: [
            { email: "alex@example.com", tempPassword: "TempPass-Alex-123" },
            { email: "sam@example.com", tempPassword: "TempPass-Sam-456" },
          ],
        }),
      }),
    );

    await gotoBulkTab(page);

    // Switch the kind to interviewers BEFORE uploading.
    await page.getByRole("radio", { name: "Switch to interviewers" }).click();

    await fileInput(page).setInputFiles(
      fixturePath("interviewers-valid.xlsx"),
    );
    await expect(page.getByRole("button", { name: /Save \(2\)/ })).toBeEnabled();
    await page.getByRole("button", { name: /Save \(2\)/ }).click();

    // Temp-password dialog opens once.
    await expect(
      page.getByRole("heading", { name: /Save these temporary passwords/ }),
    ).toBeVisible();
    await expect(page.getByText("TempPass-Alex-123")).toBeVisible();
    await expect(page.getByText("TempPass-Sam-456")).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();

    // After Done the review grid is cleared.
    await expect(page.getByRole("button", { name: /Save \(/ })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------

test.describe("Bulk import — discard + draft resilience", () => {
  test.beforeEach(async ({ page }) => {
    await installCoreMocks(page);
  });

  test("discard requires confirmation and only then clears state", async ({
    page,
  }) => {
    await gotoBulkTab(page);
    await fileInput(page).setInputFiles(fixturePath("candidates-valid.xlsx"));
    await expect(page.getByRole("button", { name: /Save \(2\)/ })).toBeVisible();

    // Cancel keeps the grid intact. There's exactly one Discard button on the
    // page before the dialog opens — once the dialog is up, there are two
    // (the in-grid trigger + the in-dialog confirm).
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Discard bulk import?" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: /Save \(2\)/ })).toBeVisible();

    // Confirm clears everything — scope the second Discard click to the dialog
    // so it hits the destructive button, not the grid's trigger.
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await dialog.getByRole("button", { name: "Discard", exact: true }).click();

    await expect(page.getByRole("button", { name: /Save \(/ })).toHaveCount(0);
    const draft = await page.evaluate(() =>
      window.localStorage.getItem("hr.bulk-import.draft.v1"),
    );
    expect(draft).toBeNull();
  });

  test("draft survives a reload within the 5-min TTL and is cleared past it", async ({
    page,
  }) => {
    await gotoBulkTab(page);
    await fileInput(page).setInputFiles(fixturePath("candidates-valid.xlsx"));
    await expect(page.getByRole("button", { name: /Save \(2\)/ })).toBeVisible();

    // Draft should be persisted now.
    const draftAfterUpload = await page.evaluate(() =>
      window.localStorage.getItem("hr.bulk-import.draft.v1"),
    );
    expect(draftAfterUpload).not.toBeNull();

    // Reload → Resume prompt appears.
    await page.reload();
    await page.getByRole("tab", { name: /Bulk import/i }).click();
    await expect(
      page.getByRole("heading", { name: /Resume your unsaved bulk import/ }),
    ).toBeVisible();
    // Mentions the kind and row count.
    await expect(page.getByText(/candidates draft with 2 rows/)).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.getByRole("button", { name: /Save \(2\)/ })).toBeVisible();
    await expect(page.getByLabel("Row 1 name")).toHaveValue("Ada Lovelace");

    // Now manually age the draft past the TTL (6 minutes ago) and reload.
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("hr.bulk-import.draft.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      parsed.savedAt = Date.now() - 6 * 60 * 1000;
      window.localStorage.setItem(
        "hr.bulk-import.draft.v1",
        JSON.stringify(parsed),
      );
    });

    await page.reload();
    await page.getByRole("tab", { name: /Bulk import/i }).click();

    // No Resume dialog this time.
    await expect(
      page.getByRole("heading", { name: /Resume your unsaved bulk import/ }),
    ).toHaveCount(0);

    // The expired draft has been silently dropped.
    const expired = await page.evaluate(() =>
      window.localStorage.getItem("hr.bulk-import.draft.v1"),
    );
    expect(expired).toBeNull();
  });
});

// ---------------------------------------------------------------------------

test.describe("Bulk import — drag-and-drop path", () => {
  test.beforeEach(async ({ page }) => {
    await installCoreMocks(page);
  });

  test("drag-and-drop of a valid fixture loads the rows", async ({ page }) => {
    await gotoBulkTab(page);

    const bytes = readFileSync(fixturePath("candidates-valid.xlsx"));
    const b64 = bytes.toString("base64");

    // Simulate a native HTML5 drop with a DataTransfer carrying the .xlsx.
    await page.evaluate(
      async ({ b64, filename }) => {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const file = new File(
          [u8],
          filename,
          {
            type:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        );
        const dt = new DataTransfer();
        dt.items.add(file);
        // The drop zone has role="button" and the "Drop the filled-in" copy.
        const zones = Array.from(
          document.querySelectorAll('[role="button"]'),
        ) as HTMLElement[];
        const zone = zones.find((el) =>
          /Drop the filled-in/.test(el.textContent ?? ""),
        );
        if (!zone) throw new Error("drop zone not found");
        zone.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
        zone.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
      },
      { b64, filename: "candidates-valid.xlsx" },
    );

    await expect(page.getByText(/2 rows loaded/)).toBeVisible();
    await expect(page.getByLabel("Row 1 name")).toHaveValue("Ada Lovelace");
  });
});
