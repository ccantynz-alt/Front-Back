#!/usr/bin/env bun
/**
 * Seed Admin — Promote a user to admin role by email.
 *
 * Usage:
 *   bun run scripts/seed-admin.ts <email>
 *
 * Example:
 *   bun run scripts/seed-admin.ts craig@crontech.ai
 *
 * This script connects to the database and sets the user's role
 * to "admin". If the user doesn't exist, it tells you.
 *
 * Safe to run multiple times — it's idempotent.
 */

import { db } from "@back-to-the-future/db";
import { users } from "@back-to-the-future/db";
import { eq } from "drizzle-orm";

async function main(): Promise<void> {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: bun run scripts/seed-admin.ts <email>");
    console.error("Example: bun run scripts/seed-admin.ts craig@crontech.ai");
    process.exit(1);
  }

  console.log(`Looking up user: ${email}...`);

  const result = await db
    .select({ id: users.id, email: users.email, role: users.role, displayName: users.displayName })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = result[0];

  if (!user) {
    console.error(`\nUser not found: ${email}`);
    console.error("Register an account first, then run this script.");
    process.exit(1);
  }

  if (user.role === "admin") {
    console.log(`\n${user.displayName} (${user.email}) is already an admin. No changes needed.`);
    process.exit(0);
  }

  await db
    .update(users)
    .set({ role: "admin" })
    .where(eq(users.id, user.id));

  console.log(`\nPromoted to admin:`);
  console.log(`  Name:  ${user.displayName}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Role:  ${user.role} → admin`);
  console.log(`\nDone. Log out and back in for the change to take effect.`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
