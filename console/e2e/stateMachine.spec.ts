import { test, expect } from '@playwright/test';

test('state machine transitions are reflected in UI', async ({ page }) => {
  await page.goto('/');
  
  // Initial state should be 'initializing' or 'fetchingContext'
  const stateDisplay = page.getByTestId('machine-state');
  await expect(stateDisplay).toHaveText(/initializing|fetchingContext/);
  
  // Wait for it to settle into 'idle'
  await expect(stateDisplay).toHaveText('idle', { timeout: 10000 });
});
