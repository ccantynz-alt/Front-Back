export { db, getDb, createClient } from "./client";
export type { Database } from "./client";
export * from "./schema";
export * from "./rbac-schema";
export * from "./support-schema";

export { getNeonDb, createNeonClient, createNeonPoolClient } from "./neon-client";
export type { NeonDatabase } from "./neon-client";
export * from "./neon-schema";
