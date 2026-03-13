import { test, expect } from "@playwright/test";

test.describe("SearchBar Attachment Button", () => {
  test.beforeEach(async ({ page }) => {
    const email = `attach-e2e-${Math.random().toString(36).slice(2, 10)}@example.com`;
    const password = "password123";
    const name = "Attach E2E";

    await page.goto("/register");
    await page.getByPlaceholder("Name").fill(name);
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password (min 8 chars)").fill(password);
    await page.getByRole("button", { name: "Create account" }).click({ force: true });

    await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 30000 });
  });

  test("clicking attach button opens file dialog", async ({ page }) => {
    // Start waiting for the file chooser before clicking the button
    const fileChooserPromise = page.waitForEvent('filechooser');
    
    await page.getByRole("button", { name: "Attach file" }).click();
    
    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeDefined();
    expect(fileChooser.isMultiple()).toBe(true);
  });

  test("selecting a file shows a 'coming soon' toast", async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole("button", { name: "Attach file" }).click();
    const fileChooser = await fileChooserPromise;

    // Create a dummy file to upload
    await fileChooser.setFiles([{
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is a test')
    }]);

    // Check if the toast appears
    await expect(page.getByText("File attachments for new threads coming soon")).toBeVisible();
  });
});
