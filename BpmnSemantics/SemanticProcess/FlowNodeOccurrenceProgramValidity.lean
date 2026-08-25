import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity

/-! # Flow-node occurrence Program validity

This module composes structural, wait-family, selected-branch, and event-race correspondence for lifecycle projection. Family validators and the private Boundary Timer matcher remain at their lower owners.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Exact immutable-Program correspondence for every runtime occurrence family used by open projection. -/
def flowNodeOccurrenceProgramValidity (program : Program) (state : RuntimeState) : Bool :=
  flowNodeOccurrenceStructuralProgramValidity program state &&
    flowNodeOccurrenceWaitProgramValidity program state &&
    state.selectedBranchSets.all (fun record =>
      flowNodeOccurrenceOwnerLiveUnique state record.owner) &&
    state.eventRaces.all (fun race => flowNodeOccurrenceOwnerLiveUnique state race.owner)

/-- Every projected wait stores the same process identity as its live owner. -/
theorem flowNodeOccurrenceProgramValidity_wait_owner_ids (program : Program) (state : RuntimeState)
    (valid : flowNodeOccurrenceProgramValidity program state = true) :
    (∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ wait ∈ state.messageWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ wait ∈ state.timerWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ wait ∈ state.effectWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ incident ∈ state.effectIncidents,
      incident.wait.processInstanceId = incident.wait.owner.processInstanceId) := by
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at valid
  exact flowNodeOccurrenceWaitProgramValidity_wait_owner_ids program state valid.1.1.2

/-- Reconstruct full Program validity from one wait-family preservation and unchanged structural fields. -/
theorem flowNodeOccurrenceProgramValidity_of_wait_frame (program : Program)
    (before after : RuntimeState) (prior : flowNodeOccurrenceProgramValidity program before = true)
    (waits : flowNodeOccurrenceWaitProgramValidity program after = true)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (selected : after.selectedBranchSets = before.selectedBranchSets)
    (races : after.eventRaces = before.eventRaces) :
    flowNodeOccurrenceProgramValidity program after = true := by
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at prior ⊢
  obtain ⟨h3, racesBefore⟩ := prior
  obtain ⟨h2, selectedBefore⟩ := h3
  obtain ⟨structuralBefore, waitsBefore⟩ := h2
  have structuralAfter : flowNodeOccurrenceStructuralProgramValidity program after = true := by
    rw [flowNodeOccurrenceStructuralProgramValidity_frame program before after control scopes calls]
    exact structuralBefore
  have selectedAfter :
      (after.selectedBranchSets.all fun record =>
        flowNodeOccurrenceOwnerLiveUnique after record.owner) = true := by
    simpa [flowNodeOccurrenceOwnerLiveUnique, scopes, selected] using selectedBefore
  have racesAfter :
      (after.eventRaces.all fun race => flowNodeOccurrenceOwnerLiveUnique after race.owner) = true := by
    simpa [flowNodeOccurrenceOwnerLiveUnique, scopes, races] using racesBefore
  exact ⟨⟨⟨structuralAfter, waits⟩, selectedAfter⟩, racesAfter⟩

end BpmnSemantics.SemanticProcess
