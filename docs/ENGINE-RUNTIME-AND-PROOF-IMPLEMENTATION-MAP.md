# Engine runtime and proof implementation map

This detail map owns the exact current cross-cutting runtime, scope, Lean, TypeScript semantic-core, and BPMN-conformance boundary. Per-family capsule-delegated status is owned by [`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md). Root routing and cross-area claims remain in [`implementation-status-router`](IMPLEMENTATION-MAP.md).

## Current boundary

Lean and the independently written TypeScript core execute the reviewed Semantic Process account over immutable serializable state. Closed families remain profile-bounded; no evidence establishes general BPMN execution or a cross-target correspondence theorem.

Exact BPMN bytes admit through a checked project-owned graph to the [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md), which a Lean reference interpreter and an independently written TypeScript semantic core each evaluate, and which a Temporal adapter hosts durably. The closed semantic families are Parallel fork/join, Exclusive Gateway over the project-owned Boolean expression language, Inclusive Gateway, Event-Based Gateway, cyclic control flow, Call Activity, embedded Sub-Process completion and Error propagation, Message Start, Timer Start, Intermediate Catch Timer and Message, Message-addressed Receive Task, Terminate End, Service Task effects, configured Task effects, scoped runtime data, User Task start and completion data, bounded sequential and parallel Multi-Instance User Tasks, and the three boundary-Timer loci including one non-interrupting route.

The Terminate End profile implements selected-occurrence-retaining containing-scope cancellation through strict source, checked `terminateEndEvent`, no-output `terminateScope`, Lean, core, differential evidence, and passive Temporal hosting. CIB evidence and Product 2 cancellation remain absent.

Configured Task retains distinct checked identity and lowers its exact binding to the existing Activity/Probe effect. Lean, core, differential, live Temporal, and CIB pass-through exclusion evidence are green; CIB compatibility and public effect-completion ingress remain absent.

The [Boolean Process-data specification](capsules/BOOLEAN-PROCESS-DATA-SPEC.md) admits Boolean only for exact completion in one sequential User Task profile, with green schema, Lean, core, CIB, differential, live Temporal, history, and replay evidence. Start and older profiles remain string/null-only; Product 2 consumes no new fact.

The [sequential metadata specification](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md) carries optional literal assignment/form metadata through checked source, `awaitUserTask`, wait, and public task. Its [parallel composition](capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) binds both tasks of one balanced graph to empty Start data and the existing runtime. Lean, core, CIB, differential, Temporal/replay, mutation, corpus, and production-journey evidence are green. Product 2 consumes only published task/form facts through M3 Work.

The first interchange composition reuses the sequential User Task Process-data account while source admission retains standard notation. Lean/core results and live Temporal replacement, history, and replay agree. It adds no runtime field, IL operation, transition, observation, or CIB interpretation.

The [Activity data-input capsule](capsules/ACTIVITY-DATA-INPUT-MEDIATION-SPEC.md) makes one User Task's entry depend on Process *data*. Lean, core, and public-observation evidence are green for readiness, the occurrence-owned copy, the absence-versus-null discriminator, and atomic disposal. It also produced the first stable state that is Running with a token and no ingress, which separated publication from progress across every profile.

The Message payload catch checkpoint is approved and its pure TypeScript lane executes. The distinct operation arms the existing Message-wait shape, the profile publishes the payload-bearing interaction, scalar payload delivery routes through the Event-owned association target in one atomic transition, and payload-free, collection, wrong-channel, wrong-occurrence, and stale deliveries preserve exact state. Lean, JSON Schema, differential, corpus, and Temporal lanes remain open.

`INTERNAL-COMMUTATION` requires a closed Program scheduling mode; existing profiles select reject. TypeScript atomically closes a pairwise-independent ordinary User Task, Message, Timer, or effect frontier and refuses an oversized batch before mutation. Lean retains the exact-pair proofs, adds the complete-frontier classifier, and checks all six orders of three tasks. The checkpoint is independently approved; scheduled choice, regions, other families, and arbitrary-batch proof remain absent.

## Implemented

### Runtime scoped data

- One immutable Lean/TypeScript representation with Process bindings and private local bindings owned by distinct complete effect or Activity occurrence arms
- effect activation creates the owned input scope; direct Activity data-input arming creates the Activity-occurrence-owned copy of one Process binding
- success and matching Error completion require one exact owner, apply program-owned output mapping, and remove only that scope atomically
- Process-only canonical variable projection; the selected one-element input collection of a live data-bearing task is the sole Activity-local fact reaching public observation
- an Activity-owned scope of any cardinality but one publishes no input collection in either account, exactly as owning no scope does, rather than truncating a larger collection or failing the projection
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
- responsibility-split kernel-decided admission, profile, binding, lowering, runtime-closure, and evaluator conformance modules
- a separate `runtimeStateIdentityBound` owner over User Task, Timer, and Activity identities, composed into `runtimeStateWellFormed`, with one kernel-decided negative per implemented family and the existing exact-attribution fixtures split into independently memory-bounded Activity and remaining-state owners
- body-claim uniqueness and guarded writer preservation, consumed by unconditional Parallel Multi-Instance entry, progress, final, early, and Timer preservation
- Activity-only `RSI-ISSUE-01` in `RuntimeStateMonotone`, independently checkpoint-approved with issuer-root freshness, predecessor-identity preservation/removal proofs, and a three-state exact-reissue negative
- generic scope-owned token, occurrence, wait, selected-branch, called-Process, and scoped-variable runtime with canonical public projection
- declarative execution relations with per-capsule evaluator soundness, plus proposal-bound cross-language operation-family and RuntimeState atom-domain classification that enables no transition or footprint
- independent decoding, lowering, execution traces, refusal or preservation facts, and non-laws for every closed family named in [the current boundary](#current-boundary); the three boundary-Timer proof boundaries remain explicit in their sections below
- cyclic-control-flow proofs for exact checked/program graph policy and lowering, full-cycle interception by the selected cut, general per-offered-token merge relation, unique-offer evaluator soundness, actual execution of every finite reviewed repeat/rework schedule followed by exit, actual-reachability active-unit bounds, automatic cut-DAG closure at no more than six operations, stale/wrong/future identity preservation, and excluded internal-cycle, fan-in, scope, and wait shapes
- Message Start proofs for strict checked/program/stimulus decoding, exact source-to-IL channel and root binding, distinct Message initiation, fresh root occurrence and outgoing-token production, wrong-operation refusal with exact state preservation, bounded closure to the existing User Task wait, and excluded second start or passive-subscription interpretations
- Timer Start proofs for strict checked/program/stimulus decoding, exact source-to-IL Process/Start Event/duration/output binding, distinct Timer initiation, fresh root occurrence and outgoing-token production, wrong-identity refusal with exact state preservation, exact closure bounds and stable User Task resumption, normalized post-initiation observation agreement with None and Message starts, and excluded non-`PT1S` or recurring interpretations
- Terminate End proofs for exact checked/program admission and lowering, reusable selected-root-retaining subtree cancellation, every represented owner family, aggregate End increment and unrelated-state preservation, root and nested completion, stale and multiplicity refusal, exact 5/3/2 closure bounds, strict decoding, and global-versus-incomplete cancellation non-laws
- configured Task proofs for strict source binding, distinct checked identity, exact checked/program admission, endpoint lowering to the existing Probe effect, normalized Service Task control-shape agreement, exact effect-to-User-Task closure, occurrence refusal, descriptor drift, and pass-through non-laws
- Activity data-input proofs for both declarative relations and their evaluator soundness, unavailable-source refusal, Process-scope preservation, exact copy into the freshly minted Activity scope, single-scope disposal, undeclared-task refusal, `RSI-ISSUE-01` issuance with body-claim preservation, and kernel-decided invoice-review witnesses separating absence from explicit null
- Activity data-output proofs for both declarative relations and their evaluator soundness, token-only activation arming one empty Activity scope, exact-id fill with every other submitted name refused, association-decided write with Process-binding preservation elsewhere, unavailable required output refusal, single-scope disposal, fresh-activity issuance and identity discipline, and kernel-decided credit-underwriting witnesses separating a routed write from a name-merged one and refusing the merged-identity program
- E2 proofs for exact optional metadata admission, source-independent lowering, committed wait and public projection, completion equivalence across arbitrary admitted metadata and submitted patches, refusal preservation, strict JSON identity, boundary-space and literal restrictions, metadata-free byte omission, and old-profile exclusion
- proved incident report/retry relations and evaluator soundness, exact wait suspension and restoration, public projection, quiescence blocking, resumability, runtime-context preservation, typed refusal, old-profile and cross-program fail-closed admission, strict JSON identity, and success/BPMN-Error separation
- bounded internal closure for one enabled operation or one exact-two non-interfering ordinary arming pair, with proved intermediate invariants, opposite-arm enabledness, raw-state equality, and canonical actual publication; every unsupported, colliding, or differently sized multiple-enabled shape remains ambiguous
- one catalog-driven result emitter that consumes and echoes answer-free scenarios, with strict role decoders and independent cross-artifact validation
- the separately gated checked-source experiment with bounded structural, decomposition, reachability, and enabled-frontier results
- proved committed-transition trace/replay, control positions/deltas, nonpublication failures, and source-compiled TypeScript parity

### TypeScript semantic core

- Dependency-free Semantic Process contracts
- shared safe-string admission, Unicode scalar ordering, and deeply immutable profile, program, runtime, stimulus, and result data
- topology-independent structural validation plus exact profile definition-scope and operation-kind cardinality
- pure exhaustive execution of the closed Semantic Process operation union, with operation-ID-stable internal closure independent of program collection order
- explicit scope-occurrence ownership over token multiplicity, child and called instances, selected branches, and canonical task, Message, timer, effect, and variable projections
- an independently structured `runtimeStateIdentityBound` over User Task, Timer, and Activity identities, reported as the gated `LiveIdentityAboveCounter` defect and exercised by command-admission and Workflow-continuation refusals
- an operation-kind-independent `ActivityOccurrenceIssue` oracle over every current issuer, exact reissue/rearm controls, and a writer census that rejects missing classification or evidence
- a distinct gated `DuplicateActivityBodyClaim` defect over exact cross-record task and child-scope aliases
- independent evaluation, exact refusal, hidden-state non-projection, and bounded closure for every closed family named in [the current boundary](#current-boundary), including both data mappings and both Error routes
- registered cyclic-control-flow admission and execution with one shared frozen graph policy, a reusable nonempty Exclusive Merge contract, profile-local exact-three restriction, owner-preserving unique-offer execution, and zero/multiple-offer evaluator incompleteness kept distinct from the declarative relation
- registered Message Start admission and execution with a distinct exact-target stimulus, one fresh root occurrence, generic canonical nonempty outgoing-token production, profile-local exact-one output, and no subscription or payload
- registered Timer Start admission and execution with a distinct exact-target stimulus, one fresh root occurrence, generic canonical nonempty outgoing-token production, profile-local exact-one output, exact refusal and 2/1 closure bounds, stable User Task resumption, normalized cross-start observation equality, and no runtime Timer or clock state
- registered Terminate End admission and execution with no external stimulus, selected-occurrence-retaining subtree cancellation, exact higher-level preservation, aggregate End increment, unchanged scope completion, exact refusal, and 5/3/2 closure bounds
- registered configured Task admission and execution with exact checked descriptor binding, the existing payload-free Probe effect, effect-only initial exposure, occurrence-only refusal, trailing User Task continuation, and no runtime, stimulus, state, or observation widening
- exact Process-start installation and atomic User Task completion merge over the shared five-arm representation, with profile admission at deployment and live commands
- the interchange composition profile reuses that exact String/Null Process-start and User Task completion behavior with the existing acyclic sequential User Task graph and adds no runtime or observation branch
- registered Activity data-input admission and execution with data-dependent readiness, atomic wait/record/scope arming, duplicate-name unavailability, empty-completion disposal, non-empty-submission and stale refusal, an equal-coordinate effect-scope negative, and a fail-closed commutation footprint
- registered Activity data-output admission and execution with token-only entry, an empty Activity scope armed at entry and disposed with the occurrence, exact-id fill fused with the association so the target Property rather than the submitted name receives the value, zero-binding and extra-binding and wrong-name and stale refusal with exact state preservation, a merged-identity program refusal, an equal-coordinate effect-scope negative, and a fail-closed commutation footprint
- registered pure-core Message payload catch execution with an operation-addressed channel, exact Event-owned direct-output identities, content-bound payload stimulus equality, ordinary Message-wait arming and lifecycle publication, profile-selected payload-bearing interaction, scalar-only routed Process binding, atomic wait withdrawal and token production, and exact-state refusal for absent, collection, wrong-channel, wrong-occurrence, and stale delivery
- registered E2 metadata admission and independent preservation through checked User Task, ordinary operation, committed wait, and public projection, with passive completion, exact refusal preservation, strict wire values, and old-profile exclusion
- registered literal-generation incident report and exact retry transitions, private and public association validation, incident-aware quiescence and resumability, and pre-dispatch refusal of malformed or cross-program injected incident states
- adapter-facing projection, structural stimulus validation, command identity, effect-transport material, incremental deployment and advancement, and complete scenario evaluation
- executable complete-enabled-set closure classification through pre-state-derived read, write, and publication footprints for exact pairs of ordinary User Task, Message, Timer, and effect arms, plus an independent both-order state/publication oracle and ambiguity refusal for unsupported, colliding, malformed, stranded, or differently sized frontiers
- stable-state classification separated into structural soundness, which gates committed publication and the incident projection, and resumability, which additionally requires a live ingress and gates Run-boundary continuation
- traced committed transitions/replay and fail-closed control-position projection, with unchanged canonical observations and Lean parity

### BPMN conformance

- Primary engine roadmap and ultimate Process Execution Conformance target are explicit
- the disposition ledger records thirteen first-pass mechanism families and reviewed requirements separately from CIB and A12 coverage
- implemented bounded mechanisms cover sequential User Task lifecycle/refusal, per-incoming-flow parallel synchronization, one Simple Boolean Exclusive Gateway, one structured Inclusive split and selected-subset join, one exact operation-addressed Message-versus-`PT1S` Event-Based Gateway race with bounded durable refinement, one exact Intermediate Catch Timer, one operation-addressed payload-free Intermediate Catch Message subscription, one scalar-payload Intermediate Catch Message with one Event-owned association in the pure core, one direct-Message payload-free Receive Task, bounded successful Service Task execution, one exact configured external-effect Task extension, bounded string/null input/output mapping, one exact-code attached interrupting Service Task Error route, ordinary one-level embedded Sub-Process completion, one direct-parent exact-code Error End propagation with regional cancellation, and one exact nested Terminate End that cancels only its containing Sub-Process occurrence before ordinary parent continuation

## Explicitly absent

Two profiles preserve one internal standard-notation capability without execution. The BPMN data family is rejected. Only the bounded User Task cycle is cyclic. Only M6 User Task completion admits integers. String-list values are confined to M6 completion and exact profile-gated sequential Multi-Instance start/output; Product 1 owns no form semantics. The closure-reviewed [Service Task incident and retry specification](capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md) owns one literal-generation-1 incident and exact retry. Its successor adds exact incident-gated hosting-root cancellation only; it excludes general BPMN/operator or native Temporal cancellation, compensation, other incident generation, and Product 2 action state.

The identity bound excludes Message, Effect, Event race, Call, ordinary Scope, and called roots. Only Activity issuing is checkpoint-approved; other issuing disciplines and general preservation remain absent.

Neither Activity data profile carries the other's direction on one Activity, a second `DataOutput` or `OutputSet`, an optional or while-executing output, another data-bearing Task host, a collection, a transformation, an expression runtime, or a later data-ingress command. A Process waiting on an absent source stays durably Running; that is a recorded liveness limitation, not a hidden retry.

The exact sequential Multi-Instance User Task profile is implemented and execution-registered across Lean, the TypeScript core, public progress, E1/E2 publication, the differential pipeline, and the Temporal Workflow chain. Its controller representation, derived quantities, four well-formedness obligations, escape-aware bounds, named counterexamples, and measured mutations belong to [the capsule](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) rather than to this map.

- **absent:** quantified four-arm well-formedness preservation; its decided instance is not general

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
- scheduled choice and complete multiple-enabled closure beyond the ordinary arming-family footprint checkpoint
- replay/host-attempt stability as a Lean proposition
- general or repeated scopes, nested/heterogeneous/decimal values, effect faults, catch-all/multi-handler/ancestor Error search, expression languages, or exceptional propagation beyond one direct parent
- TypeScript or Temporal correspondence proof
- arbitrary BPMN XML parsing

### TypeScript semantic core

- I/O, byte-level parser, Temporal SDK, CIB dependency, JUEL/XPath/FEEL/script grammar or evaluation, conditional-evaluation receipts, form schema or validation, general BPMN state model, raw source-binding interpretation, effect execution or transport digest, integer execution outside exact M6 User Task completion, String-list values outside M6 completion and the exact Multi-Instance profile bindings, nested or heterogeneous values, general mapping expressions or scope nesting, Call data or generalized definition graphs, general faults or Error propagation beyond one direct parent, timer forms or races beyond the exact capsule, semantically material nondeterministic scheduling, arbitrary graph execution

### BPMN conformance

- Line-by-line exhaustive Process Execution denominator, arbitrary compositional graph or nested-scope admission, broad Activity/Event/Gateway/scope/data coverage, percentage-complete claim, or conformance claim

## Evidence owners

The Lean modules under [`BpmnSemantics/`](../BpmnSemantics/), the pure core under [`packages/semantic-core/`](../packages/semantic-core/), the [capsule registry](capsules/README.md), registered scenarios, requirement ledger, and differential pipeline bind the current claims. [TESTING-SPEC.md](TESTING-SPEC.md) owns the gate contract.

## Nearest unsupported claims

- **Sequential Multi-Instance breadth:** another Activity body, loop cardinality, completion conditions, non-direct mappings, expressions, other value types, repeated or nested controllers, another Boundary Event, and a CIB Multi-Instance profile remain outside the exact registered User Task slice.
- **Parallel Multi-Instance breadth:** another Activity body, data shape, completion expression, partial output account, nesting, repetition, Complex behavior, another Boundary Event, or CIB profile remains outside the exact registered User Task slice.
- **Data and executable Tasks:** the nearest unsupported claim is one Activity that both consumes and produces data, which requires deciding whether the input and output capsules' local scopes coexist in one occurrence and how the published input collection behaves when they do. In separate prerequisite-ordered capsules, broaden standard DataInput, DataOutput, Data Association, scoped mapping, and Activity data lifetime before selecting Script Task, Business Rule Task, or Send Task execution profiles demanded by independent whole-model families. Language runtimes, DMN, outbound transport, and CIB bindings remain explicit overlays or host effects; none may silently enter the pure semantic core.
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
- **Unsupported across families:** arbitrary serial composition, arbitrary graph progress, repeated or nested scope activation, cycles outside the exact registered root-scope User Task profile, concurrent Multi-Merge execution, Standard Loop Characteristics, Multi-Instance beyond the exact registered sequential and parallel slices, Message payloads beyond the exact single-output catch-Event profile, Message key and global correlation, compensation, and general Event semantics.
