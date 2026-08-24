# Differential comparator

`@bpmn-lean/differential` compares already-canonical scenario results without accessing engines, Temporal, files, or databases. It performs exact structural comparison and contains no target-specific semantic repair.

## What you can do

Declare one reference result and one or more candidates, then receive either equality or the first typed disagreement in outcome, trace length, observation kind, or observation value. Each pipeline case explicitly selects its targets and reference authority.

## Quick start

Run the pure comparator gate:

```sh
./scripts/pnpm.sh run test:differential
```

## Learn more

- [Testing specification](../../docs/TESTING-SPEC.md) owns the complete pipeline, target isolation, and evidence rules.
- [`implementation-status-owner:ASSURANCE-ADOPTION`](../../docs/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) records the exact current target matrix and evidence boundary.
- [Shared wire contracts](../../contracts/README.md) owns the canonical result shape.
- [Parallel User Task metadata composition specification](../../docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) owns the two closure-reviewed composed schedules and their selected mutations.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the three normative M6 schedules and their value-kind, ordered-list, and resolution mutations.
- [Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) owns the registered natural and interrupted Lean/core/Temporal relations.

Run `./scripts/pnpm.sh run test:pipeline` when a change affects the complete registered cross-target pipeline.
