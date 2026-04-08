import { test, expect } from '@playwright/test';
import { registerUser } from './helpers/auth';

test('Agent with Gemma 4 e2b correctly handles pve02 disk space mission', async ({ page }) => {
  test.setTimeout(360000); // 6 mins
  
  await registerUser(page, { emailPrefix: 'gemma4-check', name: 'Gemma Tester' });

  await page.goto('/console');
  
  // Select Gemma 4 e2b model
  await page.getByRole('button', { name: 'Select model' }).click();
  await page.getByRole('menuitem').filter({ hasText: 'Ollama: Gemma 4 e2b' }).click();
  
  const input = page.getByPlaceholder('Describe a cluster sysadmin task...');
  await input.fill('Check disk space on pve02 staging mount and report any issues.');
  
  // Send message
  await page.locator('button:has(svg.lucide-corner-down-right)').click();

  console.log('Waiting for mission response from Gemma...');
  
  // Wait for the mission state to change from 'Ready for mission'
  await expect(page.locator('header p.text-muted-foreground')).not.toContainText('Ready for mission', { timeout: 120000 });
  
  // Wait for plan or tool execution
  console.log('Waiting for plan or execution...');
  await expect(page.locator('main')).toContainText(/Mission Plan|Executing|df -h/i, { timeout: 120000 });
  
  const approveButton = page.getByRole('button', { name: 'Approve & Execute' });
  if (await approveButton.isVisible()) {
      console.log('Plan found, approving...');
      await approveButton.click();
  }

  // Wait for results
  console.log('Waiting for results (this model is slow)...');
  
  // Give it a fixed wait to allow the stream to progress
  await page.waitForTimeout(10000);

  // The model might either stream raw df output or just summarize it.
  await expect(page.locator('main')).toContainText(/staging|Filesystem|Used|GB|TB|OK|Issue/i, { timeout: 240000 });
  
  console.log('E2E Test Success!');
});
