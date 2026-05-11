import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Type a command into the AgentChat input and submit it.
 */
export async function submitCommand(page: Page, command: string): Promise<void> {
  const input = page.locator('[data-testid="message-input"]');
  await input.fill(command);
  await expect(input).toHaveValue(command);
  await input.press('Enter');
  await expect(input).toHaveValue('', { timeout: 5000 });
}

/**
 * Wait until the agent emits an event of a given type matching optional text.
 */
export async function waitForEventType(
  page: Page,
  type: 'text' | 'tool_start' | 'tool_result' | 'tool_error' | 'destructive_confirm' | 'error',
  options: { textMatch?: string | RegExp; timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 90_000;
  switch (type) {
    case 'text':
      if (options.textMatch) {
        await page.getByText(options.textMatch).first().waitFor({ state: 'visible', timeout });
      }
      break;
    case 'tool_start':
      if (options.textMatch) {
        await page.getByText(options.textMatch).first().waitFor({ state: 'visible', timeout });
      } else {
        await page.getByText(/Using .+…/).first().waitFor({ state: 'visible', timeout });
      }
      break;
    case 'tool_result':
      if (options.textMatch) {
        await page.getByText(options.textMatch).first().waitFor({ state: 'visible', timeout });
      } else {
        await page.locator('[data-testid="tool-result"]').first().waitFor({ state: 'visible', timeout });
      }
      break;
    case 'tool_error':
      await page.locator('[data-testid="error-block"]').first().waitFor({ state: 'visible', timeout });
      break;
    case 'destructive_confirm':
      await page.getByText('Confirmation Required').first().waitFor({ state: 'visible', timeout });
      break;
    case 'error':
      await page.locator('[data-testid="error-block"]').first().waitFor({ state: 'visible', timeout });
      break;
  }
}

/**
 * Wait for the agent to produce any assistant text response.
 */
export async function waitForAgentResponse(page: Page, timeoutMs = 90_000): Promise<string> {
  const bubble = page.locator('[data-testid="assistant-message"]').first();
  await bubble.waitFor({ state: 'visible', timeout: timeoutMs });
  return bubble.innerText();
}

/**
 * Wait for the agent run to finish (input re-enabled).
 */
export async function waitForRunComplete(page: Page, timeoutMs = 120_000): Promise<void> {
  await page.locator('[data-testid="message-input"]:not([disabled])').waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForTimeout(300);
}

/**
 * Check that the agent produced a tool_result event for a given tool.
 */
export async function waitForToolResult(
  page: Page,
  toolName: string,
  timeoutMs = 90_000,
): Promise<void> {
  await page.getByText(`Result: ${toolName}`).first().waitFor({ state: 'visible', timeout: timeoutMs });
}

/**
 * Clear all threads from localStorage (fresh state for next test).
 */
export async function clearThreads(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('fleet_console_threads_v1');
  });
}

/**
 * Navigate to the console root and wait for it to be ready.
 */
export async function gotoConsole(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-testid="message-input"]').waitFor({ state: 'visible', timeout: 10_000 });
}
