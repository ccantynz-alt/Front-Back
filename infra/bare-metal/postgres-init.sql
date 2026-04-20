-- Crontech — Postgres 16 bootstrap
--
-- Executed once by scripts/bare-metal-setup.sh via `psql -v ON_ERROR_STOP=1`
-- after initdb completes. Idempotent: every CREATE is guarded so re-runs
-- are safe. The passwords come from env vars the setup script exports
-- as psql `\set` variables before calling this file:
--
--   POSTGRES_CRONTECH_PASSWORD  -> crontech app user password
--   POSTGRES_GLUECRON_PASSWORD  -> gluecron app user password
--
-- psql invocation:
--   psql -v ON_ERROR_STOP=1 \
--        -v crontech_password="'$POSTGRES_CRONTECH_PASSWORD'" \
--        -v gluecron_password="'$POSTGRES_GLUECRON_PASSWORD'" \
--        -f infra/bare-metal/postgres-init.sql
--
-- SCRAM-SHA-256 hashing is enforced globally in postgresql.conf
-- (password_encryption = scram-sha-256) so these CREATE ROLE statements
-- automatically store a hashed password, never plaintext.

\set ON_ERROR_STOP on

-- ── Users ─────────────────────────────────────────────────────────────
-- psql variable substitution (`:'var'`) does NOT penetrate dollar-quoted
-- PL/pgSQL DO blocks, so we use \gexec to generate the CREATE/ALTER ROLE
-- statements at psql-client level where :'var' expands correctly.

SELECT format('CREATE ROLE crontech LOGIN PASSWORD %L', :'crontech_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crontech')
\gexec

SELECT format('ALTER ROLE crontech WITH LOGIN PASSWORD %L', :'crontech_password')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crontech')
\gexec

SELECT format('CREATE ROLE gluecron LOGIN PASSWORD %L', :'gluecron_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gluecron')
\gexec

SELECT format('ALTER ROLE gluecron WITH LOGIN PASSWORD %L', :'gluecron_password')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gluecron')
\gexec

-- ── Databases ─────────────────────────────────────────────────────────
-- CREATE DATABASE cannot run inside a DO block, so we gate with \gexec.

SELECT 'CREATE DATABASE crontech OWNER crontech ENCODING ''UTF8'' LC_COLLATE ''C.UTF-8'' LC_CTYPE ''C.UTF-8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'crontech')
\gexec

SELECT 'CREATE DATABASE gluecron OWNER gluecron ENCODING ''UTF8'' LC_COLLATE ''C.UTF-8'' LC_CTYPE ''C.UTF-8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'gluecron')
\gexec

-- ── Grants ────────────────────────────────────────────────────────────

GRANT ALL PRIVILEGES ON DATABASE crontech TO crontech;
GRANT ALL PRIVILEGES ON DATABASE gluecron TO gluecron;

-- Extensions that both apps rely on (pgvector for embeddings, pgcrypto
-- for uuid/hash helpers). Install into each DB as the owner so app
-- migrations don't need superuser.

\connect crontech
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

\connect gluecron
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
