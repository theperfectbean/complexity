import { test, expect, devices } from "@playwright/test";

test.use({
  ...devices["iPhone 13"],
});

test.describe("Mobile UI Rendering", () => {
  test("search bar buttons should render correctly on mobile", async ({ page }) => {
    // 1. Register/Login to get to home page
    const email = `mobile-test-${Math.random().toString(36).slice(2, 10)}@example.com`;
    await page.goto("/register");
    await page.getByPlaceholder("Name").fill("Mobile User");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password (min 8 chars)").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 10000 });

    // 2. Take a screenshot of the search bar
    const searchBar = page.locator('[data-testid="home-searchbar"]');
    await expect(searchBar).toBeVisible();
    
    // Check individual buttons
    const modelButton = page.getByRole("button", { name: "Select model" });
    const searchButton = page.getByRole("button", { name: "Toggle web search" });
    const attachButton = page.getByRole("button", { name: "Attach file" });
    const micButton = page.getByRole("button", { name: "Start listening" });
    const sendButton = page.getByRole("button", { name: "Start" });

    await expect(modelButton).toBeVisible();
    await expect(searchButton).toBeVisible();
    await expect(attachButton).toBeVisible();
    // Mic might not be visible if not supported, but we mocked it in other tests
    // Here we just want to see how they look
    
    await page.screenshot({ path: 'test-results/mobile-searchbar.png' });

    // 3. Verify they don't overlap or overflow
    const searchBarBox = await searchBar.boundingBox();
    const modelButtonBox = await modelButton.boundingBox();
    const sendButtonBox = await sendButton.boundingBox();

    if (searchBarBox && modelButtonBox && sendButtonBox) {
      // Basic check: buttons should be within search bar bounds
      expect(modelButtonBox.x).toBeGreaterThanOrEqual(searchBarBox.x);
      expect(sendButtonBox.x + sendButtonBox.width).toBeLessThanOrEqual(searchBarBox.x + searchBarBox.width);
    }
  });
});
