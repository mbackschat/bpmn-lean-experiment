# Parallel Multi-Instance User Task proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and bounded outcome

The owner approval recorded at `095ee3f7` was first reopened on 2026-08-26 before implementation because the first Lean lane found closed-sum production consumers omitted from the reviewed owner inventory. Review target `dc21b7ce67fbaaef80a1682a15f05ce4d673a32f` returned `approve-with-required-edits`, correction audit `175cb04a3f002c71d0241fd66de07adaf7cab078` closed all findings, and implementation began under the corrected selection.

Implementation paused for a second inventory review after integration exposed two facts the reviewed selection got wrong. First, the parallel source reader warranted a separate responsibility owner to avoid an owner-approved exception to the then-current 600-nonblank-line review target without modifying the closed sequential owners. Second, TypeScript and Lean scope cancellation and Call Activity return must withdraw a matching parallel controller by the same removed Activity or called-instance criterion that already withdraws its record and waits. The source split was applied before its owner-inventory consequence was recognized and gained no authorization from that edit. Neither correction changes the selected semantic account, public contract, exclusions, or evidence strategy. The second cold review and same-thread audit approved this corrected selection, authorizing the new source owner and the four withdrawal branches under the lifecycle above.

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

Standalone Semantic Process Program admission preserves checked-source node uniqueness as an exhaustive family-tagged wait-declaration invariant. The parallel entry declares its User Task and lifetime Timer identities, and no second operation may declare either identity in the same family even when no wait is live. Equal identifier text remains admissible across different wait families. Lean and the independently structured TypeScript Program validator enforce the same contract, while their separate runtime declarer censuses remain bound to it by executable equality or admission witnesses.

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

### Required controller-cleanup prerequisite

Before Parallel Multi-Instance implementation, a separate correction must make existing sequential controller withdrawal complete in [TypeScript scope cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts), [TypeScript called-process removal](../../packages/semantic-core/src/semantic-process-call-runtime.ts), [Lean scope cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean), and [Lean Call Activity removal](../../BpmnSemantics/SemanticProcess/CallActivity.lean), and must correct the optional-field census in [runtime collection removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts). This prerequisite closes the already-open sequential controller-cleanup change without adding parallel behavior. All four runtime owners discriminate over the controller representation and require parallel withdrawal branches using the same removed Activity or called-instance criterion as their existing sequential branches. Each route and language has a separating witness that rejects a stranded parallel controller after its Activity region or called Process instance has been removed, and the optional-field mutation oracle independently detects either omitted TypeScript filter.

The prerequisite is closed at correction target `b6547b23876bbe8ec0092a16260a42f2ada16226`. Its context-cold combined checkpoint/closure review targeted `818301ff9b75b881bbd8f35b9fa2c8a33c4440d7` with `fork-turns-none`, returned `approve-with-required-edits`, and the same reviewer approved the correction with no remaining finding. The exact correction target passed `test:pre-push:verify` with `dirty:false`, 54 cases, 65 replay histories, and zero failures. This receipt closes only the controller-cleanup prerequisite; the Parallel Multi-Instance semantic checkpoint is recorded below and closure remains unreached.

### Owners this implementation grows

Headroom is measured in nonblank lines before the 800-line review target. Parallel-specific logic uses new responsibility-owned modules rather than consuming these bounds indiscriminately.

