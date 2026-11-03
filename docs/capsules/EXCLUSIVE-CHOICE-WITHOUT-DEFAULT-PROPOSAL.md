# Exclusive Choice without a default proposal

## Status

Lifecycle: proposed
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a divergent Exclusive Gateway that has no default flow, wherever it admits a Choice, routing exactly as before when a condition holds and rolling the whole command back when none does, with the rollback reaching the caller as CIB's does: a Start that creates no instance, and a User Task completion that leaves the task open?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). It serves `PC-CF-02` of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), primary: its first-true and “default runs only when none matches” clauses for a Choice that declares no default, which the [Exclusive choice arity account](EXCLUSIVE-CHOICE-ARITY-SPEC.md#evidence-and-acceptance) leaves open (“Choices without a default, where a no-match is a runtime exception”). The row stays open on body Choices, Choices in models that fork, and its merge and mixed-activity clauses.

Selection, 2026-11-03: of the pinned CIB Seven checkout's `*.bpmn` and `*.bpmn20.xml` files outside `target/`, 46 models hold a root-body Choice without a default and no construct outside this profile's control shapes. In 27, only a Start feeds the Choice within one command. In 18, only a User Task does. In one, a Service Task does. Every model that both forks and chooses throws an Escalation, Error or Signal End, so neither that shape nor a Choice in a Sub-Process reaches an admissible model.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 13.4.2, Table 13.2 (Exclusive Gateway Execution Semantics): conditions are evaluated in order and the first true condition's flow is taken; its Exception Issues row reads “The exclusive gateway throws an exception in case all conditions evaluate to false and a default flow has not been specified.” Clause 10.6.2 makes the default optional. The standard does not say what the exception does to the surrounding work.

CIB Seven `2.2.0` (`ExclusiveGatewayActivityBehavior#doLeave`, pinned `5a45b47e`) iterates the outgoing transitions in declaration order. With no transition taken and no default, it raises `ProcessEngineException` `ENGINE-02004` (“No outgoing sequence flow for the element with id '…' could be selected for continuing the process”, `BpmnBehaviorLogger#stuckExecutionException`). The exception aborts the engine command and rolls its transaction back. `ExclusiveGatewayTest#testNoSequenceFlowSelected` starts such a Process and expects the start call to throw. The register's [`CIB-OP-0004`](../CIB-BPMN-RELATION-REGISTER.md#cib-op-0004--synchronous-juel-command-rollback-mapped-to-speculative-semantic-commitment) records the same command-rollback consequence for a failing condition: a failed completion leaves its User Task available, and a failed start leaves no runtime or historic Process instance.

Classification: a new gap resolution, `CIB-INT-0003` (a no-match Exclusive Gateway rolls its command back). BPMN requires an exception and leaves its effect open. CIB resolves it as an aborted command, and the profile adopts that resolution as the semantic outcome `rolledBack`, with the exact pre-command state. `CIB-AGR-0006`'s boundary sentence “This agreement does not cover a missing default” then points to `CIB-INT-0003`.

## Required, optional and excluded scope

Required:

- a divergent Exclusive Gateway in every position where the profile admits a Choice (the root body), with one or more outgoing flows. Each flow carries a Simple Boolean condition, and there is no `default` attribute;
- a mixture with defaulted Choices in one model;
- a Choice reached in the closure of a Start or of a User Task completion, including through Merges, Parallel joins, Sub-Process completion and Call Activity return.

Optional: none.

Excluded, each refused at admission:

- an outgoing flow without a condition that is not the declared default. CIB takes such a flow unconditionally, a CIB-specific reading that Table 13.3 does not give;
- a default-less Choice that a mapped Service Task's or Send Task's result can reach within the same command. In CIB that command is the task's asynchronous job, whose failure is retried and then raises an incident, and this profile admits no incident. The reader decides it by forward traversal from each such task's outgoing flows through every node that completes within the same command, stopping at User Tasks, effect tasks and Call Activities. The traversal continues from a Sub-Process's End Events to the Sub-Process's outgoing flows, and passes through Merges and Parallel joins. It over-approximates: a model it refuses may be one whose effect closure never reaches the Choice, never the reverse;
- default-less Choices under every other profile, and every exclusion the arity account keeps (body Choices, converging or mixed gateways, conditions on the default).

