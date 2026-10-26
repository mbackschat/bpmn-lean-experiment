module

public import BpmnSemantics.SemanticProcess.ParallelScopeCommandFuelProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeCollectionStorageProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeReachableCapacityProofs
public import BpmnSemantics.SemanticProcess.SequentialMultiInstanceLaws
public import BpmnSemantics.SequentialMultiInstanceProgressConformance
public import BpmnSemantics.RegionalRemovalOwnerCoverageConformance
public import BpmnSemantics.CompensationTriggerHandlerCompletionConformance
public import BpmnSemantics.InclusiveGatewayConformance
public import BpmnSemantics.SemanticProcess.CyclicControlFlowConformance
public import BpmnSemantics.SemanticProcessAdmissionConformance
public import BpmnSemantics.TerminateEndEventConformance
public import BpmnSemantics.SemanticProcess.ErrorPropagation
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all Init.Data.List.Control
import all Init.Data.String.Basic
import all Init.Data.String.Bootstrap
import all Init.Data.String.Decode
import all Init.Data.String.Defs
import all Init.Data.String.Extra
import all Init.Data.String.FindPos
import all Init.Data.String.Hashable
import all Init.Data.String.Iter
import all Init.Data.String.Iter.Basic
import all Init.Data.String.Iter.Intercalate
import all Init.Data.String.Iterate
import all Init.Data.String.Iterator
import all Init.Data.String.Legacy
import all Init.Data.String.Length
import all Init.Data.String.Modify
import all Init.Data.String.OrderInstances
import all Init.Data.String.Pattern
import all Init.Data.String.Pattern.Basic
import all Init.Data.String.Pattern.Char
import all Init.Data.String.Pattern.Pred
import all Init.Data.String.Pattern.String
import all Init.Data.String.PosRaw
import all Init.Data.String.Search
import all Init.Data.String.Slice
import all Init.Data.String.Stream
import all Init.Data.String.Subslice
import all Init.Data.String.Substring
import all Init.Data.String.TakeDrop
import all Init.Data.String.Termination
import all Init.Data.String.ToSlice
import all Lean.Data.Json.Basic
import all Lean.Data.Json.Elab
import all Lean.Data.Json.FromToJson
import all Lean.Data.Json.FromToJson.Basic
import all Lean.Data.Json.FromToJson.Extra
import all Lean.Data.Json.Parser
import all Lean.Data.Json.Printer
import all Lean.Data.Json.Stream
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.InternalRegionalActivityRemoval
import BpmnSemantics.SemanticProcess.InternalRegionalRemovalAgreement

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

@[expose] public section

/-- info: 'BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_program_valid' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_program_valid

/-- info: 'BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_projectable' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_projectable

/-- info: 'BpmnSemantics.SemanticProcess.ParallelScopeInternalPrefixReachable.collection_storage' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.ParallelScopeInternalPrefixReachable.collection_storage

/-- info: 'BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.collection_storage' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.collection_storage

/-- info: 'BpmnSemantics.SemanticProcess.ParallelScopeInternalPrefixReachable.running_capacity' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.ParallelScopeInternalPrefixReachable.running_capacity

/-- info: 'BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.running_capacity' depends on axioms: [propext, Classical.choice, Quot.sound] -/
#guard_msgs (whitespace := lax) in
#print axioms BpmnSemantics.SemanticProcess.ParallelScopeCommandBoundaryReachable.running_capacity

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
