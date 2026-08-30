# BPMN source ingestion

`@bpmn-lean/bpmn-source` turns untrusted BPMN XML into the project-owned checked graph and immutable Semantic Process program consumed by the [TypeScript semantic core](../semantic-core/README.md). It preserves exact source identity, validates bounded input, normalizes diagnostics, and keeps raw parser objects private.

## What you can do

Compile exact BPMN bytes under an explicit semantic profile and handle either an admitted program or a deterministic list of located admission diagnostics.

```ts
const compilation = await compileBpmnToSemanticProcess({
  bytes,
  sourceId: scenario.bpmn.id,
  expectedSha256: scenario.bpmn.sha256,
  semanticProfile: scenario.profile,
  sourceOverlay: null,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
});
```

The package also exposes an optional pinned MIWG observation lane for source-interchange research. External MIWG files remain outside the repository.

## Quick start

Run the focused compiler gate:

```sh
./scripts/pnpm.sh run test:bpmn-source
```

## Learn more

- [BPMN XML ingestion decision](../../docs/BPMN-XML-INGESTION-DECISION.md) owns the trust, parser, and source-preservation boundary.
- [Semantic Process IL specification](../../docs/SEMANTIC-PROCESS-IL-SPEC.md) owns the checked graph and lowering contracts.
- [Profile-parameterized admission specification](../../docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) owns profile capability and admission behavior.
- [Parallel User Task metadata composition specification](../../docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) owns the exact closure-reviewed two-task source restriction.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the M6 candidate-group projection and execution-neutral Rendering preservation boundary.
- [Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) owns the exact registered source, checked graph, lowering, and runtime contract.
- [Message payload catch mediation capsule](../../docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-PROPOSAL.md) owns the exact Event DataOutput source chain, checked node, and lowered IL boundary.
- [`implementation-status-owner:ENGINE-CONTRACTS-SOURCE`](../../docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md) records the exact accepted and rejected surface.
- [Executable model corpus](../../model-corpus/README.md) exercises this production compiler against retained and external whole models.

Run the optional MIWG lane with `./scripts/pnpm.sh run test:miwg` after provisioning the registered research checkout.
