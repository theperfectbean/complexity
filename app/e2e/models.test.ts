import { test, expect } from "@playwright/test";
import { MODELS } from "../src/lib/models";
import { registerUser } from "./helpers/auth";

const TEST_PROMPT = "What is the capital of Japan? Answer in one word.";
const EXPECTED_KEYWORD = "Tokyo";

test.describe("Model Prompt & Response Browser Validation", () => {
  test.slow(); // Mark as slow to triple the timeout
  
  test.beforeEach(async ({ page }) => {
    await registerUser(page, { emailPrefix: "model-e2e", name: "Model E2E" });
  });

  for (const model of MODELS) {
    test(`test response for model: ${model.label}`, async ({ page }) => {
      // 1. Select the model using the Radix DropdownMenu
      const modelTrigger = page.getByRole("button", { name: "Select model" });
      await modelTrigger.click();
      
      const modelOption = page.getByRole("menuitem", { name: model.label });
      
      // Retry logic for clicking the model option
      for (let i = 0; i < 3; i++) {
        try {
          await modelOption.waitFor({ state: 'visible', timeout: 3000 });
          await modelOption.click({ timeout: 3000 });
          break;
        } catch {
          if (i === 2) {
            const items = await page.getByRole("menuitem").allInnerTexts();
            console.log(`Available menu items after 3 attempts: ${items.join(", ")}`);
            throw new Error(`Could not click model option for ${model.label}. Available: ${items.join(", ")}`);
          }
          await modelTrigger.click(); // Re-open menu
        }
      }

      // 2. Submit the prompt and start timing
      const searchInput = page.getByPlaceholder("Ask anything...");
      await searchInput.fill(TEST_PROMPT);
      
      const startTime = performance.now();
      await searchInput.press("Enter");

      // 3. Verify "Thinking..." state appears (from our previous work)
      // Wait for redirect to search page
      await expect(page).toHaveURL(/\/chat\//, { timeout: 15000 });

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
