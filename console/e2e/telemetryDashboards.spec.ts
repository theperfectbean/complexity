import { test, expect } from '@playwright/test';

test('renders telemetry dashboards for tool results', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('machine-state')).toHaveText('idle', { timeout: 10000 });

  // Trigger telemetry result
  await page.getByRole('button', { name: 'Simulate Telemetry' }).click();

  // Assert dashboard is visible
  const dashboard = page.getByTestId('telemetry-dashboard');
  await expect(dashboard).toBeVisible();
  
  // Assert specific widget (storage capacity)
  const storageWidget = page.getByTestId('storage-widget-node01');
  await expect(storageWidget).toBeVisible();
  await expect(storageWidget).toContainText('82%'); // Mock value
});
