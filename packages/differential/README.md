# Differential comparator

`@bpmn-lean/differential` compares already-canonical scenario results without accessing engines, Temporal, files, or databases. It performs exact structural comparison and contains no target-specific semantic repair.

## What you can do

Declare one reference result and one or more candidates, then receive either equality or the first typed disagreement in outcome, trace length, observation kind, or observation value. Each pipeline case explicitly selects its targets and reference authority.

## Quick start

Run the pure comparator gate:

```sh
./scripts/pnpm.sh run test:differential
```

That gate also compiles every registered single-instance pipeline program and checks runtime-state well-formedness and monotonicity after every replayed committed transition. Rejected commands must preserve the exact received state and emit no committed transition.

The Message payload catch scenarios are registered in the full Lean/core/Temporal pipeline. Run the narrower Lean/core diagnostic when the change cannot affect hosting:

```sh
./scripts/pnpm.sh run test:message-payload-lean-core
```

Message key correlation uses a separate engine-population catalog because one answer-free publication observes two Process instances and may span two immutable definitions. Its focused catalog gate compiles every declared definition and runs the pure semantic-core population evaluator without widening the ordinary single-instance pipeline contract.

## Learn more

- [Testing specification](../../docs/TESTING-SPEC.md) owns the complete pipeline, target isolation, and evidence rules.
- [Pipeline case identifier registry](test/pipeline-case-id-registry.ts) owns the exact ordered identifier contract checked before target execution.
- [Runtime-state preservation lane](test/runtime-state-preservation.test.ts) derives its programs and schedules from that registered catalog; it is finite executable evidence, not the open general Lean preservation theorem.
- [Private scheduling parity](test/internal-choice-schedule-lean-core.integration-test.ts), run with `./scripts/pnpm.sh run test:internal-choice-schedule-lean-core`, sends identical structurally admitted Programs, stimuli, and exact choice schedules to Lean and TypeScript, comparing rollback precedence and replayed publication without registering a scheduled profile.
- [Compensation pipeline parity](test/compensation-pipeline-lean-core.integration-test.ts) runs in `./scripts/verify.sh pipeline`. With the Lean and TypeScript build outputs available, run it alone with `node --test packages/differential/test/compensation-pipeline-lean-core.integration-test.ts`. It binds the reviewed source to Lean lowering and compares complete observations, replayed transitions, control positions, and private occurrence lifecycles through success, handler failure, and stale-command rejection without registering a public capability.
- [Subscription pipeline parity](test/repeatable-subscriptions-lean-core.integration-test.ts) runs in `./scripts/verify.sh pipeline`. With built dependencies available, run `node --test packages/differential/test/repeatable-subscriptions-lean-core.integration-test.ts` for source-bound Lean/core admission, repeated triggers, completion/trigger orders, nested cleanup, and exact E1/E2 publication. Its private profile establishes neither Temporal hosting nor public capability registration.
- [Registered subscription scenarios](test/repeatable-subscriptions-pipeline-cases.ts) exercise the [retained application-review models](../../scenarios/repeatable-event-subscriptions/README.md) through the complete Lean/core/Temporal pipeline with exact stimulus order and replay. [Catalog mutations](test/repeatable-subscriptions-pipeline-cases.test.ts) discriminate handler multiplicity, fresh Timer identity, retained Message lifetime and subscription withdrawal; CIB subscription comparison is not selected.
- [Composed Activity-data cases](test/activity-data-input-output-pipeline-cases.ts) bind present, null, absent-input, and omitted-output schedules to exact Lean/core/Temporal comparison and independent routing, input, and refusal mutations.
- [`implementation-status-owner:ASSURANCE-ADOPTION`](../../docs/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) records the exact current target matrix and evidence boundary.
- [Shared wire contracts](../../contracts/README.md) owns the canonical result shape.
- [Parallel User Task metadata composition specification](../../docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) owns the two closure-reviewed composed schedules and their selected mutations.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the three normative M6 schedules and their value-kind, ordered-list, and resolution mutations.
- [Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) owns the registered natural and interrupted Lean/core/Temporal relations.
- [Message payload catch specification](../../docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md) owns the supplied-scalar, supplied-null, and absent-payload Lean/core/Temporal relations.

Run `./scripts/pnpm.sh run test:pipeline` when a change affects the complete registered cross-target pipeline.
