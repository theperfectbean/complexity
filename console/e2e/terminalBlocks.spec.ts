import { test, expect } from '@playwright/test';

test('renders interactive terminal blocks upon tool execution', async ({ page }) => {
  await page.goto('/');

  // Wait for context to load so button is available and machine is idle
  await expect(page.getByTestId('machine-state')).toHaveText('idle', { timeout: 10000 });

  // Trigger a mock tool execution
  const executeBtn = page.getByRole('button', { name: 'Run Mock Tool' });
  await executeBtn.click();

  // Assert terminal container is visible
  const terminalContainer = page.getByTestId('terminal-block');
  await expect(terminalContainer).toBeVisible({ timeout: 5000 });

  // Assert specific output is rendered in the terminal
  await expect(terminalContainer).toContainText('Executing SshTool...');
});