These bound admission only. Admitting the effect-closure case later, under a profile with incidents (`PC-AUTO-03`), broadens the class without reinterpreting an admitted model, because the semantic outcome of the no-match, `rolledBack`, stays the same.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Every model it admits today keeps its admission, route, commands and observations.

The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) changes as follows:

- it gains the feature `exclusive-gateway-without-default` and the relationship `CIB-INT-0003`;
- its exclusion `choices-without-a-default` becomes `choices-without-a-default-after-an-effect-result`;
- the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

Public contract changes:

- **Checked process and Program.** In the [checked-process schema](../../contracts/schemas/checked-process.schema.json), `exclusiveGateway.defaultFlowId` becomes optional; the inclusive gateway keeps its required default. In the [Semantic Process schema](../../contracts/schemas/semantic-process.schema.json), `choose.defaultOutput` and `choose.defaultOrigin` become optional and must be present or absent together. Existing documents stay valid unchanged, so this is no breaking change.
- **Command result.** A no-match produces the existing outcome `rolledBack` with both closure flags false, the exact pre-command state, and no transition, lifecycle or publication delta. Scenarios already classify that result as a semantic terminal outcome (`terminalExecution`).
- **Hosted Start.** [`BpmnProcessAdmissionFailureCode`](../../packages/temporal-adapter/client/src/process-client.ts) gains `startRolledBack`, owned by the [lifecycle specification's public result contract](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#public-result-contract). Like `startCapacityEnvelopeExceeded`, it is returned before any Workflow is created.
- **Hosted User Task completion.** A completion Update whose command rolls back returns the semantic command result `rolledBack`, and the Workflow continues with the task still open.

## Representation and runtime ownership

The checked `exclusiveGateway` node takes an optional `defaultFlowId`, and the IL `choose` operation takes an optional `defaultOutput` and `defaultOrigin`. Lean keeps the constructor arity and changes both field types to `Option`, so the many matches that bind the fields to wildcards are untouched. Absence means the source declares no default; lowering never invents a place or origin for it.

Selection stays one function per language, `selectConditionalBranch` in the [control-flow runtime](../../packages/semantic-core/src/semantic-process-control-flow-runtime.ts) and Lean's `selectConditionalOutput` and `prepareInternalConditional?`. When every candidate is false and the default is absent, each returns a distinct no-flow result. That result is not the evaluation-failure result. A no-flow result in the closure frontier ends the closure with the flag-free rollback, and preparation failure keeps its `ambiguousInternalChoice` rollback. The command result reuses `CLOSURE-ATOMIC-01`'s restoration of the pre-admission state, so no new outcome, flag or field is added to the command result.

Lean modules this touches, by role (the [current boundary](../LEAN-BUILD-MODULARITY-SPEC.md#current-boundary) names two of them as hubs):

- **Contracts.** `SemanticProcessContract` (the `choose` fields) and `CheckedProcessContract` (the `exclusiveGateway` field). Their JSON readers `SemanticProcessJson/Program` and `SemanticProcessJson/CheckedProcess` change with them.
- **Hubs, interface unchanged.** `ProgramStructuralValidation` (closed world): a body edit of the `choose` arm, requiring both default fields or neither, admitting neither only under this profile, and checking the origin when present. `OperationControlPlaces` (kernel, fan-out 501): a body edit that lists the outputs as `defaultOutput.toList`. The closed-world `CheckedGraphValidation` stays untouched, because its `exclusiveGateway` arms bind the default to a wildcard.
- **Selection and closure.** `SimpleBooleanExpression`, `TransitionStates`, `Transition`, the `InternalLocalControl*` selection, preparation and frame modules, `InternalScheduledClosure` (the no-flow frontier case) and `TransitionTrace` (the result mapping).
- **Admission.** `CheckedProcessAdmission`, `Lowering`, `ScopeReentryAdmission`, and the admissions of the profiles whose Choices keep a default (`StructuredCompositionAdmission`, `MixedTaskControlFlowAdmission`, `StructuredHumanWorkAdmission`). Those profiles require the default present, so their models and proofs keep today's meaning.
- **Proofs.** The proofs that destructure the default (`StructuredComposition*Proofs`, `MixedTaskControlFlow*Proofs`, cyclic conformance) take it from that `some` premise. `StructuredCompositionControlProofs`, `StructuredCompositionClosureProofs` and `StructuredCompositionDataProofs` carry size exceptions and must not grow. Any lemma their adaptation needs goes into a new family-owned leaf module.

Rejected alternatives:

- **A new `chooseWithoutDefault` operation.** It adds an arm to every closed-world match of the IL (`RuntimeStateWellFormed`, `ProgramStructuralValidation`, `CompensationEventSubProcessSnapshotDeclaration` and some forty modules), far more fan-out than two field types.
- **A synthetic default place feeding a failing operation.** It invents a control place with no BPMN origin and a new failing operation kind.
- **Treating no-match as the existing ambiguous-choice rollback.** That turns a semantic outcome into a harness failure, observation-free, which the host reports as `BpmnSemanticClosureFailure`, whereas CIB keeps the instance and its open task.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The Choice's default stops being required at these loci, for this profile only:

- the source projection, through [`projectExclusiveGateway`](../../packages/bpmn-source/src/simple-boolean-exclusive-gateway-source.ts)'s `variableArity` call from the [nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts). Every outgoing flow then needs a condition, and the source applies the effect-closure exclusion;
- the checked analyses: the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts) in TypeScript, `CheckedProcessAdmission.checkedExclusiveGatewayValid` and `ScopeReentryAdmission.checkedJoint?` in Lean;
- the Program analyses: the same TypeScript module, the [Choice shape validator](../../packages/semantic-core/src/simple-boolean-choice-admission.ts), the [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), and in Lean `ProgramStructuralValidation`'s `choose` arm and `ScopeReentryAdmission.operationJoint?`.

The effect-closure exclusion lives in the source reader only, like the reader's root-body restriction. The analyses admit a default-less Choice in any position the re-entry account admits a Choice, because the outcome there is defined.

The nearest wrong algorithms each have a separating witness below:

1. a default required at one locus, so that locus refuses the model;
2. a default made optional for every profile;
3. no-match taken as harness failure (`ambiguousInternalChoice`), as the first candidate, or as the last;
4. a rollback that keeps part of the closure (the completed task, a variable patch, an armed effect);
5. a host that fails the Workflow, or creates one for a rolled-back Start.

## Stable rules

- `XND-ADMIT-01`: admission accepts exactly the required scope above under this profile. It refuses every exclusion and parser warning, and leaves every model admitted today, under every profile, with its admission.
- `XND-ROUTE-01`: a token arriving at a default-less Choice takes the first conditional flow, in XML declaration order, whose condition is true, as `XCA-ORDER-01` states for a defaulted one.
- `XND-ROLLBACK-01`: when every condition of a default-less Choice is false, the command whose closure reached it has outcome `rolledBack`, both closure flags false, state exactly the pre-command state, and no transition, lifecycle or publication delta. This holds for a Start, which then creates no instance, and for a User Task completion, whose task stays open with its pre-command values.
- `XND-HOST-01`: a hosted Start whose command rolls back returns `rejected` with `startRolledBack`, and no Workflow is created. Programs without a default-less Choice keep today's Start path unchanged.
- `XND-HOST-02`: a hosted command delivered by Update whose command rolls back returns the semantic result `rolledBack`. Retrying the same command recovers that result, publication is unchanged, and the Workflow stays open. A distinct later command may commit.

## Newly reachable waits and resumption

None. A rolled-back command leaves the waits of the state before it. After a rolled-back completion, the User Task is completable again with other values under a new command ID.

## Separating witnesses

Two models, retained under `scenarios/exclusive-choice-without-default/` with credible business purposes:

- **Expense routing.** The Start supplies `category`. The Choice *Route by category* has two candidates: `stringEquals(category,"travel")` to the User Task *Review travel*, and `stringEquals(category,"equipment")` to the User Task *Review equipment*. There is no default. Each branch reaches a Merge and one None End.
- **Ticket triage.** The User Task *Triage ticket* writes `severity`. The Choice *Route by severity* has two candidates: `stringEquals(severity,"high")` to the User Task *Escalate*, and `stringEquals(severity,"low")` to the mapped Service Task *Auto-close*, which needs a source overlay. There is no default. Each branch reaches a Merge and one None End. The Service Task follows the Choice and never precedes it, so the model is admitted.

Journeys:

- **Travel expense** opens *Review travel* (`XND-ROUTE-01`).
- **Catering expense.** The Start's command is `rolledBack` with no state, and no instance exists (`XND-ROLLBACK-01`). This separates harness failure, a first-candidate or last-candidate fallback, and a Start that commits part of its closure.
- **Medium ticket.** Completing *Triage ticket* with `severity = "medium"` is `rolledBack`; the task stays open with its original values (`XND-ROLLBACK-01`). This separates a rollback that keeps the completion or its patch.
- **High ticket** opens *Escalate*, and **low ticket** arms *Auto-close* (`XND-ROUTE-01`).

Refused edits:

- the Choice of *Ticket triage* moved after an effect: *Triage ticket* replaced by a mapped Service Task that writes `severity`;
- the same Choice behind a Parallel join, one of whose inputs an effect feeds. This separates a traversal that stops at joins;
- an unconditioned non-default flow added to *Route by category*;
- either model under a profile whose Choices keep a default (the mixed-task profile), for each of the two levels in TypeScript and the Program level in Lean, the per-locus control the arity account uses.

Hosted witness, one real-service Temporal test:

- **Rolled-back Start.** It returns `rejected` `startRolledBack`, and describing the Workflow ID finds none.
- **Triage Update with `medium`.** It returns `rolledBack`, and the Query shows *Triage ticket* open and the unchanged publication. A retry of the same command ID returns `rolledBack` again.
- **New command ID with `high`.** It commits and opens *Escalate*. The Worker is then replaced and history replays.

This separates a Workflow failure (today's `BpmnSemanticClosureFailure`), a created Workflow, and a lost or reinterpreted recovery record.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `XND-ADMIT-01` | Both models admitted at both levels; each refused edit refused; the per-locus profile control; every retained model keeps its admission | Source, core, Lean conformance module, corpus | Require the default at one locus; drop it for every profile; stop the traversal at a join or a Sub-Process end |
| `XND-ROUTE-01` | Travel, high and low journeys | Pipeline, core runtime test, CIB probe | Select the last true candidate, or fall back to a candidate on no-match |
| `XND-ROLLBACK-01` | Catering Start, medium completion | Pipeline, core runtime test, Lean conformance module, CIB probe | Report harness failure; keep the completion, its patch or an armed effect; commit a Start |
| `XND-HOST-01`, `XND-HOST-02` | The hosted witness | Temporal real-service test with replay | Fail the Workflow; create a Workflow for the rolled-back Start; lose the recovered result |

## Lean assurance lane

Lane shape: proved for the no-match outcome, checked for admission.

Proved, in a new family-owned leaf module:

- `selectConditionalOutput` and `prepareInternalConditional?` return the no-flow result exactly when every candidate evaluates to `some false` and the default is absent;
- a closure whose frontier holds a no-flow Choice yields a command result `rolledBack`, with both flags false and `state = before`, by extending `StimulusResult.ofClosure_failure_rolls_back`.

Checked: an executable conformance module checks both models' admission at both levels, each refused edit, the Program-level profile control, and the two rolled-back journeys' outcome and state. The pipeline checks agreement with the core and Temporal.

## Temporal hosting and refinement preflight

- **Durable ingress.** The existing Start path and completion Update; nothing is added.
- **Wait, timer, effect, cancellation.** Unchanged. A rolled-back command arms and cancels nothing.
- **Lifecycle.** `XND-HOST-01` evaluates the Start's command in the semantic core in the client before Workflow creation, as the Start capacity envelope already evaluates a Start's journey. It applies only to Programs with a default-less Choice. The core is pure, and the profile has no Timers, so the Workflow's own evaluation of the same Start reaches the same result. If the Workflow nonetheless rolls a Start back, it keeps today's `BpmnSemanticClosureFailure`, a guard and not a path. `XND-HOST-02` narrows [`rolledBackClosureDiagnostic`](../../packages/semantic-core/src/scenario.ts)'s use in the Workflow loop to host-originated stimuli (Timer firings, whose refusal the [repeatable subscriptions specification](REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md) keeps as a closure failure because the unchanged Timer stays due). A caller-delivered command records its rolled-back result through the existing Terminal path, as a `rejected` one does.
- **Projection.** A rolled-back command publishes its command result and nothing else, the same as a rejected command.
- **Preserved relation.** Hosted committed state and publication equal the core's after every committed command. After a rolled-back command, both equal the core's state and publication before that command.
- **Risks.** Deduplication: a retry of the same command recovers the original `rolledBack`. Ordering and concurrency: unchanged, because commands are serialized in the one semantic loop. Replay: determinism follows from the core's purity.
- **Smallest executable refinement witness.** The hosted witness above.

## Evidence and acceptance

Lanes:

- three answer-free scenarios (travel, catering, medium) as registered pipeline cases, each with one seeded mutation;
- core runtime tests for the high and low journeys;
- the source test;
- the Lean conformance module and the proof module;
- the hosted witness;
- a CIB Seven `2.2.0` probe beside the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java). It uses JUEL renditions of the conditions under `CIB-CFG-0005` and asserts the selected task, the `ENGINE-02004` start failure with no runtime or historic instance, and the failed completion that leaves the task open with its values;
- two corpus rows and the About disclosure.

Acceptance:

- Lean, core and pipeline agree on every scenario of the profile;
- the probe agrees;
- every retained model stays admitted;
- the hosted pipeline and the hosted witness pass at family closure.

Then `PC-CF-02` is evidenced for default-less root Choices of this profile, and stays open on its other clauses.

## Versioning consequences

The profile grows in place. Both schemas loosen without a format change, so every existing document, fixture and Program stays valid under the [pre-release wire policy](../../contracts/README.md#evolution-policy). The start-result failure code is additive in the one current representation, and every consumer switch over it gains its arm in the same change. No admitted model changes its Program, route or behavior, because every model with a default-less Choice is refused today.

### Owners this implementation grows

TypeScript owners, with their nonblank headroom below the 800-line review target as `what-binds` reported it on 2026-11-03:

- the [Exclusive Gateway source](../../packages/bpmn-source/src/simple-boolean-exclusive-gateway-source.ts) (689) and the [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts) (412), which gain the optional default and the effect-closure traversal;
- the [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) and the [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) (94), with their [checked-process](../../contracts/schemas/checked-process.schema.json) and [Semantic Process](../../contracts/schemas/semantic-process.schema.json) schemas;
- the [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts) (187), the [Choice shape validator](../../packages/semantic-core/src/simple-boolean-choice-admission.ts) and the [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts);
- the [control-flow runtime](../../packages/semantic-core/src/semantic-process-control-flow-runtime.ts) (629), the [internal choice schedule](../../packages/semantic-core/src/internal-choice-schedule.ts) (631) and the local-control preparation;
- the [process client](../../packages/temporal-adapter/client/src/process-client.ts) (437) and the [Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) (8): its change must be line-neutral, or the stimulus classification moves into its own module first;
- the [About catalog](../../model-corpus/mvp-capabilities.ts) and the CIB probe.

Lean owners, besides those the representation section names: [`InternalScheduledClosure`](../../BpmnSemantics/SemanticProcess/InternalScheduledClosure.lean) has 22 lines of headroom, so its no-flow case is a body edit of at most that size, or the law moves to the new leaf module.

Each owner stays below the review target; growth past it means an extraction, never an exception.

Guards the implementation must change or satisfy:

- [`contract-schema-coverage`](../../scripts/contract-schema-coverage.test.ts) and [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts);
- the [projected flow-element keys test](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) and the [mixed-task control-flow source test](../../packages/bpmn-source/test/mixed-task-control-flow-source.test.ts), the per-profile loop;
- the [closure failure classification test](../../packages/temporal-adapter/workflow/test/closure-failure-classification.test.ts), which keeps Timer rollback a closure failure;
- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [executable model corpus test](../../packages/differential/test/executable-model-corpus.test.ts), the [capability catalog disclosures test](../../scripts/capability-catalog-disclosures.test.ts) and the [document reviewability guard](../../scripts/document-reviewability.test.ts).

Registration:

- `CIB-INT-0003` and `CIB-AGR-0006`'s boundary in [the register](../CIB-BPMN-RELATION-REGISTER.md);
- the profile artifact and README;
- the exclusive gateway mechanism row of the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), and `PC-CF-02`'s evidence cell;
- the [lifecycle specification's public result contract](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#public-result-contract);
- scenarios, pipeline cases, the corpus, About and the CIB probe.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
