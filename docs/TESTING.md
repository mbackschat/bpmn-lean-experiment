# Testing

The current test estate covers the Phase 0 Lean contract vocabulary, the M0.2 CIB Seven calibration runner, the M0.3 Lean sequential User Task capsule, and the M0.4 pure TypeScript semantic core. It supplies one draft-profile behavioral calibration and two matching independent semantic accounts, but no BPMN conformance or immutable CIB compatibility claim.

## Red/green workflow

For each semantic capsule:

1. add the smallest executable example that separates the intended rule from a realistic wrong account;
2. run the focused target and confirm failure for the intended missing or incorrect behavior;
3. implement the semantic root rather than a case-specific patch;
4. rerun the focused target;
5. run the complete applicable gate;
6. update [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) with the exact semantic, proof, and external-evidence boundary.

The first scaffold capsule followed this workflow: the conformance module imported an absent contract, the red run failed on that missing semantic owner, and the green run passed only after the outcome vocabulary was implemented.

## Current verification gate

```sh
./scripts/verify.sh
git status --short
```

The verification script checks the profile and scenario JSON, profile reference, BPMN content hash, BPMN XML, locally available official XSD, Lean build, executable contract checks, the pure TypeScript semantic core, the embedded CIB Seven oracle tests, and whitespace. `lake test` elaborates the separating examples through the `checkConformance` executable; [pnpm.sh](../scripts/pnpm.sh) selects exact active nvm/asdf tools or the Homebrew fallback without changing shell configuration; [test-cibseven-oracle.sh](../scripts/test-cibseven-oracle.sh) selects Java 21 and the repository-local Maven wrapper.

The M0.1 red run imported the intentionally absent `BpmnSemantics.Scenario` module and failed. The first implementation run then exposed Lean’s requirement that imports precede module documentation; moving the import to the module beginning fixed that structural error. The green run passes with the implementation-neutral scenario, stimulus, observation, result, and runner types.

The first measured warm contract gate on 2026-07-23 completed in 1.36 seconds. At that checkpoint the TypeScript semantic core did not yet exist, so this remains a historical Lean-and-artifact baseline rather than the accepted semantic-loop measurement.

## M0.4 pure TypeScript semantic core

The focused and semantic gates are:

```sh
./scripts/pnpm.sh run test:semantic-core
./scripts/pnpm.sh run test:semantic
```

The red build failed with `TS2307` because the exported `sequential-user-task` semantic owner did not exist. The green package implements immutable capsule definition/runtime data, external command admission, bounded internal closure, pure transition application, stable observation projection, and the logical scenario runner without runtime dependencies.

The terminology refactor was also red/green: the focused test imported the approved `applyStimulus` API before it existed and failed with an ESM missing-export error; the package became green after the transition function and package boundary were renamed to `@bpmn-lean/semantic-core`.

Six tests derive the independently stored CIB/Lean trace, poison the scenario calibration to prove the runner does not read its answer, lock start-to-wait and matching-completion behavior, reject a non-matching completion without state change, and prevent closure-bound exhaustion from exposing a committed command.

On 2026-07-24, two artifact-warm semantic-gate runs covering Lean and the TypeScript semantic core completed in 1.17 seconds and 1.11 seconds. The implemented semantic gate therefore meets the less-than-two-second warm budget. After the terminology refactor, an artifact-current complete implemented gate finished in 5.54 seconds; the final source-current gate after aligning the Lean transition name finished in 12.23 seconds.

## M0.3 Lean semantic capsule

The focused gate is:

```sh
lake build checkConformance
lake exe checkConformance
```

The red build imported an intentionally absent `BpmnSemantics.SequentialUserTask` module and failed on that missing semantic owner. The green module admits an external start or User Task completion command, performs explicit deterministic internal closure, derives stable canonical observations, and returns closure-bound exhaustion as a harness failure rather than a semantic outcome.

[SequentialUserTaskConformance.lean](../BpmnSemantics/SequentialUserTaskConformance.lean) writes the calibrated five-observation trace independently and proves equality with the interpreter result. Named theorems prove that start closes at exactly one active User Task wait, matching completion closes the Process, and a completion naming another task is rejected with runtime state unchanged. A separate bound-zero example proves that harness exhaustion retains the committed deployment observation but does not expose the admitted command as committed. These results cover only the content-addressed Milestone 0 capsule.

