import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Type a command into the AgentChat input and submit it.
 */
export async function submitCommand(page: Page, command: string): Promise<void> {
  const input = page.getByPlaceholder('Ask the fleet agent...');
  await input.fill(command);
  await expect(input).toHaveValue(command);
  await input.press('Enter');
  // Input should clear after submit
  await expect(input).toHaveValue('', { timeout: 5000 });
}

/**
 * Wait until the agent emits an event of a given type matching optional text.
 * Watches for visible text in the chat area.
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
      // tool_start renders "Running <toolname>…"
      if (options.textMatch) {
        await page.getByText(options.textMatch).first().waitFor({ state: 'visible', timeout });
      } else {
        await page.getByText(/Running .+…/).first().waitFor({ state: 'visible', timeout });
      }
      break;
    case 'tool_result':
      // tool_result renders "✓" followed by tool name
      if (options.textMatch) {
        await page.getByText(options.textMatch).first().waitFor({ state: 'visible', timeout });
      } else {
        await page.getByText('✓').first().waitFor({ state: 'visible', timeout });
      }
      break;
    case 'tool_error':
      await page.getByText('✗').first().waitFor({ state: 'visible', timeout });
      break;
    case 'destructive_confirm':
      await page.getByText('Confirmation Required').first().waitFor({ state: 'visible', timeout });
      break;
    case 'error':
      await page.getByText(/✗/).first().waitFor({ state: 'visible', timeout });
      break;
  }
}

/**
 * Wait for the agent to produce any assistant text response.
 * The agent emits a `text` event rendered as a message bubble.
 */
export async function waitForAgentResponse(page: Page, timeoutMs = 90_000): Promise<string> {
  // Wait for any assistant text bubble to appear (div with var(--bg-surface) background)
  const bubble = page.locator('div').filter({ hasText: /\w{5,}/ }).first();
  await bubble.waitFor({ state: 'visible', timeout: timeoutMs });
  return bubble.innerText();
}

/**
 * Wait for the agent run to finish (no more spinner visible, cancel btn gone).
 * Returns when the send button is re-enabled.
 */
export async function waitForRunComplete(page: Page, timeoutMs = 120_000): Promise<void> {
  // The "cancel" (Loader2) button appears while running; disappears when done
  // We wait for the send button (svg lucide-send) to be visible again
  await page.waitForFunction(
    () => {
      const btns = document.querySelectorAll('button[type="submit"]');
      return btns.length > 0;
    },
    { timeout: timeoutMs },
  );
  // Additional short wait for UI to settle
  await page.waitForTimeout(500);
}

/**
 * Check that the agent produced a tool_result event for a given tool.
 * Returns the result row element.
 */
export async function waitForToolResult(
  page: Page,
  toolName: string,
  timeoutMs = 90_000,
): Promise<void> {
  await page.getByText(toolName).first().waitFor({ state: 'visible', timeout: timeoutMs });
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
  await page.getByPlaceholder('Ask the fleet agent...').waitFor({ state: 'visible', timeout: 10_000 });
}
