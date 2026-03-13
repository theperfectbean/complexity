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
    const roleDescription = "E2E role description";

    await registerAndLogin(page);

    await page.goto("/roles");
    await page.getByRole("link", { name: "New role" }).click();
    await page.getByPlaceholder("Name your role").fill(roleName);
    await page.getByPlaceholder("Describe your role, goals, subject, etc.").fill(roleDescription);
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

    await page.getByPlaceholder("Type / for commands").fill("What is the secret word?");
    await page.getByRole("button", { name: "Start" }).click();

    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 30000 });
  });
});
