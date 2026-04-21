/**
 * E2E tests: read-only commands that should auto-execute without confirmation.
 * These tests run against the live homelab backend via the Vite dev proxy.
 *
 * Vite proxies /api -> http://192.168.0.105:3000 (complexity container).
 * The agent v2 route streams SSE directly from POST /api/agent/v2/runs.
 *
 * All commands in this file are read-only (tier 0) and should complete
 * without a destructive_confirm prompt.
 */

import { test, expect } from '@playwright/test';
import { submitCommand, waitForToolResult, waitForRunComplete, clearThreads, gotoConsole } from './helpers/agent';

test.beforeEach(async ({ page }) => {
  await gotoConsole(page);
  await clearThreads(page);
  await page.reload();
  await page.getByPlaceholder('Ask the fleet agent...').waitFor({ state: 'visible' });
});

test.describe('Read-only commands', () => {
  test('check plex status', async ({ page }) => {
    await submitCommand(page, 'check plex status');
    await waitForToolResult(page, 'plex_status', 60_000);
    await waitForRunComplete(page, 90_000);

    // No destructive confirm should appear
    await expect(page.getByText('Confirmation Required')).not.toBeVisible({ timeout: 1000 }).catch(() => {});
  });

  test('check disk space', async ({ page }) => {
    await submitCommand(page, 'how much disk space is on the NAS');
    await waitForToolResult(page, 'disk_usage', 60_000);
    await waitForRunComplete(page, 90_000);

    // Response should mention storage sizes
    const content = await page.locator('div').filter({ hasText: /\d+G/ }).first().innerText().catch(() => '');
    expect(content.length).toBeGreaterThan(0);
  });

  test('check qbittorrent running status', async ({ page }) => {
    await submitCommand(page, 'is qbittorrent running on ingestion');
    // The agent should call either qbit_status (REST API) or service_status (SSH)
    await page.getByText(/qbit|service_status/).first().waitFor({ state: 'visible', timeout: 60_000 });
    await waitForRunComplete(page, 90_000);
  });

  test('list running services on arrstack', async ({ page }) => {
    await submitCommand(page, 'list running services on arrstack');
    await waitForToolResult(page, 'service_status', 60_000);
    await waitForRunComplete(page, 90_000);
  });

  test('show sonarr logs', async ({ page }) => {
    await submitCommand(page, 'show last 20 lines of sonarr logs');
    await page.getByText(/journalctl|service_status/).first().waitFor({ state: 'visible', timeout: 60_000 });
    await waitForRunComplete(page, 90_000);
  });

  test('check CPU and memory on all nodes', async ({ page }) => {
    await submitCommand(page, 'show CPU and memory usage across all nodes');
    await page.getByText(/disk_usage|ssh_exec|service_status/).first().waitFor({ state: 'visible', timeout: 60_000 });
    await waitForRunComplete(page, 120_000);
  });

  test('check forgejo git server status', async ({ page }) => {
    await submitCommand(page, 'is the forgejo git server running');
    await page.getByText(/incus_status|service_status/).first().waitFor({ state: 'visible', timeout: 60_000 });
    await waitForRunComplete(page, 90_000);
  });

  test('DNS query for proxy container', async ({ page }) => {
    await submitCommand(page, 'look up the DNS record for proxy.internal.lan');
    await waitForToolResult(page, 'dns_query', 60_000);
    await waitForRunComplete(page, 90_000);

    // Should mention the proxy IP in the response
    await expect(page.getByText(/192\.168\.0\.100/)).toBeVisible({ timeout: 30_000 });
  });

  test('storage pool status', async ({ page }) => {
    await submitCommand(page, 'show incus storage pool usage');
    await waitForToolResult(page, 'storage_pool_status', 60_000);
    await waitForRunComplete(page, 90_000);
  });

  test('NFS mount health check', async ({ page }) => {
    await submitCommand(page, 'check if NFS mount is healthy on media node');
    await waitForToolResult(page, 'nfs_mount_status', 60_000);
    await waitForRunComplete(page, 90_000);
  });
});
