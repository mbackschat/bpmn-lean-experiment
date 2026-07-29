# Checked-source relation experiment

**Status:** Stage 1 completed; Stage 2 retained graph validation; Stage 2b closed declarative tail decomposition; Stage 2c closed whole-process graph coverage at 229 new nonblank lines; Stage 2d closed saturation-certified path completeness and declarative acyclicity at 125 new or materially rewritten nonblank lines; Stage 3 remains unapproved pending independent review; full preservation remains unresolved and not adopted

**Question:** Can a direct token-game account over `CheckedProcess` support a run-level observational lowering-preservation theorem for the current five Semantic Process operations without reusing lowering or IL execution as source semantics?

**Claim boundary:** The source relation is a second transcription of the reviewed capsule account and can lock lowering correspondence. It is not an independent BPMN authority. Normative/profile review and CIB evidence remain responsible for validating the selected account.

The production proof boundary remains recorded in the [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md). The provisional direct account, bounded correspondence checkpoint, and countermodel remain solely in the separately gated experiments lane.

## Competing accounts

1. **Direct checked-source token game:** define transitions over checked BPMN nodes, tokens on Sequence Flow identities, active User Task occurrences, and per-incoming-Sequence-Flow join readiness. Relate its projected observations to execution of the lowered Semantic Process program after every supported stimulus.
2. **Program-derived source account:** define source behavior by lowering or by invoking IL operations or the IL evaluator. This is rejected as circular because the supposed source side assumes the translation being checked.
3. **Permanent proof boundary:** retain exact artifact equality and structural lowering theorems while explicitly declining observational preservation. The owner rejected this account because the induction skeleton becomes substantially more expensive after timers and Activities and the IL architecture depends on checked lowering rather than fixture exercise alone.

## Scope and exclusions

The experiment covers only the currently admitted none Start Event, User Task, diverging Parallel Gateway, converging Parallel Gateway, and none End Event slice. Source transitions use BPMN vocabulary and no `lowerCheckedProcess`, Semantic Process operation, or IL evaluator. The target-side correspondence proof may name lowering and target execution.

The theorem compares public observations after each supported stimulus. It does not require identical source and target runtime states, validate the selected BPMN account independently, prove the XML parser, add a dependency, change a wire contract, or introduce timers, Activities, or additional BPMN elements.

Before Stage 2, `programWellFormed` omitted independent reachability, acyclicity, and producer/consumer-shape checks. The retained graph-validation half of Stage 2 now establishes those executable program checks without widening source admission or changing semantic execution.

## Separating witness

The deliberately wrong lowering pairs User Tasks positionally with sorted task input and output flow lists instead of selecting flows by their checked source and target endpoints. A flow-only permutation is observationally symmetric in the admitted balanced topology, so it cannot separate the accounts at the approved public boundary. The retained mutation therefore models the complete positional-record error: it also reads User Task metadata through the wrongly paired input Flow target.

All six retained sequential and parallel scenario locks remain green under this mutation because their identifier orders happen to align. The admitted renamed graph orders `Task_A` before `Task_Z` while its input Flow identifiers order the Flow to Z before the Flow to A. The direct source account projects `Task_A/Alpha` and `Task_Z/Zulu`; positional lowering swaps the names through the wrong Flow targets. Both accounts execute the renamed graph and produce different public observations.

The retained experiment gate keeps both the green fixture controls and renamed executable divergence. The production preservation theorem was not reached before the effort stop, so no theorem-failure build is claimed.

The renamed endpoint-agreement check is also a finite regression guard for the exact fixture-coincidental defect class: if production lowering drifts from endpoint matching toward positional pairing, the focused gate fails on the adversarial counter-model. This is concrete coverage of one preservation instance, not the unproved universally quantified theorem.

## Executed direct account

[CheckedSourceSemantics.lean](../../BpmnSemantics/Experiments/CheckedSourceSemantics.lean) is now an import-only façade over responsibility-specific [state](../../BpmnSemantics/Experiments/CheckedSourceState.lean), [transition](../../BpmnSemantics/Experiments/CheckedSourceTransition.lean), and [scenario](../../BpmnSemantics/Experiments/CheckedSourceScenario.lean) modules. They define a separate source control state, Sequence-Flow token multiset, source User Task waits, per-task activation state, and direct checked-node transition relation for none Start Event, User Task, diverging and converging Parallel Gateway, and none End Event. `fireNode_sound` proves every executable source-node transition is permitted by that relation. Source admission, supported closure, canonical observation, and scenario execution remain independent of Semantic Process lowering and execution.

[CheckedSourceCorrespondence.lean](../../BpmnSemantics/Experiments/CheckedSourceCorrespondence.lean) is the Stage 1 target-side bridge. It proves that adding the exact production `operation:` prefix preserves and reflects String order, maps direct source state into the production runtime representation, and checks exact enabled-operation identifiers and successor states at the four automatic boundaries of a two-User-Task serial chain. The target list is reconstructed from the production `fire?` operation evaluator because production `enabledTransitions` remains private; Stage 1 neither changes that visibility nor claims closure correspondence.

