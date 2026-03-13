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
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole("button", { name: "Attach file" }).click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles([{
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
    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Wait for initial stream to finish
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });
    
    // Attach a file on thread page
    const fileChooserPromise = page.waitForEvent('filechooser');
    const threadSearchBar = page.getByTestId("thread-searchbar");
    await threadSearchBar.getByRole("button", { name: "Attach file" }).click();
    const threadFileChooser = await fileChooserPromise;

    await threadFileChooser.setFiles([{
      name: 'thread-test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('thread test content')
    }]);

    await expect(threadSearchBar.getByTestId("file-chip").filter({ hasText: "thread-test.pdf" })).toBeVisible({ timeout: 15000 });
  });

  test("removing an attachment from the search bar", async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole("button", { name: "Attach file" }).click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles([{
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
    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // 2. Wait for initial response
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });

    // 3. Attach a file
    const fileChooserPromise = page.waitForEvent('filechooser');
    const threadSearchBar = page.getByTestId("thread-searchbar");
    await threadSearchBar.getByRole("button", { name: "Attach file" }).click();
    const threadFileChooser = await fileChooserPromise;

    await threadFileChooser.setFiles([{
      name: 'test-attachment.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is the content of the attached file')
    }]);

    await expect(threadSearchBar.getByTestId("file-chip").filter({ hasText: "test-attachment.txt" })).toBeVisible({ timeout: 15000 });

    // 4. Send the message
    const input = threadSearchBar.getByPlaceholder("Ask a follow-up...");
    await input.fill("What is in this file?");
    await input.press("Enter");

    // 5. Verify the message is sent and attachment chip is gone from input
    await expect(threadSearchBar.getByTestId("file-chip").filter({ hasText: "test-attachment.txt" })).toBeHidden();
    
    // 6. Verify the LLM starts responding
    const lastArticle = page.locator('article').last();
    await expect(lastArticle).toBeVisible();
  });

  test("sending ONLY an attachment (no text)", async ({ page }) => {
    // 1. Navigate to thread
    await page.getByPlaceholder("Ask anything...").fill("Initial query");
    await page.getByPlaceholder("Ask anything...").press("Enter");
    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // 2. Wait for initial response
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });

    // 3. Attach a file
    const fileChooserPromise = page.waitForEvent('filechooser');
    const threadSearchBar = page.getByTestId("thread-searchbar");
    await threadSearchBar.getByRole("button", { name: "Attach file" }).click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles([{
      name: 'only-attachment.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is the only content')
    }]);

    await expect(threadSearchBar.getByTestId("file-chip").filter({ hasText: "only-attachment.txt" })).toBeVisible({ timeout: 15000 });

    // 4. Send the message WITHOUT filling any text
    const input = threadSearchBar.getByPlaceholder("Ask a follow-up...");
    await input.press("Enter");

    // 5. Verify no 400 error appears and chip is gone
    await expect(page.getByText("Message text required")).toBeHidden();
    await expect(threadSearchBar.getByTestId("file-chip").filter({ hasText: "only-attachment.txt" })).toBeHidden();
    
    // 6. Verify the LLM starts responding
    const lastArticle = page.locator('article').last();
    await expect(lastArticle).toBeVisible();
  });
});
