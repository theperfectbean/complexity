import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

type RegisterOptions = {
  emailPrefix?: string;
  name?: string;
  password?: string;
  waitForHome?: boolean;
};

export type RegisteredUser = {
  email: string;
  password: string;
  name: string;
};

function randomEmail(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

export async function registerUser(page: Page, options: RegisterOptions = {}): Promise<RegisteredUser> {
  const emailPrefix = options.emailPrefix ?? "e2e-user";
  const name = options.name ?? "E2E User";
  const password = options.password ?? "password123";
  const email = randomEmail(emailPrefix);

  await page.goto("/register");
  await page.getByPlaceholder("Name").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password (min 8 chars)").fill(password);
  await page.getByRole("button", { name: "Create account" }).click({ force: true });

  if (options.waitForHome !== false) {
    await expect(page.locator('textarea[placeholder*="Ask"]').first()).toBeVisible({ timeout: 30000 });
  }

  return { email, password, name };
}