[CheckedSourceRelation.lean](../../BpmnSemantics/Experiments/CheckedSourceRelation.lean) contains only the deliberately wrong lowerer, retained-fixture controls, admitted renamed graph, and public divergence check. [CheckedSourceRelationMain.lean](../../BpmnSemantics/Experiments/CheckedSourceRelationMain.lean) is the focused executable gate for both the Stage 1 correspondence checkpoint and the retained positional-lowering discriminator.

[GraphValidation.lean](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) owns finite-fuel breadth-first reachability and co-reachability, saturation-certified cycle checks, and operation-graph construction. [GraphReachabilityLaws.lean](../../BpmnSemantics/SemanticProcess/GraphReachabilityLaws.lean) relates executable search to declarative paths, proves that a certified closed reached set contains every declaratively reachable node, and derives cycle exclusion and reachability antisymmetry. The standalone program validator now requires every control place to have exactly one producer and one consumer, every operation to be reachable from the single initiation operation and able to reach a termination operation, and the finite operation graph to pass the saturation-certified acyclicity check. A disconnected but formerly accepted User Task island is the retained graph-shape discriminator; a fuel-one three-node cycle separates the old negative bounded search from the certified check.

[CheckedSourceAdmission.lean](../../BpmnSemantics/Experiments/CheckedSourceAdmission.lean) owns the provisional Stage 2 source graph checks and executable decomposition probe. The decider checks unique node and Flow identities, exact references and node arities, executable finite reachability/co-reachability/acyclicity predicates, deterministic serial-wait or balanced-two-User-Task parsing, at least one segment, complete node coverage, exact `PT1S` and payload-free probe surfaces, and global one-Timer/one-Service-Task bounds. Kernel-checked witnesses accept a two-User-Task serial chain and the balanced parallel fixture while rejecting `PT5M`, mapped or arbitrarily bound Service Tasks, a Service Task with a boundary route, Start-to-End, a disconnected cycle, a second Timer, and the disconnected program.

## Red/green evidence

The first focused build failed because `BpmnSemantics.Experiments.CheckedSourceRelation` did not exist. After the provisional source account and discriminator were added:

```sh
lake build checkCheckedSourceRelationExperiment
lake exe checkCheckedSourceRelationExperiment
```

Both commands passed, and the executable reported `Checked-source relation experiment checks passed.` The gate comprises approximately 700 lines across the source account, witness, and main. It requires all six retained fixtures to survive the mutation, the direct source account to agree with correct endpoint-based lowering on the renamed graph, and the same source result to disagree with positional lowering.

The 2026-07-28 Stage 1 red build first failed because the new correspondence module was absent. The responsibility split then exposed a stale Service Task constructor pattern in this separately gated lane; it was corrected to the current checked-source shape without adding Service Task semantics. The green gate proves the general constant-prefix ordering lemma and the bounded four-state selector correspondence. The responsibility split leaves every hand-written module below 300 nonblank lines. The new or materially rewritten Lean proof surface is below the approved 250-line ceiling; moved definitions are not counted as new proof surface.

The 2026-07-29 Stage 2 red build proved that the old standalone `programWellFormed` accepted a disconnected User Task island whose control places had no producer or consumer path from initiation. The root fix added reusable finite graph checks and connected them to program validation, then added the executable structured-source probe and positive/negative witnesses including a direct two-node finite-cycle check. Independent review confirmed the graph predicates and program integration, but rejected the decomposition proof surface: `StructuredChain` was inhabited for every list, the claimed soundness theorem only repackaged the parser's own checks, and the claimed uniqueness theorem was `Option.some` injectivity for one deterministic function call. It also demonstrated that permuting parallel Sequence Flows exchanges the parser's left/right task fields.

The vacuous derivation and the two overclaimed theorems were removed. The four escaped grammar surfaces now reject explicitly, and the structural witnesses use kernel `decide` instead of `native_decide`. The retained graph/probe work remains within the approved 500-line ceiling and source hygiene remains exception-free.

## Precise unresolved boundary

The earlier attempted correspondence layer defined the source-to-program runtime mapping, proved injectivity of the `place:` Sequence-Flow encoding, and proved mapping lemmas for token removal and production. At that point the experiment had exceeded the agreed approximate 700-line boundary without reaching the run theorem.

Stage 2b closes the earlier tail-decomposition boundary with a declarative `SegmentAt source entry segment exit` relation, inductive `ChainFrom source entry segments finish` relation, executable-tail-parser soundness, and genuine graph-derived uniqueness stated through an equivalence that permits exchange of a parallel pair's branches. The executable reachability result is sound with respect to an inductive edge-path relation.