On 2026-07-24, a source-current focused build completed in 3.29 seconds, while the artifact-warm build and executable completed in 0.14 seconds and 0.16 seconds respectively. The Lean-only warm loop was below the two-second budget at the M0.3 checkpoint; the M0.4 combined measurements above now establish the accepted semantic-loop result.

## M0.2 CIB calibration gate

The focused gate is:

```sh
./scripts/test-cibseven-oracle.sh
```

The first red run failed at Java test compilation because the scenario protocol, JSON codec, and runner did not exist. After the public-service runner was implemented, deployment exposed a required CIB Seven 2.2 history-TTL configuration; the runner now keeps the default audit history level and pins a `P180D` default TTL while excluding history from canonical observations. The first PVM projection then disproved two provisional diagnostic expectations: ordinary flow nodes have no PVM `eventScope`, and CIB normalizes the None End Event type to `noneEndEvent`. The calibrated test expectation records those observed internals only in diagnostics.

The green gate deploys the content-addressed BPMN resource, starts the Process, observes exactly one User Task, completes it, observes Process completion, and repeats against one warm engine. It compares the result with the typed trace parsed from [scenario.json](../scenarios/m0-sequential-user-task/scenario.json), verifies the diagnostic topology and ordered transitions, and proves zero deployments, definitions, instances, tasks, jobs, incidents, and historic Process instances after each run. A second test sends two compact requests through one JSON-lines runner and verifies stable traces, cleanup, and absence of generated engine identifiers.

On 2026-07-24, a dependency-warm direct JSON-lines sample measured 1.983 seconds for embedded-engine startup and 0.492 seconds for the scenario including cleanup. Its scenario phases were 0.146 seconds deployment, 0.005 seconds PVM definition projection, 0.037 seconds start, 0.027 seconds wait projection, 0.027 seconds completion, 0.002 seconds completion projection, and 0.049 seconds cleanup. The dependency-warm Maven gate, including compilation checks and four isolated executions across the two tests, completed in 5.28 seconds. These are M0.2 component measurements, not yet the full-pipeline budget result.

## Provisional architecture-spike gate

The semantic-representation candidates are intentionally separate from the current verification gate:

```sh
lake build checkSemanticRepresentationSpike
lake exe checkSemanticRepresentationSpike
```

The gate covers the bounded witnesses recorded in [experiments/SEMANTIC-REPRESENTATION-SPIKES.md](experiments/SEMANTIC-REPRESENTATION-SPIKES.md). Passing demonstrates only that the candidate types can express the examples and distinguish the seeded weak join account. It does not establish BPMN semantics or make the candidates part of the default Lean authority.

The red run imported the absent `BpmnSemantics.Experiments.SemanticRepresentations` module and failed for that missing implementation. The green build and executable pass after adding the experiment-local source compiler, runtime state, join accounts, and closure checks.

The first measured warm focused build completed in 0.20 seconds, and the warm executable gate completed in 0.40 seconds on 2026-07-23. These are architecture-spike timings, not semantic-loop or full-pipeline measurements.

## Milestone 0 feedback gates

The durable contract and exact performance definitions are in [MILESTONE-0-FAST-PIPELINE.md](MILESTONE-0-FAST-PIPELINE.md).

The implemented semantic gate is:

```sh
./scripts/pnpm.sh run test:semantic
```

The later public gates remain planned:

```sh
./scripts/pnpm.sh run test:pipeline
./scripts/pnpm.sh run test:assurance
```

`test:pipeline` must run the walking skeleton through CIB, Lean, the semantic core, Temporal, differential comparison, replay, and cleanup below fifteen warm seconds and forty-five cold seconds. `test:assurance` owns larger selective suites and may take minutes. These two scripts do not exist yet; `./scripts/verify.sh` remains the complete implemented gate.

## Evidence lanes

No single external suite proves the project goal. Every release claim must name the lane that produced each result and retain the boundaries between them.

