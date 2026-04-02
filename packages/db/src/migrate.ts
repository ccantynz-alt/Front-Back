import { createClient as createLibSQLClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

async function runMigrations(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "file:local.db";
  const authToken = process.env["TURSO_AUTH_TOKEN"];

  console.log(`Running migrations against: ${url.startsWith("file:") ? url : url.replace(/\/\/.*@/, "//***@")}`);

  const client = createLibSQLClient({
    url,
    ...(authToken ? { authToken } : {}),
  });

  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("Migrations complete.");

  client.close();
}

runMigrations().catch((err: unknown) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
