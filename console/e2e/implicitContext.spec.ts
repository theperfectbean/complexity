import { test, expect } from '@playwright/test';

test('fetches topology and displays status', async ({ page }) => {
  // Mock the API response
  await page.route('**/api/topology', async route => {
    const json = { nodes: [{ name: 'node01' }, { name: 'node02' }, { name: 'node03' }] };
    await route.fulfill({ json });
  });

  await page.goto('/');

  const statusIndicator = page.getByTestId('context-status');
  await expect(statusIndicator).toHaveText('Context Loaded: 3 Nodes');
  
  const stateDisplay = page.getByTestId('machine-state');
  await expect(stateDisplay).toHaveText('idle');
});