| Lane | Reused input | What passage can establish | What it cannot establish |
|---|---|---|---|
| Normative coverage | BPMN 2.0.2 clauses, figures, XSD/CMOF, and issue dispositions | Every applicable Process Execution requirement has an explicit implementation and evidence disposition | Agreement with CIB or durability on Temporal |
| Interchange | BPMN MIWG reference models, attribute matrix, and cross-tool results | XML, namespaces, references, DI, extension preservation, import, and eventual round-trip behavior | Execution semantics |
| CIB compatibility | Pinned CIB Java assertion/fixture pairs exercised through public services | Agreement with the declared CIB release and observation boundary | OMG conformance |
| Historical cross-engine | Independently reviewed Betsy cases | Portable black-box separating examples and known engine disagreements | Current-engine support or an OMG TCK result |
| Lean semantics | Executable examples, proofs, and bounded exploration | The profile’s independent operational account and proved invariants | External implementation agreement |
| TypeScript differential | Neutral scenarios compared with Lean and CIB | Semantic core agreement within the declared profile | Temporal refinement |
| Temporal refinement | Adapter observations, retained-history replay, duplicate delivery, and fault injection | Durable implementation preserves semantic-core-visible semantics under the tested refinement contract | Unsupported BPMN or CIB behavior |

## CIB corpus adoption

The pinned CIB core corpus contains 1,808 explicit tests and 1,144 BPMN fixtures. A CIB test is reusable only as an assertion/fixture pair: XML alone does not state the expected behavior.

Adopt it through this pipeline:

1. Inventory the Java test method, fixture path, commands, clock/job inputs, and public observations at CIB Seven `v2.2.0`.
2. Prefer the 498 core fixtures without actual vendor-prefixed elements or attributes.
3. Justify the intended behavior independently from BPMN 2.0.2 and record any specification ambiguity or CIB-specific choice.
4. Re-author the smallest neutral scenario that distinguishes the intended behavior from a realistic wrong result.
5. Preserve the original CIB revision, Java test path, fixture path, and license attribution as provenance.
6. Keep vendor extensions, history projections, listener ordering, job semantics, incidents, and persistence behavior in a separately versioned CIB compatibility layer.

The first extraction families are conditional/default/uncontrolled sequence flow; exclusive, inclusive, parallel, and event-based gateways; multi-instance and Sub-Process scope; call Activities; and error, escalation, message, signal, timer, conditional, and compensation Events.

The oracle harness should follow CIB’s own strongest testing pattern: deploy a fixture, invoke public services, control the clock and job executor explicitly, read normalized public runtime/task/history views only when they belong to the profile, verify process completion, and enforce cleanup plus a clean database.

## MIWG adoption

Run the 21 pinned reference models first as import fixtures. Each result must distinguish XML/schema acceptance, reference resolution, semantic normalization, DI retention, unsupported execution features, and deployment validation. An import pass must never imply that the model was admitted for execution.

If export is added, implement MIWG round-trip and cross-tool procedures against a semantic normalized model plus an explicit preservation policy. Byte equality is not the contract, and diagram screenshots are not execution traces.

## External benchmark discipline

Betsy and other engines are discovery sources. Before a case enters the neutral suite, remove obsolete installer assumptions and engine-specific transforms, identify the BPMN clause being tested, and make the expected observation independent of any one product API.

## Future gates

The implemented CIB oracle gate pins executable artifacts and configuration, controls logical time and scheduling, and verifies isolation and cleanup. Negative deployment/command classification beyond the successful M0.2 slice remains future work toward the milestone-wide semantic-versus-harness-versus-infrastructure acceptance criterion.

A future TypeScript gate must follow the global JavaScript/TypeScript long-running-command guidance, use pnpm, and test the semantic core without CIB Seven or Temporal dependencies.

A future Temporal gate must include retained-history replay, duplicate delivery, timer, message, cancellation, retry-separation, Continue-As-New, and semantic-core refinement checks. Passing Temporal tests must never substitute for semantic-core-versus-Lean or semantic-core-versus-CIB differential evidence.

If an auxiliary formal-method experiment from [TLA-AND-BISIMULATION-RESEARCH.md](TLA-AND-BISIMULATION-RESEARCH.md) is approved, its focused check initially belongs in extended assurance rather than the semantic or Milestone 0 full-pipeline gate. Every result must report the exact tool and model revisions, finite configuration or proof assumptions, checked properties, fairness assumptions where applicable, explored state counts, and counterexample status. It must detect its named seeded defect before it becomes a retained gate. Model checking, equivalence checking, or net analysis never substitutes for Temporal fault injection, replay, or implementation refinement evidence.
