# Scope host flow lists proposal

## Status

Lifecycle: draft
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a None Start with several unconditioned outgoing Sequence Flows (implicit split) in the Process root and in an ordinary embedded Sub-Process body, and an ordinary embedded Sub-Process with several unconditioned outgoing flows, by lowering exactly those nodes to two new orthogonal operations, a scope host and a scope exit, appended beside the frozen legacy constructors, so that no admitted model's Program, state, command or publication changes?

This is the second family of Kernel IL orthogonalization in [PLAN](../PLAN.md#scheduled-delivery-batches), the scope host. The [Activity host specification](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#question-and-delivery-boundary) left it the host shape of `PC-BASIC-01` and of the Sub-Process forms, whose inputs and outputs live on separate entry and completion operations. The parked [Activity implicit split and merge proposal](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md) (AISM) owns the BPMN account and CIB classification this family reuses for these kinds.

The selected clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-BASIC-01`, its last open clause, multiple outgoing Start flows: accepted for unconditioned flows of the root None Start and of the body None Start of an ordinary embedded Sub-Process that lies outside every fork region (`SCPH-SINGLE-01`). The row stays open on:
  - conditional and default Start flows (7 of the 13 CIB root Start splits), which share the conditional outgoing-flow mechanism of `PC-CF-07` and are bound to that clause;
  - a splitting body Start whose Sub-Process lies inside a fork region;
  - Start splits in called Processes and in Multi-Instance, bounded, monitored and transaction bodies.
- `PC-CF-07`, its split clause at embedded Sub-Processes outside every fork region. The row stays open on the split at Tasks (the wait-record stage), every merge other than at User, Service and Send Tasks, concurrent arrivals, conditional and default outgoing flows, and called and Multi-Instance bodies.

Close calls, 2026-11-07, each with its reason:

- **The merges at Sub-Processes and Calls wait.** Admitted, they reach no CIB test model: the one Sub-Process with two incoming flows (`bpmn/event/error/reviewSalesLead`) is re-entered through an Error boundary, which this profile refuses, and no Call has several flows. The host carries an `inputs` list, so a later merge family adds admission and a Program rule, not a kernel change; a Call merge adds one `ScopeWork` alternative.
- **Hosts stay outside fork regions.** A host enabled beside another internal operation needs a prepared footprint and re-established scope-creation pair and batch laws; the [Activity host](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#internal-commutation) already assigns every host footprint to the stage that admits concurrent arrivals. No CIB test model holds a body Start split at all.
- **Two host operations until the switch, one feature record after it.** An embedded Sub-Process is not an `ActivityWork` alternative: its inputs sit on its entry and its outputs on its completion, so an Activity host carrying both would hold outputs no step of its own produces, or completion would look them up in the Program. The scope host therefore stays a separate entry operation with its exit. The orthogonal features both host kinds will need (loop, typed boundary handlers, per-flow conditions and default) are not added to either constructor. The switch introduces them once, as fields of one shared feature record that `ActivityHost` and `ScopeHost` both carry, so that no feature is baked into two constructors ([capsule item 19](README.md#required-capsule-structure)). This rests on the incremental route, whose re-decision after the Activity host's stop condition awaits owner confirmation in [PLAN](../PLAN.md#exact-resume-point); if the owner reverses it, this family stops before its representation commit.
- **The split needs no wait-record stage.** Every split here is produced by an operation that reads its own places from the Program: initiation, scope entry and scope completion. No runtime record carries a scope's output ([`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) has no such field), unlike the Task split, whose completion reads `output` from the User Task and effect wait records.

