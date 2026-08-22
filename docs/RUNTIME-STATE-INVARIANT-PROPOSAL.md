# Runtime-state well-formedness invariant proposal

## Status

Lifecycle: owner-approved
Review: approved-with-required-edits

## Question and current boundary

This proposal selects the first `RUNTIME-STATE-INVARIANT` slice: one program-indexed predicate that decides which `RuntimeState` values the semantic account admits, proved to hold at every admitted initial state and to be preserved by every currently registered internal and external committed transition. It also reclassifies the evaluator-graph bridge theorems that carry no semantic content, without deleting the dispatcher check they do perform.

The proposal adds no BPMN capability, no operation kind, no runtime field, no public observation field, no profile, no scenario, and no evidence artifact. It changes no admitted model, no accepted transition, and no canonical projection. Its entire subject is which states the account claims to represent and which of that claim is checked rather than assumed.

Three facts define the current boundary and the proposal is written against them rather than against recall.

First, the representation invariant is prose. The complete ownership, scope-tree, wait, incident, activation-high-water, and canonical-order account sits in the module documentation immediately above `structure RuntimeState` in [`RuntimeState.lean`](../BpmnSemantics/SemanticProcess/RuntimeState.lean), over a twenty-two-field flat product, with no Lean predicate and no preservation theorem. [`implementation-status-owner:ASSURANCE-ADOPTION`](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md) records that prose as the implemented shared runtime representation invariant, which is exactly true and is the gap: a comment binds a reader, not the evaluator.

Second, a strong program-indexed validity predicate already exists but is scoped to public projection. `runtimePositionValid` in [`ControlPosition.lean`](../BpmnSemantics/SemanticProcess/ControlPosition.lean) already decides lifecycle agreement, unique live occurrence identity, per-occurrence definition-scope existence, runtime-parent projection of the program's declared parent scope, exactly-one hosting root, call associations, and token place and owner binding. It is invoked only by the control-position projection and by one conformance theorem. Nothing states that the evaluator preserves it, and it omits the five wait families, the selected-branch and event-race records, the retained incident wait, canonical order, and every monotonicity fact.

Third, three family-local state predicates already exist as executable guards and as law hypotheses: `eventRaceAssociationsValid` in [`EventBasedGateway.lean`](../BpmnSemantics/SemanticProcess/EventBasedGateway.lean), `calledProcessAssociationsValid` in [`CallActivity.lean`](../BpmnSemantics/SemanticProcess/CallActivity.lean), and `effectIncidentAssociationsValid` in [`Incident.lean`](../BpmnSemantics/SemanticProcess/Incident.lean). The third already rejects an effect occurrence present in both `effectWaits` and `effectIncidents`. These are not missing work; they are three cohesive fragments of the same invariant. All three are already conjoined together in `stableStateResumable` in [`TransitionTrace.lean`](../BpmnSemantics/SemanticProcess/TransitionTrace.lean) and in the flow-node occurrence lifecycle, with two of three in incident cancellation and single-predicate consumers in control-position projection and command admission. `stableStateResumable` matters most because it is the predicate the recorded wait-identity absence names as its landing condition, so the aggregate this proposal defines has an existing consumer rather than only new ones.

The consequence is already recorded as absent status. [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) owns the entries, and they must be read exactly rather than merged. On the [interrupting Sub-Process boundary Timer](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md) quiescence arm, `completeBoundedScope_sound` takes `running` and `bounded`; on the deadline arm, `interruptBoundedScope_sound` takes only the quantified `parentOwned`, whose derivation would additionally need scope-tree acyclicity **and** an empty called-instance closure that `RuntimeState` does not enforce. Separately, the Timer stale-identity laws wait on a uniqueness invariant over the wait collections.

The reach of this proposal over those hypotheses is therefore partial and is claimed as partial. `bounded` is a program fact and `running` a lifecycle-case fact, so a runtime-state predicate retires neither. Of the deadline arm's two missing facts, the conjunct list below supplies scope-tree acyclicity and does not supply the empty called-instance closure. The wait-uniqueness invariant is supplied in full.

That `BoundedScopeVictoryStep` is not wired into `ProgramStep` is a separate structural fact with a different cause, and this proposal does not change it: scope victory is reached from the `fireTimer` external stimulus rather than from `fire?`, so `ProgramStep` has no arm for it by construction.

## Selected account

One predicate, three layers, each with a distinct type so that a state fact cannot be confused with a transition fact.

`runtimeStateWellFormed : Program → SemanticId → RuntimeState → Bool` is the state predicate. It is program-indexed because agreement facts quantify over program-declared control places, definition scopes, and operations, and cannot be stated on the state alone. It is additionally indexed by the expected semantic instance identity because `RSI-LIFE-02` and `RSI-BIND-03` are statements about *the* running instance, and the instance identity carried inside `state.control` cannot decide them: a predicate that reads the expectation out of the state it is checking agrees with any injected or cross-program state that is internally consistent. This is the same parameter `runtimePositionValid` already takes in [`ControlPosition.lean`](../BpmnSemantics/SemanticProcess/ControlPosition.lean), where `lifecyclePositionValid` compares `state.control`'s identity against it. Where the index actually bites is narrower than that suggests and is recorded rather than implied: the `admit` boundary holds no third-party instance expectation, so it passes the state's own identity and the conjunct is inert there, and the Workflow-continuation boundary refuses an instance mismatch before the predicate runs. The parameter exists so a caller with a genuine external expectation can use it, and no evidence lane claims it fires today. `incidentStateAdmitted` is not the precedent: it refuses by profile and program shape and carries no instance expectation at all.

