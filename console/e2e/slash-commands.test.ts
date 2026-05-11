import { test, expect } from '@playwright/test';
import { clearThreads, gotoConsole, submitCommand, waitForRunComplete } from './helpers/agent';

test.beforeEach(async ({ page }) => {
  await gotoConsole(page);
  await clearThreads(page);
  await page.reload();
  await page.locator('[data-testid="message-input"]').waitFor({ state: 'visible' });
});

test.describe('Slash commands', () => {
  test('help renders locally without a confirmation flow', async ({ page }) => {
    await submitCommand(page, '/help');
    await waitForRunComplete(page, 30_000);

    await page.getByText('Tool Result: help').click();
    await expect(page.getByText(/Available slash commands/i)).toBeVisible();
    await expect(page.getByRole('cell', { name: '/model', exact: true })).toBeVisible();
    await expect(page.getByText('Confirmation Required')).not.toBeVisible();
  });

  test('model switch via slash command updates the selected model for the next request', async ({ page }) => {
    const requestBodies: Array<{ message?: string; modelId?: string }> = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/agent/unified/runs') && request.method() === 'POST') {
        const body = request.postDataJSON() as { message?: string; modelId?: string };
        requestBodies.push(body);
      }
    });

    await submitCommand(page, '/model gpt-4o-mini');
    await waitForRunComplete(page, 30_000);
    await expect(page.getByText(/openai\/gpt-4o-mini/i)).toBeVisible();

    await submitCommand(page, 'status');
    await waitForRunComplete(page, 90_000);

    const lastBody = requestBodies.at(-1);
    expect(lastBody?.message).toBe('status');
    expect(lastBody?.modelId).toContain('openai/gpt-4o-mini');
  });
});
