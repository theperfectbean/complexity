import { test, expect } from "@playwright/test";

test("layout shell components are present", async ({ page }) => {
  await page.goto("/?test_auth=true");
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await expect(page.getByTestId("chat-area")).toBeVisible();
  await expect(page.getByTestId("input-box")).toBeVisible();
});
