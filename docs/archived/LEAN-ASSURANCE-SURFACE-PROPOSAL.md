# Lean assurance-surface proposal

## Status

Lifecycle: archived
Review: approved-with-required-edits

Retired unimplemented. The volume question this document was written to answer is answered, and that measurement is why it is archived rather than deleted. Neither surviving rule was built: `LAS-CITE-01` because a standing citation guard risks manufacturing citations rather than evidence, and `LAS-DEFAULT-01` because costing it showed the condition field is part of the Semantic Process IL contract, so removing the default is a cross-language change rather than the small one its rationale assumed. The one finding that was acted on came from reading the theorems `LAS-CITE-01` would have triaged, not from the rule: sequential Multi-Instance was maintaining an invariant it had only ever assumed, and that is now proved and recorded in its own capsule. A later per-module cost measurement, recorded below, refuted the skew prediction that would have driven a deletion pass and refuted its redundancy premise as well, leaving a headroom problem in its place; that section also corrects a verification result reported green in session that had in fact failed.

## Question and current boundary

The owner asked whether the Lean development is over-engineered relative to its delivered assurance, and whether it is inflating with needless theorems. This proposal answers that question from measurement rather than impression, and owns the corrections the measurement justifies. It changes no BPMN meaning, no semantic profile, no CIB relationship, no checked-source or [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md) representation, and no public observation. It does change the proof boundary, which is why it is material for [the independent cold-review gate](../TESTING-SPEC.md#independent-cold-review-gate).

The volume question is answered negatively, and the answer is reported with its limits rather than as a blanket result. Across the 792 theorems in the 51 `*Conformance.lean` files, the proved statements begin with 280 distinct leading symbols and 186 of those symbols appear exactly once. Those figures are approximate. They come from bucketing each statement by the first identifier token between the declaration colon and `:=` or `by`, and an independent re-derivation using a different tokenizer for the same description returns values a few percent higher. The shape of the distribution, which is what the conclusion rests on, is unaffected by the choice. The largest cluster is `applyStimulus` at 89, which is the semantic transition operation itself, so those are per-scenario step results rather than restatements of one fact. Two consolidation hypotheses were tested and failed outright: the `*_is_rejected` and `*_is_admitted` families are quantified with real hypotheses rather than per-fixture decided facts, and `CyclicControlFlowConformance.lean`'s 46 concrete theorems are 46 distinct propositions about cut behaviour, cycle containment, saturation certification, lowering preservation and per-activation choice.

The third hypothesis failed only partly, and the partial result is retained because it bounds the claim above. A statement-level duplicate scan reports on the order of 73 to 80 excess restatements depending on the extraction rule. For the conformance files that define their own local `checkedProcess` and `program`, textually identical statements are genuinely different propositions and the scan is a false positive. For fixtures shared across files it is not: `cyclicProgram` is defined exactly once, at [`CyclicControlFlowFixtures.lean:107`](../../BpmnSemantics/SemanticProcess/CyclicControlFlowFixtures.lean#L107), and one identical lookup statement about it is proved in four separate conformance modules. Those four are one proposition proved four times. The cross-file shared-fixture duplicates are therefore a real and unquantified residue, excluded from this proposal's scope rather than dismissed.

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

## Later per-module measurement, and what it refuted

The baseline above counts the corpus. It does not price it, and the difference turned out to matter. A follow-up measurement priced every conformance module individually at commit `d878f38e`, using the memory-bounded method in [the contributor setup guide](../CONTRIBUTOR-SETUP-GUIDE.md#memory-bounded-lean-measurements) and the same audit image as the ledger row above: image `sha256:4df22c7a1ec8`, Lean `4.31.0` commit `68218e876d2a38b1985b8590fff244a83c321783`, `LEAN_NUM_THREADS=1`, `--cpus=1`, `--memory=3g`, `--memory-swap=3g`, a warm dependency closure with only the measured target's own artifacts removed. All 51 engine-tree conformance modules exited 0. Total cold-target rebuild time was 637 seconds.

| Peak resident memory across 51 modules | MiB |
|---|---|
| Minimum | 489 |
| First quartile | 989 |
| Median | 1,881 |
| Third quartile | 2,436 |
| Maximum (`MessageStartConformance`) | 3,335 |

**The measurement refutes the prediction that motivated it.** The expectation was a severely skewed distribution in which a short expensive tail carried the cost and only that tail was worth reading. There is no such tail. The median module costs 1.9 GB, 14 of 51 sit above 75% of the bound, 8 above 90%, and the five most expensive account for 25% of rebuild time, close to their share by count.

Cost is also decoupled from theorem count, which removes the other half of any count-driven triage. `MessageStartConformance` is 30 theorems at 3,335 MiB and 28 s; `CyclicControlFlowConformance` is 62 theorems at 1,909 MiB and 9 s. `SemanticProcessJsonConformance`, which owns 18 of the corpus's 20 `native_decide` sites, is the cheapest module measured at 644 MiB and under a second, so those sites are the corpus's cheap lane rather than its expensive one. `RuntimeStateWellFormedConformance` completes at 2,991 MiB where it previously exited 137, so the owner split recorded in [the cost ledger](../CAPSULE-COST-LEDGER.md) achieved what it was for.

**An independent lane refuted the central premise of the deletion argument.** The argument assumed that a conformance fixture restating a registered scenario's outcome is redundant with the differential harness, which would cover the same fact at no kernel cost. It does not. The harness is answer-free for 32 of its 57 cases by explicit design, and for every non-CIB case the reference target is Lean itself, so it establishes agreement rather than correctness and pins no absolute proposition a theorem could duplicate. Its compared object is narrower still: `{outcome, trace}` over the public projection, never internal state, ambiguity signalling, or closure step bounds. Exactly one theorem of 792 is genuinely covered, `IntermediateCatchTimerConformance.exact_deadline_scenario_trace_is_exact`, and only because retained CIB evidence supplies an external answer for that scenario. Only 19 of 51 modules embed a registered scenario's hash at all; 448 of 661 kernel sites live in modules bound to no registered model.

A second lane classified all 816 declarations across the 53 files matching `*Conformance.lean`, of which 792 are in the engine tree and 24 in the two files under `adoption/`. The largest category is not concrete fixture outcomes but negative witnesses, at 286, against 284 concrete results, 211 structural facts, and 35 decoder locks. Negative witnesses, structural facts, and decoder locks were never removal candidates, so 65% of the corpus was outside the argument before it began.

**What the measurement does establish is a headroom problem rather than a waste problem.** Eight modules sit within 10% of the 3 GiB bound and three report above it, cost tracks the size of the state being reduced rather than the number of theorems, and the corpus grows with every capsule. The next capsule adding two fixtures to a near-cap module is the next `exit 137`. That argues for recording per-module cost and ratcheting it, and against an audit-and-delete pass whose candidate set the measurement showed to be one theorem.

One caveat is not resolved. Three modules report `ru_maxrss` above the cgroup ceiling without being killed. Docker Desktop on macOS runs a Linux virtual machine, and GNU `time`'s resident-set accounting does not align exactly with cgroup charging because file-backed pages are reclaimable. The 51 figures are comparable with each other; comparing their absolute values against the `exit 137` row in the cost ledger is approximate, and settling it requires a Linux host with native cgroups.

## Selected rules

`LAS-CITE-01`: every named `theorem` outside the `*Conformance.lean` files is reachable either from another Lean declaration or from an owning project document. A theorem reachable from neither is removed, or is given the evidence row that makes it reachable.

`LAS-DEFAULT-01`: every absorbing lookup default whose default value is not the intended semantics of an absent key carries a checked unreachability result under explicitly stated admission or well-formedness hypotheses, or its accessor takes that evidence as an argument.

## Why each rule is necessary

**`LAS-CITE-01`.** 150 of the 708 theorems outside the conformance files are reachable from no other Lean declaration and are cited by no document under `docs/`. They divide into 20 under `Experiments/`, 24 in `*Laws.lean` files, and 106 elsewhere. The `*Laws.lean` group is the sharp case and the reason this is a rule rather than a cleanup: `SequentialMultiInstanceLaws.lean` holds 13 and `ParallelMultiInstanceLaws.lean` holds 10. `two_distinct_all_policy_slot_completions_commute` is a member and shows the shape of the problem, because a commutation law for two slot completions under the all-policy is a material semantic claim rather than a helper. [CLAUDE.md](../../CLAUDE.md#semantic-code) requires every material semantic rule to carry a stable capsule-owned identifier and a rule-to-evidence row, so a named law that no capsule cites is not merely unused code; it is a law whose evidence chain does not close. Triage under this rule therefore has two outcomes and the distinction matters: a law that should be cited gains its row, and a law that nothing needs is removed.

**`LAS-DEFAULT-01`.** The tree holds 90 `getD` occurrences, counted as bare tokens across `BpmnSemantics/`, and each reads through an absorbing default. For the activation counters this is the intended total semantics, where an element never armed reads as ordinal zero, and those sites are outside this rule. Three classes are not: [`Lowering.lean:159`](../../BpmnSemantics/SemanticProcess/Lowering.lean#L159) and [`:351`](../../BpmnSemantics/SemanticProcess/Lowering.lean#L351) turn an unparseable condition expression into `.literal false`; [`Lowering.lean:61`](../../BpmnSemantics/SemanticProcess/Lowering.lean#L61), [`:139`](../../BpmnSemantics/SemanticProcess/Lowering.lean#L139) and [`:183`](../../BpmnSemantics/SemanticProcess/Lowering.lean#L183) produce an empty-string place identifier; and [`CheckedGraphValidation.lean:49`](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean#L49) falls back to the source identifier on a failed resolution.

The condition case is the one that decides the rule, and it has two admission owners rather than one. [`CheckedProcessAdmission.lean:117`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean#L117) requires `(parseSimpleBooleanExpression condition.body).isSome` for the Exclusive Gateway flow conditions reached through `checkedExclusiveGatewayValid`, while the parallel Multi-Instance `completionCondition` at `Lowering.lean:351` is admitted separately by [`ParallelMultiInstanceProfileAdmission.lean`](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceProfileAdmission.lean), whose `exactParallelCheckedNode` requires one exact condition body. So an admitted process cannot reach either default. But `checkedConditionValid` returns `Bool`, `lowerConditionalCandidate` takes a bare `CheckedProcess` with no admission hypothesis in its type, `lowerCheckedProcess` is called directly from conformance and fixture modules, and no theorem was found connecting any of this. The guarantee is real and rests entirely on call discipline. That is the same class as [the admission-blocking parser rule](../../CLAUDE.md#semantic-code), inverted: a silent `false` for an expression the profile refuses to admit changes routing to the default flow with no error anywhere. The rule requires the connection to be checked, and expects the result to be more than one theorem, because the classes have different hypotheses in different owners and one of them may prove to have a genuinely reachable default.

## Observations whose rules are not yet designed

Two further gaps are recorded here with their evidence, and deliberately not proposed as rules, because the mechanism that would close each one is not yet designed well enough to review. Recording them without a rule is the point: each is a real observation whose first proposed mechanism did not survive scrutiny.

**Axiom-footprint content.** The repository proves 1,500 theorems with no `#print axioms` command anywhere. The site-level gap is already closed and was initially misattributed here: [`lean-source-contracts.test.ts`](../../scripts/lean-source-contracts.test.ts) ratchets `native_decide` against an exactly recorded 20-site set and fails on a twenty-first, inside `test:infrastructure`. What remains unverified is footprint *content* rather than site count, namely whether a `native_decide` axiom propagates through a shared lemma into a conformance claim. A count check between anchored commands and footprint output lines would not detect that, because propagation leaves the count unchanged. A content ratchet against an approved baseline would, but it needs an owner gate that can execute Lean: `test:infrastructure` is `tsc -p tsconfig.harness.json` plus `node --test scripts/*.test.ts` and observes no Lean output at all, while routing it through `./scripts/lake.sh` takes the repository-wide fail-closed lock and would convert the only complete gate that needs no host port into a Lean build. Whether a warm Lake cache re-emits the message lines such a guard would read is also unsettled. A rule here requires answering the gate question first.

**Per-fixture admission obligations.** Conformance files prove these obligations locally where they prove them at all: 30 of the 51 carry a theorem led by one of the six obligation predicates `checkedWellFormed`, `programWellFormed`, `definitionBindingValid`, `runtimeStateWellFormed`, `programProfileCapabilitiesValid` and `calledProcessAssociationsValid`, so the uncovered case is already actual rather than hypothetical. No guard requires the suite either: the `scripts/` tree contains no reference to any of those six predicates, so a conformance fixture added without its well-formedness theorem is covered by nothing and reads as covered. The family is between 49 and 110 theorems depending on the match rule, against a population of 1,500, so the saving is modest and the coverage gap is the motivation. Stating the obligations once over a registered fixture list would close it only if membership is derived mechanically, and no such registry exists: `registeredFixtures`, `allFixtures`, `fixtureList` and `List CheckedProcess` return zero hits across `BpmnSemantics/`, and `ConformanceMain.lean` imports 22 of the 51 conformance modules. A hand-written list would reproduce the defect it removes, so a rule here requires a mechanically derived registry that this proposal does not design.

## Required, optional, and excluded

Required: the two rules above, each with its executable guard.

Optional, and non-material under [the negative case](../TESTING-SPEC.md#independent-cold-review-gate): extracting the generic activation-lookup laws into a narrow module below `RuntimeStateIdentityBound` so the task activation family stops carrying its own copy. `RuntimeStateIdentityBound.lean:11-63` holds 51 nonblank lines restating a 33-line generic at `InternalArmingOrder.lean:504-540`, because `TaskActivation` keys on `TaskDefinitionId` while its three siblings key on `NodeId`. The reproof cannot be done in place: `InternalArmingOrder` transitively depends on `RuntimeStateIdentityBound` through `CollectionOrder` and `RuntimeStateWellFormed`, so the direct import is a cycle. This is behaviour-preserving hygiene with no deadline; against the 800-line target, `InternalArmingOrder` has 214 lines of headroom at 586 nonblank, `CollectionOrder` 209 at 591, `RuntimeState` 252 at 548, and `RuntimeStateIdentityBound` 708 at 92.

Excluded: any reduction programme premised on the conformance theorem population being one replicated template, which the baseline refutes for the per-file fixtures. Excluded and explicitly unresolved: the cross-file shared-fixture duplicates described above, which are real and would need their own measurement and owner. Excluded: consolidating the `applyStimulus` cluster, whose 89 members are distinct per-scenario results. Excluded: changing the `getD 0` activation-counter sites, whose default is the intended meaning. Excluded: the two observations recorded above, until their mechanisms are designed. Excluded: any change to a semantic account, profile, admission capability, or public observation.

## Temporal hosting and refinement preflight

Not applicable, and stated rather than omitted. [CLAUDE.md](../../CLAUDE.md#non-negotiable-boundaries) requires a Temporal hosting and refinement preflight before implementing a new semantic transition family. This proposal introduces no transition family, no runtime state field, no wire contract, and no public projection. `LAS-DEFAULT-01` may add hypotheses to existing lowering accessors, which changes no hosted behaviour because lowering runs before Workflow start. If implementation finds that closing `LAS-DEFAULT-01` requires changing what an accessor returns rather than what it assumes, that is a different change and returns here for a preflight before proceeding.

## Evidence and stage boundary

Each rule closes against its own executable guard rather than against a reading of the source: `LAS-CITE-01` against a reachability guard over Lean declarations and `docs/`, which is achievable in `test:infrastructure` because it reads source text rather than Lean output; `LAS-DEFAULT-01` against the checked unreachability results, whose Lean side closes under `./scripts/lake.sh build` for the narrow modules it touches, with a companion guard in `test:infrastructure` listing every remaining absorbing default with its classification.

The two rules are independent and may land separately. Recommended order, with the reason the position is chosen rather than the alternative: `LAS-DEFAULT-01` first, because it is the only rule here where a wrong answer is currently reachable rather than merely unverified, and because closing it through the accessor-argument option would change the type of `lowerCheckedProcess`, which 32 modules consume; `LAS-CITE-01` second, because its triage is bounded and independent of that signature question. The optional extraction has no position and may be taken whenever convenient.

## Same-change owners and reopen conditions

Implementing either rule updates [TESTING-SPEC.md](../TESTING-SPEC.md#evidence-lanes) with the new guard, [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) with exact implemented and absent scope, and [PLAN.md](../PLAN.md) with the resume point. `LAS-CITE-01` removals additionally touch the owning capsule under [docs/capsules](../capsules/README.md) wherever a law gains its evidence row.

Reopen if `LAS-DEFAULT-01` finds a default that is genuinely reachable rather than merely unproved, if `LAS-CITE-01` triage shows the uncited `*Laws.lean` theorems state propositions no capsule intends to claim, since that is a capsule-scope question rather than a hygiene one, or if either recorded observation acquires a designed mechanism and a gate that can run it.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `833520c514ea3606de469343f266cbd937ac137e` | `fork-turns-none` | `approve-with-required-edits` | `7180e2bc7ccde605c20e2b520db45aa29b0cef24, 3141878a7d8a459b62529221a8eacd6369d93da6` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
