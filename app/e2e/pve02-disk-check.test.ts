import { test, expect } from '@playwright/test';
import { registerUser } from './helpers/auth';

test('Agent correctly handles pve02 disk space check mission', async ({ page }) => {
  test.setTimeout(120000);
  
  await registerUser(page, { emailPrefix: 'pve02-check', name: 'Disk Check Tester' });

  await page.goto('/console');
  
  await page.getByRole('button', { name: 'Select model' }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Claude Sonnet 4.6' }).nth(0).click();
  
  const input = page.getByPlaceholder('Describe a cluster sysadmin task...');
  await input.fill('Check disk space on pve02 staging mount and report any issues.');
  
  await page.locator('button:has(svg.lucide-corner-down-right)').click();

  console.log('Waiting for mission response...');
  
  await expect(page.locator('header p.text-muted-foreground')).not.toContainText('Ready for mission', { timeout: 60000 });
  
  // Wait 10s
  await page.waitForTimeout(10000);
  const feedText = await page.innerText('main');
  console.log('--- FEED TEXT ---');
  console.log(feedText);
});
