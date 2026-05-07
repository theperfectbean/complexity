import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

test.describe("Initial Attachments", () => {
  test.slow();
  test.setTimeout(120000);

  test.afterAll(async () => {
    console.log("Cleaning up test users...");
    try {
      execSync('docker compose exec -e PAGER=cat postgres psql -U complexity -d complexity -c "DELETE FROM users WHERE email LIKE \'%test%\' OR email LIKE \'%example.com%\';"');
      console.log("Test users cleaned up successfully.");
    } catch (err) {
      console.error("Failed to clean up test users:", err);
    }
  });

  test("should handle attachments uploaded on home page correctly", async ({ page }) => {
    // Capture browser console logs
    page.on("console", (msg) => console.log(`BROWSER [${msg.type()}]: ${msg.text()}`));

    // 1. Register and login
    await registerUser(page, { emailPrefix: "attach-e2e", name: "Attachment User" });

    // 2. Upload an image on home page
    const testImagePath = path.join(process.cwd(), "e2e-test-image.png");
    // Create a dummy image if it doesn't exist (though ideally we use a real small png)
    if (!fs.existsSync(testImagePath)) {
      // Very small valid PNG (1x1 transparent)
      const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      fs.writeFileSync(testImagePath, buffer);
    }

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testImagePath);

    // 3. Verify image chip appears in SearchBar (using data-testid or image src)
    await expect(page.locator('img[src^="data:image/"]').first()).toBeVisible();

    // 4. Enter query and start thread
    const promptInput = page.locator('textarea[placeholder*="Ask"]').first();
    await promptInput.fill("What is in this image?");
    await page.keyboard.press("Enter");

    // 5. Verify we redirected to search page and NO "re-attach" message appeared
    await expect(page).toHaveURL(/\/chat\//, { timeout: 15000 });
    const toastMessage = page.getByText(/Please re-attach/i);
    await expect(toastMessage).not.toBeVisible();

    // 6. Verify the message text and then the image is visible
    await expect(page.getByText("What is in this image?").first()).toBeVisible({ timeout: 30000 });
    
    try {
      const attachedImage = page.locator('img[src^="data:image/"]').first();
      await expect(attachedImage).toBeVisible({ timeout: 20000 });
    } catch (e) {
      console.log("Image not found. Current DOM content snippet (start):");
      const content = await page.content();
      console.log(content.slice(0, 1000));
      console.log("DOM content snippet (end):");
      console.log(content.slice(-2000));
      throw e;
    }
    
    // Cleanup the dummy image
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  test("should handle attachments uploaded on role page correctly", async ({ page }) => {
    // 1. Register and login
    await registerUser(page, { emailPrefix: "role-attach", name: "Role Attachment User" });

    // 2. Create a role
    await page.goto("/roles");
    await page.getByRole("link", { name: /New role/i }).click();
    await page.getByPlaceholder(/Python Expert/i).fill("Test Role");
    await page.getByPlaceholder(/Describe the persona/i).fill("A test role for attachments");
    await page.getByRole("button", { name: /Create role/i, exact: true }).click();
    await expect(page.getByText(/Role created/i)).not.toBeVisible(); // It redirects on success, so "Role created" might not be a toast here
    // Actually NewRolePage does: onCreated={(role) => router.push(`/roles/${role.id}`)}
    await expect(page).toHaveURL(/\/roles\/.+/);
    await expect(page.getByText("Test Role").first()).toBeVisible();

    // 3. Upload an image on role page
    const testImagePath = path.join(process.cwd(), "role-test-image.png");
    const buffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    fs.writeFileSync(testImagePath, buffer);

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(testImagePath);

    // 4. Verify image chip appears
    await expect(page.locator('img[src^="data:image/"]').first()).toBeVisible();

    // 5. Enter query and start thread
    const promptInput = page.locator('textarea[placeholder*="Ask"]').first();
    await promptInput.fill("Describe this image in the role context.");
    await page.keyboard.press("Enter");

    // 6. Verify we redirected and image is visible
    await expect(page).toHaveURL(/\/chat\//, { timeout: 15000 });
    await expect(page.getByText("Describe this image in the role context.").first()).toBeVisible({ timeout: 30000 });
    
    const attachedImage = page.locator('img[src^="data:image/"]').first();
    await expect(attachedImage).toBeVisible({ timeout: 20000 });
    
    // Cleanup
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });
});
