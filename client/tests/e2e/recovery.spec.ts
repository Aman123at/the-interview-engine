import { expect, test, waitForWorkspace } from "./fixtures";

/**
 * Recovery paths:
 *   1) Forced reload mid-session → recoverable card on dashboard → Resume → workspace restored.
 *   2) With a recoverable session present, the framework grid is hidden so
 *      a second concurrent session can't be started.
 *
 * These tests need the server's reaper / abrupt-loss detection wired up; if
 * the session never transitions to "recoverable", the recovery test will
 * (correctly) fail.
 */
test.describe.serial("recoverable session", () => {
  test("abrupt loss → recoverable → resume → blocked from starting another", async ({
    authedPage: page,
  }) => {
    // ---- Start ----
    await page.getByRole("button", { name: /node/i }).first().click();
    await page.getByRole("button", { name: "Start" }).click();
    await page.waitForURL(/\/session\//, { timeout: 30_000 });
    await waitForWorkspace(page);
    const sessionUrl = page.url();

    // ---- Simulate abrupt loss ----
    // The cleanest client-side trigger: force-close the page and wait for the
    // server's prolonged-disconnect timer to flip the session to recoverable.
    await page.goto("/dashboard");
    // The server-side abrupt-loss timer is on the order of tens of seconds.
    // Poll the recoverable card with a generous timeout.
    await expect(
      page.getByText(/Continue your .* sandbox/i),
    ).toBeVisible({ timeout: 120_000 });

    // ---- One-session rule: framework grid hidden ----
    await expect(page.getByRole("heading", { name: "Frameworks" })).toHaveCount(
      0,
    );

    // ---- Resume ----
    await page.getByRole("button", { name: "Resume" }).click();
    await page.waitForURL(/\/session\//, { timeout: 30_000 });
    await waitForWorkspace(page);
    // We should land back on the same session id.
    expect(page.url()).toBe(sessionUrl);

    // ---- Clean up so subsequent test runs aren't blocked ----
    await page.getByRole("button", { name: "Close session" }).click();
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
  });
});
