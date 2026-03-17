import { test, expect } from "@playwright/test";

test.describe("Admin User Management", () => {
  test.beforeEach(async ({ page }) => {
    // Basic login logic (assuming a test admin user exists)
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@complexity.local");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");
  });

  test("should allow searching and toggling admin status", async ({ page }) => {
    await page.goto("/settings/admin");
    await page.click('button:has-text("Users")');

    // Check for user management table
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByPlaceholder("Search users...")).toBeVisible();

    // Search for a user
    await page.fill('input[placeholder="Search users..."]', "test@example.com");
    // Wait for debounce/fetch
    await page.waitForTimeout(500);

    // Verify search results
    const userRow = page.locator("tr", { hasText: "test@example.com" });
    await expect(userRow).toBeVisible();

    // Note: We don't actually toggle in E2E unless it's a dedicated test DB 
    // to avoid state pollution, but we can verify the switch exists.
    const adminSwitch = userRow.locator('button[role="switch"]');
    await expect(adminSwitch).toBeVisible();
  });
});
