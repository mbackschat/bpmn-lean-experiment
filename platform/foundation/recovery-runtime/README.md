# Recovery runtime

`@bpmn-lean/platform-recovery-runtime` owns generic Product 2 PostgreSQL lease mechanics and the bounded process-local loop that drives one caller-owned recovery family. It owns no domain candidate discovery, payload, table, gateway, public HTTP fact, or application lifecycle.

Claims and retry eligibility use the PostgreSQL database clock. Claim transactions commit before handlers run. A handler may use its lease-bound `applyWhileOwned` context method to commit a database-only pre-dispatch transition while retaining the exact lease unchanged, perform external work after that transaction closes, and return a completion callback for the separately fenced final transition and lease deletion. A stale token invokes neither callback. Handler deadlines bound what the loop awaits and may signal cooperative cancellation to the handler; they do not promise cancellation of PostgreSQL work or an already dispatched external operation.

The continuous polling API requires an observer and reports every bounded run before sleeping or starting another batch. Observer failures propagate to the application supervisor so permanent failures, lease loss, and infrastructure errors cannot disappear inside a silent loop.

The default package test is database-free. Run the explicit PostgreSQL 18 witness through the repository wrapper:

```sh
./scripts/with-postgresql-18.sh ./scripts/pnpm.sh --filter @bpmn-lean/platform-recovery-runtime test:postgresql
```

The caller owns PostgreSQL runtime lifecycle and application polling lifecycle.
