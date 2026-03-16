import { test, expect } from "@playwright/test";

test("copy button in markdown code blocks", async ({ page, context }) => {
  // Grant clipboard permissions
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  
  const email = `copy-test-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "password123";
  const name = "Copy Tester";

  // 1. Setup session
  await page.goto("/register");
  await page.getByPlaceholder("Name").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password (min 8 chars)").fill(password);
  await page.getByRole("button", { name: "Create account" }).click({ force: true });

  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 15000 });

  // 2. Request a code block
  const searchInput = page.getByPlaceholder("Ask anything...");
  await searchInput.fill("Please provide a hello world example in Python.");
  await page.keyboard.press("Enter");

  // 3. Locate the code block (within a pre tag)
  const pre = page.locator("div.markdown-body pre").first();
  await expect(pre).toBeVisible({ timeout: 30000 });

  // 4. Check for the copy button - it should have opacity-0 initially
  // Note: opacity might be 0 but the button exists
  const copyButton = pre.locator("button[title='Copy to clipboard']");
  await expect(copyButton).toBeAttached();

  // 5. Hover over the pre tag to make the button visible
  await pre.hover();
  await expect(copyButton).toBeVisible();

  // 6. Click the copy button
  await copyButton.click();

  // 7. Verify the icon changes (check for the Lucide 'Check' icon which has class text-green-500)
  const checkIcon = copyButton.locator("svg.text-green-500");
  await expect(checkIcon).toBeVisible();

  // 8. Verify clipboard content (requires extra permissions in some environments, but let's try)
  // We'll use evaluate to read from clipboard as Playwright context usually has permissions
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain("print(\"Hello, World!\")");
});
