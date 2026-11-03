# Engine control-flow family implementation map

This detail map owns the exact implemented and absent status of each closed or in-progress semantic family whose BPMN capability is control flow (Sequence Flow routing, Gateways, cycles and pass-through Activities) and which grows a data-bearing profile. It keeps one section per capsule delegation. Data-flow families are owned by [`implementation-status-owner:ENGINE-DATA-FAMILY`](ENGINE-DATA-FAMILY-IMPLEMENTATION-MAP.md), other BPMN element families by [`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), and cross-cutting mechanisms by [`implementation-status-owner:ENGINE-SEMANTIC-INVARIANT`](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md).

This map exists because the data-flow family map reached its reviewed word budget when None End fan-in needed recording (2026-11-02). The stated axis is what a family's BPMN capability is: a section belongs here when it closes control flow on a data-bearing profile, in the data-flow map when it closes data flow, and in the semantic family map otherwise.

## Current boundary

Each section below states the exact implemented and absent status of one control-flow family, delegated to this map by that family's capsule or specification. A section asserts nothing about any other family. The union of these sections is not a coverage figure: BPMN requirement coverage, CIB profile coverage, and platform milestone coverage are three separate denominators with their own owners.

## Implemented

Each section below owns one family's exact rules, evidence lanes, and absences, including its closure status. Its claims do not extend to another family or an excluded composition.

## Explicitly absent

A family with no section here has no status in this map, which is an absence of routing rather than a claim that the family is unimplemented; [the requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns dispositions and the owning capsule owns meaning. No section here is a BPMN conformance or CIB compatibility claim.

## Evidence owners

The [capsule registry](capsules/README.md), the Lean modules under [`BpmnSemantics/`](../BpmnSemantics/), the pure core under [`packages/semantic-core/`](../packages/semantic-core/), the registered scenarios, and the differential pipeline bind every claim below. [TESTING-SPEC.md](TESTING-SPEC.md) owns the gate contract.

## Nearest unsupported claims

Reading these sections together supports no cross-family theorem. A mechanism two families share is established only where each section says so independently.

## Scope re-entry

The [scope re-entry account](capsules/SCOPE-REENTRY-SPEC.md) grows `cibseven-2.2.0-nested-embedded-scope-data-draft` with Sequence Flow cycles in the Process root body that re-enter an embedded Sub-Process or a mapped Call; its [receipt](capsules/SCOPE-REENTRY-SPEC.md#independent-cold-review-receipt) owns review state.

**Implemented.** Source admission, Lean and the core route a Program of the profile whose root body holds an Exclusive Choice or Merge and that splits no token to the re-entry account, and refuse one that both forks and chooses (`SRE-ROUTE-01`, `SRE-ADMIT-01`). The profile's graph policy is the mixed-task resumption-bounded arm, where a Sub-Process whose body holds a User or Service Task counts as a checked cut (`SRE-CYCLE-01`); Start bindings follow the barrier rule, so a write reached only through a back-edge never satisfies a first entry (`SRE-AVAILABLE-01`); and the longest automatic burst from Start or any resumption, called continuations included, is computed at both analysis levels and refused above eight steps (`SRE-BURST-01`). Lean adds the leaf [`ScopeReentryAdmission`](../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean) and the executable [conformance module](../BpmnSemantics/ScopeReentryConformance.lean), which agree with the core on both retained models' Start names and bursts and on the exact-limit and refused variants. Runtime state and observation are unchanged: each re-entry installs a fresh frame and takes the next ordinal through the existing counters (`SRE-FRESH-01`, `SRE-INIT-01`, `SRE-OUTPUT-01`), Process values written earlier survive (`SRE-RETAIN-01`), and a command addressed to an earlier iteration is rejected unchanged (`SRE-STALE-01`). The Temporal Start capacity envelope gives re-entry Programs only its Program-level checks. Four answer-free schedules of the [retained models](../scenarios/scope-reentry/README.md) are registered pipeline cases with a seeded mutation each, both models are value-domain matrix rows and corpus entries, and the [CIB `2.2.0` probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java), on JUEL renditions of the conditions under `CIB-CFG-0005`, calibrates fresh locals and called inputs, retained Process values, distinct activity-instance and task ids per iteration and refusal of the stale task.

**Open.** The late effect result of `SRE-STALE-01` is a core runtime witness only, because ordered Activity execution delivers each result exactly once and a schedule cannot carry a stale one. Not proved in Lean: that every actual closure of an admitted re-entry Program stays within the computed burst; the runtime closure bound rolls an over-limit closure back atomically. Excluded: Exclusive Gateways inside a Sub-Process body or the called Process, a model that both forks and chooses, cycles cut only inside a called Process, Multi-Instance re-entry (`PC-MI-11`), Event-Based, Inclusive and Timer cycles, and expressions beyond Simple Boolean v1 and exact `${name}` (`PC-DATA-07`).

## Pass-through Tasks

The [pass-through Task account](capsules/PASS-THROUGH-TASK-SPEC.md) grows `cibseven-2.2.0-nested-embedded-scope-data-draft` with plain Tasks and Manual Tasks that pass the token on at once (`CIB-EXT-0022`); its [receipt](capsules/PASS-THROUGH-TASK-SPEC.md#independent-cold-review-receipt) owns review state.

**Implemented.** The checked graph keeps a `nonOperationalTask` node with its `abstractTask` or `manualTask` notation, and lowering emits the existing one-input `mergeExclusive` with the Task as origin, so the IL and runtime are unchanged (`PTT-KIND-01`, `PTT-PASS-01`). Source admission and the core admit such a Task with one incoming and one unconditioned, non-default outgoing flow on a serial path of the root or a Sub-Process body or in a re-entry root graph, and refuse it in a called Process, a forking Program and every excluded form; Lean agrees on both models and on the second outgoing flow, second incoming flow, conditioned outgoing flow and forking Program (`PTT-ADMIT-01`). At the Program level only a `mergeExclusive` of two or more inputs selects the re-entry route, so a serial model with a root Task stays serial (`SRE-ROUTE-01` as amended), and a serial model holding a Task is admitted only within the eight-step burst, computed by the leaf [`ScopeDataBurst`](../BpmnSemantics/SemanticProcess/ScopeDataBurst.lean) that the re-entry account shares (`PTT-BURST-01`). The executable [conformance module](../BpmnSemantics/PassThroughTaskConformance.lean) agrees with the core on both retained models' routes, Start names and bursts and on the exact-limit and refused chains. Three answer-free schedules of the [retained models](../scenarios/pass-through-task/README.md) are registered pipeline cases with a seeded passive-wait mutation each, and their command publications, where each Task's occurrence starts and ends in one step and the re-entered *Phone sender* gets a fresh one (`PTT-FRESH-01`), agree between Lean and the core. Both models are value-domain matrix rows, corpus entries and About rows, and the [CIB `2.2.0` probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) calibrates the ended `task` and `manualTask` activity instances without task or job.

**Open.** [Pass-through Tasks on Parallel branches](#pass-through-tasks-on-parallel-branches) since admits the Task in forking Programs and owns the remaining `PC-HUM-04` and `PC-HUM-05` clauses. Not proved in Lean: that every actual closure of an admitted serial Program holding a Task stays within the computed burst; the runtime closure bound rolls an over-limit closure back atomically. Excluded: called Processes, several flows, conditional or default outgoing flows, asynchronous continuations, listeners, mappings, Multi-Instance, boundary Events and compensation handlers.

## Root Parallel forks

The [root Parallel forks account](capsules/ROOT-PARALLEL-FORKS-SPEC.md) grows the same profile with paired Parallel forks in the Process root body (`CIB-EXT-0020`); its receipt owns review state.

**Implemented.** No representation change: root branches run the concurrent structured scope data account, and the profile restriction in the core and Lean refuses a Call in a forking root body instead of the root fork (`RPF-ADMIT-01`). The employee onboarding witnesses commit-order writes, an open snapshot kept under a sibling write and one join (`RPF-ROOT-01`, `RPF-WRITE-01`, `RPF-VALUE-01`) through a [conformance module](../BpmnSemantics/RootParallelForksConformance.lean), three pipeline cases, a corpus row, About and the CIB probe.

**Open.** `PC-CF-03` and `PC-DATA-03`, `-05` and `-06` keep their other clauses. Excluded: root Calls and merges; [pass-through Tasks on Parallel branches](#pass-through-tasks-on-parallel-branches) since admits the Task on root branches.

## Exclusive choice arity

[Exclusive choice arity](capsules/EXCLUSIVE-CHOICE-ARITY-SPEC.md) lifts every arity locus of the re-entry Choice to any positive condition count with a default (`XCA-ADMIT-01`) with a [conformance module](../BpmnSemantics/ExclusiveChoiceArityConformance.lean), pipeline cases and the CIB probe. Open: Lean checked-level profile control; default-less and body Choices.

## None End fan-in

The [None End fan-in account](capsules/NONE-END-FAN-IN-SPEC.md) grows the same profile with several incoming flows at the root None End of a re-entry graph (`CIB-AGR-0015`); its receipt owns review state.

**Implemented.** No kernel change: a fan-in End lowers to one `reachNoneEnd` per incoming flow, named `operation:<End>:from:<flow>`, so each token ends on its own (`NEF-END-01`); a single-incoming End keeps its identifier. The checked None End arity widens for this profile alone, the Program envelope counts the arrivals' shared origin once only when all lie in the root graph, and the re-entry one-End rule counts End elements at both levels (`NEF-ADMIT-01`). The travel request witnesses all three arrivals through a [conformance module](../BpmnSemantics/NoneEndFanInConformance.lean), three pipeline cases, a corpus row, About and the CIB probe.

**Open.** `PC-BASIC-01` keeps its None End clause: fan-in at Ends in Sub-Process bodies or the called Process, under forks, and at Activities (`PC-CF-07`, `PC-HUM-05`) stays refused. A fork with fan-in is refused at three checked loci, the body End arity, the second-visit check and the root terminal-fork rule; the Program level relies on the lowering-equality bridge.

## Pass-through Tasks on Parallel branches

The [pass-through Tasks on Parallel branches account](capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md) grows the same profile with plain and Manual Tasks on Parallel branches of the root and Sub-Process bodies (`CIB-EXT-0022` widened); its receipt owns review state.

**Implemented.** No representation change: the Task keeps lowering to a one-input `mergeExclusive`, which prepares as `mergeInput`. `PreparedInternalTransition.Independent` and the TypeScript twin make `mergeInput` independent of `declaredEntry` on separated footprints, and the pair law `prepared_declared_entry_merge_pair` in [`InternalMergeScopeCreationCommutation`](../BpmnSemantics/SemanticProcess/InternalMergeScopeCreationCommutation.lean) joins the batch law's case analysis; `mappedInvocation` stays dependent (`PTPB-COMMUTE-01`). Under this profile only, the structured-body analysis maps a one-input `mergeExclusive` and a checked `nonOperationalTask` to a `pass` vertex of one step, no wait and no effect (`PTPB-PROFILE-01`, `PTPB-BURST-01`); the branch cut in the leaf [`NestedScopeBranchWork`](../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean) admits a joined branch of pass vertices and a terminal branch only when its closure scan arms a task before its End (`PTPB-WORK-01`), and Call placement skips pass vertices (`PTPB-CALL-01`). The office relocation and invoice settlement witness both through a [conformance module](../BpmnSemantics/PassThroughParallelBranchesConformance.lean) of five checks, three pipeline cases, a core runtime test that commits every stimulus without an ambiguous choice and agrees across both completion orders, two corpus rows, About and the CIB probe.

**Open.** `PC-HUM-04` stays open on a wait-free branch of a terminal fork in a Sub-Process body and on a forking model without an embedded Sub-Process (`PC-CF-03`), and `PC-HUM-05` on those forms and implicit split and merge (`PC-CF-07`); a body fork of four pass-only branches exceeds the closure limit. Argued, not proved: that no admitted closure co-enables an End or regional completion with a frame-inserting entry, checked on the registered scenarios; and, as for serial Tasks, that every actual closure stays within the computed burst. Excluded: called Processes, Multi-Instance bodies, several flows and every other exclusion of the root Parallel forks and concurrent structured scope data accounts.
