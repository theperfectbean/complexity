import { test, expect } from '@playwright/test';

test('full integration lifecycle', async ({ page }) => {
  // Mock the new topology API
  await page.route('**/api/proxmox/topology', async route => {
    await route.fulfill({ json: { nodes: [{ name: 'node01' }], containers: [], timestamp: new Date().toISOString() } });
  });

  // Mock the streaming agent API
  await page.route('**/api/agent/unified/runs', async route => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postDataJSON();
      
      if (body.message === 'restart plex' && !body.approvalId) {
        // First call: send text and sudo intercept
        const stream = [
          'data: {"type": "text", "content": "Executing restart..."}\n\n',
          'data: {"type": "destructive_confirm", "approvalId": "app-123", "message": "Destructive action proposed"}\n\n'
        ].join('');
        await route.fulfill({ contentType: 'text/event-stream', body: stream });
      } else if (body.approvalId === 'app-123' && body.message === 'CONFIRM') {
        // Second call (approval): send success and tool result (telemetry)
        const stream = [
          'data: {"type": "text", "content": "Approved!"}\n\n',
          'data: {"type": "tool_result", "tool": "storage", "result": {"nodes": [{"name": "node01", "mem": 0.82}]}}\n\n',
          'data: {"type": "done"}\n\n'
        ].join('');
        await route.fulfill({ contentType: 'text/event-stream', body: stream });
      }
    }
  });

  await page.goto('/');
  await expect(page.getByTestId('machine-state')).toHaveText('idle', { timeout: 10000 });

  const input = page.getByPlaceholder('Enter command (e.g., restart plex)...');
  await input.fill('restart plex');
  await page.keyboard.press('Enter');

  // Wait for sudo widget
  const sudoWidget = page.getByTestId('sudo-approval-widget');
  await expect(sudoWidget).toBeVisible({ timeout: 10000 });
  await expect(sudoWidget).toContainText('Destructive action proposed');
  
  await page.getByRole('button', { name: 'CONFIRM' }).click();
  
  // Verify telemetry result appearing after approval finishes tool
  const dashboard = page.getByTestId('telemetry-dashboard');
  await expect(dashboard).toBeVisible();
  await expect(dashboard).toContainText('82%');
});
