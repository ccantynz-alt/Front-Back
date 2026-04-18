// ── Password Authentication ──────────────────────────────────────────
// Email + password registration and login using argon2id via the
// hash-wasm library. We used to use Bun.password but that only exists
// on the Bun runtime; hash-wasm is a WebAssembly argon2id implementation
// that runs identically on Bun AND Cloudflare Workers, which is the
// deploy target as of BLK-020 (Crontech Independence migration).
//
// Password complexity: minimum 8 characters, at least one number,
// at least one special character.

import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { argon2id, argon2Verify } from "hash-wasm";
import { users } from "@back-to-the-future/db";
import { createSession } from "./session";

// ── Password Validation Schema ──────────────────────────────────────

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[0-9]/, "Password must include at least one number")
  .regex(
    /[^a-zA-Z0-9]/,
    "Password must include at least one special character",
  );

export const registerWithPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
  displayName: z.string().min(1, "Display name is required").max(255),
});

export const loginWithPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ── Rate Limiting for Login Attempts ────────────────────────────────
// Simple in-memory rate limiter per email to prevent brute-force attacks.

interface LoginAttempt {
  count: number;
  firstAttempt: number;
  lockedUntil: number | null;
}

const loginAttempts = new Map<string, LoginAttempt>();
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

function checkLoginRateLimit(email: string): void {
  const attempt = loginAttempts.get(email);

  if (!attempt) return;

  // Check if locked out
  if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
    const remainingSeconds = Math.ceil(
      (attempt.lockedUntil - Date.now()) / 1000,
    );
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many login attempts. Try again in ${remainingSeconds} seconds.`,
    });
  }

  // Reset if window expired
  if (Date.now() - attempt.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(email);
  }
}

function recordFailedLogin(email: string): void {
  const existing = loginAttempts.get(email);

  if (!existing || Date.now() - existing.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(email, {
      count: 1,
      firstAttempt: Date.now(),
      lockedUntil: null,
    });
    return;
  }

  existing.count++;

  if (existing.count >= MAX_ATTEMPTS) {
    existing.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }
}

function clearLoginAttempts(email: string): void {
  loginAttempts.delete(email);
}

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of loginAttempts) {
    if (
      now - attempt.firstAttempt > ATTEMPT_WINDOW_MS &&
      (!attempt.lockedUntil || now > attempt.lockedUntil)
    ) {
      loginAttempts.delete(key);
    }
  }
}, 60_000);

// ── Password Hashing ────────────────────────────────────────────────
// argon2id parameters chosen to match the previous Bun.password defaults:
// 64 MB memory, 3 iterations, parallelism 1, 32-byte output.
// hash-wasm returns an encoded string ($argon2id$v=19$m=65536,t=3,p=1$…)
// that argon2Verify can parse back — no need to store parameters
// separately.

const ARGON2_MEMORY_KB = 65536; // 64 MB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;
const ARGON2_SALT_LENGTH = 16;

async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(ARGON2_SALT_LENGTH);
  crypto.getRandomValues(salt);
  return argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KB,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: "encoded",
  });
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return argon2Verify({ password, hash });
}

// ── Password Strength Calculation ───────────────────────────────────

export interface PasswordStrength {
  score: number; // 0-4
  label: "very_weak" | "weak" | "fair" | "strong" | "very_strong";
  suggestions: string[];
}

export function calculatePasswordStrength(
  password: string,
): PasswordStrength {
  let score = 0;
  const suggestions: string[] = [];

  if (password.length >= 8) score++;
  else suggestions.push("Use at least 8 characters");

  if (password.length >= 12) score++;
  else if (password.length >= 8)
    suggestions.push("Consider using 12+ characters for better security");

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  else suggestions.push("Mix uppercase and lowercase letters");

  if (/[0-9]/.test(password)) score++;
  else suggestions.push("Add at least one number");

  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else suggestions.push("Add a special character (!@#$%^&*)");

  // Cap at 4
  const finalScore = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;

  const labels: Record<number, PasswordStrength["label"]> = {
    0: "very_weak",
    1: "weak",
    2: "fair",
    3: "strong",
    4: "very_strong",
  };

  return {
    score: finalScore,
    label: labels[finalScore] ?? "very_weak",
    suggestions,
  };
}

// ── Database Type ───────────────────────────────────────────────────

type Database = Parameters<typeof createSession>[1];

// ── Registration ────────────────────────────────────────────────────

export async function registerWithPassword(
  input: z.infer<typeof registerWithPasswordSchema>,
  database: Database,
): Promise<{ userId: string; token: string }> {
  const { email, password, displayName } = input;

  // Check if user already exists
  const existing = await database
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const existingUser = existing[0];
  if (existingUser) {
    // If the user exists with a different auth provider, tell them
    if (existingUser.authProvider === "google") {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This email is already registered with Google. Please sign in with Google instead.",
      });
    }
    if (existingUser.passwordHash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "An account with this email already exists. Please sign in instead.",
      });
    }
    // User exists without password (e.g. passkey only) -- add password
    const hash = await hashPassword(password);
    await database
      .update(users)
      .set({
        passwordHash: hash,
        authProvider: existingUser.authProvider ?? "password",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));

    const token = await createSession(existingUser.id, database);
    return { userId: existingUser.id, token };
  }

  // Create new user with password
  const userId = crypto.randomUUID();
  const hash = await hashPassword(password);

  await database.insert(users).values({
    id: userId,
    email,
    displayName,
    passwordHash: hash,
    authProvider: "password",
  });

  const token = await createSession(userId, database);
  return { userId, token };
}

// ── Login ───────────────────────────────────────────────────────────

export async function loginWithPassword(
  input: z.infer<typeof loginWithPasswordSchema>,
  database: Database,
): Promise<{ userId: string; token: string }> {
  const { email, password } = input;

  // Check rate limit before anything else
  checkLoginRateLimit(email);

  // Find user by email
  const result = await database
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = result[0];
  if (!user) {
    recordFailedLogin(email);
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password.",
    });
  }

  // Check if user has a password set
  if (!user.passwordHash) {
    // User exists but registered via different method
    if (user.authProvider === "google") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message:
          "This account uses Google sign-in. Please sign in with Google.",
      });
    }
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "This account uses passkey authentication. Please sign in with your passkey.",
    });
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    recordFailedLogin(email);
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password.",
    });
  }

  // Clear failed attempts on successful login
  clearLoginAttempts(email);

  const token = await createSession(user.id, database);
  return { userId: user.id, token };
}
