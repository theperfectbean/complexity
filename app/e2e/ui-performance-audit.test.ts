import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

interface WindowWithCls extends Window {
  clsValue: number;
}

interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

test.describe("UI Performance and Polish Audit", () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
      console.error(`Page Error: ${error.message}`);
    });
    
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        // Some network errors or specific react errors might trigger, we log them.
        // We do not strictly fail here to avoid flakiness, but we monitor.
        console.error(`Console Error: ${msg.text()}`);
      }
    });

    await registerUser(page, { emailPrefix: "audit-perf", name: "Audit User" });
  });

  test("general query performance and CLS audit", async ({ page }) => {
    // Setup CLS observer
    await page.evaluate(() => {
      (window as unknown as WindowWithCls).clsValue = 0;
      try {
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            const ls = entry as unknown as LayoutShiftEntry;
            if (!ls.hadRecentInput) {
              (window as unknown as WindowWithCls).clsValue += ls.value;
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        console.log("Layout Instability API not supported");
      }
    });

    const searchInput = page.getByPlaceholder("Ask anything...");
    const startTime = Date.now();
    
    await searchInput.fill("Write a very short poem about performance.");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });

    // Assert that the "Thinking..." indicator is visible during the submitted/streaming phase
    await expect(page.getByText("Thinking...", { exact: true })).toBeVisible({ timeout: 5000 });

    const article = page.locator("article").last();
    await expect(article).toBeVisible({ timeout: 15000 });
    
    const ttft = Date.now() - startTime;
    console.log(`General Query TTFT: ${ttft}ms`);

    // Wait for the copy button to appear (indicating completion)
    const copyButton = page.getByRole("button", { name: "Copy message" }).last();
    await expect(copyButton).toBeVisible({ timeout: 30000 });

    const totalTime = Date.now() - startTime;
    console.log(`General Query Total Time: ${totalTime}ms`);

    // Check CLS
    const cls = await page.evaluate(() => (window as unknown as WindowWithCls).clsValue || 0);
    console.log(`General Query CLS: ${cls}`);
    // We expect a smooth experience, but streaming layout shifts can accumulate.
    expect(cls).toBeLessThan(0.4);

    // Check UI polish: make sure there is no horizontal overflow on the page body
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("role creation, RAG query performance and CLS audit", async ({ page }) => {
    // 1. Create Role
    const roleName = `Audit Role ${Math.random().toString(36).slice(2, 8)}`;
    await page.goto("/roles");
    await page.getByRole("link", { name: "New role" }).click();
    await page.getByPlaceholder("e.g. Python Expert, Research Assistant, etc...").fill(roleName);
    await page.getByRole("button", { name: "Create role" }).click();

    await expect(page).toHaveURL(/\/roles\//, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: roleName })).toBeVisible({ timeout: 15000 });

    // 2. Upload Document
    const uploadButton = page.getByRole("button", { name: "Upload file" }).first();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await uploadButton.click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles([
      {
        name: "audit-facts.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("The secret launch code for project Orion is 8847-OMEGA. Remember this well."),
      },
    ]);

    await expect(page.getByText("audit-facts.txt")).toBeVisible({ timeout: 30000 });

    // Setup CLS observer for the chat phase
    await page.evaluate(() => {
      (window as unknown as WindowWithCls).clsValue = 0;
      try {
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            const ls = entry as unknown as LayoutShiftEntry;
            if (!ls.hadRecentInput) {
              (window as unknown as WindowWithCls).clsValue += ls.value;
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        console.log("Layout Instability API not supported");
      }
    });

    const searchInput = page.getByPlaceholder("Ask anything...");
    const startTime = Date.now();
    
    await searchInput.fill("What is the secret launch code for project Orion?");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\//, { timeout: 15000 });

    const article = page.locator("article").last();
    await expect(article).toBeVisible({ timeout: 45000 });
    
    const ttft = Date.now() - startTime;
    console.log(`RAG Query TTFT: ${ttft}ms`);

    // Wait for the copy button
    const copyButton = page.getByRole("button", { name: "Copy message" }).last();
    await expect(copyButton).toBeVisible({ timeout: 60000 });

    const totalTime = Date.now() - startTime;
    console.log(`RAG Query Total Time: ${totalTime}ms`);

    // Ensure source carousel / RAG attributes are visible (if present)
    // Sometimes the mock LLM might not return explicit citations for short local queries,
    // so we verify that the response article has text.
    await expect(article).toContainText(/8847-OMEGA/i, { timeout: 15000 });

    // Check CLS
    const cls = await page.evaluate(() => (window as unknown as WindowWithCls).clsValue || 0);
    console.log(`RAG Query CLS: ${cls}`);
    expect(cls).toBeLessThan(0.4); // Might be slightly higher due to source carousel rendering

    // Check UI polish: make sure response doesn't break layout
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });
});
