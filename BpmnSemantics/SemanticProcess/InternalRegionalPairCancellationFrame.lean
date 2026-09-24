import BpmnSemantics.SemanticProcess.InternalRegionalPairExecutionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairFootprintFrame

/-! Cancellation removes derived Activity, effect, and incident populations, so pair commutation needs their exact predecessor lists rather than only disjoint root IDs. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem cancellation_effect_filters (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (valid : runtimeStateWellFormed program hosting state = true)
    (running : state.control = .running hosting)
    (derived : deriveInternalOccurrenceRegion? state root = some region) :
    state.effectWaits.filter (fun wait => occurrenceInSubtree state.scopeOccurrences root wait.owner ||
        (calledInstanceClosure state root).contains wait.owner.processInstanceId) =
      state.effectWaits.filter (fun wait => region.contains wait.owner) ∧
    state.effectIncidents.filter (fun incident => occurrenceInSubtree state.scopeOccurrences root incident.wait.owner ||
        (calledInstanceClosure state root).contains incident.wait.owner.processInstanceId) =
      state.effectIncidents.filter (fun incident => region.contains incident.wait.owner) := by
  have position : runtimePositionValid program hosting state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have owners : waitOwnersLive state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.2.2.2.1
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  have mask (owner : ScopeOccurrenceId) (live : exactLiveOccurrence state owner = true) :
      (occurrenceInSubtree state.scopeOccurrences root owner ||
        (calledInstanceClosure state root).contains owner.processInstanceId) = region.contains owner := by
    obtain ⟨scope, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
    have member : scope ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) := by
      rw [singleton]; simp
    obtain ⟨member, identity⟩ := List.mem_filter.mp member
    exact (regional_cancellation_mask program state hosting hosting position running root region derived owner
      (List.mem_map.mpr ⟨scope, member, of_decide_eq_true identity⟩)).symm
  constructor
  · apply List.filter_congr
    intro wait member
    exact mask wait.owner (List.all_eq_true.mp owners.2.2.2.1 wait member)
  · apply List.filter_congr
    intro incident member
    exact mask incident.wait.owner (List.all_eq_true.mp owners.2.2.2.2.1 incident member)

/-- The evaluator's withdrawn populations retain their exact identity and list order.
Activity write conflicts protect handler-bearing records beyond directly owned work. -/
theorem regional_pair_cancellation_populations (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after)
    (_cancelling : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent)
    (retainedRoot : Option ScopeOccurrenceId := none) :
    withdrawnByRegion (fun owner => occurrenceInSubtree after.scopeOccurrences right.selection.root.id owner ||
        (calledInstanceClosure after right.selection.root.id).contains owner.processInstanceId) after.activityOccurrences retainedRoot =
      withdrawnByRegion (fun owner => occurrenceInSubtree before.scopeOccurrences right.selection.root.id owner ||
        (calledInstanceClosure before right.selection.root.id).contains owner.processInstanceId) before.activityOccurrences retainedRoot ∧
    after.effectWaits.filter (fun wait => occurrenceInSubtree after.scopeOccurrences right.selection.root.id wait.owner ||
        (calledInstanceClosure after right.selection.root.id).contains wait.owner.processInstanceId) =
      before.effectWaits.filter (fun wait => occurrenceInSubtree before.scopeOccurrences right.selection.root.id wait.owner ||
        (calledInstanceClosure before right.selection.root.id).contains wait.owner.processInstanceId) ∧
    after.effectIncidents.filter (fun incident => occurrenceInSubtree after.scopeOccurrences right.selection.root.id incident.wait.owner ||
        (calledInstanceClosure after right.selection.root.id).contains incident.wait.owner.processInstanceId) =
      before.effectIncidents.filter (fun incident => occurrenceInSubtree before.scopeOccurrences right.selection.root.id incident.wait.owner ||
        (calledInstanceClosure before right.selection.root.id).contains incident.wait.owner.processInstanceId) := by
  refine ⟨regional_pair_cancellation_activity_frame program before after hosting leftOperation rightOperation
    left right valid running leftFound rightFound independent applied retainedRoot, ?_⟩
  obtain ⟨actual, actualApplied, afterValid⟩ := preparedRegional_preserves_runtimeStateWellFormed program before hosting
    leftOperation left valid leftFound
  have same : actual = after := Option.some.inj (actualApplied.symm.trans applied)
  subst actual
  have afterRunning := (regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied).1.trans running
  have beforeDerived := (prepareInternalRegional_facts program before rightOperation right rightFound).2.2.2.2.1
  have afterDerived := prepareInternalRegional_region_after_independent_regional program before after hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent applied
  have beforeMasks := cancellation_effect_filters program before hosting right.selection.root.id right.region valid running beforeDerived
  have afterMasks := cancellation_effect_filters program after hosting right.selection.root.id right.region afterValid afterRunning afterDerived
  rw [afterMasks.1, beforeMasks.1, afterMasks.2, beforeMasks.2]
  exact regional_pair_effect_populations program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied


