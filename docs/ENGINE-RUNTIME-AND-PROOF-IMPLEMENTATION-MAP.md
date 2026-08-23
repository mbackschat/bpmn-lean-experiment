# Engine runtime and proof implementation map

This detail map owns exact current runtime-state, scope, Lean, TypeScript semantic-core, BPMN-conformance, and capsule-delegated semantic-family status. Root routing and cross-area claims remain in [`implementation-status-router`](IMPLEMENTATION-MAP.md).

## Current boundary

The Lean reference interpreter and independently written pure TypeScript semantic core execute the same reviewed Semantic Process account over immutable serializable state. Closed families remain bounded by their profiles and capsules; no current evidence establishes general BPMN execution or a TypeScript-to-Lean or Temporal correspondence theorem.

Exact BPMN bytes admit through a checked project-owned graph to the [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md), which a Lean reference interpreter and an independently written TypeScript semantic core each evaluate, and which a Temporal adapter hosts durably. The closed semantic families are Parallel fork/join, Exclusive Gateway over the project-owned Boolean expression language, Inclusive Gateway, Event-Based Gateway, cyclic control flow, Call Activity, embedded Sub-Process completion and Error propagation, Message Start, Timer Start, Intermediate Catch Timer and Message, Message-addressed Receive Task, Terminate End, Service Task effects, configured Task effects, scoped runtime data, User Task start and completion data, and the three boundary-Timer loci including one non-interrupting route.

The closure-reviewed standards profile for Terminate End implements selected-occurrence-retaining containing-scope cancellation through strict source, checked `terminateEndEvent`, no-output `terminateScope`, Lean, the core, registered differential evidence, and passive Temporal hosting. CIB evidence and Product 2 cancellation remain absent.

The closure-reviewed configured Task extension retains distinct `configuredTask` checked identity and lowers only its exact binding to the existing Activity/Probe effect. It has registered Lean, core, differential, and live Temporal evidence plus a CIB pass-through exclusion oracle, but no CIB compatibility target or public effect-completion ingress.

The closure-reviewed [Boolean Process-data specification](capsules/BOOLEAN-PROCESS-DATA-SPEC.md) admits primitive Boolean only for exact completion in one registered sequential User Task profile. Its schema, Lean, core, CIB, differential, live Temporal, history, and replay evidence are green. Start and older profiles remain string/null-only, and Product 2 consumes no new fact.

The graduated [sequential metadata specification](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md) carries an optional literal group candidate and string-or-Boolean generated-form field through checked source, `awaitUserTask`, committed wait, and public `OpenUserTask`. The closure-reviewed [parallel composition specification](capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) requires that metadata on both tasks of one exact balanced graph, empty Process Start data, and the existing completion and parallel runtime. Lean, core, combined CIB, differential, live Temporal and replay, mutation, corpus, and production-journey evidence are green. Product 2 consumes only published task and form facts through M3 Work.

The first interchange composition registers `cibseven-2.2.0-user-task-process-data-preserved-notation-draft` in Lean and the TypeScript semantic core. Both reuse the existing sequential User Task Process-data graph, operation, value-domain, transition, and result account while source admission separately retains standard notation. The exact narrow Lean executable agrees with the core result, and live Temporal evidence reuses the existing start and User Task Update path through Worker replacement, terminal result, history, and replay. This adds no runtime field, IL operation, transition, observation, or CIB interpretation.

## Implemented

### Runtime scoped data

- One deeply immutable replacement representation in Lean and TypeScript with explicit Process bindings plus private Activity-local bindings owned by complete semantic effect occurrence
- activation creates the owned input scope
- success and matching Error completion require one exact owner, apply program-owned output mapping, and remove only that scope atomically
- Process-only canonical projection
- cross-owner, missing-owner, duplicate-owner, private-local non-observability, closure-limit, data-independent-enabledness, and compile-time immutability guards
- unchanged shared wire artifacts, canonical traces, effect transport, retained CIB evidence, and Temporal Commands

### Definition and execution scopes

