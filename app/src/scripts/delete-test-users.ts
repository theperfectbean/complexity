import { db } from "../lib/db";
import { users } from "../lib/db/schema";
import { ilike, or } from "drizzle-orm";

async function main() {
  console.log("🔍 Searching for test users...");

  const testUsers = await db
    .select()
    .from(users)
    .where(
      or(
        ilike(users.email, "%test%"),
        ilike(users.email, "%example.com%")
      )
    );

  if (testUsers.length === 0) {
    console.log("✅ No test users found.");
    process.exit(0);
  }

  console.log(`🗑️ Found ${testUsers.length} test users. Deleting them...`);

  await db.delete(users).where(
    or(
      ilike(users.email, "%test%"),
      ilike(users.email, "%example.com%")
    )
  );

  console.log(`✅ Successfully deleted ${testUsers.length} test users.`);
  
  // Explicitly exit the process so it doesn't hang on the open database connection pool
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
