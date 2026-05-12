import { test, expect } from "@playwright/test";

test("streaming message updates UI progressively", async ({ page }) => {
  await page.goto("/?test_auth=true");
  const input = page.getByTestId("input-box");
  
  await input.fill("test streaming");
  await input.press("Enter");
  
  // The ChatMessage renders inside the chat-area max-w-3xl container
  const lastMessage = page.locator("[data-testid=chat-area] .max-w-3xl > div").last();
  await expect(lastMessage).toBeVisible();
  
  await expect(lastMessage).toContainText("Chunk 1");
  await expect(lastMessage).toContainText("Chunk 2");
  await expect(lastMessage).toContainText("Final answer");
});
