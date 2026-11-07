# Engine Gateway family implementation map

This detail map owns the exact implemented and absent status of each closed or in-progress semantic family whose BPMN capability is a Gateway's split or join (Parallel forks, Exclusive choices and Inclusive regions) and which grows a data-bearing profile. It keeps one section per capsule delegation. Other control-flow families are owned by [`implementation-status-owner:ENGINE-CONTROL-FLOW-FAMILY`](ENGINE-CONTROL-FLOW-FAMILY-IMPLEMENTATION-MAP.md), data-flow families by [`implementation-status-owner:ENGINE-DATA-FAMILY`](ENGINE-DATA-FAMILY-IMPLEMENTATION-MAP.md), other BPMN element families by [`implementation-status-owner:ENGINE-SEMANTIC-FAMILY`](ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md), and cross-cutting mechanisms by [`implementation-status-owner:ENGINE-SEMANTIC-INVARIANT`](ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md).

This map exists because the control-flow family map reached its reviewed word budget when the Activity host merges needed recording (2026-11-07). The stated axis is what a family's BPMN capability is: a section belongs here when it closes a Gateway's split or join on a data-bearing profile, and in the control-flow map when it closes other control flow.

## Current boundary

Each section below states the exact implemented and absent status of one Gateway family, delegated to this map by that family's capsule or specification. A section asserts nothing about any other family. The union of these sections is not a coverage figure: BPMN requirement coverage, CIB profile coverage, and platform milestone coverage are three separate denominators with their own owners.

## Implemented

Each section below owns one family's exact rules, evidence lanes, and absences, including its closure status. Its claims do not extend to another family or an excluded composition.

## Explicitly absent

