import BpmnSemantics.SemanticProcess.InternalScopeCreationOpenProjection
import BpmnSemantics.SemanticProcess.InternalRegionalPublication
import BpmnSemantics.SemanticProcess.InternalRegionalRemovalAgreement

/-! Projected open occurrences carry live ownership. A scope anchor additionally carries its
actual parent edge, which makes region membership agree with cancellation's anchor-based account.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def regionalOpenOwnership (state : RuntimeState) (entry : OpenSemanticFlowNodeOccurrence) : Prop :=
  entry.owner ∈ state.scopeOccurrences.map (·.id) ∧
    ∀ id, entry.anchor = .scope id → ∃ scope ∈ state.scopeOccurrences,
      scope.id = id ∧ scope.parent = some entry.owner

theorem processIdForOwner_live (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (process : ProcessId)
    (found : processIdForOwner? program state owner = some process) :
    owner ∈ state.scopeOccurrences.map (·.id) := by
  unfold processIdForOwner? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · contradiction
  · next live =>
      have count : (state.scopeOccurrences.filter fun scope => decide (scope.id = owner)).length = 1 := by
        simpa [flowNodeOccurrenceOwnerLiveUnique] using live
      have present : (state.scopeOccurrences.filter fun scope => decide (scope.id = owner)) ≠ [] := by
        intro empty
        simp [empty] at count
      obtain ⟨scope, member⟩ := List.exists_mem_of_ne_nil _ present
      obtain ⟨member, equal⟩ := List.mem_filter.mp member
      exact List.mem_map.mpr ⟨scope, member, of_decide_eq_true equal⟩

theorem waitStart_regional_ownership (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
    (entry : OpenSemanticFlowNodeOccurrence)
    (found : waitStart? program state owner element activation = some entry) :
    regionalOpenOwnership state entry := by
  unfold waitStart? at found
  obtain ⟨process, resolved, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  exact ⟨processIdForOwner_live program state owner process resolved, by intro id impossible; contradiction⟩

theorem scopeStart_regional_ownership (program : Program) (state : RuntimeState)
    (scope : RuntimeScopeOccurrence) (member : scope ∈ state.scopeOccurrences)
    (entry : OpenSemanticFlowNodeOccurrence)
    (found : scopeStart? program state scope = some entry) :
    regionalOpenOwnership state entry := by
  unfold scopeStart? at found
  obtain ⟨owner, parent, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨process, resolved, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · cases found
    refine ⟨processIdForOwner_live program state owner process resolved, ?_⟩
    intro id anchor
    cases anchor
    exact ⟨scope, member, rfl, parent⟩
  · contradiction

theorem callStart_regional_ownership (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence) (entry : OpenSemanticFlowNodeOccurrence)
    (found : callStart? program state record = some entry) :
    regionalOpenOwnership state entry := by
  unfold callStart? at found
  obtain ⟨process, resolved, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  exact ⟨processIdForOwner_live program state record.caller process resolved, by intro id impossible; contradiction⟩

private theorem mapped_wait_ownership (program : Program) (state : RuntimeState)
    (values : List α) (owner : α → ScopeOccurrenceId) (element : α → NodeId) (activation : α → Nat)
    (starts : List OpenSemanticFlowNodeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (mapped : values.mapM (fun value => waitStart? program state (owner value)
      (element value) (activation value)) = some starts) (member : start ∈ starts) :
    regionalOpenOwnership state start := by
  obtain ⟨value, _, projected⟩ := mapM_output_member values _ starts mapped start member
  exact waitStart_regional_ownership program state _ _ _ start projected

theorem projectWaits_regional_ownership (program : Program) (state : RuntimeState)
    (starts : List OpenSemanticFlowNodeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (projected : projectWaits? program state = some starts) (member : start ∈ starts) :
    regionalOpenOwnership state start := by
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
    effectsEq, incidentsEq, rfl⟩ := (projectWaits_eq_some_iff program state starts).mp projected
  simp only [List.mem_append] at member
  rcases member with member | member | member | member | member
  · exact mapped_wait_ownership program state state.waits (·.owner) (fun wait => ⟨wait.task.id.value⟩)
      (·.activation) tasks start tasksEq member
  · exact mapped_wait_ownership program state state.messageWaits (·.owner) (·.elementId)
      (·.activation) messages start messagesEq member
  · exact mapped_wait_ownership program state
      (state.timerWaits.filter fun wait => !flowNodeOccurrenceBoundaryTimerBound program state wait)
      (·.owner) (·.elementId) (·.activation) timers start timersEq member
  · exact mapped_wait_ownership program state state.effectWaits (·.owner) (·.elementId)
      (·.activation) effects start effectsEq member
  · exact mapped_wait_ownership program state state.effectIncidents (fun incident => incident.wait.owner)
      (fun incident => incident.wait.elementId) (fun incident => incident.wait.activation)
      incidents start incidentsEq member

theorem projectOpen_regional_ownership (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (starts : List OpenSemanticFlowNodeOccurrence)
    (start : OpenSemanticFlowNodeOccurrence) (running : state.control = .running hosting)
    (projected : projectOpenFlowNodeOccurrences? program state = some starts) (member : start ∈ starts) :
    regionalOpenOwnership state start := by
  simp only [projectOpenFlowNodeOccurrences?, running] at projected
  split at projected
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at projected
    obtain ⟨waits, waitsEq, projected⟩ := Option.bind_eq_some_iff.mp projected
    obtain ⟨scopes, scopesEq, projected⟩ := Option.bind_eq_some_iff.mp projected
    obtain ⟨calls, callsEq, projected⟩ := Option.bind_eq_some_iff.mp projected
    split at projected
    · cases projected
      rw [mem_sortFlowNodeOccurrenceStarts] at member
      rcases List.mem_append.mp member with member | member
      · rcases List.mem_append.mp member with member | member
        · exact projectWaits_regional_ownership program state waits start waitsEq member
        · obtain ⟨scope, present, scopeEq⟩ := mapM_output_member _ _ scopes scopesEq start member
          exact scopeStart_regional_ownership program state scope (List.mem_filter.mp present).1 start scopeEq
      · obtain ⟨record, _, recordEq⟩ := mapM_output_member _ _ calls callsEq start member
        exact callStart_regional_ownership program state record start recordEq
    · contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
