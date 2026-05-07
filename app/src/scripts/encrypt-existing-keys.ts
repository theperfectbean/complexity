import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { settings } from "../lib/db/schema";
import { encrypt, isEncrypted } from "../lib/encryption";
import { env } from "../lib/env";

const SENSITIVE_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "LOCAL_OPENAI_API_KEY",
];

async function main() {
  if (!env.ENCRYPTION_KEY) {
    console.error("❌ ENCRYPTION_KEY is not set in environment. Aborting.");
    process.exit(1);
  }

  console.log("Starting migration to encrypt existing sensitive keys...");

  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, SENSITIVE_KEYS));

  let updatedCount = 0;

  for (const row of rows) {
    if (row.value && !isEncrypted(row.value)) {
      console.log(`Encrypting key: ${row.key}...`);
      const encryptedValue = encrypt(row.value);
      
      await db
        .update(settings)
        .set({ value: encryptedValue, updatedAt: new Date() })
        .where(eq(settings.key, row.key));
      
      updatedCount++;
    } else {
      console.log(`Skipping key: ${row.key} (already encrypted or empty).`);
    }
  }

  console.log(`✅ Migration complete. ${updatedCount} keys updated.`);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