Stage 2c closes the whole-process wrapper boundary. Private lemmas eliminate the parser accumulator and compose parser success with the graph-derived relation. The exported `WholeProcessDecompositionFacts` proposition contains the finite graph/profile facts, unique Start and End nodes, an existential initial Flow followed by a nonempty `ChainFrom`, complete distinct node coverage, complete Sequence Flow coverage, and unique Flow-source ownership; no parser function, `ParsedTail`, or `.visited` occurs in that proposition. A separate theorem compares the parsed chain with any independently supplied graph-derived chain up to parallel branch exchange. The proof module contains 229 new nonblank lines against the committed `d025e3d` baseline and the experiment is split into five responsibility-specific modules.

Stage 2d closes the admission-soundness half of the bounded-search boundary. Each return-path search carries a checked saturation certificate stating that every edge out of the reached set remains inside it. `reachedSet_complete` proves by induction on declarative `GraphReaches` that the certified set contains every reachable node; `acyclicClosed_sound` excludes a declarative return path for every accepted edge; and `graphReaches_antisymm` makes the resulting acyclicity reusable. At fuel one, the retained three-node cycle is accepted by the old negative bounded predicate and rejected by the saturation-certified predicate; both predicates reject it at vertex-count fuel three, so the witness distinguishes predicates rather than reporting a production fixture defect. The six existing conformance programs and the positional-lowering countermodel remain explicitly accepted. Against commit `034b531`, the Lean diff adds 179 nonblank lines; 54 of those are the materially unchanged positive-soundness declarations moved from executable graph validation to the new law module, leaving 125 new or materially rewritten nonblank lines under the stage ceiling.

The remaining proof was not a single mechanical induction. It still required:

- extracting nonempty incoming/outgoing Flow facts for every checked node from the private bounded well-formedness conjunction so the source Flow default and IL control-place default could be related only on admitted graphs;
- relating source wait lookup/erase and activation-count updates to the mapped IL runtime;
- generalizing the Stage 1 two-segment enabled-transition check to every state admitted by the structured derivation, including wait-family mappings and parallel choices;
- proving that the two independent User Task choices and recursive `closeSupported` results correspond at every fuel value;
- relating external admission, stable observation projection, and rejected-command state preservation;
- performing the final stimulus-list induction over projected observations.

Completing that bridge would exceed the authorized effort boundary or require restructuring proof-facing production internals. No production semantic function, observation projection, wire contract, or visibility boundary was changed. The partial correspondence code was removed rather than retained as an apparent proof.

## Stop conditions

- Stop if correspondence requires a semantic change to `closeSupported`, `enabledTransitions`, observation projection, or any wire contract.
- Stop and record the precise unresolved induction boundary if the implementation exceeds approximately 700 lines of Lean or requires restructuring beyond the current slice.
- Do not weaken the witness. If the positional mutation does not leave every retained fixture lock green, find a genuine fixture-coincidental mutation within the current admission boundary or report that the class is empty.

## Result

**Stages 1 through 2d completed their bounded obligations; full account not adopted.** The direct source account and fixture-coincidental witness remain provisional in `BpmnSemantics/Experiments/`. Ordering, the two-segment selector checkpoint, graph infrastructure, executable grammar probe, standalone program graph validation, declarative tail and whole-process decomposition, branch-exchange uniqueness, complete node/Flow coverage, positive reachability soundness, saturation-certified path completeness, and declarative acyclicity are retained. Vertex-count fuel adequacy, direct Timer/effect clauses, closure-selector soundness, the four-step closure theorem, generalized correspondence, and the run-level observational lowering-preservation theorem remain unproved.

The program-derived account remains rejected as circular. The permanent-proof-boundary account also remains rejected by owner decision; this experiment records an unresolved implementation boundary rather than silently selecting that alternative.

## Frozen experiment policy

The owner reopened the experiment on 2026-07-28 for Stage 1 and approved Stage 2 on 2026-07-29 under its 500-line ceiling. Independent review triggered the decomposition stop while accepting graph validation. The owner then approved Stage 2b under 250 lines; it stopped before fuel-complete reachability and independent review accepted the retained result. The owner approved Stage 2c under a separately anchored 230-line ceiling and Stage 2d under 150 lines on 2026-07-29. Stage 2c completed at 229 new nonblank lines. Stage 2d completed at 125 new or materially rewritten nonblank lines with saturation-certified completeness, the fuel-one three-cycle discriminator, and all seven accepted program witnesses retained. Vertex-count fuel adequacy is deferred to optional Stage 2e as a no-false-rejection theorem. Stage 3, direct Timer/effect source semantics, and production source-admission widening remain unauthorized pending independent review.

Reopen the experiment only when:

1. admission is proposed beyond the two fixture-pinned topologies, in which case the observational preservation theorem must close before widened admission ships;
2. a fixture-coincidental lowering defect surfaces outside the retained positional-pairing guard;
3. a future capsule independently requires source-level operational semantics.

The effort stop is the approved outcome doing its job, not a failed experiment. A new proof round requires one of these triggers and a new explicit effort decision.
