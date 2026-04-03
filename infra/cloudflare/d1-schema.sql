-- ============================================================================
-- Cronix D1 Schema (SQLite)
-- Mirrors the Turso/Drizzle schema in packages/db/src/schema.ts
-- Apply with: bunx wrangler d1 execute cronix-db --file=infra/cloudflare/d1-schema.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  role                  TEXT NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('admin', 'editor', 'viewer')),
  passkey_credential_id TEXT,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS credentials (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key    BLOB NOT NULL,
  counter       INTEGER NOT NULL DEFAULT 0,
  device_type   TEXT NOT NULL
                  CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up     INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_credential_id ON credentials(credential_id);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id      TEXT NOT NULL,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_price_id         TEXT,
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN (
                              'active', 'canceled', 'past_due', 'trialing',
                              'incomplete', 'incomplete_expired', 'unpaid', 'paused'
                            )),
  plan                    TEXT NOT NULL DEFAULT 'free'
                            CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
  current_period_start    INTEGER,
  current_period_end      INTEGER,
  cancel_at_period_end    INTEGER NOT NULL DEFAULT 0,
  created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at              INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);

CREATE TABLE IF NOT EXISTS usage_records (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL
                          CHECK (type IN ('ai_tokens', 'video_minutes', 'storage_bytes')),
  quantity              INTEGER NOT NULL,
  stripe_usage_record_id TEXT,
  recorded_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_type ON usage_records(type);

CREATE TABLE IF NOT EXISTS payment_events (
  id              TEXT PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL,
  data            TEXT NOT NULL,
  processed_at    INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_payment_events_stripe_event_id ON payment_events(stripe_event_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             TEXT PRIMARY KEY,
  timestamp      TEXT NOT NULL,
  actor_id       TEXT NOT NULL,
  actor_ip       TEXT,
  actor_device   TEXT,
  action         TEXT NOT NULL
                   CHECK (action IN ('CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'SIGN')),
  resource_type  TEXT NOT NULL,
  resource_id    TEXT NOT NULL,
  detail         TEXT,
  result         TEXT NOT NULL CHECK (result IN ('success', 'failure')),
  session_id     TEXT,
  previous_hash  TEXT,
  entry_hash     TEXT NOT NULL,
  signature      TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
