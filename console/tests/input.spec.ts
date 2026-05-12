import { test, expect } from "@playwright/test";

test("enter submits message and clears input", async ({ page }) => {
  await page.goto("/?test_auth=true");
  const input = page.getByTestId("input-box");
  await input.fill("hello");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(page.locator("data-testid=chat-area")).toContainText("hello");
});

test("shift+enter adds newline but does not submit", async ({ page }) => {
  await page.goto("/?test_auth=true");
  const input = page.getByTestId("input-box");
  await input.fill("line 1");
  await input.press("Shift+Enter");
  await input.type("line 2");
  await expect(input).toHaveValue("line 1\nline 2");
  await expect(page.locator("data-testid=chat-area")).not.toContainText("line 1");
});