`RuntimeStateMonotone : RuntimeState → RuntimeState → Prop` is the separate two-state relation. High-water and non-reissue facts are properties of a transition, not of a state, and a state predicate that pretended otherwise would have to invent a history field.

### Layer 1: lifecycle and structure

| Rule | Proposition | Current status |
|---|---|---|
| `RSI-LIFE-01` | `notStarted` admits no occurrence, token, wait, hidden record, incident, or pending initiation | partly in `lifecyclePositionValid` |
| `RSI-LIFE-02` | `completed` and `cancelled` admit no live occurrence and no token | in `lifecyclePositionValid` |
| `RSI-OWN-01` | every token, User Task wait, Message wait, Timer wait, effect wait, incident-retained wait, selected-branch record, event race, and called-process record names exactly one live scope occurrence as its owner | tokens and effect waits only |
| `RSI-UNIQ-01` | the occurrence identity triple `(processInstanceId, definitionScopeId, activation)` appears exactly once in `scopeOccurrences` | in `exactLiveOccurrence` |
| `RSI-UNIQ-02` | within each wait family the family's occurrence key appears at most once: User Task `(instance, element, activation)`, Message subscription identity, Timer occurrence identity, effect occurrence identity | absent except at incident creation |
| `RSI-DISJ-01` | one effect occurrence appears in `effectWaits` or in `effectIncidents`, never in both | in `effectIncidentAssociationValid` |
| `RSI-ORDER-01` | the five collections that declare a canonical order hold it: `waits`, `activations`, `selectedBranchSets`, `eventRaces`, and `calledProcessOccurrences` | maintained by their insertion functions, unproved |

`RSI-ORDER-01` is deliberately narrow, and the narrowness is a fact about the evaluator rather than a simplification. The conjunct is stated by a criterion rather than by a census of insertion helpers: **a collection is listed when every one of its add sites canonically inserts, and is excluded when its add sites disagree.** The criterion is what the implementation must check, because a hand-counted list drifts from the evaluator in both directions, and this paragraph has already been wrong three times when written as a count.

Two collections are excluded for that disagreement rather than for prepending. `scopeOccurrences` is inserted canonically by Call Activity and prepended by `enterScope`. `variables` is mixed on both of its parts: `process.bindings` is canonically merged by `mergeProcessVariableBindings` at User Task completion but takes submitted order at Process start, and `activities` is appended rather than inserted. Every remaining collection prepends, `tokens` through `addToken` being the representative case.

Since `RuntimeState` derives `DecidableEq`, list order is retained state wherever the criterion fails, so an invariant asserting canonical order everywhere would be refuted by ordinary reachable states and could not be proved before enforcement because the evaluator does not maintain it. Widening this conjunct, including making `scopeOccurrences` or `variables` uniformly canonical, is a representation change with its own separating witnesses and is not part of this slice.

### Layer 2: program agreement

| Rule | Proposition | Current status |
|---|---|---|
| `RSI-BIND-01` | a token's control place exists in the program and the program's declared owning definition scope for that place equals the token owner's definition scope | in `tokenBindingValid` |
| `RSI-BIND-02` | an occurrence's definition scope exists uniquely in the program, its instance identity is nonempty, its activation is positive, and its runtime parent link projects the program's declared parent scope | in `scopeOccurrenceValid` |
| `RSI-BIND-03` | exactly one parentless occurrence is the hosting root of the running instance, and every other parentless occurrence is the called root of exactly one live called-process record | in `hostingRootCount` and `calledProcessAssociationsValid` |
| `RSI-BIND-04` | each wait's identity is declared by exactly one program operation from that wait family's declaring set, and that operation is owned by the wait owner's definition scope | absent |
| `RSI-BIND-05` | each selected-branch record's selection key matches exactly one `selectMany`, each event race matches exactly one `awaitEventRace`, and each called record matches exactly one paired `invokeProcess` and `returnProcess` | partly in the two association predicates |

