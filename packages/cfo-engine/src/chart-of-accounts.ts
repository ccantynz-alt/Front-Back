// ── Chart of Accounts ───────────────────────────────────────────────
// Simple in-memory store for Account records. Enforces unique
// account codes and validates every Account through the Zod schema
// on insert. Swap this out for a persistent implementation (Drizzle
// + Neon) when moving beyond the scaffold phase.

import { AccountSchema, type Account } from "./types";

export interface AccountStore {
  add(account: Account): Account;
  get(id: string): Account | null;
  getByCode(code: string): Account | null;
  list(): Account[];
  count(): number;
}

export class InMemoryAccountStore implements AccountStore {
  private readonly byId = new Map<string, Account>();
  private readonly byCode = new Map<string, Account>();

  add(account: Account): Account {
    const validated = AccountSchema.parse(account);
    if (this.byId.has(validated.id)) {
      throw new Error(`Account with id "${validated.id}" already exists`);
    }
    if (this.byCode.has(validated.code)) {
      throw new Error(`Account with code "${validated.code}" already exists`);
    }
    this.byId.set(validated.id, validated);
    this.byCode.set(validated.code, validated);
    return validated;
  }

  get(id: string): Account | null {
    return this.byId.get(id) ?? null;
  }

  getByCode(code: string): Account | null {
    return this.byCode.get(code) ?? null;
  }

  list(): Account[] {
    return [...this.byId.values()];
  }

  count(): number {
    return this.byId.size;
  }
}
