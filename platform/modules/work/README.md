# Work module

`@bpmn-lean/platform-work` owns Product 2 human-work registration, discovery, detail, claim, release, completion, and self-audit behavior. It observes engine-published tasks through private locators. Local mode retains no task rows, while shared mode stores only immutable-generation current-image projections; neither mode treats task rows or host history as semantic truth.

## What you can do

Register confirmed Process instances, assemble the current actor-visible task inbox, inspect legacy or exact-catalog-bound structured detail, claim or release work, validate and submit retry-safe completion, and read the actor's audit trail. Structured forms support Text, Boolean, Integer, Date, Single choice, Multiple choice, multiple resolution actions, and action-dependent input without moving form semantics into Product 1.

Local mode uses the exact SQLite schema. Shared mode uses the caller-owned PostgreSQL runtime and checksum-bound migrations in `migrations/`; its Work state changes and audit-source outbox append commit atomically. Bounded recovery creates immutable population generations behind lease-fenced callbacks, and successful inbox reads prove complete, current, age-bounded coverage in one PostgreSQL statement before joining live claims. Explicit PostgreSQL tests remain outside the ordinary database-free package loop.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-work test

# Explicit shared-mode witness with BPMN_TEST_POSTGRES_URL set
./scripts/pnpm.sh --filter @bpmn-lean/platform-work test:postgresql
```

## Learn more

- [Human-work specification](../../../docs/BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns lifecycle, authorization, retry, and audit behavior.
- [Structured Human Work specification](../../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns catalog joining, Zod-backed validation, canonical patch computation, and bounded structured form behavior.
- [BPM platform browser walkthrough](../../../docs/BPM-PLATFORM-BROWSER-WALKTHROUGH.md) follows the maintained Work and Operations journeys through the public UI.
- [Architecture](../../../docs/ARCHITECTURE.md#business-modules) owns the module boundary and persistence direction.
- [BPM platform implementation map](../../../docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md) records current Work capability and evidence.
