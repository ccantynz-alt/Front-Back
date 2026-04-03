import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import * as schema from "./neon-schema";

async function runNeonMigrations(): Promise<void> {
  const connectionString = process.env["NEON_DATABASE_URL"];

  if (!connectionString) {
    throw new Error("NEON_DATABASE_URL environment variable is required.");
  }

  const maskedUrl = connectionString.replace(/\/\/.*@/, "//***@");
  console.log(`Running Neon migrations against: ${maskedUrl}`);

  const sql = neon(connectionString);
  const db = drizzle(sql, { schema });

  const migrationsFolder = import.meta.dir + "/../drizzle/neon";
  await migrate(db, { migrationsFolder });

  console.log("Neon migrations complete.");
}

runNeonMigrations().catch((err: unknown) => {
  console.error("Neon migration failed:", err);
  process.exit(1);
});
