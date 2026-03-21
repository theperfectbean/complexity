import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

test.describe("Message Editing UI", () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.text().includes('[adjustTextareaHeight]')) {
        console.log(`[BROWSER] ${msg.text()}`);
      }
    });
    await registerUser(page, { emailPrefix: "edit-test", name: "Edit Tester" });
  });

  test("textarea should have adequate size and auto-expand", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Ask anything...");
    
    // 1. Send a multi-line message
    const multiLineMessage = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    await searchInput.fill(multiLineMessage);
    await searchInput.press("Enter");

    // Wait for the URL to change to the search/thread page
    await expect(page).toHaveURL(new RegExp("/search/"), { timeout: 15000 });

    // Wait for the message to appear in the list
    const userMessage = page.locator('article').first();
    await expect(userMessage).toBeVisible();

    // 2. Click edit button
    const editButton = userMessage.getByTitle("Edit message");
    await userMessage.hover();
    await editButton.click();

    // 3. Inspect textarea
    // The edit textarea is now in the page. 
    const textarea = page.getByTestId("edit-textarea");
    await expect(textarea).toBeVisible();

    const box = await textarea.boundingBox();
    console.log(`Textarea size initially: ${box?.width}x${box?.height}px`);
    
    // 4. Type more content to test auto-expansion
    await textarea.fill("Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10");
    
    // Wait for expansion to potentially settle
    await page.waitForTimeout(500);

    const val = await textarea.inputValue();
    const sh = await textarea.evaluate(el => el.scrollHeight);
    const boxAfter = await textarea.boundingBox();
    console.log(`Textarea value length: ${val.length}, scrollHeight: ${sh}, boxHeight: ${boxAfter?.height}`);

    expect(boxAfter).not.toBeNull();
    // Initially it was 136px for 5 lines. 10 lines should be significantly taller.
    expect(boxAfter!.height).toBeGreaterThan(150);

    // Take a screenshot of the expanded state
    await page.screenshot({ path: `message-edit-expanded-${Date.now()}.png` });
    
    // 5. Test a very short message to see if it's "squashed" horizontally
    await page.goto("/");
    const searchInput2 = page.getByPlaceholder("Ask anything...");
    await searchInput2.fill("Hi");
    await searchInput2.press("Enter");
    
    await expect(page).toHaveURL(new RegExp("/search/"), { timeout: 15000 });
    
    const shortMessage = page.locator('article').last();
    await shortMessage.hover();
    await shortMessage.getByTitle("Edit message").click();
    
    const shortTextarea = page.getByTestId("edit-textarea");
    await expect(shortTextarea).toBeVisible();
    const shortBox = await shortTextarea.boundingBox();
    console.log(`Short message textarea size: ${shortBox?.width}x${shortBox?.height}px`);
    
    // It should be at least 320px wide as per our new style
    expect(shortBox!.width).toBeGreaterThanOrEqual(320);
    
    await page.screenshot({ path: `message-edit-short-${Date.now()}.png` });
  });
});
