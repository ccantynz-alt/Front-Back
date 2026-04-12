// ── @back-to-the-future/cfo-engine tests ────────────────────────────
// Exercises money arithmetic, account store, ledger post/verify,
// trial balance invariants, and audit-log integration.

import { describe, expect, test, beforeEach } from "bun:test";

import { AuditLog, InMemoryWormStorage, NullTsa } from "@crontech/audit-log";

import {
  InMemoryAccountStore,
  Ledger,
  NORMAL_BALANCE,
  add,
  formatMoney,
  isAccountType,
  isPositive,
  isZero,
  money,
  negate,
  subtract,
  sum,
  type Account,
  type TransactionInput,
} from "./index";

// ── Fixtures ────────────────────────────────────────────────────────

function seedChart(): InMemoryAccountStore {
  const store = new InMemoryAccountStore();
  const accounts: Account[] = [
    {
      id: "acct_cash",
      code: "1000",
      name: "Cash",
      type: "asset",
      currency: "NZD",
      parentId: null,
      active: true,
    },
    {
      id: "acct_ar",
      code: "1100",
      name: "Accounts Receivable",
      type: "asset",
      currency: "NZD",
      parentId: null,
      active: true,
    },
    {
      id: "acct_ap",
      code: "2000",
      name: "Accounts Payable",
      type: "liability",
      currency: "NZD",
      parentId: null,
      active: true,
    },
    {
      id: "acct_rev",
      code: "4000",
      name: "Sales Revenue",
      type: "revenue",
      currency: "NZD",
      parentId: null,
      active: true,
    },
    {
      id: "acct_exp",
      code: "5000",
      name: "Office Expenses",
      type: "expense",
      currency: "NZD",
      parentId: null,
      active: true,
    },
    {
      id: "acct_eur_cash",
      code: "1001",
      name: "EUR Cash",
      type: "asset",
      currency: "EUR",
      parentId: null,
      active: true,
    },
  ];
  for (const account of accounts) {
    store.add(account);
  }
  return store;
}

function makeLedger(): { ledger: Ledger; audit: AuditLog; store: InMemoryAccountStore } {
  const store = seedChart();
  const audit = new AuditLog({
    storage: new InMemoryWormStorage(),
    tsa: new NullTsa(),
  });
  const ledger = new Ledger({
    accounts: store,
    auditLog: audit,
    now: () => new Date("2026-04-10T00:00:00.000Z"),
    idGenerator: (() => {
      let n = 0;
      return () => `tx_${(n++).toString().padStart(4, "0")}`;
    })(),
  });
  return { ledger, audit, store };
}

const ADA = {
  id: "user_ada",
  displayName: "Ada Lovelace",
  role: "bookkeeper",
  ip: "127.0.0.1",
  userAgent: "test",
  sessionId: "sess_1",
};

function sale(amountNzd: number): TransactionInput {
  return {
    date: "2026-04-10T00:00:00.000Z",
    description: `Sale of ${amountNzd} NZD of consulting`,
    reference: "INV-0001",
    splits: [
      { accountId: "acct_cash", side: "debit", amount: money(amountNzd, "NZD"), memo: null },
      { accountId: "acct_rev", side: "credit", amount: money(amountNzd, "NZD"), memo: null },
    ],
    metadata: {},
  };
}

// ── Money ───────────────────────────────────────────────────────────

describe("money helpers", () => {
  test("add/subtract/negate", () => {
    const a = money(100, "NZD");
    const b = money(40, "NZD");
    expect(add(a, b).amount).toBe(140n);
    expect(subtract(a, b).amount).toBe(60n);
    expect(negate(a).amount).toBe(-100n);
  });

  test("sum enforces single currency", () => {
    expect(sum([money(1, "NZD"), money(2, "NZD"), money(3, "NZD")], "NZD").amount).toBe(
      6n,
    );
    expect(() => sum([money(1, "NZD"), money(2, "USD")], "NZD")).toThrow();
  });

  test("isZero / isPositive", () => {
    expect(isZero(money(0, "NZD"))).toBe(true);
    expect(isPositive(money(1, "NZD"))).toBe(true);
    expect(isPositive(money(-1, "NZD"))).toBe(false);
  });

  test("assertSameCurrency throws on mismatch", () => {
    expect(() => add(money(1, "NZD"), money(1, "USD"))).toThrow(/currency mismatch/);
  });

  test("formatMoney handles negatives + major.minor split", () => {
    expect(formatMoney(money(12345, "NZD"))).toBe("123.45 NZD");
    expect(formatMoney(money(-100, "NZD"))).toBe("-1.00 NZD");
    expect(formatMoney(money(0, "NZD"))).toBe("0.00 NZD");
  });

  test("currency schema rejects non-ISO-4217", () => {
    expect(() => money(1, "nzd")).toThrow();
    expect(() => money(1, "NZDX")).toThrow();
  });
});

