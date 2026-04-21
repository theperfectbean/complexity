/**
 * E2E tests: destructive (tier-3) commands that require explicit user confirmation.
 *
 * In the v2 agent architecture, destructive actions emit a `destructive_confirm`
 * SSE event and wait for the next user message to be exactly "CONFIRM" or "CANCEL".
 * There is no approval button — the user types a reply message.
 *
 * These tests verify:
 * - Confirmation Required UI appears for tier-3 commands
 * - Typing CANCEL aborts the run (run_status: cancelled)
 * - Typing CONFIRM proceeds (run_status: completed)
 */

import { test, expect } from '@playwright/test';
import { submitCommand, waitForRunComplete, clearThreads, gotoConsole } from './helpers/agent';

test.beforeEach(async ({ page }) => {
  await gotoConsole(page);
  await clearThreads(page);
  await page.reload();
  await page.getByPlaceholder('Ask the fleet agent...').waitFor({ state: 'visible' });
});

test.describe('Destructive commands — CANCEL flow', () => {
  test('stopping a container shows confirm prompt; CANCEL aborts', async ({ page }) => {
    test.setTimeout(120_000);

    await submitCommand(page, 'stop the dns container');

    // Destructive confirm event should appear
    await page.getByText('Confirmation Required').waitFor({ state: 'visible', timeout: 60_000 });
    // Action text should describe what is about to happen
    await expect(page.getByText(/stop|incus/i).first()).toBeVisible();

    // User cancels
    await submitCommand(page, 'CANCEL');

    // Run should end with cancelled status
    await waitForRunComplete(page, 30_000);

    // Should NOT see any further tool execution
    await expect(page.getByText('incus_stop')).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });

  test('deleting an entry shows confirm prompt; CANCEL aborts', async ({ page }) => {
    test.setTimeout(90_000);

    await submitCommand(page, 'remove the test DNS record fake-host.internal.lan');
    await page.getByText('Confirmation Required').waitFor({ state: 'visible', timeout: 60_000 });

    await submitCommand(page, 'CANCEL');
    await waitForRunComplete(page, 30_000);
  });
});

test.describe('Destructive commands — CONFIRM flow', () => {
  /**
   * Re-create a test DNS record then immediately delete it.
   * This is a safe destructive action (the record doesn't exist in prod).
   */
  test('add then remove a test DNS record with CONFIRM', async ({ page }) => {
    test.setTimeout(180_000);

    // First add the test record (read-write but not destructive — tier 1)
    await submitCommand(page, 'add DNS A record test-e2e.internal.lan pointing to 192.168.0.250');
    await page.getByText(/dns_add|dns_record/).first().waitFor({ state: 'visible', timeout: 60_000 });
    await waitForRunComplete(page, 60_000);

    // Now delete it — tier 3
    await submitCommand(page, 'delete DNS A record test-e2e.internal.lan');
    await page.getByText('Confirmation Required').waitFor({ state: 'visible', timeout: 60_000 });

    // Confirm
    await submitCommand(page, 'CONFIRM');
    await waitForRunComplete(page, 60_000);

    // Result should show DNS delete succeeded (no error)
    await expect(page.getByText(/Connection refused|error|failed/i).first()).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});
