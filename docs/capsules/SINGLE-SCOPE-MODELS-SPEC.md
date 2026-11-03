# Single-scope models specification

## Status

Lifecycle: implemented
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a Process that holds no embedded Sub-Process, so that every serial, re-entry and forking composition it admits around a Sub-Process it also admits in a Process whose only scope is the root, or the root and one called Process, while every other profile, every admitted model and every command and observation keep their meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its mechanism is the profile's lower scope bound: `NSD-ADMIT-01` and its concurrent and re-entry successors require at least one embedded Sub-Process (`scopeDataStructureAdmitted`, `nestedScopeProgramShape`, `nestedScopeControlProgramShape` and their checked twins), which the [root Parallel forks specification](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope) records as the exclusion of "a forking model without an embedded Sub-Process". It serves the clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that this exclusion holds open:

- `PC-HUM-04`, primary: Plain Task pass-through on a branch of a forking model without an embedded Sub-Process, one of its two residual forms. The row stays open on the other, a wait-free branch of a terminal fork in a Sub-Process body.
- `PC-HUM-05`: the same form for the Manual Task. The row stays open on the wait-free terminal branch and on implicit split and merge (`PC-CF-07`).
- `PC-CF-03`: Parallel fork and join composition with human and automated branches in a Process without a Sub-Process. The row stays open on its other clauses.
- `PC-BASIC-01`: the None Intermediate Throw Event in a forking model without an embedded Sub-Process, an exclusion of the [None Throw specification](NONE-INTERMEDIATE-THROW-SPEC.md#required-optional-and-excluded-scope). The row stays open on its other clauses.

Screened out, each with its reason:

- Implicit Activity fan-in and fan-out (`PC-CF-07`) and Link Events (`PC-BASIC-02`): both need a control place with no Sequence Flow behind it, the kernel extension on which the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected.
- The Send Task (`PC-AUTO-04`): 13 of the pinned CIB models hold one; a later family.
- The wait-free terminal branch: co-enables a body End with a sibling entry in one closure, a different mechanism.

Selection, 2026-11-03: chosen on reach. Of the pinned checkout's BPMN files, about 1,700 single-Process models hold no Sub-Process and no Call; 698 of them use only element kinds this profile reads (Start, End, User, Service, plain and Manual Task, None Throw, Parallel and Exclusive Gateways), 95 of those fork. None is admitted as it stands, because the profile requires a source overlay and refuses CIB attributes. Structurally, of the same 698: 50 hold several Ends and 23 an implicit flow, forms this family keeps refusing; of the 95 forking models, 42 are paired-fork candidates, before the source details. Selector (pinned checkout `5a45b47`, 2026-11-03): every `*.bpmn` and `*.bpmn20.xml` file of the whole checkout outside `target/` directories that parses as XML and holds exactly one `process` element whose descendant element local names all lie in {`startEvent`, `endEvent`, `userTask`, `serviceTask`, `task`, `manualTask`, `intermediateThrowEvent`, `parallelGateway`, `exclusiveGateway`, `sequenceFlow`, `conditionExpression`, `incoming`, `outgoing`, `documentation`, `extensionElements`}, which excludes Sub-Processes, Calls, EventDefinitions and CIB extension children; an implicit flow is a Start, Task, None Throw or End with more than one incoming or outgoing `sequenceFlow`; a paired-fork candidate forks, has as many Parallel Gateways with several outgoing flows as with several incoming flows, exactly one End and no implicit flow. Narrower roots give smaller counts (the engine module's test resources alone: 82 forking, 23 candidates, by the design review's own probe). Close call against the Send Task: lower reach and a new kernel arm, against a widening that reuses every approved account unchanged and changes no guard bound.

## Normative basis and CIB classification

BPMN 2.0.2 imposes no Sub-Process on a Process: Clause 10.2 lets a Process hold any Flow Elements, and Clauses 13.2 to 13.5 give each element's behavior independently of whether an enclosing Sub-Process exists. A Process instance is itself the scope whose tokens and data the root holds (Clause 10.4.1, Process-level Properties and Data Objects). The profile's bound was an admission restriction of the [nested scope-data specification](NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope), whose subject was Sub-Process data, never a reading of the standard.

CIB Seven `2.2.0` at the pinned checkout executes the root as the outermost scope (`ProcessDefinitionImpl extends ScopeImpl`, `pvm/process/ProcessDefinitionImpl.java:39`), with or without a nested `subProcess` activity; no behavior of a Gateway, Task or Event this profile admits depends on the presence of one. Classification: no new relationship. Each admitted element keeps the relationship the profile already names for it.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged, plus every model that differs from an admitted class only in holding no embedded Sub-Process:

- a serial root path of User Tasks, mapped Service Tasks, pass-through Tasks and None Throws;
- a re-entry root graph of the [scope re-entry class](SCOPE-REENTRY-SPEC.md#required-optional-and-excluded-scope);
- paired Parallel forks in the root body, in the forms the [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope), [pass-through branch](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#required-optional-and-excluded-scope) and [None Throw](NONE-INTERMEDIATE-THROW-SPEC.md#required-optional-and-excluded-scope) accounts admit there;
- a serial root path with one mapped Call to a called Process, whose two scopes are the root and the called root.

Optional: none.

Excluded, each refused at admission:

- a single-scope model under the embedded completion profile, the only other profile reaching these analyses, on every route, data-bearing or not, which keeps requiring a Sub-Process or a Call; every other profile keeps its own shape rules unchanged;
- a Call in a forking root, a terminal fork or a second None End in the root, and every other exclusion of the accounts above.

These bound admission only. Nothing is reinterpreted: a model admitted today has at least one Sub-Process, and its Program, route and behavior are unchanged.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds the feature `single-scope-models`, and the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Observation, wire contracts and the checked-process schema are unchanged.

In a single-scope model, no frame exists, so a User Task admits only the empty patch (`NSD-TASK-01`), and Process data comes from the Start bindings and Service outputs, which land in the Process (`NSD-WRITE-01`).

## Representation and runtime ownership

No kernel type, IL or runtime change. The lower bound moves out of the profile-less structural checks into the analyses' profile-aware entry points:

- `structureAdmitted` of [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) and `scopeDataStructureAdmitted` of [its TypeScript twin](../../packages/semantic-core/src/nested-scope-data-admission.ts) lose their `children` nonemptiness test, and the scope-tree check of [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and [its twin](../../packages/semantic-core/src/nested-scope-control-admission.ts) loses its "no child and no Call" refusal;
- each entry point that receives a Program or checked graph, `programAnalysis` and `checkedAnalysis` of the serial, re-entry and concurrent accounts, tests instead `scopeCountAdmitted`: the model has a Sub-Process or a Call unless its profile is this one, reading the profile from the Program identity or the checked graph. The control analysis's `checkedModel` and `programModel` test it after reading the bodies, where the one-scope refusal stood inside `analyze`, so kernel-decided fixtures that open only that module reach their structural refusal without unfolding the hidden bound. The serial and re-entry checks required a Sub-Process before, not a Sub-Process or a Call, but no other profile reaches their entry points, since routing is by profile, so the uniform test admits nothing new elsewhere;
- the routing shapes `nestedScopeProgramShape`, `nestedScopeControlProgramShape` and their checked twins, which receive only a scope count, take their minimum from their callers in the [profile-shape module](../../packages/semantic-core/src/semantic-process-profile.ts), which know the profile.

**Route disjointness.** The structured-composition account's completion theorem [`completion_admission_cases`](../../BpmnSemantics/SemanticProcess/StructuredCompositionControlProofs.lean) claims an ordinary, data or Call completion for every Program its analysis accepts, whatever the profile. A one-scope Program of this profile can satisfy both the structured analysis, which tests no profile, and the nested route, and the user-task completion dispatcher, which branches on `nestedScopeDataProgram`, then runs the nested completion, which writes scope frames and is none of the theorem's cases. The theorem therefore states the premise the dispatcher branches on: `completion_admission_cases` and the structured-composition theorems that reach it take `nestedScopeDataProgram program = false`, and each top-level theorem discharges it from the profile premise it already carries with the existing `nestedScopeDataProgram_of_profile_value`, as [`MixedTaskControlFlowDataProofs`](../../BpmnSemantics/SemanticProcess/MixedTaskControlFlowDataProofs.lean) already does. Eleven declarations between it and the first declaration carrying a profile premise take the premise: `completion_admission_cases`, `rejected_completion_preserves_state`, `completion_admission_preserves_control_unit_bound`, `_root_ownership`, `_binding_presence` and `_lifecycle_frame`, `task_execution_preserves_counter_storage`, `task_execution_reachable_preserves_control_unit_bound`, and `task_execution_preserves_root_ownership`, `_binding_presence` and `_lifecycle_frame`. Every other consumer, among them `accepted_completion_internal_sequence_is_bounded`, `accepted_start_internal_sequence_is_bounded`, `StructuredComposition.reached_scheduled_closure_is_bounded` and `reached_state_has_lifecycle_frame`, already carries `semanticProfile = structuredCompositionCheckpointProfileId` and discharges the premise locally, so its public statement stays unchanged. `rejected_completion_preserves_state` (`SPC-COMMAND-01`) carries no profile premise, so it does not cover the doubly admitted Programs of the nested profile, while every structured-composition-profile Program stays covered. Only user-task completion needs the premise: the reachability relation's steps are only start, internal step and completion, every profile-less structured theorem over `admitStimulus` is a completion lemma, every Start theorem carries a profile premise, effect completion has no structured theorem, and the checked level and the TypeScript core dispatch by profile. No import or bound changes, and no Program a profile admits today is affected: [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean) routes this profile to its own accounts before the structured-composition branch.

Rejected alternatives:

- the structured-composition analysis refusing this profile by name, through a private import: no bound changes and a 58-module rebuild cone, but a profile denylist inside an analysis that the structured composition, portable handoff and mixed-task profiles share, which every later profile with its own completion route would extend;
- proving that the nested completion of a one-scope Program equals the ordinary one: false whenever frames exist, since `declaredNames` reads them and `writeAll?` writes them, and the theorem quantifies over every state;
- comparing against a copy of the profile-id literal inside the structured hub: a second copy of a fact.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The source reader is unchanged: it never required a Sub-Process. Every rule of the serial, re-entry, concurrent, Call, pass-through and None Throw accounts applies unchanged to the root as their only body.

Nearest wrong algorithms, each with a separating witness below:

1. dropping the bound for every profile, which admits a single-scope data-bearing model under the embedded completion profile;
2. dropping it at one level only, which admits at one level and refuses at the other;
3. keeping `completion_admission_cases` unqualified, which claims the ordinary completion for a Program the dispatcher completes through the nested route;
4. dropping the forking-root Call refusal together with the bound.

## Stable rules

| Rule | Statement |
|---|---|
| `SSM-ADMIT-01` | The nested scope-data profile admits a Process with no embedded Sub-Process in every form it admits with one, at the Program and checked levels alike. |
| `SSM-PROFILE-01` | Every other profile, the embedded completion profile's data-bearing route included, refuses a single-scope model it refuses today. |
| `SSM-ROUTE-01` | The structured-composition completion theorems claim only Programs that the nested route does not dispatch (`nestedScopeDataProgram program = false`), and every profile that reaches them discharges this from its identity. |

## Newly reachable waits and resumption

None of a new kind. A single-scope model's waits are the User Task, effect and join waits of the accounts above, at the root, and its closures are bounded by their unchanged burst rules.

## Separating witnesses

Each model carries a source overlay and a mapped Service Task.

- **Purchase request** (root fork):
  - Start binds `request`; User Task *Review request* → fork → two branches → join → None Throw *Purchase approved* → User Task *Place order* → End.
  - Branch one: mapped Service Task *Check budget*, input `request`, output `budgetCode` → plain Task *Log budget check*.
  - Branch two: Manual Task *Collect signature* → User Task *Approve purchase*.
  - Two journeys, in both completion orders of *Approve purchase* and the *Check budget* result.
- **Invoice clearing** (re-entry root graph):
  - Start binds `invoice`; Merge *Review round* → User Task *Review invoice* → mapped Service Task *Validate invoice*, input `invoice`, output `verdict` → Choice *Invoice valid?*.
  - On `verdict` = `invalid`, Manual Task *Contact supplier* → the Merge; by default, None Throw *Invoice cleared* → User Task *Pay invoice* → End.
  - Journey one: valid at once. Journey two: invalid, then valid; *Review invoice* and *Validate invoice* get fresh occurrences in the second round.
- **Call without a Sub-Process:** the retained [loan application](../../scenarios/call-variable-mapping/loan-application.bpmn) with its *Review application* Sub-Process replaced by a User Task, admitted at both levels and run to completion in the core; the unedited model stays admitted.
- **Degenerate model:** a Process of one None Start flowing to one None End stays refused by the unchanged overlay rule of `NSD-ADMIT-01`, under which a serial model binds at least one handler, while its twin with one mapped Service Task between them is admitted at both levels.
- **Refused edits:** a mapped Call added to the purchase request's root (wrong algorithm 4), and a terminal fork, the root's only way to a second None End, since a fork that both joins and ends a branch is refused in a body too. Each is refused by the checked-graph rule, while the same Call on a serial root path and the same fork inside a Sub-Process are admitted, so no other rule produces the refusal.
- **Profile control (minimal pairs):** under the embedded completion profile, a single-scope serial model with a data-mapped Service Task, and a data-free single-scope serial model of User Tasks, are each refused at the source level, and their checked graphs and Programs are refused by the core and Lean analyses and the profile-shape checks under that profile's identity, while each model with its Tasks inside a Sub-Process is admitted (wrong algorithms 1 and 2). The data-free pair kills a relaxation of the shared shape and analysis functions keyed on anything but profile identity.
- **Route control:** a one-scope Program of this profile that both the structured analysis and the nested route admit, checked executably in Lean, so the premise of `SSM-ROUTE-01` is necessary and not vacuous (wrong algorithm 3).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `SSM-ADMIT-01` | Both models and the Call edit admitted at both levels; the refused edits refused | Source, core, Lean conformance module, pipeline, CIB probe | Restore the bound at one level (wrong algorithm 2) |
| `SSM-PROFILE-01` | The embedded completion minimal pair at both levels | Source, core and Lean | Drop the profile test from the bound (wrong algorithm 1) |
| `SSM-ROUTE-01` | The doubly admitted one-scope Program | Lean theorems and conformance module | Drop the premise from `completion_admission_cases` (wrong algorithm 3: the proof no longer closes) |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law. A new executable conformance module, [`singleScopeModelsConformanceChecks`](../../BpmnSemantics/SingleScopeModelsConformance.lean#singleScopeModelsConformanceChecks), beside the [None Throw conformance module](../../BpmnSemantics/NoneIntermediateThrowConformance.lean) whose admission owners it shares, checks admission of both models at both levels, the Call-only loan and its retained twin, the refused edits with their admitted twins, the profile control and the route control. `SSM-ROUTE-01` is the premise `completion_admission_cases` of [`StructuredCompositionControlProofs`](../../BpmnSemantics/SemanticProcess/StructuredCompositionControlProofs.lean) gains and its top-level consumers discharge, which re-establishes the structured-composition completion proofs.

## Temporal hosting and refinement preflight

No new hosting mechanism. A single-scope model's ingress, waits, effects, cancellation, lifecycle and publication are those of the admitted accounts at the root. The preserved relation is equality of hosted committed state and publications with the core's. Delivery, ordering, deduplication, retry and replay risks are unchanged; the [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts) already covers the profile. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. The CIB lane extends the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) with both models' journeys, calibrating each activity instance and the absence of a Sub-Process instance.

Then `PC-HUM-04` is evidenced except the wait-free terminal branch, `PC-HUM-05` except that form and implicit split and merge, and `PC-CF-03` and `PC-BASIC-01` for single-scope models of this profile; all four stay open on their other clauses.

Nearest unsupported claims:

- single-scope models under any other profile;
- implicit split and merge, Link Events and the wait-free terminal branch;
- that every actual closure stays within the admitted burst (not proved in Lean, as for the accounts this family reuses).

## Versioning consequences

No wire, schema or Program change, so the [pre-release wire policy](../../contracts/README.md#evolution-policy) has nothing to migrate. No admitted model changes its Program, route or behavior.

### Owners this implementation grows

Build cost is a constraint. No kernel type changes, no new import and no guard bound change; the owner had approved a fan-out raise for a public import, which this design does not use. Interface edits:

- the one-scope theorems of `NestedScopeDataAdmission`, `NestedScopeControlAdmission`, `ScopeReentryAdmission` and `NestedScopeDataCommand`, public declarations that become false (`programRouted_one_scope`, `programAdmitted_one_scope` and the `programAnalysis_one_scope` chain), become profile-qualified or go. These are interface edits of wide-cone owners; a body edit cannot serve because the theorems' statements change. Their interface cones are 486, 479, 435 and 40 modules, and with the proof files below the union is 487 modules, 239 of them in the library (`scripts/lean-fanout.ts` on `4698de15`), including the closed-world `CommandAdmission`, `ProfileShapeCatalog` and `Execution` with their global fixtures, so every interface edit of this family lands in one commit and the fixtures rebuild once;
- the ten declarations named under route disjointness and `rejected_completion_preserves_state` gain the premise, in eight `StructuredComposition*Proofs` files; this repeated edit goes through [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change).

`NestedScopeControlAdmission.lean` stands at 796 of 800 nonblank lines and `nested-scope-control-admission.ts` at 789, so their edits must keep both at or below 800; any growth past it means an extraction, never an exception. Three of the eight proof files, `StructuredCompositionControlProofs`, `ClosureProofs` and `DataProofs`, stand above 800 under owner-approved exceptions whose reason admits no growth of their declarations, so their edits may not grow them.

TypeScript owners: the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts), the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) and the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts).

Guards the implementation must change or satisfy: [`lean-fanout`](../../scripts/lean-fanout.test.ts), whose [bounds](../../scripts/lean-fanout-bounds.ts) stay unchanged, [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [nested scope-data source admission test](../../packages/bpmn-source/test/nested-scope-data-source-admission.test.ts), whose lower-bound assertion this family replaces, and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Owner passages that state the lower bound and are amended at closure: the forking-model exclusion of the [root Parallel forks specification](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope) and its reason, the matching exclusion of the [None Throw specification](NONE-INTERMEDIATE-THROW-SPEC.md#required-optional-and-excluded-scope), the residual forms of the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#evidence-and-acceptance), the two-scope sentence of the profile README, the evidence cells of `PC-HUM-04` and `PC-HUM-05`, and the doc comment of `nestedScopeProgramShape`.

Registration: the profile artifact's `features` and its README; the new conformance module in `ConformanceChecksMain`; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) needs no new row.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4698de15` | `fork-turns-none` | `approve-with-required-edits` | `e19d2537, c204a58d` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `103fa0f8` | `fork-turns-none` | `approve-with-required-edits` | `572de1a7` |
