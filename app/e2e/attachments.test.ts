import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

test.describe("SearchBar Attachment Button", () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, { emailPrefix: "attach-e2e", name: "Attach E2E" });
  });

  test("clicking attach button opens file dialog", async ({ page }) => {
    // Start waiting for the file chooser before clicking the button
    const fileChooserPromise = page.waitForEvent('filechooser');
    
    await page.getByRole("button", { name: "Attach file" }).click();
    
    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeDefined();
    expect(fileChooser.isMultiple()).toBe(true);
  });

  test("selecting a file on home page displays it as a chip", async ({ page }) => {
    const searchBar = page.locator("#home-searchbar");
    await searchBar.getByTestId("file-upload-input").setInputFiles([{
      name: 'home-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('home test content')
    }]);

    await expect(searchBar.getByTestId("file-chip").filter({ hasText: "home-test.txt" })).toBeVisible();
  });

  test("selecting a file on thread page displays it as a chip", async ({ page }) => {
    // Navigate to a thread first
    await page.getByPlaceholder("Ask anything...").fill("navigate to search");
    await page.getByPlaceholder("Ask anything...").press("Enter");
    
    // Wait for the URL to stabilize (no more query params)
    await expect(page).toHaveURL(/\/search\/[a-zA-Z0-9_-]+$/, { timeout: 15000 });

    // Wait for initial response
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });

    // RELOAD THE PAGE TO BYPASS USECHAT STREAMING CORRUPTION
    await page.reload();
    await expect(page.locator("#thread-searchbar")).toBeVisible({ timeout: 15000 });

    // Attach a file on thread page
    // Attach a file on thread page
    const searchBar = page.locator("#thread-searchbar");
    const fileChooserPromise = page.waitForEvent('filechooser');
    await searchBar.getByRole("button", { name: "Attach file" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([{
      name: 'thread-test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('thread test content')
    }]);

    await expect(searchBar.getByTestId("file-chip").filter({ hasText: "thread-test.pdf" })).toBeVisible({ timeout: 15000 });
  });

  test("removing an attachment from the search bar", async ({ page }) => {
    const searchBar = page.locator("#home-searchbar");
    await searchBar.getByTestId("file-upload-input").setInputFiles([{
      name: 'remove-me.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('delete this')
    }]);

    await expect(searchBar.getByTestId("file-chip").filter({ hasText: "remove-me.txt" })).toBeVisible();
    
    const removeButton = searchBar.getByTestId("file-chip").filter({ hasText: "remove-me.txt" }).locator('button');
    await removeButton.click();
    
    await expect(searchBar.getByTestId("file-chip").filter({ hasText: "remove-me.txt" })).toBeHidden();
  });

  test("sending a message with an attachment", async ({ page }) => {
    // 1. Navigate to thread
    await page.getByPlaceholder("Ask anything...").fill("Initial query");
    await page.getByPlaceholder("Ask anything...").press("Enter");
    
    // Wait for the URL to stabilize
    await expect(page).toHaveURL(/\/search\/[a-zA-Z0-9_-]+$/, { timeout: 15000 });

    // 2. Wait for initial response
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });
    
    // RELOAD THE PAGE TO BYPASS USECHAT STREAMING CORRUPTION
    await page.reload();
    await expect(page.locator("#thread-searchbar")).toBeVisible({ timeout: 15000 });

    // 3. Attach a file
    const searchBar = page.locator("#thread-searchbar");
    await searchBar.getByTestId("file-upload-input").setInputFiles([{
      name: 'test-attachment.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is the content of the attached file')
    }]);

    await expect(searchBar.getByTestId("file-chip").filter({ hasText: "test-attachment.txt" })).toBeVisible({ timeout: 15000 });

    // 4. Send the message
    const input = searchBar.getByPlaceholder("Ask a follow-up...");
    await input.fill("What is in this file?");
    await input.press("Enter");

    // 5. Verify the message is sent and attachment chip is gone from input
    await expect(searchBar.getByTestId("file-chip").filter({ hasText: "test-attachment.txt" })).toBeHidden();
    
    // 6. Verify the LLM starts responding
    const lastArticle = page.locator('article').last();
    await expect(lastArticle).toBeVisible();
  });

  test("sending ONLY a PDF attachment (no text)", async ({ page }) => {
    // 1. Navigate to thread
    await page.getByPlaceholder("Ask anything...").fill("PDF test");
    await page.getByPlaceholder("Ask anything...").press("Enter");
    
    // Wait for the URL to stabilize
    await expect(page).toHaveURL(/\/search\/[a-zA-Z0-9_-]+$/, { timeout: 15000 });

    // 2. Wait for initial response
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });
    
    // RELOAD THE PAGE TO BYPASS USECHAT STREAMING CORRUPTION
    await page.reload();
    await expect(page.locator("#thread-searchbar")).toBeVisible({ timeout: 15000 });

    // 3. Attach a PDF
    const searchBar = page.locator("#thread-searchbar");
    await searchBar.getByTestId("file-upload-input").setInputFiles([{
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Test) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF')
    }]);

    await expect(searchBar.getByTestId("file-chip").filter({ hasText: "test.pdf" })).toBeVisible({ timeout: 15000 });

    // 4. Send the message WITHOUT filling any text
    const input = searchBar.getByPlaceholder("Ask a follow-up...");
    await input.press("Enter");

    // 5. Verify no 400 error appears and chip is gone
    await expect(page.getByText("Message text required")).toBeHidden();
    await expect(searchBar.getByTestId("file-chip").filter({ hasText: "test.pdf" })).toBeHidden();
    
    // 6. Verify the LLM starts responding
    const lastArticle = page.locator('article').last();
    await expect(lastArticle).toBeVisible();
  });
});
