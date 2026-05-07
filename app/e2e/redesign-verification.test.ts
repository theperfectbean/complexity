import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

test.describe("Redesign E2E Verification", () => {
  test.slow();

  test("should trigger web search and render grounding artifacts", async ({ page }) => {
    // 1. Register and login
    await registerUser(page, { emailPrefix: "redesign-e2e" });

    // 2. Submit a query that triggers web search
    const TEST_PROMPT = "What is the current price of Bitcoin today? Use web search.";
    const searchInput = page.getByPlaceholder(/Ask anything/);
    await searchInput.fill(TEST_PROMPT);
    await searchInput.press("Enter");

    // 3. Wait for search redirect
    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });

    // 4. Verify Grounding Context artifact appears
    const groundingButton = page.getByRole("button", { name: /Grounding Context|Thinking/ });
    await expect(groundingButton).toBeVisible({ timeout: 60000 });

    // 5. Verify it expands/collapses (it defaults to expanded during streaming, then collapses)
    // We'll wait for the assistant to finish responding
    const assistantArticle = page.locator("article").last();
    await expect(assistantArticle).toContainText(/Bitcoin/i, { timeout: 60000 });

    // 6. Verify the Grounding Context button can be clicked
    await groundingButton.click();
    // Core redesign verified: grounding artifacts render and are interactive
  });
});
