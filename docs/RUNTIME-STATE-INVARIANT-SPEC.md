# Runtime-state well-formedness specification

## Status

**Implemented and independently closure-reviewed for the existing executable program-indexed predicate over `RuntimeState`, with the additive `RSI-BOUND-01` implementation awaiting semantic-checkpoint review and quantified Lean preservation declared a deliberately open lane by owner decision.** The predicate, its initialization theorems, its per-conjunct negatives, the independently written TypeScript validator on the fail-closed command path, and the Workflow-continuation witnesses are implemented. Preservation across the registered transition arms is not. The Activity body-turnover preservation law is the first consumer to derive its wait-key freshness premise from well-formedness rather than assume it.

This adds no BPMN capability, operation kind, runtime field, public observation field, profile, or scenario. No admitted model, accepted transition, or canonical projection changes.

Exact implemented and absent status, including which conjunct branches a witness reaches, is owned by [`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md#runtime-state-well-formedness).

## Contract

`runtimeStateWellFormed : Program → SemanticId → RuntimeState → Bool` in [`RuntimeStateWellFormed.lean`](../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean), with the independently structured counterpart `runtimeStateDefects` in [`runtime-state-well-formedness.ts`](../packages/semantic-core/src/runtime-state-well-formedness.ts).

The instance index is not decoration and not currently load-bearing. A predicate that read the expected identity out of the state under check would admit any internally consistent injected state, so the parameter is supplied by the caller. Both installed call sites pass an identity that cannot disagree, so the conjunct is inert today; the parameter exists for a caller holding a genuine external expectation.

Two monotonicity facts are separate relations rather than conjuncts, because whether a counter decreased or a retired identity was reissued belongs to a transition history and cannot be reconstructed from one state. `RuntimeStateMonotone` and `RuntimeStateTimeMonotone` are propositions in Lean. Only the first has an executable core counterpart: `runtimeStateRegressions` decides its eight counter families and `endOccurrences`. `RSI-MONO-03` has none, and the nearest core artifact is not one: the continuation guard's `recoveredTimeIsBelowEveryLiveDeadline` is a one-state check that no live deadline sits below current time, not the two-state implication. `RSI-BOUND-01` is different: it compares each currently live included identity with its key's count in that same state.

### Layer 1: lifecycle and structure

| Rule | Proposition |
|---|---|
| `RSI-LIFE-01` | `notStarted` admits no occurrence, token, wait, hidden record, incident, or pending initiation |
| `RSI-LIFE-02` | `completed` and `cancelled` admit no live occurrence and no token |
| `RSI-OWN-01` | every token, User Task wait, Message wait, Timer wait, effect wait, incident-retained wait, selected-branch record, event race, called-process record, and Activity occurrence record names exactly one live scope occurrence as its owner |
| `RSI-UNIQ-01` | the occurrence identity triple `(processInstanceId, definitionScopeId, activation)` appears exactly once in `scopeOccurrences` |
| `RSI-UNIQ-02` | within each wait family the family's occurrence key appears at most once: User Task `(instance, element, activation)`, Message subscription identity, Timer occurrence identity, effect occurrence identity |
| `RSI-DISJ-01` | one effect occurrence appears in `effectWaits` or in `effectIncidents`, never in both |
| `RSI-ORDER-01` | the six collections that declare a canonical order hold it: `waits`, `activations`, `selectedBranchSets`, `eventRaces`, `calledProcessOccurrences`, and `activityOccurrences` |
| `RSI-BOUND-01` | no live counter-minted identity exceeds its key's recorded count, with an absent counter read as zero. **Implemented narrower than stated:** the consumer-required User Task, Timer, and Activity families only. Message, Effect, Event race, Call, and ordinary Scope remain unstated, and called roots remain excluded from the general Scope account |

### Layer 2: program agreement

| Rule | Proposition |
|---|---|
| `RSI-BIND-01` | a token's control place exists in the program and the program's declared owning definition scope for that place equals the token owner's definition scope |
| `RSI-BIND-02` | an occurrence's definition scope exists uniquely in the program, its instance identity is nonempty, its activation is positive, and its runtime parent link projects the program's declared parent scope |
| `RSI-BIND-03` | exactly one parentless occurrence is the hosting root of the running instance, and every other parentless occurrence is the called root of exactly one live called-process record |
| `RSI-BIND-04` | each wait's identity is declared by exactly one program operation from that wait family's declaring set, and that operation is owned by the wait owner's definition scope. **Implemented narrower than stated:** `waitDeclarationsValid` filters to waits of the hosting instance, because a called Process may be a separate definition the state does not carry |
| `RSI-BIND-05` | each selected-branch record's selection key matches exactly one `selectMany`, each event race matches exactly one `awaitEventRace`, and each called record matches exactly one paired `invokeProcess` and `returnProcess`. **Implemented narrower than stated:** the `selectMany` and `awaitEventRace` clauses only; the called-record clause is decided nowhere, since `calledProcessAssociationsValid` never reads `program.operations` |

### Layer 3: monotonicity

| Rule | Proposition |
|---|---|
| `RSI-MONO-01` | every activation counter family is a per-key high-water mark that never decreases across a committed transition; eight families since `activityActivations` joined |
| `RSI-MONO-02` | `endOccurrences` never decreases |
| `RSI-MONO-03` | `logicalTimeMs` never decreases, under the named firing hypothesis below |
| `RSI-MONO-04` | a newly created occurrence, task, Message, Timer, effect, race, or call identity is strictly above its key's pre-state counter, so a removed identity is never reissued. **Not stated:** `RSI-BOUND-01` constrains live identities in the post-state but does not state this issuing discipline, so non-reissue remains an explicit absence |

### Derived rather than asserted

| Rule | Consequence | Derivation |
|---|---|---|
| `RSI-FOREST-01` | the live scope-occurrence graph is an acyclic parent-linked forest | under a `programWellFormed` hypothesis, whose `scopeForestWellFormed` conjunct in [`GraphValidation.lean`](../BpmnSemantics/SemanticProcess/GraphValidation.lean) already requires an acyclic definition-scope forest by invoking `acyclicClosed`, `RSI-BIND-02` projects each runtime parent onto the program's declared parent scope, so no runtime cycle can project onto it |
| `RSI-TERM-01` | a terminal state holds no wait, hidden record, or incident | `RSI-LIFE-02` removes every occurrence and `RSI-OWN-01` requires a live owner for each of them |

### Facts the rules depend on

**`RSI-ORDER-01` membership criterion.** A collection is listed when every one of its add sites canonically inserts, and excluded when its add sites disagree. `scopeOccurrences` is excluded because Call Activity inserts canonically while `enterScope` prepends. `variables` is excluded because `process.bindings` is merged canonically at User Task completion but takes submitted order at Process start, and `activities` is appended. The criterion decides whether a future collection joins the conjunct; a census does not, and this paragraph was written as a count and was wrong three times before it was written as a criterion.

**`RSI-BOUND-01` membership criterion.** A counter family belongs when every site that writes one of its live-member collections leaves the member's activation at or below its key's count in that site's post-state and no site lowers the count. The implemented subset follows current consumers rather than pretending the remaining branches were checked: User Task, Timer, and Activity are executable; Message, Effect, Event race, Call, and ordinary Scope remain open. The full criterion, the called-root exclusion, and the indirect identities are owned by the [identity-bound proposal](RUNTIME-STATE-IDENTITY-BOUND-PROPOSAL.md#the-proposed-rule).

**Per-family declaring sets for `RSI-BIND-04`.** A Timer wait may be declared by `awaitTimer`, `awaitBoundedUserTask`, `awaitMonitoredUserTask`, `enterBoundedScope`, or `awaitEventRace`. A Message wait by `awaitMessage` or `awaitEventRace`. A User Task wait by `awaitUserTask`, `awaitBoundedUserTask`, or `awaitMonitoredUserTask`. An effect wait by `awaitEffect`. Composite arming operations declare waits of families they are not named after, so a single-kind reading rejects reachable states.

**`RSI-MONO-03` firing hypothesis.** `RuntimeStateTimeMonotone` holds under the hypothesis that the fired deadline is at or after current logical time, stated as `before.logicalTimeMs ≤ firedDeadlineMs`. The hypothesis is bound to the `fireTimer` constructor's committed outcome rather than to a list of arms, because that single ingress reaches every time-advancing arm and an enumeration omits one.

**`RSI-BIND-03` is deliberately not "exactly one parentless occurrence".** That stronger reading is false while a called Process is live, which is why `rootScopeOccurrence?` returns `none` in that state.

**An adapter assumption rests on `RSI-MONO-04`, which is not stated.** The host joins a durable deadline to committed state assuming a Timer or task identity is never reused after withdrawal. That assumption rests on the evaluator's issuing discipline rather than on this account.

## The deliberately open lane

`RSI-OBL-03` through `RSI-OBL-06`, which are preservation across the twenty-four registered internal arms and ten external constructors, refusal preservation, and monotonicity across the same arms, are **deliberately open** under [the assurance-lane rule](PROJECT-DESIGN.md#lean-assurance-lane).

The shape was chosen at closure and supersedes this account's earlier commitment to a proved lane. A reader must be able to see that: it was relabelled after the effort was absorbed, not declared at the start, which is why the decision is recorded rather than presented as the original plan.

Reason, measured: preservation of the uniqueness conjunct alone reaches ninety-one wait-collection assignment sites across fifteen semantic modules, and each newly armed wait still needs its issuing transition to establish a key above the pre-state count. The User Task body-turnover proof now discharges its local freshness consequence from `RSI-BOUND-01` because that transition explicitly chooses the post-state count plus one; this does not prove the general issuing discipline.

Open means open indefinitely. Two consumers already need it and are unmet: the [interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) and [Sub-Process boundary Timer](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md) deferrals both wait on preservation of `waitIdentitiesUnique`.

Reopen when a consumer needs a stated conjunct discharged rather than assumed, when a capsule needs a state fact the list lacks, or when a new operation kind or stimulus is registered.

`RSI-OBL-01` and `RSI-OBL-02` are proved under an assumption, not unconditionally. All four theorems, the empty-state one included, take `runtimePositionValid` of the state they conclude about as a hypothesis, and nothing establishes it; `programWellFormed` rides inside it. The Message and Timer corollaries inherit that hypothesis from `runningProgramStartState_wellFormed`, which every admitted start routes through.

## Enforcement

The predicate gates the fail-closed command path and the Workflow-continuation boundary in TypeScript. It gates nothing in Lean: the pre-dispatch gate is **excluded**, because gating on a predicate whose preservation is unproved risks refusing a reachable state.

The gate decides a narrower set than the predicate. Program-agreement classes are excluded from it, because deciding them needs the complete definition and the program handed to a command is only the hosting one. `LiveIdentityAboveCounter` is included because the implemented branches read one state and no called definition.

Enforcement should follow preservation. It did not: the gate landed at the semantic checkpoint and the core preservation lane at closure. A newly refused state is therefore treated as a defect in the validator until the state is shown unreachable.

## Exclusions

Owned elsewhere and excluded here: any BPMN capability, operation kind, runtime field, public observation field, profile, or scenario; the shared Activity occurrence record owned by `ACTIVITY-OCCURRENCE-OWNERSHIP`; the commutation and semantic-choice account owned by `INTERNAL-COMMUTATION`; sequential Multi-Instance runtime; liveness, progress, termination, and confluence; a general checked-source-to-run preservation theorem; and any Temporal or CIB behavioral claim.

**Representation: `Bool` only.** One executable predicate with laws over its `= true`, and no independently maintained `Prop` twin. Two manually synchronized definitions are excluded outright.

## Bridge classification

An `OperationStep` arm is the graph of the evaluator whenever passage cannot fail apart from it, which happens two ways: the arm states the evaluator's equation as its premise, or it binds premises and names the evaluator's own transformation as the successor. For every such arm the soundness bridge is a dispatcher, exhaustiveness, and constructor-selection check, and no capsule may cite it as a semantic evidence lane.

An arm earns an independent lane only by stating premises the evaluator does not supply, as a per-offered-token merge relation does.

The falsifiable replacement is runtime-state well-formedness preservation. What exists is the semantic core's executable lane over five schedules; the quantified Lean form is the open lane above. Neither substitutes for the other, and a citation must say which it means.

## Evidence lanes

| Lane | What passage establishes | What it cannot establish |
|---|---|---|
| Lean predicate and initialization | the account is stated executably and holds at every admitted start | preservation over any state holding a live wait |
| Lean withdrawal finality | erasing the wait holding a key leaves none carrying it, for every state | that a reachable state satisfies the uniqueness hypothesis it assumes |
| Lean kernel-decided negatives | each added conjunct rejects its own malformed state beside an admitted control, with siblings asserted intact, `RSI-BOUND-01` has one decided negative for each implemented family, and each monotonicity relation is refused by a successor that satisfies every conjunct, the counter rewind breaking `RuntimeStateMonotone` and the clock rewind breaking `RuntimeStateTimeMonotone` under a holding firing hypothesis, with each relation admitting the successor the other refuses | that the conjunct list is complete; for `RSI-BOUND-01`, the Message, Effect, Event race, Call, and ordinary Scope branches remain unimplemented and unwitnessed |
| Core validator and preservation lane | five schedules reach only admitted states at every microstep, each stimulus commits, and the identity-bound test independently refuses a live User Task, Timer, and Activity identity after only its matching counter is removed | schedules those five do not reach; for the pre-existing conjuncts, the effect wait and incident branches and declaration instance scoping remain unexercised, while the narrowed identity bound leaves Message, Effect, Event race, Call, and ordinary Scope outside the predicate |
| Publication-parity channel | both languages refuse the same six classes by label rather than by shared code | that the account was independently chosen; agreement on `RSI-BIND-04`, which the two sides state differently; and class separation, which no retained catalog mutation covers |
| Temporal continuation witness | a recovered state whose logical time passed a live deadline is refused, and a declared resumable User Task checkpoint is accepted with counter 1 then refused after only that counter entry is removed | no claim for the unimplemented identity-bound families, and no general proof that every structural defect reaches this boundary's gate before another checkpoint condition |

Six rows are listed and five lanes are counted: the parity channel's Lean half applies the same predicate to the same fixture terms as the Lean negatives, so the two Lean producers count once. Its TypeScript half is the independently written validator already counted one row above. The wait families diverge, Lean perturbing a Timer wait and the core a User Task wait, which covers three of the six classes; the order, lifecycle, and hidden-record constructions are mirrors.

## Epistemic boundary

Established: the admitted state set is stated executably, holds at every admitted start, refuses each implemented malformed class in both languages, and is preserved across five executed schedules in the core. The three implemented identity-bound families have separate negatives, and the User Task branch is observed again at Workflow continuation.

Nearest unsupported claim: quantified preservation. No Lean theorem would go red if `waitIdentitiesUnique` were preserved by no arm at all. The core lane does constrain it over the User Task, Message, and Timer wait families, which the registered schedules reach; the effect wait and incident branches are the ones no schedule holds.

Common-mode risk: one author wrote the predicate, its negatives, and this document. The counter is that each conjunct has a negative failing without it, with siblings asserted intact so a refusal is attributable to the named conjunct. For the narrowed identity bound this protection applies to each implemented family, not to the five family branches that remain absent.

## Independent cold-review receipt

The proposal stage used two correction rounds, which is the applicable bound. Round one closed nine required findings and raised three; round two closed those three and approved, leaving one advisory that this document applies rather than defers.

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4a54981` | `fork-turns-none` | `approve-with-required-edits` | `8e0bfdf` |
| Semantic checkpoint | `7f531c4` | `fork-turns-none` | `approve-with-required-edits` | `faad37c` |
| Closure | `3ab91b1` | `fork-turns-none` | `approve-with-required-edits` | `ac4fe35` |

The semantic checkpoint used four correction rounds against a standing bound of two, with the owner authorizing rounds three and four; the closure stage used four, with the owner authorizing rounds three and four. Each round's findings and audited correction commit are in Git history rather than restated here.

The closure correction spans `ac4fe35` plus this document's own edits. Those were audited before commit at SHA-256 `a1fe1c18…5856` and landed with only the route-atom and attestation corrections that audit required, so Git records the map half and not the document half. That is the same verification limit `fork-turns-none` carries and [TESTING-SPEC.md](TESTING-SPEC.md#review-receipt) owns.
