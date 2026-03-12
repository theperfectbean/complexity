import { test, expect } from "@playwright/test";

test("registration and login flow", async ({ page }) => {
  const email = `test-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "password123";
  const name = "Test User";

  // 1. Go to register page
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();

  // 2. Fill registration form
  await page.getByPlaceholder("Name").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password (min 8 chars)").fill(password);
  await page.getByRole("button", { name: "Create account" }).click({ force: true });

  // 3. Should be redirected to home page and see search bar
  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 10000 });
  
  // 4. Verify we can see Complexity title on home page
  await expect(page.getByRole("heading", { name: "Complexity", exact: true })).toBeVisible();
});
