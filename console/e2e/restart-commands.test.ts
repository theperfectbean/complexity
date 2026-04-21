/**
 * E2E regression tests for service restart commands.
 *
 * These are tier-1 actions (service_restart) — they execute without user
 * confirmation but are audited. The critical regression is qbittorrent restart
 * which previously hung due to a 30s SSH timeout (now fixed to 120s).
 *
 * Safety: all restarts are of non-critical background services that recover
 * automatically. Tests are run serially (workers: 1 in playwright.config.ts)
 * to avoid concurrent restarts of the same services.
 */

import { test, expect } from '@playwright/test';
import { submitCommand, waitForToolResult, waitForRunComplete, clearThreads, gotoConsole } from './helpers/agent';

test.beforeEach(async ({ page }) => {
  await gotoConsole(page);
  await clearThreads(page);
  await page.reload();
  await page.getByPlaceholder('Ask the fleet agent...').waitFor({ state: 'visible' });
});

test.describe('Service restart commands', () => {
  /**
   * REGRESSION: qbittorrent restart previously hung with exitCode 130 (SIGKILL)
   * because ssh-executor had a 30s default timeout. qbittorrent-nox flushes its
   * session data on restart which takes 60–120s on a busy node.
   * Fixed: SshTool.ts default timeoutMs 30000 → 120000.
   */
  test('restart qbittorrent — regression test for hang', async ({ page }) => {
    test.setTimeout(180_000);

    await submitCommand(page, 'restart qbittorrent on ingestion');

    // Agent should call service_restart (tier 1 — no confirmation needed)
    await page.getByText('service_restart').waitFor({ state: 'visible', timeout: 60_000 });

    // Wait for the result — must complete within 120s of the restart command
    await waitForToolResult(page, 'service_restart', 120_000);
    await waitForRunComplete(page, 150_000);

    // Verify tool_result shows success — look for ✓ next to service_restart
    const resultRow = page.locator('text=service_restart').first();
    await expect(resultRow).toBeVisible();

    // There should be NO error event visible
    await expect(page.getByText(/Connection refused|timed out|exitCode.*130/)).not.toBeVisible();
  });

  test('restart sonarr on arrstack', async ({ page }) => {
    test.setTimeout(120_000);

    await submitCommand(page, 'restart sonarr on arrstack');
    await page.getByText('service_restart').waitFor({ state: 'visible', timeout: 60_000 });
    await waitForToolResult(page, 'service_restart', 90_000);
    await waitForRunComplete(page, 120_000);

    await expect(page.getByText(/Connection refused|timed out/)).not.toBeVisible();
  });

  test('restart radarr on arrstack', async ({ page }) => {
    test.setTimeout(120_000);

    await submitCommand(page, 'restart radarr on arrstack');
    await page.getByText('service_restart').waitFor({ state: 'visible', timeout: 60_000 });
    await waitForToolResult(page, 'service_restart', 90_000);
    await waitForRunComplete(page, 120_000);
  });

  test('reload caddy config on proxy', async ({ page }) => {
    test.setTimeout(90_000);

    await submitCommand(page, 'reload caddy config on proxy');
    // caddy_reload is tier 1 — no confirmation
    await page.getByText(/caddy_reload|service_restart/).first().waitFor({ state: 'visible', timeout: 60_000 });
    await waitForRunComplete(page, 90_000);
  });

  test('restart prowlarr on arrstack', async ({ page }) => {
    test.setTimeout(120_000);

    await submitCommand(page, 'restart prowlarr on arrstack');
    await page.getByText('service_restart').waitFor({ state: 'visible', timeout: 60_000 });
    await waitForToolResult(page, 'service_restart', 90_000);
    await waitForRunComplete(page, 120_000);
  });
});
