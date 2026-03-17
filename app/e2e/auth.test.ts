import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

test("registration and login flow", async ({ page }) => {
  await registerUser(page, {
    emailPrefix: "test",
    name: "Test User",
  });

  // Should be redirected to home page and see search bar
  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 10000 });

  // Verify we can see Complexity title on home page
  await expect(page.getByRole("heading", { name: "Complexity", exact: true })).toBeVisible();
});
