# Activity host switch proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can every plain User, Service and Send Task of every profile lower onto the existing [Activity host](ACTIVITY-HOST-FLOW-LISTS-SPEC.md), with the legacy lowering of those Tasks deleted and every admitted model's observations unchanged, and can the nested scope-data profile then admit a plain Task without outgoing flows as a host with an empty output list?

This is the fourth family of Kernel IL orthogonalization in [PLAN](../PLAN.md#scheduled-delivery-batches), the switch that the [retirement rule](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#retirement-of-the-dual-representation) schedules after the [split account](ACTIVITY-HOST-SPLIT-SPEC.md). Its first stage is behaviour-preserving and carries no clause; its second stage carries the clause.

The selected clause of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-CF-07`, an Activity without outgoing flows at User, Service and Send Tasks (`ASW-END-01`): completion consumes the Task's token and places none, and the owning scope completes at quiescence. The row stays open on every other Activity kind, conditional and default outgoing flows, Tasks that both merge and split, concurrent arrivals, splits inside fork regions, and called and Multi-Instance bodies.

Close calls, 2026-11-08, each with its measured reason:

- **The implicit end is the clause.** In the 2,340 deduplicated BPMN models of the pinned CIB engine sources, 160 hold a User Task and 43 a Service Task without outgoing flows; every other open `PC-CF-07` form at these Tasks is rarer (plain splits 9, merges 24, conditional or default Task flows 1). The empty output list is a host feature the retirement rule assigns to the switch.
- **The switch covers the plain Tasks; each variant joins with its host field.** The retirement rule asks the switch to lower every User, Service and Send Task onto the host. The variants (data input or output, bounded, monitored, Multi-Instance, a Service Task with a BPMN Error route) have no host field yet, so lowering them now would drop their feature or add each field without a clause. They keep their frozen legacy constructors until the family that adds their field, which the amended rule below names as a switch stage. The strongest objection: a variant and its plain twin keep different encodings for longer. The best alternative, the whole reshape at once, is PLAN's full switch with data mapping, loop and boundary fields, unmeasured and larger by every census. Evidence that a variant's field is cheap to add with the plain switch would reverse it.
- **The switch is uniform across profiles.** Lowering reads no profile today ([source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean)); switching the nested scope-data profile alone would add a profile-ID switch to lowering, the smell Kernel IL removes. Every other profile reads a one-input, one-output host through its legacy view instead (`ASW-VIEW-01`).
- **The legacy plain constructors stay valid Program operations.** Lowering stops emitting them, and the host-coverage census forbids any new producer. Refusing them would rewrite every hand-built Lean and TypeScript fixture Program for no observable change; their retirement is the last switch stage, once no variant needs them.

## Normative basis and CIB classification

- **BPMN 2.0.2 clause 10.5.3 (End Event).** If the End Event is not used, every Flow Object without an outgoing Sequence Flow marks the end of a path; a token entering it is consumed when its processing completes, "as if the token had then gone on to reach an End Event", and the Process completes when all its tokens are consumed. The same clause requires an End Event when a Start Event is used; each Process level decides that independently.
- **CIB Seven 2.2.0.** `BpmnActivityBehavior#performOutgoingBehavior` (lines 81-130 of the pinned [engine source](../SOURCES.md)) ends the execution when an Activity has no outgoing transition (`execution.end(true)`), whether or not the level holds a Start or End Event; the scope completes when its last execution ends, as at a None End.
- **Classification.** A new register entry classifies CIB's acceptance of a path-ending Task beside a Start Event as a **CIB extension** beyond clause 10.5.3's End Event requirement, whose token behaviour agrees with the clause's implicit end. The profile admits it as that extension. The switch itself changes no BPMN meaning.

## Required, optional and excluded scope

**Required, stage 1 (the switch), every profile:**

- A *plain Task*: a User Task without data-input, data-output, boundary or Multi-Instance variants (with or without User Task metadata), or a Service or Send Task without a BPMN Error route. Every plain Task lowers to `activity`, whatever its flow counts; its legacy lowering is deleted in Lean and TypeScript.
- Every profile admits exactly the models it admits today, with the same Program up to the host encoding of plain Tasks, the same states and the same observations.

**Required, stage 2 (the clause), the nested scope-data profile only:**

- A plain Task with one incoming and no outgoing flow, in the Process root or an ordinary embedded Sub-Process body, admitted exactly where the same Task followed by its own None End is admitted (`ASW-END-01`).

**Optional:** none.

**Excluded**, refused as today:

- the variants above, at any flow count;
- a Task without outgoing flows that merges, a Receive, Script or Business Rule Task, a catch Event or a Sub-Process or Call without outgoing flows;
- a Task without outgoing flows in a called Process or a Multi-Instance, bounded, monitored or transaction body;
- conditional or default outgoing flows of a Task;
- every stage-2 form under any profile other than the nested scope-data profile.

## Profile and public contract

No published wire schema changes. The Program schema already carries the host; its `outputs` gains `minItems: 0` for stage 2. Every admitted model publishes the same kinds, because a host publishes its work's legacy kind ([Activity host](ACTIVITY-HOST-FLOW-LISTS-SPEC.md#kind-vocabularies)). The nested scope-data profile README and the profile artifact name the new register entry.

## Representation and runtime ownership

### Lowering (stage 1)

[`ActivityHostLowering`](../../BpmnSemantics/SemanticProcess/ActivityHostLowering.lean) and [`activity-host-lowering.ts`](../../packages/bpmn-source/src/activity-host-lowering.ts) lower every plain Task; the dispatch conditions in `Lowering` and the source lowering drop their flow-count test, and the legacy branches for plain Tasks are deleted. `Lowering`'s `lowering_preserves_user_task_resumption_cut` is restated for the host, whose resumption-cut accessor already agrees.

### Host Program rules (stage 1)

`ProgramStructuralValidation` and its TypeScript twin add a third host form beside the merging and splitting hosts: a *plain host*, exactly one input and exactly one output. `ACSP-HOST-01`'s refusal of that form, which kept a host from doubling a legacy encoding, is reversed: the plain host is the encoding, and the legacy constructors are the double that lowering no longer emits.

### The legacy view (stage 1)

`NestedScopeData.settledOperation` and its TypeScript twin already give a host's legacy operation for its first input and output. A new total function `legacyView` maps a plain host to that operation and leaves every other operation alone. Every profile other than the nested scope-data profile runs its Program analyses and capability checks on `legacyView` of the Program, at one entry point per level: `programProfileCapabilitiesValid` in [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean) and its twin in [`semantic-process-profile.ts`](../../packages/semantic-core/src/semantic-process-profile.ts), and the profile-gated arms of structural validation. A merging or splitting host is outside the view, so those profiles still refuse it. The nested scope-data profile already reads hosts through its accessors and adds the plain form there.

### Steps (stage 1)

No step changes. A host arrives through `awaitUserTaskOutputsState?` and `awaitEffectOutputsState?`, which agree with the legacy arrivals on a one-element list by the `rfl` laws of [`WaitActivation`](../../BpmnSemantics/SemanticProcess/WaitActivation.lean); completion and publication already treat a host as its work. The bridge the frozen profiles need is one law per wait kind: a step on a plain host equals the step on its legacy view (`ASW-VIEW-01`), so every theorem a frozen profile proves over the legacy view carries to the hosted Program.

### Wait records (stage 2)

The User Task and effect wait records drop `outputs_ne_nil` ([split account](ACTIVITY-HOST-SPLIT-SPEC.md#wait-records)); the eight Lean proof modules that consume it take non-emptiness from their profile's invariants instead, since no profile but the nested scope-data profile admits an empty list. The TypeScript continuation validator accepts an empty `outputs`. Completion of a wait with an empty list removes the wait and places no token; the scope then completes by `TFK-QUIESCE-01`.

### Admission (stage 2)

The Task arm of `checkedNodeArityValid` admits zero outgoing flows under the flags that admit a terminal branch (`TFK-ADMIT-01`), which only the nested scope-data profile holds. The checked and Program vertex projections give a Task without outgoing flows its task vertex followed by a synthetic finish vertex, as `childStart` stands for an elided Start, so the serial, concurrent and re-entry analyses place it exactly as the Task with its own None End (`ASW-END-01`). No profile-ID comparison is added.

**Nearest wrong algorithms**, each with a separating witness:

1. a plain Task still lowered to its legacy constructor in one language only;
2. a frozen profile that refuses its plain host, or admits a merging or splitting host through the view;
3. a plain host step that differs from its legacy step in a wait field, a publication or an occurrence;
4. a Task without outgoing flows that completes its scope at once, while a sibling token, wait or child remains;
5. a Task without outgoing flows that publishes an End occurrence CIB does not have;
6. an empty output list admitted under a frozen profile, or in a called or Multi-Instance body;
7. a consumer of the old non-emptiness field that now reads past an empty list.

## Stable rules

| Rule | Statement |
|---|---|
| `ASW-LOWER-01` | Every plain Task lowers to one Activity host over its incoming and outgoing places, in Lean and TypeScript alike, under every profile. |
| `ASW-VIEW-01` | A profile other than the nested scope-data profile admits a Program exactly when it admits the Program's legacy view, and a step on a plain host equals the step on its legacy operation. |
| `ASW-OBS-01` | Every model admitted before the switch is admitted after it with identical states and observations. |
| `ASW-END-01` | Under the nested scope-data profile, a plain Task with one incoming and no outgoing flow is admitted exactly where the same Task followed by its own None End is, and its completion consumes its token and places none, adding no step, position or occurrence. |
| `ASW-PROFILE-01` | Every other profile refuses a Task without outgoing flows as it does today. |

## Newly reachable waits and resumption

None in stage 1. In stage 2 a wait whose completion places no token: the scope's quiescence check runs in the same step, as after a None End.

## Separating witnesses

- every existing scenario of every profile, unchanged results, and every existing pipeline case (`ASW-OBS-01`, wrong algorithms 1 and 3);
- per frozen profile, a hosted Program admitted through its view and a merging host refused (wrong algorithm 2);
- the Lean bridge law per wait kind and a TypeScript step comparison over every registered Program's plain hosts (wrong algorithm 3);
- two retained whole models with a credible purpose, added under the model-corpus guard: a single-Task request intake (Start, User Task, no End) and a parallel order review whose two branches end at a User Task and a Service Task without Ends; each against its explicit-End twin, equal except the End occurrences (`ASW-END-01`, wrong algorithm 5);
- the parallel review completing one branch while the other waits, the Process still running (wrong algorithm 4);
- the same models under the embedded completion profile, refused, and a called-body edit refused (wrong algorithm 6);
- the eight non-emptiness consumers rebuilt over profile invariants (wrong algorithm 7).

## Oracles this family changes

The frozen compiler baseline and every lowered-Program fixture record hosts for plain Tasks; their expected observations do not change. The TypeScript spike changed 432 of 2,381 `bpmn-source` test outcomes, almost all of them lowered-shape and profile-admission assertions (below).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `ASW-LOWER-01` | Every plain Task lowered to a host | Source, Lean lowering checks, census | A legacy branch kept in one language (1) |
| `ASW-VIEW-01` | Hosted Programs per frozen profile; the merging host refused; the bridge laws | Lean, core, profile tests | Apply the view to every host (2) |
| `ASW-OBS-01` | Every existing scenario and pipeline case | Lean library, `BpmnConformance`, pipeline, differential, Temporal | A host step diverging (3) |
| `ASW-END-01` | The two models and their twins; the partial completion | Source, core, Lean checks, pipeline, CIB probe | Complete the scope at the Task (4); publish an End (5) |
| `ASW-PROFILE-01` | The embedded completion pair; the called-body edit | Source and Lean checks | Admit for every profile (6) |

## Lean assurance lane

Lane shape: proved

Evidence: the bridge laws start from the singleton agreement laws `activateUserTaskOutputs_singleton` and `activateEffectOutputs_singleton` in [`WaitActivation`](../../BpmnSemantics/SemanticProcess/WaitActivation.lean), which state that a list-taking arrival on `[output]` is the legacy arrival, and from evaluator soundness [`fire_sound`](../../BpmnSemantics/SemanticProcess/Transition.lean#fire_sound), whose `activity` arm is the declared `OperationStep`.

Proved: the bridge laws of `ASW-VIEW-01` and the rebuilt non-emptiness consumers. Checked: admission, lowering and the stage-2 models by finite conformance checks. Deliberately open: `ASW-OBS-01` beyond the registered scenarios, which the lanes witness rather than prove.

## Temporal hosting and refinement preflight

No new hosting mechanism. Stage 1 changes only the Program each Workflow carries, which Continue-As-New already carries whole; host admission already classifies a one-output host as its work's wait. Stage 2's completion that places no token is the None End's consumption inside one Workflow task. The hosted witness is the parallel review.

## Evidence and acceptance

Answer-free scenarios with registered pipeline cases and seeded mutations, value-domain rows, corpus rows, About, the register entry, and a CIB probe on the two models calibrated per journey. Then `PC-CF-07` is accepted for a User, Service or Send Task without outgoing flows in the root and ordinary embedded bodies of the nested scope-data profile.

## Versioning consequences

A Program-shape change under the [pre-release wire policy](../../contracts/README.md#evolution-policy): plain Tasks appear as hosts, with every producer, consumer, fixture and test replaced atomically. Publications and runtime states do not change in stage 1. In stage 2 the wait records lose a proof field only.

### Owners this implementation grows

Derived with `node scripts/what-binds.ts` on 2026-11-08. `Lowering` is at its review target (800 of 800 nonblank lines) and `RuntimeState` within 12 lines of it; stage 1 deletes the plain legacy branches from `Lowering`, a net shrink, and stage 2 removes a field from `RuntimeState`, so neither grows. No size exception and no bound change is requested.

- **Lean:** [`ActivityHostLowering`](../../BpmnSemantics/SemanticProcess/ActivityHostLowering.lean) and [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) for the lowering; [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) (150 lines of headroom) for the plain host form; [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean) (87) for the view's entry; [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) beside `settledOperation` for `legacyView`; [`WaitActivation`](../../BpmnSemantics/SemanticProcess/WaitActivation.lean) for the bridge laws; [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) and the eight non-emptiness consumers in stage 2; the 31 conformance fixtures the spike names.
- **TypeScript:** the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) (37 lines of headroom, shrinking) and [`activity-host-lowering.ts`](../../packages/bpmn-source/src/activity-host-lowering.ts); the [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) for the plain host form; [`semantic-process-profile.ts`](../../packages/semantic-core/src/semantic-process-profile.ts) for the view's entry; [`activity-host-work.ts`](../../packages/semantic-core/src/activity-host-work.ts) for `legacyView`; the [runtime state](../../packages/semantic-core/src/semantic-process-state.ts) continuation validator in stage 2.

**Guards the implementation satisfies:** [`lean-fanout`](../../scripts/lean-fanout.test.ts) (no new `import all` opener of a hub, no new importer of `ActivityHostWork`), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [host-coverage census](../../scripts/activity-host-coverage-census.test.ts), whose frozen declarations stay byte-identical and which gains a check that no lowering produces a plain legacy constructor, and the [model-corpus guard](../../model-corpus/README.md) for the two models.

## Measurements, 2026-11-08

From throwaway clones of `776edaf4`, lowering every plain Task onto the host for every profile, with no admission change:

| Measure | Result |
|---|---|
| TypeScript `bpmn-source` tests | 432 of 2,381 fail: 230 assert lowered shapes, kinds or baselines; 75 are profile refusals of the host (`unsupportedModel`); the rest are journeys of those refused models |
| TypeScript `semantic-core` tests | none fail from the switch |
| Lean, 218 modules naming `awaitUserTask` or `awaitEffect` or importing `Lowering` | 31 fail first-order, all conformance fixtures (166 `decide`, 9 `rfl` and 4 other errors); every proof module builds; `Lowering`'s one-flow theorem is falsified by construction |
| Lean modules naming the plain constructors | about 150 for `awaitUserTask` and 120 for `awaitEffect`, 511 occurrences; untouched, because the constructors stay |

The view's effect on proofs that unfold a frozen profile's admission is not measured: the spikes changed no admission. The stage-1 Rule 2 declaration stops before any edit to a proof module beyond the bridge laws' consumers, and on any new `import all` opener, raised bound or size exception.

## Cost

Effort budget: 16 hours from 2026-11-08 01:45 CET for the family. Expected stop point at the limit: stage 1 landed green on the branch, with stage 2 after it. Two commits under their own Rule 2 declarations: the switch (lowering, plain host form, view, bridge laws, fixtures), then the clause.

## Epistemic closure

- **Established at closure, if green:** the plain switch with unchanged observations on every registered scenario; the implicit end at plain Tasks in the nested scope-data profile, Lean, core and Temporal agreeing, CIB calibrated at the probe's fidelity.
- **Nearest unsupported claims:** the variants on the host; observation equality beyond the registered scenarios; implicit ends at other Activity kinds.
- **Common-mode risk:** the view and the vertex projections are transcribed from one account; the CIB probe is the independent lane for the implicit end, not for the view.
- **Nearest realistic counterexample:** a Task without outgoing flows on one Parallel branch while the other branch still waits, which must leave the Process running.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
