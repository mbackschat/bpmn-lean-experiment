# Lean assurance-surface proposal

## Status

Lifecycle: draft
Review: pending

## Question and current boundary

The owner asked whether the Lean development is over-engineered relative to its delivered assurance, and whether it is inflating with needless theorems. This proposal answers that question from measurement rather than impression, and owns the corrections the measurement justifies. It changes no BPMN meaning, no semantic profile, no CIB relationship, no checked-source or [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md) representation, and no public observation. It does change the proof boundary, which is why it is material for [the independent cold-review gate](TESTING-SPEC.md#independent-cold-review-gate).

The volume question is answered negatively and the answer is load-bearing, because it removes the motivation for a large consolidation programme that would otherwise look attractive. Across the 792 theorems in the 51 `*Conformance.lean` files, the proved statements begin with 280 distinct leading symbols and 186 of those symbols appear exactly once. That distribution is a differentiated proof surface, not a replicated template. The largest single cluster is `applyStimulus` at 89, which is the semantic transition operation itself, and those are per-scenario step results rather than restatements of one fact. Three separate consolidation hypotheses were tested and failed: the `*_is_rejected` and `*_is_admitted` families are quantified with real hypotheses rather than per-fixture decided facts; `CyclicControlFlowConformance.lean`'s 46 concrete theorems are 46 distinct propositions about cut behaviour, cycle containment, saturation certification, lowering preservation and per-activation choice; and a statement-level duplicate scan reporting 73 apparent restatements was a false positive, because each conformance file defines its own local `checkedProcess` and `program`, so textually identical statements are different propositions.

What the measurement does establish is four verification gaps, none of which is about volume. Three of them share one mechanism: an obligation that the repository states in prose or maintains by hand where it could be decided mechanically.

## Measured baseline

Measured against commit `d01701dc`, over the 183 Lean files under `BpmnSemantics/`, excluding `.lake` build output and the A12 legacy snapshot under `adoption/`.

| Measure | Value |
|---|---|
| Nonblank Lean lines | 46,282 |
| Of which `*Conformance.lean` (51 files) | 13,240 |
| Of which `Experiments/` (provisional, separately gated) | 2,999 |
| Of which `*Json*.lean` plus `*Main.lean` (executable lane) | 1,801 |
| `theorem` declarations (no `lemma` declarations exist) | 1,500 |
| Of which in `*Conformance.lean` | 792 |
| Quantified over binders or `∀` | 777 |
| Concrete, no binders | 723 |
| `decide +kernel` occurrences | 714 |
| `native_decide` occurrences | 20 |
| `#print axioms` commands | 0 |
| `set_option warningAsError` occurrences | 0 |
| `sorry` occurrences | 0 |

## Selected rules

`LAS-AXIOM-01`: every durable public theorem in a maintained `*Conformance.lean` file records its axiom footprint with an anchored `#print axioms` command, and an executable guard requires the count of anchored commands to equal the combined count of `depends on axioms` and `does not depend on any axioms` output lines.

`LAS-CITE-01`: every named `theorem` outside the `*Conformance.lean` files is reachable either from another Lean declaration or from an owning project document. A theorem reachable from neither is removed, or is given the evidence row that makes it reachable.

`LAS-DEFAULT-01`: every absorbing lookup default whose default value is not the intended semantics of an absent key carries a checked unreachability result under explicitly stated admission or well-formedness hypotheses, or its accessor takes that evidence as an argument.

`LAS-SUITE-01`: the per-fixture admission obligations that every registered conformance fixture must satisfy are stated once as a theorem quantified over the registered fixture list, so a newly registered fixture is covered by construction rather than by the author remembering to restate the obligation.

## Why each rule is necessary

**`LAS-AXIOM-01`.** The repository proves 1,500 theorems and verifies the axiom footprint of none of them. [CLAUDE.md](../CLAUDE.md#code-hygiene-and-module-boundaries) already reasons that `native_decide` "moves trust to the compiler by adding a `native_decide` axiom to the proving theorem's footprint", and there are 20 such sites. Nothing establishes which theorems currently carry that axiom, and nothing would detect a twenty-first appearing, or an existing one propagating through a shared lemma into a conformance claim. The concern is stated in prose and enforced nowhere, which is the condition [the process-assessment escalation rule](PROCESS-ASSESSMENT-LEDGER.md) says to convert into an executable guard. The count check is part of the rule rather than an implementation detail, because a footprint listing that silently omits theorems is the failure it exists to prevent, and the output has two shapes: a theorem resting on nothing prints `does not depend on any axioms` rather than a `depends on axioms` line, so a check reading only the first shape under-counts.

A second hazard motivates the same rule and needs its own verification rather than assumption. Lean can attach `sorryAx` to a theorem's footprint in situations where the affected theorem reports no error of its own, so that the footprint is the only place the weakening is visible. Whether that reproduces on this repository's pinned `leanprover/lean4:v4.31.0` is an empirical question this proposal does not assume. The implementing change must settle it by deliberately deleting one match arm and observing whether the footprint moves while the build stays quiet, and must record the observed result either way. If it does not reproduce, the rule still earns its place on the `native_decide` footprint alone, and the proposal says so rather than resting the case on an unverified hazard.

**`LAS-CITE-01`.** 150 of the 708 theorems outside the conformance files are cited by neither another Lean declaration nor any document under `docs/`. They divide into 20 under `Experiments/`, 24 in `*Laws.lean` files, and 106 elsewhere. The `*Laws.lean` group is the sharp case and the reason this is a rule rather than a cleanup: `SequentialMultiInstanceLaws.lean` holds 13 and `ParallelMultiInstanceLaws.lean` holds 10. `storeIterationResult_preserves_frame` was checked individually and appears in its own file and nowhere else. [CLAUDE.md](../CLAUDE.md#semantic-code) requires every material semantic rule to carry a stable capsule-owned identifier and a rule-to-evidence row, so a named law that no capsule cites is not merely unused code; it is a law whose evidence chain does not close. Triage under this rule therefore has two outcomes and the distinction matters: a law that should be cited gains its row, and a law that nothing needs is removed.

**`LAS-DEFAULT-01`.** 82 sites in the Lean tree read through an absorbing default. For the activation counters this is the intended total semantics, where an element never armed reads as ordinal zero, and those sites are outside this rule. Four classes are not: [`Lowering.lean:159`](../BpmnSemantics/SemanticProcess/Lowering.lean#L159) and [`:351`](../BpmnSemantics/SemanticProcess/Lowering.lean#L351) turn an unparseable condition expression into `.literal false`; [`Lowering.lean:61`](../BpmnSemantics/SemanticProcess/Lowering.lean#L61), [`:139`](../BpmnSemantics/SemanticProcess/Lowering.lean#L139) and [`:183`](../BpmnSemantics/SemanticProcess/Lowering.lean#L183) produce an empty-string place identifier; [`CheckedGraphValidation.lean:49`](../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean#L49) falls back to the source identifier on a failed resolution; and `InternalCommutationCore.lean:332` with `InternalCommutationProjection.lean:303` and `:521` turn a failed input-mapping evaluation into empty bindings.

The condition case is the one that decides the rule. [`CheckedProcessAdmission.lean:117`](../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean#L117) does require `(parseSimpleBooleanExpression condition.body).isSome`, so an admitted process cannot reach the default. But `checkedConditionValid` returns `Bool`, `lowerConditionalCandidate` takes a bare `CheckedProcess` with no admission hypothesis in its type, `lowerCheckedProcess` is called directly from conformance and fixture modules, and no theorem was found connecting the two. The guarantee is real and rests entirely on call discipline. That is the same class as [the admission-blocking parser rule](../CLAUDE.md#semantic-code), inverted: a silent `false` for an expression the profile refuses to admit changes routing to the default flow with no error anywhere. The rule requires the connection to be checked, and expects the result to be more than one theorem, because the four classes have different hypotheses and one of them may prove to have a genuinely reachable default.

**`LAS-SUITE-01`.** This is the smallest of the four and its scope is stated exactly, because an earlier estimate of roughly 200 theorems was an extrapolation and is wrong. A strict match on the canonical single-argument obligation shapes finds 49 theorems across at most 13 files. Counting by leading statement symbol, the wider admission and well-formedness family is 110 across the conformance files: `checkedWellFormed` 28, `runtimeStateWellFormed` 24, `programWellFormed` 23, `definitionBindingValid` 16, `programProfileCapabilitiesValid` 10, and `calledProcessAssociationsValid` 9. The saving is therefore modest, between 49 and 110 theorems against a population of 1,500.

The reason to do it anyway is not the count. No guard requires the suite: the `scripts/` tree contains no reference to those obligation shapes, so a conformance fixture added without its well-formedness theorem is covered by nothing and reads as covered. This is a hand-maintained enumeration standing where a mechanical one belongs, which is the same mechanism as `LAS-AXIOM-01` and `LAS-CITE-01` and the reason all four sit in one proposal rather than three.

## Required, optional, and excluded

Required: the four rules above, each with its executable guard, and the empirical `sorryAx` determination that `LAS-AXIOM-01` names.

Optional, and non-material under [the negative case](TESTING-SPEC.md#independent-cold-review-gate): extracting the generic activation-lookup laws into a narrow module below `RuntimeStateIdentityBound` so the task activation family stops carrying its own copy. `RuntimeStateIdentityBound.lean:11-63` holds 51 nonblank lines restating a 33-line generic at `InternalArmingOrder.lean:504-540`, because `TaskActivation` keys on `TaskDefinitionId` while its three siblings key on `NodeId`. The reproof cannot be done in place: `InternalArmingOrder` transitively depends on `RuntimeStateIdentityBound` through `CollectionOrder` and `RuntimeStateWellFormed`, so the direct import is a cycle. This is behaviour-preserving hygiene with no deadline; no owner is near its size target, with 214, 209, 252 and 708 lines of headroom against 800.

Excluded: any reduction programme premised on the theorem population being replicated boilerplate, which the baseline refutes. Excluded: consolidating the `applyStimulus` cluster, whose 89 members are distinct per-scenario results. Excluded: changing the `getD 0` activation-counter sites, whose default is the intended meaning. Excluded: any change to a semantic account, profile, admission capability, or public observation.

## Temporal hosting and refinement preflight

Not applicable, and stated rather than omitted. [CLAUDE.md](../CLAUDE.md#non-negotiable-boundaries) requires a Temporal hosting and refinement preflight before implementing a new semantic transition family. This proposal introduces no transition family, no runtime state field, no wire contract, and no public projection. `LAS-DEFAULT-01` may add hypotheses to existing lowering accessors, which changes no hosted behaviour because lowering runs before Workflow start. If implementation finds that closing `LAS-DEFAULT-01` requires changing what an accessor returns rather than what it assumes, that is a different change and returns here for a preflight before proceeding.

## Evidence and stage boundary

Each rule closes against its own executable guard rather than against a reading of the source: `LAS-AXIOM-01` against the footprint count check plus the recorded reproduction result; `LAS-CITE-01` against a reachability guard over Lean declarations and `docs/`; `LAS-DEFAULT-01` against the checked unreachability results and a guard listing every remaining absorbing default with its classification; `LAS-SUITE-01` against the quantified fixture theorem plus a guard that fails when a registered fixture is absent from it. The applicable complete gate is [`test:infrastructure`](TESTING-SPEC.md#focused-gate-matrix) for the guards and `./scripts/lake.sh build` for the Lean changes, with the narrow module builds bounded by [the delegated implementation rules](../CLAUDE.md#delegated-implementation).

The four rules are independent and may land separately. Recommended order, with the reason each position is chosen rather than the next: `LAS-AXIOM-01` first, because it is the cheapest and it protects every later change including the other three; `LAS-DEFAULT-01` second, because it is the only rule here where a wrong answer is currently reachable rather than merely unverified; `LAS-CITE-01` third, because its triage is bounded and its `*Laws.lean` half closes an evidence chain the specifications already assume; `LAS-SUITE-01` last, because its saving is the smallest and its guard duplicates no existing coverage. The optional extraction has no position and may be taken whenever convenient.

## Same-change owners and reopen conditions

Implementing any rule updates [TESTING-SPEC.md](TESTING-SPEC.md#evidence-lanes) with the new guard, [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) with exact implemented and absent scope, and [PLAN.md](PLAN.md) with the resume point. `LAS-CITE-01` removals additionally touch the owning capsule under [docs/capsules](capsules/README.md) wherever a law gains its evidence row.

Reopen if the `sorryAx` reproduction attempt shows the hazard is live on the pinned toolchain in a form the count check does not cover, if `LAS-DEFAULT-01` finds a default that is genuinely reachable rather than merely unproved, or if `LAS-CITE-01` triage shows the uncited `*Laws.lean` theorems state propositions no capsule intends to claim, since that is a capsule-scope question rather than a hygiene one.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `833520c514ea3606de469343f266cbd937ac137e` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
