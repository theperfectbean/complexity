import { test, expect } from "@playwright/test";

async function registerAndLogin(page: import("@playwright/test").Page) {
  const email = `role-e2e-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "password123";
  const name = "Role E2E";

  await page.goto("/register");
  await page.getByPlaceholder("Name").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password (min 8 chars)").fill(password);
  await page.getByRole("button", { name: "Create account" }).click({ force: true });

  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 30000 });
}

test.describe("Roles flow", () => {
  test.slow();

  test("create role and start a chat", async ({ page }) => {
    const roleName = `E2E Role ${Math.random().toString(36).slice(2, 8)}`;
    const roleDescription = "E2E role description";
    const firstPrompt = "Summarize the key goals for this role.";

    await registerAndLogin(page);

    await page.goto("/roles");
    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();

    await page.getByRole("link", { name: "New role" }).click();
    await expect(page.getByRole("heading", { name: "Create a new role" })).toBeVisible();

    await page.getByPlaceholder("Name your role").fill(roleName);
    await page.getByPlaceholder("Describe your role, goals, subject, etc.").fill(roleDescription);
    await page.getByRole("button", { name: "Create role" }).click();

    await expect(page).toHaveURL(/\/roles\//, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: roleName })).toBeVisible();

    const promptInput = page.getByPlaceholder("Ask anything...");
    await promptInput.fill(firstPrompt);
    await page.getByRole("button", { name: "Start" }).click();

    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });
  });
});
