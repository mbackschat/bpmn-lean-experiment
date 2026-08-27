# Lean assurance-surface proposal

## Status

Lifecycle: draft
Review: pending

## Question and current boundary

The owner asked whether the Lean development is over-engineered relative to its delivered assurance, and whether it is inflating with needless theorems. This proposal answers that question from measurement rather than impression, and owns the corrections the measurement justifies. It changes no BPMN meaning, no semantic profile, no CIB relationship, no checked-source or [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md) representation, and no public observation. It does change the proof boundary, which is why it is material for [the independent cold-review gate](TESTING-SPEC.md#independent-cold-review-gate).

The volume question is answered negatively, and the answer is reported with its limits rather than as a blanket result. Across the 792 theorems in the 51 `*Conformance.lean` files, the proved statements begin with 280 distinct leading symbols and 186 of those symbols appear exactly once. Those figures come from one extraction rule, namely the first identifier token of the statement text between the declaration colon and `:=` or `by`, with whitespace normalized; a different tokenization shifts them by a few percent without changing their shape. The largest cluster is `applyStimulus` at 89, which is the semantic transition operation itself, so those are per-scenario step results rather than restatements of one fact. Two consolidation hypotheses were tested and failed outright: the `*_is_rejected` and `*_is_admitted` families are quantified with real hypotheses rather than per-fixture decided facts, and `CyclicControlFlowConformance.lean`'s 46 concrete theorems are 46 distinct propositions about cut behaviour, cycle containment, saturation certification, lowering preservation and per-activation choice.

The third hypothesis failed only partly, and the partial result is retained because it bounds the claim above. A statement-level duplicate scan reports on the order of 73 to 80 excess restatements depending on the extraction rule. For the 21 of 51 conformance files that define their own local `checkedProcess` and `program`, textually identical statements are genuinely different propositions and the scan is a false positive. For fixtures shared across files it is not: `cyclicProgram` is defined exactly once, at [`CyclicControlFlowFixtures.lean:107`](../BpmnSemantics/SemanticProcess/CyclicControlFlowFixtures.lean#L107), and one identical lookup statement about it is proved in four separate conformance modules. Those four are one proposition proved four times. The cross-file shared-fixture duplicates are therefore a real and unquantified residue, excluded from this proposal's scope rather than dismissed.

What the measurement establishes beyond the volume question is two verification gaps, stated below as rules, and two further observations whose rules are not yet designed well enough to propose.

## Measured baseline

Measured against commit `d01701dc`, over the 183 Lean files under `BpmnSemantics/`, excluding `.lake` build output and the A12 legacy snapshot under `adoption/`.

| Measure | Value |
|---|---|
| Nonblank Lean lines | 46,282 |
| Of which `*Conformance.lean` (51 files) | 13,240 |
| Of which `Experiments/` (provisional, separately gated) | 2,999 |
| Of which `*Json*.lean` or `*Main.lean` (executable lane, 9 files) | 1,260 |
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

`LAS-CITE-01`: every named `theorem` outside the `*Conformance.lean` files is reachable either from another Lean declaration or from an owning project document. A theorem reachable from neither is removed, or is given the evidence row that makes it reachable.

`LAS-DEFAULT-01`: every absorbing lookup default whose default value is not the intended semantics of an absent key carries a checked unreachability result under explicitly stated admission or well-formedness hypotheses, or its accessor takes that evidence as an argument.

## Why each rule is necessary

**`LAS-CITE-01`.** 150 of the 708 theorems outside the conformance files are reachable from no other Lean declaration and are cited by no document under `docs/`. They divide into 20 under `Experiments/`, 24 in `*Laws.lean` files, and 106 elsewhere. The `*Laws.lean` group is the sharp case and the reason this is a rule rather than a cleanup: `SequentialMultiInstanceLaws.lean` holds 13 and `ParallelMultiInstanceLaws.lean` holds 10. `two_distinct_all_policy_slot_completions_commute` is a member and shows the shape of the problem, because a commutation law for two slot completions under the all-policy is a material semantic claim rather than a helper. [CLAUDE.md](../CLAUDE.md#semantic-code) requires every material semantic rule to carry a stable capsule-owned identifier and a rule-to-evidence row, so a named law that no capsule cites is not merely unused code; it is a law whose evidence chain does not close. Triage under this rule therefore has two outcomes and the distinction matters: a law that should be cited gains its row, and a law that nothing needs is removed.

**`LAS-DEFAULT-01`.** 82 sites in the Lean tree read through an absorbing default. For the activation counters this is the intended total semantics, where an element never armed reads as ordinal zero, and those sites are outside this rule. Three classes are not: [`Lowering.lean:159`](../BpmnSemantics/SemanticProcess/Lowering.lean#L159) and [`:351`](../BpmnSemantics/SemanticProcess/Lowering.lean#L351) turn an unparseable condition expression into `.literal false`; [`Lowering.lean:61`](../BpmnSemantics/SemanticProcess/Lowering.lean#L61), [`:139`](../BpmnSemantics/SemanticProcess/Lowering.lean#L139) and [`:183`](../BpmnSemantics/SemanticProcess/Lowering.lean#L183) produce an empty-string place identifier; and [`CheckedGraphValidation.lean:49`](../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean#L49) falls back to the source identifier on a failed resolution.

The condition case is the one that decides the rule, and it has two admission owners rather than one. [`CheckedProcessAdmission.lean:117`](../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean#L117) requires `(parseSimpleBooleanExpression condition.body).isSome` for the Exclusive Gateway flow conditions reached through `checkedExclusiveGatewayValid`, while the parallel Multi-Instance `completionCondition` at `Lowering.lean:351` is admitted separately by [`ParallelMultiInstanceProfileAdmission.lean`](../BpmnSemantics/SemanticProcess/ParallelMultiInstanceProfileAdmission.lean), whose `exactParallelCheckedNode` requires one exact condition body. So an admitted process cannot reach either default. But `checkedConditionValid` returns `Bool`, `lowerConditionalCandidate` takes a bare `CheckedProcess` with no admission hypothesis in its type, `lowerCheckedProcess` is called directly from conformance and fixture modules, and no theorem was found connecting any of this. The guarantee is real and rests entirely on call discipline. That is the same class as [the admission-blocking parser rule](../CLAUDE.md#semantic-code), inverted: a silent `false` for an expression the profile refuses to admit changes routing to the default flow with no error anywhere. The rule requires the connection to be checked, and expects the result to be more than one theorem, because the classes have different hypotheses in different owners and one of them may prove to have a genuinely reachable default.

## Observations whose rules are not yet designed

Two further gaps are recorded here with their evidence, and deliberately not proposed as rules, because the mechanism that would close each one is not yet designed well enough to review. Recording them without a rule is the point: each is a real observation whose first proposed mechanism did not survive scrutiny.

**Axiom-footprint content.** The repository proves 1,500 theorems with no `#print axioms` command anywhere. The site-level gap is already closed and was initially misattributed here: [`lean-source-contracts.test.ts`](../scripts/lean-source-contracts.test.ts) ratchets `native_decide` against an exactly recorded 20-site set and fails on a twenty-first, inside `test:infrastructure`. What remains unverified is footprint *content* rather than site count, namely whether a `native_decide` axiom propagates through a shared lemma into a conformance claim. A count check between anchored commands and footprint output lines would not detect that, because propagation leaves the count unchanged. A content ratchet against an approved baseline would, but it needs an owner gate that can execute Lean: `test:infrastructure` is `tsc -p tsconfig.harness.json` plus `node --test scripts/*.test.ts` and observes no Lean output at all, while routing it through `./scripts/lake.sh` takes the repository-wide fail-closed lock and would convert the only port-free gate into a Lean build. Whether a warm Lake cache re-emits the message lines such a guard would read is also unsettled. A rule here requires answering the gate question first.

**Per-fixture admission obligations.** Every conformance file proves its own well-formedness and binding obligations, and no guard requires the suite: the `scripts/` tree contains no reference to those obligation shapes, so a conformance fixture added without its well-formedness theorem is covered by nothing and reads as covered. The family is between 49 and 110 theorems depending on the match rule, against a population of 1,500, so the saving is modest and the coverage gap is the motivation. Stating the obligations once over a registered fixture list would close it only if membership is derived mechanically, and no such registry exists: `registeredFixtures`, `allFixtures`, `fixtureList` and `List CheckedProcess` return zero hits across `BpmnSemantics/`, and `ConformanceMain.lean` imports 22 of the 51 conformance modules. A hand-written list would reproduce the defect it removes, so a rule here requires a mechanically derived registry that this proposal does not design.

## Required, optional, and excluded

Required: the two rules above, each with its executable guard.

Optional, and non-material under [the negative case](TESTING-SPEC.md#independent-cold-review-gate): extracting the generic activation-lookup laws into a narrow module below `RuntimeStateIdentityBound` so the task activation family stops carrying its own copy. `RuntimeStateIdentityBound.lean:11-63` holds 51 nonblank lines restating a 33-line generic at `InternalArmingOrder.lean:504-540`, because `TaskActivation` keys on `TaskDefinitionId` while its three siblings key on `NodeId`. The reproof cannot be done in place: `InternalArmingOrder` transitively depends on `RuntimeStateIdentityBound` through `CollectionOrder` and `RuntimeStateWellFormed`, so the direct import is a cycle. This is behaviour-preserving hygiene with no deadline; against the 800-line target, `InternalArmingOrder` has 214 lines of headroom at 586 nonblank, `CollectionOrder` 209 at 591, `RuntimeState` 252 at 548, and `RuntimeStateIdentityBound` 708 at 92.

Excluded: any reduction programme premised on the conformance theorem population being one replicated template, which the baseline refutes for the per-file fixtures. Excluded and explicitly unresolved: the cross-file shared-fixture duplicates described above, which are real and would need their own measurement and owner. Excluded: consolidating the `applyStimulus` cluster, whose 89 members are distinct per-scenario results. Excluded: changing the `getD 0` activation-counter sites, whose default is the intended meaning. Excluded: the two observations recorded above, until their mechanisms are designed. Excluded: any change to a semantic account, profile, admission capability, or public observation.

## Temporal hosting and refinement preflight

Not applicable, and stated rather than omitted. [CLAUDE.md](../CLAUDE.md#non-negotiable-boundaries) requires a Temporal hosting and refinement preflight before implementing a new semantic transition family. This proposal introduces no transition family, no runtime state field, no wire contract, and no public projection. `LAS-DEFAULT-01` may add hypotheses to existing lowering accessors, which changes no hosted behaviour because lowering runs before Workflow start. If implementation finds that closing `LAS-DEFAULT-01` requires changing what an accessor returns rather than what it assumes, that is a different change and returns here for a preflight before proceeding.

## Evidence and stage boundary

Each rule closes against its own executable guard rather than against a reading of the source: `LAS-CITE-01` against a reachability guard over Lean declarations and `docs/`, which is achievable in `test:infrastructure` because it reads source text rather than Lean output; `LAS-DEFAULT-01` against the checked unreachability results, whose Lean side closes under `./scripts/lake.sh build` for the narrow modules it touches, with a companion guard in `test:infrastructure` listing every remaining absorbing default with its classification.

The two rules are independent and may land separately. Recommended order, with the reason the position is chosen rather than the alternative: `LAS-DEFAULT-01` first, because it is the only rule here where a wrong answer is currently reachable rather than merely unverified, and because closing it through the accessor-argument option would change the type of `lowerCheckedProcess`, which 33 modules consume; `LAS-CITE-01` second, because its triage is bounded and independent of that signature question. The optional extraction has no position and may be taken whenever convenient.

## Same-change owners and reopen conditions

Implementing either rule updates [TESTING-SPEC.md](TESTING-SPEC.md#evidence-lanes) with the new guard, [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) with exact implemented and absent scope, and [PLAN.md](PLAN.md) with the resume point. `LAS-CITE-01` removals additionally touch the owning capsule under [docs/capsules](capsules/README.md) wherever a law gains its evidence row.

Reopen if `LAS-DEFAULT-01` finds a default that is genuinely reachable rather than merely unproved, if `LAS-CITE-01` triage shows the uncited `*Laws.lean` theorems state propositions no capsule intends to claim, since that is a capsule-scope question rather than a hygiene one, or if either recorded observation acquires a designed mechanism and a gate that can run it.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `833520c514ea3606de469343f266cbd937ac137e` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
