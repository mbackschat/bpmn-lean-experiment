import BpmnSemantics.SemanticProcess.ParallelScopeCommandFuelProofs
import BpmnSemantics.SemanticProcess.SequentialMultiInstanceLaws
import BpmnSemantics.SequentialMultiInstanceProgressConformance
import BpmnSemantics.RegionalRemovalOwnerCoverageConformance
import BpmnSemantics.CompensationTriggerHandlerCompletionConformance
import BpmnSemantics.InclusiveGatewayConformance
import BpmnSemantics.SemanticProcess.CyclicControlFlowConformance
import BpmnSemantics.SemanticProcessAdmissionConformance
import BpmnSemantics.TerminateEndEventConformance
import BpmnSemantics.SemanticProcess.ErrorPropagation

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

/-- info: 'BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_projectable' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_projectable

/-- info: 'BpmnSemantics.SemanticProcess.finite_snapshot_conditional_progress_eventually_closes' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.finite_snapshot_conditional_progress_eventually_closes

/-- info: 'BpmnSemantics.SequentialMultiInstanceProgressConformance.entered_state_discharges_the_relativized_progress_hypothesis' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SequentialMultiInstanceProgressConformance.entered_state_discharges_the_relativized_progress_hypothesis

/-- info: 'BpmnSemantics.SemanticProcess.cancelScopeSubtree_event_subprocess_subscriptions_eq_prepared_region' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.cancelScopeSubtree_event_subprocess_subscriptions_eq_prepared_region
/-- info: 'BpmnSemantics.SemanticProcess.cancelScopeSubtree_scope_variables_eq_prepared_region' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.cancelScopeSubtree_scope_variables_eq_prepared_region
/-- info: 'BpmnSemantics.SemanticProcess.cancelScopeSubtree_process_interfaces_eq_prepared_region' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.cancelScopeSubtree_process_interfaces_eq_prepared_region
/-- info: 'BpmnSemantics.SemanticProcess.cancelScopeSubtree_scope_controllers_eq_prepared_region' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.cancelScopeSubtree_scope_controllers_eq_prepared_region
/-- info: 'BpmnSemantics.RegionalRemovalOwnerCoverageConformance.regional_removal_preserves_each_populated_outside_owner' depends on axioms: [propext] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.RegionalRemovalOwnerCoverageConformance.regional_removal_preserves_each_populated_outside_owner
/-- info: 'BpmnSemantics.RegionalRemovalOwnerCoverageConformance.called_instance_removal_preserves_each_populated_outside_owner' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.RegionalRemovalOwnerCoverageConformance.called_instance_removal_preserves_each_populated_outside_owner
/-- info: 'BpmnSemantics.RegionalRemovalOwnerCoverageConformance.actual_terminate_preserves_each_populated_outside_owner' depends on axioms: [propext] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.RegionalRemovalOwnerCoverageConformance.actual_terminate_preserves_each_populated_outside_owner
/-- info: 'BpmnSemantics.CompensationTriggerHandlerCompletionConformance.populated_completeFailure_preserves_listener_and_clears_its_listed_work' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.CompensationTriggerHandlerCompletionConformance.populated_completeFailure_preserves_listener_and_clears_its_listed_work
/-- info: 'BpmnSemantics.InclusiveGatewayConformance.inclusive_lowering_is_exact' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.InclusiveGatewayConformance.inclusive_lowering_is_exact
/-- info: 'BpmnSemantics.SemanticProcessConformance.sequential_lowering_is_exact' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcessConformance.sequential_lowering_is_exact
/-- info: 'BpmnSemantics.SemanticProcessConformance.parallel_lowering_is_exact' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcessConformance.parallel_lowering_is_exact
/-- info: 'BpmnSemantics.SemanticProcessConformance.timer_user_task_lowering_is_exact' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcessConformance.timer_user_task_lowering_is_exact
/-- info: 'BpmnSemantics.TerminateEndEventConformance.lowering_is_exact' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.TerminateEndEventConformance.lowering_is_exact
/-- info: 'BpmnSemantics.TerminateEndEventConformance.lowered_terminate_operation_is_exact' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.TerminateEndEventConformance.lowered_terminate_operation_is_exact
/-- info: 'BpmnSemantics.TerminateEndEventConformance.nested_termination_evaluator_and_relation' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.TerminateEndEventConformance.nested_termination_evaluator_and_relation
/-- info: 'BpmnSemantics.InclusiveGatewayConformance.exact_checked_definition_is_admitted' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.InclusiveGatewayConformance.exact_checked_definition_is_admitted
/-- info: 'BpmnSemantics.InclusiveGatewayConformance.lowering_derives_branch_local_join_inputs' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.InclusiveGatewayConformance.lowering_derives_branch_local_join_inputs
/-- info: 'BpmnSemantics.SemanticProcess.cyclic_merge_has_exact_canonical_checked_endpoints' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.cyclic_merge_has_exact_canonical_checked_endpoints
/-- info: 'BpmnSemantics.SemanticProcess.cyclic_choice_candidate_order_is_exact' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.cyclic_choice_candidate_order_is_exact
/-- info: 'BpmnSemantics.SemanticProcess.cyclic_user_task_cut_classification_is_preserved_by_lowering' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.cyclic_user_task_cut_classification_is_preserved_by_lowering
/-- info: 'BpmnSemantics.SemanticProcess.synthetic_throw_catches_and_cancels_region' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.synthetic_throw_catches_and_cancels_region
