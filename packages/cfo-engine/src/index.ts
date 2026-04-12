// ── @back-to-the-future/cfo-engine ──────────────────────────────────
// Public surface for the double-entry ledger scaffold.

export {
  MoneySchema,
  add,
  assertSameCurrency,
  formatMoney,
  isPositive,
  isZero,
  money,
  negate,
  subtract,
  sum,
  type Money,
} from "./money";

export {
  AccountSchema,
  AccountTypeSchema,
  NORMAL_BALANCE,
  PostedTransactionSchema,
  SplitSchema,
  SplitSideSchema,
  TransactionInputSchema,
  isAccountType,
  isPostedTransaction,
  type Account,
  type AccountType,
  type PostedTransaction,
  type Split,
  type SplitSide,
  type TransactionInput,
  type TrialBalance,
  type TrialBalanceRow,
} from "./types";

export { InMemoryAccountStore, type AccountStore } from "./chart-of-accounts";

export { Ledger, type LedgerOptions, type PostContext } from "./ledger";
