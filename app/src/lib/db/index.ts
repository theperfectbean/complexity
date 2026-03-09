import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres";

const client = postgres(connectionString, {
  max: 10,
  prepare: false,
});

export const db = drizzle(client, { schema });