// ── AccountType guard ──────────────────────────────────────────────

describe("isAccountType", () => {
  test("accepts the five standard types", () => {
    for (const t of ["asset", "liability", "equity", "revenue", "expense"]) {
      expect(isAccountType(t)).toBe(true);
    }
  });

  test("rejects unknown", () => {
    expect(isAccountType("Asset")).toBe(false);
    expect(isAccountType("income")).toBe(false);
    expect(isAccountType(42)).toBe(false);
  });

  test("NORMAL_BALANCE is exhaustive", () => {
    expect(NORMAL_BALANCE.asset).toBe("debit");
    expect(NORMAL_BALANCE.expense).toBe("debit");
    expect(NORMAL_BALANCE.liability).toBe("credit");
    expect(NORMAL_BALANCE.equity).toBe("credit");
    expect(NORMAL_BALANCE.revenue).toBe("credit");
  });
});

// ── InMemoryAccountStore ───────────────────────────────────────────

describe("InMemoryAccountStore", () => {
  test("add + get + getByCode", () => {
    const store = seedChart();
    expect(store.count()).toBe(6);
    expect(store.get("acct_cash")?.name).toBe("Cash");
    expect(store.getByCode("1000")?.id).toBe("acct_cash");
    expect(store.get("nope")).toBeNull();
  });

  test("rejects duplicate id", () => {
    const store = new InMemoryAccountStore();
    store.add({
      id: "x",
      code: "1",
      name: "x",
      type: "asset",
      currency: "NZD",
      parentId: null,
      active: true,
    });
    expect(() =>
      store.add({
        id: "x",
        code: "2",
        name: "y",
        type: "asset",
        currency: "NZD",
        parentId: null,
        active: true,
      }),
    ).toThrow(/already exists/);
  });

  test("rejects duplicate code", () => {
    const store = new InMemoryAccountStore();
    store.add({
      id: "a",
      code: "1",
      name: "x",
      type: "asset",
      currency: "NZD",
      parentId: null,
      active: true,
    });
    expect(() =>
      store.add({
        id: "b",
        code: "1",
        name: "y",
        type: "asset",
        currency: "NZD",
        parentId: null,
        active: true,
      }),
    ).toThrow(/code "1" already exists/);
  });
});

// ── Ledger: post + validation ──────────────────────────────────────

describe("Ledger.post", () => {
  let fixture: ReturnType<typeof makeLedger>;

  beforeEach(() => {
    fixture = makeLedger();
  });

  test("posts a balanced transaction and returns a PostedTransaction", async () => {
    const posted = await fixture.ledger.post(sale(10_000), { actor: ADA });
    expect(posted.id).toBe("tx_0000");
    expect(posted.sequence).toBe(0);
    expect(posted.postedBy).toBe("user_ada");
    expect(posted.splits).toHaveLength(2);
    expect(posted.auditEntryId).not.toBeNull();
  });

  test("rejects an unbalanced transaction", async () => {
    const bad: TransactionInput = {
      date: "2026-04-10T00:00:00.000Z",
      description: "bad",
      reference: null,
      splits: [
        { accountId: "acct_cash", side: "debit", amount: money(100, "NZD"), memo: null },
        { accountId: "acct_rev", side: "credit", amount: money(50, "NZD"), memo: null },
      ],
      metadata: {},
    };
    await expect(fixture.ledger.post(bad, { actor: ADA })).rejects.toThrow(
      /unbalanced/,
    );
  });

  test("rejects a split referencing an unknown account", async () => {
    const bad: TransactionInput = {
      date: "2026-04-10T00:00:00.000Z",
      description: "bad",
      reference: null,
      splits: [
        { accountId: "acct_ghost", side: "debit", amount: money(1, "NZD"), memo: null },
        { accountId: "acct_rev", side: "credit", amount: money(1, "NZD"), memo: null },
      ],
      metadata: {},
    };
    await expect(fixture.ledger.post(bad, { actor: ADA })).rejects.toThrow(
      /unknown account/,
    );
  });

  test("rejects a multi-currency transaction", async () => {
    const bad: TransactionInput = {
      date: "2026-04-10T00:00:00.000Z",
      description: "bad",
      reference: null,
      splits: [
        { accountId: "acct_cash", side: "debit", amount: money(1, "NZD"), memo: null },
        { accountId: "acct_eur_cash", side: "credit", amount: money(1, "EUR"), memo: null },
      ],
      metadata: {},
    };
    await expect(fixture.ledger.post(bad, { actor: ADA })).rejects.toThrow(
      /multi-currency/,
    );
  });

  test("rejects zero or negative split amounts", async () => {
    const bad: TransactionInput = {
      date: "2026-04-10T00:00:00.000Z",
      description: "bad",
      reference: null,
      splits: [
        { accountId: "acct_cash", side: "debit", amount: money(0, "NZD"), memo: null },
        { accountId: "acct_rev", side: "credit", amount: money(0, "NZD"), memo: null },
      ],
      metadata: {},
    };
    await expect(fixture.ledger.post(bad, { actor: ADA })).rejects.toThrow(
      /strictly positive/,
    );
  });

  test("rejects a transaction with fewer than two splits", async () => {
    const bad: TransactionInput = {
      date: "2026-04-10T00:00:00.000Z",
      description: "bad",
      reference: null,
      splits: [
        { accountId: "acct_cash", side: "debit", amount: money(1, "NZD"), memo: null },
      ],
      metadata: {},
    };
    await expect(fixture.ledger.post(bad, { actor: ADA })).rejects.toThrow();
  });

  test("persists monotonic sequence numbers", async () => {
    const a = await fixture.ledger.post(sale(100), { actor: ADA });
    const b = await fixture.ledger.post(sale(200), { actor: ADA });
    const c = await fixture.ledger.post(sale(300), { actor: ADA });
    expect([a.sequence, b.sequence, c.sequence]).toEqual([0, 1, 2]);
    expect(fixture.ledger.listTransactions()).toHaveLength(3);
  });
});

