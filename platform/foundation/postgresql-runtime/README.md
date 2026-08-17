# PostgreSQL runtime

`@bpmn-lean/platform-postgresql-runtime` owns Product 2's bounded PostgreSQL pools, transaction and dedicated-session mechanics, and checksum-bound migration runner. Business schemas, migrations, queries, repository behavior, and projection semantics remain in their owning modules.

The default package test command uses deterministic in-process contract tests and does not require a PostgreSQL server. Real PostgreSQL 18 integration and multi-process evidence run through the explicit PostgreSQL gate.

Every pool bound and timeout is explicit. Transactions use PostgreSQL `READ COMMITTED`, release their checked-out session in all outcomes, and keep the database clock as the lease-time authority. The public query contract exposes project-owned rows and results rather than `pg` types.

Migration directories contain only forward SQL files named `NNNN_description__<lowercase-sha256>.sql`. The separate `@bpmn-lean/platform-postgresql-runtime/migrations` entry point verifies exact bytes and contiguous order before connecting, then acquires the fixed project advisory lock, verifies the database's complete applied-name prefix, and lets `node-pg-migrate` execute and record one migration per transaction. API and recovery-worker processes do not import or invoke this command.

Use `pnpm test:platform-postgresql:runtime:local` from the repository root for the focused PostgreSQL 18 runtime check. Use `pnpm test:platform-postgresql:local` for the complete shared-mode boundary: it builds the union graph once, type-checks the source-mapped PostgreSQL harness, and runs each reuse-only package suite in its own temporary database inside one disposable cluster. Ordinary package and platform-foundation tests do not start or connect to PostgreSQL.
