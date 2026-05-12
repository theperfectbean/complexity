import { test, expect } from '@playwright/test';

test('intercepts destructive actions and prompts for sudo', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('/');
  
  const stateDisplay = page.getByTestId('machine-state');
  await expect(stateDisplay).toHaveText('idle', { timeout: 10000 });

  console.log('--- Triggering via click() ---');
  await page.getByRole('button', { name: 'Run Mock Tool' }).click();
  
  await expect(stateDisplay).toHaveText('executingTool', { timeout: 10000 });
  
  await page.getByRole('button', { name: 'Simulate Sudo' }).click();
  await expect(stateDisplay).toHaveText('awaitingSudo');
  
  const sudoWidget = page.getByTestId('sudo-approval-widget');
  await expect(sudoWidget).toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(stateDisplay).toHaveText('executingTool');
});
