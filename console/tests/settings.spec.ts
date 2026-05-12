import { test, expect } from "@playwright/test";

test("slash command /model updates persistent settings", async ({ page }) => {
  await page.goto("/?test_auth=true");
  const input = page.getByTestId("input-box");
  
  // Update model via slash command
  await input.fill("/model gpt-4o");
  await input.press("Enter");
  
  // Input should be cleared
  await expect(input).toHaveValue("");
  
  // System notification should appear
  await expect(page.locator("data-testid=chat-area")).toContainText("Model updated to gpt-4o");
  
  // Reload page to verify persistence
  await page.reload();
  await expect(page.locator("data-testid=chat-area")).toContainText("Current model: gpt-4o");
});
