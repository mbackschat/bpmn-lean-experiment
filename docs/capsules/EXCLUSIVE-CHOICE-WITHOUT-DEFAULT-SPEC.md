# Exclusive Choice without a default specification

## Status

Lifecycle: implemented
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a divergent Exclusive Gateway that has no default flow, wherever it admits a Choice that no effect result reaches within its command, routing exactly as before when a condition holds and rolling the whole command back when none does? The rollback must reach the caller as CIB's does: a Start creates no instance, and a User Task completion leaves the task open.

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). It serves `PC-CF-02` of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), primary, for Choices that declare no default:

- its first-true clause, “multiple true candidates select the first XML-declared candidate”;
- its reverse-order clause;
- “default runs only when none matches”, here as “nothing runs and the command rolls back when none matches”.

The [Exclusive choice arity account](EXCLUSIVE-CHOICE-ARITY-SPEC.md#evidence-and-acceptance) leaves these open (“Choices without a default, where a no-match is a runtime exception”). The row stays open on body Choices, Choices in models that fork, and its merge and mixed-activity clauses.

Selection, 2026-11-03. The selector: models outside `target/` with a root-body Exclusive Gateway that has more than one outgoing flow and no `default`, no diverging Parallel Gateway, and none of the Inclusive, Event-Based or Complex Gateways, Boundary, Intermediate Catch or Event Sub-Process events, Script, Receive, Send, Business Rule or Call Activities, Transactions or Multi-Instance. The counts:

- over the whole pinned CIB Seven checkout: 46 models. In 27 only a Start feeds the Choice within one command, in 18 only a User Task does, and in one a Service Task does;
- within the engine module's test resources alone: 31 models.

Close call, decided on reach. Every model that both forks and chooses throws an Escalation, Error or Signal End, so neither that shape nor a Choice in a Sub-Process reaches an admissible model.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 13.4.2, Table 13.2 (Exclusive Gateway Execution Semantics): conditions are evaluated in order and the first true condition's flow is taken. Its Exception Issues row reads “The exclusive gateway throws an exception in case all conditions evaluate to false and a default flow has not been specified.” Clause 10.6.2 makes the default optional and repeats the exception. The standard does not say what the exception does to the surrounding work.

CIB Seven `2.2.0`, pinned `5a45b47e`:

- **`ExclusiveGatewayActivityBehavior#doLeave`.** It iterates the outgoing transitions in declaration order. With no transition taken and no default, it raises `ProcessEngineException` `ENGINE-02004` (“No outgoing sequence flow for the element with id '…' could be selected for continuing the process”, `BpmnBehaviorLogger#stuckExecutionException`). The exception aborts the engine command and rolls its transaction back. `ExclusiveGatewayTest#testNoSequenceFlowSelected` starts such a Process and expects the start call to throw.
- **The parser.** `BpmnParse#validateExclusiveGateway` (`BpmnParse.java:1465-1470`) refuses an Exclusive Gateway whose only outgoing flow carries a condition (“has only one outgoing sequence flow … This is not allowed to have a condition”). The probe deploys that edit and expects the error.
- **The register.** [`CIB-OP-0004`](../CIB-BPMN-RELATION-REGISTER.md#cib-op-0004--synchronous-juel-command-rollback-mapped-to-speculative-semantic-commitment) records the same command-rollback consequence for a failing condition: a failed completion leaves its User Task available, and a failed start leaves no runtime or historic Process instance.

The [calibration probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveChoiceWithoutDefaultProbeTest.java) confirms every behavior this account relies on, on both witness models.

Classification: a new gap resolution, `CIB-INT-0003` (a no-match Exclusive Gateway rolls its command back). BPMN requires an exception and leaves its effect open. CIB resolves it as an aborted command, and the profile adopts that resolution as the semantic outcome `rolledBack`, with the exact pre-command state. `CIB-AGR-0006`'s boundary sentence “This agreement does not cover a missing default” then points to `CIB-INT-0003`. `CIB-CFG-0005`'s admitted source widens, for probe calibration of this account only, to two or more non-default conditions without a default.

## Required, optional and excluded scope

Required:

- a divergent Exclusive Gateway in every position where the profile admits a Choice (the root body). It has two or more outgoing flows, each with a Simple Boolean condition, and no `default` attribute;
- such a Choice in a model that also holds Choices with a default;
- such a Choice reached in the closure of a Start or of a User Task completion, directly, through Merges, or through the completion of an embedded Sub-Process.

Optional: none.

Excluded, each refused at admission:

- **One conditional flow and no default.** CIB's parser refuses it.
- **An unconditioned non-default flow.** CIB takes such a flow unconditionally, a reading that Table 13.2 and Clause 10.6.2 do not give.
- **A default-less Choice that a mapped Service Task's or Send Task's result can reach within the same command.**
  - In CIB that command is the task's asynchronous job, whose failure is retried and then raises an incident, and this profile admits no incident.
  - The source reader decides it by forward traversal from each such task's outgoing flows through every node that completes within the same command, stopping at User Tasks, effect tasks and Call Activities. It continues from an End Event of a Sub-Process body to that Sub-Process's outgoing flows.
  - It over-approximates: a model it refuses may be one whose effect closure never reaches the Choice, never the reverse. The profile admits no Parallel join together with a Choice (`models-that-both-fork-and-choose`), so the traversal meets none.
- **Everything else.** Default-less Choices under every other profile, and every exclusion the arity account keeps (body Choices, converging or mixed gateways, conditions on the default).

These bound admission only. Admitting the effect-closure case later, under a profile with incidents (`PC-AUTO-03`), broadens the class without reinterpreting an admitted model, because the semantic outcome of the no-match, `rolledBack`, stays the same.

The exclusion lives in the source reader only, like the reader's root-body restriction; neither analysis has it. A Program that bypasses the reader and reaches a no-match in an effect result's closure has a defined semantic outcome (`XND-ROLLBACK-01`). The host fails that Workflow with `BpmnSemanticClosureFailure` (`XND-HOST-02`), not with an incident.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Every model it admits today keeps its admission, route, commands and observations. The only flag-free rollback the core produces today is the recurring Timer capacity refusal, and it comes from Timer firings only.

The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) changes as follows:

- it gains the feature `exclusive-gateway-without-default` and the relationship `CIB-INT-0003`;
- its exclusion `choices-without-a-default` becomes `choices-without-a-default-after-an-effect-result`;
- the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

Public contract changes:

- **Checked process and Program schemas.** In the [checked-process schema](../../contracts/schemas/checked-process.schema.json), `exclusiveGateway.defaultFlowId` becomes optional; the inclusive gateway keeps its required default. In the [Semantic Process schema](../../contracts/schemas/semantic-process.schema.json), `choose.defaultOutput` and `choose.defaultOrigin` become optional and must be present or absent together. Existing documents stay valid unchanged, and no package outside the engine reads the three fields.
- **Command result.** A no-match produces the existing outcome `rolledBack` with both closure flags false, the exact pre-command state, and no transition, lifecycle or publication delta. Scenarios already classify that result as a semantic terminal outcome (`terminalExecution`), so a scenario ends at it.
- **Hosted Start.** [`BpmnProcessAdmissionFailureCode`](../../packages/temporal-adapter/client/src/process-client.ts) gains `startRolledBack`, returned before any Workflow is created, like `startCapacityEnvelopeExceeded`. The [lifecycle specification's public result contract](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#public-result-contract) is amended so that `rejected` also covers a Start whose semantic command rolls back. Product 2 shows the code as its own message.
- **Hosted User Task completion.** A completion Update whose command rolls back returns the semantic command result `rolledBack`, and the Workflow continues with the task still open.

## Representation and runtime ownership

The checked `exclusiveGateway` node takes an optional `defaultFlowId`, and the IL `choose` operation takes an optional `defaultOutput` and `defaultOrigin`. Lean keeps both constructors' arity and changes the field types to `Option`, so the many matches that bind the fields to wildcards are untouched. Absence means the source declares no default; lowering never invents a place or origin for it.

**Selection.** `selectConditionalOutput` and `prepareInternalConditional?` in Lean, and the default branch of `selectConditionalBranch` in the [control-flow runtime](../../packages/semantic-core/src/semantic-process-control-flow-runtime.ts), keep their signatures and meaning for a present default. A new family-owned leaf dispatches on the optional default:

- `some d` calls the existing function with `d`;
- `none` calls a no-flow selector. It returns the first true candidate, or the no-flow result when every candidate evaluates to `some false`, or the evaluation-failure result when evaluation fails.

The exception proofs then only take the `some` premise at their `choose` match, and no lemma about the existing functions changes.

**Closure.** The execution frontier, its interface and its stable predicate stay unchanged.

- The leaf's selector distinguishes three results: a selected flow, no flow, and evaluation failure.
- The dispatch sits in `chooseState?` and in the TypeScript Choose preparation and attempt path. No frontier arm is added. A no-flow Choice is disabled: `fire?` yields `none`, so it contributes neither an offer nor a preparation failure. Evaluation failure keeps today's behavior: in Lean `fire?` yields `none` and the Choice is disabled, and the TypeScript evaluator is total. `stuckChoice` requires every candidate to evaluate to `some false`, so a Choice parked by an evaluation failure is not stuck.
- The closure therefore stabilizes with that Choice's token parked at its input. The stable exit, which is the closure's commit point, then asks the leaf predicate `stuckChoice`: does the stable state hold a token at the input of a default-less Choice whose every candidate evaluates to `some false`?
- If so, the closure result gains the defaulted field `noFlowChoice := true`, `ScheduledClosureResult.failed` includes it, and the result mapping returns `rolledBack` with both flags false and the pre-admission state.
- TypeScript does the same at its stable exit in the [internal choice schedule](../../packages/semantic-core/src/internal-choice-schedule.ts), checking `stuckChoice` before its unused-directive and commit returns.

The loop's checks keep today's order: refusal; the stable frontier, which is now committed only when `stuckChoice` is false; the step bound; `preparationFailed`. A no-flow Choice reached at exactly the step limit therefore rolls back flag-free, because the stable exit precedes the bound. Admission refuses order-dependent internal choice, so a parked no-flow Choice's reads cannot change before the closure stabilizes.

`preparationFailed`, the refusal channel and the public command result gain nothing.

**Lean build account.** These interface edits land as one batch, so the fixtures rebuild once:

- the field types in `SemanticProcessContract` and `CheckedProcessContract`, whose import cones reach about 1,000 of 1,045 modules each;
- their JSON readers, `SemanticProcessJson/Program` and `SemanticProcessJson/CheckedProcess`.

The modules beyond that batch:

- **Hubs, body edits only.** `ProgramStructuralValidation` (closed world): its `choose` arm requires both default fields or neither, admits neither only under this profile, and checks the origin when present. `OperationControlPlaces` (kernel, fan-out 501) lists the outputs with `defaultOutput.toList`. The closed-world `CheckedGraphValidation` stays untouched, because its `exclusiveGateway` arms bind the default to a wildcard.
- **Selection and closure call sites.** `TransitionStates` (`chooseState?` dispatches through the leaf), `Transition` and the `InternalLocalControl*` modules; `InternalScheduledClosure`, whose stable exit and `ScheduledClosureResult` gain the defaulted `noFlowChoice`; `TransitionTrace` (the result mapping).
- **Consumers of the closure result.** These theorems conclude a committed result, or a closure that is not failed, from a stable run, and so gain the premise `stuckChoice = false`:
  - in `InternalScheduledClosure` itself;
  - in `Execution`, `ParallelScopeReachableInvariantTransport`, `ParallelScopeSchedulerReadinessProofs`, `ParallelScopeResumptionProofs`, `ParallelScopeCommandClosureProofs`, `ParallelScopeFinalRetirement`, `ParallelScopeFrontierTotalityProofs`, `ParallelScopeRetirementProgress`, `ParallelScopeCommandFuelProofs`, `SequentialScopeHistoryTransportProofs`, `CompensationEventSubProcessSnapshotTransitionTrace` and `UserTaskMetadataConformance`.

  Each site discharges the premise with one leaf lemma: `stuckChoice` is false for every Program without a default-less Choice, a decidable Program property that every other profile's `ProgramStructuralValidation` arm implies. `ParallelScopeRetirementProgress` carries a size exception and must not grow; a site that needs a line moves its adapted statement into the leaf. `ParallelScopeCommandFuelProofs` is an `AA-01` owner, and `AA-01`'s trigger stays unmet, because no residual execution or fuel guarantee is consumed or changed.
- **Admission.** `CheckedProcessAdmission`, `Lowering`, `ScopeReentryAdmission`, and the admissions of the profiles whose Choices keep a default (`StructuredCompositionAdmission`, `MixedTaskControlFlowAdmission`, `StructuredHumanWorkAdmission`). Those profiles require the default present, so their models and proofs keep today's meaning.
- **Proofs.** The proofs that destructure the default take it from that `some` premise: `StructuredComposition*Proofs`, `MixedTaskControlFlow*Proofs` and the cyclic conformance. `StructuredCompositionControlProofs`, `StructuredCompositionClosureProofs`, `StructuredCompositionDataProofs` and `MixedTaskControlFlowDataProofs` carry size exceptions and must not grow, so any lemma their adaptation needs goes into the leaf.

Rejected alternatives:

- **A new `chooseWithoutDefault` operation.** It adds an arm to every closed-world match of the IL, some forty modules, far more fan-out than two field types.
- **A synthetic default place feeding a failing operation.** It invents a control place with no BPMN origin and a new failing operation kind.
- **A no-flow result type for `selectConditionalOutput` itself.** It is an interface edit of a module whose cone is about 875 modules, and it rewrites the totality lemmas of the exception proofs.
- **Treating no-match as the existing ambiguous-choice rollback.** It turns a semantic outcome into an observation-free harness failure that the host reports as `BpmnSemanticClosureFailure`, whereas CIB keeps the instance and its open task.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The Choice's default stops being required at these loci, for this profile only:

- **Source.** The source projection, through [`projectExclusiveGateway`](../../packages/bpmn-source/src/simple-boolean-exclusive-gateway-source.ts)'s `variableArity` call from the [nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts). Every outgoing flow then needs a condition, and the source applies the effect-closure exclusion. The [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) has default reads at its fixed-topology, cyclic and inclusive checks. Each is either profile-guarded or keeps the default required for its profile.
- **Checked level.** In TypeScript, the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts). In Lean, `CheckedProcessAdmission.checkedExclusiveGatewayValid` and `ScopeReentryAdmission.checkedJoint?`.
- **Program level.** In TypeScript, the same module, the [Choice shape validator](../../packages/semantic-core/src/simple-boolean-choice-admission.ts), the [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), the [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts)'s Choose output list and the [profile probe](../../packages/semantic-core/src/semantic-process-profile.ts)'s `defaultOutput` read, which keeps the default required for its fixed profile. In Lean, `ProgramStructuralValidation`'s `choose` arm and `ScopeReentryAdmission.operationJoint?`.

Two loci keep the two-flow minimum unchanged:

- `hasSelectedArity` in the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), which counts two or more outgoing flows;
- `rootArityValid` in the [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts), which counts two or more Choice outputs.

