# Concurrent scope data specification

## Status

Lifecycle: implemented
Review: closure-approved

## Question and delivery boundary

Can scope-local data live in concurrently live Sub-Process occurrences, including two live occurrences of one definition, so that every read, write, input and output resolves through the occurrence that performs it and never through another occurrence of the same definition?

This is a family of batch 2 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its shared mechanism is per-occurrence scope data resolved along the live occurrence chain. Under the owner direction of 2026-10-27, the family takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that shares it:

- `PC-DATA-04`, primary: concurrent embedded owners, present-null shadowing and sibling isolation in concurrent occurrences;
- `PC-SCOPE-02`: distinct data lifetimes for two live occurrences of one embedded definition;
- `PC-SCOPE-01`: data in nested scopes whose bodies hold concurrent branches and mixed User and Service Tasks.

No row closes in this family. The remaining clauses belong to rows or mechanisms that this family does not share:

- **Re-entry.** `PC-DATA-04` and `PC-SCOPE-02` need repeated lifetimes through re-entry, which needs Sequence Flow cycles across scopes (`PC-CF-06`).
- **Multi-Instance owners.** `PC-DATA-04`'s Multi-Instance owners stay held at Multi-Instance qualification.
- **Concurrent mapped Calls.** These stay in `PC-DATA-04`. Two Calls of one definition in one closure are refused by `CALLN-ONCE-01` and owned by `PC-MI-03`. A mapped Call on a Parallel branch needs prepared mapped invoke and return, which is a second mechanism. Calls are therefore excluded from data-bearing models here.
- **Gateways.** `PC-SCOPE-01` needs its selected gateways with typed conditions (`PC-CF-02` to `PC-CF-04`).
- **Multi-Instance body data.** `PC-MI-10` resolves body data through the same frames, but it cannot close before `PC-MI-01` to `PC-MI-07`.
- **Mapping evaluation.** `PC-DATA-05` and `PC-DATA-06` own expression and multi-source mapping evaluation.

The [nested scope-data account](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md) is serial. It walks the definition chain and refuses whenever one definition has more than one live frame (`resolveOwner?` in [NestedScopeData](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean)). Its frames are already keyed by occurrence, and every scope occurrence already carries its parent occurrence. The [concurrent scope Service Tasks account](CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md) supplies concurrency, [merge regions](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md) supply concurrent same-definition occurrences, and that account also supplies concurrent effect hosting. All three are data-free today.

## Normative basis and CIB classification

**BPMN.** BPMN 2.0.2 Clause 10.3.5 makes each embedded Sub-Process instance a contextual scope. Clause 10.4.1 ties a Property's or Data Object's lifetime and visibility to its parent instance and that instance's descendants. Two instances of one Sub-Process each own their data. BPMN references data by element identity, so the name-based resolution stays the CIB extension recorded as [`CIB-EXT-0020`](../CIB-BPMN-RELATION-REGISTER.md).

**CIB Seven.** The pinned checkout is `v2.2.0-27-g5a45b47`. The five engine files cited here are byte-identical to the `v2.2.0` tag. CIB realizes scope data per execution:
- Every token entering a scope activity gets its own scope execution (`PvmAtomicOperationCreateScope`, `execution.createExecution()`, engine `impl/pvm/runtime/operation`, lines 38–53), and each `ExecutionEntity` owns its variable store.
- `AbstractVariableScope.setVariable` (lines 331–345) updates the nearest execution holding the name, walking `getParentVariableScope()`. That is `getParent()`, with no concurrency special case (`PvmExecutionImpl`, lines 1697–1699).
- `getVariable` resolves nearest-first (lines 190–198), and a present null hides a parent binding.
- Input mappings run on the new scope execution against its parent. Output mappings run in `ExecutionEntity.destroy` before the locals are removed (lines 518–572).
- Concurrent executions are non-scope children, so a non-local write from a concurrent branch reaches the frames the scope execution would. Those are the frames this account's occurrence chain consults.

**Evidence and classification.** That two live executions of one Sub-Process definition each get their own store is inferred from these code paths. The nearest engine tests cover Multi-Instance and two different definitions. The family therefore runs the claim-assessment model below on the CIB oracle as calibration. Four register entries change, each with these citations and that calibration:

- **`CIB-EXT-0020`.** Its boundary widens from serial nesting to concurrent and same-definition occurrences. Its value clause gains this profile's bounded String domain. Its User Task clause, which writes a completion patch into the nearest declaring frame, applies over the occurrence chain.
- **`CIB-EXT-0015`.** Its embedded-completion-profile clause, which today admits only data-free overlay-bound Service Tasks, widens to Service Task input and output mappings in data-bearing Programs.
- **`CIB-EXT-0006`** (Start installs initial Process variables) and **`CIB-EXT-0005`** (User Task completion installs submitted variables) apply to this profile's data-bearing Programs. The `NSD-TASK-01` restriction stays the profile admission restriction recorded there: a patch name outside the declaring frames is refused instead of being created at the root.

`CIB-EXT-0021` is unchanged, because no mapped Call is admitted here.

The profile artifact stays byte-identical. Its `relationships` list keeps its pinned content, as it already does for `CIB-EXT-0015` and `CIB-EXT-0021` under this profile. The new relationship references live in the scenarios' provenance and in the profile README paragraph below.

## Required, optional and excluded scope

