import { trpc } from "./trpc";

// ── Users ────────────────────────────────────────────────────────────

export async function fetchUsers(
  cursor?: string,
  limit = 20,
): ReturnType<typeof trpc.users.list.query> {
  return trpc.users.list.query({ cursor, limit });
}

export async function fetchUserById(
  id: string,
): ReturnType<typeof trpc.users.getById.query> {
  return trpc.users.getById.query({ id });
}

export async function createUser(input: {
  email: string;
  displayName: string;
  role?: "admin" | "editor" | "viewer";
}): ReturnType<typeof trpc.users.create.mutate> {
  return trpc.users.create.mutate(input);
}

export async function updateUser(input: {
  id: string;
  email?: string;
  displayName?: string;
  role?: "admin" | "editor" | "viewer";
}): ReturnType<typeof trpc.users.update.mutate> {
  return trpc.users.update.mutate(input);
}

export async function deleteUser(
  id: string,
): ReturnType<typeof trpc.users.delete.mutate> {
  return trpc.users.delete.mutate({ id });
}

// ── Auth ─────────────────────────────────────────────────────────────

export async function loginStart(
  email?: string,
): ReturnType<typeof trpc.auth.login.start.mutate> {
  return trpc.auth.login.start.mutate(email ? { email } : undefined);
}

export async function loginFinish(input: {
  userId: string | null;
  response: Parameters<typeof trpc.auth.login.finish.mutate>[0]["response"];
}): ReturnType<typeof trpc.auth.login.finish.mutate> {
  return trpc.auth.login.finish.mutate(input);
}

export async function registerStart(
  email: string,
  displayName: string,
): ReturnType<typeof trpc.auth.register.start.mutate> {
  return trpc.auth.register.start.mutate({ email, displayName });
}

export async function registerFinish(input: {
  userId: string;
  response: Parameters<typeof trpc.auth.register.finish.mutate>[0]["response"];
}): ReturnType<typeof trpc.auth.register.finish.mutate> {
  return trpc.auth.register.finish.mutate(input);
}

export async function logout(): ReturnType<typeof trpc.auth.logout.mutate> {
  return trpc.auth.logout.mutate();
}

export async function fetchMe(): ReturnType<typeof trpc.auth.me.query> {
  return trpc.auth.me.query();
}

// ── Health ────────────────────────────────────────────────────────────

export async function healthCheck(): ReturnType<typeof trpc.health.query> {
  return trpc.health.query();
}
