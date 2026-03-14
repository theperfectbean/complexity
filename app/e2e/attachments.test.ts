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

  test("selecting a file on home page displays it as a chip", async ({ page }) => {
    await page.getByTestId("file-upload-input").setInputFiles([{
      name: 'home-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('home test content')
    }]);

    await expect(page.getByTestId("file-chip").filter({ hasText: "home-test.txt" })).toBeVisible();
  });

  test("selecting a file on thread page displays it as a chip", async ({ page }) => {
    // Navigate to a thread first
    await page.getByPlaceholder("Ask anything...").fill("navigate to search");
    await page.getByPlaceholder("Ask anything...").press("Enter");
    
    // Wait for the URL to stabilize (no more query params)
    await expect(page).toHaveURL(/\/search\/[a-zA-Z0-9_-]+$/, { timeout: 15000 });
    
    // Wait for initial response
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });
    
    // Attach a file on thread page
    await page.getByTestId("file-upload-input").setInputFiles([{
      name: 'thread-test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('thread test content')
    }]);

    await expect(page.getByTestId("file-chip").filter({ hasText: "thread-test.pdf" })).toBeVisible({ timeout: 15000 });
  });

  test("removing an attachment from the search bar", async ({ page }) => {
    await page.getByTestId("file-upload-input").setInputFiles([{
      name: 'remove-me.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('delete this')
    }]);

    await expect(page.getByTestId("file-chip").filter({ hasText: "remove-me.txt" })).toBeVisible();
    
    const removeButton = page.getByTestId("file-chip").filter({ hasText: "remove-me.txt" }).locator('button');
    await removeButton.click();
    
    await expect(page.getByTestId("file-chip").filter({ hasText: "remove-me.txt" })).toBeHidden();
  });

  test("sending a message with an attachment", async ({ page }) => {
    // 1. Navigate to thread
    await page.getByPlaceholder("Ask anything...").fill("Initial query");
    await page.getByPlaceholder("Ask anything...").press("Enter");
    
    // Wait for the URL to stabilize
    await expect(page).toHaveURL(/\/search\/[a-zA-Z0-9_-]+$/, { timeout: 15000 });

    // 2. Wait for initial response
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });

    // 3. Attach a file
    await page.getByTestId("file-upload-input").setInputFiles([{
      name: 'test-attachment.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is the content of the attached file')
    }]);

    await expect(page.getByTestId("file-chip").filter({ hasText: "test-attachment.txt" })).toBeVisible({ timeout: 15000 });

    // 4. Send the message
    const threadSearchBar = page.getByTestId("thread-searchbar");
    const input = threadSearchBar.getByPlaceholder("Ask a follow-up...");
    await input.fill("What is in this file?");
    await input.press("Enter");

    // 5. Verify the message is sent and attachment chip is gone from input
    await expect(page.getByTestId("file-chip").filter({ hasText: "test-attachment.txt" })).toBeHidden();
    
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

    // 3. Attach a PDF
    await page.getByTestId("file-upload-input").setInputFiles([{
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Test) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF')
    }]);

    await expect(page.getByTestId("file-chip").filter({ hasText: "test.pdf" })).toBeVisible({ timeout: 15000 });

    // 4. Send the message WITHOUT filling any text
    const threadSearchBar = page.getByTestId("thread-searchbar");
    const input = threadSearchBar.getByPlaceholder("Ask a follow-up...");
    await input.press("Enter");

    // 5. Verify no 400 error appears and chip is gone
    await expect(page.getByText("Message text required")).toBeHidden();
    await expect(page.getByTestId("file-chip").filter({ hasText: "test.pdf" })).toBeHidden();
    
    // 6. Verify the LLM starts responding
    const lastArticle = page.locator('article').last();
    await expect(lastArticle).toBeVisible();
  });
});
