import { test, expect } from "@playwright/test";

test("chart rendering via markdown interception", async ({ page }) => {
  // Use a unique email for each test run to ensure a fresh session
  const email = `chart-test-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "password123";
  const name = "Chart Tester";

  // 1. Setup user session via registration
  await page.goto("/register");
  await page.getByPlaceholder("Name").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password (min 8 chars)").fill(password);
  await page.getByRole("button", { name: "Create account" }).click({ force: true });

  // 2. Ensure we're on the home page with search bar
  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 15000 });

  // 3. Select a more capable model (Claude Sonnet 4.6) to ensure system prompt adherence
  await page.getByRole("button", { name: "Select model" }).click();
  await page.getByRole("menuitem", { name: /Claude Sonnet/ }).click();

  // 4. Manually trigger a chart block with a very specific, forceful request
  const searchInput = page.getByPlaceholder("Ask anything...");
  await searchInput.fill("I need to visualize some blood sugar data. Please generate a LINE CHART for these values: Day 1: 110, Day 2: 125, Day 3: 118. Follow the custom JSON format {type, data, xAxisKey, lines} inside a 'chart' code block.");
  await page.keyboard.press("Enter");

  // 5. Wait for the assistant message to appear and check for our ChartRenderer's wrapper div
  // The ChartRenderer wraps the chart in a div with h-[400px] and my-6 and a border
  // Let's use a more reliable selector for our custom component
  const chartWrapper = page.locator('div.h-\\[400px\\].my-6.p-4.rounded-xl.border');
  
  // Increase timeout significantly as LLM generation can take a few seconds
  await expect(chartWrapper).toBeVisible({ timeout: 60000 });

  // 6. Verify internal SVG components that Recharts uses
  // We'll use a broader selector for the SVG surface
  const svg = page.locator("svg.recharts-surface");
  await expect(svg).toBeVisible({ timeout: 10000 });

  // Check for the legend which we explicitly added
  const legend = page.locator(".recharts-legend-wrapper");
  await expect(legend).toBeVisible();

  // Check for some data points (dots/bars) - generic check for 'recharts-layer'
  const layers = page.locator(".recharts-layer");
  await expect(layers.first()).toBeVisible();

  // 6. Optional: check that the raw JSON code block is NOT visible 
  // (intercepted and replaced)
  const rawChartCode = page.locator("code.language-chart");
  await expect(rawChartCode).not.toBeVisible();
});
