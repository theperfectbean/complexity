import { test, expect } from "@playwright/test";

test("agent tool call and widget rendering", async ({ page }) => {
  await page.goto("/?test_auth=true&mock_tool=true");
  
  await expect(page.getByTestId("widget-calculator")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("widget-calculator")).toContainText("Result: 42");
  
  await expect(page.locator("data-testid=chat-area")).toContainText("The calculation is complete", { timeout: 15000 });
});
