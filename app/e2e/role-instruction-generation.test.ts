import { test, expect } from "@playwright/test";
import { registerUser } from "./helpers/auth";

test.describe("Role Instruction Generation", () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, { emailPrefix: "role-gen", name: "Role Gen Tester" });
  });

  test("should generate instructions using AI", async ({ page }) => {
    await page.goto("/roles/new");
    
    // 1. Open generator
    await page.getByRole('button', { name: 'Generate with AI' }).click();
    
    // 2. Fill prompt
    await page.getByPlaceholder(/senior software engineer/i).fill("A helpful Python assistant that specializes in data science.");
    
    // 3. Click generate
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    
    // 4. Wait for completion (text should appear in the instructions textarea)
    const instructionsTextarea = page.locator('textarea').last();
    
    // Check multiple times for content growth
    let generated = false;
    for (let i = 0; i < 20; i++) {
      const val = await instructionsTextarea.inputValue();
      if (val.length > 50) {
        generated = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    
    expect(generated).toBe(true);
    console.log("Instructions generated successfully!");
  });
});