// ── Audit log integration ──────────────────────────────────────────

describe("Ledger → AuditLog integration", () => {
  test("every post writes a tamper-evident audit entry", async () => {
    const { ledger, audit } = makeLedger();
    const tx = await ledger.post(sale(50_000), { actor: ADA });

    const entries = await audit.entries();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry).toBeDefined();
    expect(tx.auditEntryId).not.toBeNull();
    expect(entry?.id).toBe(tx.auditEntryId as string);
    expect(entry?.action).toBe("CREATE");
    expect(entry?.resource.type).toBe("ledger_transaction");
    expect(entry?.resource.id).toBe(tx.id);
  });

  test("audit chain stays verifiable after multiple posts", async () => {
    const { ledger, audit } = makeLedger();
    for (let i = 0; i < 5; i++) {
      await ledger.post(sale(1_000 + i), { actor: ADA });
    }
    const verified = await audit.verify();
    expect(verified.ok).toBe(true);
    expect(verified.checked).toBe(5);
  });
});

// ── Balances + trial balance ───────────────────────────────────────

describe("Ledger.balanceOf + trialBalance", () => {
  test("balanceOf reflects posted activity on the normal side", async () => {
    const { ledger } = makeLedger();
    await ledger.post(sale(10_000), { actor: ADA });
    await ledger.post(sale(5_000), { actor: ADA });
    expect(ledger.balanceOf("acct_cash")).toBe(15_000n);
    expect(ledger.balanceOf("acct_rev")).toBe(15_000n);
    expect(ledger.balanceOf("acct_ap")).toBe(0n);
  });

  test("trialBalance is balanced when the ledger is internally consistent", async () => {
    const { ledger } = makeLedger();
    await ledger.post(sale(10_000), { actor: ADA });
    await ledger.post(sale(7_500), { actor: ADA });
    await ledger.post(
      {
        date: "2026-04-10T00:00:00.000Z",
        description: "Office supplies",
        reference: null,
        splits: [
          { accountId: "acct_exp", side: "debit", amount: money(2_000, "NZD"), memo: null },
          { accountId: "acct_cash", side: "credit", amount: money(2_000, "NZD"), memo: null },
        ],
        metadata: {},
      },
      { actor: ADA },
    );
    const tb = ledger.trialBalance("NZD");
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebits).toBe(tb.totalCredits);
    const cashRow = tb.rows.find((r) => r.accountId === "acct_cash");
    expect(cashRow?.balance).toBe(15_500n);
    const expRow = tb.rows.find((r) => r.accountId === "acct_exp");
    expect(expRow?.balance).toBe(2_000n);
  });

  test("trialBalance filters by currency", async () => {
    const { ledger } = makeLedger();
    await ledger.post(sale(1_000), { actor: ADA });
    const nzdTb = ledger.trialBalance("NZD");
    const eurTb = ledger.trialBalance("EUR");
    expect(nzdTb.rows.length).toBeGreaterThan(0);
    expect(eurTb.rows.every((r) => r.currency === "EUR")).toBe(true);
  });

  test("balanceOf throws on unknown account", () => {
    const { ledger } = makeLedger();
    expect(() => ledger.balanceOf("nope")).toThrow(/unknown account/);
  });
});
