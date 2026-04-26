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
    process.stdout.write(`User exists (${existing.id}). Skipping registration.\n`);
  } else {
    const { userId } = await registerWithPassword(
      { email, password, displayName },
      db,
    );

    const created = (
      await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
    )[0];

    if (!created) {
      throw new Error(`Registration reported success for userId ${userId} but user was not found in the database.`);
    }

    process.stdout.write(`Registered user ${userId}.\n`);
  }

  await db.update(users).set({ role: "admin" }).where(eq(users.email, email));

  const after = (
    await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
  )[0];

  if (!after) {
    throw new Error(`Failed to retrieve user after promotion. No user found with email provided.`);
  }

  process.stdout.write("\nAdmin ready:\n");
  process.stdout.write(`  id:    ${after.id}\n`);
  process.stdout.write(`  email: [redacted]\n`);
  process.stdout.write(`  role:  ${after.role}\n`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});