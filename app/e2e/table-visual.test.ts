import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

test.describe("Table Rendering Visual Check", () => {
  test.slow();
  
  test.beforeEach(async ({ page }) => {
    await registerUser(page, { emailPrefix: "table-visual", name: "Table Visual" });
  });

  test("should render nested tables without broken headers", async ({ page }) => {
    // Navigate to a new search
    await page.goto("/");
    
    const searchInput = page.getByPlaceholder("Ask anything...");
    
    await searchInput.fill("Create a markdown table comparing 3 fruits based on color, taste, and size. Make the first column header empty.");
    await searchInput.press("Enter");

    // Wait for the response
    const article = page.locator("article").last();
    await expect(article.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 120000 });

    const table = article.locator("table").first();
    await expect(table).toBeVisible({ timeout: 10000 });

    // Take a screenshot of the table area
    const wrapper = article.locator(".overflow-x-auto").first();
    await wrapper.screenshot({ path: "test-results/table-wrapper-debug.png" });

    // Verify background color of the first (empty) TH
    const firstTh = table.locator("th").first();
    const bgColor = await firstTh.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).not.toBe("rgba(0, 0, 0, 0)");
    
    // Check border-collapse
    const collapse = await table.evaluate((el) => window.getComputedStyle(el).borderCollapse);
    expect(collapse).toBe("collapse");

    // Check margin is 0
    const margin = await table.evaluate((el) => window.getComputedStyle(el).margin);
    expect(margin).toBe("0px");
  });
});
