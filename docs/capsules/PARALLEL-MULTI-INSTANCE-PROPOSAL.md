# Parallel Multi-Instance User Task proposal

## Status

Lifecycle: draft
Review: pending

## Question and bounded outcome

What is the smallest forward-compatible parallel Multi-Instance User Task account that adds genuine concurrent instance generation, deterministic collection aggregation, completion-condition cancellation, and durable hosting without reinterpreting the implemented sequential profile?

This proposal selects one standards-only profile. One private executable Process enters one collection-driven parallel Multi-Instance User Task, atomically generates all bounded inner User Task occurrences, and attaches one interrupting exact-`PT1S` Timer Boundary Event to the outer Activity. The normal route reaches one None End; the Timer route reaches one ordinary escalation User Task and then one None End.

The same profile admits `completionPolicy="all"` and `completionPolicy="first"` as exact Process-start string bindings. Its BPMN `completionCondition` is Simple Boolean v1 `stringEquals(completionPolicy,"first")`. The `all` schedule completes every inner task and publishes the complete output collection. The `first` schedule closes after the first accepted completion and terminates any remaining inner instances. It publishes no Process output collection while any result slot is incomplete; the one-item case publishes its complete one-item output because no slot remains incomplete.

The reviewed requirement ID is `BPMN-PARALLEL-MULTI-INSTANCE-01`. It remains `unsupported` while this proposal is unimplemented. The broad `BPMN-MECH-LOOP-01` family remains `unsupported` after this bounded slice closes.

## Normative account and selected resolutions

BPMN 2.0.2 Clauses 10.3.8 and 13.3.7 plus Tables 10.29 and 10.30 own the Multi-Instance wrapper, once-evaluated instance plan, parallel generation, runtime counters, per-instance input and output items, completion-condition evaluation, remaining-instance cancellation, aggregation, and outer completion. Clauses 10.5.5, 10.5.6, 13.3.2, and 13.5.3 plus Tables 10.91, 10.92, 10.101, and 10.122 own the exact interrupting Timer Boundary Event.

The normative CMOF and XSD declare `MultiInstanceLoopCharacteristics.isSequential` with default `false`, `behavior` with default `All`, and the exact `loopDataInputRef`, `loopDataOutputRef`, `inputDataItem`, `outputDataItem`, and `completionCondition` fields. This profile requires explicit lowercase `isSequential="false"`, exact case-sensitive `behavior="All"`, and an exact nonempty completion condition. It does not interpret omission as profile admission, and lowercase `behavior="all"` is schema-invalid and rejected.

BPMN requires collection cardinality to be evaluated once and parallel instances to be generated together. It evaluates `completionCondition` after each inner completion. A true result completes the outer Activity and cancels every remaining inner instance. The standard cautions that the output collection should not be accessible until all items are written.

This profile resolves the underspecified collection mechanics as follows:

- copy the input collection once, in declared array order, into an immutable outer-Activity snapshot;
- assign zero-based `loopCounter` values and generate one inner User Task occurrence for every snapshot index in one committed transition;
- place each accepted scalar result in its exact index slot, regardless of completion order;
- publish the complete Process output collection atomically only after every slot is filled;
- publish no Process output collection when the completion condition or Timer closes the outer Activity before every slot is filled;
- publish the complete collection when the completion condition becomes true on the transition that fills the final slot, including the one-item `first` case;
- treat empty input as immediate normal completion with an empty output collection and no stable controller, task, or Timer wait.

The direct no-partial-output rule reconciles early completion with the standard's collection-accessibility caution. It does not claim that every BPMN implementation must suppress partial output. A future profile selecting a different output contract requires a new reviewed account and profile identity.

