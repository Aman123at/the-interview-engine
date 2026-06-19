import { expect, test, waitForWorkspace } from "./fixtures";

/**
 * Network drop + recover. The socket client backs off, queues outbound
 * actions, refreshes auth + re-handshakes on reconnect, and the connection
 * banner should drop through "Reconnecting…" then disappear once steady.
 */
test.describe.serial("socket reconnect", () => {
  test("offline → online recovers without losing the session", async ({
    authedPage: page,
    context,
  }) => {
    await page.getByRole("button", { name: /node/i }).first().click();
    await page.getByRole("button", { name: "Start" }).click();
    await page.waitForURL(/\/session\//);
    await waitForWorkspace(page);

    // Drop the network.
    await context.setOffline(true);
    await expect(page.getByText(/Reconnecting|Connection lost/i)).toBeVisible({
      timeout: 15_000,
    });

    // Restore.
    await context.setOffline(false);
    await expect(page.getByText(/Reconnecting|Connection lost/i)).toHaveCount(0, {
      timeout: 30_000,
    });

    // Workspace is still mounted.
    await expect(
      page.getByRole("button", { name: "Close session" }),
    ).toBeVisible();

    // Clean up.
    await page.getByRole("button", { name: "Close session" }).click();
    await page.waitForURL("**/dashboard");
  });
});
