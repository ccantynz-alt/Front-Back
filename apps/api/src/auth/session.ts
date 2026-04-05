import { eq, and, gt } from "drizzle-orm";
import { sessions, db as _dbTypeRef } from "@back-to-the-future/db";

// Use the actual db instance type for compatibility with both createClient and db export
type Database = typeof _dbTypeRef;

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateId(): string {
  return crypto.randomUUID();
}

export async function createSession(
  userId: string,
  database: Database,
): Promise<string> {
  const token = generateToken();
  const id = generateId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await database.insert(sessions).values({
    id,
    userId,
    token,
    expiresAt,
  });

  return token;
}

export async function validateSession(
  token: string,
  database: Database,
): Promise<string | null> {
  const now = new Date();

  const result = await database
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .limit(1);

  const session = result[0];
  if (!session) {
    return null;
  }

  return session.userId;
}

export async function deleteSession(
  token: string,
  database: Database,
): Promise<void> {
  await database.delete(sessions).where(eq(sessions.token, token));
}