**Batch rule.** Both rows are selected together. Every open clause that shares the mechanism, an operation entering or leaving a scope with a flow list, is selected or screened above or under [Excluded](#required-optional-and-excluded-scope).

**Reach**, over the 1,864 deduplicated parsed BPMN files under `engine/src/test/resources` of the pinned CIB Seven checkout:

| Form | Files |
|---|---|
| Root None Start, two or more outgoing flows | 13: 6 with every flow unconditioned, 7 with conditions |
| Body None Start, two or more outgoing flows | 0 |
| Sub-Process, two or more outgoing flows | 2, both unconditioned (`UncontrolledFlowTest`) |

Files are deduplicated by content hash; a Start counts when it has no event definition and two or more flows whose `sourceRef` is the Start, and a flow is conditioned when it holds a `conditionExpression` (re-measured by the proposal review, 2026-11-07). AISM recorded 7 root Start splits under a narrower file filter.

## Normative basis and CIB classification

**BPMN**, from the [reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow):

- Clause 10.5.1 generates "a token … for each outgoing Sequence Flow" of a triggered Start Event; Clause 13.2 restates it for the Process.
- Clause 13.3.1: an Activity with several outgoing flows gives "all of them" a token when it completes, a parallel split.
- Clause 13.3.4: an embedded Sub-Process is instantiated when a token arrives and completes when no token remains inside.

**CIB Seven** at the pinned checkout:

- A body Start is the Sub-Process's initial activity (`BpmnParse#parseStartEvents`, `#selectInitial`; `SubProcessActivityBehavior#execute`); a root Start is entered at process start (`PvmAtomicOperationProcessStart`). A None Start leaves through `FlowNodeActivityBehavior#leave`, that is `BpmnActivityBehavior#performDefaultOutgoingBehavior`.
- A Sub-Process completes through `SubProcessActivityBehavior#complete` → `leave`.
- `BpmnActivityBehavior#performOutgoingBehavior` collects every unconditioned non-default transition and takes them in one `leaveActivityViaTransitions`; `PvmAtomicOperationTransitionDestroyScope` creates one concurrent execution per further transition. No activity instance is created for the split.
- `UncontrolledFlowTest#testSubProcessTwoOutgoingFlowsEndProcess` and `#testSubProcessTwoOutgoingFlowsCorrelateMessage` assert both successors of a splitting Sub-Process.

**Register change:** a new entry `CIB-AGR-0022 — a None Start's start and an embedded Sub-Process's completion take every unconditioned outgoing flow in their one step`. It is a normative agreement bounded to this profile and these placements, names `CIB-AGR-0019` as the pass-through instance, and is added with its verifier coverage. No local branch claims `0022` (checked 2026-11-07).

## Required, optional and excluded scope

**Required**, for the nested scope-data profile only:

- A *splitting Start*: the root None Start, or the None Start of an ordinary embedded Sub-Process body, with two or more unconditioned, non-default outgoing flows.
- A *splitting Sub-Process*: an ordinary embedded Sub-Process with one incoming flow and two or more unconditioned, non-default outgoing flows.
- **Singleton placement** (`SCPH-SINGLE-01`): a splitting body Start's Sub-Process and a splitting Sub-Process lie outside every fork region of their scope and of every ancestor scope. A root Start always qualifies.
- The branches of a split follow the branch rules of a Parallel fork: a paired converging Parallel Gateway, [terminal branches](TERMINAL-FORKS-SPEC.md#admission) and, beside scope-local data, [data-declaring terminal branches](DATA-DECLARING-TERMINAL-BRANCHES-SPEC.md#admission).

**Optional:** none.

**Excluded**, each refused at admission as today:

- a splitting Start or Sub-Process inside a fork region, including a Sub-Process on a branch of a Parallel fork, an implicit split or an Inclusive region;
- several incoming flows at a Sub-Process, Call Activity or None Start (the merges, screened above);
- a Call Activity that splits, and a called Process's Start that splits: a split forks its graph, and the profile refuses a root Call in a forking model (`RPF-ADMIT-01` of [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md)) and admits a body Call only on a serial body;
- several flows at bounded, monitored, Multi-Instance, transaction or Event Sub-Processes, each of which has its own entry constructor or is refused today;
- conditional or default outgoing flows of a Start or Sub-Process, an inclusive split in CIB (seven of the thirteen root Start splits);
- every form under any profile that lacks the arity flags named under [Admission](#admission).

These bound admission only: the host's lists admit the excluded placements and merges, and its output records admit conditions and defaults, without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) gains `CIB-AGR-0022`; the exclusion `implicit-activity-split-merge-outside-pass-through-nodes-and-root-merging-tasks` becomes `implicit-activity-split-merge-outside-pass-through-nodes-root-merging-tasks-and-singleton-sub-process-splits`, and a new exclusion `none-start-splits-inside-fork-regions-or-with-conditional-flows` names the Start forms left out.

Publication adds no kind. A host step publishes its work's legacy kind (`initiate` or `enterScope`) and an exit publishes `completeScope`, so the [publication schema](../../contracts/schemas/semantic-publication.schema.json), the platform's closed copy of the kinds and every read model stay unchanged. A split publishes the producing step once, with one token per outgoing flow: no step and no position for the split, as CIB has none.

## Representation and runtime ownership

### Host operation and exit

[`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean) appends two constructors after `activity`, and [`semantic-process-contract.ts`](../../packages/semantic-core/src/semantic-process-contract.ts) two union members:

```lean
/-- The scope a scope host enters. Its published kind is the legacy operation of the same work. -/
inductive ScopeWork where
  | process                                        -- the root None Start; publishes `initiate`
  | subProcess (childScopeId : DefinitionScopeId)  -- publishes `enterScope`

/-- Entering a scope with its flow lists (SCPH-HOST-01). `entries` are the outgoing places of the entered scope's
None Start. -/
structure ScopeHost where
  id : OperationId
  origin : BpmnElementOrigin
  inputs : List ControlPlaceId
  entries : List ActivityOutput
  work : ScopeWork

/-- An embedded Sub-Process's completion with its outgoing flow list (SCPH-EXIT-01). -/
structure ScopeExit where
  id : OperationId
  origin : BpmnElementOrigin
  scopeId : DefinitionScopeId
  outputs : List ActivityOutput

  -- appended last in `SemanticOperation`
  | scope (host : ScopeHost)
  | scopeExit (exit : ScopeExit)
```

The host's `origin` is the root Start for `process` and the Sub-Process otherwise, so each work publishes exactly the occurrence its legacy operation publishes. `ActivityOutput` is reused for entries and outputs so that the later per-flow facts (a condition, the default mark, the flow origin) are defaulted fields, as on the Activity host.

- **`process` is a work, not a separate Start host,** so `entries` means one thing for every work: the outgoing places of the entered scope's None Start, PLAN's "Start flow lists". Message and Timer Starts become a trigger field of `process` at the shared-trigger stage.
- **Outputs live on the exit, not on the entry host.** Completion already reads its own operation's output, so no Program lookup enters the completion path, and a Sub-Process that splits but whose body Start does not keeps its legacy `enterScope`.

### Host Program rules

`ProgramStructuralValidation` and its TypeScript twin require of a host:

- every list strictly sorted by control-place id, and every named place exists;
- `process`: no inputs and two or more entries;
- `subProcess`: exactly one input and two or more entries, its child scope a Sub-Process scope that no other entry operation enters.

Of an exit they require two or more outputs and a scope that is an ordinary embedded Sub-Process's, completed by no other operation. They refuse every other host or exit, so no host or exit doubles a legacy encoding (`SCPH-HOST-01`). Completion is keyed by scope, so a host's child scope may be completed by a legacy `completeScope` or an exit, and a legacy entry's by either.

### Per-work accessors

The per-work facts are the published kind, the commutation family code (`P` for `process`, `S` for `subProcess` and the exit) and the cardinality class. No legacy projection is defined: the host Program rules require two or more entries or outputs, so a one-element projection would never apply to an admitted host, and the Activity host's route through `settledOperation` and `settledOperations` ([`activity-host-work.ts`](../../packages/semantic-core/src/activity-host-work.ts)) is unavailable. Every consumer that settles operations through it names `Scope` and `ScopeExit` explicitly instead, and the census population includes those call sites. A new leaf module imported by `ProgramStructuralValidation`, `GraphValidation` or `TransitionRecord` would inherit a cone in the hundreds and need a bound above the default, as [`ActivityHostWork`](../../BpmnSemantics/SemanticProcess/ActivityHostWork.lean) did. These few functions therefore sit beside the host types in the kernel contract, whose constructor edit rebuilds the whole kernel cone anyway; `ActivityHostWork` is not reused, because its interface bound is reached and the scope consumers lie outside its cone.

### Kind vocabularies

TypeScript discriminants `Scope` and `ScopeExit` and Lean constructors `scope` and `scopeExit` keep the two operation vocabularies equal for the [consumer census](../../scripts/semantic-operation-consumer-census.test.ts). `PublishedSemanticOperationKind` excludes both, so the [publication validator](../../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts) refuses `"scope"` and `"scopeExit"` in every mode, and every comparison of a publication's kind with a Program operation goes through the accessor's published kind, as for the Activity host.

### Internal commutation

The [family census](../INTERNAL-COMMUTATION-PROPOSAL.md) classifies a `process` host in Process initiation, a `subProcess` host in scope creation and the exit in scope completion. Each gets an explicit `none` arm in `prepareInternalArm?` and the regional preparation, so it is never batched. The census allows this only through a structural admission invariant and an executable counterexample:

- **Invariant, `SCPH-SINGLE-01`.** A root Start fires while initiation is pending and no token exists. A splitting body Start's Sub-Process and a splitting Sub-Process lie outside every fork region, so when the entry is enabled no other token is live outside its incoming place, and the exit fires only on a quiescent body (the premise of `completeScopeState?`) with no token live outside it.
- **Counterexample.** A hand-built Program places a host on a Parallel branch, so host and sibling are enabled together; the scheduler refuses it under `rejectObservableChoice`, not only admission.

### Steps

- **`process`:** as `initiate`, with one root-owned token on every entry, the list mechanics `initiateMessageState?` already has (`MSTART-FLOW-01`).
- **`subProcess`:** as `enterScopeState?` from its input, with one child-owned token on every entry.
- **Exit:** as `completeScopeState?`, with one parent-owned token on every output.
- `OperationStep` gains a `scope` arm and a `scopeExit` arm.

Each split is the one step its legacy operation already is. The state functions go into owners `Transition` already imports ([`DeclaredScopeTransition`](../../BpmnSemantics/SemanticProcess/DeclaredScopeTransition.lean), [`ScopeCompletion`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) and the initiation owner), not a new leaf, because a new leaf imported by `Transition` would inherit a cone above the default bound.

### Lowering

A node lowers to a host or exit exactly when it has the several-flow form; every one-flow node keeps its legacy lowering (`SCPH-ONE-01`):

- a splitting root Start → `scope` with `process`;
- a Sub-Process whose body Start splits → `scope` with `subProcess`;
- a splitting Sub-Process → `scopeExit`, beside its legacy or host entry.

A leaf `ScopeHostLowering.lean` beside [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), and `scope-host-lowering.ts` beside the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), own it. `Lowering` is at its review target, so a cohesive block moves into that leaf before its dispatch is added; the leaf's cone is `Lowering`'s, below the default bound.

### Forward shape

| Planned feature | Its place |
|---|---|
| Hosts inside fork regions | A prepared footprint over `inputs`, `entries` and `outputs` |
| Merges at Sub-Processes and Calls | `inputs` of two or more; a `call` work alternative |
| Conditional and default Start and Sub-Process flows | Defaulted fields of `ActivityOutput` |
| Message and Timer Starts | A trigger field on the `process` work, at the shared-trigger stage |
| Bounded, monitored and Multi-Instance Sub-Processes | Fields of the shared feature record (typed boundary handlers, loop) that `ActivityHost` carries as well, introduced once at the switch |
| Convergence with the Activity host | The shared feature record above; `activity`, `scope` and `scopeExit` stay distinct operations because their flow lists live on different steps |

### Retirement of the dual representation

The next family that adds any feature to None Starts or embedded Sub-Processes is the switch for this host: it lowers every such node onto `scope` and `scopeExit` and deletes their legacy lowering. Until then the [host-coverage census](../../scripts/activity-host-coverage-census.test.ts) holds byte-identical the declarations of `initiate`, `enterScope` and `completeScope`; a behaviour-preserving edit re-baselines only as a reviewed [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) bound change. A family adds a feature to None Starts or embedded Sub-Processes when it would change one of those declarations or lower a further BPMN variant of those nodes onto an unchanged legacy constructor, which the census cannot see; the conditional Start and Sub-Process flows and the scope merges are such families. `enterScope` also serves transaction Sub-Processes and `completeScope` root completion, so a scheduled family that must change either declares itself the switch. PLAN records the binding.

### Runtime-only and synthetic constructs

None at runtime: the host and exit write the legacy state with lists. The admission projections add analysis-local synthetic `fork` vertices after a `start` or Sub-Process vertex with several successors; they are created and dropped inside one analysis call, never published, and named so they cannot collide with an element id.

### Measurements (capsule item 19), 2026-11-07

**Why not lower onto existing operations.** A splitting Start or Sub-Process could lower to its legacy operation into a place that feeds a `duplicate`. That place has no Sequence Flow behind it, the defect the [implicit fan-in review](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) rejected, and `duplicate` publishes an instantaneous occurrence of its origin ([`flow-node-occurrence-lifecycle.ts`](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts)). With the root Start as origin the Start publishes twice; with the body Start as origin a body Start gains an occurrence only when it splits ([`flow-node-occurrence-boundary-starts.ts`](../../packages/semantic-core/src/flow-node-occurrence-boundary-starts.ts) publishes none for it). Each case adds a step, a burst step and a token position CIB does not publish.

**Why not widen the legacy constructors.** Widening `initiate`, `enterScope` and `completeScope` to lists reaches every positional site of them and changes every compiled Program's bytes against the [frozen compiler baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation-support.ts); the [Message Start specification](MESSAGE-START-EVENT-SPEC.md) keeps `initiate` unchanged. The owner direction of 2026-11-05 chose appended orthogonal constructors over in-place reshaping, and the [Activity host](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#question-and-delivery-boundary) records it as the authority for a new constructor where [capsule item 19](README.md#required-capsule-structure) would otherwise add a field.

**Blast radius**, from a spike on a throwaway clone of `401a1164`: both constructors and their structures in the kernel contract, then hand-written arms until each probe built.

| Measure | Result |
|---|---|
| Lean arms by hand, closure of the 24 modules matching most operation constructors | 15 files, +58/−3 lines; all 267 jobs build |
| Wider probe: every module naming the Activity host constructor (110 targets) | 20 files, +74/−12 lines; 602 of 606 jobs build. `SequentialScopeAdmissionValidityProofs`, whose proofs exclude the Activity host by hypothesis, and `ParallelScopeCommandReplay` still need host cases |
| Proof cost | `StructuredCompositionAdmissionProofs` exceeded its heartbeat limit with two more constructors; its nine `cases operation <;> simp_all` sites first close the disallowed constructors with `simp at selected`, which builds within the limit |
| TypeScript exhaustive operation switches broken (both union members added) | 12 files, 14 errors |
| `lean-fanout` on the wider spike | pass: no import changes, no bound reached |
| `source-hygiene` on the wider spike | `FlowNodeOccurrenceLifecycle` reaches 801 nonblank lines with its two arms (799 at `401a1164`); every other file passes |
| Files naming the legacy constructors (Lean production, TypeScript production) | `initiate` 116 and 68, `enterScope` 60 and 64, `completeScope` 162 and 85 |

**Coverage and stop condition.** The two probes' closure holds 571 of the 999 non-experiment modules that depend on `SemanticProcessContract`. Every Lean module with an exhaustive operation match names the Activity host's constructor, so all such modules lie inside the probe; the 428 unmeasured modules can need only proof sites that close operation cases by tactic without naming a constructor, as `ParallelScopeCounterGrowthProofs` did. Two probe modules still need host cases: `SequentialScopeAdmissionValidityProofs`, whose proofs exclude the Activity host by hypothesis, and `ParallelScopeCommandReplay`. The representation commit's Rule 2 declaration extrapolates its limits from the probe (20 Lean files, +74/−12 lines over 571 modules) and stops, writing nothing further, when a repair would need a new `import all` opener, a raised fan-out or heartbeat bound, or a size exception, or when the Lean files touched exceed twice the extrapolated count.

Before their host arms are added, the representation moves cohesive blocks out of the owners at their review target, `FlowNodeOccurrenceLifecycle`, `Lowering` and `NestedScopeControlAdmission`, into existing modules in their import closures, so that no new module enters their cones and no size exception is needed.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) and adds no profile-ID comparison. The Start and `embeddedSubProcess` arms of `checkedNodeArityValid` in Lean [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and its twin in the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) widen under the flags that admit a pass-through split (`mixed && variableMerge`, `PTSM-ADMIT-01`); only the nested scope-data profile holds them.

The checked and Program analyses classify each form as its lowered operation forks:

- **Checked level.** [`CheckedPassThroughFlow`](../../BpmnSemantics/SemanticProcess/CheckedPassThroughFlow.lean) and its twin gain `splittingStart` and `splittingSubProcess`, and `forks` includes both. The shape gate, the region walk and the routing read them.
- **Program level.** The vertex projection in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) and their twins changes its producer result types, because a host or exit contributes two vertices and an exit two or more parent outputs:
  - `operationVertex?` returns a vertex list instead of one vertex: a `process` host gives its `start` vertex followed by a synthetic `fork` vertex over its entries' consumers.
  - `controlParentOutput?` becomes a parent-output list: the one output of a legacy `completeScope`, or the outputs of the child's exit. The Sub-Process vertex is produced by the entry arm, the legacy `enterScope` or a `subProcess` host, never by the exit, because `programBodies` filters completions out (and now filters `scopeExit` with them). With two or more parent outputs that entry arm gives the Sub-Process vertex followed by a synthetic `fork` vertex over them, so a legacy `enterScope` whose child ends in an exit changes its arm as well.
  - `programBodies` builds each child body's synthetic `childStart` vertex from its entry operations; it gains the `subProcess` host, and with two or more entries the synthetic Start is followed by a synthetic `fork` vertex over their consumers, inside the child body, not after the parent's Sub-Process vertex.

  `NestedScopeControlAdmission` is near its review target, so `operationVertex?`, `controlParentOutput?` and their helpers move into an existing module it imports before the arms are added; no new module enters its cone. The [vertex arity rule](../../BpmnSemantics/SemanticProcess/StructuredParallelBodyAdmission.lean) is unchanged: every synthetic fork has one predecessor and two or more successors.
- **Placement (`SCPH-SINGLE-01`).** Both levels refuse a splitting body Start or splitting Sub-Process whose Sub-Process vertex lies between a fork and its join, or on a terminal branch, in its scope or any ancestor scope.
- **Routing.** At Program level every split detector recognises a token split today only by `duplicate` or `selectMany`, so each counts a host with two or more entries and an exit as a split:
  - `StructuredScopeData.splits` in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and its twin in [`structured-scope-data-routing.ts`](../../packages/semantic-core/src/structured-scope-data-routing.ts); it drives `concurrentProgram`, hence `programRouted`, the re-entry refusal `!concurrentProgram` (`SRE-ROUTE-01`), `startBindingsRouted` and `programRouted_serial`, and Temporal host admission's `concurrentStructuredScopeDataProgram`.
  - The root-split half of `programRestrictionsHold` and its twin (`RPF-ADMIT-01`): a `process` host splits in the root, and an exit splits in its Sub-Process's parent scope, so an exit of a root Sub-Process is a root split; a `subProcess` host splits inside its child and is not one.

  The checked level already counts every splitting node through `CheckedPassThroughFlow.forks`. A model with a splitting Start or Sub-Process therefore routes to the concurrent account at both levels, and the profile's refusal of `models-that-both-fork-and-choose` keeps it off the re-entry account.

**Nearest wrong algorithms**, each with a separating witness below:

1. arity widened at one level only;
2. arity widened for every profile;
3. a split that takes the first flow only, or exclusively;
4. a split realized as a separate step or position, or a body Start occurrence published only when it splits;
5. a host admitted inside a fork region, enabled beside a sibling;
6. a Program analysis that skips the host or exit through a wildcard arm;
7. a host or exit published under a kind the schema lacks;
8. a one-flow node lowered onto the host;
9. a splitting host classified as passive by Temporal host admission, so a concurrent effect wait escapes the concurrent analysis;
10. a Program-level split detector that ignores hosts and exits, so a split Program routes as serial, passes the re-entry account or keeps a root Call beside a root split.

## Stable rules

| Rule | Statement |
|---|---|
| `SCPH-ADMIT-01` | Where the arity flags hold, a splitting Start and a splitting Sub-Process are admitted at both levels alike, under `SCPH-SINGLE-01` and the Parallel branch rules. |
| `SCPH-START-01` | A splitting root Start puts one token on every outgoing flow in the one initiation step; a splitting body Start does so in the one entry step of its Sub-Process. Neither adds a step, a position or an occurrence. |
| `SCPH-EXIT-01` | A splitting Sub-Process's completion puts one token on every outgoing flow in its one completion step. |
| `SCPH-SINGLE-01` | A host or exit is admitted only where no other internal operation can be enabled with it, and is never batched. |
| `SCPH-ONE-01` | A node with one incoming and one outgoing flow and one Start flow lowers to its legacy operation, so every admitted model's Program, states and publications stay byte-identical. |
| `SCPH-HOST-01` | A host or exit satisfies the host Program rules, publishes its work's legacy kind and changes state as its legacy operation with lists. Every other host or exit Program is refused. |
| `SCPH-PROFILE-01` | Every profile without the arity flags refuses each form it refuses today. |

## Newly reachable waits and resumption

None of a new shape. A root split reaches the wait sets a root Parallel fork reaches; a body split, those a body Parallel fork reaches; a Sub-Process split, those of a fork after a Sub-Process. Wait records and runtime state are unchanged. Continue-As-New carries the Program, whose encoding gains two members.

## Separating witnesses

**Employee onboarding**, one whole model with a source overlay and a mapped Service Task:

- The root None Start *Hire confirmed* splits into a mapped Service Task *Register hire* and a User Task *Prepare workstation*, which a Parallel join meets.
- Then a Sub-Process *Issue equipment*, whose body Start splits into User Tasks *Issue badge* and *Issue laptop*, joined in the body before the body End.
- *Issue equipment* splits into a User Task *Confirm IT access* → End and a None End *Notify facilities*, a terminal branch shaped like CIB's `testSubProcessTwoOutgoingFlowsEndProcess`.
- Journeys: each completion order of the two forks.

Each split's step publishes once and opens both successors in the same command (wrong algorithms 3 and 4); no body Start occurrence is published.

**Refused edits**, each at both levels:

- *Issue equipment* moved onto a branch of the root split (wrong algorithm 5); its body split alone on a branch;
- a conditioned and a default outgoing flow of the Start and of *Issue equipment*;
- a second incoming flow at *Issue equipment*, at a Call and at the Start;
- a splitting Call Activity; a splitting called-Process Start;
- a root Start split beside a root Call (`RPF-ADMIT-01`) and beside a root Choice (re-entry refusal), each also asserted on the lowered Program alone, apart from the checked level (wrong algorithm 10);
- the model under the embedded completion profile.

**Profile matrix.** Lean checks each widened arity arm over every combination of the flags. TypeScript keys arity on the profile, so only Lean separates wrong algorithm 2, as for merging Tasks.

**Kernel witnesses**, in both languages:

- every existing scenario's Program unchanged (`SCPH-ONE-01`, wrong algorithm 8);
- each journey publishes one internal record per split step under its legacy kind (wrong algorithms 4 and 7);
- a host with one entry, unsorted lists, a `process` host with an input, a `subProcess` host with two inputs, and an exit with one output are each refused;
- a hand-built Program with a host on a Parallel branch fails closed in the scheduler (wrong algorithm 5);
- a host's and exit's footprint is `none`;
- the publication validator refuses `"scope"` and `"scopeExit"`;
- Temporal host admission classifies a host or exit with several entries or outputs as a token split, so the onboarding model with its effect wait is admitted only through the concurrent analysis (wrong algorithm 9).

## Oracles this family changes

- **Capability catalog disclosures.** The several-flow pins of the [capability catalog disclosures](../../scripts/capability-catalog-disclosures.test.ts) are rewritten.
- **Execution publication contract coverage.** [`execution-publication-contract-coverage`](../../scripts/execution-publication-contract-coverage.test.ts) treats `Scope` and `ScopeExit` as discriminant-only, as `Activity`.
- **Start operation artifact consistency.** [`start-operation-artifact-consistency`](../../scripts/start-operation-artifact-consistency.test.ts) binds every Process start to its checked node and gains the `process` host as a Start form.
- **Internal commutation census.** The [family census](../INTERNAL-COMMUTATION-PROPOSAL.md) gains a row for the host by work and one for the exit.
- **Temporal host admission.** [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) classifies by published kind today; a host or exit is classified from its lists instead (below).
- **Scope exclusions**, narrowed and amended at closure: the [Activity host](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#required-optional-and-excluded-scope) exclusion of several flows at Sub-Processes and None Starts, and the [pass-through](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#required-optional-and-excluded-scope) exclusion of Start splits.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `SCPH-ADMIT-01` | The model admitted at both levels; the refused edits per level | Source, core, Lean conformance checks, pipeline | Widen at one level only (1) |
| `SCPH-START-01` | Onboarding journeys; root and body split steps | Core; pipeline across Lean, core and Temporal; CIB probe | First flow only (3), a seeded pipeline mutation; a body Start occurrence (4) |
| `SCPH-EXIT-01` | *Issue equipment*'s completion and terminal branch | Core; pipeline; CIB probe | First output only (3) |
| `SCPH-SINGLE-01` | The branch-placed refusals; the scheduler counterexample | Source, core, Lean conformance checks | Admit inside a fork region (5) |
| `SCPH-ADMIT-01`, routing | The Program-level root Call and Choice refusals; Temporal admission of the onboarding model through the concurrent analysis | Core, Lean conformance checks, protocol tests | Split detectors that ignore hosts (10) |
| `SCPH-ONE-01` | Every existing scenario of every profile | Lean library, `BpmnConformance`, pipeline, differential, frozen compiler baseline | A one-flow node lowered to the host (8) |
| `SCPH-HOST-01` | The refused host Programs, published kinds, `none` footprints, the validator refusal, the token-split classification | Lean conformance checks, core and protocol tests, host-coverage census | A wildcard arm skipping the host (6); publishing `scope` (7); passive classification (9) |
| `SCPH-PROFILE-01` | The flag matrix; the model under the embedded completion profile | Source and Lean conformance checks | Widen for every profile (2) |

## Lean assurance lane

Lane shape: proved, with a declared open boundary.

**Proved.** The host and exit arms of the existing theorems quantified over all operations: evaluator soundness [`fire_sound`](../../BpmnSemantics/SemanticProcess/Transition.lean) (dispatch only), control places, wait declarers, structural validity, cardinalities, and runtime well-formedness preservation of initiation, scope creation and scope completion with entry and output lists.

**Deliberately open, checked instead:** host and exit agreement with their legacy operations on the state they write (the list step on a one-element list equals the legacy step, a law about Programs the host rules refuse, kept as the switch family's obligation), and the `none` footprints. Both would need new `import all` openers of hubs whose hidden-edit bounds have no headroom; the switch family owns them, as for the Activity host. If list-generalized well-formedness preservation needs a new opener, it joins this open boundary rather than raising a bound.

**Conformance checks.** A new module beside [`ActivityHostConformance`](../../BpmnSemantics/ActivityHostConformance.lean) checks admission, placement and lowering agreement, including the onboarding model's concurrent analysis.

No new transition family: initiation, scope entry and completion remain the steps they are.

## Temporal hosting and refinement preflight

No new hosting mechanism: ingress, waits, timers, cancellation and lifecycle are the existing ones, and forks after a Start or Sub-Process completion use the hosting the root and body Parallel forks already use.

[Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) decides whether a Program can split tokens from the published kind of each operation (`canSplitTokens`); a splitting host publishes `initiate` or `enterScope`, which are passive, so classification by published kind would let a concurrent effect wait escape the concurrent analysis. A host or exit is therefore classified as a token split when a list has two or more elements, and as its legacy kind otherwise. The Program carries both members across Continue-As-New ([workflow continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts)), a pre-release replacement under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy). The Start capacity envelope is re-measured, not raised.

The preserved relation stays equality of hosted committed state and publications with the core's. Smallest refinement witness: the hosted pipeline over every journey, plus one forced Continue-As-New while *Issue badge* and *Issue laptop* are both pending after the body split.

## Evidence and acceptance

- Answer-free scenarios with registered pipeline cases, each with a seeded mutation.
- Value-domain matrix rows, corpus rows and the About disclosure.
- A CIB probe on a project-authored model of the onboarding shape, since CIB has no body-Start-split test, that calibrates per journey: one historic activity instance for each Start and Sub-Process and none for a split; both successors active after a split in the same command; the Process ending with its last User Task.

Then `PC-BASIC-01` is accepted for unconditioned flows of root None Starts and of Sub-Process body Starts outside fork regions, and `PC-CF-07` for unconditioned Sub-Process splits outside fork regions; the residuals listed under [Question and delivery boundary](#question-and-delivery-boundary) stay open.

## Versioning consequences

A Program wire change: the `scope` and `scopeExit` members are added to the [semantic process](../../contracts/README.md) schema. Every producer, consumer, fixture and test is replaced atomically under the [pre-release wire policy](../../contracts/README.md#evolution-policy), including the Program JSON codec [`SemanticProcessJson/Program`](../../BpmnSemantics/SemanticProcessJson/Program.lean) and the Continue-As-New Program. Runtime state, wait records and publications are unchanged. No admitted model changes, by `SCPH-ONE-01`.

### Owners this implementation grows

Derived with `node scripts/what-binds.ts`; every owner that growth would push past the review target moves a cohesive block into an existing or family-owned module before the edit. No size exception and no bound change is requested.

- **Lean hubs**, each for its exhaustive arms only: `SemanticProcessContract`, `TransitionRecord`, `OperationControlPlaces`, `ProgramStructuralValidation` and its laws, `RuntimeStateWellFormed`, `ProfileCardinalities`, `Transition`, `FlowNodeOccurrenceLifecycle`, `InternalCommutationCensus`, `InternalCommutationCore`, `InternalOperationOccurrence`, `SemanticProcessJson/Program`, `Scenario`, and `Lowering` for its dispatch.
- **Lean step and admission owners:** `DeclaredScopeTransition`, `ScopeCompletion`, `CheckedProcessAdmission`, `CheckedPassThroughFlow`, `NestedScopeDataAdmission`, and `NestedScopeControlAdmission` for `operationVertex?`, `controlParentOutput?`, `programBodies`, `StructuredScopeData.splits` and `programRestrictionsHold`.
- **TypeScript:** the [Program routing](../../packages/semantic-core/src/structured-scope-data-routing.ts), the [contract](../../packages/semantic-core/src/semantic-process-contract.ts), [runtime](../../packages/semantic-core/src/semantic-process-runtime.ts), [profile shape](../../packages/semantic-core/src/semantic-program-profile-shape.ts), the nested scope-data and scope-control admissions, the [checked pass-through flow](../../packages/semantic-core/src/checked-pass-through-flow.ts), the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), the commutation census and [footprint](../../packages/semantic-core/src/internal-transition-footprint.ts), the publication owners, the [semantic process schema](../../contracts/schemas/semantic-process.schema.json), [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) and the [publication validator](../../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts).

**Guards the implementation satisfies:** [`lean-fanout`](../../scripts/lean-fanout.test.ts) (no new `import all` opener of a hub, no new importer of `ActivityHostWork` or `NestedScopeDataAdmission`), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts), [`activity-host-coverage-census`](../../scripts/activity-host-coverage-census.test.ts) (extended below), [`internal-commutation-census`](../../scripts/internal-commutation-census.test.ts), [`contract-schema-coverage`](../../scripts/contract-schema-coverage.test.ts), [`start-operation-artifact-consistency`](../../scripts/start-operation-artifact-consistency.test.ts), the [frozen compiler baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation-support.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

### Host-coverage census, extended

[`activity-host-coverage-census`](../../scripts/activity-host-coverage-census.test.ts) gains the scope populations: every production Lean `def` naming `.initiate` or `.enterScope` with a wildcard arm must name `.scope`, and every one naming `.completeScope` with a wildcard arm must name `.scopeExit`; the token-split population: every production `def` matching `.duplicate` or `.selectMany` with a wildcard arm must name `.scope` and `.scopeExit` or carry an allowlisted reason (33 Lean and 28 TypeScript production files match `duplicate`, 2026-11-07); the multiplicity-keyed sites (`operationVertex?`, `controlParentOutput?`, `programBodies`, `StructuredScopeData.splits`, `programRestrictionsHold`, `prepareInternalArm?`, `semanticOperationInternalFamily`, host admission's classification and their twins); the TypeScript call sites of `settledOperation` and `settledOperations`; the TypeScript functions naming those kinds; and the frozen declarations above. The allowlist names declarations, never files.

### Registration

The family registers the register entry, the profile artifact and README, scenarios and pipeline cases, the value-domain matrix, the corpus, About, the CIB probe and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell of `BPMN-MECH-FLOW-01`.

## Cost

Two commits, each under its own [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) declaration reviewed before any edit: the representation, both constructors with no admission change and every existing scenario unchanged; then the widening, admission, lowering, placement, host admission, witnesses and registration. Budget 12 hours from 2026-11-07 05:00 CET; the Activity host family took 7 h 47 min with one constructor. At the limit, work stops at the first commit's green stop point and PLAN records the boundary.

## Epistemic closure

- **Established at closure, if green:** the three split forms at singleton placements, Lean/core/Temporal agreement on every journey, CIB calibration at the probe's fidelity.
- **Nearest unsupported claims:** splits inside fork regions; host batch laws; the two open host laws; conditional Start flows; merges at scopes.
- **Common-mode risk:** the TypeScript and Lean placement analyses are transcribed from one account, so a wrong fork-region definition passes both; the CIB probe, which runs a body split on the engine, is the independent lane for the split itself, not for placement.
- **Nearest realistic counterexample:** a Sub-Process after a terminal fork's surviving branch, which `SCPH-SINGLE-01` must refuse.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `cec35ffb` | `fork-turns-none` | `approve-with-required-edits` | `a925a8c9` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
