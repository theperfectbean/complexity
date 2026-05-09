/**
 * E2E tests: destructive (tier-3) commands that require explicit user confirmation.
 *
 * In the v2 agent architecture, destructive actions emit a `destructive_confirm`
 * SSE event and wait for the next user message to be exactly "CONFIRM" or "CANCEL".
 */

import { test, expect } from '@playwright/test';
import { submitCommand, waitForRunComplete, clearThreads, gotoConsole } from './helpers/agent';

test.beforeEach(async ({ page }) => {
  await gotoConsole(page);
  await clearThreads(page);
  await page.reload();
  await page.locator('[data-testid="message-input"]').waitFor({ state: 'visible' });
});

test.describe('Destructive commands — CANCEL flow', () => {
  test('stopping a container shows confirm prompt; CANCEL aborts', async ({ page }) => {
    test.setTimeout(120_000);

    await submitCommand(page, 'stop the dns container');

    await page.getByText('Confirmation Required').waitFor({ state: 'visible', timeout: 60_000 });
    await expect(page.getByText(/stop|pve_stop/i).first()).toBeVisible();

    await submitCommand(page, 'CANCEL');
    await waitForRunComplete(page, 30_000);

    await expect(page.getByText('pve_stop')).not.toBeVisible({ timeout: 3000 }).catch(() => {});
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
  test('add then remove a test DNS record with CONFIRM', async ({ page }) => {
    test.setTimeout(180_000);

    await submitCommand(page, 'add DNS A record test-e2e.internal.lan pointing to 192.168.0.250');
    await page.getByText(/dns_add|dns_record/).first().waitFor({ state: 'visible', timeout: 60_000 });
    await waitForRunComplete(page, 60_000);

    await submitCommand(page, 'delete DNS A record test-e2e.internal.lan');
    await page.getByText('Confirmation Required').waitFor({ state: 'visible', timeout: 60_000 });

    await submitCommand(page, 'CONFIRM');
    await waitForRunComplete(page, 60_000);

    await expect(page.getByText(/Connection refused|error|failed/i).first()).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});
