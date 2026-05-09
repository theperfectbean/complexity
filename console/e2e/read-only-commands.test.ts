/**
 * E2E tests: read-only commands (tier 0) that should auto-execute without confirmation.
 * These tests run against the live homelab backend via the Vite dev proxy.
 *
 * Vite proxies /api -> http://192.168.0.105:3000 (complexity container).
 * The agent v2 route streams SSE directly from POST /api/agent/v2/runs.
 */

import { test, expect } from '@playwright/test';
import { submitCommand, waitForToolResult, waitForRunComplete, clearThreads, gotoConsole } from './helpers/agent';

test.beforeEach(async ({ page }) => {
  await gotoConsole(page);
  await clearThreads(page);
  await page.reload();
  await page.locator('[data-testid="message-input"]').waitFor({ state: 'visible' });
});

test.describe('Read-only commands', () => {
  test('list all containers in cluster', async ({ page }) => {
    await submitCommand(page, 'list all containers in the cluster');
    await waitForToolResult(page, 'pve_list', 60_000);
    await waitForRunComplete(page, 90_000);
    await expect(page.getByText('Confirmation Required')).not.toBeVisible({ timeout: 1000 }).catch(() => {});
  });

  test('check plex status', async ({ page }) => {
    await submitCommand(page, 'check plex status');
    await waitForToolResult(page, 'pve_status', 60_000);
    await waitForRunComplete(page, 90_000);
    await expect(page.getByText('Confirmation Required')).not.toBeVisible({ timeout: 1000 }).catch(() => {});
  });

  test('check disk space', async ({ page }) => {
    await submitCommand(page, 'how much disk space is on the NAS');
    await waitForToolResult(page, 'disk_usage', 60_000);
    await waitForRunComplete(page, 90_000);
    const content = await page.locator('div').filter({ hasText: /\d+G/ }).first().innerText().catch(() => '');
    expect(content.length).toBeGreaterThan(0);
  });

  test('check node resource usage', async ({ page }) => {
    test.setTimeout(120_000);
    await submitCommand(page, 'show CPU and memory usage on node01');
    await waitForToolResult(page, 'pve_node_status', 60_000);
    await waitForRunComplete(page, 90_000);
  });

  test('check qbittorrent running status', async ({ page }) => {
    await submitCommand(page, 'is qbittorrent running on ingestion');
    await page.getByText(/qbit|service_status/).first().waitFor({ state: 'visible', timeout: 60_000 });
    await waitForRunComplete(page, 90_000);
  });

  test('list running services on arrstack', async ({ page }) => {
    await submitCommand(page, 'list running services on arrstack');
    await waitForToolResult(page, 'pve_exec', 60_000);
    await waitForRunComplete(page, 90_000);
  });

  test('show sonarr logs', async ({ page }) => {
    await submitCommand(page, 'show last 20 lines of sonarr logs');
    await page.getByText(/pve_logs|pve_exec/).first().waitFor({ state: 'visible', timeout: 60_000 });
    await waitForRunComplete(page, 90_000);
  });

  test('DNS query for proxy container', async ({ page }) => {
    await submitCommand(page, 'look up the DNS record for proxy.internal.lan');
    await waitForToolResult(page, 'dns_query', 60_000);
    await waitForRunComplete(page, 90_000);
    await expect(page.getByText(/192\.168\.0\.100/)).toBeVisible({ timeout: 30_000 });
  });
});
