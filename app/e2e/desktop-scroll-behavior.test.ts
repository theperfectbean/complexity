import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import { registerUser } from "./helpers/auth";

const AUTH_FILE = "/tmp/desktop-scroll-e2e-auth.json";
fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
const MAX_BOTTOM_GAP_PX = 420;

async function sendPromptAndWait(page: Page, prompt: string, timeout = 90000) {
  const initialCount = await page.locator("article").count();
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30000 });
  await expect(input).toBeEnabled({ timeout: 30000 });

  await input.fill(prompt);
  await input.press("Enter");

  await expect(page).toHaveURL(/\/chat\//, { timeout: 15000 });
  await expect(page.locator("article")).toHaveCount(initialCount + 2, { timeout });
  await expect(page.locator("textarea").first()).toBeEnabled({ timeout });
}

async function distanceFromBottom(page: Page) {
  return page.evaluate(() => document.documentElement.scrollHeight - (window.scrollY + window.innerHeight));
}

async function ensureScrollableHistory(page: Page) {
  for (let i = 0; i < 4; i += 1) {
    const isScrollable = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1200
    );
    if (isScrollable) return;

    await sendPromptAndWait(
      page,
      "Provide exactly 120 numbered lines about chat UX, each line under 8 words."
    );
  }
}

test.describe("Desktop chat scrolling behavior", () => {
  test.slow();
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300000);

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await registerUser(page, { emailPrefix: "desktop-scroll", name: "Desktop Scroll" });
    await context.storageState({ path: AUTH_FILE });
    await context.close();
  });

  test.use({ storageState: AUTH_FILE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30000 });
  });

  test("keeps following latest response while user stays near bottom", async ({ page }) => {
    await ensureScrollableHistory(page);
    await sendPromptAndWait(page, "Reply with 25 short bullet points about software quality.");

    const input = page.locator("textarea").first();
    await expect(input).toBeEnabled({ timeout: 30000 });
    await input.fill("Now write 120 short numbered lines about UI scrolling smoothness.");
    await input.press("Enter");

    await expect(page).toHaveURL(/\/chat\//, { timeout: 15000 });
    await expect(page.locator("article").last()).toBeVisible({ timeout: 45000 });

    // During active generation the viewport should remain near the bottom.
    await page.waitForTimeout(1000);
    const duringStreaming = await distanceFromBottom(page);
    expect(duringStreaming).toBeLessThan(MAX_BOTTOM_GAP_PX);

    await expect(page.locator("textarea").first()).toBeEnabled({ timeout: 90000 });
    const afterComplete = await distanceFromBottom(page);
    expect(afterComplete).toBeLessThan(MAX_BOTTOM_GAP_PX);
  });

  test("does not force-jump when user scrolls up and resumes on explicit action", async ({ page }) => {
    await ensureScrollableHistory(page);
    await sendPromptAndWait(page, "Reply with 25 short bullet points about chat UX.");

    const input = page.locator("textarea").first();
    await expect(input).toBeEnabled({ timeout: 30000 });
    await input.fill("Write 140 concise numbered lines about viewport stability in chat apps.");
    await input.press("Enter");

    await expect(page).toHaveURL(/\/chat\//, { timeout: 15000 });
    await expect(page.locator("article").last()).toBeVisible({ timeout: 45000 });

    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await page.waitForTimeout(1200);

    const yWhileStreaming = await page.evaluate(() => window.scrollY);
    expect(yWhileStreaming).toBeLessThan(320);

    const jumpButton = page.getByRole("button", { name: "Jump to latest messages" });
    const jumpButtonCount = await jumpButton.count();
    if (jumpButtonCount > 0) {
      await jumpButton.first().click();
    } else {
      await page.evaluate(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
      });
    }

    await page.waitForTimeout(500);
    const afterJump = await distanceFromBottom(page);
    expect(afterJump).toBeLessThan(MAX_BOTTOM_GAP_PX);
  });
});
