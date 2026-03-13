import { test, expect } from "@playwright/test";

test.describe("Password Reset Flow", () => {
  test("should navigate to forgot password page from login", async ({ page }) => {
    await page.goto("/login");
    await page.click('text="Forgot password?"');
    await expect(page).toHaveURL("/forgot-password");
    await expect(page.locator("h1")).toHaveText("Reset password");
  });

  test("should show error for invalid email in forgot password", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.fill('input[type="email"]', "not-an-email");
    await page.click('button[type="submit"]');
    // HTML5 validation might catch this first, but if not, our zod schema will
    const isInvalid = await page.evaluate(() => (document.querySelector('input[type="email"]') as HTMLInputElement).validity.typeMismatch);
    if (!isInvalid) {
        // If browser didn't catch it, wait for our error message
        await expect(page.locator('text="Invalid email address"')).toBeVisible();
    }
  });

  test("should navigate to reset password page with token", async ({ page }) => {
    // This just tests the UI rendering, not the full flow which would require email intercept
    await page.goto("/reset-password?token=test-token&email=test@example.com");
    await expect(page.locator("h1")).toHaveText("New password");
    await expect(page.locator('input[placeholder="New Password (min 8 chars)"]')).toBeVisible();
  });

  test("should show error on reset password page without token", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.locator("h1")).toHaveText("Invalid Link");
    await expect(page.locator('text="This password reset link is invalid or has expired."')).toBeVisible();
  });
});
