
import { refreshModelHealthSnapshot } from "./src/lib/model-health";

async function run() {
  console.log("Triggering fresh health snapshot...");
  const snapshot = await refreshModelHealthSnapshot();
  console.log("Snapshot updated.");
  console.log("\n--- Current Health Status for Dropdown ---");
  Object.entries(snapshot.models).forEach(([id, entry]) => {
    console.log(` - ${id}: ${entry.status} (Reason: ${entry.reason || "OK"})`);
  });
}

run().catch(err => {
  console.error("Error refreshing health:", err);
  process.exit(1);
});