- one canonical checked definition-scope forest with exact node and Sequence Flow ownership; existing profiles remain one rooted tree while the bounded Call profile adds one distinct parentless called root
- one canonical Semantic Process definition-scope forest with exact operation and control-place ownership plus entry-root and called-root completion strategies
- one root runtime occurrence plus one level of parent-linked child occurrence identity or one occurrence-linked parentless called root under the exact profile
- scope-owned tokens and User Task, Message, Timer, and effect waits
- explicit `enterScope`, `invokeProcess`, `returnProcess`, `reachNoneEnd`, and quiescent `completeScope` operations
- child None Start as entry structure rather than a second Process initiation
- exact child completion only after the owned region has no token, wait, or child occurrence
- child removal plus one parent-owned continuation and separate root completion
- direct-parent exact-code Error interruption that removes the child occurrence subtree, preserves monotonic counters and root-owned work, and emits one parent-owned boundary continuation
- containing-scope `terminateScope` cancellation that clears every represented live owner in the selected occurrence subtree, retains that occurrence quiescent, preserves higher-level work and monotonic state, and delegates all continuation or root completion to unchanged `completeScope`
- owner-scoped selected-branch records that block quiescence until exact selected-input synchronization and are removed by owner interruption
- occurrence-owned Call records that block caller quiescence, bind one distinct called semantic instance, and remove the complete parentless called subtree on return or interruption
- missing, duplicate, cross-owner, premature-completion, and stranded-child guards

### Lean

