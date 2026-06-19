import { expect, test } from "./fixtures";

test.describe("auth", () => {
  test("bad password shows inline error and does not navigate", async ({
    page,
    env,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email or username").fill(env.email);
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText(/Incorrect email\/username or password/i),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("good credentials → dashboard", async ({ page, env }) => {
    await page.goto("/login");
    await page.getByLabel("Email or username").fill(env.email);
    await page.getByLabel("Password").fill(env.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByText("Log out")).toBeVisible();
  });

  test("unauthenticated /dashboard bounces to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.removeItem("isb.accessToken"));
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 5000 });
  });
});
