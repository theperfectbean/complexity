import { test, expect } from "@playwright/test";

const TEST_PROMPT = "Create a markdown table comparing 3 fruits based on color, taste, and size.";

test.describe("Markdown Table Rendering", () => {
  test.slow();
  
  test.beforeEach(async ({ page }) => {
    const email = `table-e2e-${Math.random().toString(36).slice(2, 10)}@example.com`;
    const password = "password123";
    const name = "Table E2E";

    await page.goto("/register");
    await page.getByPlaceholder("Name").fill(name);
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password (min 8 chars)").fill(password);
    await page.getByRole("button", { name: "Create account" }).click({ force: true });

    await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 30000 });
  });

  test("table should render with proper cell padding", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Ask anything...");
    await searchInput.fill(TEST_PROMPT);
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });

    // Wait for the response to finish
    const article = page.locator("article").last();
    await expect(article).toBeVisible({ timeout: 45000 });
    
    // Wait for the streaming to finish (checking for the Retry/Copy buttons)
    await expect(article.getByRole("button", { name: "Copy message" })).toBeVisible({ timeout: 45000 });

    // Locate the table
    const table = article.locator("table").first();
    await expect(table).toBeVisible();

    // Check padding on the first TH and first TD
    const firstTh = table.locator("th").first();
    const firstTd = table.locator("td").first();
    
    await expect(firstTh).toBeVisible();
    await expect(firstTd).toBeVisible();

    // Verify computed styles
    const thPadding = await firstTh.evaluate((el) => window.getComputedStyle(el).padding);
    const tdPadding = await firstTd.evaluate((el) => window.getComputedStyle(el).padding);

    // Our CSS adds 0.5rem (8px) top/bottom and 0.75rem (12px) left/right
    // getComputedStyle often returns this as "8px 12px"
    expect(thPadding).toContain("8px 12px");
    expect(tdPadding).toContain("8px 12px");
  });
});