- Project-owned strict JSON parser with duplicate-key, unpaired-surrogate, and safe-integer rejection
- strict checked-graph, Semantic Process, and external scenario decoders with exact-key and closed-variant rejection
- executable JSON edge-case and Unicode scalar-order locks
- separate checked-process admission, Semantic Process validation, cross-artifact binding, canonical lowering, and exact lowering-equality owners
- separate kernel-decided conformance modules for admission/profile/binding/lowering and for runtime closure/evaluator facts, preserving the theorem surface while bounding each Lean compiler process independently
- generic scope-owned token, occurrence, wait, selected-branch, called-Process, and scoped-variable runtime with canonical public projection
- declarative `OperationStep`/`ProgramStep` and `EffectCompletionStep`, executable transitions, and evaluator soundness at each closed capsule's declared proof boundary
- independent decoding, lowering, execution traces, refusal or preservation facts, and non-laws for every closed family named in [the current boundary](#current-boundary); the three boundary-Timer proof boundaries remain explicit in their sections below
- cyclic-control-flow proofs for exact checked/program graph policy and lowering, full-cycle interception by the selected cut, general per-offered-token merge relation, unique-offer evaluator soundness, actual execution of every finite reviewed repeat/rework schedule followed by exit, actual-reachability active-unit bounds, automatic cut-DAG closure at no more than six operations, stale/wrong/future identity preservation, and excluded internal-cycle, fan-in, scope, and wait shapes
- Message Start proofs for strict checked/program/stimulus decoding, exact source-to-IL channel and root binding, distinct Message initiation, fresh root occurrence and outgoing-token production, wrong-operation refusal with exact state preservation, bounded closure to the existing User Task wait, and excluded second start or passive-subscription interpretations
- Timer Start proofs for strict checked/program/stimulus decoding, exact source-to-IL Process/Start Event/duration/output binding, distinct Timer initiation, fresh root occurrence and outgoing-token production, wrong-identity refusal with exact state preservation, exact closure bounds and stable User Task resumption, normalized post-initiation observation agreement with None and Message starts, and excluded non-`PT1S` or recurring interpretations
- Terminate End proofs for exact checked/program admission and lowering, reusable selected-root-retaining subtree cancellation, every represented owner family, aggregate End increment and unrelated-state preservation, root and nested completion, stale and multiplicity refusal, exact 5/3/2 closure bounds, strict decoding, and global-versus-incomplete cancellation non-laws
- configured Task proofs for strict source binding, distinct checked identity, exact checked/program admission, endpoint lowering to the existing Probe effect, normalized Service Task control-shape agreement, exact effect-to-User-Task closure, occurrence refusal, descriptor drift, and pass-through non-laws
- E2 proofs for exact optional metadata admission, source-independent lowering, committed wait and public projection, completion equivalence across arbitrary admitted metadata and submitted patches, refusal preservation, strict JSON identity, boundary-space and literal restrictions, metadata-free byte omission, and old-profile exclusion
- proved incident report/retry relations and evaluator soundness, exact wait suspension and restoration, public projection, quiescence blocking, resumability, runtime-context preservation, typed refusal, old-profile and cross-program fail-closed admission, strict JSON identity, and success/BPMN-Error separation
- bounded internal closure for one enabled operation or the exact admitted two-task pair, rejecting every other multiple-enabled shape
- one catalog-driven result emitter that consumes and echoes answer-free scenarios, with strict role decoders and independent cross-artifact validation
- the separately gated checked-source experiment with bounded structural, decomposition, reachability, and enabled-frontier results
- proved committed-transition trace/replay, control positions/deltas, nonpublication failures, and source-compiled TypeScript parity

### TypeScript semantic core

- Dependency-free Semantic Process contracts
- shared safe-string admission, Unicode scalar ordering, and deeply immutable profile, program, runtime, stimulus, and result data
- topology-independent structural validation plus exact profile definition-scope and operation-kind cardinality
- pure exhaustive execution of the closed Semantic Process operation union, with operation-ID-stable internal closure independent of program collection order
- explicit scope-occurrence ownership over token multiplicity, child and called instances, selected branches, and canonical task, Message, timer, effect, and variable projections
- independent evaluation, exact refusal, hidden-state non-projection, and bounded closure for every closed family named in [the current boundary](#current-boundary), including both data mappings and both Error routes
- registered cyclic-control-flow admission and execution with one shared frozen graph policy, a reusable nonempty Exclusive Merge contract, profile-local exact-three restriction, owner-preserving unique-offer execution, and zero/multiple-offer evaluator incompleteness kept distinct from the declarative relation
- registered Message Start admission and execution with a distinct exact-target stimulus, one fresh root occurrence, generic canonical nonempty outgoing-token production, profile-local exact-one output, and no subscription or payload
- registered Timer Start admission and execution with a distinct exact-target stimulus, one fresh root occurrence, generic canonical nonempty outgoing-token production, profile-local exact-one output, exact refusal and 2/1 closure bounds, stable User Task resumption, normalized cross-start observation equality, and no runtime Timer or clock state
- registered Terminate End admission and execution with no external stimulus, selected-occurrence-retaining subtree cancellation, exact higher-level preservation, aggregate End increment, unchanged scope completion, exact refusal, and 5/3/2 closure bounds
- registered configured Task admission and execution with exact checked descriptor binding, the existing payload-free Probe effect, effect-only initial exposure, occurrence-only refusal, trailing User Task continuation, and no runtime, stimulus, state, or observation widening
- exact Process-start installation and atomic User Task completion merge over the shared five-arm representation, with profile admission at deployment and live commands
- the interchange composition profile reuses that exact String/Null Process-start and User Task completion behavior with the existing acyclic sequential User Task graph and adds no runtime or observation branch
- registered E2 metadata admission and independent preservation through checked User Task, ordinary operation, committed wait, and public projection, with passive completion, exact refusal preservation, strict wire values, and old-profile exclusion
- registered literal-generation incident report and exact retry transitions, private and public association validation, incident-aware quiescence and resumability, and pre-dispatch refusal of malformed or cross-program injected incident states
- adapter-facing projection, structural stimulus validation, command identity, effect-transport material, incremental deployment and advancement, and complete scenario evaluation
- executable complete-enabled-set closure classification and stable-state-resumability checks, with ambiguity refusal for every multiple-enabled shape except one exact pair of independent User Task waits, plus malformed-topology and stranded-state witnesses
- traced committed transitions/replay and fail-closed control-position projection, with unchanged canonical observations and Lean parity

### BPMN conformance

- Primary engine roadmap and ultimate Process Execution Conformance target are explicit
- the disposition ledger records thirteen first-pass mechanism families and reviewed requirements separately from CIB and A12 coverage
- implemented bounded mechanisms cover sequential User Task lifecycle/refusal, per-incoming-flow parallel synchronization, one exact Simple Boolean divergent Exclusive Gateway, one structured two-condition-plus-default Inclusive Gateway split and paired selected-subset join, one exact operation-addressed Message-versus-`PT1S` Event-Based Gateway race with bounded durable refinement, one exact Intermediate Catch Timer, one operation-addressed payload-free Intermediate Catch Message subscription, one direct-Message payload-free Receive Task, bounded successful Service Task execution, one exact configured external-effect Task extension, bounded string/null input/output mapping, one exact-code attached interrupting Service Task Error route, ordinary one-level embedded Sub-Process completion, one direct-parent exact-code Error End propagation with regional cancellation, and one exact nested Terminate End that cancels only its containing Sub-Process occurrence before ordinary parent continuation

## Explicitly absent

Two registered profiles select one internal standard-notation preservation capability without executing the retained material. The BPMN data family remains rejected. All registered profiles except the bounded User Task cycle remain acyclic. Integer and String-list values appear only at M6 User Task completion, and Product 1 owns no form semantics. The independently closure-reviewed [Service Task incident and retry specification](capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md) owns one registered literal-generation-1 incident and one exact retry. Its successor adds only the exact incident-gated hosting-root cancellation path; it does not add general BPMN or operator cancellation, native Temporal cancellation, compensation, another incident generation, or Product 2 action state.

The sequential Multi-Instance checked node and Semantic Process operation are structurally implemented, schema-validated, and source-lowered, but the profile is not execution-registered. Its runtime controller, public progress, transitions, Lean account, TypeScript evaluator, occurrence lifecycle, and Temporal refinement remain absent at this checkpoint.

### Runtime scoped data

- Root-scope compatibility wrapper
- parallel legacy runtime representation
- public Activity-local observation
- bare-element or bare-ordinal ownership
- variable-scope traversal, shadowing, or variable scope kinds beyond the implemented effect-local slice

### Definition and execution scopes

- arbitrary or repeated nesting, loops that reactivate one definition scope, and concurrent occurrences of the same child definition
- Event Sub-Processes, Call Activities beyond the exact two-Process empty-data normal-return slice, Transactions, compensation, general cancellation beyond the exact reviewed regional slices, and exceptional propagation beyond one direct-parent exact-code Error handler
- public projection of definition-scope or runtime-scope identity

### Lean

- Optional vertex-count fuel adequacy and no-false-rejection theorem
- generalized arbitrary-cardinality or arbitrary-graph progress theorem beyond the implemented profile capability and targeted checks
- adopted checked-source semantics and run-level observational lowering-preservation proof
- either-target-fires and exactly-two enabledness at a two-token frontier
- generalized enabled-transition, supported-closure, admission, observation, and stimulus-list correspondence remain unresolved
- general multiple-enabled closure without an explicit semantic choice or checked commutation argument
- replay/host-attempt stability as a Lean proposition
- general or repeated scopes, nested/heterogeneous/decimal values, effect faults, catch-all/multi-handler/ancestor Error search, expression languages, or exceptional propagation beyond one direct parent
- TypeScript or Temporal correspondence proof
- arbitrary BPMN XML parsing

### TypeScript semantic core

- I/O, byte-level parser, Temporal SDK, CIB dependency, JUEL/XPath/FEEL/script grammar or evaluation, conditional-evaluation receipts, form schema or validation, general BPMN state model, raw source-binding interpretation, effect execution or transport digest, integer/list execution outside exact M6 User Task completion, nested or heterogeneous values, general mapping expressions or scope nesting, Call data or generalized definition graphs, general faults or Error propagation beyond one direct parent, timer forms or races beyond the exact capsule, semantically material nondeterministic scheduling, arbitrary graph execution

### BPMN conformance

- Line-by-line exhaustive Process Execution denominator, arbitrary compositional graph or nested-scope admission, broad Activity/Event/Gateway/scope/data coverage, percentage-complete claim, or conformance claim

## Evidence owners

The Lean modules under [`BpmnSemantics/`](../BpmnSemantics/), the pure core under [`packages/semantic-core/`](../packages/semantic-core/), the [capsule registry](capsules/README.md), registered scenarios, requirement ledger, and differential pipeline bind the current claims. [TESTING-SPEC.md](TESTING-SPEC.md) owns the gate contract.

## Nearest unsupported claims

- **Sequential Multi-Instance:** close standard Activity and Multi-Instance lifecycle, bounded collection input, per-iteration occurrence and data identity, declaration order, completion accounting, cancellation, stable progress, replay, and exact output aggregation. Use CIB Seven only for separately classified public-lifecycle evidence. Sequential execution precedes parallel execution because it establishes repetition and identity without hiding them inside concurrency.
- **Parallel Multi-Instance:** reuse the sequential iteration model while adding bounded concurrent child ownership, completion conditions, deterministic aggregation, optimistic-retry invariants, whole-body cancellation, and race schedules. Separating evidence must cover completion/cancellation races, duplicate children, lost aggregation, Worker replacement, and replay rather than only a happy-path fan-out.
- **Data and executable Tasks:** in separate prerequisite-ordered capsules, broaden standard DataInput, DataOutput, Data Association, scoped mapping, and Activity data lifetime before selecting Script Task, Business Rule Task, or Send Task execution profiles demanded by independent whole-model families. Language runtimes, DMN, outbound transport, and CIB bindings remain explicit overlays or host effects; none may silently enter the pure semantic core.
- **Event subscriptions and scope handlers:** establish reusable subscription lifetime, payload and correlation identity, modeled throw/consume behavior, cancellation, and deterministic races before broadening boundary handlers and adding interrupting then non-interrupting Event Subprocesses. Message, Timer, Signal, Error, and Escalation triggers remain distinct propositions even when they reuse one kernel.
- **Compensation and Transactions:** define completed-work registration, required state snapshots, handler selection, dependency or reverse ordering, cancellation, failure, and replay before admitting Compensation, Transaction Subprocess, or Cancel Event shapes. This follows scope, data, repetition, and event foundations because it depends on all four.

- **Call Activity:** a second or repeated invocation of the same called Process. Deployment or version and tenant resolution, mappings, per-instance data, recursion, exceptional completion, cancellation, and Temporal Child Workflow identity stay outside. See [the capsule](capsules/CALL-ACTIVITY-SPEC.md).
- **Message Start:** one external publication matching multiple independent Message Start Events or definition versions. Routing, fanout, selected-start identity, and retry-transparent exactly-once policy stay outside. See [the capsule](capsules/MESSAGE-START-EVENT-SPEC.md).
- **Timer Start:** one external resolved occurrence for the exact top-level registered `PT1S` profile is implemented and evidence-closed with an answer-free scenario, runnable example, differential evidence, and a live one-action Schedule witness using the opaque service-returned execution identity. Recurrence, calendar forms, multiple starts, Schedule lifecycle, Product 2 scheduling, and silent latest-definition retargeting stay outside. See the [specification](capsules/TIMER-START-EVENT-SPEC.md).
- **Terminate End:** one exact nested Terminate End cancels only its containing embedded Sub-Process occurrence and then reuses ordinary parent continuation. Termination inside a called child Process is outside because it must compose selected-scope cancellation with Call return while preserving concurrent caller work. See the [specification](capsules/TERMINATE-END-EVENT-SPEC.md).
- **Receive Task:** an addressless or operation-addressed, instantiating, data-bearing, correlated, or repeated Receive Task. See [the capsule](capsules/RECEIVE-TASK-MESSAGE-SPEC.md).
- **Sub-Process boundary Timer:** a deadline on a Sub-Process holding more than one child task. That is where this profile's single-child coincidence between the child's last consumed token and scope quiescence stops holding, so the withdrawal rule stated over quiescence becomes separately falsifiable rather than accidentally correct. See [the capsule](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md).
- **Non-interrupting boundary Timer:** a deadline that fires more than once, which `timeCycle` admits and Table 10.91 contemplates. A second firing makes the element-identity-to-activation join ambiguous, so a capsule admitting repetition must add the occurrence record rather than inherit the argument. See [the capsule](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md).
- **Error:** handler search beyond one exact match attached to the directly enclosing embedded Sub-Process. Catch-all matching, multiple candidates, ancestor propagation, unmatched outcomes, Event Sub-Processes, payload mapping, and concurrent command races stay outside. See [the capsule](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md).
- **Expressions:** conditional routing beyond the exact Simple Boolean profile. JUEL remains demand-driven, deferred, and separately classified.
- **Service Task incidents:** one literal-generation-1 report/retry account and one successor-only incident-gated hosting-root cancellation are implemented across CIB, Lean, the core, and Temporal. Product 2 implements bounded operations without semantic authority. A second incident, arbitrary retry policy, exception data, general or native cancellation, compensation, and arbitrary repair remain outside.
- **Runtime wait identity:** stated but not preserved. `waitIdentitiesUnique` names cardinality one over each wait family's occurrence key, and `key_absent_after_erase` turns it into withdrawal finality for any reflexive key matcher, so the Timer stale-identity laws are quantified rather than finite. They still take uniqueness as an explicit hypothesis: no theorem establishes that a state reached by execution satisfies it, because preservation across the registered transition arms is unimplemented. That preservation is the nearest unsupported claim behind every law consuming the conjunct, and the reopen trigger here. A narrower absence is stated where it is used: the caller's program cannot decide whether a *called* instance's wait is declared.
- **Strongest unresolved proof claim:** full observational checked-source-to-program-run preservation. [The bounded experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) retains a provisional direct account, a renamed positional-lowering discriminator, and accepted bounded structural and frontier results, but no run theorem. Production work uses the targeted preservation boundary in [the IL specification](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations); the general theorem reopens only when a second capsule needs the same proposition.
- **Unsupported across families:** arbitrary serial composition, arbitrary graph progress, repeated or nested scope activation, cycles outside the exact registered root-scope User Task profile, concurrent Multi-Merge execution, Standard Loop Characteristics, executable sequential or parallel Multi-Instance semantics, Message payload, key, and global correlation, compensation, and general Event semantics.

## Runtime-state well-formedness

The runtime-state invariant states which `RuntimeState` values the account admits as one executable predicate rather than prose, adding no BPMN capability or observation.

**Implemented.** `runtimeStateWellFormed`, indexed by program and expected instance identity. It names new sub-predicates for lifecycle emptiness, owner liveness across every wait and hidden-record collection, per-family wait-identity uniqueness, hosted wait declaration, the `selectMany` and `awaitEventRace` halves of hidden-record declaration, and canonical collection order.

It consumes lifecycle agreement, occurrence uniqueness, scope and token binding, the hosting-root count, and the event-race and incident associations from predicates that already owned them. `RuntimeStateMonotone` and `RuntimeStateTimeMonotone` are separate relations. `RSI-OBL-01` and `RSI-OBL-02`, both under an assumed `runtimePositionValid` of the state each concludes about. Quantified withdrawal finality and its boundary-Timer consequence. Kernel-decided negatives per added conjunct, carried cross-language. An independent TypeScript validator on the fail-closed `admit` path with a five-schedule preservation lane, and a Workflow-continuation witness for recovered time against live deadlines.

**Absent.** Quantified Lean preservation and monotonicity, `RSI-OBL-03` through `RSI-OBL-06`: a **deliberately open** lane under [the assurance-lane rule](PROJECT-DESIGN.md#lean-assurance-lane). Reason, measured: preservation of the uniqueness conjunct alone reaches ninety-one wait-collection assignment sites across fifteen semantic modules, and a freshly armed wait's key needs `RSI-MONO-04`, which the relation does not state. For arms beyond the two standing consumers, proving without a consumer also buys no falsifiability. Reopen trigger: a consumer needing a stated conjunct discharged, which both boundary-Timer deferrals already are and which is therefore unmet demand rather than a future event; a capsule needing a fact the list lacks; or a new operation kind or stimulus.

Every Lean law consuming `waitIdentitiesUnique` therefore assumes it. Execution witnesses are absent for exactly two conjunct branches, measured rather than inferred: the effect wait and effect incident branches, which no schedule reaches, and the instance scoping on declaration, whose only witness is a hand-built incident state. The Message, Timer, event-race, selected-branch, and called-record branches are reached by the registered schedules. Three rules are implemented narrower than their stated propositions: `RSI-BIND-04` filters to hosting-instance waits, `RSI-BIND-05`'s called-record clause is decided nowhere, and `RSI-MONO-04` is not stated.

## Activity occurrence ownership

One runtime record per Activity occurrence that owns runtime state beyond its body, replacing the activation-ordinal agreements three boundary-Timer families used to recover their pair. [The proposal](ACTIVITY-OCCURRENCE-OWNERSHIP-PROPOSAL.md) owns the account. It adds no BPMN capability, operation kind, profile, scenario, or public observation field.

**Implemented.**

- `ActivityOccurrence` in both languages, with an identity distinct from `OccurrenceId` by field name so no task identity is substitutable for it, a closed two-arm body union, and a listed attached-Timer collection
- five of six enumerated TypeScript derivation sites read the record, the four transition owners across all three families plus the open-set publication binding, and all three Lean family modules do as well. Both declarative relations that carried an activation-ordinal hypothesis now take the shared `RecordJoins` premise
- regional cancellation withdraws every record whose owner or body lies in the region together with the waits those records list; the bounded-scope deadline arm's hand-written withdrawal is gone as redundant
- the adapter pairs a boundary deadline through the record instead of whole-state wait cardinality, and the Workflow continuation decoder admits and structurally validates both new fields
- Lean carries the representation, canonical order, lookups, region partition, and withdrawal-completeness laws
- the well-formedness predicate gains body liveness, attached-wait unambiguity, identity uniqueness, owner agreement, canonical order, and lifecycle emptiness in both languages, each with a negative whose siblings are asserted intact

**Absent.**

- the sixth derivation site is deliberately exempt rather than migrated. [The publication completeness relation](../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) is an independent reconstruction pairing through the private retained anchor relation, never through state differences, so the producer's records would make it share the mechanism it checks
- that exemption's reopen trigger is close: under any admitted repetition the record and the ordinal reconstruction would legitimately disagree, and it would reject a correct publication
- body turnover is withdrawn as unreachable, since no registered family replaces a body; it belongs to sequential Multi-Instance. The effect body arm is unreachable and absent for the same reason
- preservation of the new conjuncts across the registered transition arms inherits [the deliberately open lane](RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) and is not re-declared

**Absent in evidence.**

- both first reds are state-level negatives, because no public transition produces either state: every profile admitting a boundary deadline admits exactly one Activity armed exactly once
- the reachable schedule-level evidence is conservation, byte-identical retained results across the three families' six registered scenarios, which says nothing changed rather than that anything improved
- positive schedule-level evidence for the join reduces to the enumerated five-producer guard with its one exempt oracle
- no fixture rewinds `activityActivations`, so the new monotonicity family is asserted only positively by the five-schedule preservation lane. Both languages carry the family in their regression oracle; neither carries a negative that would fail if the family were dropped from it
- nothing refuses two records naming one body, so the account admits a state on which every body-keyed lookup degrades to `none`. The body-side determinism theorem therefore carries its at-most-one bound as an explicit hypothesis rather than drawing it from a conjunct. This absence differs from every other one listed here in having **no admission trigger**: two records on one body is not something a future capability produces, it is a defect the fail-closed gate would catch, so no roadmap item will force it to surface. Its trigger is the next deliberate pass over the gated defect classes, named here because otherwise it stays unexamined precisely because nothing reaches it
- one defect label carries two rules: an owner disagreement under `AOO-OWN-01` is reported as the body-absence class, because the predicate pushes that label for both body liveness and listed-Timer liveness. The cross-owner test asserts only that the defect list is non-empty, so nothing pins the distinction
- the two languages' stranding negatives are not negatives of the same state. Lean's is built over the bounded User Task fixture, whose owner and body share a scope, which is the arm where the stranding class cannot arise; the child-scope arm that actually strands a parent-owned deadline is covered only on the TypeScript side
- the continuation witness the Temporal preflight names does not exist. The only continuation fixture carries an empty record collection, so the populated branch of the continuation decoder and the two-arm body union are exercised by no test, and the mutation that carries a record across Continue-As-New without its body has no oracle on that path. The refusal itself is wired and gated; what is absent is the witness
- the called-instance removal route has no executable schedule, because no registered program composes regional cancellation with a Call Activity. Its record filter is held by [a source-derived completeness guard](../scripts/runtime-collection-removal-completeness.test.ts) that derives the required collections from `RuntimeState`, and by Lean's quantified `cancelScopeSubtree_retains_no_withdrawn_record`, whose region predicate unions the subtree with the called-instance closure
- three cancellation routes reach a bounded region without being composable with one today: Error interruption, incident-gated cancellation, and `terminateScope`

## Interrupting Activity boundary Timer

The [interrupting Activity boundary Timer specification](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) is **implemented and evidence-closed** for one interrupting exact-`PT1S` deadline on a User Task.

**Implemented.** Source, checked graph, `AwaitBoundedUserTask` lowering, Lean, the independent core, both registered victory routes, Worker-absence durability, shared-activation refusal, replay, and product examples are green.

**Absent.** In Lean, the quantified stale-identity account is conditional and stops at unfindability. `bounded_task_victory_withdrawals_are_final` states over every state and both victory arms that each victory withdraws a live task and a live deadline and that no remaining wait carries either withdrawn key, but it **assumes** key uniqueness rather than deriving it: the `waitIdentitiesUnique` conjunct names the fact and its preservation is unproved, so the law does not yet apply to a state reached by execution. It also does not state the refusal *outcome* of the later stimulus, because that outcome belongs to the dispatcher and one law spanning both accounts would depend on both; the rejected outcome and exact state preservation remain finite checked witnesses beside the core's independent refusal.

**Absent in evidence.** No target can present an off-deadline firing because the host derives the firing instant from committed state. The abandoned Activity's stale completion has no non-racing delivery mode after its task disappears. CIB observation is not selected. The shared-activation refusal identity reaches the Workflow result and Event History, but not a caller awaiting the completion Update.

## Non-interrupting boundary Timer

The [non-interrupting boundary Timer specification](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md) is **implemented, evidence-closed, and graduated** for one exact-`PT1S` firing that preserves its User Task host.

**Implemented.** Source admission resolves `cancelActivity` into the closed `BoundaryInterruption` value, and the sibling profiles remain disjoint. The `awaitMonitoredUserTask` operation, Lean, the independent core, two registered schedules with mutations, Worker absence, shared-activation refusal, and replay are green. Firing keeps the monitored task live, spawns exactly one boundary task, and closes after both one-sided completions.

**Absent.** CIB observation is not selected. Repeated firing is outside the slice and would require an occurrence record before the one-sided join could remain unambiguous.

## Interrupting Sub-Process boundary Timer

[The interrupting Sub-Process boundary Timer specification](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md) is **implemented, evidence-closed, and graduated**, for exactly one embedded Sub-Process with one child task and one interrupting `PT1S` boundary Timer. That capsule owns the full exclusion set and is not restated here.

**Implemented.** The source, checked graph, `enterBoundedScope` wire operation, independent Lean and core arming and victory transitions, two registered routes with mutations, distinct shared-activation refusal, Worker-absence durability, and replay are green. The host reuses the family-parameterized boundary deadline scheduler while retaining a distinct refusal identity.

**Absent.** In Lean, and owned only here, the quiescence bridge takes `running` and `bounded`, hypotheses its own transition does not establish. The deadline arm's `parentOwned` is **discharged**: it asserted that regional cancellation left the parent-owned deadline in `timerWaits`, which was true only because the deadline sat outside the cancelled subtree, and the Activity occurrence record now withdraws it there. `deadline_arm_bridge_premise_is_satisfiable` went with the premise it witnessed. With no non-evaluator premise left, that bridge is a dispatcher check and is not cited as a semantic lane; withdrawal on the arm rests on the quantified `cancelScopeSubtree_withdraws_listed_timers` instead.

**Absent in Lean soundness.** `BoundedScopeVictoryStep` is **not** wired into the global `ProgramStep` soundness; only `BoundedScopeArmingStep` is. The relation-level logical-time law is a joint bound over both arms rather than a law separating them.

**Absent in evidence.** CIB observation is not selected. Off-deadline and stale-child witnesses remain outside the registered schedules because no Temporal target can present them without replacing committed deadline derivation or racing task disappearance; Lean and the focused core test carry those refusals.