A family with no section here has no status in this map, which is an absence of routing rather than a claim that the family is unimplemented; [the requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns dispositions and the owning capsule owns meaning. No section here is a BPMN conformance or CIB compatibility claim.

## Evidence owners

The [capsule registry](capsules/README.md), the Lean modules under [`BpmnSemantics/`](../BpmnSemantics/), the pure core under [`packages/semantic-core/`](../packages/semantic-core/), the registered scenarios, and the differential pipeline bind every claim below. [TESTING-SPEC.md](TESTING-SPEC.md) owns the gate contract.

## Nearest unsupported claims

Reading these sections together supports no cross-family theorem. A mechanism two families share is established only where each section says so independently.

## Root Parallel forks

The [root Parallel forks account](capsules/ROOT-PARALLEL-FORKS-SPEC.md) grows `cibseven-2.2.0-nested-embedded-scope-data-draft` with paired Parallel forks in the Process root body (`CIB-EXT-0020`); its receipt owns review state.

**Implemented.** No representation change: root branches run the concurrent structured scope data account, and the profile restriction in the core and Lean refuses a Call in a forking root body instead of the root fork (`RPF-ADMIT-01`). The employee onboarding witnesses commit-order writes, an open snapshot kept under a sibling write and one join (`RPF-ROOT-01`, `RPF-WRITE-01`, `RPF-VALUE-01`) through a [conformance module](../BpmnSemantics/RootParallelForksConformance.lean), three pipeline cases, a corpus row, About and the CIB probe.

**Open.** `PC-CF-03` and `PC-DATA-03`, `-05` and `-06` keep their other clauses. Excluded: root Calls and merges; pass-through Tasks on Parallel branches ([`implementation-status-owner:ENGINE-CONTROL-FLOW-FAMILY`](ENGINE-CONTROL-FLOW-FAMILY-IMPLEMENTATION-MAP.md#pass-through-tasks-on-parallel-branches)) since admit the Task on root branches.

## Exclusive choice arity

[Exclusive choice arity](capsules/EXCLUSIVE-CHOICE-ARITY-SPEC.md) lifts every arity locus of the re-entry Choice to any positive condition count with a default (`XCA-ADMIT-01`) with a [conformance module](../BpmnSemantics/ExclusiveChoiceArityConformance.lean), pipeline cases and the CIB probe. Open: Lean checked-level profile control; body Choices.

## Exclusive Choice without a default

The [Exclusive Choice without a default account](capsules/EXCLUSIVE-CHOICE-WITHOUT-DEFAULT-SPEC.md) grows the same profile with root Choices of two or more conditions and no default (`CIB-INT-0003`); its receipt owns review state.

**Implemented.** The default becomes optional in the checked node and the IL `choose`; a default-less Choice takes its first true condition (`XND-ROUTE-01`), and when every condition is false the closure stabilizes with it parked and reports `noFlowChoice`, so the Start or User Task completion rolls back flag-free to its exact prior state (`XND-ROLLBACK-01`; Lean proves the dispatch and the [command boundary](../BpmnSemantics/SemanticProcess/Execution.lean) given that report, and the journeys check the report itself). Admission refuses one conditional flow and an unconditioned flow (`XND-ADMIT-01`, [conformance module](../BpmnSemantics/ExclusiveChoiceWithoutDefaultConformance.lean)); the source reader alone refuses a Choice that an effect result can reach. Two pipeline cases, a Lean-core differential test for the catering Start and cash payout, the [hosted witness](../packages/temporal-adapter/testkit/test/exclusive-choice-without-default-recovery.temporal-test.ts) of a rolled-back completion across Worker replacement and retry, the client's `startRolledBack` refusal before any Workflow (`XND-HOST-01`), two corpus rows, About and the CIB probe witness it.

**Open.** `PC-CF-02` keeps its body-Choice and other-profile clauses; a default-less Choice reachable from an effect result waits for incidents (`PC-AUTO-03`).

## Inclusive Gateway regions

The [Inclusive regions specification](capsules/INCLUSIVE-GATEWAY-REGIONS-SPEC.md) grows the same profile with structured root Inclusive regions (`CIB-INT-0005`, `CIB-AGR-0017`); its receipt owns review state.

**Implemented.** No new operation or transition family. The Semantic Process and checked-process contracts widen `selectMany` to one or more candidates with an optional default, `synchronizeSelected` to two or more inputs and the hidden record to one or more expected inputs, in both schemas, both languages' contracts and readers and the Temporal continuation validator; the exact Inclusive profile keeps its topology through a profile predicate (`IGR-PROFILE-01`). Without a default, an empty selection disables the split. Under the nested scope-data profile the shared structured analysis projects a split as a fork and its join as a join, and a region leaf, [`inclusive-region-admission.ts`](../packages/semantic-core/src/inclusive-region-admission.ts) and [`InclusiveRegionAdmission`](../BpmnSemantics/SemanticProcess/InclusiveRegionAdmission.lean) over the walk in [`InclusiveRegionWalk`](../BpmnSemantics/SemanticProcess/InclusiveRegionWalk.lean), checks paired kinds, root placement with at most one live region, the outputs and default rule, the strict cut, the Call exclusion and, at the Program level, every expected join input (`IGR-ADMIT-01`, `IGR-BIND-01`, `IGR-ROOT-01`). Lowering derives expected join inputs by the walk and lowers an absent condition to `true`; the routing predicate counts a split as a fork. The account opening and event booking witness it through the [Inclusive regions conformance module](../BpmnSemantics/InclusiveRegionsConformance.lean), a source test, a continuation test of a three-input record, eight pipeline cases with seeded mutations for an all-input join, first-arrival release, first-true selection, a skipped default, an extra default and an unconditioned output read as false, two value-domain rows, two corpus rows, About and the [CIB probe](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenInclusiveGatewayRegionsProbeTest.java).

**Open.** `PC-CF-04` stays open on regions in Sub-Process or called bodies, beside Calls, unpaired, looping or unstructured merges, and after Calls or Multi-Instance; `PC-CF-08` on its other cells. Argued and checked, not proved: that no admitted closure reaches a split beside a declared completion, that the selected-set reading equals Table 13.3 on every admitted region, and join liveness; not proved in Lean, as for the accounts it reuses, that every actual closure stays within the computed burst. Excluded: an Inclusive region on a branch of another or beside one on a sibling branch of a fork, an Inclusive Gateway beside an Exclusive Choice or a cycle, a default-less split whose every output is conditioned, a defaulted split with an unconditioned output, pass-through or terminal branches, and every form under any other profile.
