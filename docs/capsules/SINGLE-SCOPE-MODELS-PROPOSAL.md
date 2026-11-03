# Single-scope models proposal

## Status

Lifecycle: draft
Review: pending

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

Selection, 2026-11-03: chosen on reach. Of the pinned CIB engine test resources, 1,718 single-Process models hold no Sub-Process and no Call; 698 of them use only element kinds this profile reads (Start, End, User, Service, plain and Manual Task, None Throw, Parallel and Exclusive Gateways), 95 of those fork. None is admitted as it stands, because the profile requires a source overlay and refuses CIB attributes, but each is now outside the class only by those details, not by its structure. Close call against the Send Task: lower reach and a new kernel arm, against a widening that reuses every approved account unchanged and needs one recorded fan-out raise (owner decision below).

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

- a single-scope model under every other profile, the embedded completion profile's data-bearing route included, which keeps requiring a Sub-Process or a Call;
- a Call in a forking root, a terminal fork or a second None End in the root, and every other exclusion of the accounts above.

These bound admission only. Nothing is reinterpreted: a model admitted today has at least one Sub-Process, and its Program, route and behavior are unchanged.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds the feature `single-scope-models`, and the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Observation, wire contracts and the checked-process schema are unchanged.

In a single-scope model, no frame exists, so a User Task admits only the empty patch (`NSD-TASK-01`), and Process data comes from the Start bindings and Service outputs, which land in the Process (`NSD-WRITE-01`).

## Representation and runtime ownership

No kernel type, IL or runtime change. The lower bound becomes profile-dependent in each analysis that holds it:

