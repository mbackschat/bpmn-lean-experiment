# Activity host split proposal

## Status

Lifecycle: draft
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a User, Service or Send Task with one incoming and several unconditioned outgoing Sequence Flows (implicit split), in the Process root and in ordinary embedded Sub-Process bodies, by lowering exactly those Tasks to the existing [Activity host](ACTIVITY-HOST-FLOW-LISTS-SPEC.md) with several outputs, and by giving the User Task and effect wait records an output list, so that no admitted model's Program, command or publication changes?

This is the third family of Kernel IL orthogonalization in [PLAN](../PLAN.md#scheduled-delivery-batches), its wait-record stage. The [Activity host specification](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#question-and-delivery-boundary) deferred the split here, because a split's completion must produce several tokens and the User Task and effect wait records carry one `output`. The parked [Activity implicit split and merge proposal](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md) (AISM) owns the BPMN account and the CIB classification this family reuses; this account replaces its representation for splitting Tasks.

The selected clause of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-CF-07`, its split clause at User, Service and Send Tasks outside every fork region (`ACSP-SINGLE-01`): completion takes every unconditioned outgoing flow in its one step. The row stays open on:
  - conditional and default outgoing flows;
  - a splitting Task inside a fork region;
  - splits at data-input, data-output, bounded, monitored and Multi-Instance User Tasks, at Service Tasks with a BPMN Error route, and at Receive, Script and Rule Tasks and catch Events;
  - every merge other than at User, Service and Send Tasks, concurrent arrivals, and called and Multi-Instance bodies.

Close calls, 2026-11-07, each with its measured reason:

- **The split precedes the switch, by owner direction (2026-11-07).** The [retirement rule](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#retirement-of-the-dual-representation) and PLAN's batch-5 text made the split family PLAN's "one switch", which lowers every User, Service and Send Task onto `activity`. The owner chose a bounded amendment (2026-11-07): the Task split is the last host-only arity form of the Activity host; the switch is scheduled as the next Kernel IL family after this one; later Timer increments still wait for the switch. The double check presented with the choice: it serves the deliverable-first direction and the incremental route PLAN records; the strongest objection is one more host-only branch the switch must fold back; the best alternative, the split as the switch, re-lowers every plain Task, and a spike of that lowering alone on a throwaway clone of `d62d89d9` failed 392 of the 2,354 `bpmn-source` tests across about 60 test files, every profile's admission among them, without the variant fields the real switch also needs, so its full cost is unmeasured and larger; a measured switch cost close to this family's would reverse the choice. The freeze keeps the legacy declarations fixed in the meantime. Rejected besides: a defaulted `extraOutputs` field beside `output`, which every reader of `output` would silently ignore, among them the continuation counts of [`ContinuationMarking`](../../BpmnSemantics/SemanticProcess/ContinuationMarking.lean).
- **The wait records carry the list.** The rejected alternative is completion reading its outputs from the Program by operation id, which puts a Program lookup into every completion path. Kind-keyed waits, PLAN's later reshape of the same records, keeps the list as a field.
- **Splitting Tasks stay outside fork regions**, as the scope host's splits do: the host's arrival has no prepared footprint ([internal commutation](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#internal-commutation)), so enabled beside a sibling it fails closed.

**Batch rule.** The one open clause that shares the mechanism, a Task completion producing several tokens, is selected; its variants are screened under [Excluded](#required-optional-and-excluded-scope).

**Reach**, over the 1,866 deduplicated parsed BPMN files under `engine/src/test/resources` of the pinned CIB Seven checkout at `5a45b47` (2026-11-07; a Task counts when it has two or more outgoing flows, none with a `conditionExpression`, and no `default`): 9 files hold a splitting User or Service Task, among them `SequenceFlowTest.testTakeAllOutgoingFlowsFromNonScopeTask` (a plain User Task into two User Tasks) and `testTakeAllOutgoingFlowsFromScopeTask` (the same with a boundary event, excluded). The others carry exclusions outside this family (`camunda:asyncAfter`, Java delegates, listeners, Process instance modification).

## Normative basis and CIB classification

**BPMN.** Clause 13.3.1 (reading copy line 12294): an Activity with several outgoing Sequence Flows gives "all of them" a token "when the **Activity** transitions to the _Completed_ state", a parallel split.

**CIB Seven** at `5a45b47`:

- `BpmnActivityBehavior#performOutgoingBehavior` (lines 82-116) takes every unconditioned non-default outgoing transition in one `leaveActivityViaTransitions`; `PvmAtomicOperationTransitionDestroyScope` creates one concurrent execution per further transition. No activity instance is created for the split.
- `UserTaskActivityBehavior` leaves through `leave` after `complete`; `ServiceTaskJavaDelegateActivityBehavior` and the external-task behaviour through `leave` after the result.
- `SequenceFlowTest#testTakeAllOutgoingFlowsFromNonScopeTask` asserts both successor User Tasks after one completion and the Process ending after both.

**Register change:** a new entry `CIB-AGR-0023 — a User, Service or Send Task's completion takes every unconditioned outgoing flow in its one step`. It is a normative agreement bounded to this profile and these placements, names `CIB-AGR-0020` (the merge at the same Tasks) and `CIB-AGR-0022` (the split at Starts and Sub-Processes), and is added with its verifier coverage. No local branch claims `0023` (checked 2026-11-07).

## Required, optional and excluded scope

**Required**, for the nested scope-data profile only:

- A *splitting Task*: a User Task, Service Task or Send Task of the kinds the [Activity host](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#required-optional-and-excluded-scope) admits as a merging Task (a User Task without data-input, data-output, boundary or Multi-Instance variants; a Service or Send Task without a BPMN Error route), with exactly one incoming flow and two or more unconditioned, non-default outgoing flows, in the root graph or in an ordinary embedded Sub-Process body.
- **Singleton placement** (`ACSP-SINGLE-01`): a splitting Task lies outside every fork region of its scope and of every ancestor scope.
- The branches of a split follow the branch rules of a Parallel fork, as the scope host's do.

**Optional:** none.

**Excluded**, each refused at admission as today:

- a splitting Task inside a fork region, including on a branch of a Parallel fork, an implicit split or an Inclusive region;
- a Task with several incoming and several outgoing flows: a merge routes to the re-entry account, which refuses a forking Program;
- splits at the variants, which have no host field until the switch;
- splits at Receive Tasks and catch Events, whose `MessageWait` and `TimerWait` keep one `output` until the shared catch trigger reshapes them;
- splits at Script and Business Rule Tasks, which this profile does not admit at all (their runtime dependency awaits an owner decision);
- a splitting Call Activity, whose outgoing flows leave its `returnProcess`, a scope host form;
- conditional or default outgoing flows of a Task, an inclusive split in CIB;
- an Activity without outgoing flows;
- a splitting Task in a called Process or a Multi-Instance, bounded, monitored or transaction body;
- every form under any profile that lacks the arity flags named under [Admission](#admission).

These bound admission only: the host's output records admit conditions and defaults, and an empty host output list admits an Activity without outgoing flows, without reinterpreting an admitted model; the wait's non-emptiness field below is the one representation fact that family removes.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) gains `CIB-AGR-0023`, and its exclusion of implicit splits outside pass-through nodes, root merging Tasks and singleton Sub-Process splits narrows to name singleton Task splits as admitted.

Publication adds no kind. The host's arrival publishes its work's legacy kind as today, and completion publishes the legacy User Task completion or effect result once, with one token per outgoing flow: no step and no position for the split, as CIB has none.

## Representation and runtime ownership

### Wait records

[`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) and its TypeScript twin [`semantic-process-state.ts`](../../packages/semantic-core/src/semantic-process-state.ts) replace one field in each of two records:

```lean
structure UserTaskWait where
  -- …unchanged fields…
  outputs : List ControlPlaceId   -- was `output : ControlPlaceId`
  outputs_ne_nil : outputs ≠ [] := by simp

structure EffectWait where
  -- …unchanged fields…
  outputs : List ControlPlaceId   -- was `output : ControlPlaceId`
  outputs_ne_nil : outputs ≠ [] := by simp
```

```ts
export type SemanticUserTaskWait = DeepReadonly<{ /* … */ outputs: string[] }>;
export type SemanticEffectWait = DeepReadonly<{ /* … */ outputs: string[] }>;
```

Every admitted wait continues somewhere, so the records carry that as a field: the default discharges it at every literal-list construction, record updates discharge it explicitly, and the TypeScript continuation validator rejects an empty `outputs`. It is an admission fact, not BPMN meaning: an Activity without outgoing flows is valid BPMN (an implicit end), and its family removes the field and proves non-emptiness from its profiles' invariants at the consumers that need it, which today are 8 Lean proof modules (Transaction frontier, IMES phase framing, structured composition unit bound, sequential scope certificate, and parallel scope entry, progress, parent progress and command closure; 2026-11-07). Those consumers depend on a continuation existing, so removing the field now would move the same proof obligation forward for a form no profile admits. Every legacy operation opens its wait with the one-element list of its `output`, so every admitted model's state holds the same places as before. Completion of a User Task wait and the result of an effect wait put one token, owned by the wait's owner, on each element of `outputs` in the one completion step; for a one-element list that is the legacy marking. An effect incident retains the wait with its list. Timer and Message waits keep `output`: no catch splits in this family, and the shared catch trigger reshapes them.

Readers of the field change with it. The continuation counts of [`ContinuationMarking`](../../BpmnSemantics/SemanticProcess/ContinuationMarking.lean) and its laws count a place once per occurrence in `outputs`, which [`ContinuationMarkingLaws`](../../BpmnSemantics/SemanticProcess/ContinuationMarkingLaws.lean) already states for a list (`ownedPortCount [wait.output]`).

### Host Program rules

`ProgramStructuralValidation` and its TypeScript twin require of an Activity host either form, and refuse every other:

- a *merging host*, as today: two or more inputs and exactly one output;
- a *splitting host*: exactly one input and two or more outputs.

Both lists stay strictly sorted by control-place id, every named place exists, and the work satisfies the rules of its legacy projection. A host with one input and one output stays refused, so no host doubles a legacy encoding (`ACSP-HOST-01`).

### Steps

A host arrival opens its work's wait as the legacy arrival does, with the host's `outputs` as the wait's list. Two list-taking arrival functions, `awaitUserTaskOutputsState?` and `awaitEffectOutputsState?`, are added beside `awaitUserTaskState?` and `awaitEffectState?` in [`TransitionStates`](../../BpmnSemantics/SemanticProcess/TransitionStates.lean) and their TypeScript twins; the list-taking arrivals take the list's non-emptiness proof as a parameter, so no empty list reaches a wait, and their TypeScript twins return `null` for an empty list and the `activity` arm of `OperationStep` decides the host's non-emptiness and returns `none` on an empty list, so Lean and TypeScript cannot diverge on an unvalidated Program; the legacy functions keep their signatures and their bodies, and the list-taking activations `activateUserTaskOutputs` and `activateEffectOutputs` in [`WaitActivation`](../../BpmnSemantics/SemanticProcess/WaitActivation.lean) state their agreement with them on `[output]` as laws proved by `rfl`, so their 24 Lean consumer files, mostly proofs, are not edited. This replaces the one-element wrappers first proposed, because rewriting the legacy bodies through the list-taking ones changed the unfolding those proofs rely on; the agreement law, not a shared body, now carries the claim that a host and its legacy operation arrive alike. A merging host's arrival keeps its rule (exactly one marked input). `OperationStep`'s `activity` arm is unchanged in shape.

The per-work accessor `ActivityHost.projection?` keeps its one-output meaning and is `none` for a splitting host. Its readers would otherwise pass or drop a splitting host silently, so each is named and changed:

- **Work validity.** `activityHostWorkValid` ([`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean)) reads `projection?` from every input, and `none` passes vacuously. A new accessor `ActivityHost.workAt input output` gives the legacy operation for one input and one output, and work validity checks it for every pair, so a splitting host's work is checked once per output. The TypeScript `isWellFormedActivityHost` does the same.
- **Program vertex.** `operationVertex?` in [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) and its twin read the host's work through `workAt` with its first input and give the vertex every output's consumer.
- **Settled projections.** Every TypeScript caller of `settledOperation` and `settledOperations` ([`activity-host-work.ts`](../../packages/semantic-core/src/activity-host-work.ts); 11 production files, 2026-11-07, among them [`semantic-process-profile.ts`](../../packages/semantic-core/src/semantic-process-profile.ts)'s `settledOperations(...).every`) handles a splitting host explicitly, reading its work and origin through the accessors and its outputs from the host or the wait.

The census population includes the Lean `projection?` readers and the TypeScript settled-projection call sites.

### Lowering

A User, Service or Send Task of the admitted kinds lowers to `activity` exactly when it merges (as today) or splits, in [`ActivityHostLowering`](../../BpmnSemantics/SemanticProcess/ActivityHostLowering.lean) and [`activity-host-lowering.ts`](../../packages/bpmn-source/src/activity-host-lowering.ts). The dispatch in [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) and the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) widens its condition without adding lines, or moves a cohesive block into the leaf first where it would exceed the review target. Every Task with one incoming and one outgoing flow keeps its legacy lowering (`ACSP-ONE-01`).

### Forward shape

| Planned feature | Its place |
|---|---|
| Splitting Tasks inside fork regions | A prepared host footprint over `inputs` and `outputs` |
| Conditional and default outgoing flows | Defaulted fields of `ActivityOutput`, read by completion over the wait's list |
| An Activity without outgoing flows | An empty `outputs` on the host; the wait drops `outputs_ne_nil`, the TypeScript continuation validator's non-empty check goes with it, and the consumers take non-emptiness from profile invariants |
| Splits at the variants | Their switch onto the host, with the shared feature record |
| Kind-keyed waits | One wait record keyed by kind, carrying `outputs` |

### Retirement of the dual representation

The [Activity host retirement rule](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#retirement-of-the-dual-representation) is amended at closure, by the owner direction above: the Task split is the Activity host's last host-only arity form; the next Activity-host family is the switch, and so is any family that adds a feature field to the host, lowers a further variant of User, Service or Send Tasks onto an unchanged legacy constructor, or changes a frozen declaration. That is the rule the [scope host](SCOPE-HOST-FLOW-LISTS-SPEC.md#retirement-of-the-dual-representation) already has, under which its further arity forms (the scope merges) are switch triggers; the Activity host takes the split as its one admitted exception. PLAN records the scheduled switch. The host-coverage census keeps the legacy declarations byte-identical; the wait records are not among them.

### Runtime-only and synthetic constructs

None at runtime. The admission projections' synthetic `fork` vertex after a vertex with several successors is the scope host's, reused.

### Measurements (capsule item 19), 2026-11-07

**Why not lower onto existing operations.** A splitting Task lowered to its legacy operation into a place that feeds a `duplicate` adds a step, a burst step and a token position CIB does not publish, and a place with no Sequence Flow behind it, as the [scope host](SCOPE-HOST-FLOW-LISTS-SPEC.md#measurements-capsule-item-19-2026-11-07) measured for Starts.

**Why not widen the legacy constructors.** Widening `awaitUserTask` and `awaitEffect` to output lists reaches every positional site of them (106 and 95 Lean production files) and changes frozen declarations, which the retirement rule makes the switch.

**Blast radius**, from spikes on a throwaway clone of `d62d89d9`:

| Measure | Result |
|---|---|
| TypeScript, `output` → `outputs` in both wait records | 32 type errors in 19 `semantic-core` production files, each a construction (`output: x`) or a read |
| Lean, the same change, building the 239 modules naming either record or the wait collections | 7 modules fail first-order (`ContinuationMarking`, `WaitActivation`, `EffectCompletion`, `ActivityDataInput`, `ActivityDataOutput`, `ParallelMultiInstanceTransition`, `ParallelMultiInstanceProgramBindingFacts`), 24 errors, before 546 dependent jobs were blocked |
| Lean production files naming `UserTaskWait` or `EffectWait` | 192 |
| Lean reads of a wait's `output` (static, `wait.output`, `w.output`, `(·.output)`) | 409 sites in 79 files, 39 of them proof or law files; 66 of those lines name Timer or Message waits, whose field is unchanged |
| Lean consumers of `awaitUserTaskState?` and `awaitEffectState?` | 24 files, left unedited because the legacy bodies are kept |
| `lean-fanout` and `source-hygiene` on the Lean and TypeScript spike | pass (66 of 66) |
| The rejected switch: every plain Task onto the host, every profile | 392 of 2,354 `bpmn-source` tests fail; `semantic-core` 1 of 1,871 |

**Coverage and stop condition.** The Lean probe stopped at its first-order failures, and the static count above covered reads only. A complete build of the change's reverse import closure in a throwaway clone (970 modules, 2026-11-07) measured 133 Lean files: 86 that read a wait's `output`, 31 that only construct or update the records (fixtures and conformance witnesses the probe never reached), and 16 record, law or signature-threading files. By owner direction (2026-11-07), replacing the earlier estimate of 90 files, the representation commit's Rule 2 declaration sets its limits to that measured change: exactly its 133 Lean files with at most 999 added and 725 removed Lean lines, and exactly its 53 TypeScript files (45 from the type checks, 7 test fixtures and negative witnesses that spell a wait as a plain object literal the type checker does not see, and the retained parallel Multi-Instance history measurement, which grows by 3 bytes per wait); it stops, writing nothing further, when a repair would need a new `import all` opener, a raised fan-out or heartbeat bound, or a size exception, when a file outside the measured list or a `MessageWait` or `TimerWait` field would change, or when a limit is reached.

**Hubs touched**, each named with its reason ([Lean build efficiency](../../CLAUDE.md#lean-build-efficiency)):

- `RuntimeState`, an interface edit of a declared kernel type module (the two fields), unavoidable for a runtime-state field change, with the module's whole cone rebuilding once, in the representation commit;
- `ProgramStructuralValidation`, a hidden body edit of a closed-world function (the host rules and `activityHostWorkValid`), which rebuilds its `import all` importers and the global fixtures that reduce it;
- `TransitionStates`, two new declarations beside hidden legacy bodies, an interface edit whose cone `lean-fanout` reports in the representation's declaration.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) and adds no profile-ID comparison. The Task arm of `checkedNodeArityValid` in Lean [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and its twin in the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) widen on the outgoing side under the flags that admit a pass-through split (`mixed && variableMerge`, `PTSM-ADMIT-01`); only the nested scope-data profile holds them.

The checked and Program analyses classify a splitting Task as its lowered host forks:

- **Checked level.** [`CheckedPassThroughFlow`](../../BpmnSemantics/SemanticProcess/CheckedPassThroughFlow.lean) and its twin gain `splittingTask`, and `forks` includes it, so the shape gate, the region walk, the routing and `concurrentStructuredScopeDataChecked` read it.
- **Program level.** The vertex projections give a splitting host its Task vertex with every output's consumer as a successor; the post-pass `withSplitForks` in [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean) and its twin already follows a task vertex with two or more successors by a synthetic fork. `NestedScopeControlAdmission` is at its review target, so a cohesive block moves out before any arm is added there.
- **Placement (`ACSP-SINGLE-01`).** Both levels refuse a splitting Task whose vertex lies between a fork and its join, or on a terminal branch, in its scope or any ancestor scope, by the reachability test the scope host's placement uses.
- **Routing.** Every place that treats a host as a merge reads the host's form instead:
  - `StructuredScopeData.splits` and the root-split half of `programRestrictionsHold` (`RPF-ADMIT-01`) count a splitting host as a split;
  - the concurrent account's refusal of every host, the [Program routing](../../packages/semantic-core/src/structured-scope-data-routing.ts) refusal and [`scopeReentryProgram`](../../packages/semantic-core/src/scope-reentry-admission.ts) and their Lean twins apply to merging hosts only.

  A model with a splitting Task therefore routes to the concurrent account at both levels, and a model that also merges at a Task is refused there, since a merge routes to the re-entry account, which refuses a forking Program.
- **Concurrent Program analysis.** The analysis behind `programModel` in [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts) and its Lean twin in `NestedScopeControlAdmission` read Task kinds directly: the Task and Service Task lists behind the 32-Service-Task and 128-wait bounds, the effect presence that requires a source overlay, the handler set the overlay must bind, the data accesses of effects, and the Program operation alphabet, which excludes `Activity`. Each reads a host through the accessors (wait kind, cardinality class, the work's effect), so a splitting Service Task host counts as a Service Task and needs its handler (wrong algorithm 11). The TypeScript reads it through `settledOperation` in the accessor leaf. The Lean twin reads it through `NestedScopeData.settledOperation`, the legacy operation of the work's projection, because `ActivityHostWork` is at its importer bound (441) and the analysis may not import it; each Lean reader keeps an explicit `.activity` arm, so the host census sees it.

**Nearest wrong algorithms**, each with a separating witness below:

1. arity widened at one level only;
2. arity widened for every profile;
3. a completion that takes the first output only, or exclusively;
4. a split realized as a separate step or position;
5. a splitting Task admitted inside a fork region, enabled beside a sibling;
6. a reader of the wait list that counts only its first element, so a continuation count or a footprint misses a branch;
7. a consumer that drops a splitting host because its settled projection is `none`;
8. a one-flow Task lowered onto the host;
9. a splitting host routed as a merge, so its model goes to the re-entry account or the concurrent account refuses it;
10. a splitting host classified as passive by Temporal host admission;
11. a splitting Service Task host left out of the Task and Service Task bounds, the handler set or the data accesses of the concurrent Program analysis.

## Stable rules

| Rule | Statement |
|---|---|
| `ACSP-ADMIT-01` | Where the arity flags hold, a splitting Task is admitted at both levels alike, under `ACSP-SINGLE-01` and the Parallel branch rules. |
| `ACSP-COMPLETE-01` | A splitting Task's completion or effect result puts one token on every outgoing flow in its one step, adding no step, position or occurrence. |
| `ACSP-WAIT-01` | A User Task or effect wait carries the output list of the operation that opened it; a legacy operation's list has one element, and completion marks every element. |
| `ACSP-SINGLE-01` | A splitting host is admitted only where no other internal operation can be enabled with its arrival, and is never batched. |
| `ACSP-ONE-01` | A Task with one incoming and one outgoing flow lowers to its legacy operation, so every admitted model's Program and publications stay byte-identical and its states hold the same places. |
| `ACSP-HOST-01` | A host is merging or splitting by the host Program rules, publishes its work's legacy kind and opens its work's wait with its outputs. Every other host is refused. |
| `ACSP-PROFILE-01` | Every profile without the arity flags refuses each form it refuses today. |

## Newly reachable waits and resumption

None of a new shape. A split reaches the wait sets a Parallel fork after the same Task reaches. The wait records gain the list; Continue-As-New carries runtime state with the list ([workflow continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts)), a pre-release replacement.

## Separating witnesses

**Insurance claim intake**, one whole model with a source overlay and a mapped Service Task:

- Start → embedded Sub-Process *Intake*, whose body is: body Start → mapped Service Task *Register claim*, which splits into User Task *Archive documents* → body End and Send Task *Notify broker* → body End, two terminal branches; *Intake* completes when both have ended.
- *Intake* → User Task *Review claim*, which splits into a mapped Service Task *Order assessment* and a User Task *Inform customer*, which a Parallel join meets, then User Task *Decide claim* → End.
- Journeys: each completion order after each split.

The model covers a root split, a split in a Sub-Process body, a Service Task and a User Task host, and with *Notify broker* a Send Task as a successor; a Send Task twin of *Register claim* covers a splitting Send Task.

Each split's completion publishes once and opens both successors in the same command (wrong algorithms 3 and 4).

**Refused edits**, at both levels unless stated:

- *Order assessment* made to split while it lies on a branch of *Review claim*'s split (wrong algorithm 5);
- *Intake* placed on a branch of a root Parallel fork while *Register claim* splits in its body, the ancestor-scope part of `ACSP-SINGLE-01`;
- the overlay without *Register claim*'s handler, refused, and the Service Task bound counting *Register claim* (wrong algorithm 11);
- a splitting host that passes the host arm and fails only work validity, refused in both languages: a User Task host with ill-formed task metadata, and an effect host with a descriptor its profile refuses (wrong algorithm 7);
- a conditioned and a default outgoing flow of *Review claim*;
- a second incoming flow at *Review claim* while it splits;
- a Message boundary event on *Review claim*, and a BPMN Error route on *Register claim*, each while it splits;
- a root Task split beside a root Call (`RPF-ADMIT-01`) and beside a root Choice (re-entry refusal), each also asserted on the lowered Program alone (wrong algorithm 9);
- the model under the embedded completion profile.

**Data-free twin.** CIB's `testTakeAllOutgoingFlowsFromNonScopeTask` shape, admitted under an overlay that binds no handler, as its explicit-fork twin is.

**Profile matrix.** Lean checks the widened arity arm over every combination of the flags.

**Kernel witnesses**, in both languages:

- every existing scenario's Program unchanged (`ACSP-ONE-01`, wrong algorithm 8);
- a legacy wait opened with a one-element list and a host wait with the host's outputs; a continuation count over a two-element wait (wrong algorithm 6);
- a host with one input and one output, with two inputs and two outputs, and with unsorted outputs, each refused;
- a lowered Program with a splitting host on a Parallel branch fails closed in the scheduler (wrong algorithm 5), in TypeScript;
- the onboarding of each settled-projection call site, by the census (wrong algorithm 7);
- Temporal host admission classifies a host with two or more outputs as a token split and as its work's host-driven wait (wrong algorithm 10);
- a two-element effect wait carried across a forced Continue-As-New, which [`workflow-continuation.ts`](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) validates by string key, outside the compiler's reach.

## Oracles this family changes

- **Capability catalog disclosures.** The several-flow pins of the [capability catalog disclosures](../../scripts/capability-catalog-disclosures.test.ts) are rewritten.
- **Internal commutation census.** The [family census](../INTERNAL-COMMUTATION-PROPOSAL.md) row of the Activity host names both forms.
- **Temporal host admission.** [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) classifies an Activity host by its lists, as a scope host.
- **Activity host coverage census.** The [census](../../scripts/activity-host-coverage-census.test.ts) gains the settled-projection call sites and the readers of the wait lists as populations.
- **Scope exclusions**, narrowed at closure: the [Activity host](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#required-optional-and-excluded-scope) exclusion of splits at Tasks, and the retirement rule as amended above.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `ACSP-ADMIT-01` | The model admitted at both levels; the refused edits per level | Source, core, Lean conformance checks, pipeline | Widen at one level only (1) |
| `ACSP-COMPLETE-01` | Claim journeys; both split completions | Core; pipeline across Lean, core and Temporal; CIB probe | First output only (3), a seeded pipeline mutation |
| `ACSP-WAIT-01` | Legacy and host waits; the continuation count | Core and Lean conformance checks; every existing scenario | Count the first element only (6) |
| `ACSP-SINGLE-01` | The branch-placed refusal; the branch-placed Program refused by Program admission | Source, core, Lean conformance checks | Admit inside a fork region (5) |
| `ACSP-ONE-01` | Every existing scenario of every profile | Lean library, `BpmnConformance`, pipeline, differential, frozen compiler baseline | A one-flow Task lowered to the host (8) |
| `ACSP-HOST-01` | The refused host Programs; routing of both forms; the token-split classification | Lean conformance checks, core and protocol tests, host-coverage census | A split routed as a merge (9); passive classification (10); a dropped settled projection (7) |
| `ACSP-PROFILE-01` | The flag matrix; the model under the embedded completion profile | Source and Lean conformance checks | Widen for every profile (2) |

## Lean assurance lane

Lane shape: proved

Evidence: evaluator soundness [`fire_sound`](../../BpmnSemantics/SemanticProcess/Transition.lean#fire_sound) keeps its `activity` arm, whose step is the declared `OperationStep` (dispatch only). The continuation laws [`human_continuation_exchange`](../../BpmnSemantics/SemanticProcess/ContinuationMarkingLaws.lean), `effect_continuation_exchange`, `human_port_exchange` and `effect_port_exchange` of `ContinuationMarkingLaws` are restated over the wait's list and stay proved, so a legacy wait's one-element list is covered by the same theorems.

**Deliberately open, checked instead:** the host's arrival agreeing with its work's legacy arrival when the host is read as a one-output operation, kept as the switch family's obligation as for the merging host; the `none` footprint; and `ACSP-SINGLE-01` as a theorem, which the finite placement checks witness instead, with the lowered branch-placed Program refused by Program admission; the scheduler's own fail-closed refusal of that Program is unreachable past admission and stays unwitnessed. The Lean command path's handler set (`SerialBusinessTask.programHandlers`) omits hosts while the TypeScript twin includes them; the effect-completion check requires patch names equal to the output-mapping sources, which is believed to make the gap unreachable, not proved. If a restated law needs a new `import all` opener of a hub without hidden-edit headroom, it joins this open boundary rather than raising a bound.

**Conformance checks.** [`ActivityHostConformance`](../../BpmnSemantics/ActivityHostConformance.lean) gains the admission, placement, routing and lowering checks of the claim model.

No new transition family: arrival and completion remain the steps they are.

## Temporal hosting and refinement preflight

No new hosting mechanism: ingress (User Task completion, effect result), waits, timers, cancellation and lifecycle are the existing ones, and forks after a Task use the hosting a Parallel fork after the same Task uses. Effect delivery, retries and incidents read the wait's list where they read `output` today; an incident's retained wait keeps the list, so a resolved incident's result still marks every output.

[Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) classifies an Activity host with two or more outputs both as a token split and as its work's host-driven wait (`hasHostDrivenWait`), so the claim model's effect wait is admitted only through the concurrent analysis and the host's own wait still counts as host-driven. Runtime state carries the list across Continue-As-New, a pre-release replacement under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy); its validators read `outputs` by string key and gain the two-element witness above.

The preserved relation stays equality of hosted committed state and publications with the core's. Smallest refinement witness: the hosted pipeline over every journey, plus one forced Continue-As-New while *Order assessment* and *Inform customer* are both pending after the split.

## Evidence and acceptance

- Answer-free scenarios with registered pipeline cases, each with a seeded mutation.
- Value-domain matrix rows, corpus rows and the About disclosure.
- A CIB probe on a project-authored model of the claim shape, calibrated per journey: one historic activity instance for each Task and none for a split; both successors active after a split in the same command.

Then `PC-CF-07` is accepted for unconditioned splits at User, Service and Send Tasks outside fork regions; the residuals listed under [Question and delivery boundary](#question-and-delivery-boundary) stay open.

## Versioning consequences

A runtime-state change: the User Task and effect wait records' `output` becomes `outputs` in Lean and TypeScript, with every producer, consumer, fixture and test replaced atomically under the [pre-release wire policy](../../contracts/README.md#evolution-policy). No published wire schema carries the field ([publication](../../contracts/schemas/semantic-publication.schema.json) and [canonical result](../../contracts/schemas/canonical-result.schema.json) schemas checked 2026-11-07). The Program schema is unchanged: the host already carries `outputs`. No admitted model's Program or publication changes, by `ACSP-ONE-01`.

### Owners this implementation grows

Derived with `node scripts/what-binds.ts`; every owner that growth would push past the review target moves a cohesive block into an existing or family-owned module before the edit. No size exception and no bound change is requested. The owners at or near their review target are `NestedScopeControlAdmission`, `Lowering`, [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts), [`semantic-process-operation-admission.ts`](../../packages/semantic-core/src/semantic-process-operation-admission.ts) and [`semantic-process-runtime.ts`](../../packages/semantic-core/src/semantic-process-runtime.ts); before an arm would push one of them past its target, the representation's Rule 2 declaration names the block that moves into an existing module of its import closure and that move's `lean-fanout` result, so no new module enters a hub's cone.

- **Lean:** [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) for the field, the readers the compiler names (first-order [`ContinuationMarking`](../../BpmnSemantics/SemanticProcess/ContinuationMarking.lean), [`WaitActivation`](../../BpmnSemantics/SemanticProcess/WaitActivation.lean), [`EffectCompletion`](../../BpmnSemantics/SemanticProcess/EffectCompletion.lean) and the data-input, data-output and parallel Multi-Instance step owners), [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) for the host rules, [`ActivityHostWork`](../../BpmnSemantics/SemanticProcess/ActivityHostWork.lean), [`ActivityHostLowering`](../../BpmnSemantics/SemanticProcess/ActivityHostLowering.lean), [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) for its dispatch, [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean), [`CheckedPassThroughFlow`](../../BpmnSemantics/SemanticProcess/CheckedPassThroughFlow.lean), [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean), [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean).
- **TypeScript:** the [runtime state](../../packages/semantic-core/src/semantic-process-state.ts) and its 19 first-order readers, the [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), the [Activity host accessors](../../packages/semantic-core/src/activity-host-work.ts) and their settled-projection call sites, the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) and [host lowering](../../packages/bpmn-source/src/activity-host-lowering.ts), the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), the [checked pass-through flow](../../packages/semantic-core/src/checked-pass-through-flow.ts), the [scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), the [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts), the [Program routing](../../packages/semantic-core/src/structured-scope-data-routing.ts), [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) and the [workflow continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts).

**Guards the implementation satisfies:** [`lean-fanout`](../../scripts/lean-fanout.test.ts) (no new `import all` opener of a hub, no new importer of `ActivityHostWork` or `NestedScopeDataAdmission`), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts), [`activity-host-coverage-census`](../../scripts/activity-host-coverage-census.test.ts), [`internal-commutation-census`](../../scripts/internal-commutation-census.test.ts), [`runtime-collection-removal-completeness`](../../scripts/runtime-collection-removal-completeness.test.ts), the [frozen compiler baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation-support.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

### Registration

The family registers the register entry, the profile artifact and README, scenarios and pipeline cases, the value-domain matrix, the corpus, About, the CIB probe and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell of `BPMN-MECH-FLOW-01`.

## Cost

Effort budget: 12 hours from 2026-11-07 13:30 CET, for proposal review, representation, widening and closure; at the limit the boundary is recorded and the family continues unless the evidence invalidates the path. Expected stop point at the limit: the representation commit (wait lists and the host rules) landed green on the branch, with admission widening and the Temporal and CIB evidence after it.

## Epistemic closure

- **Established at closure:** the Task split at singleton placements, Lean/core/Temporal agreement on every journey, CIB calibration at the probe's fidelity.
- **Nearest unsupported claims:** splits inside fork regions; host batch laws; the open host laws; conditional Task flows; splits at the variants.
- **Common-mode risk:** the TypeScript and Lean placement analyses and wait-list readers are transcribed from one account; the CIB probe, which runs the split on the engine, is the independent lane for the split itself, not for placement.
- **Nearest realistic counterexample:** a splitting Task after a terminal fork's surviving branch, which `ACSP-SINGLE-01` must refuse.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `c70abb14` | `fork-turns-none` | `approve-with-required-edits` | `d1c55a0f` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The wait records' non-emptiness amendment took its own proposal-stage cold review (2026-11-07): target `e3c819e5`, `fork-turns-none`, `approve-with-required-edits`, green correction audit `ccece8c0`.
