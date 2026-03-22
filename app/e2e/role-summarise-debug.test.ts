import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

const ROLE_ID = "ee191a5caf9c4438a86e8ef2c62f4c9a";
const ROLE_URL = `/roles/${ROLE_ID}`;

// Use existing credentials from env, or fall back to registration
const ADMIN_EMAIL = process.env.TEST_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_PASSWORD;

async function loginExisting(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(ADMIN_EMAIL!);
  await page.getByPlaceholder("Password").fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('textarea[placeholder*="Ask"]').first()).toBeVisible({ timeout: 20000 });
}

test.describe("Role summarise-uploaded-files diagnostic", () => {
  test.setTimeout(120_000);

  test("measures timing and captures errors for 'summarise the uploaded files'", async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: { url: string; status: number }[] = [];
    const timings: Record<string, number> = {};

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    page.on("response", (resp) => {
      if (resp.status() >= 400) {
        networkErrors.push({ url: resp.url(), status: resp.status() });
      }
    });

    // ── 1. Login ────────────────────────────────────────────────────────────
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      await loginExisting(page);
    } else {
      // Register a fresh user — note: this user won't own the role, so the
      // test will fail at the role page if roles are private. Set TEST_EMAIL
      // and TEST_PASSWORD env vars to use an existing account.
      await registerUser(page, { emailPrefix: "summarise-debug" });
    }

    // ── 2. Create or navigate to a role ─────────────────────────────────────
    let roleId = ROLE_ID;
    
    // Create a private role for this user so we can upload
    console.log("[info] Creating a new role for the test user...");
    await page.goto("/roles");
    await page.getByRole("link", { name: /new role/i }).first().click();
    const roleName = `Test Role ${Date.now()}`;
    await page.getByPlaceholder(/python expert/i).fill(roleName);
    await page.getByPlaceholder(/describe the persona/i).fill("You are a helpful assistant.");
    await page.getByRole("button", { name: /create role/i }).first().click();
    
    // Wait for navigation to the role page (not /roles/new)
    await expect(page).toHaveURL(/\/roles\/(?!new)[a-zA-Z0-9]+$/, { timeout: 15000 });
    roleId = page.url().split("/").pop()!;
    console.log(`[info] Created role ID: ${roleId}`);

    // Wait for the page to be interactive (search bar visible)
    const searchInput = page.locator('textarea[placeholder*="Ask"], input[placeholder*="Ask"]').first();
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    timings.rolePageReady = Date.now();

    // Upload a file
    const docItems = page.locator('[data-testid="document-item"], article[class*="document"]');
    console.log("[info] Uploading a test document...");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByLabel(/upload file/i).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles("../test-doc.txt");
    
    // Wait for indexing or document item
    await expect(page.getByText(/file uploaded successfully/i)).toBeVisible({ timeout: 20000 });
    await expect(docItems.first()).toBeVisible({ timeout: 20000 });
    const docCount = await docItems.count();
    console.log(`[info] Documents after upload: ${docCount}`);

    // ── 3. Type the message and submit ──────────────────────────────────────
    await searchInput.fill("summarise the uploaded files");
    
    // Wait for the button to be enabled
    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });

    timings.submitStart = Date.now();
    console.log("[info] Clicking submit button");
    await submitBtn.click();

    // ── 4. Wait for navigation to the chat/search page ──────────────────────
    await expect(page).toHaveURL(/\/search\//, { timeout: 60_000 });
    timings.navigatedToChat = Date.now();
    console.log(`[timing] Submit → chat navigation: ${timings.navigatedToChat - timings.submitStart}ms`);

    // ── 5. Wait for the response to arrive ──────────────────────────────────
    // We consider the response done when a "Copy message" button appears
    // or when streaming stops (no more loading indicators)
    const responseIndicator = page.getByRole("button", { name: /copy message/i }).first();
    await expect(responseIndicator).toBeVisible({ timeout: 90_000 });
    timings.responseReady = Date.now();
    console.log(`[timing] Navigation → first response: ${timings.responseReady - timings.navigatedToChat}ms`);
    console.log(`[timing] Total end-to-end: ${timings.responseReady - timings.submitStart}ms`);

    // ── 6. Report collected errors ───────────────────────────────────────────
    if (consoleErrors.length) {
      console.warn("[console errors]", JSON.stringify(consoleErrors, null, 2));
    }
    if (networkErrors.length) {
      console.warn("[network errors]", JSON.stringify(networkErrors, null, 2));
    }

    // Sanity assertions
    expect(networkErrors.filter(e => e.status >= 500), "No 5xx errors").toHaveLength(0);
    expect(consoleErrors.filter(e => e.includes("Error") || e.includes("failed")), "No JS errors").toHaveLength(0);

    // The response should contain some text or a thinking state
    const messageItem = page.locator('[data-testid*="message-assistant"]').last();
    await expect(messageItem).toBeVisible({ timeout: 10_000 });
    
    // Wait for either Thinking... or actual markdown content
    await expect(async () => {
      const thinking = page.getByText(/thinking.../i);
      const markdown = page.locator(".markdown-body").first();
      const isThinking = await thinking.isVisible();
      const hasContent = await markdown.isVisible();
      expect(isThinking || hasContent).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    // Final wait for actual text content to arrive
    const messageBody = page.locator(".markdown-body").first();
    await expect(async () => {
      const text = await messageBody.innerText();
      expect(text.trim().length).toBeGreaterThan(5);
    }).toPass({ timeout: 30_000 });

    const text = await messageBody.innerText();
    
    // Check for citations
    const citations = page.locator('[data-testid="source-card"], .citation-item, [class*="source"]');
    const citationCount = await citations.count();
    console.log(`[info] Citations found: ${citationCount}`);

    expect(text.trim().length).toBeGreaterThan(20);

    console.log("[response preview]", text.slice(0, 300));
  });
});
