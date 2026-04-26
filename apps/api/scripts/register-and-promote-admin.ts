#!/usr/bin/env bun
/**
 * Register-and-Promote — one-shot admin bootstrap.
 *
 * Creates a password-auth user via the same code path as POST /register,
 * then flips that user's role to "admin". Use this on a fresh local DB
 * (or a fresh prod DB) to bootstrap your first admin without needing
 * the dev server up to register through the UI.
 *
 * Usage:
 *   bun run scripts/register-and-promote-admin.ts <email> <password> "<display name>"
 *
 * Example:
 *   bun run scripts/register-and-promote-admin.ts craig@crontech.ai 'Hunter2!sup' "Craig"
 *
 * Idempotent: if the email already exists, the script skips registration
 * and only promotes.
 */

import { db } from "@back-to-the-future/db";
import { users } from "@back-to-the-future/db";
import { registerWithPassword } from "../src/auth/password";
import { eq } from "drizzle-orm";

async function main(): Promise<void> {
  const [email, password, displayName] = process.argv.slice(2);

  if (!email || !password || !displayName) {
    console.error(
      "Usage: bun run scripts/register-and-promote-admin.ts <email> <password> \"<display name>\"",
    );
    process.exit(1);
  }

  const existing = (
    await db.select().from(users).where(eq(users.email, email)).limit(1)
  )[0];

  if (existing) {
    console.log(`User exists (${existing.id}). Skipping registration.`);
  } else {
    const { userId } = await registerWithPassword(
      { email, password, displayName },
      db,
    );
    console.log(`Registered user ${userId}.`);
  }

  await db.update(users).set({ role: "admin" }).where(eq(users.email, email));

  const after = (
    await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
  )[0];

  console.log("\nAdmin ready:");
  console.log(`  id:    ${after?.id}`);
  console.log(`  email: ${after?.email}`);
  console.log(`  role:  ${after?.role}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
