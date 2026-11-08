# Differential comparator

`@bpmn-lean/differential` compares already-canonical scenario results without accessing engines, Temporal, files, or databases. It performs exact structural comparison and contains no target-specific semantic repair.

## What you can do

Declare one reference result and one or more candidates, then receive either equality or the first typed disagreement in outcome, trace length, observation kind, or observation value. Each pipeline case explicitly selects its targets and reference authority.

The [registered structured-composition cases](test/structured-composition-pipeline-cases.ts) bind three retained invoice routes and serial String/null handoff to Lean/core/Temporal. [Registration controls](test/structured-composition-pipeline-cases.test.ts) check public admission, exact associated writes, branch exclusivity, copied input and an input-loss discriminator; no CIB data/branch target is selected.

The [registered portable-handoff cases](test/portable-handoff-pipeline-cases.ts) bind a 12-node nested order, a revision with ordered unequal items and a negative Decimal, and a present-Null control to Lean/core/Temporal. [Registration controls](test/portable-handoff-pipeline-cases.test.ts) check public admission, the amendment's seeded mutation classes and the handoff rows of the scenario-domain matrix.

The [registered effect-data cases](test/effect-data-pipeline-cases.ts) bind a structured credit assessment and a present-Null control to Lean/core/Temporal. [Registration controls](test/effect-data-pipeline-cases.test.ts) check public admission, both seeded mutations and the profile's rows of the scenario-domain matrix.

The [registered Message-payload cases](test/portable-message-payload-pipeline-cases.ts) bind a structured shipment manifest and a refused payload-free delivery followed by the same manifest to Lean/core/Temporal. [Registration controls](test/portable-message-payload-pipeline-cases.test.ts) check public admission, both seeded mutations and the profile's rows of the scenario-domain matrix.

The independent [scenario-domain matrix](test/scenario-value-domain-cases.ts) assigns structured composition's existing String/null Human completion domain; Lean/core controls distinguish unsupported late values from supported-domain command refusal.

The [scalar Call cases](test/call-data-pipeline-cases.ts) bind supplier String/null schedules to Lean, core and Temporal targets, with an exact called-owner mutation. [Registration controls](test/call-data-pipeline-cases.test.ts) check public admission, normal return and malformed-Program refusal.

## Quick start

Run the pure comparator gate:

```sh
./scripts/pnpm.sh run test:differential
```

That gate also compiles every registered single-instance pipeline program and checks runtime-state well-formedness and monotonicity after every replayed committed transition. Rejected commands must preserve the exact received state and emit no committed transition.

The [kernel behavior oracle](test/kernel-behavior-oracle.integration-test.ts) runs every scenario and population scenario discovered under `scenarios/` and `test/fixtures/` through Lean `kernelRun` and the TypeScript kernel and compares the whole results. It runs in `./scripts/verify.sh pipeline` and at the end of `./scripts/pnpm.sh run test:differential`.

Message key correlation uses a separate engine-population catalog because one answer-free publication observes two Process instances and may span two immutable definitions. Its focused catalog gate compiles every declared definition and runs the pure semantic-core population evaluator without widening the ordinary single-instance pipeline contract.

## Learn more


- [Case loading](test/pipeline-case-loading.ts) compiles neutral scenarios independently of Lean execution; runtime-only catalog tests use this owner. A scenario declaring a source overlay requires `sourceOverlayRelativePath` in its case; overlay-free scenarios omit it. The compiler checks exact overlay identity/content, and the compilation cache includes the selected path and identity. [Loading discriminators](test/pipeline-case-loading.test.ts) reject missing selections, unclaimed overlays, digest substitution and cache aliasing.

