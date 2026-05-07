import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

test.describe("Roles flow", () => {
  test.slow();

  test("create role and start a chat", async ({ page }) => {
    const roleName = `E2E Role ${Math.random().toString(36).slice(2, 8)}`;
    const firstPrompt = "Summarize the key goals for this role.";

    await registerUser(page, { emailPrefix: "role-e2e", name: "Role E2E" });

    await page.goto("/roles");
    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();

    await page.getByRole("link", { name: "New role" }).click();
    await expect(page.getByRole("heading", { name: "Create a new role" })).toBeVisible();

    await page.getByPlaceholder("e.g. Python Expert, Research Assistant, etc...").fill(roleName);
    await page.getByRole("button", { name: "Create role" }).click();

    await expect(page).toHaveURL(/\/roles\//, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: roleName })).toBeVisible();

    const promptInput = page.getByPlaceholder("Ask anything...");
    await promptInput.fill(firstPrompt);
    await page.getByRole("button", { name: "Start" }).click();

    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });
  });
});
