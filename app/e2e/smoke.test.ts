import { test, expect } from "@playwright/test";

test("has title and landing page content", async ({ page }) => {
  await page.goto("/");

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Complexity/);

  // Check for the main heading
  const heading = page.getByRole("heading", { name: "Complexity" });
  await expect(heading).toBeVisible();

  // Check for the search bar or sign in links depending on auth state
  const signInLink = page.getByRole("link", { name: "Sign in" });
  const searchBar = page.getByPlaceholder("Ask anything...");

  // One of these should be visible
  const isSignedOut = await signInLink.isVisible();
  const isSignedIn = await searchBar.isVisible();

  expect(isSignedOut || isSignedIn).toBeTruthy();
});
