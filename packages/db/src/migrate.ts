import { createClient as createLibSQLClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export async function runMigrations(
  url?: string,
  authToken?: string,
): Promise<void> {
  const dbUrl = url ?? process.env["DATABASE_URL"] ?? "file:local.db";
  const token = authToken ?? process.env["DATABASE_AUTH_TOKEN"];

  const clientConfig: Parameters<typeof createLibSQLClient>[0] = { url: dbUrl };
  if (token) {
    clientConfig.authToken = token;
  }
  const client = createLibSQLClient(clientConfig);
  const db = drizzle(client, { schema });

  console.info("[migrate] Running database migrations...");
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  console.info("[migrate] Migrations completed successfully.");
}

// Run directly if executed as a script
if (import.meta.main) {
  runMigrations().catch((err: unknown) => {
    console.error("[migrate] Migration failed:", err);
    process.exit(1);
  });
}
