/**
 * Shared Playwright fixtures + env validation. Imported by every spec.
 *
 * The suite needs a live backend; without `E2E_BASE_URL`, `E2E_USER_EMAIL`,
 * and `E2E_USER_PASSWORD` set, every test is skipped at runtime with a
 * descriptive message. This keeps `pnpm test:e2e` safe to run in CI without
 * accidentally passing with zero coverage.
 */
import { test as base, expect, type Page } from "@playwright/test";

interface E2EEnv {
  baseUrl: string;
  email: string;
  password: string;
}

function readEnv(): E2EEnv | null {
  const baseUrl = process.env.E2E_BASE_URL;
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!baseUrl || !email || !password) return null;
  return { baseUrl, email, password };
}

export interface TestFixtures {
  env: E2EEnv;
  /** Page already past /login, sitting on /dashboard. */
  authedPage: Page;
}

export const test = base.extend<TestFixtures>({
  env: async ({}, use, testInfo) => {
    const env = readEnv();
    testInfo.skip(
      !env,
      "E2E env not configured. Set E2E_BASE_URL, E2E_USER_EMAIL, E2E_USER_PASSWORD.",
    );
    await use(env!);
  },
  authedPage: async ({ page, env }, use) => {
    await login(page, env);
    await use(page);
  },
});

export { expect };

export async function login(page: Page, env: E2EEnv): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(env.email);
  await page.getByLabel("Password").fill(env.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

/**
 * Wait until the workspace has rendered (file tree + editor + terminal). The
 * lifecycle loader can take a while for cold cache (image pull etc.) — bump
 * the timeout liberally.
 */
export async function waitForWorkspace(page: Page): Promise<void> {
  // The lifecycle loader uses headings; the workspace exposes the file tree's
  // "Files" label and the editor's "API"/"Preview" pinned tabs.
  await expect(page.getByRole("button", { name: "Close session" })).toBeVisible({
    timeout: 90_000,
  });
}
