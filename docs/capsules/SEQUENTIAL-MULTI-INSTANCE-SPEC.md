# Sequential Multi-Instance User Task specification

## Status

Implemented and evidence-closed. The exact implemented and absent boundary is maintained by [`implementation-status-delegation:ENGINE-SEMANTIC-FAMILY`](../ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md#sequential-multi-instance-user-task), and the governed review history is retained in the receipt below.

The later ownership-preservation increment at `90e859d0` is classified non-material by the owner under [the negative case](../TESTING-SPEC.md#independent-cold-review-gate), so it opens no proposal, checkpoint, or closure cycle and its receipt stays outside the history below. It adds one Lean result and changes no BPMN meaning, profile, CIB relationship, checked-source or IL representation, admission capability, runtime or public observation, transition family, or Temporal refinement claim: the property it establishes was already claimed by this capsule and was previously assumed. The guards that cover it are the complete Lean build, the infrastructure gate including the Lean import-boundary, source-contract and document-reviewability guards, and the source-hygiene gate. A cold checkpoint review was nonetheless obtained and its required findings were closed at `90e859d0`; that review was voluntary and confers no governed status.

## Implemented boundary

The exact standards-only profile is implemented and execution-registered across source admission and lowering, Lean, the independently written TypeScript core, canonical public progress, E1/E2 publication, the differential pipeline, the production Temporal Workflow chain, and the retained whole-model corpus. The natural witness proves pre-arming rollover, one lifetime Timer, Worker replacement, accepted-result recovery, three ordered iterations, atomic output publication, terminal-receipt equality, production-bound comparison, and replay. The interrupted witness proves one completed iteration, the same lifetime Timer through turnover, a third Run only after Timer reduction, partial-output absence, stale-task refusal, escalation completion, publication equality, and replay. The additive Activity-family issuing discipline required by the public outer identity is independently checkpoint-approved. Closure review and both correction audits are complete, and the corrected immutable target passed the complete clean gate.

This specification defines the first bounded `SEQUENTIAL-MULTI-INSTANCE` slice: one private executable Process reviews an ordered collection through one sequential Multi-Instance User Task, aggregates one string result per generated inner instance, and either completes normally or is interrupted by one exact `PT1S` Timer Boundary Event attached to the outer Multi-Instance Activity. The timer route reaches one ordinary escalation User Task so cancellation remains observable before Process completion.

The standards-only profile ID is `bpmn-2.0.2-sequential-multi-instance-user-task-draft`. BPMN 2.0.2 Clauses 10.3.8 and 13.3.7 plus Tables 10.29 and 10.30 own the Activity wrapper, once-evaluated instance plan, sequential generation, runtime counters, per-instance input and output items, collection aggregation, and completion. Clauses 10.5.5, 10.5.6, 13.3.2, and 13.5.3 plus Tables 10.91, 10.92, 10.101, and 10.122 own the exact interrupting Timer Boundary Event inherited from the reviewed [Activity boundary Timer account](ACTIVITY-BOUNDARY-TIMER-SPEC.md#normative-basis). Existing User Task identity and host mapping remain bounded by `CIB-AGR-0001` and `CIB-OP-0001`; phase-zero relations `CIB-AGR-0011`, `CIB-INT-0002`, and `CIB-LIM-0001` classify CIB Multi-Instance observations without selecting them as semantic authority.

The implementation adds the selected transition family, checked-source shape, Semantic Process operation, runtime record, public observation, data-association slice, and Temporal refinement claim without broadening the exclusions below.

The reviewed requirement ID is `BPMN-SEQUENTIAL-MULTI-INSTANCE-01`. Its requirement-ledger disposition is `supported` only for this exact bounded slice; the broad `BPMN-MECH-LOOP-01` family remains `unsupported`.

## Normative account and selected resolutions

BPMN evaluates the number of desired instances once. With collection-driven setup, that number is the cardinality of the outer Activity's `loopDataInputRef`. Sequential execution generates a new inner instance only after the previous inner instance completes. Each generated inner instance has a `loopCounter`; the outer Activity exposes generated, active, completed, and terminated instance counts. The input collection item is extracted into `inputDataItem`, and a successfully completed inner Activity's output is transferred through `outputDataItem` into the corresponding position of `loopDataOutputRef`. The Process-scope output collection should remain inaccessible until all items have been written.

Clause 13.5.3 makes an interrupting Boundary Event consume its Event occurrence, cancel the attached Activity, and follow only the boundary Sequence Flow. Applied to the outer Multi-Instance Activity, that cancellation covers every generated inner instance, including the one active sequential task. The selected `PT1S` duration, default-or-explicit-true `cancelActivity` contract, and one-Timer-Event-Definition shape reuse the reviewed Activity boundary Timer interpretation; repetition changes the ownership record and host scheduler join below, not the Timer trigger or interruption meaning.

The standard leaves collection extraction, output collection update, and the first `loopCounter` value underspecified. This profile selects the following project-owned resolutions without claiming them as general BPMN meaning:

- the input collection is copied once, in declared array order, into one immutable private outer-Activity snapshot;
- `loopCounter` is zero-based and identifies the snapshot position and output slot;
- collection extraction and update are exact index operations with no expression, coercion, transformation, or reordering;
- the Process-scope output binding is absent until natural completion has produced every planned output, when the exact ordered collection is published atomically;
- interruption discards the private partial output collection and publishes no Process-scope output binding.

Tables 10.30 and Clause 13.3.7 appear difficult to combine if `numberOfInstances` is interpreted as the desired collection cardinality from outer entry: the table requires active plus completed plus terminated to equal `numberOfInstances`, while the clause says a later sequential inner instance is generated only after its predecessor completes. This profile preserves both statements by using `numberOfInstances` for the count of inner instances generated so far, exactly as Table 10.30 describes, and exposing the once-evaluated desired cardinality separately as project-owned `plannedInstanceCount`. `pendingItemCount` is also project-owned and equals `plannedInstanceCount - numberOfInstances`. Neither extension is presented as a BPMN runtime attribute.

At every stable open state:

```text
numberOfInstances
  = numberOfActiveInstances
  + numberOfCompletedInstances
  + numberOfTerminatedInstances

plannedInstanceCount
  = pendingItemCount
  + numberOfInstances
```

For this sequential profile, `numberOfActiveInstances` is exactly `1` while the controller is open, `numberOfTerminatedInstances` is `0` in every stable open state, and completion plus generation of the next inner instance is one atomic transition. A zero-length collection creates no inner instance, publishes an empty output collection, withdraws the boundary deadline before it can become a stable wait, and follows normal control.

The output-on-early-completion question is deliberately not answered. `completionCondition` is excluded because BPMN permits it to cancel remaining instances before every output slot is written while separately cautioning that the Process-scope collection should not be accessible until all items are written. Adding that feature requires a reviewed decision about partial output and Process-scope accessibility.

## Exact admitted source and profile limits

The one registered whole model has a concrete batch-document-review purpose. Its exact executable graph is None Start, one sequential Multi-Instance User Task, one normal None End, one interrupting exact-`PT1S` Timer Boundary Event attached to the outer Multi-Instance Activity, one ordinary escalation User Task, and one escalation None End. The normal and timer routes use distinct Sequence Flow and End Event identities.

The source inventory is closed and machine-readable:

- `Definitions` contains exactly two `ItemDefinition` values for this slice. Both use explicit `itemKind="Information"`. The scalar definition has `structureRef="xsd:string"` and explicit `isCollection="false"`. The collection definition deliberately omits `structureRef` and has explicit `isCollection="true"`, avoiding the invalid claim that scalar `xsd:string` is itself a collection type.
- The profile maps that structure-unspecified collection definition to the canonical project-owned `StringList` wire value and maps its per-item scalar to the separate `xsd:string` definition. This collection-to-scalar relationship is the same selected direct-index resolution that owns extraction and aggregation above, not general BPMN type semantics.
- The Process contains exactly two collection `DataObject` values and two `DataObjectReference` values, one input pair and one output pair. Each `DataObject` has explicit `isCollection="true"` and the collection `itemSubjectRef`; each reference names exactly its own object, omits `itemSubjectRef` and derives typing only through that object, has no `DataState`, and is distinct from the other three identities.
- The Multi-Instance User Task's sole `InputOutputSpecification` contains exactly two `DataInput` values, the collection loop input followed by the scalar task input, and exactly two `DataOutput` values, the scalar task output followed by the collection loop output. Collection members have explicit `isCollection="true"` and the collection `itemSubjectRef`; scalar members have explicit `isCollection="false"` and the scalar `itemSubjectRef`.
- The `InputOutputSpecification` contains exactly one `InputSet` whose ordered `dataInputRefs` are the collection loop input and scalar task input, and exactly one `OutputSet` whose ordered `dataOutputRefs` are the scalar task output and collection loop output. Neither set has optional or while-executing members. `InputSet.outputSetRefs` and `OutputSet.inputSetRefs` are the exact reciprocal singleton pair.
- The `MultiInstanceLoopCharacteristics` separately owns one scalar `inputDataItem` and one scalar `outputDataItem`. Both have the scalar `itemSubjectRef`, explicit `isCollection="false"`, and identities distinct from every `InputOutputSpecification` member.
- The User Task contains exactly two `DataInputAssociation` values and two `DataOutputAssociation` values. Their one-source/one-target pairs are input `DataObjectReference` to collection loop input, `inputDataItem` to scalar task input, scalar task output to `outputDataItem`, and collection loop output to output `DataObjectReference`. Every association has no `transformation` and no `assignment`, and no other data association exists.

Every reference resolves by exact ID. The admitted fixture fixes all identities and ordering, while the profile validator derives the same role graph independently so renaming cannot turn one role into another.

The `MultiInstanceLoopCharacteristics` shape is exact:

| Property | Required value |
|---|---|
| `isSequential` | `true` |
| `behavior` | explicit `All` |
| `loopDataInputRef` | the exact collection-valued Activity DataInput |
| `inputDataItem` | one exact scalar string DataInput |
| `loopDataOutputRef` | the exact collection-valued Activity DataOutput |
| `outputDataItem` | one exact scalar string DataOutput |
| `loopCardinality` | absent |
| `completionCondition` | absent |
| `oneBehaviorEventRef`, `noneBehaviorEventRef`, and complex behavior | absent |

The outer User Task has exactly one incoming and one normal outgoing Sequence Flow. Its Boundary Event has an `attachedToRef` resolving to that exact User Task, no incoming Flow, exactly one boundary outgoing Flow, and `cancelActivity` either omitted or lexically `true`. It contains exactly one `TimerEventDefinition` with exactly one `timeDuration` whose lexical value is `PT1S`; it contains no other Event Definition, Event Definition reference, data input/output, or data association. As in the inherited boundary profile, `cancelActivity="false"`, `cancelActivity="0"`, and the parser-hostile `cancelActivity="1"` are rejected, and every surplus boundary child is rejected. The normal Flow reaches the normal None End directly; the boundary Flow reaches the sole escalation User Task and then the distinct escalation None End.

The Process start accepts exactly one canonical binding whose name is the input Process DataObjectReference ID and whose value is a `StringList`. Completion of the active inner review task accepts exactly one canonical String binding whose name is the scalar task DataOutput ID. Completion of the escalation task accepts an empty patch. Every other binding name, value kind, cardinality, ordering, or task association is rejected before state changes.

The profile limits are inclusive and independently enforced at source-independent execution boundaries:

```ts
const sequentialMultiInstanceLimits = Object.freeze({
  maximumItems: 16,
  maximumItemUtf8Bytes: 512,
  maximumCanonicalCollectionUtf8Bytes: 8_192,
});
```

The input and candidate output collections must each fit the complete canonical tagged `StringList` byte limit. Each input item and submitted output string must fit the item byte limit. A completion that would make the candidate ordered output collection exceed its bound is rejected atomically with an equivalent committed state. These profile limits are narrower than the generic value representation and leave bounded space for the Process input, immutable snapshot, partial output slots, control state, and publication metadata under the existing committed-state capacity.

## Required, optional, and excluded

Required:

- the exact standards profile, source shape, profile limits, and two Process schedules selected above;
- one outer Multi-Instance identity distinct in shape from inner User Task occurrence identity;
- once-only input snapshotting, zero-based indexed iteration, one active inner instance, and exact generated/completed progress;
- direct scalar input and output association, duplicate-preserving declaration order, and atomic final output publication;
- one deadline for the outer Activity lifetime, not one deadline per iteration;
- interruption that cancels the active inner task, leaves pending items ungenerated, discards partial output, and routes only the boundary path;
- stable public progress, existing inner User Task and Timer projections, exact E1/E2 occurrence publication, and stale-identity refusal;
- proved Lean transitions and evaluator soundness for entry, inner completion, next generation, natural completion, and timer interruption;
- pure TypeScript correspondence, exact source and IL admission, registered answer-free evidence, Temporal Worker replacement, Continue-As-New carry, command recovery, and replay;
- a phase-zero CIB probe that keeps any lifecycle agreement or output limitation separate from the standards profile and adds a numbered relationship only with executable evidence.

Optional:

- none in the first slice.

Excluded:

- parallel Multi-Instance, Standard Loop Characteristics, loop cardinality expressions, completion conditions, `None`, `One`, or `Complex` behavior events, and compensation;
- Sub-Process, Call Activity, Service Task, Receive Task, or any other Multi-Instance Activity body;
- more than one Multi-Instance Activity, repeated outer activation, nesting, cycles, concurrency outside the timer race, or more than one boundary Event;
- arbitrary ItemDefinition types, null items, object items, transformations, assignments, expressions, non-direct data associations, input or output sets beyond the exact shape, and Process data mutation outside the selected bindings;
- access to private snapshots or partial output slots, public host identity, Temporal Workflow or Run identity, Event History as semantic evidence, and a caller-selected Multi-Instance policy;
- a CIB Multi-Instance compatibility claim, Product 2 behavior, general BPMN data support, general Activity repetition, Process Execution Conformance, or any version commitment beyond one additive draft profile.

## Public contract

The existing inner task and timer identities remain unchanged. The outer identity is [the shared Activity occurrence identity](../ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md), which is structurally distinct from `OccurrenceId` by field name so a task occurrence cannot be substituted for its controller.

An earlier draft of this section declared its own outer identity over exactly the three fields `ActivityOccurrenceId` carries. `MultiInstanceActivityInstanceId` is retired rather than kept as an alias: the shape is identical, so no projected byte changes, and two names for one identity is the second disagreeing fact this capsule's own rule forbids.

```ts
type OpenSequentialMultiInstanceIteration = {
  loopCounter: number;
  taskId: UserTaskInstanceId;
  taskInput: VariableBinding;
  completionBindingName: string;
};

type OpenSequentialMultiInstance = {
  id: ActivityOccurrenceId;
  mode: "sequential";
  plannedInstanceCount: number;
  pendingItemCount: number;
  numberOfInstances: number;
  numberOfActiveInstances: number;
  numberOfCompletedInstances: number;
  numberOfTerminatedInstances: number;
  activeIterations: OpenSequentialMultiInstanceIteration[];
};
```

Projecting `ActivityOccurrenceId` publicly carries one obligation this capsule inherits rather than creates. The additive [`RSI-ISSUE-01`](../RUNTIME-STATE-INVARIANT-SPEC.md#layer-3-monotonicity) implementation combines the Activity identity bound, monotone Activity-element high-water mark, strict pairwise issuance, a guarded production-writer census, per-root Lean laws, and an independently structured TypeScript pair oracle. Its approved checkpoint discharges Activity identity non-reissue without narrowing the public `id`. User Task, Timer, Message, Effect, Event race, Call, and Scope issuing disciplines remain outside that result.

`activeIterations` is an array rather than a nullable singleton so a later parallel profile can broaden the cardinality without replacing the identity or observation concept. This profile validates exactly one active entry whenever an outer controller is open. The entry's `taskInput.name` is the exact scalar task DataInput ID and its String value is the snapshot item at `loopCounter`. `completionBindingName` is the exact scalar task DataOutput ID.

`StateObservation` gains optional `openMultiInstances`. It is present for every state emitted under this profile, including an empty array after normal or boundary-route completion, and absent for all existing profiles so their canonical observation bytes remain unchanged. `ObservationRequestKind` and the profile observation catalog gain `openMultiInstances`. Consumers must validate the optional field recursively and must not infer Multi-Instance state from `openUserTasks`, `openTimers`, E1/E2 history, or state differences.

The outer controller, snapshot, output slots, planned count, and timer ownership are semantic state, not host state. `RuntimeState` gains one profile-gated optional `sequentialMultiInstanceControllers` collection. It is absent from every old-profile state and history, and is required under this profile, including as an empty array before outer entry and after either closing route. The structural decoder admits the optional member, while cross-profile validation rejects presence under every old profile and rejects absence under this profile. This preserves old canonical bytes without giving the new profile an ambiguous missing-controller state.

Each controller record carries exactly three semantic facts: its `ActivityOccurrenceId`, the immutable input snapshot, and dense indexed output slots. Planned, generated, active, completed, terminated, pending, and loop-counter values are derived. The controller does not restate what the Activity occurrence already owns: the owning `ScopeOccurrenceId`, the immutable operation ID, the active task association, and the one attached Timer occurrence identity all live in [the Activity occurrence record](../ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md) keyed by that same identity, and the Timer's logical deadline lives in its Timer wait exactly as it does for the three boundary-Timer families.

The program/state binding is bidirectional. Each controller resolves through exactly one declared operation and owner to exactly one Activity record, live inner User Task, and attached lifetime Timer. In the reverse direction, every declared sequential Multi-Instance operation with matching live runtime artifacts has equal operation-owned record, resolved-controller, task-wait, and Timer-wait cardinalities. Program admission owns missing or duplicate operation-scope structure while no matching runtime artifact exists; the unique owner becomes load-bearing as soon as a matching record, controller, task wait, or Timer wait exists. An empty controller collection beside an open record, a duplicated controller or activation, an extra operation-owned wait outside the record, a missing association, non-dense output, or a wait not listed by its record is invalid before evaluation or projection. The record's own conjuncts, body liveness and attached-wait unambiguity among them, are not restated here; the controller adds only what is its own. The public projection contains no output slot, Process output before natural completion, Temporal identifier, recovery entry, or segment descriptor.

## Checked source and Semantic Process IL

The checked graph adds one closed `SequentialMultiInstanceUserTask` node carrying the outer Activity ID, task identity and name, exact input/output ItemAwareElement and association identities, normal output, and exact boundary Timer arm. General moddle objects, expressions, and foreign attributes do not cross this boundary.

The Semantic Process program adds one closed `awaitSequentialMultiInstanceUserTask` operation. It owns the outer controller, the repeated inner User Task, and the single boundary Timer because none is a valid independent stable state: an active iteration without its controller or lifetime deadline, a controller without its exact input/output associations, or a reset deadline for a later iteration would change the selected meaning.

The operation contains only immutable definition facts and profile limits. Collection contents, counters, active task identity, timer occurrence identity, snapshots, and output slots remain runtime state. The normal output is enabled only after atomic final aggregation; the boundary output is enabled only by the exact timer occurrence.

Unknown fields, malformed arrays, duplicate identities, unresolved associations, wrong item types, asymmetric input/output shapes, wrong timer attachment, or a program/state pair whose controller does not match its operation fail closed before evaluation.

## Runtime and synthetic construct inventory

| Runtime or synthetic fact | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Outer Multi-Instance controller | Created from the admitted operation and next outer activation count | `OpenSequentialMultiInstance.id` and counters | Exists only while the outer Activity is open; exactly one for this profile |
| Immutable input snapshot | Exact clone of the sole accepted Process `StringList` at outer entry | Only the active scalar task input is projected | Never changes; order and duplicates are preserved |
| Planned count | Snapshot length evaluated once | `plannedInstanceCount` | Constant for the controller lifetime |
| Generated count and loop counter | Generated inner identities in snapshot order | `numberOfInstances` and active `loopCounter` | Starts at one for nonempty input; increments only with atomic next generation |
| Active iteration association | Exact controller, loop counter, task ID, and task input/output IDs | One `activeIterations` entry plus existing `openUserTasks` | Cardinality is one while open; task identity changes for each generated instance |
| Indexed output slots | Accepted scalar task results keyed by loop counter | Never public | Dense from zero through completed count minus one; never completion-order keyed |
| Outer boundary Timer ownership | One timer ID and one logical deadline created at outer entry | Existing `openTimers`; no duplicate field | Identity and deadline survive task turnover and the pre-arming continuation boundary; no continuation occurs while the native Timer is armed; removed on either route |

**Implemented representation, narrower than the rows above and deliberately so.** [The controller](../../packages/semantic-core/src/sequential-multi-instance-controller.ts) stores three facts: the owning `ActivityOccurrenceId`, the immutable snapshot, and the dense output slots. Every other row in this table is a function of those and is computed at the projection boundary rather than stored. Planned is `snapshot.length`, which is what "snapshot length evaluated once" means once the snapshot is immutable. Completed is `outputSlots.length`, so density holds by construction instead of by conjunct. The active loop counter is the same number, being the next slot to fill. Generated is completed plus the one exact active iteration. Pending is planned minus generated. Terminated is zero, and no stable state can show otherwise, because interruption removes the controller in the transition that terminates the active instance. This applies the rule the row above already states for the active count: a stored counter beside its own generator is a second disagreeing fact. It changes no public field, since `OpenSequentialMultiInstance` still carries all of them, and it changes no rule, since `SMI-ENTER-01` through `SMI-CANCEL-01` constrain the same numbers. The normative equations hold arithmetically at the projection boundary from completed count and the exact active-iteration cardinality. Four controller-specific well-formedness obligations prevent the representation from being read under another account: exactly one Activity record has the controller identity; the bidirectional program binding equates each live operation's record, resolved-controller, task-wait, and one exact attached lifetime-Timer census while leaving definition structure to program admission before any such runtime artifact exists; no two controllers share an identity; and an open controller has an item left to generate. The final obligation is not an off-by-one guard: a controller whose slots cover its whole snapshot should have been removed by final completion in the same atomic transition, while an empty snapshot creates no controller.

No synthetic controller is a BPMN FlowNode occurrence. Each generated inner User Task is one E2 FlowNode occurrence using the existing task element ID and its own activation. The boundary Event and both End Events retain their existing occurrence rules.

## Stable semantic rules

| Rule ID | Proposition | Layer |
|---|---|---|
| `SMI-ADMIT-01` | Only the exact source, association, value-domain, cardinality, and limit contract is admitted; malformed or broader shapes fail closed. | BPMN/profile admission |
| `SMI-ENTER-01` | A valid fresh start evaluates and snapshots the input collection once, creates one outer identity and one lifetime timer, and either completes an empty collection atomically or generates only loop counter zero. | BPMN plus project gap resolution |
| `SMI-DATA-01` | The active task input equals the immutable snapshot item at its loop counter, and an accepted result occupies only the corresponding private output slot. | BPMN data mediation resolution |
| `SMI-ITERATE-01` | A valid nonfinal inner completion atomically closes that task occurrence, stores its output, increments completed and generated counts, and creates exactly the next inner occurrence. | BPMN sequential generation |
| `SMI-COMPLETE-01` | The final valid inner completion closes the final task, publishes the exact ordered output collection once, removes the controller and timer, and enables only normal output. | BPMN completion and selected aggregation |
| `SMI-CANCEL-01` | The exact outer timer cancels the active inner task, generates no pending item, discards partial output, removes the controller, and enables only boundary output. | BPMN interruption plus selected partial-output resolution |
| `SMI-REFUSE-01` | Wrong, stale, substituted, malformed, over-limit, or inactive task/timer identity commits no semantic state or publication. | Project command closure |
| `SMI-OBSERVE-01` | Stable progress is derived only from the committed controller and exact active association; private snapshot and output slots remain unobservable. | Public observation |
| `SMI-OCCURRENCE-01` | E2 counts each generated inner User Task exactly once, never counts the controller as an extra FlowNode occurrence, and closes the active task as completed or cancelled according to the winning transition. | Public occurrence lifecycle |

Task completion and timer firing are separately supplied semantic inputs. If both target the same committed pre-state, the first input evaluated by the explicit schedule commits. A nonfinal task-first transition replaces only the inner task, preserves the original Timer identity and deadline, and leaves a later firing valid against the controller's new active task. A final task-first transition removes the Timer, so that firing becomes stale. Timer-first takes the boundary route and makes the old task completion stale. No portable physical simultaneity order is claimed.

That semantic schedule does not license Temporal callback order. A `doUpdate` completion and the lifetime Timer callback delivered in one Workflow activation have no portable winner and must fail closed before either stimulus reaches the semantic core. The adapter adds an exhaustive sequential-Multi-Instance boundary-deadline host class and the distinct nonretryable failure identity `BpmnSequentialMultiInstanceSchedulerUnavailable`; neither the Event-race nor bounded-Activity failure identity may be reused. The managed scheduler joins the committed controller, its current generated task, and its one Timer occurrence through the Activity occurrence record rather than through wait cardinality or an activation-ordinal agreement, so task turnover cannot detach the still-live deadline or associate it with a stale iteration.

The coalesced evidence reuses only the reviewed activation-tag and drain-barrier mechanism, not an assumed premise. A direct-VM witness supplies one `doUpdate` job and the Timer callback in one non-replay activation, a source lock retains the pinned SDK fact that `hasSignals` excludes `doUpdate`, and both prove that callbacks accumulate before core advancement. A real-service probe separately proves the accepted Update is durably resolved when the Workflow fails. Mutations that advance either arm, reuse another family's failure identity, lose the Update response, omit the new operation from exhaustive host admission, or bind the Timer to the prior generated task must fail, and the failing history must replay to the same typed adapter result.

## Lean assurance lane

The lane is **proved**. Lean defines declarative relations for outer entry, nonfinal iteration completion, final natural completion, and timer interruption, then proves every evaluator-produced transition belongs to the corresponding relation.

The minimum laws are:

- generated equals active plus completed plus terminated while the controller exists;
- planned equals pending plus generated, active is at most one, and counters are monotone within one controller lifetime;
- snapshot identity, order, multiplicity, and values are immutable;
- an accepted inner result writes exactly its loop-counter slot, output slots remain dense, and final aggregation follows index order;
- Process output is absent before natural completion, exact after natural completion, and absent after interruption;
- wrong or stale controller, task, timer, loop counter, binding, or output size preserves the complete state;
- the explicit task/timer schedule preserves the Timer across a nonfinal task-first transition, makes it stale after final natural completion, and makes the old task stale after timer-first interruption;
- under the finite snapshot hypothesis, if every current target controller receives a target-indexed accepted inner completion or outer-Timer event from the actual transition relation, a finite relation trace reaches natural completion or interruption.

*Active is at most one* is a runtime invariant rather than a standalone law, and the two are recorded separately because they were not always both established. It is `controllersOwnLiveActivity`, which requires every controller to name exactly one Activity occurrence record, and `generatedInstanceCount_eq_active_add_completed` consumes it as a hypothesis rather than deriving it. [The preservation owner](../../BpmnSemantics/SemanticProcess/SequentialMultiInstancePreservation.lean) proves it for each of the five state rewrites and then lifts those to the three evaluators, so what maintains the hypothesis is a committed transition rather than a state constructor an evaluator may or may not reach. Evaluator soundness could not have supplied it: each relation arm concludes with the post-state its evaluator produced, so no arm can fail apart from the evaluator it certifies. Entry alone needs `runtimeStateIdentityBound`, because the minted activation is fresh only while no present record is numbered above its element's recorded count. The monotone-counter half of the same bullet remains an open lane and is not claimed here.

The proved `finite_snapshot_conditional_progress_eventually_closes` theorem uses the finite remaining-item measure. Its event type is indexed by the exact controller before and after the actual iteration, completion, or interruption relation. Natural completion and interruption remove the target; the iteration relation's non-final premise proves a strict measure decrease. Close-or-decrease is therefore a theorem about accepted transitions, not part of the progress hypothesis. That hypothesis remains explicit, so it supplies no human-completion or Timer-delivery fairness and does not turn conditional closure into unconditional liveness.

The nearest checked non-law is unconditional liveness: the engine does not guarantee that a human completes an active User Task or that a chosen host schedule fires the timer. Evaluator soundness alone does not prove completeness, determinism across unspecified schedules, TypeScript correspondence, compiler correspondence, or Temporal refinement.

## CIB Seven relationship boundary

Pinned CIB Seven source parses `loopDataInputRef` as a collection variable, maps `inputDataItem.name` to its per-instance element variable, initializes the desired instance count from collection cardinality, and performs sequential instances at loop counters starting with zero. Its engine parser contains no corresponding `loopDataOutputRef` or `outputDataItem` execution path even though its bundled schema declares both. Its sequential behavior also stores the desired cardinality in `nrOfInstances` from entry rather than the generated-so-far interpretation selected above.

Those source facts are diagnostic, not a compatibility decision. The standards profile reuses only `CIB-AGR-0001` for the bounded base Process/User Task lifecycle and `CIB-OP-0001` for the existing host-task identity mapping. It makes no CIB claim about Multi-Instance counters, data mediation, aggregation, or interruption.

The exact CIB `2.2.0` public-service probe is now green. It establishes ordered distinct task turnover, zero-collection closure, one stable outer Timer, interrupting boundary routing, desired-cardinality counters present from outer entry, and absence of the declared standard output collection after scalar task-local results. The register classifies the lifecycle subset as `CIB-AGR-0011`, the counter choice as `CIB-INT-0002`, and missing output aggregation as limitation `CIB-LIM-0001`.

The project profile remains standards-only. It retains the selected generated-instance counter and direct-index atomic output mediator, uses CIB only for the bounded agreement and separating limitation evidence, and has no CIB execution target for Multi-Instance semantics.

## Temporal hosting and refinement preflight

Durable ingress remains the existing Process Start and content-bound User Task completion Update. The boundary timer is derived from committed semantic state. The profile adds no Signal, Activity, Child Workflow, external cancellation, or I/O inside Workflow code.

The stable wait set contains one active inner User Task and one managed outer boundary Timer. The Timer is armed once from the outer entry logical time. Completing an inner task must not cancel and recreate it, alter its semantic identity, or reset its deadline. Natural outer completion withdraws it; exact firing withdraws the task and routes interruption. Host admission classifies `awaitSequentialMultiInstanceUserTask` exhaustively as this managed pair and rejects any token split, second host-driven wait, second timer, or missing controller join before Workflow start.

**Implemented bounded refinement.** The operation has its own managed host class and typed scheduler-unavailable identity. The family descriptor joins the one outer Activity record to the exact controller, active body, and attached `PT1S` Timer; controller removal, duplication, or activation substitution fails closed. The shared durable Timer owner exposes whether its native Timer is armed, and Workflow-chain rollover is permitted only when requested and no managed boundary-deadline Timer is armed, preserving the pre-arming continuation boundary while deferring later rollover through inner-task turnover. Component evidence proves admission, controller substitution refusal, stable semantic Timer identity through turnover, zero-item absence, and the pure rollover decision. The natural and interrupted live witnesses prove native Timer arming, Worker replacement, Update recovery, pre-arming Continue-As-New, interruption, exact history topology, and replay.

The complete outer controller, snapshot, indexed outputs, counters, active task association, timer ID, and logical deadline are committed semantic state and may cross Continue-As-New only before the native Temporal Timer is armed or after its callback has been reduced. The forced witness takes the former boundary immediately after outer entry has committed the semantic pair and before host readiness schedules the Timer. Once the successor Run arms that Timer, rollover is deferred until natural completion cancels it or firing is reduced; no later iteration crosses a Run boundary while the native Timer is live. The program and profile identity remain immutable. A continuation that loses, duplicates, reorders, or substitutes any controller fact is invalid before Workflow evaluation.

Deferring rollover while the Timer is armed makes the profile's finite bound a hosting obligation. The pure executable budget owner sums the maximum Event count and canonical payload bytes for the pre-arming continuation, one Timer start and either cancellation or firing, the worst jointly admissible sixteen-item input and output collections with their content-bound completion Updates, Workflow Tasks, and recovery results, the largest aligned E1/E2 publications, and terminal closure. Separate admissible cases reach both collection byte bounds and the individual item bound without treating sixteen individually maximum-size items as jointly admissible. The complete armed Run remains below the 8,000-Event and 8 MiB project triggers, its largest final activation remains inside the existing 2,240-Event and 2 MiB warning reserves, exact 16 fits, and count-only exact 17 is refused before state mutation.

Existing command recovery remains content-bound to the complete task stimulus. Exact retry and identity conflict resolve before capacity and before handler acceptance. A lost successful result can be recovered after Continue-As-New or Worker replacement without repeating the semantic transition. An unseen command after terminal closure follows existing terminal fencing; no recovery entry or Run identity becomes semantic state.

The executable refinement witness lowers the history threshold so outer entry requests rollover, closes Run 1 after the semantic task/timer pair is committed but before any native Timer command, and arms the one `PT1S` Timer only in Run 2. Its natural schedule starts a three-item collection, replaces the Worker, completes all three tasks in that armed Run, drops and recovers one Update result, observes unchanged snapshot-derived inputs and one lifetime deadline, verifies ordered final output and exact E1/E2 inner occurrences, validates the closed terminal receipt, and replays both Runs. Its interrupted schedule completes one item in the armed Run, fires the original Timer while the second task is active, and reduces that callback before rollover becomes legal. Run 3 hosts the escalation task, exposes no output collection, rejects the stale second-task completion, completes escalation, and replays all three Runs. Separate-activation task-first and timer-first witnesses use explicit logical schedules rather than wall-clock coincidence; the coalesced activation uses the fail-closed evidence above.

The budget owner's inputs come from one private testkit-only Temporal capacity probe, not from invented constants and not from an SMI semantic-execution bypass. The probe uses the real Temporal service and production serializers, validators, continuation envelopes, recovery envelopes, and publication envelopes to run the maximal natural and interrupted host-command topologies described above: pre-arming Continue-As-New, one lifetime Timer, sixteen content-bound completion Updates with their Workflow Tasks and recovery results, the largest aligned E1/E2 publications, and terminal closure. Its payloads are the exact jointly admissible maximal SMI state and publication envelopes produced through the pure semantic transition and projection boundaries, but the probe does not call command admission, execute BPMN, publish a supported profile, or define semantic meaning. It records service-reported Event count and History size, the largest activation payload, and a closed event-family account for each topology. The pinned CLI `1.8.1`, Server `1.31.2`, and SDK `1.21.0` measurement replays all five Runs and retains exact project-owned facts with maxima of 87 classified Events, 568,902 conservative History-envelope bytes, 10 activation Events, and 246,799 canonical activation payload bytes. The History envelope is the sum of the production-owned 4 KiB allowance for every final Event, the largest co-resident canonical activation payload, and the separately recorded closing payload. Raw `workflowInfo().historySize` values are retained only as monotone service observations below that envelope and are excluded from exact equality because server-generated History metadata varied by up to 84 bytes across locked-service repetitions. The pure owner proves every boundary remains below the 8,000-Event, 8 MiB, 2,240-Event, and 2 MiB limits, requires exactly one `WorkflowExecutionStarted` Event and a family-count sum equal to the final Event count, and separately executes exact-16 fit plus a count-only exact-17 refusal with unchanged state. The later production witness must remain within every corresponding bound and reproduce the required event families; a mismatch reopens the owner rather than being excused by the probe.

Initial Workflow entry and incoming continuation both validate `supportsSemanticProcessExecution`. The private host-capacity probe and pure budget owner therefore precede the atomic execution-registration and live-witness increment, and the registered production histories must remain within the independently measured pre-registration bounds. Constructing a committed checkpoint manually would bypass the boundary being evidenced. A selected sixteen-item workload that no longer fits, a probe that cannot reproduce the named production host topology without a semantic bypass, or a live production history exceeding its bound reopens this account.

Temporal Event History, Workflow ID, Run ID, Activity attempts, and Continue-As-New boundaries remain hosting evidence only. Public progress and outputs must match the pure semantic state without inspecting them.

## Evidence strategy

The first red is not merely an unsupported XML node. One independently authored three-item scenario must currently fail source admission, while a mutation that removes only Multi-Instance characteristics becomes an ordinary User Task graph and therefore cannot produce the required repeated task/progress/output trace. A second red uses the same command identity against two different loop iterations; current task-only identity handling must not be allowed to substitute one iteration for another.

Answer-free scenario inputs cover zero items, three distinct items, duplicate items, natural completion, timer interruption after one completion, task-first and timer-first schedules, wrong outer/task/timer activation, stale prior task, binding substitution, reordered inputs, oversized item/count/canonical bytes, and a final candidate output that crosses the byte bound.

| Claim | Independent evidence |
|---|---|
| Exact source and profile admission | Source compiler fixtures, exact checked graph, foreign/surplus/malformed association mutations, and old-profile rejection |
| Normative sequential lifecycle and data mediation | BPMN clauses and machine-readable artifacts plus the capsule rules; no CIB majority vote |
| CIB relationship | Public-service probe for `CIB-AGR-0011`, `CIB-INT-0002`, and `CIB-LIM-0001`; no CIB Multi-Instance semantic oracle |
| Declarative meaning and laws | Lean relation, evaluator soundness, law proofs, and explicit non-law |
| TypeScript realization | Independently written semantic-core implementation and exact trace comparison with Lean |
| Public outer-identity non-reissue | Activity-family `RSI-ISSUE-01`, the current-writer census, both Lean issuer roots, exact predecessor proofs for preserving and removing writers, the independent TypeScript three-state regression oracle, all four TypeScript issuer pairs, and a real activation-two rearm |
| Occurrence accounting | E2 start/end batches, open-set identity, and mutations that count the controller, reuse a task ID, or close by completion order |
| Durable refinement | Product 1 start, Update recovery, one pre-arming forced Continue-As-New, no rollover while armed, one outer timer, coalesced fail-closed activation, Worker replacement, exact receipt, history exclusions, capacity proof, and replay of every Run |
| Whole-model reach | One exact registered project-owned batch-review BPMN model under one source digest, two retained schedules and corpus entries, one capability row, the generated corpus map, and Product 2 About disclosure added atomically with support |

Meaningful mutations use lowercase `behavior="all"`, reset the timer for each iteration, derive active input from the mutable Process binding instead of the snapshot, aggregate in completion order, expose a partial output, publish output on interruption, increment generated count before task creation, count the controller as a FlowNode occurrence, reuse the prior task identity, accept a result for the right task with the wrong output binding, roll over while the native Timer is armed, or drop controller state at the pre-arming Continue-As-New boundary. Each must be caught by an oracle that does not share the mutated mechanism.

Two of those mutations were measured against the implemented core transitions and one of them is not separable there, which is recorded rather than left to be discovered. **Resetting the timer for each iteration** is caught only when the reset mints a fresh Timer occurrence: no logical time elapses across an iteration boundary, so a deadline recomputed from the same logical time and the same duration is byte-identical to the preserved one, and only the host's refusal to arm unless the remaining time equals the armed duration separates them. That half is adapter evidence, not core evidence. **Aggregating in completion order** is not separable at all under this profile, because one active instance means completion order is index order in every admitted schedule; the retained oracle in its place is a slot defect, where a result lands in the wrong position, overwrites a filled slot, or is dropped. Both corrections narrow the claimed evidence rather than the rule.

## Versioning consequences

This is one additive pre-release profile, one additive optional public observation field, and one additive optional `RuntimeState.sequentialMultiInstanceControllers` field. Existing profile artifacts, caller bytes, Semantic Process programs, RuntimeState values, canonical observation bytes, terminal receipts, and retained Temporal histories remain valid and byte-identical because both new fields are absent under every old profile. The new operation and controller field are reachable only under the new profile, where the controller field is strictly required. Decoders and profile-aware validators must be upgraded atomically before the new profile is admitted; retained old histories decode and replay with the field absent, while presence-under-old-profile, absence-under-new-profile, surplus controller fields, and substituted scope/activation identities are explicit mutations.

The implementation updates the profile catalog and artifact, source parser/projection, checked graph, Semantic Process contract and schema, Lean wire and evaluator boundary, TypeScript runtime and validators, canonical scenario schema, observation validators, E1/E2 projection, differential case catalog, Product 1 protocol/client/testkit consumers, Workflow continuation validation and capacity measurement, registered corpus, and documentation owners as one compatibility change. Product 2 gains only tolerant decoding and capability disclosure; it does not gain a new workflow or UI behavior in this capsule.

Existing executable constraints include [schema coverage](../../scripts/contract-schema-coverage.test.ts), [semantic closure documentation](../../scripts/semantic-closure-documentation.test.ts), [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), [Workflow occurrence authority](../../scripts/workflow-occurrence-semantic-authority.test.ts), [Activity boundary Timer source evidence](../../packages/bpmn-source/test/activity-boundary-timer-source.test.ts), [Activity boundary Timer semantic evidence](../../packages/semantic-core/test/activity-boundary-timer.test.ts), [profile value-domain evidence](../../packages/semantic-core/test/semantic-profile-value-domain.test.ts), and [Workflow Timer capacity](../../packages/temporal-adapter/workflow/test/workflow-timer-capacity.test.ts).

## Epistemic closure and reopen conditions

Established are the applicable BPMN clauses and conflicts, the exact bounded standards profile, selected zero-based/direct-mediator resolutions, distinct identity and data lifetimes, public progress contract, atomic aggregation, timer interruption, proved transition account, cross-target execution, and bounded Temporal refinement. Static CIB source and public-service evidence establish only the separately classified parser, lifecycle, counter, and missing-output facts stated above.

The [closure-cost ledger](../CAPSULE-COST-LEDGER.md) records `f3802b7c..d814cac4` as `+26860/-2289` nonblank code lines and `+1071/-153` documentation lines. The range deliberately retains the separately reviewed occurrence-ownership, body-turnover, runtime-identity, issuing-discipline, and closure-correction work this capsule forced; no subtraction turns that composite lifecycle into a smaller local feature claim. Both additions exceed the nearest interrupting Activity boundary Timer comparator. The process correction is the adopted Alpha/Beta sequence: Alpha reuses this reviewed contract without another semantic-policy copy, and every remaining MUE family receives a separate vertical risk checkpoint before deepening, preventing another long composite prerequisite span from hiding cross-family risk.

The nearest unsupported claim is sequential Multi-Instance for another Activity, arbitrary collections or data associations, early completion, repeated outer activation, or CIB-compatible output aggregation. The principal common-mode risk is that source lowering, Lean, TypeScript, and Temporal all consume one mistaken scenario account; independent normative derivation, a separately authored checked graph oracle, CIB public-service observation, identifier substitutions, and seeded timer/output/order mutations constrain but do not eliminate that risk.

The nearest realistic counterexample completes the first item, silently resets the boundary deadline while creating the second task, then publishes an output collection after the reset timer allows work beyond the original outer lifetime. The timer identity/deadline, indexed output, E2 task turnover, and task-first/timer-first witnesses must all reject that implementation.

Reopen before admitting parallel generation, a different Activity body, loop cardinality, completion condition, partial Process output, non-direct mapping, expressions, another value type, repeated or nested controllers, more than one timer, a CIB Multi-Instance profile, a public output-slot projection, or a representation that cannot broaden active iteration cardinality without reinterpreting an already accepted model.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `70256503c94ee6d2f63be315912d8465894b35f3` | `fork-turns-none` | `approve-with-required-edits` | `a064dc8ba871c77a8d27817565e8b3a9f0c019bc` |
| Semantic checkpoint | `ae8064faca30b32777ef668fd0ce0450ce892615` | `fork-turns-none` | `approve-with-required-edits` | `001b6171a345035e9dad4b7ee4c1e9d759275d91` |
| Closure | `4145bdfaaa057547bd2de02a8ce2d529005b0e11` | `fork-turns-none` | `approve-with-required-edits` | `0c991efa7fa6a08926a0e9a9cf193972396eb085, 4f43aba06b3203cae83a8b326809ad3384ba439c` |
