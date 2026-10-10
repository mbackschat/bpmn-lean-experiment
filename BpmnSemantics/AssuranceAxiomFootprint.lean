import BpmnSemantics.SemanticProcess.ParallelScopeCommandFuelProofs
import BpmnSemantics.SemanticProcess.SequentialMultiInstanceLaws
import BpmnSemantics.SequentialMultiInstanceProgressConformance

/-! # Axiom footprint of the composed assurance guarantees

Each composed guarantee approved at a semantic checkpoint is pinned here to the standard kernel
axioms (`propext`, `Classical.choice`, `Quot.sound`). A proof that began to depend on `sorryAx`, a
project `axiom` or `Lean.ofReduceBool` (the `native_decide` axiom) changes the `#print axioms` output
and fails this build, which a warning-only `sorry` would not. Whitespace is compared laxly because
Lean wraps the axiom list at a fixed width. The source-level companion is the proof-escape guard in
`scripts/lean-proof-escapes.test.ts`; this module checks what the kernel actually relied on.

A later semantic checkpoint adds its own composed guarantees beside these. The module states no
semantics and imports only the owners of the theorems it pins.
-/

/-- info: 'BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_program_valid' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_program_valid

/-- info: 'BpmnSemantics.SemanticProcess.finite_snapshot_conditional_progress_eventually_closes' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.finite_snapshot_conditional_progress_eventually_closes

/-- info: 'BpmnSemantics.SequentialMultiInstanceProgressConformance.entered_state_discharges_the_relativized_progress_hypothesis' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SequentialMultiInstanceProgressConformance.entered_state_discharges_the_relativized_progress_hypothesis