`RSI-BIND-04` needs a per-family declaring set rather than one matching operation kind, because composite arming operations declare waits of a family they are not named after. A Timer wait may be declared by `awaitTimer`, by `awaitBoundedUserTask`, by `awaitMonitoredUserTask`, by `enterBoundedScope`, or by `awaitEventRace`; a Message wait by `awaitMessage` or by `awaitEventRace`. `timerDefinitionMatches` in [`WaitCompletion.lean`](../BpmnSemantics/SemanticProcess/WaitCompletion.lean) matches only `awaitTimer`, which is why `fireTimer` tests the composite predicates before it, and [the IL well-formedness contract](SEMANTIC-PROCESS-IL-SPEC.md#well-formedness) states that the Event-Based Gateway profile carries no separate `awaitMessage` or `awaitTimer` operation for its configured catches. A single-kind reading would reject reachable states from four shipped capsules: the two Activity boundary Timer families, the Sub-Process boundary Timer, and the Event-Based Gateway.

`RSI-BIND-03` is deliberately not "exactly one parentless occurrence". That stronger reading is false while a called Process is live, which is why `rootScopeOccurrence?` returns `none` in that state, and an invariant asserting it would be refuted by the admitted Call Activity profile.

### Layer 3: monotonicity

| Rule | Proposition |
|---|---|
| `RSI-MONO-01` | every activation counter family is a per-key high-water mark that never decreases across a committed transition |
| `RSI-MONO-02` | `endOccurrences` never decreases |
| `RSI-MONO-03` | `logicalTimeMs` never decreases, under the named firing hypothesis below |
| `RSI-MONO-04` | a newly created occurrence, task, Message, Timer, effect, race, or call identity is strictly above its key's recorded counter, so a removed identity is never reissued |

`RSI-MONO-03` is the one monotonicity fact the state conjuncts cannot supply, and the reason is worth recording rather than hiding in a hypothesis. Every time-advancing arm takes logical time from a fired deadline after checking only that the stimulus instant equals it. A state holding one correctly owned, uniquely keyed, live Timer wait whose deadline is below current logical time satisfies every Layer 1 and Layer 2 conjunct, and firing it lowers logical time. `RSI-MONO-03` therefore carries the explicit hypothesis that the fired deadline is at or after current logical time.

The hypothesis is bound to the `fireTimer` stimulus constructor's committed outcome rather than to a list of arms. That single ingress in `dispatchStimulus` reaches every time-advancing arm: the ordinary timer arm, the bounded task, bounded scope, and monitored task victories, and the Event-Based Gateway timer win, in the evaluators and again in the declarative relations that mirror them. Binding it to the constructor makes coverage structural instead of depending on a reader classifying arms, and it composes with `RSI-OBL-04`, which is already stated per constructor.

An enumeration of arms is the wrong shape here, and not only for tidiness: it failed twice on this exact class, once by naming three boundary victories and omitting the Event-Based Gateway win, and once because the bounded task's evaluator never assigns the field literally at all, passing the deadline into a shared `commitVictory` parameter that any search for the assignment misses.

Promoting that hypothesis to a state conjunct is deliberately **not** proposed, because "no live deadline below logical time" is itself refutable as soon as two Timer waits with different deadlines are concurrently live and the later one fires first. No admitted profile can reach that two-timer state today, so the refutation is a statement about the account's future admission rather than about a currently reachable state. Which of the two shapes is right depends on the multi-timer account that `INTERNAL-COMMUTATION` and parallel Multi-Instance must settle, so this slice names the hypothesis and records the question rather than choosing a conjunct that the next capsule would have to withdraw. Who discharges the hypothesis for a state recovered across a Workflow-chain boundary is part of the Temporal witness below rather than left open.

### Derived rather than assumed

| Rule | Consequence | Derivation |
|---|---|---|
| `RSI-FOREST-01` | the live scope-occurrence graph is an acyclic parent-linked forest | under a `programWellFormed` hypothesis, whose `scopeForestWellFormed` conjunct in [`GraphValidation.lean`](../BpmnSemantics/SemanticProcess/GraphValidation.lean) already requires an acyclic definition-scope forest by invoking `acyclicClosed`, `RSI-BIND-02` projects each runtime parent onto the program's declared parent scope, so no runtime cycle can project onto it |
| `RSI-TERM-01` | a terminal state holds no wait, hidden record, or incident | `RSI-LIFE-02` removes every occurrence and `RSI-OWN-01` requires a live owner for each of them |

`RSI-FOREST-01` is one of the two facts the deadline arm's `parentOwned` derivation needs, and it becomes a theorem over an existing conjunct rather than new machinery, which is the main reason this slice is small. The other, an empty called-instance closure, is not supplied here and stays recorded as absent.

## Obligations

| ID | Obligation | Shape |
|---|---|---|
| `RSI-OBL-01` | `initialState` satisfies the predicate for every well-formed program | quantified over `program` |
| `RSI-OBL-02` | every admitted start result satisfies it: `runningProgramStartState?`, `admitMessageStart?`, and `admitTimerStart?` under `programWellFormed` and the profile's start admission | quantified, one theorem per start kind |
| `RSI-OBL-03` | internal preservation for all twenty-four registered `OperationStep` arms: a well-formed state and a successful `fire?` yield a well-formed successor | quantified over `program`, `state`, `operation` |
| `RSI-OBL-04` | external preservation for all ten `Stimulus` constructors on the committed outcome, including the three boundary victory transitions, which are reached from `fireTimer` rather than from `fire?` | quantified per constructor |
| `RSI-OBL-05` | refusal preservation: a rejected or semantically failed command returns the received state, so well-formedness is preserved trivially and visibly rather than by omission | one shared lemma |
| `RSI-OBL-06` | `RuntimeStateMonotone` holds across the same thirty-four arms | quantified, separate from `RSI-OBL-03` and `RSI-OBL-04` |

The reserved `awaitSequentialMultiInstanceUserTask` operation has no transition and is therefore outside `RSI-OBL-03`. When `SEQUENTIAL-MULTI-INSTANCE` registers its runtime, the same change extends `RSI-OBL-03` and `RSI-OBL-06`; the invariant is what makes that extension a visible obligation rather than a silent omission.

No obligation may be discharged by deciding a fixture. Each is a statement with binders over program and state, and a concrete decided witness is admissible only as a negative or as an illustration beside the quantified law. An arm that needs an extra hypothesis records that hypothesis by name in the theorem rather than dropping the arm.

## Bridge reclassification

Fourteen of the twenty-four `OperationStep` arms in [`Transition.lean`](../BpmnSemantics/SemanticProcess/Transition.lean) take the executable result as their own premise, so `fire_sound` discharges them by passing the evaluator's equation through unchanged. Twelve state `f state ... = some after` directly for the same `f` that `fire?` calls: `initiate`, `enterScope`, `awaitUserTask`, `awaitTimer`, `awaitMessage`, `awaitEffect`, `duplicate`, `synchronize`, `choose`, `throwError`, `reachNoneEnd`, and `completeScope`. Two more wrap that equation in a single-constructor inductive whose soundness proof is one `exact`: `MessageInitiationStep` in [`MessageStart.lean`](../BpmnSemantics/SemanticProcess/MessageStart.lean) and `TimerInitiationStep` in [`TimerStart.lean`](../BpmnSemantics/SemanticProcess/TimerStart.lean).

For those fourteen arms the relation is the graph of the function. A wrong transformation produces a wrong relation and the bridge still holds, so passage cannot fail apart from the evaluator and the pair is one lane under [the evidence-lane rule](TESTING-SPEC.md#evidence-lanes), not two.

The remaining arms must be classified by the criterion rather than counted, because the count was wrong when written: three arming arms, `BoundedTaskArmingStep`, `MonitoredTaskArmingStep`, and `BoundedScopeArmingStep`, bind their premises and then name the evaluator's own transformation as the successor, which fails the criterion less visibly than a literal result premise does. `MergeExclusiveStep` in [`CyclicControlFlow.lean`](../BpmnSemantics/SemanticProcess/CyclicControlFlow.lean) is the reference shape for an arm that passes it: it quantifies over an offered token with a membership premise, admits one transition per offered occurrence, and is deliberately broader than the evaluator that selects one of them.

The proposal keeps every existing theorem and changes what is claimed for it.

`fire_sound` and `step_sound` are reclassified as a **dispatcher and constructor-selection check**. That is a real and worthwhile property: it fails if `fire?` routes an operation kind to the wrong state transformation or if a new operation kind is added without a matching relation arm, and it is what makes the twenty-four-way match exhaustive. It is not evidence about meaning, and no capsule may cite it as a semantic lane.

The falsifiable replacement is `RSI-OBL-03` and `RSI-OBL-06`, which a wrong transformation fails: an arm that strands a token on a removed owner, reissues a retired activation, duplicates a wait key, or leaves an occurrence whose parent contradicts the program breaks preservation regardless of how the relation was written.

Implementation amends the exact obligation text in four owners so the reclassification is stated once at each: item 6 of [the Lean proof obligations](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations), the bridge bullet in [two kinds of independence](PROJECT-DESIGN.md#two-kinds-of-independence), item 7 of [the required capsule structure](capsules/README.md#required-capsule-structure), and the corresponding sentence in [CLAUDE.md](../CLAUDE.md#semantic-code). None of those edits belongs to this proposal-only change.

## Independent TypeScript validation

The TypeScript core already validates the projection-facing half independently and with its own decomposition: `runtimeScopeForestIsValid`, `scopeOccurrenceIsValid`, and `definitionForestIsValid` are private to [`control-position-projection.ts`](../packages/semantic-core/src/control-position-projection.ts), reached from `projectCurrentControlPositions` rather than from a translated Lean conjunction, and they operate on the core's sorted multiplicity representation rather than Lean's lists.

The proposal keeps that independence and extends it on the same terms.

The core owns one validator over its own runtime representation, placed with the state it validates in [`semantic-process-state.ts`](../packages/semantic-core/src/semantic-process-state.ts). It must not mirror Lean's layer split, conjunct order, or helper names, and it must not be derived from the Lean source. Its existence is required; whether it is additionally wired into the fail-closed `admit` path in [`semantic-command-admission.ts`](../packages/semantic-core/src/semantic-command-admission.ts) is the separate optional decision below, and that decision is not gated by any Lean measurement, because the core carries no kernel-reduction cost.

A third runtime-state validator already exists and must be reconciled rather than ignored: `requireBpmnWorkflowContinuationStateV1` in [`workflow-continuation.ts`](../packages/temporal-adapter/protocol/src/workflow-continuation.ts) already type-guards a `RuntimeState` across a Workflow-chain boundary and already refuses a state that is not one resumable stable checkpoint. That is where the Temporal witness named below lands.

What the two sides share is the reviewed conjunct list identified by `RSI-` rule ID. There is no runtime-state wire schema to carry a shared corpus: `contracts/schemas/` holds none, [the contract registry](../contracts/README.md) specifies the program with no mutable runtime state, and Lean has no `RuntimeState` decoder. The existing cross-language rejection channel is therefore the one already in use for projection: Lean emits its rejection outcomes and [the publication parity test](../packages/bpmn-source/test/committed-execution-publication-parity.test.ts) constructs its own `RuntimeState` values and compares the boolean outcomes by case name. This slice extends that channel with the new malformed cases and adds no registered artifact, so no roundtrip obligation is triggered.

Rule identity is reported by construction rather than by a result field. Each conjunct is a separately named sub-predicate on both sides, the aggregate is their conjunction, and a fixture asserts which named sub-predicate is false. No identity reaches any public result, so the public admission contract is unchanged.

That shared channel is a transcription check and is recorded as one lane, not two. Both sides implement the same reviewed account, so under [two kinds of independence](PROJECT-DESIGN.md#two-kinds-of-independence) agreement between them cannot establish that the account is right, only that neither transcribed it wrongly. Account-level independence for this invariant comes from normative and representation review, and the proposal claims nothing more.

## CIB relationship

This proposal selects no CIB Seven relationship and requires no register entry. It states which of its own runtime-state values the project's account admits, which is a project-internal representation obligation with no CIB-observable consequence: no admitted model, accepted command, refusal outcome, or canonical observation changes, so there is nothing for a pinned engine to agree or disagree with. Any future conjunct that would change a refusal outcome leaves this boundary and needs its own classification in [the register](CIB-BPMN-RELATION-REGISTER.md).

## Required, optional, and excluded

Required: the three-layer predicate with per-conjunct named sub-predicates, the six obligations, the bridge reclassification of every arm meeting the criterion, the independent TypeScript validator **wired into the fail-closed `admit` path**, the four separating negatives carried through the existing parity channel, and the owner-document amendments.

Optional: installing the Lean gate at its single existing pre-dispatch site, which stays conditional on the cost measurement and is not an implementation blocker. Retiring `deadline_arm_bridge_premise_is_satisfiable` is **not** proposed, because its premise needs the empty called-instance closure that this slice does not supply.

Excluded: any BPMN capability, operation, field, observation, profile, or scenario; the shared Activity occurrence record owned by `ACTIVITY-OCCURRENCE-OWNERSHIP`; the commutation and semantic-choice account owned by `INTERNAL-COMMUTATION`; sequential Multi-Instance runtime; liveness, progress, termination, and confluence claims; a general checked-source-to-run preservation theorem; and any Temporal or CIB behavioral claim.

## Behavior, observation, and cost preservation

Preservation must come before enforcement, in that order, and the reason is not stylistic.

If the predicate were installed as a precondition on the individual arms, any currently reachable state that violates a conjunct would turn a currently accepted transition into a refusal, which is a semantic change to admitted models. Proving `RSI-OBL-01` through `RSI-OBL-04` first establishes that no reachable state violates it, after which a gate can only reject states that were never reachable: a corrupted, cross-program, or injected state. That is precisely the existing purpose of `incidentStateAdmitted` in [`CommandAdmission.lean`](../BpmnSemantics/SemanticProcess/CommandAdmission.lean) and of the core's refusal of cross-program injected incident states, so the gate extends an existing mechanism at one site instead of adding twenty-four.

The Lean build cost is a first-order constraint here, not an afterthought. The deciding quantity is stated as a criterion rather than as a count, because a hand-written census of `decide +kernel` sites drifts from the tree and no guard holds it: [the decided-site registry](../scripts/lean-source-contracts.test.ts) records the `native_decide` exception set, not a `decide +kernel` total. The criterion is that **every kernel-decided fixture whose reduction reaches the admission or transition dispatcher re-reduces whatever conjunction sits on that path**, while the kernel holds its terms in resident memory, and this repository decides fixtures that way in the hundreds across its conformance modules. This repository has already reverted two conversions for exhausting host memory and pins `leanBuildThreads` to one for the same reason. Implementation therefore builds one narrow target under an operating-system-enforced memory bound before any full build, measures CPU and resident memory together, and treats the optional gate as rejected if that measurement regresses. The predicate and its theorems carry no such risk, because a theorem is not reduced by another module's fixtures.

No public observation changes, so the differential catalog, retained CIB evidence, canonical bytes, and registered scenarios are untouched, and no artifact-registry roundtrip obligation is triggered.

## Temporal hosting and refinement preflight

This proposal introduces no transition family, so it needs no durable ingress, wait, timer, effect, or cancellation mechanism, and the adapter's Command, Update, Query, and effect-Activity surfaces are unchanged.

One refinement risk is real and specific. The Workflow reconstructs semantic state across Worker replacement and across the Workflow chain's aggregate continuation, so a state that crosses a Run boundary must satisfy the invariant. If the optional gate is installed, a recovered or continued state that failed any conjunct would change a currently successful recovery into a refusal. The mitigation is the ordering above plus one executable witness: an existing replay and continuation case asserts that the recovered state satisfies the predicate. That witness also discharges `RSI-MONO-03`'s deadline hypothesis across the boundary, by asserting that no live Timer deadline in the recovered state precedes its recovered logical time; the existing `requireBpmnWorkflowContinuationStateV1` guard is where that assertion belongs, because it already refuses a continuation state that is not one resumable stable checkpoint. No new history is retained, consistent with the pre-release policy.

The invariant also strengthens the adapter boundary in one direction worth naming: `RSI-MONO-04` is the semantic statement behind the adapter's assumption that a Timer or task identity is never reused after withdrawal, which the host currently relies on when it joins a durable deadline to committed state.

## Evidence strategy

| Lane | What passage establishes | What it cannot establish |
|---|---|---|
| Normative and representation review | the conjunct list is the reviewed account of admitted states | that any implementation enforces it |
| Lean predicate and theorems | initialization and thirty-four-arm preservation hold for the Lean account | correctness of the core, adapter, parser, or CIB |
| Lean negative fixtures | each conjunct rejects its own malformed state, decided in the kernel | that the conjunct list is complete |
| TypeScript validator and the existing parity channel | the independently written core rejects the same malformed states by case name, for the conjuncts both sides decide identically | that the account was independently chosen, or agreement on a conjunct the two sides state differently, such as declaration where Lean also requires exactly one declarer and scope agreement |
| Temporal recovery witness | a recovered and continued state satisfies the predicate | any unsupported BPMN meaning |

Four separating negatives are new, and each fails today for a distinct reason. The states that `runtimePositionValid` already rejects are deliberately excluded, because a witness that an existing predicate already catches measures nothing new: `stateWithBadTokenOwner` and `stateWithBadScopeParent` in [`CommittedExecutionPublicationConformance.lean`](../BpmnSemantics/CommittedExecutionPublicationConformance.lean) are already locked by `public_position_projection_fails_closed_on_binding_corruption`, so a dead-owner token and a contradicted runtime parent are not admissible witnesses here.

`W1`, a Timer wait or event-race record whose owner occurrence has been removed, violates `RSI-OWN-01`. This is the genuinely unchecked half of ownership: the existing predicate reaches tokens and occurrences, and through `calledProcessAssociationsValid` it already requires each call record's caller to be a live parentless occurrence, but it reaches no wait family other than the incident-retained effect wait, and no event-race owner.

`W2`, two Timer waits sharing `(instance, element, activation)`, is the exact state the boundary-Timer stale-identity laws currently assume away, and violates `RSI-UNIQ-02`.

`W3`, a Message wait whose subscription identity is declared by no operation in its family's declaring set, violates `RSI-BIND-04` and is reachable only through an injected or cross-program state.

`W4`, a successor that lowers an activation counter after removing its wait, satisfies every state conjunct and violates `RSI-MONO-01`, which is why monotonicity is a separate relation.

## Versioning consequences

No wire contract, schema, profile identity, canonical byte, retained evidence artifact, or public observation changes, so no producer or consumer requires an atomic replacement and the pre-release policy applies unchanged: no compatibility switch, no format counter, and no retained history.

The guards that already constrain this work are [the Lean source-hygiene and size guard](../scripts/source-hygiene.test.ts), [the Lean decided-site registry](../scripts/lean-source-contracts.test.ts), which records every `decide +kernel` site with its reason and rejects a new site or module until registered, [the Lean import-boundary guard](../scripts/lean-import-boundaries.test.ts), [the pre-release architecture guard](../scripts/pre-release-architecture.test.ts), which binds every Lean owner, [the verification entry-point guard](../scripts/verification-entrypoint.test.ts), which rejects a bare `lake` subcommand in any command surface, and, for the documentation half, [the reviewability guard](../scripts/document-reviewability.test.ts) and [the review-policy guard](../scripts/independent-review-policy.test.ts).

Two gates were red when this proposal was written, for a cause outside it, and both are green as of the separate fix at `3032828`. `check:harness-types`, which is `tsc -p tsconfig.harness.json` and not an executable guard file, failed with one `TS2339` and three `TS2345` errors; `test:infrastructure:runtime` failed one of 371 assertions with `schema omits awaitSequentialMultiInstanceUserTask`. Both followed from one mechanism: the reserved Multi-Instance operation kind entered the contract union without its cross-package exhaustiveness obligations being met in the same change. The fix restored classifier exhaustiveness, converted a directly reachable `assertNever` throw into a typed host refusal, and replaced the coverage guard's union-wide denominator with a partition that requires each kind to be either enumerated in the publication schema or refused by the completeness producer. No reachable production outcome changed, because profile admission already refuses the reserved profile before host capability is assessed. The compile-time contract gate `check:semantic-types` also applies to the core validator.

The oracles that must be extended rather than merely satisfied are [the Lean lifecycle assurance proofs](../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycleProofs.lean), whose quantified cancellation laws are the model this invariant follows, [the core control-position tests](../packages/semantic-core/test/control-position-projection.test.ts), and [the core transition-publication tests](../packages/semantic-core/test/semantic-transition-publication.test.ts).

Two structural claims with their stopping conditions. The Lean predicate and its proofs belong in new narrow modules rather than in `RuntimeState.lean`, and that holds while `RuntimeState.lean` measures 453 of 600 nonblank lines and while the proofs would import owners that `RuntimeState.lean` must not depend on; if the predicate turns out to fit in under roughly 100 lines with no new imports, placing it beside the structure is the better outcome. The core validator belongs in `semantic-process-state.ts` rather than `semantic-process-runtime.ts`, and that holds while the runtime file measures 567 of 600 nonblank lines; the stopping condition is an extraction that gives the runtime file real headroom again. The asymmetry with the Lean placement is deliberate and rests on imports rather than on size: the core's state module can already name the program contract it must agree with, while `RuntimeState.lean` must not import the program owners the predicate needs. If the core validator turns out to need an import that `semantic-process-state.ts` must not take, it gets its own module on the same reasoning.

### Owners this implementation grows

| Owner | Measured size | Planned change |
|---|---|---|
| [`BpmnSemantics/SemanticProcess/RuntimeState.lean`](../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 453/600 nonblank, 147 lines before the review target | no growth planned; the prose invariant is replaced by a link to the predicate |
| [`BpmnSemantics/SemanticProcess/ControlPosition.lean`](../BpmnSemantics/SemanticProcess/ControlPosition.lean) | 376/600 nonblank, 224 lines before the review target | existing conjuncts become reusable rather than projection-private |
| [`BpmnSemantics/SemanticProcess/Transition.lean`](../BpmnSemantics/SemanticProcess/Transition.lean) | 333/600 nonblank, 267 lines before the review target | bridge docstrings reclassified; no relation arm removed |
| [`BpmnSemantics/SemanticProcess/EventBasedGateway.lean`](../BpmnSemantics/SemanticProcess/EventBasedGateway.lean) | 550/600 nonblank, 50 lines before the review target | its association predicate is subsumed, not moved; no growth permitted here |
| [`BpmnSemantics/SemanticProcess/CallActivity.lean`](../BpmnSemantics/SemanticProcess/CallActivity.lean) | 479/600 nonblank, 121 lines before the review target | its association predicate is subsumed, not moved |
| [`BpmnSemantics/SemanticProcess/Incident.lean`](../BpmnSemantics/SemanticProcess/Incident.lean) | 150/600 nonblank, 450 lines before the review target | its association predicate is subsumed, not moved |
| [`packages/semantic-core/src/semantic-process-state.ts`](../packages/semantic-core/src/semantic-process-state.ts) | 366/600 nonblank, 234 lines before the review target | new independent validator |
| [`packages/semantic-core/src/semantic-command-admission.ts`](../packages/semantic-core/src/semantic-command-admission.ts) | 329/600 nonblank, 271 lines before the review target | one call site if the optional gate is approved |
| [`packages/semantic-core/src/semantic-process-runtime.ts`](../packages/semantic-core/src/semantic-process-runtime.ts) | 567/600 nonblank, 33 lines before the review target | no growth permitted; named because it is the tempting wrong home |
| [`BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycleProofs.lean`](../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycleProofs.lean) | 532/600 nonblank, 68 lines before the review target | the quantified-law model to follow; thirty-four preservation laws do not fit, so they need their own owner |
| [`packages/bpmn-source/test/committed-execution-publication-parity.test.ts`](../packages/bpmn-source/test/committed-execution-publication-parity.test.ts) | 558/600 nonblank, 42 lines before the review target | the existing cross-language rejection channel this slice extends; 42 lines will not hold the new cases |
| [`packages/semantic-core/test/semantic-transition-publication.test.ts`](../packages/semantic-core/test/semantic-transition-publication.test.ts) | 399/600 nonblank, 201 lines before the review target | extended with preservation and refusal cases |
| [`packages/semantic-core/test/control-position-projection.test.ts`](../packages/semantic-core/test/control-position-projection.test.ts) | 192/600 nonblank, 408 lines before the review target | extended with the new negative cases |
| [`packages/temporal-adapter/protocol/src/workflow-continuation.ts`](../packages/temporal-adapter/protocol/src/workflow-continuation.ts) | 409/600 nonblank, 191 lines before the review target | where the recovery witness lands; already holds a `RuntimeState` type guard |

New narrow Lean modules are expected for the predicate and its proofs, and each must be independently buildable at its narrowest owner and must not import the `BpmnSemantics.SemanticProcess` umbrella. Two extractions are forced by measurement rather than preference and belong in the plan before the laws are written: the 68 lines left in `FlowNodeOccurrenceLifecycleProofs.lean` and the 42 left in the parity test cannot absorb thirty-four-arm preservation and its negative cases. Each extraction condition stops applying only if the owner's measurement changes enough that the cohesive addition fits below 600.

## Epistemic closure and reopen conditions

The exact claim this establishes is that the Lean account's admitted state set is stated, holds at every admitted start, and is preserved by every registered transition, and that four named malformed states, none of them already rejected by the existing projection predicate, are refused. The nearest claim that remains unsupported is that the conjunct list is complete: a missing conjunct is invisible to preservation, because a predicate that omits a fact preserves it vacuously. Only review and a later capsule that needs a fact the list lacks can find that, which is why the reopen trigger below is written against need rather than against a schedule.

The common-mode risk is that the same author writes the predicate and the preservation proofs, so a conjunct weakened to make an arm provable would leave both green. The counter is that each conjunct must be justified by a negative witness that fails without it, and that weakening a conjunct is visible as a diff in the reviewed rule table rather than only in a proof.

The nearest realistic counterexample to the proposal's usefulness is an arm whose preservation needs a hypothesis the invariant cannot supply, in which case the honest outcome is a recorded unresolved boundary for that arm, not a weaker predicate.

Reopen when a capsule needs a state fact the list lacks, when a new operation kind or stimulus is registered, or when the optional gate's cost measurement changes.

## Owner decisions

All three questions are resolved. Each selects the reviewed recommendation rather than redesigning it, so no further proposal review is owed.

**Predicate form: `Bool` only.** One executable `runtimeStateWellFormed : Program → SemanticId → RuntimeState → Bool`, with laws stated over `runtimeStateWellFormed program instanceId state = true` and no independently maintained `Prop` twin.

The deciding argument is not that Lean cannot branch on a proposition, because it can, through that proposition's `Decidable` instance. It is that this repository already needs an executable checker, that the three existing fragments are Boolean guards, and that a second logical definition would add synchronization risk without adding evidence.

If proof ergonomics turn out to be genuinely bad during the first preservation arms, the first response is named decomposition and reflection lemmas over the existing Boolean, not a change of representation. The representation reopens only if that fails, and even then the replacement is one propositional source with a derived decision procedure. Two manually synchronized definitions are excluded outright.

**Enforcement: split, with the TypeScript gate required.** In Lean, prove initialization and preservation first, then measure the pre-dispatch gate on a narrow target under an operating-system-enforced memory bound, and install it only if the CPU and resident-memory evidence permit. That gate is not an implementation blocker. In TypeScript, implement the validator independently, establish preservation through its own executable evidence, and then wire it into the fail-closed `admit` path unconditionally.

The two sides earn their confidence by different means, and the wording matters: Lean carries quantified proofs, TypeScript carries an independently structured validator with executable preservation and malformed-state evidence. TypeScript tests are not proofs and this specification does not call them proofs anywhere.

**Bridge reclassification: reclassify all fourteen.** Keep every existing theorem as a dispatcher, exhaustiveness, and constructor-selection check, and stop counting any of them as an independent semantic evidence lane. Neither rewriting them into nominally richer relations nor repairing only the two single-constructor wrappers is approved.

The falsifiable semantic evidence becomes invariant preservation, monotonicity, and the ten genuinely decomposed relations. The four standing owners named under [versioning consequences](#versioning-consequences) are amended atomically with that reclassification, during implementation rather than at approval.

## Independent cold-review receipt

The proposal stage used two correction rounds, which is the applicable bound. Round one closed nine required findings and raised three; round two closed those three and approved, leaving one advisory that this document applies rather than defers.

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4a54981` | `fork-turns-none` | `approve-with-required-edits` | `8e0bfdf` |
| Semantic checkpoint | `7f531c4` | `fork-turns-none` | `approve-with-required-edits` | `faad37c` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The semantic checkpoint used four correction rounds against the standing bound of two, and the owner authorized rounds three and four rather than carrying required findings into closure. Round one at `c324dc6` closed eleven findings, of which the deciding one was that the increment claimed the key-uniqueness hypothesis was discharged when the law still assumes it, and that three arming arms fail the bridge criterion the same increment installed. Round two at `0b9f59f` closed nine, all of them the first round's own corrections surviving in sibling sites plus a claim that the four negatives had landed in a channel the range never touched. Round three at `b7d1ae8` closed four, including two Lean docstrings still calling the invariant unstated and a disagreement between two source owners about whether the core's preservation evidence exists. Round four at `faad37c` closed two, of which one was a straight inversion of a theorem's hypothesis and its non-claim.

The recurring mechanism across rounds two through four is one already owned by [the process-assessment ledger](PROCESS-ASSESSMENT-LEDGER.md): a claim retracted where it is most visible while its copies elsewhere keep asserting it. Its genuine instances from this stage are the two sites in [the boundary-Timer capsule](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md), two in [`Transition.lean`](../BpmnSemantics/SemanticProcess/Transition.lean), three universal-preservation sentences across the two semantic-core owners, and two Lean siblings in the bounded-task and bounded-scope families.

The checkpoint approves the changed source, representation, and proof boundary at its target as corrected. It does not approve the lanes [PLAN.md](PLAN.md) records as owed, which belong to the closure reviewer.

Two editorial corrections landed after approval and neither reopens the proposal stage. The state predicate's declared arity gained the expected semantic instance identity, which restores the parameter the reused `lifecyclePositionValid` conjuncts already require and which the approved rule text already presupposes in `RSI-LIFE-02` and `RSI-BIND-03`; the reviewed decision was `Bool` against `Prop`, not arity, and no rule proposition changed. The Lean cost paragraph's hand-written `decide +kernel` census became the criterion it was standing in for, after the census was found stale against the tree; the cost argument never depended on the figure. A change to any rule proposition, obligation, or exclusion would instead require a new cold review.
