import { test, expect } from "@playwright/test";

test.describe("Voice Input", () => {
  test.beforeEach(async ({ page }) => {
    // Setup mock SpeechRecognition that can be controlled via window flags
    await page.addInitScript(() => {
      class MockSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = "en-US";
        onstart: (() => void) | null = null;
        onresult: ((event: any) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((event: any) => void) | null = null;

        start() {
          // Check for a global flag to simulate error
          if ((window as any).__MOCK_VOICE_ERROR) {
            setTimeout(() => {
              if (this.onstart) this.onstart();
              setTimeout(() => {
                if (this.onerror) this.onerror({ error: "not-allowed" });
                if (this.onend) this.onend();
              }, 200);
            }, 100);
            return;
          }

          // Normal successful path
          setTimeout(() => {
            if (this.onstart) this.onstart();
            
            setTimeout(() => {
              if (this.onresult) {
                this.onresult({
                  results: [
                    [{ transcript: "Hello from voice test" }]
                  ],
                  resultIndex: 0
                });
              }
              if (this.onend) this.onend();
            }, 500);
          }, 100);
        }

        stop() {
          if (this.onend) this.onend();
        }
      }

      (window as any).webkitSpeechRecognition = MockSpeechRecognition;
      (window as any).SpeechRecognition = MockSpeechRecognition;
    });

    // Register/Login
    const email = `voice-test-${Math.random().toString(36).slice(2, 10)}@example.com`;
    await page.goto("/register");
    await page.getByPlaceholder("Name").fill("Voice Tester");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password (min 8 chars)").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByPlaceholder("Ask anything...")).toBeVisible({ timeout: 10000 });
  });

  test("should activate microphone and capture voice transcript", async ({ page }) => {
    await page.getByRole("button", { name: "Start listening" }).click();
    await expect(page.getByRole("button", { name: "Stop listening" })).toBeVisible();
    
    const searchBar = page.getByPlaceholder("Ask anything...");
    await expect(searchBar).toHaveValue("Hello from voice test", { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Start listening" })).toBeVisible();
  });

  test("should handle speech recognition errors gracefully", async ({ page }) => {
    // Set the flag to trigger error in the mock
    await page.evaluate(() => {
      (window as any).__MOCK_VOICE_ERROR = true;
    });

    await page.getByRole("button", { name: "Start listening" }).click();
    
    // Use the actual text found in the UI snapshot
    await expect(page.getByText("Microphone access was denied.")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Start listening" })).toBeVisible();
  });
});
