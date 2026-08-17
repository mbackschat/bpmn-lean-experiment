# Recovery runtime

`@bpmn-lean/platform-recovery-runtime` owns generic Product 2 PostgreSQL lease mechanics and the bounded process-local loop that drives one caller-owned recovery family. It owns no domain candidate discovery, payload, table, gateway, public HTTP fact, or application lifecycle.

Claims and retry eligibility use the PostgreSQL database clock. Claim transactions commit before handlers run. Completion accepts only a database callback and applies it in the same transaction that removes the current lease. Handler deadlines bound what the loop awaits and may signal cooperative cancellation to the handler; they do not promise cancellation of PostgreSQL work or an already dispatched external operation.

The default package test is database-free. Run the explicit PostgreSQL 18 witness through the repository wrapper:

```sh
./scripts/with-postgresql-18.sh ./scripts/pnpm.sh --filter @bpmn-lean/platform-recovery-runtime test:postgresql
```

The caller owns PostgreSQL runtime lifecycle and application polling lifecycle.
