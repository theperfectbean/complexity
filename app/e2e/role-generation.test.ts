import { test, expect } from "@playwright/test";

async function registerAndLogin(page: import("@playwright/test").Page) {
  const email = `gen-role-e2e-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "password123";
  const name = "Gen Role E2E";

  await page.goto("/register");
  await page.getByPlaceholder("Name").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password (min 8 chars)").fill(password);
  await page.getByRole("button", { name: "Create account" }).click({ force: true });

  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 30000 });
}

test.describe("Role instruction generation", () => {
  test.slow();

  test("should generate instructions using AI", async ({ page }) => {
    await registerAndLogin(page);

    await page.goto("/roles/new");
    await expect(page.getByRole("heading", { name: "Create a new role" })).toBeVisible();

    // Open generator
    await page.getByRole("button", { name: "Generate with AI" }).click();
    
    const genPromptInput = page.getByPlaceholder("e.g. A senior software engineer who focuses on clean code and security best practices...");
    await expect(genPromptInput).toBeVisible();

    await genPromptInput.fill("A helpful travel assistant for Japan");
    
    // Click generate
    await page.getByRole("button", { name: "Generate", exact: true }).click();

    // Check if instructions are being populated
    const instructionsTextarea = page.getByPlaceholder("Describe the persona or system prompt in detail. What should this role do, how should it behave, and what are its constraints?");
    
    // Wait for generation to finish (it should show "Generate" again)
    await expect(page.getByRole("button", { name: "Generate", exact: true })).toBeVisible({ timeout: 60000 });

    const instructions = await instructionsTextarea.inputValue();
    expect(instructions.length).toBeGreaterThan(50);
    expect(instructions.toLowerCase()).toContain("japan");
    expect(instructions.toLowerCase()).toContain("travel");

    // Fill name and create
    const roleName = "Japan Travel Expert";
    await page.getByPlaceholder("e.g. Python Expert, Research Assistant, etc...").fill(roleName);
    await page.getByRole("button", { name: "Create role" }).click();

    await expect(page).toHaveURL(/\/roles\//, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: roleName })).toBeVisible();
  });
});