OMG issues [BPMN21-391](https://issues.omg.org/issues/BPMN21-391) and [BPMN21-404](https://issues.omg.org/issues/BPMN21-404) leave broader Complex behavior and cancellation terminology open. This profile excludes Complex behavior and compensation. It selects Clause 13.3.7's direct remaining-inner-instance termination for its bounded completion condition without generalizing that choice to other cancellation mechanisms.

## Required, optional, and excluded

**Required:** one private executable Process; one collection-driven parallel Multi-Instance User Task; the exact data-association graph inherited from the sequential profile; explicit Simple Boolean v1 at `Definitions.expressionLanguage`; exact `completionPolicy` start binding; explicit `isSequential="false"` and `behavior="All"`; one exact completion condition; one interrupting exact-`PT1S` outer Timer; one normal End; and one Timer-route escalation User Task plus End.

**Optional:** zero through sixteen input items within the existing per-item and canonical collection byte bounds; arbitrary completion order expressed by the order of accepted exact task-completion stimuli; Worker replacement; one pre-arming Continue-As-New boundary if the new capacity owner proves it safe; and either admitted completion-policy value.

**Excluded:** sequential generation; another Activity type; cardinality expressions; arbitrary collections, mappings, transformations, or assignments; output publication on incomplete closure; any `behavior` value except exact `All`; `ComplexBehaviorDefinition`; completion policies beyond exact `all` and `first`; expression languages beyond Simple Boolean v1; multiple or non-interrupting boundary Events; repetition; nested or repeated Multi-Instance; compensation; Transactions; CIB Multi-Instance compatibility; host-priority semantics; Product 2 UI work; and general BPMN Process Execution Conformance.

## Exact admitted source and profile contract

The profile ID is `bpmn-2.0.2-parallel-multi-instance-user-task-draft`. It reuses the sequential profile's exact two `ItemDefinition` values, two collection `DataObject` values, two `DataObjectReference` values, `InputOutputSpecification`, reciprocal sets, scalar item references, and four direct associations. Every reference resolves by exact ID and every association has no transformation or assignment.

The `Definitions.expressionLanguage` is exactly `urn:bpmn-lean:expression:simple-boolean:v1`. The `completionCondition` is one BPMN `tFormalExpression`, has no individual language override or foreign child, and its decoded body is exactly `stringEquals(completionPolicy,"first")`. The start input has exactly one `completionPolicy` string binding whose value is `all` or `first`, in addition to the existing input collection binding.

The new source projection belongs in a new parallel-specific owner rather than growing [the sequential source owner](../../packages/bpmn-source/src/sequential-multi-instance-source.ts). Source admission validates the complete role graph and exact attributes before lowering. Lowering receives only checked project-owned values and never raw moddle values.

## Public contract

The public observation keeps existing Process bindings, open User Task occurrences, Activity occurrences, attached Timer wait, E1 committed transitions, and E2 FlowNode occurrences. It reuses `StateObservation.openMultiInstances` as the single optional Multi-Instance observation field and broadens that field's entry union from `OpenSequentialMultiInstance` to `OpenSequentialMultiInstance | OpenParallelMultiInstance`. The new arm has exact discriminator `mode: "parallel"`. A program declaring either admitted Multi-Instance operation emits the field in every state, including an empty array before entry and after either closing route. Programs declaring neither operation continue to omit the field, so existing profile bytes and every sequential entry remain unchanged.

`OpenParallelMultiInstance` retains the existing count fields and `activeIterations` shape. Every active iteration contains its `loopCounter`, `taskId`, exact scalar `taskInput`, and exact `completionBindingName`; parallel cardinality changes only the number of entries. The record publishes neither the immutable input snapshot nor incomplete result slots.

At every stable open state:

```text
numberOfInstances = plannedInstanceCount
numberOfInstances
  = numberOfActiveInstances
  + numberOfCompletedInstances
  + numberOfTerminatedInstances
pendingItemCount = 0
numberOfTerminatedInstances = 0
```

Early completion and Timer interruption are atomic closure transitions. No stable post-cancellation controller exists, so terminated siblings are transition facts rather than a retained open-state progress record. E2 closure evidence must nevertheless identify each live inner task as terminated rather than completed.

Closure publishes `reviewOutputs` in input-index order exactly when every planned result slot is filled. A completion condition that closes with at least one incomplete slot and every Timer closure leave that Process binding absent. Duplicate item values preserve multiplicity and distinct index identity. Public order never exposes host callback order as BPMN meaning.

## Checked source, Semantic Process IL, and runtime state

The checked graph adds one parallel-specific Multi-Instance definition carrying the validated direct data graph, exact Simple Boolean expression, and one outer boundary Timer reference. The Semantic Process program adds one profile-gated entry operation and one exact child-completion operation. Neither operation accepts source XML, raw moddle objects, or host identifiers.

Runtime state adds optional `parallelMultiInstanceControllers`. A controller owns the outer `ActivityOccurrenceId`, immutable ordered input snapshot, and one slot per index. A pending slot contains its exact `UserTaskInstanceId`; a completed slot contains the same identity and its scalar output. Planned and generated counts equal slot count, while active and completed counts are derived from slot variants.

`ActivityOccurrence.body` gains one cardinality-explicit parallel User Task body variant containing the canonical nonempty list of live child task identities. The existing singular User Task body keeps its meaning. This is an additive representation for genuinely different cardinality, not a Boolean flag or reinterpretation of old bytes.

Program-indexed well-formedness equates the controller's pending task identities, the Activity body's live child identities, the runtime User Task waits, and the single attached Timer. Completed slots are not live waits. Missing, duplicate, extra, reordered, or cross-controller identities fail before semantic evaluation or Workflow scheduling.

Parallel entry snapshots the collection, mints every child identity atomically, advances the User Task activation counter to the final high-water mark, and leaves one stable outer Activity and Timer. The issuing proof must establish pairwise freshness and uniqueness for the complete batch. It may reuse the Activity issuing discipline but may not claim the still-open general non-reissue theorem for every runtime identity family.

An accepted task completion replaces exactly one pending slot, removes exactly that task wait and body member, and evaluates the completion condition against committed Process bindings. The transition then derives whether every slot is filled. If every slot is filled, it publishes the complete ordered output and closes normally, whether the condition is false or true. Otherwise false preserves the controller and Timer, while true closes immediately, withdraws every remaining sibling wait and the Timer, and publishes no output.

Timer firing withdraws the controller, every remaining child task, the outer Activity, and the Timer, then routes only the escalation flow. Stale task or Timer identity, wrong outer activation, completed-slot reuse, binding substitution, and any incomplete ownership join refuse without state mutation.

## Stable semantic rules

- `PMI-ENTER-01`: evaluate and snapshot cardinality once, then atomically generate one distinct child task per ordered item.
- `PMI-PROGRESS-01`: stable open progress is derived from the exact indexed slot partition and complete live-identity join.
- `PMI-COMPLETE-01`: a false completion condition commits one exact indexed result and preserves all remaining siblings and the lifetime Timer.
- `PMI-FINISH-01`: filling the final slot publishes the complete index-ordered output collection atomically and follows normal control.
- `PMI-EARLY-01`: a true completion condition with at least one incomplete sibling terminates every remaining sibling, withdraws the lifetime Timer, follows normal control, and publishes no output collection; if no sibling remains, `PMI-FINISH-01` publishes the complete collection.
- `PMI-TIMER-01`: the exact outer Timer terminates every remaining sibling and follows only the boundary route with no output collection.
- `PMI-REFUSE-01`: identity, ownership, slot-state, expression-context, or binding mismatch produces no committed change.
- `PMI-ORDER-01`: all-complete outcomes are invariant under permutations of distinct accepted child-completion stimuli, while first-complete outcome selection follows explicit accepted stimulus order.

## Lean assurance lane

The Lean lane is **proved** for the bounded transition family. It defines the parallel controller, indexed-slot partition, batch-entry relation, child-completion relation, Timer-interruption relation, and evaluator clauses independently of TypeScript.

Required theorems cover entry well-formedness; task-identity freshness and pairwise uniqueness; progress accounting; exact-slot preservation; all-complete commutation for two distinct pending tasks; index-ordered final aggregation; early-completion sibling withdrawal and output absence; Timer regional withdrawal and output absence; stale/duplicate refusal; evaluator soundness for every new relation arm; and preservation of the applicable runtime-state invariant.

The bounded runtime-state successors for `completionPolicy="first"` may be equal after atomic controller removal, so no state-inequality theorem is claimed. The checked non-law is over the exact committed command and E1/E2 publication trace: completing A before B records A completed and B terminated, while completing B before A records B completed and A terminated. No proof may promote host scheduling to a priority rule.

If these proofs do not fit below the applicable source-owner bound, split modules by responsibility. Do not compress the account or create a line-count exception. The first build of any module adding kernel-decided fixtures remains with the root under the repository memory bound.

## CIB Seven relationship boundary

This is a vendor-neutral BPMN profile. No CIB Multi-Instance execution target, expression meaning, counter choice, output behavior, or compatibility claim is selected.

Existing `CIB-AGR-0011`, `CIB-INT-0002`, and `CIB-LIM-0001` are sequential-only facts and do not support this parallel or completion-condition account. Existing base User Task and host-identity relationships remain usable only for their already reviewed boundary. A later CIB parallel profile requires a separately classified public-service probe and register entry.

## Temporal hosting and refinement preflight

Durable ingress remains Process Start plus the content-bound User Task completion Update. An accepted Update handler synchronously enqueues its complete semantic stimulus before its first await. One Workflow loop removes queued stimuli FIFO and is the sole state mutator. Parallel child readiness therefore adds no new Temporal primitive, Signal, Activity, Child Workflow, external cancellation, or I/O inside Workflow code.

The semantic schedule is the durable order in which accepted complete stimuli enter that FIFO queue. Callers choose neither physical arrival order nor host priority. Replay reproduces the accepted order. Under `all`, completing A then B or B then A reaches the same ordered output. Under `first`, the first reduced completion closes the Process; a later queued completion becomes a semantic stale refusal, while a request arriving after terminal fencing receives the existing transport `processClosed` outcome.

A completion Update and the outer Timer callback that become ready in one Workflow activation have no portable winner. The adapter fails closed with distinct nonretryable identity `BpmnParallelMultiInstanceSchedulerUnavailable` before either stimulus reaches the semantic core, advances neither semantic arm, and durably resolves the accepted in-flight Update rather than stranding its caller. This reuses the reviewed activation-tag and drain-barrier mechanism but independently retains the direct-VM `doUpdate` plus timer-fire premise, the pinned `hasSignals` source lock, and the real-service accepted-Update resolution witness. Separate-activation task-first and Timer-first inputs remain ordinary explicit semantic schedules. Multiple completion Updates without a coalesced Timer retain the accepted FIFO order above.

The host readiness descriptor joins one outer Activity, one controller, every pending child task and body member, and one Timer. It rejects missing, duplicate, extra, reordered, or substituted associations before scheduling. The existing managed deadline owner arms the outer Timer once from committed entry time. Task completion does not cancel or recreate it. Final or early completion cancels it; Timer firing removes every remaining child before exposing the escalation wait.

The complete controller, snapshot, slots, counters, task identities, Timer identity, deadline, Process bindings, profile, and program identity are committed semantic state. A continuation that drops, duplicates, reorders, or substitutes any fact is invalid before Workflow evaluation.

The existing sixteen-item, 512-byte item, and 8,192-byte canonical collection limits are candidate admission limits, not a capacity conclusion. Before profile registration, a private Temporal testkit probe must run the real production serializers and maximal parallel activation topology. Its independently measured Event, history-envelope, and activation-payload bounds must fit the project limits with the existing reserves. The selected limit `N` is the largest independently measured safe count at most sixteen. Exact `N` fit and `N + 1` refusal must be proved without state mutation on refusal; exact sixteen fit and seventeen refusal are the special case where `N = 16`.

The executable refinement witnesses cover zero items; one item under `first`; three items completed out of index order under `all`; first completion under `first`; Timer interruption with multiple active children; task-first and Timer-first schedules; coalesced readiness with the selected typed failure and durable Update resolution; Worker replacement; accepted-result recovery; any permitted pre-arming Continue-As-New; terminal receipt equality; complete E1/E2 publication; and replay of every Run.

Capacity evidence covers natural completion, Timer interruption, and the largest one-transition early-completion E1/E2 cancellation batch at `N`. If the sixteen-item parallel state does not fit, the profile limit is lowered to the selected `N` before registration. The representation is unchanged, so that bounded admission correction does not narrow already accepted model meaning because no profile has yet been published.

Temporal Event History, Workflow ID, Run ID, Update protocol details, and Continue-As-New boundaries remain hosting evidence only. Public progress, output, cancellation, and completion must be derived from committed semantic state.

## Evidence strategy

The first Red is an exact parallel source rejected by current admission. Removing only the Multi-Instance characteristics yields an ordinary single User Task and cannot produce the required simultaneous task set. Further Reds distinguish all-complete order, first-complete cancellation, Timer-wide cancellation, empty input, batch identity freshness, stale identity refusal, and no partial output.

Independent evidence includes normative and machine-readable source derivation; separately authored checked-graph expectations; Lean relations, laws, non-law, and evaluator soundness; an independently written TypeScript reducer; answer-free differential scenarios; E1/E2 occurrence publication; Temporal component, live-service, capacity, mutation, recovery, and replay evidence; and one credible project-owned whole model registered atomically with the supported profile.

Required mutations use schema-invalid lowercase `behavior="all"`, reverse completion order, aggregate by completion order, suppress the complete one-item `first` output, expose a partial output, change existing sequential observation bytes, drop an active iteration's task input or completion binding, retain a sibling after early completion, retain a sibling after Timer firing, reuse one child identity, mint a duplicate batch identity, advance the counter by only one, substitute the outer activation, reset the lifetime deadline, arm one Timer per child, drop a controller at continuation, accept a completed slot twice, advance either arm during coalesced readiness, reuse another scheduler-failure identity, strand the accepted coalesced Update, or let host iteration order choose a semantic winner.

## Versioning consequences

The change is additive: one profile artifact, source projection, checked definition, IL operations, optional runtime controller field, optional Activity body variant, optional observation field, schemas, Lean and TypeScript cases, adapter descriptor, capacity owner, scenarios, corpus entry, capability row, and documentation maps. Old profile artifacts, programs, states, observations, receipts, and retained histories remain byte-identical with the new fields absent.

Executable constraints include [source hygiene](../../scripts/source-hygiene.test.ts), [schema coverage](../../scripts/contract-schema-coverage.test.ts), [semantic closure documentation](../../scripts/semantic-closure-documentation.test.ts), [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), [Workflow occurrence authority](../../scripts/workflow-occurrence-semantic-authority.test.ts), [Activity occurrence writer census](../../scripts/activity-occurrence-writer-census.test.ts), [runtime collection removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [Activity body turnover](../../packages/semantic-core/test/activity-body-turnover.test.ts), and [Workflow Timer capacity](../../packages/temporal-adapter/workflow/test/workflow-timer-capacity.test.ts).

### Owners this implementation grows

Headroom is measured in nonblank lines before the 600-line review target. Parallel-specific logic uses new responsibility-owned modules rather than consuming these bounds indiscriminately.

| Owner | Current headroom |
|---|---:|
| [Compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts) | 361 |
| [Source preservation capability](../../packages/bpmn-source/src/preservation-capability.ts) | 462 |
| [Checked-graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) | 260 |
| [Semantic Process lowering router](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 43 |
| [Checked Process contract](../../packages/semantic-core/src/checked-process-contract.ts) | 339 |
| [Checked Process profile shape](../../packages/semantic-core/src/checked-process-profile-shape.ts) | 345 |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 180 |
| [Semantic program profile shape](../../packages/semantic-core/src/semantic-program-profile-shape.ts) | 333 |
| [Public observation contract](../../packages/semantic-core/src/contract.ts) | 228 |
| [Scenario projection root](../../packages/semantic-core/src/scenario.ts) | 65 |
| [Semantic profile catalog](../../packages/semantic-core/src/semantic-profile-catalog.ts) | 537 |
| [Semantic profile observations](../../packages/semantic-core/src/semantic-profile-observations.ts) | 560 |
| [Semantic profile value domain](../../packages/semantic-core/src/semantic-profile-value-domain.ts) | 388 |
| [Activity occurrence owner](../../packages/semantic-core/src/activity-occurrence.ts) | 406 |
| [TypeScript runtime-state owner](../../packages/semantic-core/src/semantic-process-state.ts) | 188 |
| [Command admission root](../../packages/semantic-core/src/semantic-command-admission.ts) | 277 |
| [Program admission root](../../packages/semantic-core/src/semantic-process-admission.ts) | 248 |
| [Program graph admission root](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 67 |
| [Operation admission root](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 115 |
| [Triggered-start root](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 431 |
| [Semantic runtime composition root](../../packages/semantic-core/src/semantic-process-runtime.ts) | 24 |
| [Runtime well-formedness composition root](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 36 |
| [Internal transition footprint](../../packages/semantic-core/src/internal-transition-footprint.ts) | 174 |
| [Internal wait census](../../packages/semantic-core/src/internal-transition-wait-census.ts) | 501 |
| [Flow-node boundary-start projection](../../packages/semantic-core/src/flow-node-occurrence-boundary-starts.ts) | 369 |
| [Flow-node lifecycle projection](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) | 28 |
| [Flow-node open-set projection](../../packages/semantic-core/src/flow-node-occurrence-open-set.ts) | 27 |
| [Flow-node publication completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts) | 154 |
| [External flow-node publication completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) | 67 |
| [Lean Activity occurrence owner](../../BpmnSemantics/SemanticProcess/ActivityOccurrence.lean) | 294 |
| [Lean runtime-state owner](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 56 |
| [Lean contract owner](../../BpmnSemantics/SemanticProcessContract.lean) | 56 |
| [Temporal host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) | 385 |
| [Temporal protocol contract](../../packages/temporal-adapter/protocol/src/contracts.ts) | 387 |
| [Temporal lifecycle results](../../packages/temporal-adapter/protocol/src/lifecycle-results.ts) | 313 |
| [Flow-node publication program validation](../../packages/temporal-adapter/protocol/src/flow-node-occurrence-publication-program-validation.ts) | 254 |
| [Semantic publication validation](../../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts) | 12 |
| [Workflow continuation contract](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) | 120 |
| [Managed deadline scheduler](../../packages/temporal-adapter/workflow/src/bounded-deadline-scheduler.ts) | 269 |
| [Workflow host readiness](../../packages/temporal-adapter/workflow/src/workflow-host-readiness.ts) | 351 |
| [Workflow composition root](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 32 |

This inventory is the union of existing non-family-specific production roots reached by the sequential Multi-Instance operation, `openMultiInstances`, and the inherited managed deadline, plus the additional public scenario and lifecycle-result consumers. Existing sequential-specific owners remain byte-identical; parallel-specific behavior uses new sibling modules. Before any root with at most 67 lines of measured headroom grows, its family logic moves behind a responsibility-owned helper and the root retains only its exhaustive discriminator, dispatch, and join. This condition currently covers source lowering, scenario projection, program graph admission, semantic runtime, runtime well-formedness, flow-node lifecycle, flow-node open-set, external publication completeness, semantic publication validation, and Workflow composition. Lean additions split by contract, controller, transition, and law responsibility rather than compressing existing owners or claiming a line-count exception. A newly discovered production producer or consumer not listed here is a proposal-reopen condition before that path changes.

Concrete wire owners are [checked Process schema](../../contracts/schemas/checked-process.schema.json), [Semantic Process schema](../../contracts/schemas/semantic-process.schema.json), [scenario schema](../../contracts/schemas/scenario.schema.json), and [semantic publication schema](../../contracts/schemas/semantic-publication.schema.json). Material existing oracles that grow or receive parallel-specific siblings are [source admission](../../packages/bpmn-source/test/sequential-multi-instance-source.test.ts), [public observation wire](../../packages/semantic-core/test/sequential-multi-instance-observation-contract.test.ts), [flow-node publication completeness](../../packages/semantic-core/test/flow-node-occurrence-publication-completeness.test.ts), [protocol validation](../../packages/temporal-adapter/protocol/test/sequential-multi-instance-publication-validation.test.ts), [continuation state](../../packages/temporal-adapter/testkit/test/workflow-continuation-state.test.ts), [deadline premise](../../packages/temporal-adapter/testkit/test/sequential-multi-instance-deadline-witness.ts), [capacity topology](../../packages/temporal-adapter/testkit/test/sequential-multi-instance-history-capacity-topologies.ts), [Activity writer census](../../scripts/activity-occurrence-writer-census.test.ts), [runtime collection removal](../../scripts/runtime-collection-removal-completeness.test.ts), [schema artifacts](../../scripts/contract-artifacts.test.ts), and [schema coverage](../../scripts/contract-schema-coverage.test.ts).

## Epistemic closure and reopen conditions

Established by proposal are the applicable normative clauses and artifacts, the exact source and profile boundary, direct-index aggregation, no-partial-output choice, explicit external ordering account, runtime ownership design, proved-lane obligation, CIB non-selection, and Temporal preflight. No implementation or support claim follows until the evidence matrix and governed reviews close.

The nearest unsupported claim is parallel Multi-Instance for another Activity, another data shape, a different completion condition, partial output, Complex behavior, nesting, or CIB compatibility. The principal common-mode risk is that source, Lean, TypeScript, and Temporal share a mistaken indexed-controller account. Normative derivation, separately authored graph expectations, permutation and cancellation mutations, and host-capacity measurement constrain but do not eliminate it.

The nearest realistic counterexample completes index 2 first, publishes that result as output position 0, then satisfies the early completion condition while leaving index 0's task live and the outer Timer armed. Slot identity, no-partial-output, regional withdrawal, E2 termination, terminal observation, and replay must all reject that outcome.

Reopen before changing the Activity body, collection/value type, data associations, completion expression or output policy, Timer topology, capacity limit after publication, public slot exposure, CIB target, host scheduling contract, nested controller representation, compensation, or any field whose change would reinterpret an admitted profile or retained history.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `c5ad6f3074ebe48134c67672923c654b95beb146` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
