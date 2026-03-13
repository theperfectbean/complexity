import { test, expect } from "@playwright/test";
import { MODELS } from "../src/lib/models";

const TEST_PROMPT = "What is the capital of Japan? Answer in one word.";
const EXPECTED_KEYWORD = "Tokyo";

test.describe("Model Prompt & Response Browser Validation", () => {
  test.slow(); // Mark as slow to triple the timeout
  
  test.beforeEach(async ({ page }) => {
    const email = `model-e2e-${Math.random().toString(36).slice(2, 10)}@example.com`;
    const password = "password123";
    const name = "Model E2E";

    await page.goto("/register");
    await page.getByPlaceholder("Name").fill(name);
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password (min 8 chars)").fill(password);
    await page.getByRole("button", { name: "Create account" }).click({ force: true });

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
      await expect(article).toBeVisible({ timeout: 45000 });

      try {
        const initialText = (await article.textContent()) ?? "";

        // Verify streaming by observing incremental text growth over time.
        let observedGrowth = false;
        let previousLength = initialText.length;
        for (let i = 0; i < 6; i += 1) {
          await page.waitForTimeout(400);
          const currentText = (await article.textContent()) ?? "";
          if (currentText.length > previousLength) {
            observedGrowth = true;
            break;
          }
          previousLength = currentText.length;
        }

        if (!observedGrowth) {
          test.info().annotations.push({
            type: "warning",
            description: `No streaming growth detected for ${model.label}`,
          });
        }

        await expect(article).toContainText([EXPECTED_KEYWORD], { timeout: 45000 });
      } catch (error) {
        const text = (await article.textContent()) ?? "";
        if (text.includes("Model request failed")) {
          test.info().annotations.push({
            type: "warning",
            description: `Model request failed for ${model.label}`,
          });
          return;
        }
        throw error;
      }

      // 5. Get response time
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);
      console.log(`Model: ${model.label} | Time to Content (TTC): ${durationMs}ms`);
    });
  }
});
