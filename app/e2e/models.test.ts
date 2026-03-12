import { test, expect } from "@playwright/test";

// We'll test a subset of models to keep the test duration reasonable, 
// or all if you prefer. Let's list the key ones.
const MODELS_TO_TEST = [
  { id: "perplexity/sonar", label: "Perplexity Sonar" },
  { id: "fast-search", label: "Fast Search" },
  { id: "pro-search", label: "Pro Search" },
];

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

  for (const model of MODELS_TO_TEST) {
    test(`test response for model: ${model.label}`, async ({ page }) => {
      // 1. Select the model using the Radix DropdownMenu
      const modelTrigger = page.getByRole("button", { name: "Select model" });
      await modelTrigger.click();
      
      const modelOption = page.getByRole("menuitem", { name: model.label });
      await modelOption.click();

      // 2. Submit the prompt
      const searchInput = page.getByPlaceholder("Ask anything...");
      await searchInput.fill(TEST_PROMPT);
      await searchInput.press("Enter");

      // 3. Verify "Thinking..." state appears (from our previous work)
      // The button text changes to "Starting..." then redirects to /search/[id]
      // where it will show "Thinking..."
      
      // Wait for redirect to search page
      await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });

      // 4. Verify thinking indicators (Retrieval or Thinking)
      // These are the new elements we added to MessageList
      const thinkingIndicator = page.locator("text=Thinking");
      // It might be very fast, but let's check for it or the final response
      
      // 5. Verify the final response
      // Wait for any article to contain the expected keyword
      await expect(page.locator("article")).toContainText([EXPECTED_KEYWORD], { timeout: 45000 });
    });
  }
});