Required: everything the concurrent scope profile admits today, including the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope), merge regions and data-free Service Tasks. In addition:

- `camunda:inputParameter` and `camunda:outputParameter` declarations on ordinary embedded Sub-Processes, including merge targets, within the [nested scope-data bounds](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope): at most eight of each per Sub-Process. Inputs are String literals or exact `${name}` references, and outputs are exact `${name}` references to a local of the same Sub-Process.
- input and output mappings on Service Tasks under the existing effect contract, with exact `${name}` sources;
- User Task completion patches restricted as in `NSD-TASK-01`, over the occurrence chain below;
- Start bindings under the `DATA` profile's Start rule for a model without a Call: every required name present, and any admitted name allowed.

A model is **data-bearing** when it has a declaration or a mapped Service Task.

Optional: declarations at several depths, one name declared at several levels, local null shadowing, and any mix of declared and undeclared scopes.

Excluded:
- any Call Activity in a data-bearing model;
- re-entry of a Sub-Process through a cycle (`PC-CF-06`);
- structured values and the `SingletonBusinessItem` domain in this profile;
- expressions beyond exact `${name}`, gateway conditions, interruption, Errors, Multi-Instance, Message and Timer events;
- BPMN `property` and `dataObject` declarations;
- every exclusion of the current profile.

These restrictions narrow admission only. Cycles and Calls later broaden the class without reinterpreting an admitted model, because the occurrence chain already gives a re-entered or called occurrence its own frames. Structured concurrent data is a scope choice for a later increment, in the `DATA` profile or a new one; it needs a concurrent capacity account for values of up to 16 KiB, which this family does not attempt.

## Profile and public contract

