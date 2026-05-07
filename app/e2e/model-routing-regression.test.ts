import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

const TEST_PROMPT = "What is the capital of Japan? Answer in one word.";

test("Claude Haiku 4.5 routes through a valid Perplexity model", async ({ page }) => {
  await registerUser(page, { emailPrefix: "model-routing-regression", name: "Model Routing Regression" });

  await page.getByRole("button", { name: "Select model" }).click();
  await page.getByRole("menuitem", { name: "Claude Haiku 4.5" }).click();

  await expect(page.getByRole("button", { name: "Select model" })).toContainText("Claude Haiku 4.5");

  const searchInput = page.getByPlaceholder("Ask anything...");
  await searchInput.fill(TEST_PROMPT);
  await searchInput.press("Enter");

  await expect(page).toHaveURL(/\/chat\//, { timeout: 15000 });

  const article = page.locator("article").last();
  await expect(article).toBeVisible({ timeout: 45000 });
  await expect(article).toContainText("Tokyo", { timeout: 45000 });
  await expect(article).not.toContainText("Model request failed");
});
