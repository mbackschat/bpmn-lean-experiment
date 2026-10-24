module

public import BpmnSemantics.SemanticProcess.InternalRegionalSelection
public import BpmnSemantics.SemanticProcess.InternalRegionalLocalDataRetention
public import BpmnSemantics.SemanticProcess.InternalRegionalOwnerRetention

/-! # Ownership closure for selected regional operations

REG-OWN-CLOSE-01 derives reference masks from retained predecessor choices and compares them
with actual evaluator fields before deriving Activity and event-race reference preservation.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def regionalSelectionReferenceRetention (state : RuntimeState) (selected : InternalRegionalSelection) :
    RegionalReferenceRetention :=
  match selected.kind with
  | .returning record => callReferenceRetention state record
  | .completing .unbounded => ordinaryCompletionReferenceRetention selected.root
  | .completing (.bounded _ deadline) =>
      boundedCompletionReferenceRetention selected.root selected.root.id deadline
  | .completing (.monitored record deadline) =>
      monitoredCompletionReferenceRetention selected.root record deadline
  | .interrupting _ => cancellationReferenceRetention state selected.root.id .remove
  | .terminating => cancellationReferenceRetention state selected.root.id .retain

theorem scope_identity_of_census (state : RuntimeState) (owner : ScopeOccurrenceId)
    (root : RuntimeScopeOccurrence)
    (census : state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) = [root]) :
    root.id = owner := by
  have present : root ∈ state.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) := by
    rw [census]; simp
  exact of_decide_eq_true (List.mem_filter.mp present).2

/-- This selection stage enforces REG-OWN-CLOSE-01 before footprints and publication are built. -/
def selectInternalOwnershipClosedRegional? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option InternalRegionalSelection := do
  let selected ← selectInternalRegional? program state operation
  if regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) &&
      regionalRetainedLocalDataClosed state (regionalSelectionReferenceRetention state selected).activity
        (regionalSelectionLocalDataRetention state selected) &&
      regionalActivityOwnersClosed state (regionalSelectionReferenceRetention state selected) then
    some selected
  else none

theorem ownershipClosedSelection_refuses_stranded_reference (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state operation = some selected)
    (stranded : regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) = false) :
    selectInternalOwnershipClosedRegional? program state operation = none := by
  simp [selectInternalOwnershipClosedRegional?, found, stranded]

/-- Closed predecessors remain selectable; a blanket refusal does not satisfy ownership closure. -/
theorem ownershipClosedSelection_accepts_closed_references (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program state operation = some selected)
    (closed : regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) = true)
    (locals : regionalRetainedLocalDataClosed state (regionalSelectionReferenceRetention state selected).activity
      (regionalSelectionLocalDataRetention state selected) = true)
    (owners : regionalActivityOwnersClosed state (regionalSelectionReferenceRetention state selected) = true) :
    selectInternalOwnershipClosedRegional? program state operation = some selected := by
  simp [selectInternalOwnershipClosedRegional?, found, closed, locals, owners]

theorem ownershipClosedSelection_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalOwnershipClosedRegional? program state operation = some selected) :
    selectInternalRegional? program state operation = some selected ∧
      regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) = true := by
  unfold selectInternalOwnershipClosedRegional? at found
  obtain ⟨actual, selectedBefore, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · rename_i closed
    cases found; exact ⟨selectedBefore, (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp closed).1).1⟩
  · simp at found

theorem ownershipClosedSelection_local_data (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalOwnershipClosedRegional? program state operation = some selected) :
    regionalRetainedLocalDataClosed state (regionalSelectionReferenceRetention state selected).activity
      (regionalSelectionLocalDataRetention state selected) = true := by
  unfold selectInternalOwnershipClosedRegional? at found
  obtain ⟨actual, _, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · rename_i closed
    cases found; exact (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp closed).1).2
  · simp at found

theorem ownershipClosedSelection_activity_owners (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalOwnershipClosedRegional? program state operation = some selected) :
    regionalActivityOwnersClosed state (regionalSelectionReferenceRetention state selected) = true := by
  unfold selectInternalOwnershipClosedRegional? at found
  obtain ⟨actual, _, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · rename_i closed
    cases found; exact (Bool.and_eq_true_iff.mp closed).2
  · simp at found


end BpmnSemantics.SemanticProcess.InternalCommutation