/-- Fully prepared cancellation has no selected Compensation trigger to withdraw.
The child case follows from the existing exact retained-trigger filter, rather than a
new assumption that all Compensation execution is globally empty. -/
theorem preparedRegional_cancellation_triggers_empty (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting state = true)
    (running : state.control = .running hosting)
    (found : prepareInternalRegional? program state operation = some prepared)
    (cancelling : prepared.selection.kind = .terminating ∨ ∃ parent, prepared.selection.kind = .interrupting parent) :
    (state.compensationTriggers.filter fun trigger =>
      occurrenceInSubtree state.scopeOccurrences prepared.selection.root.id trigger.owner ||
        (calledInstanceClosure state prepared.selection.root.id).contains trigger.owner.processInstanceId) = [] := by
  have components := valid
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at components
  obtain ⟨position, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, retention, _, execution⟩ := components
  obtain ⟨snapshots, declared, _, closed, _, _, _⟩ := prepareInternalRegional_facts program state operation prepared found
  have selected := (ownershipClosedSelection_facts program state operation prepared.selection closed).1
  have facts := regionalSelection_lifecycle_facts program state operation prepared.selection selected
  cases operation with
  | terminateScope id origin input definition =>
      have member : .terminateScope id origin input definition ∈ program.operations :=
        (List.mem_filter.mp (by rw [declared]; simp)).1
      have empty := (terminate_compensation_execution_empty program state id origin input definition member snapshots
        (Bool.and_eq_true_iff.mp retention).1 execution).1
      simp [empty]
  | throwError id origin input error handler =>
      obtain ⟨after, fired, _⟩ := prepareInternalRegional_executes program state _ prepared found
      have raw : throwErrorState? state input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨parent, _, parentEq, _⟩ := regionalSelection_error_execution program state after
        id origin input error handler prepared.selection selected raw
      have retained := (cancelScopeSubtree_child_compensation_fields program state hosting hosting prepared.selection.root
        .remove position running (regionalSelection_root_member program state _ prepared.selection selected)
        (by simp [parentEq]) execution).1
      change state.compensationTriggers.filter (fun trigger =>
        !(occurrenceInSubtree state.scopeOccurrences prepared.selection.root.id trigger.owner ||
          (calledInstanceClosure state prepared.selection.root.id).contains trigger.owner.processInstanceId)) =
        state.compensationTriggers at retained
      apply List.filter_eq_nil_iff.mpr
      intro trigger member removed
      have kept := List.filter_eq_self.mp retained trigger member
      simp only [removed, Bool.not_true, Bool.false_eq_true] at kept
  | returnProcess id origin process definition output =>
      cases kind : prepared.selection.kind <;> simp only [kind] at facts cancelling <;> simp_all
  | completeScope id origin definition output =>
      cases kind : prepared.selection.kind <;> simp only [kind] at facts cancelling <;> simp_all
  | _ => simp at facts

end BpmnSemantics.SemanticProcess.InternalCommutation