- The overlay-loader repair is non-material: it changes no semantic/profile/public admission or Temporal refinement claim. `/tmp/business-overlay-loader-second-red` reproduces both required-overlay rejection and silently ignored identity; `/tmp/business-overlay-loader-green-corrected` passes the six loading discriminators. Both cache-key omissions are independently killed in `/tmp/business-overlay-cache-mutations`, with source restored exactly. All receipts were separately asserted. The first alternate fixture incorrectly renamed an operation contrary to the existing named-binding contract; the corrected discriminator adds a valid unused binding. Complete differential verification passes 173 checks (`/tmp/business-overlay-complete-differential`); infrastructure and strict harness types pass 630 (`/tmp/business-overlay-complete-infrastructure-corrected`), separately asserted. Public business-task registration remains open.
- [Registered Compensation scenarios](test/compensation-pipeline-cases.ts) bind the [travel-cancellation model](../../scenarios/compensation/README.md) to exact Lean/core/Temporal results and replay. [Mutations](test/compensation-pipeline-cases.test.ts) distinguish premature predecessors, missing concurrent handlers, altered restored input, failed-to-completed projection and stale-result mutation. The private 36-case publication comparison remains a separate lane.
- [Testing specification](../../docs/TESTING-SPEC.md) owns the complete pipeline, target isolation, and evidence rules.
- [Pipeline case identifier registry](test/pipeline-case-id-registry.ts) owns the exact ordered identifier contract checked before target execution.
- [Runtime-state preservation lane](test/runtime-state-preservation.test.ts) derives its programs and schedules from that registered catalog; it is finite executable evidence, not the open general Lean preservation theorem.
- [Registered subscription scenarios](test/repeatable-subscriptions-pipeline-cases.ts) exercise the [retained application-review models](../../scenarios/repeatable-event-subscriptions/README.md) through the complete Lean/core/Temporal pipeline with exact stimulus order and replay. [Catalog mutations](test/repeatable-subscriptions-pipeline-cases.test.ts) discriminate handler multiplicity, fresh Timer identity, retained Message lifetime and subscription withdrawal; CIB subscription comparison is not selected.
- [Private serial classification inputs](test/fixtures/serial-classification.scenario.json) bind the exact retained BPMN and [handler overlay](test/fixtures/serial-classification.overlay.json) without expected results, and the kernel behavior oracle discovers them.
- [Business composition pipeline cases](test/business-task-composition-pipeline-cases.ts) bind representative classification, rework and business Error inputs and their separate metadata-bearing public-delivery schedules to exact source/overlay bytes and the existing ordered Temporal driver. [Case checks](test/business-task-composition-pipeline-cases.test.ts) verify browser-matching string submissions, caller-selected real handlers, terminal semantic execution, canonical effect commands and discriminators for a substituted task, reused occurrence, bypassed Error recovery and omitted metadata. The [public-delivery proposal](../../docs/BUSINESS-PROCESS-PUBLIC-DELIVERY-PROPOSAL.md) owns the qualified-source bindings and public closure; registered neutral inputs do not establish that acceptance.
- [Composed Activity-data cases](test/activity-data-input-output-pipeline-cases.ts) bind present, null, absent-input, and omitted-output schedules to exact Lean/core/Temporal comparison and independent routing, input, and refusal mutations.
- [`implementation-status-owner:ASSURANCE-ADOPTION`](../../docs/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) records the exact current target matrix and evidence boundary.
- [Shared wire contracts](../../contracts/README.md) owns the canonical result shape.
- [Parallel User Task metadata composition specification](../../docs/capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) owns the two closure-reviewed composed schedules and their selected mutations.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the three normative M6 schedules and their value-kind, ordered-list, and resolution mutations.
- [Sequential Multi-Instance specification](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) owns the registered natural and interrupted Lean/core/Temporal relations.
- [Message payload catch specification](../../docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md) owns the supplied-scalar, supplied-null, and absent-payload Lean/core/Temporal relations.

Retaining business Error inputs is non-material: it changes no semantic, profile, admission or hosting claim. The five-schedule Lean/core witness passes `/tmp/retained-business-error-bounded-path` using the existing Docker interpreter with one CPU, 3 GiB and no additional swap. Complete differential verification passes 173 checks (`/tmp/retained-business-error-differential`); infrastructure guards and strict harness types pass 630 (`/tmp/retained-business-error-infrastructure`). All receipts were separately asserted. The additional Error-to-success mutation hit the unchanged interpreter deadline (`/tmp/retained-business-error-route-mutation`); it is inconclusive, was not retried, and the fixture was restored byte-for-byte. Existing malformed-command and route-swap discriminators remain green in the passing witness.

Run `./scripts/pnpm.sh run test:pipeline` when a change affects the complete registered cross-target pipeline.