| Owner | Current headroom |
|---|---:|
| [Compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts) | 541 |
| [Source preservation capability](../../packages/bpmn-source/src/preservation-capability.ts) | 661 |
| [Checked Process admission](../../packages/bpmn-source/src/checked-process-admission.ts) | 239 |
| [Checked-graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) | 450 |
| [Semantic Process lowering router](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 236 |
| [Checked Process contract](../../packages/semantic-core/src/checked-process-contract.ts) | 521 |
| [Checked Process profile shape](../../packages/semantic-core/src/checked-process-profile-shape.ts) | 537 |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 349 |
| [Semantic program profile shape](../../packages/semantic-core/src/semantic-program-profile-shape.ts) | 523 |
| [Public observation contract](../../packages/semantic-core/src/contract.ts) | 411 |
| [Scenario projection root](../../packages/semantic-core/src/scenario.ts) | 265 |
| [Semantic profile catalog](../../packages/semantic-core/src/semantic-profile-catalog.ts) | 735 |
| [Semantic profile observations](../../packages/semantic-core/src/semantic-profile-observations.ts) | 759 |
| [Semantic profile value domain](../../packages/semantic-core/src/semantic-profile-value-domain.ts) | 578 |
| [Activity occurrence owner](../../packages/semantic-core/src/activity-occurrence.ts) | 587 |
| [TypeScript runtime-state owner](../../packages/semantic-core/src/semantic-process-state.ts) | 385 |
| [TypeScript scope cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 634 |
| [TypeScript called-process removal](../../packages/semantic-core/src/semantic-process-call-runtime.ts) | 435 |
| [Runtime-state identity bound](../../packages/semantic-core/src/runtime-state-identity-bound.ts) | 769 |
| [Command admission root](../../packages/semantic-core/src/semantic-command-admission.ts) | 446 |
| [Program admission root](../../packages/semantic-core/src/semantic-process-admission.ts) | 446 |
| [Program graph admission root](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 218 |
| [Program graph policy](../../packages/semantic-core/src/semantic-process-graph-policy.ts) | 724 |
| [Operation admission root](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 300 |
| [Triggered-start root](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 628 |
| [Semantic runtime composition root](../../packages/semantic-core/src/semantic-process-runtime.ts) | 211 |
| [Runtime well-formedness composition root](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 220 |
| [Internal transition footprint](../../packages/semantic-core/src/internal-transition-footprint.ts) | 372 |
| [Internal wait census](../../packages/semantic-core/src/internal-transition-wait-census.ts) | 654 |
| [Flow-node boundary-start projection](../../packages/semantic-core/src/flow-node-occurrence-boundary-starts.ts) | 563 |
| [Flow-node lifecycle projection](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) | 205 |
| [Flow-node open-set projection](../../packages/semantic-core/src/flow-node-occurrence-open-set.ts) | 201 |
| [Flow-node publication completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts) | 322 |
| [External flow-node publication completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) | 224 |
| [Semantic-core public exports](../../packages/semantic-core/src/index.ts) | 721 |
| [Lean Activity occurrence owner](../../BpmnSemantics/SemanticProcess/ActivityOccurrence.lean) | 482 |
| [Lean runtime-state owner](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 252 |
| [Lean contract owner](../../BpmnSemantics/SemanticProcessContract.lean) | 223 |
| [Lean scenario contract](../../BpmnSemantics/Scenario.lean) | 502 |
| [Lean checked-graph validation](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean) | 654 |
| [Lean checked Process admission](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) | 450 |
| [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 230 |
| [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 209 |
| [Lean program structural validation](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) | 270 |
| [Lean graph validation](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) | 71 |
| [Lean checked Process JSON](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean) | 467 |
| [Lean program JSON](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 237 |
| [Lean publication JSON](../../BpmnSemantics/SemanticProcessJson/Publication.lean) | 629 |
| [Lean transition root](../../BpmnSemantics/SemanticProcess/Transition.lean) | 387 |
| [Lean command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) | 512 |
| [Lean execution laws](../../BpmnSemantics/SemanticProcess/Execution.lean) | 401 |
| [Lean boundary-start projection](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceBoundaryStarts.lean) | 528 |
| [Lean wait-program validity](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceWaitProgramValidity.lean) | 232 |
| [Lean flow-node lifecycle](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean) | 200 |
| [Lean transition trace](../../BpmnSemantics/SemanticProcess/TransitionTrace.lean) | 245 |
| [Lean scenario projection](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 304 |
| [Lean JSON composition root](../../BpmnSemantics/SemanticProcessJsonMain.lean) | 313 |
| [Lean runtime well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 54 |
| [Lean well-formedness initialization](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormedInitialization.lean) | 709 |
| [Lean scope cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean) | 646 |
| [Lean Call Activity removal](../../BpmnSemantics/SemanticProcess/CallActivity.lean) | 258 |
| [Lean canonical JSON string collection measure](../../BpmnSemantics/SemanticProcess/CanonicalJsonStringCollection.lean) | 755 |
| [Lean sequential Multi-Instance compatibility](../../BpmnSemantics/SemanticProcess/SequentialMultiInstance.lean) | 667 |
| [Lean Activity body turnover](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnover.lean) | 217 |
| [Lean Activity turnover preservation](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnoverPreservation.lean) | 699 |
| [Lean commutation state frames](../../BpmnSemantics/SemanticProcess/InternalCommutationStateFrames.lean) | 177 |
| [Lean commutation runtime preservation](../../BpmnSemantics/SemanticProcess/InternalCommutationRuntimePreservation.lean) | 52 |
| [Lean commutation open projection](../../BpmnSemantics/SemanticProcess/InternalCommutationOpenProjection.lean) | 211 |
| [Lean commutation publication](../../BpmnSemantics/SemanticProcess/InternalCommutationPublication.lean) | 488 |
| [Lean semantic umbrella](../../BpmnSemantics/SemanticProcess.lean) | 759 |
| [Lean conformance umbrella](../../BpmnSemantics/ConformanceMain.lean) | 775 |
| [Temporal host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) | 567 |
| [Temporal protocol contract](../../packages/temporal-adapter/protocol/src/contracts.ts) | 583 |
| [Flow-node publication program validation](../../packages/temporal-adapter/protocol/src/flow-node-occurrence-publication-program-validation.ts) | 438 |
| [Semantic publication validation](../../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts) | 210 |
| [Workflow continuation contract](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) | 294 |
| [Managed deadline scheduler](../../packages/temporal-adapter/workflow/src/bounded-deadline-scheduler.ts) | 429 |
| [Platform execution-publication contract](../../platform/contracts/src/execution-publications.ts) | 379 |
| [Platform Multi-Instance decoder](../../platform/contracts/src/execution-publication-multi-instance-decoder.ts) | 503 |
| [Platform semantic-value decoder](../../platform/contracts/src/execution-publication-semantic-value-decoders.ts) | 236 |
| [Alpha progress renderer](../../platform/apps/web/src/mue-preview-alpha-progress.tsx) | 554 |

The membership criterion is every maintained production path that exhaustively discriminates over an added checked-node, operation, profile, `ActivityBody`, controller-field, observation-union, operation-kind, host-family, or copied publication-contract variant, plus every path that must enforce a new identity, ownership, withdrawal, preservation, or publication invariant. The table satisfies that criterion across TypeScript, Lean, Temporal, and Product 2. It deliberately excludes generic consumers whose existing abstractions accept the new family without a branch. A newly discovered production path satisfying this criterion is a proposal-reopen condition before that path changes.

The planned new production owners are `packages/bpmn-source/src/parallel-multi-instance-source.ts`, `packages/bpmn-source/src/parallel-multi-instance-source-reader.ts`, `packages/bpmn-source/src/parallel-multi-instance-lowering.ts`, `packages/semantic-core/src/parallel-multi-instance-contract.ts`, `parallel-multi-instance-controller.ts`, `parallel-multi-instance-binding.ts`, `parallel-multi-instance-profile.ts`, `parallel-multi-instance-admission.ts`, `parallel-multi-instance-command-data-admission.ts`, `parallel-multi-instance-runtime-well-formedness.ts`, `parallel-multi-instance-identity-bound.ts`, `semantic-process-parallel-multi-instance-runtime.ts`, `parallel-multi-instance-observation.ts`, `multi-instance-observation.ts`, `flow-node-occurrence-parallel-multi-instance-lifecycle.ts`, `flow-node-occurrence-parallel-multi-instance-open-set.ts`, `flow-node-occurrence-parallel-multi-instance-publication.ts`, `packages/temporal-adapter/protocol/src/parallel-multi-instance-publication-validation.ts`, `packages/temporal-adapter/workflow/src/parallel-multi-instance-history-capacity.ts`, and `packages/temporal-adapter/workflow/src/parallel-multi-instance-history-measurement.ts`. The source reader owns raw moddle traversal and exact local structural checks; the source owner composes those checked facts into the parallel definition. `BpmnSemantics/SemanticProcess/CanonicalJsonStringCollection.lean` owns the exact escape-aware measure shared with Sequential Multi-Instance. The parallel Lean responsibility owners under `BpmnSemantics/SemanticProcess/` are `ParallelMultiInstanceContract.lean`, `ParallelMultiInstanceController.lean`, `ParallelMultiInstanceLowering.lean`, `ParallelMultiInstanceProfileAdmission.lean`, `ParallelMultiInstanceTransition.lean`, `ParallelMultiInstanceRuntimeWellFormedness.lean`, `ParallelMultiInstanceFlowNodeOccurrence.lean`, `ParallelMultiInstancePreservation.lean`, and `ParallelMultiInstanceLaws.lean`; family wire decoding and encoding belong in `BpmnSemantics/SemanticProcessJson/ParallelMultiInstance.lean`, and executable witnesses belong in `BpmnSemantics/ParallelMultiInstanceConformance.lean`. Listing authorizes a responsibility split but does not require an empty or redundant module; an unlisted new production owner is added to this inventory and reviewed before its first edit.

Before any root with at most 67 lines of measured headroom grows, family logic moves behind one of those responsibility owners and the root retains only its exhaustive discriminator, dispatch, and join. This condition covers checked Process admission, source lowering, scenario projection, program graph admission, semantic runtime, runtime well-formedness, flow-node lifecycle, flow-node open-set, external publication completeness, semantic publication validation, the platform semantic-value decoder, and the named Lean roots. `SequentialMultiInstance.lean` receives only the required exhaustive `ActivityBody` compatibility arm; the other sequential family modules stay byte-identical. No line-count exception or compressed proof account is permitted.

The existing production roots that remain generic are `packages/bpmn-source/src/compile.ts`, `checked-element-projection.ts`, `checked-process-compiler.ts`, `root-definition-selection.ts`, `preserved-element-classification.ts`, and `index.ts`; `packages/engine-api/src/definition-capabilities.ts`; `packages/semantic-core/src/semantic-process-profile.ts`, `semantic-transition-trace.ts`, `flow-node-occurrence-retained-pairing.ts`, and `activity-body-turnover.ts`; every sequential Multi-Instance TypeScript family owner; `packages/temporal-adapter/protocol/src/lifecycle-results.ts` and `semantic-publication-canonical-json.ts`; and `packages/temporal-adapter/workflow/src/workflow-host-readiness.ts`, `workflow-implementation.ts`, and `workflow-command-ingress.ts`. The scheduler registry makes the three Workflow roots consume the new family without a new branch. In Lean, `InternalCommutationCore.lean`, `InternalCommutation.lean`, `InternalCommutationProjection.lean`, `InternalCommutationTransitionRecord.lean`, `ControlPositionDeltaProofs.lean`, the generic FlowNode validity proof roots, the exact-pattern sequential transition/law modules, `ScopeCompletion.lean`, `RuntimeStateIdentityBound.lean`, `BoundedScope.lean`, `SemanticProcessJson/Scenario.lean`, and `SemanticProcessJson.lean` remain generic. The approved graph has one atomic parallel entry operation, so internal commutation stays fail-closed for any future competing composite entry and no footprint arm is added here.

Concrete wire owners are [checked Process schema](../../contracts/schemas/checked-process.schema.json), [Semantic Process schema](../../contracts/schemas/semantic-process.schema.json), [scenario schema](../../contracts/schemas/scenario.schema.json), and [semantic publication schema](../../contracts/schemas/semantic-publication.schema.json). `semantic-profile.schema.json`, `canonical-result.schema.json`, and `flow-node-occurrence-publication.schema.json` remain generic through their existing strings or references. The additive profile owns `profiles/bpmn-2.0.2-parallel-multi-instance-user-task-draft/profile.json` and its sibling `README.md`.

Product 2 compatibility maintenance broadens its copied publication contract and strict decoder to accept the new discriminated union, while the existing Alpha progress component explicitly selects only `mode === "sequential"`. This prevents a valid engine publication from being rejected or mislabeled without adding a parallel Product 2 UI, changing platform authorization, or broadening the capsule's product scope.

Material existing oracles that grow or receive parallel-specific siblings are [source admission](../../packages/bpmn-source/test/sequential-multi-instance-source.test.ts), [acyclic graph policy](../../packages/semantic-core/test/cyclic-control-flow.test.ts), [public observation wire](../../packages/semantic-core/test/sequential-multi-instance-observation-contract.test.ts), [flow-node publication completeness](../../packages/semantic-core/test/flow-node-occurrence-publication-completeness.test.ts), [protocol validation](../../packages/temporal-adapter/protocol/test/sequential-multi-instance-publication-validation.test.ts), [continuation state](../../packages/temporal-adapter/testkit/test/workflow-continuation-state.test.ts), [deadline premise](../../packages/temporal-adapter/testkit/test/sequential-multi-instance-deadline-witness.ts), [capacity topology](../../packages/temporal-adapter/testkit/test/sequential-multi-instance-history-capacity-topologies.ts), [Activity writer census](../../scripts/activity-occurrence-writer-census.test.ts), [runtime collection removal](../../scripts/runtime-collection-removal-completeness.test.ts), [schema artifacts](../../scripts/contract-artifacts.test.ts), and [schema coverage](../../scripts/contract-schema-coverage.test.ts). This oracle list names anchors rather than claiming exhaustiveness; each implementation lane still starts from the smallest separating Red for its owned invariant.

## Epistemic closure and reopen conditions

Established by proposal are the applicable normative clauses and artifacts, the exact source and profile boundary, direct-index aggregation, no-partial-output choice, explicit external ordering account, runtime ownership design, proved-lane obligation, CIB non-selection, and Temporal preflight. No implementation or support claim follows until the evidence matrix and governed reviews close.

The nearest unsupported claim is parallel Multi-Instance for another Activity, another data shape, a different completion condition, partial output, Complex behavior, nesting, or CIB compatibility. The principal common-mode risk is that source, Lean, TypeScript, and Temporal share a mistaken indexed-controller account. Normative derivation, separately authored graph expectations, permutation and cancellation mutations, and host-capacity measurement constrain but do not eliminate it.

The nearest realistic counterexample completes index 2 first, publishes that result as output position 0, then satisfies the early completion condition while leaving index 0's task live and the outer Timer armed. Slot identity, no-partial-output, regional withdrawal, E2 termination, terminal observation, and replay must all reject that outcome.

Reopen before changing the Activity body, collection/value type, data associations, completion expression or output policy, Timer topology, capacity limit after publication, public slot exposure, CIB target, host scheduling contract, nested controller representation, compensation, or any field whose change would reinterpret an admitted profile or retained history.

## Independent cold-review receipt

The superseded proposal reviews targeted `c5ad6f3074ebe48134c67672923c654b95beb146` and `dc21b7ce67fbaaef80a1682a15f05ce4d673a32f`. Their approvals remain historical evidence for the unchanged semantic account, not authorization for the newly corrected production selection.

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `e31500916cb5af3752c3a6ec35a1bd59381f5048` | `fork-turns-none` | `approve-with-required-edits` | `6275ed87398f3cdc55e8633ab0d77ddd638cc946` |
| Semantic checkpoint | `aed177b2b5a5c343db7ddf7acca7cf65de5f241f` | `fork-turns-none` | `approve-with-required-edits` | `8e9767cfb4684eb6ccf42b240b3237becc9c1601` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
