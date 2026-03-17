import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

test.describe("Voice Input", () => {
  test.beforeEach(async ({ page }) => {
    // 1. Setup mock MediaRecorder and getUserMedia
    await page.addInitScript(() => {
      class MockMediaRecorder {
        onstart: (() => void) | null = null;
        onstop: (() => void) | null = null;
        ondataavailable: ((e: any) => void) | null = null;
        state = "inactive";

        constructor(public stream: any) {}

        start() {
          this.state = "recording";
          setTimeout(() => {
            if (this.onstart) this.onstart();
            
            // Simulate data
            setTimeout(() => {
              if (this.ondataavailable) {
                this.ondataavailable({ data: new Blob(["test-audio"], { type: "audio/webm" }) });
              }
            }, 100);
          }, 50);
        }

        stop() {
          this.state = "inactive";
          if (this.onstop) this.onstop();
        }
      }

      const mockStream = {
        getTracks: () => [{ stop: () => {} }]
      };

      (window.navigator.mediaDevices as any) = {
        getUserMedia: async () => mockStream
      };
      (window as any).MediaRecorder = MockMediaRecorder;
    });

    // 2. Mock the transcription API
    await page.route("**/api/transcribe", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ text: "Transcribed text from Whisper" }),
      });
    });

    // 3. Register/Login
    await registerUser(page, { emailPrefix: "voice-test", name: "Voice Tester" });
  });

  test("should record audio and receive transcription", async ({ page }) => {
    // 1. Start listening
    await page.getByRole("button", { name: "Start listening" }).click();
    await expect(page.getByRole("button", { name: "Stop listening" })).toBeVisible();

    // 2. Stop listening (manually or wait for mock logic)
    // In our app, we click again to stop
    await page.getByRole("button", { name: "Stop listening" }).click();

    // 3. Verify the transcription is appended to the search bar
    const searchBar = page.getByPlaceholder("Ask anything...");
    await expect(searchBar).toHaveValue("Transcribed text from Whisper", { timeout: 10000 });
  });

  test("should handle transcription errors gracefully", async ({ page }) => {
    // Mock a failure for this specific test
    await page.route("**/api/transcribe", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Failed to transcribe" }),
      });
    });

    await page.getByRole("button", { name: "Start listening" }).click();
    await page.getByRole("button", { name: "Stop listening" }).click();

    // Verify toast error appears
    await expect(page.getByText("Failed to transcribe audio.")).toBeVisible();
  });
});
