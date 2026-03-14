import { test, expect } from "@playwright/test";

async function registerAndLogin(page: import("@playwright/test").Page) {
  const email = `role-upload-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "password123";
  const name = "Role Upload E2E";

  await page.goto("/register");
  await page.getByPlaceholder("Name").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password (min 8 chars)").fill(password);
  await page.getByRole("button", { name: "Create account" }).click({ force: true });

  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 30000 });
}

test.describe("Role document upload + chat", () => {
  test.slow();

  test("uploads a document and starts a role chat", async ({ page }) => {
    const roleName = `E2E Role ${Math.random().toString(36).slice(2, 8)}`;

    await registerAndLogin(page);

    await page.goto("/roles");
    await page.getByRole("link", { name: "New role" }).click();
    await page.getByPlaceholder("e.g. Python Expert, Research Assistant, etc...").fill(roleName);
    await page.getByRole("button", { name: "Create role" }).click();

    await expect(page).toHaveURL(/\/roles\//, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: roleName })).toBeVisible();

    const uploadButton = page.getByRole("button", { name: "Upload file" }).first();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await uploadButton.click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles([
      {
        name: "rag-notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("The secret word is pineapple."),
      },
    ]);

    await expect(page.getByText("rag-notes.txt")).toBeVisible({ timeout: 30000 });

    await page.getByPlaceholder("Ask anything...").fill("What is the secret word?");
    await page.getByRole("button", { name: "Start" }).click();

    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });
  });

  test("deletes an uploaded document", async ({ page }) => {
    const roleName = `Delete Test Role ${Math.random().toString(36).slice(2, 8)}`;
    
    await registerAndLogin(page);

    await page.goto("/roles");
    await page.getByRole("link", { name: "New role" }).click();
    await page.getByPlaceholder("e.g. Python Expert, Research Assistant, etc...").fill(roleName);
    await page.getByRole("button", { name: "Create role" }).click();

    await expect(page).toHaveURL(/\/roles\//, { timeout: 15000 });

    const uploadButton = page.getByRole("button", { name: "Upload file" }).first();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await uploadButton.click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles([
      {
        name: "delete-me.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Delete this file."),
      },
    ]);

    const docChip = page.getByText("delete-me.txt");
    await expect(docChip).toBeVisible({ timeout: 30000 });

    // Handle the confirmation dialog
    page.on('dialog', dialog => dialog.accept());

    // Hover to reveal the delete button and click it
    await docChip.hover();
    const deleteButton = page.getByLabel("Delete delete-me.txt");
    await deleteButton.click();

    // Verify it is gone
    await expect(docChip).toBeHidden({ timeout: 15000 });
  });

  test("uploads a large document (12MB) successfully", async ({ page }) => {
    test.setTimeout(600000);
    const roleName = `Large File Role ${Math.random().toString(36).slice(2, 8)}`;

    await registerAndLogin(page);

    await page.goto("/roles");
    await page.getByRole("link", { name: "New role" }).click();
    await page.getByPlaceholder("e.g. Python Expert, Research Assistant, etc...").fill(roleName);
    await page.getByRole("button", { name: "Create role" }).click();

    await expect(page).toHaveURL(/\/roles\//, { timeout: 15000 });

    const uploadButton = page.getByRole("button", { name: "Upload file" }).first();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await uploadButton.click();
    const fileChooser = await fileChooserPromise;

    // Create a 12MB buffer of dummy text
    const largeBuffer = Buffer.alloc(12 * 1024 * 1024, "This is a test file for large upload verification. ");

    await fileChooser.setFiles([
      {
        name: "large-test.txt",
        mimeType: "text/plain",
        buffer: largeBuffer,
      },
    ]);

    // Large files take longer to process (upload + chunk + embed)
    await expect(page.getByText("large-test.txt")).toBeVisible({ timeout: 540000 });
  });
});