- `structureAdmitted` of [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) and `scopeDataStructureAdmitted` of [its TypeScript twin](../../packages/semantic-core/src/nested-scope-data-admission.ts) accept zero Sub-Processes only for a Program or checked graph of this profile;
- the scope-tree check of [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and [its twin](../../packages/semantic-core/src/nested-scope-control-admission.ts), which today refuses a tree with no child and no Call, does the same;
- the routing shapes `nestedScopeProgramShape`, `nestedScopeControlProgramShape` and their checked twins accept one scope under this profile.

Each analysis reads the profile from the Program identity or the checked graph it already receives.

**Route disjointness.** The structured-composition account's completion theorem [`completion_admission_cases`](../../BpmnSemantics/SemanticProcess/StructuredCompositionControlProofs.lean) holds for every Program its analysis accepts. It discharges the nested route through `NestedScopeData.programAdmitted_one_scope`, which this family falsifies: a one-scope Program of this profile can now satisfy both the structured analysis and the nested route, and the dispatcher, keyed by profile, runs the nested completion. The fix states the disjointness at its root: the structured-composition analysis refuses a Program of this profile, whose own accounts own every such Program. In Lean the first guard of `StructuredComposition.programAnalysis` gains `program.identity.semanticProfile != nestedScopeDataProfileId`, a new theorem in `StructuredCompositionAdmissionProofs` states it, and the proof site uses `programAdmitted` refusing a one-scope Program of every other profile. The TypeScript twin [`structured-process-composition-admission.ts`](../../packages/semantic-core/src/structured-process-composition-admission.ts) gains the same guard. No Program that analysis accepts today changes: every Program of this profile has at least two scopes and the analysis requires exactly one.

Rejected alternatives:

- threading a profile hypothesis through `completion_admission_cases`: about twenty structured-composition theorems in six proof files, six of whose callers carry no profile fact;
- proving that the nested completion of a one-scope Program equals the ordinary one: false for the unreachable states the theorem quantifies over, whose frames `declaredNames` reads;
- comparing against a copy of the profile-id literal inside the structured hub: a second copy of a fact.

**Owner decision, 2026-11-03.** `StructuredCompositionAdmission` must name the profile id. `nestedScopeDataProfileId` moves from `EffectMappingValuePolicy` to [`ScopeDataBearing`](../../BpmnSemantics/SemanticProcess/ScopeDataBearing.lean), which already holds `embeddedCompletionProfileId` and the nested route's other profile test and imports only the contract; `EffectMappingValuePolicy` keeps re-exporting it. The new import raises one recorded fan-out bound, `ScopeDataBearing` 561 to its counted 607 importers (`scripts/lean-fanout.ts` simulation on `a37e56ef`), and moves one name of the exposed-definition allowance from `EffectMappingValuePolicy` to `ScopeDataBearing`. The owner approved the raise (four raises of about 8 % were asked; this design needs only one), and it is a [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) bound change.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The source reader is unchanged: it never required a Sub-Process. Every rule of the serial, re-entry, concurrent, Call, pass-through and None Throw accounts applies unchanged to the root as their only body.

Nearest wrong algorithms, each with a separating witness below:

1. dropping the bound for every profile, which admits a single-scope data-bearing model under the embedded completion profile;
2. dropping it at one level only, which admits at one level and refuses at the other;
3. keeping the structured analysis unguarded, which leaves two accounts claiming one Program;
4. dropping the forking-root Call refusal together with the bound.

## Stable rules

| Rule | Statement |
|---|---|
| `SSM-ADMIT-01` | The nested scope-data profile admits a Process with no embedded Sub-Process in every form it admits with one, at the Program and checked levels alike. |
| `SSM-PROFILE-01` | Every other profile, the embedded completion profile's data-bearing route included, refuses a single-scope model it refuses today. |
| `SSM-ROUTE-01` | The structured-composition analysis refuses every Program of the nested scope-data profile, so no Program is claimed by both accounts. |

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
- **Refused edits:** a Call added to the purchase request's root (wrong algorithm 4), a second None End in it, and a terminal fork.
- **Profile control (minimal pair):** a single-scope serial model with a data-mapped Service Task is refused under the embedded completion profile at the source level, and its checked graph and Program are refused by the core and Lean analyses under that profile's identity, while the same model with the Service Task inside a Sub-Process is admitted (wrong algorithms 1 and 2).
- **Route control:** the structured composition profile's retained model, admitted by the structured analysis under its own identity, is refused by it once its identity names this profile, in Lean and TypeScript (wrong algorithm 3).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `SSM-ADMIT-01` | Both models and the Call edit admitted at both levels; the refused edits refused | Source, core, Lean conformance module, pipeline, CIB probe | Restore the bound at one level (wrong algorithm 2) |
| `SSM-PROFILE-01` | The embedded completion minimal pair at both levels | Source, core and Lean | Drop the profile test from the bound (wrong algorithm 1) |
| `SSM-ROUTE-01` | The structured model under both identities | Lean theorem and conformance module, core | Drop the guard from the structured analysis (wrong algorithm 3) |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law. A new executable conformance module, beside the [None Throw conformance module](../../BpmnSemantics/NoneIntermediateThrowConformance.lean) whose admission owners it shares, checks admission of both models at both levels, the refused edits, the profile control and the route control. `SSM-ROUTE-01` is also a theorem of [`StructuredCompositionAdmissionProofs`](../../BpmnSemantics/SemanticProcess/StructuredCompositionAdmissionProofs.lean), which re-establishes `completion_admission_cases` of [`StructuredCompositionControlProofs`](../../BpmnSemantics/SemanticProcess/StructuredCompositionControlProofs.lean); its other proofs are unchanged.

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

Build cost is a constraint. No kernel type changes. Interface edits:

- `ScopeDataBearing` gains `nestedScopeDataProfileId` and `EffectMappingValuePolicy` loses its definition, a move between two hubs, each an interface edit;
- `StructuredCompositionAdmission` gains the import and a body edit of `programAnalysis`; its interface cone is about 650 modules, which this family rebuilds once, in one commit with the move;
- `StructuredCompositionAdmissionProofs` gains one theorem, and `StructuredCompositionControlProofs` changes one proof;
- the one-scope theorems of `NestedScopeDataAdmission`, `NestedScopeControlAdmission`, `ScopeReentryAdmission` and `NestedScopeDataCommand` become profile-qualified, each consumed only by the next in that chain and by the one proof site.

`NestedScopeControlAdmission.lean` stands at 796 of 800 nonblank lines and `nested-scope-control-admission.ts` at 789, so their edits may not grow either file; any growth means an extraction, never an exception.

TypeScript owners: the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts), the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts) and the [structured composition admission](../../packages/semantic-core/src/structured-process-composition-admission.ts).

Guards the implementation must change or satisfy: [`lean-fanout`](../../scripts/lean-fanout.test.ts) with its [bounds](../../scripts/lean-fanout-bounds.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [nested scope-data source admission test](../../packages/bpmn-source/test/nested-scope-data-source-admission.test.ts), whose lower-bound assertion this family replaces, and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Registration: the profile artifact's `features` and its README; the new conformance module in `ConformanceChecksMain`; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) needs no new row.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