The `SCOPE` family profile `cibseven-2.2.0-embedded-subprocess-completion-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). It already owns the concurrency, the merge regions and the concurrent effect hosting this family needs. The `DATA` profile would have to admit all of that, and it would also need a concurrent capacity account for `SingletonBusinessItem` values of up to 16 KiB. The `DATA` profile keeps its serial admission and its structured domain.

For data-bearing Programs only, the value domain changes from empty to bounded String or present null. This applies to Start bindings, User Task completion patches, effect arguments and results, and scope locals.
- **New policy arm.** A new `boundedString` arm of [`EffectMappingValuePolicy`](../../BpmnSemantics/SemanticProcess/EffectMappingValuePolicy.lean) and its TypeScript counterpart admits `.string s` with at most 1,024 UTF-8 bytes (the existing root-String bound of `PBV-EFF-01`) and `.null` as a present value.
- **Selected by Program, not profile.** Today both value-domain accounts are keyed by profile alone: `profileValueDomain` and `profileAllowsVariableBindings` in [semantic-profile-value-domain.ts](../../packages/semantic-core/src/semantic-profile-value-domain.ts), and `effectMappingValuePolicy`. Each gains the data-bearing predicate that also gates `nestedScopeDataProgram`.
- **Data-free Programs unchanged.** A data-free Program of this profile keeps empty surface domains and the `scalar` policy, so the [cross-target domain matrix](../../packages/differential/test/scenario-value-domain-expectations.ts) keeps this profile's data-free row unchanged. The matrix gains a separate data-bearing row for the claim-assessment scenario.

No wire shape changes. Programs gain the existing optional `scopeLocalData` table, which [Program admission](../../packages/semantic-core/src/semantic-process-admission.ts) today rejects outside the `DATA` profile. [Operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), at 722 of 800 lines, today limits effect mappings to the `DATA`, serial, Multi-Instance and mixed-task checkpoint profiles. Both widen to this profile, for data-bearing Programs only. The profile artifact stays byte-identical. The [profile README](../../profiles/cibseven-2.2.0-embedded-subprocess-completion-draft/README.md) gains a paragraph that supersedes its data exclusions and discloses the capacity limit below, and the new scenarios cite `CIB-EXT-0020`.

## Representation and runtime ownership

**Occurrence-chain resolution.** In [NestedScopeData](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean) and its [TypeScript counterpart](../../packages/semantic-core/src/nested-scope-data.ts), `read?`, `readOutcome?`, `write?` and `writeAll?` take the performing occurrence instead of a definition.
- They walk `state.scopeOccurrences` parent links to the instance root, and they select each consulted frame by exact owner through `selectScopeVariables?`.
- `resolveOwner?`'s refusal on several live frames of one definition disappears, because no frame is selected by definition.
- Callers pass the occurrence they already resolved: the effect arming reader passes the arming token's owner, and Call input and output pass the caller occurrence.
- Entry passes the parent occurrence that receives the new child, and completion passes the completing occurrence. `occurrenceWithParent?`, which requires a unique live occurrence per definition, gives way to them.

**Gate.** `nestedScopeDataProgram` becomes true for the `DATA` profile, and for this profile exactly when the Program is data-bearing. A data-free Program of this profile takes the current path definitionally. Every resolution site takes its value policy from the profile instead of the fixed `singletonBusinessItem`.

**Merge-target occurrences.** A merge target's `enterScope` and `completeScope` do not pass through `enterDeclaredScope?` and `completeDeclaredScope?`. `applyInternalOperationOccurrence?` ([InternalOperationOccurrence](../../BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean)) sends them to `enterConcurrentScopeState?` ([ScopeOccurrenceEntry](../../BpmnSemantics/SemanticProcess/ScopeOccurrenceEntry.lean)) and `completeScopeOccurrenceState?` ([ScopeCompletion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean)), as `internal-operation-occurrence.ts` does in TypeScript. Both gain the same declared hooks as the definition-addressed path:
- **Entry** initializes the new occurrence's frame from its parent occurrence's chain, as `NSD-INIT-01` does.
- **Completion** writes the outputs and disposes the frame, as `NSD-OUTPUT-01` and `NSD-RETIRE-01` do.

**Prepared entry.** Two entries of ordinary declaring Sub-Processes become co-enabled when a Parallel fork leads straight into them. [`internalScopeCreationRetentionUnchanged`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean) excludes declared scopes from prepared scope creation. An unprepared candidate beside another offer makes the frontier `.ambiguous` ([InternalScheduledClosure](../../BpmnSemantics/SemanticProcess/InternalScheduledClosure.lean)), so such a fork would roll back as `ambiguousInternalChoice`. Declared entry therefore becomes a prepared scope creation. Its patch carries the evaluated frame. Its footprint reads:
- `scopeVariableScope` of each frame consulted on the parent chain;
- `scopeParent` of each chain link;
- `processVariable` of each name that resolves to the Process.

It writes `scopeVariableScope` of the new frame. Two sibling entries read the same parents and write different new frames, so they form an independent batch.

**Representation of the prepared entry.** The existing scope-creation contract states that the patch "updates only its selected counter and preserves unrelated fields", and the proved lanes of the [scope-creation preparation prerequisite](../INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite) rest on it. A frame-carrying arm of `InternalScopeCreationKind` would reopen every one of them. The declared entry is therefore a separate prepared constructor: the unchanged `InternalScopeCreationSelection` plus the evaluated frame. Its application is the existing `apply` followed by one frame insertion that changes only `variables.scopes`. Every existing law over `apply` stays as it is. The composed patch re-establishes, at the same proved strength:
- refinement to `enterDeclaredScope?`;
- aggregate `runtimeStateWellFormed` preservation, from `apply`'s preservation and the frame insertion's variables-only frame;
- complete footprint frames for declared/declared, declared/undeclared and declared/arming pairs;
- literal-state commutation of two declared entries, and of a declared entry with an arming and with local control, from distinct-owner frame insertion commutation;
- membership in finite batch induction, under one explicit premise: a batch that contains a declared entry contains only scope creations (declared or undeclared), ordinary armings, local-control members and, by the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#representation-and-runtime-ownership)'s proved pair law, merge inputs;
- unchanged publication, because frames are not published and the publication stays numbering-free.

The batch induction ([InternalTransitionBatch](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean)) also pairs scope creation with other families: message task, bounded scope, timer task, regional, ordinary End and merge input. Their pair modules (`InternalRegionalScopeCreationCommutation`, `InternalEndScopeCreationCommutation`, `InternalMergeScopeCreationCommutation`, `InternalBoundedScopeCreationPair`, and the message-task and timer-task transition pairs) are not re-established for the declared constructor. Its batch case instead takes the premise above as a hypothesis.

For admitted Programs of this profile, the singleton argument below establishes that premise:
- the profile admits no Message, Timer or bounded-scope family;
- regional completion and End are never co-enabled with an entry; the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#representation-and-runtime-ownership) restates this for the wait-free joined branches it admits, whose merge inputs its pair law covers. The [terminal forks account](TERMINAL-FORKS-SPEC.md#representation-and-runtime-ownership) admits wait-free terminal branches only in definitions that declare no scope-local data (`TFK-DATA-01`), so an End it makes co-enabled never meets an entry.

That establishment is not proved. Both languages encode the premise in prepared independence: Lean's `PreparedInternalTransition.Independent` and the core's `preparedInternalTransitionsAreIndependent` make a declared entry dependent on every companion outside declared entries, scope creations, armings, local control and merge inputs. The production frontier rule therefore never batches a declared entry with such a companion, and a [core test](../../packages/bpmn-source/test/concurrent-scope-data-runtime.test.ts) locks that refusal for every other family. Admitting Message, Timer, interruption or wait-free terminal paths beside data reopens it, together with the singleton argument; the [terminal forks account](TERMINAL-FORKS-SPEC.md#representation-and-runtime-ownership) admits wait-free terminal paths only without data.

The [commutation proposal](../INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite)'s scope-creation section names the declared constructor.

**Completion and merge-target entry stay unprepared singletons.** A command ends exactly one wait, so a closure starts from one token, and co-enabled offers arise only after a fork. Admission guarantees that each such offer is a task arming, a Sub-Process entry, fork or join local control or, under the nested scope-data profile, a pass-through Task's merge input:
- every structured body holds at least one task (`parallelBodyScans` in [`parallel-body-burst-analysis.ts`](../../packages/semantic-core/src/parallel-body-burst-analysis.ts));
- every fork branch starts with work, except that `PTPB-WORK-01` lets a branch whose closure scan meets a pass-through Task reach its fork's paired join without waiting, never an End (`branchesStartWithWork` in [nested scope-control branch work](../../packages/semantic-core/src/nested-scope-branch-work.ts)); in a definition that declares no scope-local data, `TFK-ADMIT-01` also lets a terminal branch reach its End without waiting (`branchesReachWorkOrEnd`);
- merge targets are serial bodies holding at least one task, and merge branches are non-empty runs of User or Service Tasks ([merge-region admission](../../packages/semantic-core/src/merge-region-admission.ts)).

So no wait-free path reaches an End below a fork, a joined fork's join fires only when its last branch arrives, and a body's End follows every join that encloses it; a scope therefore becomes quiescent only through the single token of the command that ended its last wait, and its completion is the only offer of that frontier. The [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#representation-and-runtime-ownership) owns this restatement for wait-free joined branches. A merge-target entry follows its own branch's task-completing command, so it is a singleton too. Singletons execute unprepared (`selectInternalExecutionFrontier`, `[offer] => .execute`), and the regional completion selection stays unchanged. The argument reopens when gateway conditions, wait-free terminal paths, Multi-Instance or cycles are admitted. The [terminal forks account](TERMINAL-FORKS-SPEC.md#representation-and-runtime-ownership) reopened it for wait-free terminal paths without data and re-established it: every body arms a task on entry and every token of a closure descends from the one that started it, so a body still empties only along a single path and its completion stays a singleton, while a wait-free End co-enabled with sibling work commits through the End pair laws it names. The [Inclusive regions account](INCLUSIVE-GATEWAY-REGIONS-SPEC.md#admission) reopened it for gateway conditions in root Inclusive regions and re-established it: under the strict cut every selected branch arms work before any join or End, and the join fires only when its last selected branch arrives, so a body still empties only along a single path; that the selected-set reading equals Table 13.3 on every admitted region stays argued, not proved.

**Arming reads.** For a data-bearing Program, nested input arming in `scopedEffectInputReads?` ([InternalCommutationCore](../../BpmnSemantics/SemanticProcess/InternalCommutationCore.lean)) reads the same precise atoms as entry instead of claiming `.activityPopulation`. The TypeScript [transition footprint](../../packages/semantic-core/src/internal-transition-footprint.ts) changes the same way.

The reason is a proof obligation, not a schedule difference. Outside regions, the population read conflicts only with writes of `.activityOccurrence` or `.activityPopulation`, which no prepared family of this profile makes, so neither retained model separates the two claims at runtime. But `prepared_arm_process_input_frames` needs the population claim to be absent. Occurrence-chain resolution reads `scopeOccurrences`, and a declared entry writes a frame, so the read set must name what the evaluation consults.

A new frame law discharges `prepared_arm_read_frame`'s existing `effectInputsFrame` premise for nested arming: nested input evaluation is unchanged when the consulted frames, chain links and Process names are unchanged.

**Counters.** Per-element activation counters stay shared by design, as in the concurrent activations account. Per-occurrence counters stay out of scope.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). [Nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts) and their Lean counterparts gain the data declarations above. They also gain one availability rule, `CSD-AVAILABLE-01`:

- **Available reads.** A `${name}` read is available when either holds:
  - an enclosing input of the reader's occurrence chain declares the name;
  - a definite write lands at an owner on the reader's chain on every path from that owner's Start to the reader.
- **Definite writes.** A Service output and a Sub-Process output are definite writes; a User Task patch is not.
- **Joins and merges.** After a Parallel join, the definite writes are the union of the branches' sets. The same union holds at the quiescent completion of a body whose fork branches end at separate Ends, because completion requires every branch. After the converging Exclusive merge of a merge region, they are the intersection.
- **Sibling branches.** A write in one fork branch is never available inside another branch, or inside a merge target reached from another branch.
- **Everything else.** Every other read becomes a required Start binding, and Start without one is `rejected`.

The nearest wrong algorithms are:
- resolving by definition, which picks the first live frame of the definition, perhaps a sibling's;
- refusing two live frames, which is today's behaviour;
- counting a write in one branch as available in a sibling branch.

## Capacity

This family claims no static capacity envelope for the profile, and it does not change capacity enforcement. The profile admits no Start capacity envelope today, only the 256-byte hosting-identity bound, which stays. Hosted budgets are enforced at runtime, at two points:
- **Before commit: committed state, publication batch and publication continuation.** The [commit preflight](../../packages/temporal-adapter/workflow/src/workflow-semantic-candidate.ts) measures every successor and the publication continuation a Continue-As-New directly after it would carry, a measurement the [concurrent structured scope data account](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#capacity) added for every hosted profile. If the state or batch exceeds its budget, or the commit pushes the continuation over its budget, the Workflow does not commit it and retains a typed capacity failure.
- **After commit: effect requests and History.** The frontier scheduler runs the effect request byte preflight and the [ordinary-effect History reservation](../../packages/temporal-adapter/workflow/src/ordinary-effect-history-reservation.ts), which sums the actual request bytes, after the commit that armed the effects (`ordinary-effect-frontier-scheduler.ts`). If either is exceeded, `failCapacity` fails the Workflow as a nonretryable typed host failure. The process then stops with committed effect waits that are never issued.

A business process of this profile can therefore stop with a typed capacity failure when its data grows, in either of those two ways. This is a step back from the `DATA` profile, which refuses an over-budget Start before Workflow creation. The profile README and About disclose the limit.

It satisfies the rows' acceptance because those rows require business behaviour and its evidence, not a capacity envelope. [PROJECT-DESIGN](../PROJECT-DESIGN.md) makes no capacity claim before the production baseline. The refusal is typed and fail-closed through existing mechanisms, so it is neither silent nor a workaround. A Program-level envelope for concurrent data needs a computed control-state bound per budget, which this family does not attempt.

Three owners change with this account:
- the [concurrent scope Service Tasks preflight](CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#temporal-hosting-and-refinement-preflight): its exact-32 fresh-Run fit and "request bytes are fixed" hold only for data-free Programs;
- the [lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md)'s ordinary-effect paragraph: it names the post-commit refusal for data-bearing frontiers;
- the [nested scope-data question](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#question-and-delivery-boundary): its "concurrent-wait Start capacity account" premise for `PC-SCOPE-01` is replaced by this disclosed runtime limit.

The retained models are measured with a 1,024-byte String in every data slot, either of control characters, whose canonical encoding is about six bytes per byte, or of ASCII. Every copy is counted, including effect arguments held both in the wait and in its Activity scope. Measured on 2026-10-31, the facility inspection fits every budget with control characters and the claim assessment fits with ASCII. With control characters in every slot, the claim's two armed *Fetch rates* hold about fifteen escaped copies, so its committed state reaches about 94 KB against the 64 KiB budget, and the Workflow refuses that successor before commit with a typed capacity failure: the disclosed limit, witnessed. The measurement is a [Workflow component test](../../packages/temporal-adapter/workflow/test/concurrent-scope-data-capacity.test.ts), not a claim about other Programs.

## Stable rules

- `CSD-ADMIT-01`: admission accepts exactly the required and optional scope above. It rejects every exclusion, every parser warning and every String literal input over 1,024 UTF-8 bytes.
- `CSD-VALUE-01`: every value at every surface of this profile is a String of at most 1,024 UTF-8 bytes or a present null. Anything else is refused atomically at the surface that introduces it.
- `CSD-CHAIN-01`: the chain of an occurrence is that occurrence followed by its live parent occurrences, up to its instance root. `NSD-READ-01`, `NSD-WRITE-01`, `NSD-INIT-01`, `NSD-OUTPUT-01`, `NSD-RETIRE-01`, `NSD-TASK-01` and `CVM-RESOLVE-01` hold with this chain in place of the definition chain. The two chains name the same frames whenever all three premises hold:
  - every definition on the chain has exactly one live occurrence;
  - each occurrence's parent occurrence belongs to its definition's `parentScopeId`;
  - every frame's owner is a live occurrence of the same instance. This is the core's `nestedScopeFrameOwnershipMismatch` check, whose Lean preservation stays open in the nested scope-data account.
- `CSD-ISOLATE-01`: a read, write, input or output never consults or changes a frame that is not on the performing occurrence's chain. Two live occurrences of one definition never share a frame or a local.
- `CSD-INIT-01`: each entering occurrence, ordinary or merge-target, evaluates its inputs against its own parent occurrence's chain before its frame exists.
- `CSD-RETIRE-01`: each completing occurrence, ordinary or merge-target, writes its outputs through its parent occurrence's chain and disposes exactly its own frame.
- `CSD-AVAILABLE-01`: as stated under admission.
- `CSD-PREPARE-01`: declared entry of an ordinary Sub-Process is a prepared scope creation whose patch equals the declared entry evaluator's result and whose footprint carries the atoms above. Declared completion and merge-target entry stay singletons for the structural reason stated under representation. On every registered schedule, no closure reaches `ambiguousInternalChoice`.
- `CSD-REFUSE-01`: every refusal leaves the predecessor state, frames, tasks and effects unchanged. Start without a required binding, an out-of-domain value and a wrong patch are `rejected`. No automatic step can fail semantically after an accepted command.

Observation adds nothing beyond the existing `openEffects` arguments and Process `variables`. [SDATA-OBSERVE-02](SCOPED-DATA-SPEC.md#sdata-observe-02) remains the projection boundary.

## Separating witnesses

Two whole models with business purposes and one measurement model carry the witnesses. Each mechanism is witnessed in both models, so one fixture defect cannot hide a rule.

- **Claim damage assessment.** The root body holds one *Handle claim* Sub-Process. Its body holds the merge region, because root-body merge regions are excluded:
  - *Inspect vehicle* and *Inspect property* run on two fork branches and merge into *Price damage*, which therefore runs twice concurrently.
  - *Price damage* declares `estimate = "pending"` and `adjuster = ${noAdjuster}`. The Start binds `noAdjuster` to null and `adjuster` to `"desk"`, and a root *Review claim* User Task after *Handle claim* maps nothing.
  - The *Price damage* body is the serial chain *Assess damage* (User Task) then *Fetch rates* (Service Task). *Assess damage* writes `estimate`. *Fetch rates* maps `${estimate}` and `${adjuster}`.
  - The Sub-Process outputs `estimate` to `lastEstimate`, which no enclosing scope declares, so the output lands at the Process.
  - In the retained journey, the first occurrence completes *Assess damage* with the empty patch, and the second completes it with `estimate = "4200"`.
- **Facility inspection.** An outer *Inspection* Sub-Process declares `findings = "open"` and `result = "none"`. Its body forks straight into two declaring Sub-Processes:
  - *Electrical check* declares `result = "pending-electrical"`, a literal that shadows the outer `result`.
  - *Fire safety check* declares `result = ${result}`, which reads the outer `result` through its own parent chain.
  - Each holds a *Record findings* User Task that may write the outer `findings` and its own `result`. Each outputs its `result` to `electricalResult` or `fireResult`, which no enclosing scope declares.
  - After the join, *Summarize*, a Service Task, maps `${findings}`, `${electricalResult}` and `${fireResult}`.
  - In the retained journey, the fire-safety *Record findings* omits `result`, so its initial value reaches `fireResult` and the *Summarize* argument.
- **Capacity measurement.** The two models above, with every data slot filled with the escape-heavy value.

| Rule | Witness | Lane placement | Seeded mutation it must catch |
|---|---|---|---|
| `CSD-CHAIN-01`, `CSD-ISOLATE-01` | The second *Price damage* occurrence completes *Assess damage* with `estimate = "4200"`. The first occurrence keeps `"pending"`. Its *Fetch rates* effect, armed earlier, shows `"pending"`, and the second occurrence's *Fetch rates* shows `"4200"`. | Compiled Lean and the cross-target matrix; core; pipeline; CIB calibration | Resolve by definition; flatten both occurrences into one frame; refuse two live frames. |
| `NSD-READ-01` over the chain | Both *Fetch rates* effects show `adjuster = null` although the Process `adjuster` is `"desk"`. | Compiled Lean; core; pipeline | Read the Process before the frames. |
| `CSD-INIT-01`, ordinary entry | The fork enters both checks in one closure. *Fire safety check*'s `result` initializes to the outer `"none"`, not to *Electrical check*'s `"pending-electrical"`, and *Summarize* shows `fireResult = "none"`. | Compiled Lean; core; pipeline | Evaluate the later-executed entry against the earlier sibling's frame. The batch runs in canonical operation order, and *Fire safety check*'s entry operation sorts after *Electrical check*'s. |
| `CSD-INIT-01`, merge-target entry | The two *Price damage* entries follow two separate inspection commands. Each frame holds `"pending"` and the null, read from the same *Handle claim* chain. | Compiled Lean; core; pipeline | Skip the declared hook on occurrence-addressed entry. |
| `CSD-RETIRE-01` | Both *Price damage* occurrences output `estimate` to `lastEstimate`, in both completion orders. The Process holds the later completer's value by explicit command order, and each frame is gone after its completion. | Compiled Lean; core; pipeline | Skip outputs or disposal on occurrence-addressed completion. |
| `CSD-PREPARE-01` | The facility fork commits both prepared entries as one independent batch, without `ambiguousInternalChoice`. The core test compares each prepared patch with the singleton entry at that fork, and `prepareInternalDeclaredEntry_refines` proves the refinement in Lean. | Core; compiled Lean; pipeline | Keep declared scopes out of the prepared path. |
| Arming read set | The nested arming footprint names every consulted frame, chain link and Process name, and no `.activityPopulation`. | The internal commutation census; the Lean frame law | Keep the population claim on nested arming. |
| `NSD-WRITE-01` over the chain, `CSD-ISOLATE-01` | Each *Record findings* writes the outer `findings`, its nearest declaring owner, and its own `result`. The sibling's `result` is never visible. *Summarize* shows the last-written `findings`. | Compiled Lean; core; pipeline | Write to the innermost frame; write to the Process. |
| `CSD-AVAILABLE-01` | *Summarize* reads both check outputs after the join without Start bindings. A model variant in which *Fire safety check* reads `${electricalResult}` makes it a required Start binding. | Source; TypeScript; a Lean law over the analysis predicate | Count a sibling branch's write as available; intersect at a Parallel join. |
| `CSD-VALUE-01`, `CSD-REFUSE-01` | A patch value of exactly 1,024 bytes commits. A 1,025-byte value and a Boolean are `rejected` with the state unchanged. | Compiled Lean and the value-domain matrix; core | Commit a partial patch; admit an unbounded String. |
| `CSD-CHAIN-01` bridge | Under its three premises, occurrence-chain resolution equals definition-chain resolution. | A Lean law | Change resolution for single-occurrence chains. |
| Preservation | Every registered `DATA` and data-free `SCOPE` scenario keeps its retained expectations. | Core; pipeline | Route a data-free Program through the nested-data arms. |
| Capacity | The facility inspection fits every budget with escape-heavy values in every slot, and the claim assessment with ASCII values; the escape-heavy claim is refused before commit with a typed committed-state capacity failure. | Workflow component test | Count one copy of each effect argument; measure ASCII values. |
| `CSD-ADMIT-01` | Each exclusion is refused, including a Call Activity beside one scope declaration, against the same data-free caller as an admitted control. The availability analysis refuses a cycle. The retained models compile. | Source; compiled Lean admission check; the availability analysis unit test | Admit a Call beside data. |

## Lean assurance lane

Lane shape: proved

Evidence: the occurrence-chain mechanism and its prepared entry are proved. Admission, availability and value bounds are checked, and capacity is a TypeScript component measurement. The guaranteeing declarations are [`resolveOwner?_frame_nearest`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean#resolveOwner?_frame_nearest), [`write?_frame`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean#write?_frame), [`initializeFrame?_reads_parent_chain`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean#initializeFrame?_reads_parent_chain), [`completeScopeState?_retires_frame`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean#completeScopeState?_retires_frame), [`applyInternalOperationOccurrence_mergeTarget_sound`](../../BpmnSemantics/SemanticProcess/MergeTargetOccurrenceLaws.lean#applyInternalOperationOccurrence_mergeTarget_sound), [`prepareInternalDeclaredEntry_refines`](../../BpmnSemantics/SemanticProcess/InternalDeclaredEntryLaws.lean#prepareInternalDeclaredEntry_refines), [`prepared_declared_entry_pair`](../../BpmnSemantics/SemanticProcess/InternalDeclaredEntryCommutation.lean#prepared_declared_entry_pair) and [`read?_kept`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean#read?_kept). The proved laws generalize [NestedScopeDataLaws](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean) and the preparation laws:

- **Nearest owner.** Resolution selects the first frame on the occurrence chain that declares the name, otherwise the Process. This restates `resolveOwner?_frame_nearest`.
- **Exact write and off-chain isolation.** A write changes exactly the resolved frame or binding (`write?_frame`, `write?_process`). A new law adds that every frame whose owner is not on the writer's chain is unchanged.
- **Initialization and retirement on both paths.** The `initializeFrame?_reads_parent_chain` and `completeScopeState?_retires_frame` laws carry over to `enterConcurrentScopeState?` and `completeScopeOccurrenceState?` with their declared hooks. The [merge-target occurrence laws](../../BpmnSemantics/SemanticProcess/MergeTargetOccurrenceLaws.lean) gain the frame facts.
- **Bridge.** Under the three premises of `CSD-CHAIN-01`, occurrence-chain resolution equals definition-chain resolution, stated against the restated definition-chain reference `definitionResolveOwner?` by `occurrenceChain_bridge`, private to [its module](../../BpmnSemantics/SemanticProcess/NestedScopeChainBridge.lean).
- **Prepared entry.** The composed declared-entry patch re-establishes the laws listed under representation: refinement, aggregate validity, footprint frames, commutation, batch membership and unchanged publication. Each one composes the existing `apply` law with a variables-only law for the frame insertion.
- **Frame read law.** Nested input evaluation and entry input evaluation are unchanged when the consulted frames, chain links and Process names are unchanged. It discharges the `effectInputsFrame` premise of `prepared_arm_read_frame` and the corresponding premise of the scope-creation read frames.

Open, and recorded as such: there is no quantified law that an admitted Program never reaches `ambiguousInternalChoice`, and none that admitted Programs satisfy the declared entry's batch premise. The structural argument under representation and the independence refusal support it, every registered schedule agrees across Lean, the core and Temporal, and the laws above make each executed patch sound.

## Temporal hosting and refinement preflight

The family adds no hosting mechanism:
- **Ingress.** Durable ingress stays the existing Start, User Task Update and effect Activity result.
- **Effects.** Effect Activities with argument snapshots run through the existing [ordinary-effect frontier scheduler](../../packages/temporal-adapter/workflow/src/ordinary-effect-frontier-scheduler.ts), which passes each effect's argument snapshot to its Activity.
- **State.** Frames are committed state carried through Continue-As-New.
- **None of these.** There are no timers, Message waits, Calls, cancellation or interruption.

Capacity enforcement is unchanged; the capacity section above states it and its disclosed limit.

The preserved relation is the [concurrent scope Service Tasks relation](CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#temporal-hosting-and-refinement-preflight), extended with every frame (owner and bindings), every effect argument snapshot and the Process bindings.

Risks and their deciders:
- **Ordering.** Concurrent writes to one name commit in command order, an explicit input that the pipeline realizes in both orders.
- **Replay.** Frames and snapshots are deterministic functions of committed state.
- **Deduplication.** As today.

Under the once-per-mechanism rule, no new hosted refinement witness is needed. The two models' pipeline cases run once at family closure.

## Evidence and acceptance

The two models carry answer-free scenarios with registered pipeline cases, seeded mutations, value-domain matrix rows, corpus rows and the About disclosure. The claim-assessment scenario also runs on the CIB oracle as calibration of `CIB-EXT-0020`'s widened boundary.

Acceptance: Lean, core and pipeline agree on every scenario of this profile and of the `DATA` profile, and the hosted pipeline passes once at family closure. Then the following clauses are evidenced, and each row's remaining clauses are recorded in the checklist:
- the concurrent embedded-owner clauses of `PC-DATA-04`;
- the clause of `PC-SCOPE-02` that two live same-definition occurrences never share mutable locals;
- the `PC-DATA-04` prerequisite of `PC-SCOPE-01`, for its nested scopes with concurrent mixed activities.

Closure gates, 2026-10-31:
- **Green at `14cbc55a`:**
  - the full Lean library;
  - the Lean checks;
  - the complete pipeline, with all 140 registered cases agreeing across Lean, the core and Temporal. Its 110-second warm run is within the 182-second budget but over the 70-second soft feedback target;
  - composition parity;
  - Lean/core publication agreement on every registered schedule.
- **Green at `afbbaae6`:** the runtime stage, including the CIB oracle and the [calibration probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentScopeDataProbeTest.java), and the serial Temporal stage.
- **Temporal stage:** it failed only on the recorded [TD-001](../TEMPORAL-DEFECTS-LEDGER.md#td-001-query-loss-during-run-eviction) recurrence; the failing file alone passes.
- **Corrected during closure:** the pipeline stage first exposed that Lean published nothing for merge-target records, a defect in the [concurrent embedded activations](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md) replay. `14cbc55a` corrected it.

## Common-mode risks

- **Chain walk.** Both languages could share a wrong chain walk, for example one that stops early at a merge target's parent. The two-level claim model separates it, and the CIB calibration adds an independent oracle.
- **Availability.** The availability analysis is written in both languages from this text. The deliberately unavailable variant read makes a shared error disagree with the pipeline.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy). The profile identity, the Program and checked shapes and the schemas stay unchanged. Admission accepts the existing `scopeLocalData` table and effect mappings under one more profile, the value policy gains one arm, and the footprint of nested arming changes. No legacy reader or migration is added.

The decisive binding guards are:
- **Commutation and IL:** the [internal commutation census](../../scripts/internal-commutation-census.test.ts) and the [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts).
- **Hosting:** [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts).
- **Values:** the [cross-target domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts).
- **Registration:** the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts) and the [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) for `CIB-EXT-0020`.
- **Structure:** [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts) and [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grew

- **Resolution:** [NestedScopeData](../../BpmnSemantics/SemanticProcess/NestedScopeData.lean) and its [laws](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean), the TypeScript [nested scope data](../../packages/semantic-core/src/nested-scope-data.ts), and [CallVariableMapping](../../BpmnSemantics/SemanticProcess/CallVariableMapping.lean) for its changed caller argument.
- **Occurrence-addressed scopes:**
  - in Lean, [InternalOperationOccurrence](../../BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean), which is near its target, [ScopeOccurrenceEntry](../../BpmnSemantics/SemanticProcess/ScopeOccurrenceEntry.lean), [ScopeCompletion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) and the [merge-target occurrence laws](../../BpmnSemantics/SemanticProcess/MergeTargetOccurrenceLaws.lean);
  - in TypeScript, [internal-operation-occurrence.ts](../../packages/semantic-core/src/internal-operation-occurrence.ts) and [semantic-process-scope-runtime.ts](../../packages/semantic-core/src/semantic-process-scope-runtime.ts).
- **Preparation and footprints:**
  - in Lean, the [scope-creation selection](../../BpmnSemantics/SemanticProcess/InternalScopeCreationSelection.lean) and [InternalCommutationCore](../../BpmnSemantics/SemanticProcess/InternalCommutationCore.lean);
  - in Lean, for the composed declared-entry laws and the explicit batch premise, [runtime validity](../../BpmnSemantics/SemanticProcess/InternalScopeCreationRuntimeValidity.lean), [footprint frames](../../BpmnSemantics/SemanticProcess/InternalScopeCreationFootprintFrames.lean), [commutation](../../BpmnSemantics/SemanticProcess/InternalScopeCreationCommutation.lean), [arming commutation](../../BpmnSemantics/SemanticProcess/InternalScopeCreationArmingCommutation.lean), [local-control commutation](../../BpmnSemantics/SemanticProcess/InternalScopeCreationLocalControlCommutation.lean) and the [transition batch](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean);
  - in TypeScript, the [transition footprint](../../packages/semantic-core/src/internal-transition-footprint.ts), which is near its target, the [scope-creation preparation](../../packages/semantic-core/src/internal-transition-scope-creation-preparation.ts) and [patch](../../packages/semantic-core/src/internal-transition-scope-creation-patch.ts), and the [transition batch](../../packages/semantic-core/src/internal-transition-batch.ts);
  - the [commutation proposal](../INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite)'s scope-creation section.
- **Admission:**
  - [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) and [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts);
  - [Program admission](../../packages/semantic-core/src/semantic-process-admission.ts) and [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), which is near its target;
  - their Lean counterparts.
- **Values:** the Lean [effect mapping value policy](../../BpmnSemantics/SemanticProcess/EffectMappingValuePolicy.lean) and its [TypeScript counterpart](../../packages/semantic-core/src/effect-mapping-value-policy.ts), the [surface value domains](../../packages/semantic-core/src/semantic-profile-value-domain.ts) and the Lean value domains.
- **Source:** [compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts) and the Sub-Process mapping source.
- **Continuation:** [workflow continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts), whose incoming continuation and restoration must accept this profile's frames.
- **Capacity owners amended:** the concurrent scope Service Tasks preflight, the lifecycle specification and the nested scope-data question, as stated under capacity.
- **Registration:** the [relation register](../CIB-BPMN-RELATION-REGISTER.md) entries `CIB-EXT-0020`, `CIB-EXT-0015`, `CIB-EXT-0005` and `CIB-EXT-0006`, the profile README, scenarios, pipeline cases, the value-domain matrix, the corpus, About, and the capacity component test beside the [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `8fd67bb1` | `fork-turns-none` | `approve-with-required-edits` | `fda4a8a4, 01f536a9` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `22a9e88a` | `fork-turns-none` | `approve-with-required-edits` | `484f358d` |

The first proposal review of `0359b168` rejected an earlier account that included concurrent mapped Calls and a static capacity envelope and lacked the merge-target data path. The redesign `8fd67bb1` took a new cold review with seven required findings. The same reviewer's first correction audit of `fda4a8a4` closed five of them. Its second audit, of `01f536a9`, closed the batch-premise and bridge-premise gaps and approved. Proposal packet digest: `0c6df762783fa7bcbc426b70ebcd1050a125d732a75e77e96ef87c52c773f8f7`. Proposal approval selected this account only.

The closure review of `22a9e88a` approved with two required corrections; closure packet digest: `dd09afe741bf809ce288dac5b69571c2682ffb9ef36f489b6c0c6e732a370135`. The first correction put the core's declared-entry batch premise on the production frontier path. The second recorded why two fan-out entries wait for the hub fix. The same reviewer's audit of `484f358d` closed both and approved.
