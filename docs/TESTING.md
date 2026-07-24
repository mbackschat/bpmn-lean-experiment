# Testing

The current test estate covers the Phase 0 Lean contract vocabulary, the complete Milestone 0 pipeline, the first exact BPMN XML ingestion slice, and the bounded User Task interaction expansion: CIB Seven calibration, Lean sequential User Task semantics and laws, the pure IR-consuming TypeScript semantic core, the Temporal Query/Update refinement/replay adapter, and the pure differential comparator. It supplies two draft-profile behavioral calibrations, independent Lean and TypeScript semantic accounts, one matching durable host, source and admission negative guards, committed lifecycle-Signal and exact-completion-Update replay fixtures, and a fast four-case direct comparison, but no BPMN conformance or immutable CIB compatibility claim.

## Red/green workflow

For each semantic capsule:

1. add the smallest executable example that separates the intended rule from a realistic wrong account;
2. run the focused target and confirm failure for the intended missing or incorrect behavior;
3. implement the semantic root rather than a case-specific patch;
4. rerun the focused target;
5. run the complete applicable gate;
6. perform the epistemic-closure review required by [CLAUDE.md](../CLAUDE.md#milestone-and-capsule-reflection);
7. update [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) with the exact semantic, proof, and external-evidence boundary.

The first scaffold capsule followed this workflow: the conformance module imported an absent contract, the red run failed on that missing semantic owner, and the green run passed only after the outcome vocabulary was implemented.

## Semantic capsule closure

After Milestone 0, a feature is not represented by one aggregate “supported” state. The applicable lanes close independently:

1. normative BPMN pointer or approved CIB-profile interpretation;
2. smallest separating example and its intended red result;
3. executable Lean definition and static admission boundary;
4. useful universal law with explicit hypotheses;
5. nearest plausible stronger false claim as a checked non-law;
6. retained CIB observation with exact environment and projection fidelity;
7. independently derived TypeScript semantic-core result;
8. Temporal refinement, replay, cleanup, and applicable fault evidence;
9. meaningful mutation that proves the new evidence projection can detect a semantic disagreement;
10. exact complete, pending, and excluded dimensions in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

A proof establishes a property of the chosen Lean account, not correspondence with CIB Seven. A retained CIB trace establishes only finite empirical correspondence at its declared observation boundary and does not transfer Lean’s proofs to CIB, TypeScript, or Temporal. Parser acceptance, model admission, execution behavior, Temporal durability, and conformance are separate assertions.

Retained CIB observations and Temporal histories are immutable. When replay disagrees, investigate the semantic definition, source identity, environment, or projection; never regenerate expected evidence merely to restore green. Batch new CIB probes by coherent semantic family after the separating examples identify the exact observation needed. The full rationale is in [the sibling process-transfer study](research/A12-KERNEL-LEAN-PROCESS-TRANSFER.md).

## Current verification gate

```sh
./scripts/verify.sh
git status --short
```

The verification script evaluates profile, answer-free scenario, canonical-result, and retained CIB evidence documents against the maintained Draft 2020-12 schemas; checks their cross-artifact identities and hashes; validates BPMN XML and locally available official XSD and CMOF facts; runs Lean, the BPMN source/compiler boundary, the pure TypeScript semantic core, the embedded CIB Seven oracle tests, the pure comparator, timeout process-group cleanup, the prepared four-case exact-source pipeline, replay, and whitespace. `lake test` elaborates the separating examples through the `checkConformance` executable; [pnpm.sh](../scripts/pnpm.sh) selects exact active nvm/asdf tools or the Homebrew fallback without changing shell configuration; [test-cibseven-oracle.sh](../scripts/test-cibseven-oracle.sh) selects Java 21 and the repository-local Maven wrapper.

## User Task interaction contract and CIB evidence

The adopted draft contract and witnesses are in the [User Task interaction semantic capsule](capsules/USER-TASK-INTERACTION.md). The versioned draft profile and neutral scenario reuse the exact Milestone 0 BPMN bytes while adding a structured semantic task occurrence, BPMN task name, exact completion stimulus, and `openUserTasks` observation.

The initial intended red CIB run failed at Java test compilation because `UserTaskInstanceId`, `OpenUserTask`, the lifecycle state, and the exact completion stimulus did not exist. A later red guard required the absent command-ID-free `CompleteUserTaskInstanceInteraction`; it exposed that the earlier `enabledStimuli` projection depended on the scenario’s future commands. The green runner now uses public `TaskService` queries, never exposes the generated CIB task ID as a comparison key, derives enabled interactions only from current open tasks, completes the exact semantic occurrence, rejects the correct BPMN element with activation ordinal `2`, rejects a stale occurrence after completion, preserves state after both rejections, and cleans all three runs. Equality of the successful and wrong-activation pre-command states is the executable common-mode-failure guard.

The interaction Lean lane began red by importing absent exact-task and interaction types. The green account adds semantic activation ordinal, exact completion admission, state-derived open tasks and enabled interactions, and independent expected traces for successful, wrong-activation, and stale-completion scenarios. It proves exact completion for the bounded model, proves wrong-activation rejection and state preservation for arbitrary model/instance/activation inputs under the explicit unequal-activation hypothesis, and checks that matching only `elementId` is insufficient.

The interaction TypeScript lane began red because the semantic core had no structured task occurrence, named-task IR, interaction projection, or exact-instance completion stimulus, while the XML compiler still emitted IR v0.1. The green core independently derives the retained exact, wrong-activation, and stale-completion traces; requires full Process-instance, BPMN-element, and activation identity; observes unchanged state after rejection; and keeps enabled interactions independent of future scripted commands. The compiler now emits `bpmn-source-sequential-user-task@0.2.0` IR with the admitted task ID and `string | null` name, while legacy v0.1 remains accepted only for the retained lifecycle profile and Temporal replay.

The scenario artifacts carry separate document and trace schema versions but no expected outcomes or traces. Separate immutable CIB evidence envelopes are bound to exact scenario bytes, profile and projection identity, producer environment, and engine revision. The focused `test:contracts` gate uses approved `ajv@8.20.0` to evaluate Draft 2020-12 schemas and rejects answer smuggling, stale scenario evidence, and an invalid activation-ordinal mutation. Target runners receive only the neutral scenario; the differential verifier loads retained evidence separately and classifies live-CIB agreement.

The differential harness now uses case-owned paths, Lean emitter identity, Workflow prefix, retained histories, wait-prefix length, and seeded mutation. Prepared mode removes duplicate builds from the full repository gate. The timeout helper owns a POSIX process group, sends `SIGTERM`, escalates to `SIGKILL` after a bounded grace period, waits for closure before returning, and has a negative witness whose descendant would otherwise escape and write a marker.

The batching red tests called an absent Temporal batch API and changed the Surefire bridge to an absent JSON-lines input contract. The green runner executes all three interaction scenarios concurrently through one server and Worker, rejects duplicate Workflow IDs before start, waits for every started execution before propagating a batch error, and exactly matches the pure core. The CIB bridge delegates a JSON-lines request batch to the persistent oracle process; a three-scenario focused test proves request-order results and clean state after every case through one engine.

The Temporal interaction transport began red because the batch returned no Query projection or Update outcomes and still delivered every completion through the retained Signal. The green Workflow exposes the core-derived open-task projection through a read-only Query, accepts exact task-instance completions through an Update that waits for the single semantic loop, and returns the core-owned command outcome. Exact, wrong-activation, and stale-completion Query/Update executions equal the independent core and their live histories replay. The stale witness redelivers the first semantic command under a distinct Temporal Update ID; the Workflow-local ledger returns the first committed result without adding a trace transition before the distinct stale command is rejected. Committed lifecycle-Signal and exact-completion-Update histories replay through their distinct compatibility paths.

The interaction differential expansion began red because the pipeline exported only one lifecycle result from Lean and exposed only a single-case harness. The green Lean emitter derives all four results in one process and tags each JSON line with scenario identity. One full gate compiles IR once per source/profile identity, runs all four scenarios through one CIB engine and the semantic core, starts two isolated Temporal Workflows per case under one server/Worker, and compares CIB, Lean, TypeScript, and Temporal plus retained CIB evidence without positional answer matching. It separately checks Query projection, Update outcomes, duplicate delivery, per-case cleanup, lifecycle-state mutation, and task-activation mutation.

The replay-batching red test called the absent `replayHistories` runner API. The green runner validates unique replay identities and checks every SDK replay result while building the Workflow bundle once for the whole set. The complete pipeline replays four live histories plus both retained fixtures through that one Worker.

The retained Update-history work first exposed that serializing `WorkflowHandle.fetchHistory()` directly produces SDK-internal timestamp objects rather than replayable Proto3 JSON. The accepted fixture was exported once through Temporal CLI’s documented `workflow show --output json` representation after setting deterministic Client and Worker identities at the shared test-environment root. Its focused integrity guard decodes and exactly compares the answer-free scenario, compiled IR, completion stimulus, committed Update outcome, and final core result; requires exactly one Update-accepted and one Update-completed event; rejects any Signal event; and proves the older Signal fixture cannot satisfy the Update-history claim. Normal gates only read the committed fixtures.

Performance evidence must distinguish real time, aggregate user CPU, system time, build mode, and the harness-reported phases. Record the latest checkpoint numbers in [PLAN.md](PLAN.md), not in this stable testing guide.

## BPMN source ingestion and CMOF facts

The focused gate is:

```sh
./scripts/pnpm.sh run test:bpmn-source
```

The retained red run failed because the tested package had no implementation. The first green gate captured the exact input independently of caller mutation, checked SHA-256 identity, compiled the canonical sequential model, rejected identity mismatch, blocked a parser warning caused by a deliberately lost Sequence Flow target reference, rejected DOCTYPE before parser invocation, rejected a Service Task outside the first compiler, and enforced the caller byte limit. The interaction red then expected named-task IR v0.2 while the compiler still emitted v0.1; the green compiler preserves the exact task name and maps an omitted XML name to `null`. The package owns a narrow runtime-accurate declaration instead of the known-inaccurate `@types/bpmn-moddle` warning type.

The same gate checks the bounded tracked metamodel manifest against the exact ignored normative `BPMN20.cmof` when available. Twelve class/generalization facts and eight property facts are checked, including the Flow Element name type, reference targets, multiplicity, containment, and one default. Absence of the local copyrighted corpus skips only that provenance cross-check; the tracked compiler tests remain mandatory.

The optional local interchange observation gate is:

```sh
./scripts/pnpm.sh run test:miwg
```

It requires the pinned external MIWG revision, reads all 21 reference models without copying them, checks exact-byte retention, and fails on source/security/parser failures outside the recorded admission boundaries. Its current honest result is fourteen `unsupportedModel`, six `unsupportedEncoding`, and one `parserWarning`; none is reported as execution support.

The M0.1 red run imported the intentionally absent `BpmnSemantics.Scenario` module and failed. The first implementation run then exposed Lean’s requirement that imports precede module documentation; moving the import to the module beginning fixed that structural error. The green run passes with the implementation-neutral scenario, stimulus, observation, result, and runner types.

The first measured warm contract gate on 2026-07-23 completed in 1.36 seconds. At that checkpoint the TypeScript semantic core did not yet exist, so this remains a historical Lean-and-artifact baseline rather than the accepted semantic-loop measurement.

## M0.6 differential comparator

The focused comparator gate is:

```sh
./scripts/pnpm.sh run test:differential
```

The first intended red run failed with `TS18003` because the new package had no comparator source. Before that run, adding the workspace package caused pnpm to request a workspace synchronization; that setup failure was corrected and was not counted as semantic red evidence.

The green pure comparator accepts exact canonical agreement and classifies the first disagreement as scenario outcome, trace length, observation kind, or observation value with an exact structural path. Its focused separating example changes an active-wait state observation from `running` to `completed` and requires an `observationValue` disagreement at `trace[1].status`.

The full gate is:

```sh
./scripts/pnpm.sh run test:pipeline
```

The orchestrator’s intended red run failed because `scripts/test-pipeline.mjs` did not exist. The first sandboxed green attempt reached the implementation but could not bind the ephemeral Temporal server ports; the same source passed in the authorized local-server environment.

The green gate builds the source importer, TypeScript core/adapter/comparator, Lean batch emitter, and CIB test boundary; compiles the exact BPMN bytes to versioned IR once per source/profile identity; starts a full Temporal server; and concurrently runs one four-case CIB batch, one four-result Lean emitter, the pure semantic core, and eight isolated Temporal Workflows. It requires exact four-target canonical agreement and retained-CIB agreement per scenario identity, calibrated wait and Query projections, exact Update outcomes, duplicate-command stability, equal isolated Temporal results, clean CIB state after every case, and classified mutations at `trace[2].status` and `trace[2].openUserTasks[0].id.activation`. It batch-replays all primary live histories plus retained fixtures, records per-case provenance and phase timings, and enforces the 15-second warm and 45-second cold budgets.

The first successful source-current run measured 1.16 seconds build, 1.25 seconds startup, 3.33 seconds concurrent scenario execution, 0.06 milliseconds projection, 1.59 milliseconds comparison, 0.42 seconds replay, and 0.01 seconds cleanup. Its warm total was 5.03 seconds and build-plus-warm total was 6.19 seconds. The first successful exact-source compilation run measured 1.47 seconds build, 6.5 milliseconds ingestion, 1.23 seconds startup, 3.21 seconds concurrent scenario execution, 0.41 seconds replay, and 0.02 seconds cleanup; its warm total was 4.90 seconds and build-plus-warm total was 6.37 seconds.

## M0.5 Temporal refinement and replay

The focused gate is:

```sh
./scripts/pnpm.sh run test:temporal
```

The first red run compiled the semantic core and then failed with `TS18003` because the adapter had no source implementation. The semantic core first gained a tested incremental boundary that owns deployment, transition, and stable-observation projection; its existing in-process runner now consumes the same boundary used by Temporal.

The first adapter compile exposed incompatibilities inside the pinned Temporal 1.21.0 declaration files under TypeScript 7.0.2, including exact-optional schedule types, an undeclared `ms` type, and Node’s event-map constraint. The adapter therefore keeps strict project-source checking but sets `skipLibCheck: true`; the dependency-free semantic core retains full library checking. The first live startup then failed because the SDK requires the configured CLI cache directory to exist, and the runner now establishes that invariant before starting the environment.

The green gate starts a full local Temporal server through CLI `v1.8.1`, bundles one Worker without the parser package, compiles the exact BPMN source outside Workflow execution, starts the neutral scenario plus executable IR as Workflow input, observes the three-entry deployment/start/wait prefix through a diagnostic Query, delivers completion through one Signal, and compares the complete Workflow result with `runScenario(scenario, executableIr)`. It fetches and replays the new IR-bearing Event History, then separately loads and replays [the committed pre-IR history fixture](../packages/temporal-adapter/test/fixtures/m0-sequential-user-task.history.json).

The retained lifecycle history was exported once through Temporal CLI’s documented `workflow show --output json` format and is never refreshed by the normal test. The exact-completion Update fixture uses the same documented representation and immutable policy. This keeps retained replay evidence independent of the live executions performed by later test runs and avoids depending on an internal SDK serialization helper. The runner places explicit deadlines around environment startup, Worker bundling, every Temporal client call, replay, and cleanup; the outer Node tests also have deadlines.

On 2026-07-24, the first successful source-current gate completed in 7.33 seconds. An artifact-warm rerun including TypeScript compilation, full-server startup, live execution, live replay, retained replay, Worker shutdown, and server cleanup completed in 2.15 seconds. The complete implemented `./scripts/verify.sh` gate then completed in 10.01 seconds. Activities, timers, Search Attributes, Continue-As-New, fault injection, cache eviction, duplicate delivery, and the production User Task command API remain outside M0.5.

## M0.4 pure TypeScript semantic core

The focused and semantic gates are:

```sh
./scripts/pnpm.sh run test:semantic-core
./scripts/pnpm.sh run test:semantic
```

The red build failed with `TS2307` because the exported `sequential-user-task` semantic owner did not exist. The green package implements immutable capsule definition/runtime data, external command admission, bounded internal closure, pure transition application, stable observation projection, and the logical scenario runner without runtime dependencies.

The terminology refactor was also red/green: the focused test imported the approved `applyStimulus` API before it existed and failed with an ESM missing-export error; the package became green after the transition function and package boundary were renamed to `@bpmn-lean/semantic-core`.

The focused tests derive the independently stored lifecycle and interaction CIB/Lean traces, lock start-to-wait and matching-completion behavior, reject non-matching, wrong-activation, and stale completion without state change, require named-task IR v0.2 for the interaction profile, prevent closure-bound exhaustion from exposing a committed command, verify that the incremental durable-host boundary owns deployment plus stable observations, and reject mismatched source identity, malformed task metadata, malformed topology, or malformed JSON-shaped IR without throwing.

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

The public fast gates are:

```sh
./scripts/pnpm.sh run test:pipeline
```

`test:pipeline` runs the walking skeleton through CIB, Lean, the semantic core, Temporal, differential comparison, replay, and cleanup below fifteen warm seconds and forty-five cold seconds. A future `test:assurance` command will own larger selective suites and may take minutes. `./scripts/verify.sh` includes the focused semantic, CIB, comparator, and complete pipeline gates.

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

The read-only pre-adoption probe in [experiments/BPMN-XML-INGESTION-SPIKE.md](experiments/BPMN-XML-INGESTION-SPIKE.md) imported all 21 reference models with `bpmn-moddle@10.0.0` and retained a limited `$type:id` projection across re-import. The implemented project-owned gate now retains original bytes and diagnostics, blocks warning-producing models from execution by default, and includes a mutation showing that a lost unresolved reference cannot pass admission. Six unsupported encodings and the unresolved-reference warning remain explicit compatibility work rather than being converted into passes.

## External benchmark discipline

Betsy and other engines are discovery sources. Before a case enters the neutral suite, remove obsolete installer assumptions and engine-specific transforms, identify the BPMN clause being tested, and make the expected observation independent of any one product API.

## Future gates

The implemented CIB oracle gate pins executable artifacts and configuration, controls logical time and scheduling, and verifies isolation and cleanup. Negative deployment/command classification beyond the successful M0.2 slice remains future work toward the milestone-wide semantic-versus-harness-versus-infrastructure acceptance criterion.

Every TypeScript gate follows the global JavaScript/TypeScript long-running-command guidance and uses pnpm. The semantic core remains testable without CIB Seven, Temporal, or the XML parser; source-ingestion integration has its own focused package and gate.

The implemented Temporal gate covers live semantic-core Query/Update refinement, same-command duplicate delivery, batched live replay, and retained lifecycle-Signal plus exact-completion-Update replay. Future Temporal assurance must add cache eviction or Worker restart, timers, additional message modes, cancellation, retry separation, Continue-As-New, and fault injection. Passing Temporal tests never substitutes for semantic-core-versus-Lean or semantic-core-versus-CIB differential evidence.

If an auxiliary formal-method experiment from [TLA-AND-BISIMULATION-RESEARCH.md](TLA-AND-BISIMULATION-RESEARCH.md) is approved, its focused check initially belongs in extended assurance rather than the semantic or Milestone 0 full-pipeline gate. Every result must report the exact tool and model revisions, finite configuration or proof assumptions, checked properties, fairness assumptions where applicable, explored state counts, and counterexample status. It must detect its named seeded defect before it becomes a retained gate. Model checking, equivalence checking, or net analysis never substitutes for Temporal fault injection, replay, or implementation refinement evidence.
