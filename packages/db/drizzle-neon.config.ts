import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/neon-schema.ts",
  out: "./drizzle/neon",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["NEON_DATABASE_URL"] ?? "",
  },
  verbose: true,
  strict: true,
});
