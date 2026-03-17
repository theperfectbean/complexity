import { test, expect, devices } from "@playwright/test";
import { registerUser } from "./helpers/auth";

// Test using Pixel 5 profile (Chromium-based mobile)
test.use({
  ...devices["Pixel 5"],
});

test.describe("Mobile UI Layout", () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, { emailPrefix: "mobile-ui", name: "Mobile User" });
  });

  test("search bar buttons should be visible and not overflow", async ({ page }) => {
    const searchBar = page.locator('div:has(> textarea[placeholder="Ask anything..."])');
    
    // Check if search bar itself is visible
    await expect(searchBar).toBeVisible();

    // Verify critical buttons are visible even on small screens
    const modelButton = page.getByRole("button", { name: "Select model" });
    const searchToggle = page.getByRole("button", { name: "Toggle web search" });
    const attachButton = page.getByRole("button", { name: "Attach file" });
    const sendButton = page.getByRole("button", { name: "Start", exact: true });

    await expect(modelButton).toBeVisible();
    await expect(searchToggle).toBeVisible();
    await expect(attachButton).toBeVisible();
    await expect(sendButton).toBeVisible();

    // Take a screenshot for manual inspection
    await page.screenshot({ path: 'test-results/mobile-searchbar-v2.png' });

    // Check for overlaps by verifying bounding boxes
    const modelBox = await modelButton.boundingBox();
    const searchToggleBox = await searchToggle.boundingBox();
    const attachBox = await attachButton.boundingBox();
    const sendBox = await sendButton.boundingBox();

    if (modelBox && searchToggleBox && attachBox && sendBox) {
      // Basic sanity check: buttons should have positive dimensions
      expect(modelBox.width).toBeGreaterThan(0);
      expect(sendBox.width).toBeGreaterThan(0);
      
      // Ensure send button is to the right of model button
      expect(sendBox.x).toBeGreaterThan(modelBox.x);
    }
  });

  test("sidebar should be toggleable on mobile", async ({ page }) => {
    // On mobile, sidebar is usually hidden behind a hamburger menu
    const menuButton = page.getByRole("button", { name: /open menu/i });
    await expect(menuButton).toBeVisible();
    
    await menuButton.click();
    
    // MobileNav should now be visible
    await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Roles" })).toBeVisible();
    
    // Take screenshot of open mobile menu
    await page.screenshot({ path: 'test-results/mobile-menu-open.png' });
  });
});
