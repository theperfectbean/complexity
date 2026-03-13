import { test, expect } from "@playwright/test";
import { execSync } from "child_process";

test.describe("Full Password Reset Flow", () => {
  test("should complete the full password reset flow", async ({ page }) => {
    const email = `test-reset-${Date.now()}@example.com`;
    const oldPassword = "old-password-123";
    const newPassword = "new-password-456";

    // 1. Register a new user
    await page.goto("/register");
    await page.fill('input[placeholder="Name"]', "Reset Test User");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', oldPassword);
    await page.click('button[type="submit"]');
    // Wait for navigation to complete
    await expect(page).toHaveURL("/", { timeout: 10000 });
    // Ensure account menu is visible (confirming session)
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    // 2. Logout
    await page.click('button[aria-label="Account menu"]');
    const signOutPromise = page.waitForRequest(req => req.url().includes("/api/auth/signout"));
    await page.click('text="Sign out"');
    await signOutPromise;
    
    // Wait for the account menu to disappear to be sure we are logged out
    await expect(page.getByRole("button", { name: "Account menu" })).toBeHidden();

    // 3. Request password reset
    await page.goto("/forgot-password");
    await page.fill('input[type="email"]', email);
    await page.click('button[type="submit"]');
    await expect(page.locator('text="If an account exists for that email, we have sent password reset instructions."')).toBeVisible();

    // 4. Retrieve reset link from docker logs
    let resetLink: string | null = null;
    const maxRetries = 15;
    for (let i = 0; i < maxRetries; i++) {
        try {
            // Wait a bit for the log to be written
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Note: We are in app/ so we need to go up one level to reach docker-compose.yml
            const logs = execSync("docker compose -f ../docker-compose.yml -f ../docker-compose.dev.yml logs app").toString();
            // Use string for RegExp constructor to avoid escaping issues in this environment
            const pattern = "\\[Password Reset\\] Link for " + email + ": (https?://[^\\s]+)";
            const match = logs.match(new RegExp(pattern));
            if (match) {
                resetLink = match[1];
                // Convert localhost:3002 back to relative or handle it
                const url = new URL(resetLink);
                resetLink = url.pathname + url.search;
                break;
            }
        } catch (e) {
            console.error("Error fetching logs:", e);
        }
    }

    if (!resetLink) {
        throw new Error("Could not find reset link in docker logs");
    }

    // 5. Navigate to reset link
    await page.goto(resetLink);
    await expect(page.locator("h1")).toHaveText("New password");
    await page.fill('input[placeholder="New Password (min 8 chars)"]', newPassword);
    await page.fill('input[placeholder="Confirm New Password"]', newPassword);
    await page.click('button[type="submit"]');

    // 6. Verify successful reset message on login page
    await expect(page).toHaveURL("/login?reset=success", { timeout: 10000 });
    await expect(page.locator('text="Password reset successful! You can now sign in with your new password."')).toBeVisible();

    // 7. Login with new password
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', newPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  });
});
