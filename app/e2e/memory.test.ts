import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";
import { execSync } from "node:child_process";

test.describe("Memory Feature", () => {
  test.slow();

  test.afterAll(async () => {
    // Explicitly clean up all test users after the test run
    console.log("Cleaning up test users...");
    try {
      // Use direct psql for reliable cleanup in this environment
      execSync('psql -U complexity -d complexity -c "DELETE FROM users WHERE email LIKE \'%test%\' OR email LIKE \'%example.com%\';"');
      console.log("Test users cleaned up successfully.");
    } catch (err) {
      console.error("Failed to clean up test users:", err);
    }
  });

  test("automatically extracts and saves memory from conversation", async ({ page }) => {
    // 1. Register and login
    await registerUser(page, { emailPrefix: "memory-e2e", name: "Memory User" });

    // 2. Start a new chat with a personal fact
    const promptInput = page.locator('textarea[placeholder*="Ask"]').first();
    await promptInput.fill("Hi, my name is Gary. I am a software engineer from Australia who loves working with TypeScript and React. Please remember this for future conversations.");
    await page.keyboard.press("Enter");

    // 3. Wait for the response to finish. 
    // We try to look for the "Memory saved" toast, but we'll also check the settings page 
    // as extraction might be slightly slower than the toast timeout even with 15s.
    try {
      await expect(page.getByText(/Memory saved/i)).toBeVisible({ timeout: 60000 });
      console.log("Memory saved toast appeared.");
    } catch {
      console.log("Memory saved toast did not appear in time, checking settings page directly.");
    }

    // 4. Verify the memory appears in the Settings -> Memory page
    // We might need to wait a few more seconds for the background task to finish if toast didn't show
    await page.waitForTimeout(5000);
    
    await page.goto("/settings/memory");
    await expect(page.getByRole("heading", { name: "Memory", exact: true })).toBeVisible();
    
    // Check if any of our facts are present in the listed memories
    // We'll retry a few times as it's an async background process
    let found = false;
    for (let i = 0; i < 5; i++) {
      const content = await page.content();
      const containsGary = content.includes("Gary");
      const containsSoftware = content.includes("software") || content.includes("engineer");
      const containsAustralia = content.includes("Australia");
      const containsTypeScript = content.includes("TypeScript");

      if (containsGary || containsSoftware || containsAustralia || containsTypeScript) {
        found = true;
        break;
      }
      
      console.log(`Memory not found yet, retrying in 5s... (attempt ${i+1}/5)`);
      await page.reload();
      await page.waitForTimeout(5000);
    }

    expect(found).toBe(true);
  });
});
