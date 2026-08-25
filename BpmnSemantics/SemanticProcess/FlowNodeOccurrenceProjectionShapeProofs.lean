import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleProofs

/-! # Flow-node occurrence projection shape proofs

This module proves that the independent open-occurrence projector emits only wait, scope, and
Call Activity anchors. Instantaneous transition anchors enter only through accepted deltas.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem mapM_transitionAnchor_false (values : List α)
    (project : α → Option OpenSemanticFlowNodeOccurrence)
    (projected : List OpenSemanticFlowNodeOccurrence)
    (selected : values.mapM project = some projected)
    (pointwise : ∀ value start, project value = some start →
      transitionAnchor start.anchor = false) :
    ∀ start ∈ projected, transitionAnchor start.anchor = false := by
  induction values generalizing projected with
  | nil => simp_all
  | cons value rest ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at selected
      obtain ⟨start, startEq, selected⟩ := Option.bind_eq_some_iff.mp selected
      obtain ⟨tail, tailEq, resultEq⟩ := Option.bind_eq_some_iff.mp selected
      simp at resultEq
      subst projected
      intro candidate member
      rcases List.mem_cons.mp member with same | member
      · rw [same]
        exact pointwise value start startEq
      · exact ih tail tailEq candidate member

private theorem mapM_waitStart_transitionAnchor_false (program : Program) (state : RuntimeState)
    (values : List α) (owner : α → ScopeOccurrenceId) (element : α → NodeId)
    (activation : α → Nat) (projected : List OpenSemanticFlowNodeOccurrence)
    (selected : values.mapM (fun value => waitStart? program state (owner value)
      (element value) (activation value)) = some projected) :
    ∀ start ∈ projected, transitionAnchor start.anchor = false := by
  apply mapM_transitionAnchor_false values _ projected selected
  intro value start started
  rw [waitStart_anchor_of_eq program state _ _ _ _ started]
  rfl

private theorem projectWaits_transitionAnchor_false (program : Program) (state : RuntimeState)
    (projected : List OpenSemanticFlowNodeOccurrence)
    (selected : projectWaits? program state = some projected) :
    ∀ start ∈ projected, transitionAnchor start.anchor = false := by
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
      effectsEq, incidentsEq, rfl⟩ := (projectWaits_eq_some_iff program state projected).mp selected
  intro start member
  simp only [List.mem_append] at member
  rcases member with member | member | member | member | member
  · exact mapM_waitStart_transitionAnchor_false program state state.waits
      (·.owner) (fun wait => ⟨wait.task.id.value⟩) (·.activation) tasks tasksEq start member
  · exact mapM_waitStart_transitionAnchor_false program state state.messageWaits
      (·.owner) (·.elementId) (·.activation) messages messagesEq start member
  · exact mapM_waitStart_transitionAnchor_false program state
      (state.timerWaits.filter fun wait => !flowNodeOccurrenceBoundaryTimerBound program state wait)
      (·.owner) (·.elementId) (·.activation) timers timersEq start member
  · exact mapM_waitStart_transitionAnchor_false program state state.effectWaits
      (·.owner) (·.elementId) (·.activation) effects effectsEq start member
  · exact mapM_waitStart_transitionAnchor_false program state state.effectIncidents
      (fun incident => incident.wait.owner) (fun incident => incident.wait.elementId)
      (fun incident => incident.wait.activation) incidents incidentsEq start member

private theorem scopeStart_transitionAnchor_false (program : Program) (state : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (selected : scopeStart? program state occurrence = some start) :
    transitionAnchor start.anchor = false := by
  simp only [scopeStart?, Option.bind_eq_bind] at selected
  obtain ⟨owner, _, selected⟩ := Option.bind_eq_some_iff.mp selected
  obtain ⟨processId, _, selected⟩ := Option.bind_eq_some_iff.mp selected
  generalize definitionsEq : (program.definitionScopes.filter fun scope =>
    decide (scope.id = occurrence.id.definitionScopeId)) = definitions at selected
  cases definitions with
  | nil => simp at selected
  | cons definition rest =>
      cases rest with
      | nil =>
          simp at selected
          subst start
          rfl
      | cons other tail => simp at selected

private theorem callStart_transitionAnchor_false (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (selected : callStart? program state record = some start) :
    transitionAnchor start.anchor = false := by
  simp only [callStart?, Option.bind_eq_bind] at selected
  obtain ⟨processId, _, resultEq⟩ := Option.bind_eq_some_iff.mp selected
  simp at resultEq
  subst start
  rfl

/-- An independent open projection contains no instantaneous-transition anchor. -/
theorem projectOpenFlowNodeOccurrences_transitionAnchor_false (program : Program)
    (state : RuntimeState) (projected : List OpenSemanticFlowNodeOccurrence)
    (selected : projectOpenFlowNodeOccurrences? program state = some projected) :
    ¬ ∃ start, start ∈ projected ∧ transitionAnchor start.anchor = true := by
  rintro ⟨start, member, transition⟩
  unfold projectOpenFlowNodeOccurrences? at selected
  cases controlEq : state.control <;> simp_all
  case running =>
    obtain ⟨_, selected⟩ := selected
    obtain ⟨waits, waitsEq, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨scopes, scopesEq, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨calls, callsEq, selected⟩ := Option.bind_eq_some_iff.mp selected
    split at selected
    · simp at selected
      subst projected
      rw [mem_sortFlowNodeOccurrenceStarts] at member
      rcases List.mem_append.mp member with member | member
      · have shape := projectWaits_transitionAnchor_false program state waits waitsEq start member
        simp_all
      · rcases List.mem_append.mp member with member | member
        · have shape := mapM_transitionAnchor_false _ _ _ scopesEq
            (scopeStart_transitionAnchor_false program state) start member
          simp_all
        · have shape := mapM_transitionAnchor_false _ _ _ callsEq
            (callStart_transitionAnchor_false program state) start member
          simp_all
    · simp at selected

end BpmnSemantics.SemanticProcess
