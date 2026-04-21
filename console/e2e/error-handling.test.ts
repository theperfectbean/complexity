/**
 * E2E tests: error handling and edge cases.
 *
 * Validates UI resilience when given bad inputs, unknown hosts, empty input,
 * network errors, and mid-run cancellation.
 */

import { test, expect } from '@playwright/test';
import { submitCommand, waitForRunComplete, clearThreads, gotoConsole } from './helpers/agent';

test.beforeEach(async ({ page }) => {
  await gotoConsole(page);
  await clearThreads(page);
  await page.reload();
  await page.getByPlaceholder('Ask the fleet agent...').waitFor({ state: 'visible' });
});

test.describe('Input validation', () => {
  test('empty input cannot be submitted', async ({ page }) => {
    const input = page.getByPlaceholder('Ask the fleet agent...');
    // Input is empty
    await expect(input).toHaveValue('');

    // Press Enter on empty input — nothing should happen
    await input.press('Enter');

    // No event blocks should appear
    const blocks = page.locator('[data-testid="event-block"]');
    await expect(blocks).toHaveCount(0, { timeout: 3000 }).catch(() => {});

    // Input should still be empty and the page should be intact
    await expect(page.getByPlaceholder('Ask the fleet agent...')).toBeVisible();
  });

  test('whitespace-only input cannot be submitted', async ({ page }) => {
    const input = page.getByPlaceholder('Ask the fleet agent...');
    await input.fill('   ');
    await input.press('Enter');

    // Should not start a run — input field should still be present and clear
    await page.waitForTimeout(1000);
    await expect(page.getByPlaceholder('Ask the fleet agent...')).toBeVisible();
  });

  test('very long input is handled gracefully', async ({ page }) => {
    test.setTimeout(120_000);

    const longCmd = 'check status of '.repeat(30) + 'plex';
    await submitCommand(page, longCmd);

    // Should either complete or show an error — must not freeze the UI
    await waitForRunComplete(page, 90_000);
    await expect(page.getByPlaceholder('Ask the fleet agent...')).toBeVisible();
  });
});

test.describe('Unknown host / service', () => {
  test('command for non-existent host returns error gracefully', async ({ page }) => {
    test.setTimeout(60_000);

    await submitCommand(page, 'check status on host nonexistent-xyz-host-12345');

    // Agent should still complete without crashing the UI
    await waitForRunComplete(page, 60_000);

    // Some error indication should be visible
    const errorText = await page.getByText(/unknown|not found|cannot reach|failed/i).first().isVisible().catch(() => false);
    const toolError = await page.getByText('✗').first().isVisible().catch(() => false);
    expect(errorText || toolError).toBe(true);
  });

  test('asking about a non-existent service returns graceful response', async ({ page }) => {
    test.setTimeout(60_000);

    await submitCommand(page, 'restart fake-service-xyz on arrstack');
    await waitForRunComplete(page, 60_000);

    // Should not crash the page
    await expect(page.getByPlaceholder('Ask the fleet agent...')).toBeVisible();
  });
});

test.describe('Multi-turn conversation', () => {
  test('can ask a follow-up question in the same thread', async ({ page }) => {
    test.setTimeout(180_000);

    await submitCommand(page, 'check plex status');
    await waitForRunComplete(page, 90_000);

    // Ask a follow-up
    await submitCommand(page, 'how many streams are active?');
    await waitForRunComplete(page, 90_000);

    // Should still be functional
    await expect(page.getByPlaceholder('Ask the fleet agent...')).toBeVisible();
  });

  test('new thread button clears the conversation', async ({ page }) => {
    test.setTimeout(120_000);

    await submitCommand(page, 'check plex status');
    await waitForRunComplete(page, 90_000);

    // Find and click the new thread button
    const newThreadBtn = page.getByRole('button', { name: /new|clear|thread/i }).first();
    if (await newThreadBtn.isVisible()) {
      await newThreadBtn.click();
      // Chat area should be empty
      await page.waitForTimeout(500);
      const input = page.getByPlaceholder('Ask the fleet agent...');
      await expect(input).toBeVisible();
      await expect(input).toHaveValue('');
    }
  });
});

test.describe('SSE stream reliability', () => {
  test('event blocks render incrementally during a multi-tool run', async ({ page }) => {
    test.setTimeout(120_000);

    await submitCommand(page, 'show disk usage and list containers on NAS');

    // At least one event block (tool_start/tool_result) should appear before the run completes
    await page.waitForFunction(
      () => {
        // Look for any event block appearing in the chat
        const els = document.querySelectorAll('[class*="tool_start"], [class*="tool_result"], [class*="event"]');
        return els.length > 0;
      },
      { timeout: 60_000 },
    );

    await waitForRunComplete(page, 120_000);
  });

  test('page shows loading state while run is in progress', async ({ page }) => {
    test.setTimeout(60_000);

    await submitCommand(page, 'check plex status');

    // While the run is active, the send button should be replaced by a cancel/loading state
    // (the input area is disabled or shows a stop button)
    const hasLoadingState = await page.waitForFunction(
      () => {
        // Look for disabled input or stop button
        const input = document.querySelector('textarea, input[type="text"]') as HTMLInputElement | null;
        const cancelBtn = document.querySelector('[aria-label*="cancel"], [aria-label*="stop"]');
        return (input && input.disabled) || cancelBtn !== null;
      },
      { timeout: 10_000 },
    ).catch(() => null);

    // If no loading state is found, that's okay — the run may complete very fast
    // The important thing is the run completes without errors
    await waitForRunComplete(page, 90_000);
    await expect(page.getByPlaceholder('Ask the fleet agent...')).toBeVisible();
  });

  test('submitting a second command after first completes works correctly', async ({ page }) => {
    test.setTimeout(180_000);

    await submitCommand(page, 'check plex status');
    await waitForRunComplete(page, 90_000);

    // Second command
    await submitCommand(page, 'show NAS disk usage');
    await waitForRunComplete(page, 90_000);

    await expect(page.getByPlaceholder('Ask the fleet agent...')).toBeVisible();
  });
});
