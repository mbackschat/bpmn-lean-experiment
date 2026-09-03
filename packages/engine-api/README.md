# Engine API

`@bpmn-lean/engine-api` is Product 1's narrow entry point for Product 2. It exposes compilation, start preparation and recovery, committed observation, scheduling, Message Start, human-work commands, and incident operations without exposing Semantic Process programs or Temporal SDK identities. Accepted compilation projects complete target-free correlated Message capabilities from the immutable program, and the independently approved definition-scoped publication operation retains semantic, capacity, and infrastructure outcomes without exposing candidate or host identity.

## What you can do

Use the approved API from the Product 2 engine gateway to compile exact source, start an exact deployed definition, observe published engine facts, and submit content-bound commands. Process-local commands use opaque Process locators. Definition-scoped correlation accepts only an engine-projected complete semantic definition address, a caller-owned command identity, and payload; callers never supply a candidate locator or target and receive no Workflow handle, Run ID, Event History, or private semantic anchor. Product 2 binding remains pending.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/engine-api test
```

## Learn more

- [Architecture](../../docs/ARCHITECTURE.md#product-2-dependency-direction) owns the cross-product dependency boundary.
- [Production lifecycle specification](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns durable start, command, and recovery behavior.
- [Committed-execution publication specification](../../docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) owns the published execution contract.
- [Message key-correlation proposal](../../docs/capsules/MESSAGE-KEY-CORRELATION-PROPOSAL.md) owns the complete address, exact-cardinality result, retry, capacity, and target-exposure contract.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the M6 completion-value boundary; this package derives that payload from the shared semantic contract and detaches caller storage without defining a second value union.
- The [`implementation-status-owner:ENGINE-CONTRACTS-SOURCE`](../../docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md) records exact operations; the [`implementation-status-owner:TEMPORAL-HOSTING`](../../docs/TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) records their hosting evidence.
