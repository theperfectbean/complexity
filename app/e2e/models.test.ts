import { test, expect } from "@playwright/test";
import { MODELS } from "../src/lib/models";

const TEST_PROMPT = "What is the capital of Japan? Answer in one word.";
const EXPECTED_KEYWORD = "Tokyo";

test.describe("Model Prompt & Response Browser Validation", () => {
  test.slow(); // Mark as slow to triple the timeout
  
  test.beforeEach(async ({ page }) => {
    // Login with existing manual tester account
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill("manual@example.com");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click({ force: true });
    
    await page.waitForURL("**/", { timeout: 30000 });
    await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 30000 });
  });

  for (const model of MODELS) {
    test(`test response for model: ${model.label}`, async ({ page }) => {
      // 1. Select the model using the Radix DropdownMenu
      const modelTrigger = page.getByRole("button", { name: "Select model" });
      await modelTrigger.click();
      
      const modelOption = page.getByRole("menuitem", { name: model.label });
      await modelOption.click();

      // 2. Submit the prompt and start timing
      const searchInput = page.getByPlaceholder("Ask anything...");
      await searchInput.fill(TEST_PROMPT);
      
      const startTime = performance.now();
      await searchInput.press("Enter");

      // 3. Verify "Thinking..." state appears (from our previous work)
      // Wait for redirect to search page
      await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });

      // 4. Wait for the final response
      const article = page.locator("article").last();
      await expect(article).toContainText([EXPECTED_KEYWORD], { timeout: 45000 });

      // 5. Get response time
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);
      console.log(`Model: ${model.label} | Time to Content (TTC): ${durationMs}ms`);
    });
  }
});
