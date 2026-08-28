# Internal commutation proposal

## Status

Lifecycle: draft
Review: pending

## Decision question and boundary

What is the smallest reusable rule that lets bounded internal closure advance every simultaneously enabled, observationally independent operation and represent every residual observable choice without treating program collection order as BPMN scheduling meaning?

The implemented first `INTERNAL-COMMUTATION` Beta risk checkpoint replaced the constructor-specific exception for exactly two distinct `awaitUserTask` operations with one semantic-footprint criterion over an exact two-operation frontier. The checkpoint covers ordinary `awaitUserTask`, `awaitMessage`, `awaitTimer`, and `awaitEffect` arming operations in Lean and the independently written TypeScript core. It added no BPMN source shape, profile capability, Semantic Process operation, RuntimeState field, stimulus, public wire field, Temporal host capability, MUE content ID, or support claim.

The full MUE content obligation remains open after that checkpoint. This amendment selects the final-closure account for larger enabled sets, every current operation family, and explicit choice representation while leaving the implemented checkpoint unchanged. It adds no BPMN construct or newly admitted topology. The amended account requires a new cold proposal verdict before implementation resumes.

## Existing risk

[The Semantic Process contract](SEMANTIC-PROCESS-IL-SPEC.md#internal-scheduling) requires every material internal choice to be explicit or observationally irrelevant under exact hypotheses. Production closure currently recognizes only one exact pair of distinct ordinary User Task arms. Its check names operation constructors and three identifiers, but does not state the semantic resources each transition reads and writes. Adding another operation kind by extending that checklist would repeat the mechanism without establishing why the pair commutes.

Canonical operation-ID selection is necessary for reproducibility but is not evidence of commutation. Sorting two conflicting transitions merely makes one conflict deterministic. The deciding rule must establish non-interference before the selector may use canonical order.

## Implemented checkpoint semantic-footprint rule

Each candidate transition receives a dynamic `InternalTransitionFootprint` derived from the admitted program, the exact pre-state, and the operation before its successor is selected. The footprint contains canonical sets of tagged semantic atoms, split into `reads`, `writes`, and `publications`. Shared reads are permitted. A pair is non-interfering only when neither side's writes intersect the other side's reads or writes and the publication keys are distinct.

The checkpoint state-atom vocabulary is closed:

- `controlToken(owner, place)` for one exact token unit whose presence enables the operation and whose multiplicity is decremented;
- `scopeOccurrence(owner)` and `runtimeControl(instance)` for owner liveness and the exact running Process instance;
- `logicalTime` for Timer deadline calculation;
- `activation(kind, elementId)` for the per-family counter value that mints the next occurrence;
- `wait(kind, occurrence)` for absence of, and insertion of, the complete User Task, Message, Timer, or effect occurrence;
- `openWaitAnchor(occurrence)` for absence from, and addition to, the actual derived untagged public wait-anchor domain shared by User Task, Message, Timer, effect, and incident occurrences;
- `activityVariableScope(effectOccurrence)` for absence of, and insertion of, the complete effect-owned local scope, including an empty scope;
- `activityVariable(effectOccurrence, name)` for every literal input binding inserted into that local scope.

The closed publication-atom vocabulary is `committedTransition(operationId, kind, origin, owner, logicalTime, positionDelta)`, `flowNodeLifecycle(waitAnchor(occurrence))`, and `publicationPair(operationId, occurrence)`. The lifecycle atom deliberately omits the wait family because the published `SemanticFlowNodeOccurrenceAnchor.wait` contract is keyed only by `(processInstanceId, elementId, activation)`. A User Task and Timer with the same complete occurrence therefore collide even though their private wait collections and activation counters differ. A publication pair binds one transition record and its one lifecycle delta before either receives a batch index. Its canonical sort key is the exact tuple `(operationId, occurrenceKind, processInstanceId, elementId, activation)`, where `occurrenceKind` is the private wait-family discriminator and never part of the public lifecycle anchor.

Occurrence atoms include the state-derived next activation, not only an element ID. Every User Task, Message, Timer, and effect occurrence in the equations uses `owner.processInstanceId`; only the separate `runtimeControl(state.control.instanceId)` read names the top-level running Process instance. Atom tags keep User Task, Message, Timer, effect, control-place, and Activity-local domains distinct. Every set and sort key uses the repository's canonical Unicode scalar ordering, numeric activation ordering, and explicit tagged equality. Locale collation, object enumeration order, and a successor-state diff are excluded from footprint construction.

The constructor equations are exact:

| Constructor | Required reads | Complete writes | Publication bundle |
|---|---|---|---|
| `awaitUserTask` | `runtimeControl(instance)`, `scopeOccurrence(owner)`, `controlToken(owner,input)`, `activation(userTask,taskId)`, and absence of both `wait(userTask,occurrence)` and `openWaitAnchor(occurrence)` | decrement `controlToken(owner,input)`; replace `activation(userTask,taskId)` by the next value; canonically insert `wait(userTask,occurrence)`, thereby adding the derived `openWaitAnchor(occurrence)` | one `committedTransition` carrying the exact operation metadata, owner, unchanged logical time, and the token-to-User-Task position delta; one started `flowNodeLifecycle(waitAnchor(occurrence))`; one `publicationPair(operationId,occurrence)` |
| `awaitMessage` | `runtimeControl(instance)`, `scopeOccurrence(owner)`, `controlToken(owner,input)`, `activation(message,elementId)`, and absence of both `wait(message,occurrence)` and `openWaitAnchor(occurrence)` | decrement `controlToken(owner,input)`; replace `activation(message,elementId)` by the next value; canonically insert `wait(message,occurrence)`, thereby adding the derived `openWaitAnchor(occurrence)` | one `committedTransition` carrying the exact operation metadata, owner, unchanged logical time, and the token-to-Message position delta; one started `flowNodeLifecycle(waitAnchor(occurrence))`; one `publicationPair(operationId,occurrence)` |
| `awaitTimer` | `runtimeControl(instance)`, `scopeOccurrence(owner)`, `controlToken(owner,input)`, `logicalTime`, `activation(timer,elementId)`, and absence of both `wait(timer,occurrence)` and `openWaitAnchor(occurrence)` | decrement `controlToken(owner,input)`; replace `activation(timer,elementId)` by the next value; canonically insert `wait(timer,occurrence)` with deadline `logicalTime + duration`, thereby adding the derived `openWaitAnchor(occurrence)` | one `committedTransition` carrying the exact operation metadata, owner, unchanged logical time, and the token-to-Timer position delta; one started `flowNodeLifecycle(waitAnchor(occurrence))`; one `publicationPair(operationId,occurrence)` |
| `awaitEffect` | `runtimeControl(instance)`, `scopeOccurrence(owner)`, `controlToken(owner,input)`, `activation(effect,elementId)`, and absence of `wait(effect,occurrence)`, `openWaitAnchor(occurrence)`, and `activityVariableScope(occurrence)` | decrement `controlToken(owner,input)`; replace `activation(effect,elementId)` by the next value; canonically insert `wait(effect,occurrence)`, thereby adding the derived `openWaitAnchor(occurrence)`; canonically insert `activityVariableScope(occurrence)` and one `activityVariable(occurrence,name)` per literal input binding | one `committedTransition` carrying the exact operation metadata, owner, unchanged logical time, and the token-to-effect position delta; one started `flowNodeLifecycle(waitAnchor(occurrence))`; one `publicationPair(operationId,occurrence)` |

Current effect input mappings are literals and therefore read no Process or Activity-local runtime variable. Adding a variable-reading expression reopens this table and the atom vocabulary before implementation.

For the first checkpoint, footprint construction returns `none` for every operation outside ordinary `awaitUserTask`, `awaitMessage`, `awaitTimer`, and `awaitEffect`. It also returns `none` unless the selected operation is the unique program operation in its complete wait-family declaring set for the emitted element, that declaration is owned by the selected scope, and the new untagged wait anchor is absent from the exact pre-state. The declarer census includes every ordinary and composite operation that can emit that wait family, including bounded, monitored, Sequential Multi-Instance, Parallel Multi-Instance, event-race, and boundary-host operations even though those operations cannot themselves receive a checkpoint footprint. Program admission now requires that census to resolve every family-tagged declaration uniquely even when no wait is live; the footprint check retains the same rule defensively at its local boundary. The open-anchor census includes existing incident occurrences as well as every live User Task, Message, Timer, and effect wait. An unavailable footprint, more or fewer than two enabled operations, an intersection, an existing or paired untagged wait-anchor collision, a duplicate publication key, or a failed second step retains the existing fail-closed ambiguous-choice result. Separately, an unavailable pre-state or intermediate open-set projection retains the traced boundary's existing no-publication failure rather than counting two equal projection failures as commutation evidence. This is a sufficient rule, not a necessary characterization of every commuting transition.

## Checkpoint execution and publication contract

The pair predicate requires an admitted `WellFormedProgram`, a `runtimeStateWellFormed` exact-instance pre-state, successful `projectOpenFlowNodeOccurrences?` projection of that exact program and pre-state, two distinct operations contained in that program, successful independent enabledness witnesses from the same pre-state, complete unique-declarer footprints from the equations above, no write/read or write/write intersection in either direction, and distinct actual publication atoms. Successful open-set projection supplies the current `flowNodeOccurrenceProgramValidity`, association validity, and untagged anchor uniqueness premises that `runtimeStateWellFormed` alone does not establish. Shared reads are permitted.

Given those premises for `left` and `right`, the checkpoint requires all of these facts:

1. firing `left` preserves `right` enabledness and firing `right` preserves `left` enabledness;
2. both two-step executions succeed;
3. both executions produce exactly equal raw RuntimeState values whose affected collections retain canonical order, and both intermediate states remain runtime-well-formed and open-set-projectable;
4. the actual accepted transition and lifecycle facts are defined and identical, not merely two equal candidate values or two equal projection failures;
5. sorting the two unnumbered publication pairs by the complete paired sort key and only then assigning consecutive transition indices produces one identical committed publication without separating a transition from its lifecycle delta.

“Canonical RuntimeState” does not mean equality after a projection or an assertion-time sort. The implementation extends `runtimeStateWellFormed`'s canonical-collection criterion and every production insertion site so User Task, Message, Timer, and effect waits are ordered by complete occurrence identity; their four activation-counter families are ordered by element ID; and Activity-variable scopes are ordered by complete effect-occurrence owner. TypeScript already orders the waits and counters but must canonically insert Activity-variable scopes. Lean must replace Message, Timer, and effect wait and counter prepends plus Activity-variable append with the same canonical insertions. The invariant applies to every add site for an affected collection, including composite operations outside this checkpoint, rather than only to the four constructors named here.

This is an internal pre-release runtime-representation replacement owned jointly with the [scoped runtime data specification](capsules/SCOPED-DATA-SPEC.md#runtime-replacement). It changes no public wire. Its targeted preservation obligation requires every existing producer, consumer, well-formedness check, fixture, and proof to use the replacement order directly; existing canonical observations and retained Temporal histories must replay unchanged; and no compatibility reader, order-normalizing boundary, or second RuntimeState shape is permitted.

The production evaluator continues to select the canonical lowest operation ID first. The proof makes that selection observationally irrelevant for the admitted pair; the sort does not serve as the proof. No existing committed-transition or lifecycle wire shape changes. Raw evaluator visit order remains private, while the published batch order remains canonical and replay-stable.

An overlapping pair is not forced into either order. It remains `ambiguousInternalChoice` until a later reviewed profile supplies an explicit semantic choice or a stronger checked commutation account.

## Checkpoint Lean assurance lane

The checkpoint's Lean lane is **proved**. `BpmnSemantics/SemanticProcess/InternalArmingOrder.lean` owns the reusable canonical insertion, ordered distinct-key counter replacement, and Activity-scope order laws. `InternalCommutationCore.lean` owns the private prepared-patch representation, exact pre-state constructor, closed atom projection, and non-interference predicate. The responsibility-split `FlowNodeOccurrenceProgramValidityCore.lean`, `FlowNodeOccurrenceEffectProgramValidity.lean`, `FlowNodeOccurrenceWaitProgramValidity.lean`, and `FlowNodeOccurrenceProgramValidityFrames.lean` keep their family validators private while exposing only the structural, wait-family, and insertion-preservation facts needed by the checkpoint. `FlowNodeOccurrenceLifecycleOrder.lean`, `FlowNodeOccurrenceProcessIdentityProofs.lean`, and `FlowNodeOccurrenceProjectionShapeProofs.lean` prove the canonical lifecycle order, the static/runtime owner Process-ID correspondence, and the complete projected-anchor shape without duplicating production algorithms. `InternalCommutationProjection.lean`, `InternalCommutationStateFrames.lean`, `InternalCommutationRuntimePreservation.lean`, and `InternalCommutationOpenProjection.lean` compose those facts into projectability, collection-order, identity, aggregate runtime, and accepted-lifecycle preservation. The `InternalCommutation.lean` facade proves opposite-arm enabledness and exact raw-state commutation. `InternalCommutationTransitionRecord.lean` and `ControlPositionDeltaProofs.lean` prove the prepared transition record and exact public control delta, while `InternalCommutationPublication.lean` composes them with the lifecycle result into complete actual-publication equality plus canonical pair numbering. `SemanticProcessJson/Publication.lean` consumes the canonical traced order and independently replays it without re-deciding pair order. `BpmnSemantics.InternalCommutationConformance` imports the public proof and publication surfaces as the exact conformance target. This acyclic responsibility split avoids sixteen constructor-pair proofs and prevents the footprint, validity, state-update, projection, and publication accounts from drifting.

The theorem begins from admitted-program well-formedness, exact-instance runtime-state well-formedness, successful exact pre-state open-set projection, two independently enabled `OperationStep` facts, and the complete prepared-patch footprint predicate. It proves both intermediate states runtime-well-formed and open-set-projectable before proving the opposite operation remains enabled. It then proves both exact patch applications commute and proves equality of the actual accepted transition/lifecycle publication. It must not assume either intermediate invariant, either second `fire?`, equal successors, equal final states, canonical intermediate storage, defined lifecycle projection, or equal publications. Constructor proofs may reuse established transition relations, canonical collection insertion, exact occurrence issuance laws, and the existing flow-node program-validity account. They may not cite finite fixture evaluation as the theorem.

This does not claim arbitrary closure confluence, Church-Rosser, arbitrary-cardinality independence, general BPMN scheduler determinism, or the open run-level checked-source preservation theorem.

## Checkpoint independent TypeScript realization

The TypeScript core defines the same state atom vocabulary, actual untagged lifecycle-anchor collision rule, exhaustive family-declarer census, and non-interference equation without generated Lean code or a copied decision table. Program admission applies that census globally, and footprint construction reuses it for the selected operation. It corrects ordinary Message wait issuance and footprint derivation to use `owner.processInstanceId`, matching the other three families, while preserving top-level `state.control.instanceId` only as the runtime-control read. Production closure classifies the complete two-operation enabled set through that predicate and retains current ambiguity and bound precedence. The traced boundary additionally requires the exact pre-state and both intermediates to remain open-set-projectable before accepting the paired publication.

The independent executable oracle explicitly runs both orders outside the production selector and compares canonical state, transition records, and lifecycle publication. The production code must not implement commutation by running both orders and comparing their results, because that would make the claimed reason a successor-equality test rather than the reviewed footprint rule.

## Selected final-closure account

### Complete operation-family census

Final closure classifies the complete `SemanticOperation` discriminated union by semantic criterion. A TypeScript exhaustive switch, a Lean exhaustive definition, and one generated documentation guard must fail together when a variant is added without a classification. The classification is not a count and does not infer completeness from the table's prose.

| Operation family | Exact current variants | Final-closure treatment |
|---|---|---|
| Process initiation | `initiate`, `initiateMessage`, `initiateTimer` | Singleton by admitted start kind and `initiationPending`. Exactly one matching initiation may be enabled for one accepted start input. A state or Program that enables two is invalid rather than a schedulable frontier. |
| Ordinary wait arming | `awaitUserTask`, `awaitMessage`, `awaitTimer`, `awaitEffect` | Prepared, footprint-bearing, and batchable. The implemented checkpoint equations remain the first four exact instances of the general contract. |
| Composite wait and Activity arming | `enterBoundedScope`, `awaitBoundedUserTask`, `awaitMonitoredUserTask`, `awaitSequentialMultiInstanceUserTask`, `awaitParallelMultiInstanceUserTask`, `awaitEventRace` | Prepared, footprint-bearing, and batchable only when their complete controller, Activity record, handler, race, local-variable, counter, wait, and publication effects are represented. Treating the ordinary inner wait as the whole footprint is forbidden. |
| Scope creation and Call invocation | `enterScope`, `invokeProcess` | Prepared, footprint-bearing, and batchable. Fresh occurrence issuance, parent or caller consumption, child or called entry, Call association, and every created ownership fact are part of the footprint. |
| Local control transformation | `duplicate`, `synchronize`, `choose`, `selectMany`, `synchronizeSelected` | Prepared, footprint-bearing, and batchable. Expression and selected-set reads are explicit. A deterministic condition result is not a scheduler choice. |
| Merge and ordinary End | `mergeExclusive`, `reachNoneEnd` | Prepared, footprint-bearing, and batchable when the selected input is unique. More than one offered input to `mergeExclusive` is an observable local choice and uses the choice contract below rather than list order. |
| Scope return, completion, and interruption | `returnProcess`, `completeScope`, `throwError`, `terminateScope` | Prepared with region-aware footprints. Two such transitions, or one such transition and another operation, are batchable only when their exact affected occurrence closures and parent or caller outputs are disjoint. Ancestor and descendant regions conflict even when their root identifiers differ. |
| Externally addressed completion | `completeParallelMultiInstanceUserTask` | Never an internal-closure candidate. It remains reachable only through its exact external stimulus path, so returning a footprint is a defect. |

Every future operation variant must enter exactly one criterion above or add a separately reviewed criterion. A variant may be classified singleton only through a structural admission invariant and an executable counterexample that fails when a second candidate becomes reachable. “Unsupported by the footprint helper” is not a final classification for an operation that can occur in a registered internal frontier.

### Prepared transition and region footprints

Every batchable operation produces one `PreparedInternalTransition` from the admitted Program and exact pre-state before production order is selected. It contains the selected runtime owner, any deterministic branch result, the exact state patch, complete semantic reads and writes, and the unnumbered transition/lifecycle publication bundle. Preparation neither applies the patch nor consults a successor-state difference. The existing ordinary-arm representation becomes one specialization of this owner rather than a parallel mechanism.

The state-atom vocabulary grows by criterion over every RuntimeState field the current operation union can read or change. Concrete keyed atoms continue to represent token units, counters, waits, records, controllers, scoped values, Process values, logical time, initiation and control status, and aggregate End facts. A destructive or completing transition additionally carries an `occurrenceRegion(root, members)` write derived from the exact pre-state closure it removes. A region conflicts with every atom owned by one of its members, and two regions conflict when their member sets intersect. This makes disjoint sibling-region work composable while refusing ancestor/descendant cancellation, a concurrent insertion into a region being removed, and a parent continuation collision. A guard derives the field census from both RuntimeState definitions and rejects an unclassified field; prose enumeration is not the completeness oracle.

Each prepared-operation owner owes three reusable laws in Lean and equivalent executable discriminators in TypeScript: applying its patch implements the existing operation relation, applying an independent patch preserves its preparation and enabledness, and applying two independent patches commutes in raw canonical state and unnumbered publication. Composite operations may reuse established per-family preservation theorems, but no family may claim a complete footprint by calling its successor and diffing state.

### Arbitrary complete-frontier batches

At each closure step the evaluator derives the complete enabled operation frontier from one exact state. Zero candidates is stable. One candidate fires normally after any operation-local choice is resolved. A frontier with at least two candidates becomes one independent batch only when every candidate prepares successfully, every pair is independent under directional write/read, write/write, region, and publication conflicts, and no operation-local choice remains unresolved. The evaluator never selects an independent subset while ignoring another enabled candidate.

Pairwise independence is sufficient only together with the preparation-frame laws above. Lean proves by adjacent swaps that every permutation of one finite pairwise-independent prepared batch reaches the same raw canonical RuntimeState and the same canonically sorted unnumbered publication. Production executes the complete batch in canonical operation-ID order, assigns consecutive transition indices only after sorting complete publication pairs, and then recomputes the frontier. The TypeScript both-order oracle becomes an arbitrary-permutation oracle outside production selection and must include a three-arm same-family batch and a mixed four-family batch.

Closure fuel counts operations, not batches. If the complete batch has more members than remaining fuel, the evaluator reports the existing bound failure before applying any member. No partial batch state or publication is committable. The longest newly admitted batch and one over-limit case are required in both languages.

### Explicit observable choice

The pure semantic layer adds a closed `InternalSchedulingMode` to the Program with `rejectObservableChoice` and `requireChoiceSchedule`. Every existing profile lowers to `rejectObservableChoice`; this capsule admits no new BPMN topology or profile. The scheduled mode exists so a later reviewed profile can select material nondeterminism without reinterpreting an already admitted Program.

The explicit input is an `InternalChoiceSchedule`, an ordered list of directives carried beside one external `Stimulus` at the pure evaluator boundary. Each directive contains its zero-based choice ordinal, the exact canonical nonempty list of alternatives presented at that point, and one selected member of that list. An alternative is a closed union of an operation ID or an exact `mergeExclusive` operation/input-control-place pair. Exact alternatives are carried rather than a digest, host index, random seed, or collection position.

Choice processing has one rule. The evaluator first resolves operation-local alternatives in canonical operation-ID order, then classifies the complete operation frontier. An independent batch consumes no directive. A non-independent frontier under `requireChoiceSchedule` exposes its complete operation alternatives to the next directive and fires only the exact selected member. A multi-offer `mergeExclusive` does the same for its exact offered inputs. Missing, extra, out-of-order, stale, duplicate, unknown, or non-member directives make the command uncommittable with its pre-command state and empty publication. Under `rejectObservableChoice`, the same frontier retains the existing `ambiguousInternalChoice` failure and consumes no directive. Canonical order is used only to encode the choice point and independent publication, never to make the choice.

The existing `applyStimulus` remains the exact empty-schedule entry point. A distinct lower-layer `applyStimulusWithSchedule` takes the typed schedule and is not exported through the engine API until a separately reviewed profile selects scheduled choice. Lean receives the same explicit input type. The schedule is semantic input, not RuntimeState, observation, or Temporal metadata; it cannot be inferred from Event History, Workflow task order, SDK readiness, randomness, or program collection order.

### Final assurance and hosting boundary

The final Lean lane is **proved** for the arbitrary independent-batch theorem and for exact schedule consumption. Kernel-decided fixtures remain discriminators, not substitutes for the theorem. TypeScript independently implements the same classification and preparation contracts and retains permutation execution only as a test oracle. A cross-language matrix covers every operation-union classification, every RuntimeState field class, the three-arm and mixed four-arm batches, disjoint sibling regions, overlapping ancestor/descendant regions, same-operation merge alternatives, stale and unused directives, empty-schedule compatibility, and fuel refusal before partial application.

The Temporal adapter continues to host only the existing empty-schedule profiles in this capsule. If a later profile exports scheduled choice, its command contract must content-bind the complete schedule before Workflow ingress, retain it across retry and recovery, and replay the same choice bytes. Workflow code may pass those bytes to the core but may not construct, repair, reorder, or default them. Independent internal batches remain one atomic evaluator result, and no half-batch or choice directive enters Query, Visibility, E1/E2 publication, or Product 2 projection.

## Temporal hosting and information-preservation preflight

The durable ingress remains the existing content-bound Start, User Task Update, Message delivery, Timer firing, or effect-result command owned by each already admitted profile. This checkpoint changes only pure internal closure after one accepted ingress. It adds no Workflow command, Signal, Timer, Activity, Child Workflow, cancellation scope, retry policy, Task Queue rule, Workflow-chain field, or external-effect lifecycle.

| Concern | Unchanged hosting mechanism and required checkpoint fact |
|---|---|
| Ingress and acknowledgement | The existing content-bound command enters one Workflow handler and is acknowledged only through its existing committed or non-committed result after the whole evaluator call. An internal publication pair has no separate ingress or acknowledgement. |
| Semantic waits, timers, effects, and cancellations | The core continues to own every wait and cancellation fact. Temporal schedules a durable wakeup or I/O only from the committed stable result; no host primitive selects either internal order. |
| Workflow/core state relation | Workflow state contains the exact canonical RuntimeState and committed publication produced by the core. Handler entry, Workflow tasks, Activity attempts, and persistence steps are hidden stuttering steps and cannot expose a half-batch. |
| Serialization and interleaving | The existing Workflow loop serializes accepted Updates, Signals, Timer firings, and Activity results through one evaluator call. Handler readiness or Promise order cannot choose between the two internal operations. |
| Delivery, deduplication, and retry | Existing content-bound command identity, occurrence identity, stale refusal, and retry rules remain unchanged. Duplicate host delivery stutters or returns the existing refusal/result and never replays one member of the pair independently. |
| Completion, failure, cancellation, Continue-As-New, and post-completion commands | Existing terminal receipts, failure mapping, scope cancellation, Workflow-chain rollover, and post-completion refusal apply only to the atomic evaluator result. The checkpoint adds no Continue-As-New field or branch and cannot leave one operation committed when the other fails. |
| Query, Visibility, and external read models | The existing Query exposes only committed publication and canonical observation. Temporal Visibility remains operational metadata, and Product 2 read models consume only the published engine contract. Neither may reconstruct raw evaluator or Program order. |
| Replay and versioning | Canonical operation selection, canonical RuntimeState insertion, paired publication sorting, and transition-index assignment must replay byte-identically under the unchanged Temporal SDK and Server versions. Existing histories and current-version Worker replacement remain required evidence. |

The preserved state relation is exact equality of the canonical semantic state and committed publication after the commuting batch. Program-storage permutation remains a pure-core diagnostic because production admission requires canonical operation-ID order. The smallest host witness uses the exact admitted canonical Program for the existing production parallel User Task profile, retains the core-produced canonical publication through Worker replacement between task completions, and replays every Run. Its nearest realistic adapter counterexample reverses or reconstructs the core-produced unnumbered pair before numbering or persistence; the exact transition/lifecycle record and replay oracle must reject that mutation without starting an unadmitted Program.

Host admission must continue to reject an unsupported mixed-wait profile even when its pure internal arming pair has a footprint, because commutation evidence is not source/profile or host-capability admission. A future live mixed-wait witness requires its own profile and host preflight.

## Implemented checkpoint boundary

The implemented checkpoint required:

- one shared semantic criterion implemented independently in Lean and TypeScript;
- positive ordinary User Task/User Task and mixed User Task/Timer or Message footprint witnesses;
- one called-owner Message witness proving that issuance, footprint, wait, and lifecycle anchor all carry `owner.processInstanceId` while runtime control remains top-level;
- a realistic same-effect-element counter collision that distinct operation, input, and output IDs do not hide;
- same-family Program-admission refusal, including an out-of-checkpoint composite declarer, and cross-family untagged lifecycle-anchor refusal on structurally well-formed programs;
- one candidate refusal against a pre-existing incident carrying the same untagged public wait anchor;
- both-order state and publication evidence, pure-core canonical program-order permutation evidence, and unchanged ambiguity/bound precedence;
- existing parallel Product 1 Worker-replacement and replay evidence remaining green;
- routed implementation maps, proposal/checkpoint review, focused gates, complete applicable gate, and a reproducible checkpoint cost row.

The checkpoint permitted as optional:

- additional positive pairs among the four supported arming kinds when they use no new atom or proof case.

The checkpoint excluded:

- more than two enabled operations;
- `duplicate`, joins, choices, scope entry/completion, call/return, termination, Error propagation, event-race arming, boundary-host operations, or Multi-Instance operations;
- new BPMN source admission, semantic profile, scenario registration, Product 2 surface, CIB relationship, or Temporal host capability;
- public exposure of footprints, scheduler choices, raw visit order, or Temporal identity;
- Parallel Multi-Instance, completion conditions, general event subscriptions, compensation, transactions, workload isolation, or closure of another MUE content ID.

## Final-closure required, optional, and excluded work

Required:

- one executable classification for every current Semantic Operation variant in Lean and TypeScript, plus a guard that rejects an unclassified future variant;
- one field-complete footprint census over both RuntimeState definitions, including owner-aware region conflicts and a guard that rejects an unclassified future state field;
- prepared transitions for every batchable family in the final census, with exact relation soundness, independent-frame preservation, pairwise commutation, and actual unnumbered-publication laws;
- one arbitrary finite-batch Lean theorem from pairwise independence and the preparation-frame laws, without assuming a canonical execution order or final equality;
- one independently structured TypeScript complete-frontier classifier and arbitrary-permutation oracle that production code does not call;
- the closed scheduling mode, exact typed choice point and directive representation, schedule-consumption semantics, empty-schedule compatibility, and fail-closed handling of every missing, stale, invalid, or unused directive;
- a pure evaluator proof and executable oracle that a valid directive selects exactly one offered alternative while an independent batch consumes none;
- exact closure-fuel accounting that refuses an oversized batch before any member is applied;
- the updated Semantic Process contract and proof obligations, affected source maps, runtime/proof and assurance maps, Temporal serialization/preflight boundary, PLAN, focused gates, complete applicable gate, governed semantic checkpoint and closure reviews, and a reproducible final-closure cost row.

Optional:

- a subquadratic conflict index after the direct pairwise implementation is proved correct and a realistic frontier demonstrates the need;
- additional permutation fixtures beyond the required same-family three-arm, mixed four-family, and region cases.

Excluded:

- any new BPMN construct, source shape, admitted topology, semantic profile, CIB relationship, Product 2 choice UI, or public engine schedule command;
- implementing compensation, Transactions, generalized subscriptions, data semantics, or workload isolation under this content ID;
- treating an unsupported footprint, canonical operation order, host readiness, randomness, Event History, or a successor-state comparison as semantic choice;
- exposing footprints, prepared patches, raw closure visit order, or private region membership through public observation;
- claiming Church-Rosser, unbounded termination, or confluence beyond one finite complete frontier and the configured closure limit.

## Checkpoint evidence and adversarial oracles

The first Red is a synthetic internally valid state with one ordinary User Task arm and one ordinary Timer or Message arm on distinct owner-token places: current closure reports ambiguity even though both explicit execution orders reach the same canonical state. The second Red is the transition-grounded write/write class separator: two effect arms have distinct operation, input, and output IDs but share one effect element and therefore the same activation-counter, wait-occurrence, and Activity-scope atoms. A shallow identifier checklist can accept it; the footprint rule must reject it before either successor is selected.

Four account-correction Reds separate Program admission from runtime publication safety. One Program mutation gives two distinct ordinary User Task operations the same task identity, and a second makes an ordinary User Task conflict with an out-of-checkpoint composite User Task declarer. Both now fail standalone Program admission before closure classification, proving that the exhaustive census is not limited to footprint-eligible constructors. A third structurally well-formed mixed User Task/Timer program gives both arms the same `(processInstanceId, elementId, activation)`. Their private tagged waits and counters differ and both explicit state steps succeed, but the actual untagged public wait anchor collides and `projectFlowNodeOccurrenceLifecycleDelta` returns `none` for the second start. A fourth independently valid pre-state contains an effect incident whose untagged anchor equals an ordinary candidate's next occurrence. Every affected footprint must be unavailable before successor selection.

A separate called-Process Red arms an ordinary Message wait under a non-root owner. It proves that the actual wait ID, footprint occurrence, lifecycle anchor, and owner all use the called `owner.processInstanceId`; substituting the hosting root `state.control.instanceId` must fail before publication.

A separate predicate-level algebra oracle supplies a left footprint whose `writes` contain `activation(userTask,shared)` and a right footprint whose `reads` contain that atom while every write/write comparison and every publication key remains disjoint. The predicate must reject the pair. This is intentionally abstract evidence for the write/read equation: none of the four current arming constructors supplies a transition-grounded pure write/read conflict, and the checkpoint does not invent one.

Further mutations drop one activation write, tag two counter domains as equal, tag the actual public wait anchor by family, use the hosting root for a called-owner Message occurrence, treat a write/read intersection as harmless, omit a composite declarer, omit incidents from the open-anchor census, accept a second declarer, derive footprints from successor diffs, accept an unsupported operation, compare only final state, accept equal lifecycle projection failures as publication equality, reconstruct or reverse the core publication in the adapter, use locale collation, or classify only the selected first two members of a larger enabled set. Each mutation must fail an oracle outside the changed decision branch.

The focused TypeScript gate owns the closure classifier and both-order oracle. The exact Lean targets are `BpmnSemantics.SemanticProcess.InternalCommutation`, `BpmnSemantics.SemanticProcess.InternalCommutationPublication`, and their importing `BpmnSemantics.InternalCommutationConformance`, with the first kernel-decided fixture build staying with the root under the memory bound. The root runs the complete affected package gate, those exact Lean targets, `test:infrastructure`, every path-selected clean-commit pre-push entry point, and `git diff --check` at the governed checkpoint.

## Final-closure evidence and adversarial oracles

The first final-closure Red is a three-arm ordinary User Task frontier whose complete pairwise-independent footprints reach one equal canonical state under all six permutations. Current production reports ambiguity solely because the frontier is larger than two. The second is a four-arm User Task, Message, Timer, and effect frontier. Removing any one family preparation, comparing only the first two candidates, or letting batch order affect publication must fail independently.

The region separator uses two enabled operations in disjoint sibling occurrences and a second state that moves one operation into the other's descendant occurrence. The sibling case must batch; the ancestor/descendant case must conflict even when every concrete pre-existing collection key differs. A mutation that compares only region-root equality must accept the wrong case and fail the oracle.

The explicit-choice separator has two conflicting operation alternatives with reverse lexical IDs. Under `rejectObservableChoice`, both Program orders report ambiguity. Under `requireChoiceSchedule`, two exact schedules select opposite alternatives and reach the corresponding distinct states, while swapping Program order changes neither result. Missing, stale-frontier, non-member, duplicate, skipped-ordinal, and unused directives preserve the pre-command state and publish nothing. A separate `mergeExclusive` state offers two inputs to one operation and proves that input-list order is not the branch choice.

The census guards are mutation-tested by adding one synthetic operation variant and one synthetic RuntimeState field to their parsed owner shapes. Each omission must fail before semantic tests. These guards establish exhaustiveness only; the per-family transition and field mutations establish that each classification is semantically complete.

The final complete gate retains every checkpoint witness and existing semantic result and public-observation byte result. Semantic Process artifact bytes change only by the required closed scheduling-mode field and receive exact decoder, lowering, fixture, and content-binding updates rather than a compatibility reader. Because the amendment changes the Semantic Process Program representation, pure evaluator input, transition proof boundary, multiple-enabled behavior, and Temporal serialization preflight, the first green final implementation requires a new semantic-checkpoint review before any adapter or downstream lane continues.

## Same-change owners and reopen conditions

Implementation updates [Semantic Process internal scheduling](SEMANTIC-PROCESS-IL-SPEC.md#internal-scheduling), its [Lean proof obligations](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations), the [scoped runtime data specification](capsules/SCOPED-DATA-SPEC.md#runtime-replacement), [`implementation-status-owner:ENGINE-CONTRACTS-SOURCE`](ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md), [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [`implementation-status-owner:TEMPORAL-HOSTING`](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [`implementation-status-owner:ASSURANCE-ADOPTION`](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), the semantic-core source registry, the Lean module graph, and [PLAN](PLAN.md). The scoped-data owner must retain complete occurrence-identity order and carry the same producer, consumer, well-formedness, fixture, proof, observation, and replay preservation obligation. The Semantic Process schema and exact JSON decoders gain the closed scheduling mode, while the existing public stimulus and engine command schemas stay byte-identical. No semantic-family or platform map changes unless implementation discovers a fact in that owner's boundary.

Reopen before adding an atom domain or operation family, changing the region-overlap relation, changing the exact choice-point or schedule representation, exporting scheduled choice through a public engine contract, changing a wire or publication order, changing the actual flow-node open-set projectability premises, using state-diff equality as the production rule, or admitting a source/profile/host composition on the strength of this closure.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `f4b09ba48054a2c059f06b92b3b4d2b4675a6117` | `fork-turns-none` | `approve-with-required-edits` | `a34df385863d706f36785282201703604720013f` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The first checkpoint proposal review targeted `95ee893fc7efef561d579c9c2ecd164eccae1187` and closed its required edits at `e65fa4fbd2b4303794398061d94c0602e54a4714`. The context-cold checkpoint reviewer then required one documentation correction separating unsupported, differently sized, or colliding frontiers from unavailable pre-state or intermediate open projection. The same reviewer approved correction target `a34df385863d706f36785282201703604720013f` with no remaining findings. Those immutable results continue to own the implemented Beta checkpoint; the receipt's Proposal row now belongs to the materially amended final-closure account and remains pending until its committed target is recorded and reviewed.