A default-less Choice's outputs are its candidates, so both refuse a single conditional flow, as CIB's parser does.

The nearest wrong algorithms each have a separating witness below:

1. a default required at one locus, so that locus refuses the model;
2. a default made optional for every profile;
3. no-match taken as harness failure (`ambiguousInternalChoice`), or as a fallback to a candidate;
4. a rollback that keeps part of the command (the completed task, its patch, the Sub-Process completion or its output copy);
5. a host that fails the Workflow, or creates one for a rolled-back Start;
6. an effect-closure traversal that stops at a Sub-Process end, or a one-flow default-less Choice admitted.

## Stable rules

- `XND-ADMIT-01`: admission accepts exactly the required scope above under this profile. It refuses every exclusion and parser warning, and leaves every model admitted today, under every profile, with its admission.
- `XND-ROUTE-01`: a token arriving at a default-less Choice takes the first conditional flow, in XML declaration order, whose condition is true, as `XCA-ORDER-01` states for a defaulted one, whatever the flow ids and later true candidates.
- `XND-ROLLBACK-01`: when every condition of a default-less Choice is false, the command whose closure reached it has outcome `rolledBack`, both closure flags false, state exactly the pre-command state, and no transition, lifecycle or publication delta. This holds for a Start, which then creates no instance, and for a User Task completion, whose task stays open with its pre-command values. This rule adds a third restoration trigger to [`CLOSURE-ATOMIC-01`](INTERNAL-CLOSURE-ATOMICITY-REPAIR-SPEC.md#command-contract), whose command contract is amended to name it.
- `XND-HOST-01`: before any Workflow is created, `assessBpmnProcessAdmission` evaluates the Start's command in the semantic core, but only for a Program with a default-less Choice. A rollback returns `rejected` with `startRolledBack`. Every start path through that function is covered, `startBpmnProcess` and Product 2's prepared direct start among them. Message and schedule-registered starts also pass through it, but this profile admits no Message or Timer Start, so no Program reaching them has a default-less Choice. Programs without one keep today's Start path unchanged.
- `XND-HOST-02`: inside the Workflow, only a `CompleteUserTaskInstance` Update whose command rolls back takes the Terminal path. It returns the semantic result `rolledBack`, a retry of the same command recovers that result, publication is unchanged, and the Workflow stays open. A distinct later command may commit. Every other stimulus that rolls back keeps `BpmnSemanticClosureFailure`, as today: `StartProcess`, `FireTimer`, `CompleteEffect` and the rest. This amends `CLOSURE-ATOMIC-01`'s statement that it adds no semantic rollback receipt, for this one Update.

## Newly reachable waits and resumption

None. A rolled-back command leaves the waits of the state before it. After a rolled-back completion, the User Task is completable again with other values under a new command ID. That continuation is witnessed by the hosted test and the CIB probe only, because Lean `executeStimuli` and the TypeScript `advanceScenario` end a scenario at `rolledBack`.

## Separating witnesses

Two models, retained under [`scenarios/exclusive-choice-without-default/`](../../scenarios/exclusive-choice-without-default/README.md), each with a source overlay for its one mapped Service Task.

**Expense routing.** The Start supplies `category`, `priority`, `payout` and `claimant`.

- *Route expense* has three candidates and no default:
  1. `stringEquals(priority,"urgent")` to the User Task *Review urgently*;
  2. `stringEquals(category,"travel")` to *Review travel*;
  3. `stringEquals(category,"equipment")` to *Review equipment*.
- A Merge leads to *Pay out*, which has two candidates and no default: `stringEquals(payout,"bank")` to the mapped Service Task *Reimburse claimant* (input `claimant`), and `stringEquals(payout,"payroll")` to the User Task *Add to payroll*.
- A Merge then leads to one None End.
- The Service Task follows both Choices and never feeds one.

**Ticket triage.** The Start supplies `ticket`.

- The Sub-Process *Triage* declares `severity` (initially `unassessed`), which its User Task *Triage ticket* writes, and copies it out to the Process.
- *Route by severity* has two candidates and no default: `stringEquals(severity,"high")` to the User Task *Escalate*, and `stringEquals(severity,"low")` to the mapped Service Task *Auto-close* (input `ticket`).
- A Merge leads to one None End.
- The closure of *Triage ticket*'s completion runs through the Sub-Process completion to the Choice.

Journeys:

- **Urgent travel expense.** It opens *Review urgently*, although the second candidate is also true (`XND-ROUTE-01`). Completing it pays out by bank, arming *Reimburse claimant*. This separates last-true and any-true selection.
- **Catering expense.** The Start's command is `rolledBack`, and no instance exists (`XND-ROLLBACK-01`). This separates harness failure, a fallback to a candidate, and a Start that commits part of its closure.
- **Cash payout.** Completing *Review travel* is `rolledBack` at *Pay out*, and the task stays open (`XND-ROLLBACK-01`).
- **Medium ticket.** Completing *Triage ticket* with `severity = "medium"` is `rolledBack`. The task stays open, *Triage* keeps `severity = "unassessed"`, and the Process has no `severity` (`XND-ROLLBACK-01`). This separates a rollback that keeps the completion, its patch, the Sub-Process completion or its output copy.
- **High ticket** opens *Escalate*, and **low ticket** arms *Auto-close* (`XND-ROUTE-01`).

Source-order witnesses on *Route expense* (`XND-ROUTE-01`, `CIB-INT-0001`), which only the source lane carries:

- reversing the declarations of its three conditional flows, keeping their ids and the `<outgoing>` references, makes the urgent travel expense open *Review travel*;
- renaming the flow ids so their sort order opposes declaration order, and reordering `<outgoing>`, changes nothing.

Refused edits, each refused by the source reader:

- **Effect last in the Sub-Process.** In *Ticket triage*, a mapped Service Task added after *Triage ticket*, last in the *Triage* body, so its result's closure runs through the Sub-Process end to the Choice. This separates a traversal that stops at a Sub-Process end.
- **Effect before *Pay out*.** In *Expense routing*, a mapped Service Task inserted between the Merge and *Pay out*.
- **One conditional flow.** *Pay out* with its payroll flow and *Add to payroll* removed. This one is also refused by `hasSelectedArity` and `rootArityValid`.
- **An unconditioned non-default flow** added to *Route expense*.
- **The profile control.** Either model under a profile whose Choices keep a default (the mixed-task profile), at both levels in TypeScript and at the Program level in Lean. This is the per-locus control the arity account uses.

Admitted twin: *Pay out* given a default to the final Merge, while *Route expense* keeps none. This witnesses a model holding Choices with and without a default.

The source test asserts each effect-closure refused edit beside its control: the same edit with every Choice given a default, which today's reader admits. Each refusal can then come only from the new rule.

Hosted witness, one real-service Temporal test, which also gains a rolled-back Start inside the Workflow in the [closure failure classification test](../../packages/temporal-adapter/workflow/test/closure-failure-classification.test.ts):

- **Catering Start.** It returns `rejected` `startRolledBack`, and describing the Workflow ID finds none.
- **Triage Update with `medium`.** It returns `rolledBack`, and the Query shows *Triage ticket* open with the unchanged publication. A retry of the same command ID returns `rolledBack` again.
- **New command ID with `high`.** It commits and opens *Escalate*. The Worker is then replaced and history replays.
- **Rolled-back Start in the Workflow.** It keeps `BpmnSemanticClosureFailure`.

This separates a Workflow failure, a created Workflow, a lost or reinterpreted recovery record, and a Terminal path taken by a stimulus other than the completion.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `XND-ADMIT-01` | Both models admitted at both levels; each refused edit refused; the admitted mixture twin; the per-locus profile control; every retained model keeps its admission | Source, core, Lean conformance module (admission, Program-level profile control, unconditioned-flow edit), corpus | Require the default at one locus; drop it for every profile; stop the traversal at a Sub-Process end; admit one conditional flow |
| `XND-ROUTE-01` | Urgent travel selects the first of two true candidates; reversed declarations flip it and renamed ids change nothing; high and low tickets | Pipeline, core runtime test, source test, CIB probe | Select the last true candidate; order by flow id or `<outgoing>`; fall back to a candidate on no-match |
| `XND-ROLLBACK-01` | Catering Start, cash payout, medium triage | Pipeline, core runtime test, Lean conformance module and proof, CIB probe | Report harness failure; keep the completion, its patch, the Sub-Process completion or its output copy; commit a Start |
| `XND-HOST-01`, `XND-HOST-02` | The hosted witness | Temporal real-service test with replay; closure failure classification test | Fail the Workflow on the completion; create a Workflow for the rolled-back Start; lose the recovered result; take the Terminal path for a Start, Timer or effect result |

## Lean assurance lane

Lane shape: proved

Evidence: the dispatch is proved by [`selectChoiceOutput_none_of_allFalse`](../../BpmnSemantics/SemanticProcess/SimpleBooleanExpression.lean#selectChoiceOutput_none_of_allFalse) and command atomicity given the closure's no-flow report by the private `evaluateStimulusScheduled_noFlowChoice` in [`Execution`](../../BpmnSemantics/SemanticProcess/Execution.lean); that a reached no-match Choice makes the closure report it (the frontier exclusion, the stable-exit raise and its pass-through by `prependClosureStep`) holds by definition and is checked by the three rolled-back journeys, not proved; admission is checked.

Proved beside the definitions they govern, since the build fan-out guard refused a family leaf (see [Implementation notes](#implementation-notes)):

- in [`SimpleBooleanExpression`](../../BpmnSemantics/SemanticProcess/SimpleBooleanExpression.lean), the dispatch selects nothing when the default is absent and every candidate evaluates to `some false`, selects the first true candidate after only false ones, and agrees with `selectConditionalOutput` when the default is present; in [`TransitionStates`](../../BpmnSemantics/SemanticProcess/TransitionStates.lean), the step of such a Choice is disabled, so it contributes no successor;
- in [`Execution`](../../BpmnSemantics/SemanticProcess/Execution.lean), over the scheduled closure function: whenever the closure from an admitted state reports a no-flow Choice, after any number of steps, the command result is `rolledBack` with both flags false and `state = before`, and it publishes no transition or lifecycle;
- in [`InternalScheduledClosure`](../../BpmnSemantics/SemanticProcess/InternalScheduledClosure.lean), `stuckChoice` is false for every Program without a default-less Choice, the lemma each analysis's discharge applies.

Checked: an executable conformance module checks:

- both models' admission at both levels;
- the Program-level profile control and the unconditioned-flow edit; the effect-closure edits are reader-only;
- the outcome and state of the three rolled-back journeys.

The pipeline checks agreement with the core and Temporal.

## Temporal hosting and refinement preflight

- **Durable ingress.** The existing Start path and completion Update; nothing is added.
- **Wait, timer, effect, cancellation.** Unchanged. A rolled-back command arms and cancels nothing.
- **Lifecycle, `XND-HOST-01`.** `StartProcessStimulus` carries no time, and the Workflow runs the same `advanceScenario` with the same closure limit, so on one core build the Workflow reaches the client's result. A client and Worker on different core builds could disagree. The in-Workflow guard then fails the Workflow with `BpmnSemanticClosureFailure`, never a silent instance.
- **Lifecycle, `XND-HOST-02`.** The Workflow loop applies [`rolledBackClosureDiagnostic`](../../packages/semantic-core/src/scenario.ts) to every stimulus except `CompleteUserTaskInstance`. That Update's rolled-back result takes the existing Terminal path, as a rejected one does. The change must be line-neutral in the [Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts), which has 8 lines of headroom, or the classification moves into its own module first.
- **Projection.** A rolled-back completion publishes its command result and nothing else, the same as a rejected command.
- **Pipeline Temporal target.** Its [scenario admission](../../packages/temporal-adapter/testkit/src/scenario-admission.ts) maps a `startRolledBack` rejection of a scenario's Start to the scenario result the core produces for it: the Start's command observation with outcome `rolledBack`, and no state. It does not run the core itself. A rolled-back completion Update maps to the same terminal step the core produces.
- **Preserved relation.** Hosted committed state and publication equal the core's after every committed command. After a rolled-back command, both equal the core's state and publication before that command.
- **Risks.** Deduplication: a retry of the same command recovers the original `rolledBack`. Ordering and concurrency: unchanged, because commands are serialized in the one semantic loop. Replay: determinism follows from the core's purity.
- **Common mode.** The client and the Workflow share one core, so a defect in no-flow detection produces matching wrong answers on both. Lean and the CIB probe are the independent checks.
- **Smallest executable refinement witness.** The hosted witness above.

## Evidence and acceptance

Lanes:

- three answer-free scenarios (urgent travel, catering, medium triage) as registered pipeline cases, each with one seeded mutation;
- core runtime tests for the cash payout and the high and low tickets;
- the source test;
- the Lean conformance and proof modules;
- the hosted witness;
- the CIB probe, which asserts the first-true route, both `ENGINE-02004` rollbacks with their state, the completion after a failed attempt, the armed effects, and the parse refusal of a one-flow Choice;
- two corpus rows and the About disclosure.

Acceptance:

- Lean, core and pipeline agree on every scenario of the profile;
- the probe agrees;
- every retained model stays admitted;
- the hosted pipeline and the hosted witness pass at family closure.

Then `PC-CF-02`'s first-true, reverse-order and no-match clauses are evidenced for default-less root Choices of this profile, and the row stays open on its other clauses.

Assurance assessment, recorded in PLAN: `AA-11` and `AA-23` stay `not-met`, although the family edits `InternalScheduledClosure` and `internal-choice-schedule.ts`, which `AA-23` owns. The no-flow outcome is a BPMN-defined semantic outcome on its own channel. It leaves `preparationFailed`, the refusal channel and the outcome type unchanged, so it neither resolves nor prejudges the held `AA-11` and `AA-20` decision. If the implementation needs to touch `preparationFailed`, `AA-23` becomes `met-review`.

## Versioning consequences

The profile grows in place. Both schemas loosen without a format change, so every existing document, fixture and Program stays valid under the [pre-release wire policy](../../contracts/README.md#evolution-policy). The start-result failure code is additive in the one current representation, and every consumer switch over it gains its arm in the same change. No admitted model changes its Program, route or behavior, because every model with a default-less Choice is refused today.

### Owners this implementation grows

TypeScript owners, with their nonblank headroom below the 800-line review target as `what-binds` reported it on 2026-11-03:

- the [Exclusive Gateway source](../../packages/bpmn-source/src/simple-boolean-exclusive-gateway-source.ts) (689) and the [nested scope-data source reader](../../packages/bpmn-source/src/nested-scope-data-source.ts) (412), which gain the optional default and the effect-closure traversal;
- the [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) and the [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts);
- the [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) and the [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) (94), with their [checked-process](../../contracts/schemas/checked-process.schema.json) and [Semantic Process](../../contracts/schemas/semantic-process.schema.json) schemas;
- the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts) (187), the [Choice shape validator](../../packages/semantic-core/src/simple-boolean-choice-admission.ts), the [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), the [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) and the [profile probe](../../packages/semantic-core/src/semantic-process-profile.ts);
- the [control-flow runtime](../../packages/semantic-core/src/semantic-process-control-flow-runtime.ts) (629), the [internal choice schedule](../../packages/semantic-core/src/internal-choice-schedule.ts) (631) and the local-control preparation;
- the [process client](../../packages/temporal-adapter/client/src/process-client.ts) (437), the [Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) (8, line-neutral or extract first) and the testkit's [scenario admission](../../packages/temporal-adapter/testkit/src/scenario-admission.ts);
- Product 2's start-failure presentation, and the [About catalog](../../model-corpus/mvp-capabilities.ts).

Each owner stays below the review target; growth past it means an extraction, never an exception.

Guards the implementation must change or satisfy:

- [`contract-schema-coverage`](../../scripts/contract-schema-coverage.test.ts) and [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts);
- the [projected flow-element keys test](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) and the [mixed-task control-flow source test](../../packages/bpmn-source/test/mixed-task-control-flow-source.test.ts), the per-profile loop;
- the [closure failure classification test](../../packages/temporal-adapter/workflow/test/closure-failure-classification.test.ts);
- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [executable model corpus test](../../packages/differential/test/executable-model-corpus.test.ts), the [capability catalog disclosures test](../../scripts/capability-catalog-disclosures.test.ts) and the [document reviewability guard](../../scripts/document-reviewability.test.ts).

Registration:

- in [the register](../CIB-BPMN-RELATION-REGISTER.md): `CIB-INT-0003`, `CIB-AGR-0006`'s boundary and `CIB-CFG-0005`'s calibration source;
- the profile artifact and README;
- the [closure atomicity command contract](INTERNAL-CLOSURE-ATOMICITY-REPAIR-SPEC.md#command-contract) amendment;
- the [lifecycle specification's public result contract](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#public-result-contract);
- the exclusive gateway mechanism row of the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), and `PC-CF-02`'s evidence cell;
- scenarios, pipeline cases, the corpus, About and the CIB probe.

## Implementation notes

Implemented as proposed, with these deviations:

- **Rolled-back Start and cash payout off the pipeline.** A registered normative scenario must run through every pipeline target, and no hosted run can observe a Start that the client refuses before any Workflow exists (`XND-HOST-01`). The catering Start and the cash payout therefore run as [Lean-core differential fixtures](../../packages/differential/test/exclusive-choice-without-default-lean-core.integration-test.ts), and the client's refusal has its [own test](../../packages/temporal-adapter/client/test/start-rolled-back-client.test.ts). Two scenarios, urgent travel and medium triage, are pipeline cases.
- **A Start that bypasses the client.** Started directly in the Workflow, the catering Start is refused at deployment with the non-retryable `BpmnProcessAdmissionFailure`, before any closure runs; the [closure failure classification test](../../packages/temporal-adapter/workflow/test/closure-failure-classification.test.ts) asserts that refusal instead of a closure failure.
- **Conformance module.** It checks admission at both levels, the refused edits and the profile control; the no-match outcome is proved in [`Execution`](../../BpmnSemantics/SemanticProcess/Execution.lean), and Lean executes the journeys through the pipeline and the Lean-core test.
- **No family leaf module.** The proposal put the dispatch and the laws in a new family-owned leaf. The [fan-out guard](../../scripts/lean-fanout.test.ts) refused that shape: each new module opening a hub with `import all` joined that hub's recorded rebuild set, and those bounds had no headroom left. Raising them would be a bound change, so the definitions and laws sit in the modules that already hold the needed edges, and the family adds no library module:
  - `selectFirstTrueOutput`, `selectChoiceOutput`, `choiceCandidatesAllFalse` and their laws live in `SimpleBooleanExpression`, beside `selectConditionalOutput`;
  - `prepareInternalChoice?` and its laws live in `InternalLocalControlBranchSelection`, beside `prepareInternalConditional?` and its laws;
  - `chooseState_none_of_allFalse` lives in `TransitionStates`;
  - `stuckChoice` and `stuckChoice_eq_false_of_defaults` live in `InternalScheduledClosure`;
  - the command-level rollback law `evaluateStimulusScheduled_noFlowChoice` lives in `Execution`, beside the other command-boundary laws.

  The kernel-decided fixtures already open these owners, so none of them needed a new `import all`. Each analysis discharges the stuck-Choice premise where the analysis is consumed:
  - the structured composition one in its progress proofs;
  - the serial one in its runtime-guard proofs;
  - the parallel scope one in its resumption proofs;
  - the mixed task one in its closure proofs.

  The proposal's consumer list missed `StructuredCompositionProgressProofs`, `MixedTaskControlFlowProgressProofs`, `MixedTaskControlFlowClosureProofs` and `ParallelScopeCommandSuccessProofs`. Every size-excepted module keeps its line count.
- **Frontier exclusion checked, not proved.** The proofs stop at the step and at the command: `chooseState_none_of_allFalse` disables a no-flow Choice, and the command law covers every closure that reports one. The claim that the derived frontier then holds neither an offer nor a preparation failure for the parked Choice, so the closure reaches its stable exit, is checked by the journeys, not proved. Proving it would add a law to `InternalExecutionFrontier`, which this family leaves unchanged.
- **Reach of the effect-closure exclusion.** Measured at closure over this profile's own retained models: stripping every default from its 7 Choice-bearing models, the reader would refuse 3 (claim rework, complaint handling, invoice clearing), against 1 of the 46 selected CIB models. The exclusion is forced: the profile's mapped tasks are `asyncBefore`, so in CIB a no-match after their result is a job failure and an incident, which the profile does not admit.
- **Admitted but unwitnessed.** A default-less Choice reached through a Call Activity's return, or on a cyclic re-entry, is admitted; the core rolls such a command back flag-free with the state unchanged, but no Lean, hosted or CIB witness calibrates either path.
- **Product 2, accepted at closure.** The approved contract had Product 2 show `startRolledBack` as its own message. No Product 2 surface switches over the start failure code, so it reaches the generic start-failure presentation unchanged.
- **Maps.** The [`implementation-status-owner:TEMPORAL-HOSTING`](../TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md) map, at its word backstop, gains no line; the control-flow family entry links the hosted witness and the client refusal instead.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `39cdfd32` | `fork-turns-none` | `approve-with-required-edits` | `240c0da2` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `f439e526` | `fork-turns-none` | `approve-with-required-edits` | `85edfbdb` |
