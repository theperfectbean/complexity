import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

const TEST_PROMPT = "Write a long poem about the ocean. Give me at least 4 stanzas.";

test.describe("Streaming Response Browser Validation", () => {
  test.slow();
  
  test.beforeEach(async ({ page }) => {
    await registerUser(page, { emailPrefix: "stream-e2e", name: "Stream E2E" });
  });

  test("response should stream incrementally", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Ask anything...");
    await searchInput.fill(TEST_PROMPT);
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });

    const article = page.locator("article").last();
    // Wait for the article to be visible
    await expect(article).toBeVisible({ timeout: 45000 });

    let observedGrowthCount = 0;
    let previousLength = 0;
    
    // Check multiple times to ensure we are seeing chunks arrive over time
    for (let i = 0; i < 20; i += 1) {
      await page.waitForTimeout(200);
      const currentText = (await article.textContent()) ?? "";
      if (currentText.length > previousLength && previousLength > 0) {
        observedGrowthCount++;
      }
      previousLength = currentText.length;
    }

    // We expect the response to grow incrementally, meaning we should observe multiple length increases.
    expect(observedGrowthCount).toBeGreaterThan(1);
  });
});
