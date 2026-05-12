import { test, expect } from "@playwright/test";

test("markdown message with code block renders correctly", async ({ page }) => {
  await page.goto("/?test_auth=true&mock_message=markdown");
  const codeBlock = page.locator("pre code");
  await expect(codeBlock).toBeVisible();
  await expect(codeBlock).toContainText("console.log");
});
