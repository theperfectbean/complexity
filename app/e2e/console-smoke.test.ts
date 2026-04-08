import { test, expect } from '@playwright/test';
import { registerUser } from './helpers/auth';

test('Console starts a mission and receives events', async ({ page }) => {
  test.setTimeout(90000);
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  await registerUser(page, { emailPrefix: 'console-smoke', name: 'Console Smoke Test' });

  await page.goto('/console');
  await expect(page.getByRole('heading', { name: 'Cluster Console' })).toBeVisible();

  const input = page.getByPlaceholder('Describe a cluster sysadmin task...');
  await input.fill('Check uptime on pve01');
  await input.press('Enter');

  // Wait for events
  await expect(page.locator('text=Reasoning')
    .or(page.locator('text=Mission plan proposed'))
    .or(page.locator('text=Error'))
    .or(page.locator('text=Executing'))).toBeVisible({ timeout: 60000 });
});
