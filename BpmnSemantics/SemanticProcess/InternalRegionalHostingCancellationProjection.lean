import BpmnSemantics.SemanticProcess.InternalRegionalCancellationOpenProjection
import BpmnSemantics.SemanticProcess.InternalRegionalRootTerminationValidity
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProjectionShapeProofs

/-! Hosting-root termination retains its parentless root while cancelling all live
owners. The root is not a public scope start, so the resulting open projection is empty. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem cancelScopeSubtree_hosting_structural_program_validity (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : RuntimeScopeOccurrence)
    (valid : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (parentless : root.parent = none)
    (rootHosting : root.id.processInstanceId = hosting)
    (prior : flowNodeOccurrenceStructuralProgramValidity program state = true) :
    flowNodeOccurrenceStructuralProgramValidity program (cancelScopeSubtree state root.id .retain) = true := by
  obtain ⟨scopes, _, calls⟩ := cancelScopeSubtree_hosting_position_fields program state hosting hosting
    valid running root rootMember parentless rootHosting
  simp only [flowNodeOccurrenceStructuralProgramValidity, Bool.and_eq_true, List.all_eq_true] at prior ⊢
  constructor
  · intro occurrence member
    rw [scopes] at member
    have same := List.mem_singleton.mp member
    subst occurrence
    have previous := prior.1 root rootMember
    change (match program.definitionScopes.filter (fun scope => decide (scope.id = root.id.definitionScopeId)) with
      | [definition] => _
      | _ => false) = true at previous ⊢
    split at previous
    · rename_i definition declared
      simp only [Bool.and_eq_true] at previous ⊢
      refine ⟨⟨⟨⟨⟨previous.1.1.1.1.1, previous.1.1.1.1.2⟩, previous.1.1.1.2⟩,
        ?_⟩, previous.1.2⟩, ?_⟩
      · simp [flowNodeOccurrenceOwnerLiveUnique, scopes]
      · have control : (cancelScopeSubtree state root.id .retain).control = .running hosting := running
        cases shape : definition.parentScopeId <;>
          simpa only [shape, parentless, control, running, rootHosting, ↓reduceIte] using previous.2
    · contradiction
  · intro record member
    simp [calls] at member

theorem cancelScopeSubtree_hosting_waits_empty (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : RuntimeScopeOccurrence)
    (valid : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (parentless : root.parent = none)
    (rootHosting : root.id.processInstanceId = hosting)
    (owners : waitOwnersLive state = true) :
    (cancelScopeSubtree state root.id .retain).waits = [] ∧
      (cancelScopeSubtree state root.id .retain).messageWaits = [] ∧
      (cancelScopeSubtree state root.id .retain).timerWaits = [] ∧
      (cancelScopeSubtree state root.id .retain).effectWaits = [] ∧
      (cancelScopeSubtree state root.id .retain).effectIncidents = [] := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root.id owner ||
    (calledInstanceClosure state root.id).contains owner.processInstanceId
  have covered (owner : ScopeOccurrenceId) (live : exactLiveOccurrence state owner = true) : cancelled owner = true := by
    obtain ⟨scope, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
    have member : scope ∈ state.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) := by rw [singleton]; simp
    obtain ⟨present, identity⟩ := List.mem_filter.mp member
    rw [← of_decide_eq_true identity]
    exact hosting_cancellation_covers_live_scope program state hosting hosting valid running root rootMember parentless rootHosting scope present
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  obtain ⟨taskOwners, messageOwners, timerOwners, effectOwners, incidentOwners, _⟩ := owners
  refine ⟨?_, ?_, ?_, ?_, ?_⟩
  · apply List.filter_eq_nil_iff.mpr
    intro wait member
    change (!cancelled wait.owner) ≠ true
    simp [covered wait.owner (List.all_eq_true.mp taskOwners wait member)]
  · apply List.filter_eq_nil_iff.mpr
    intro wait member
    change (!cancelled wait.owner && _) ≠ true
    simp [covered wait.owner (List.all_eq_true.mp messageOwners wait member)]
  · apply List.filter_eq_nil_iff.mpr
    intro wait member
    change (!cancelled wait.owner && _) ≠ true
    simp [covered wait.owner (List.all_eq_true.mp timerOwners wait member)]
  · apply List.filter_eq_nil_iff.mpr
    intro wait member
    change (!cancelled wait.owner) ≠ true
    simp [covered wait.owner (List.all_eq_true.mp effectOwners wait member)]
  · apply List.filter_eq_nil_iff.mpr
    intro incident member
    change (!cancelled incident.wait.owner) ≠ true
    simp [covered incident.wait.owner (List.all_eq_true.mp incidentOwners incident member)]

theorem cancelScopeSubtree_hosting_open_projection (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : RuntimeScopeOccurrence) (current : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (parentless : root.parent = none)
    (rootHosting : root.id.processInstanceId = hosting)
    (owners : waitOwnersLive state = true) (unique : attachedMessagesUnambiguous state = true)
    (closed : regionalOwnershipClosed state (cancellationReferenceRetention state root.id .retain) = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    projectOpenFlowNodeOccurrences? program (cancelScopeSubtree state root.id .retain) = some [] := by
  obtain ⟨priorProgram, _, priorRaces, priorIncidents, priorMessages⟩ :=
    projectOpenFlowNodeOccurrences_validities program state current hosting running projected
  have priorParts := priorProgram
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at priorParts
  have structural := cancelScopeSubtree_hosting_structural_program_validity program state hosting root valid running
    rootMember parentless rootHosting priorParts.1.1.1
  have programAfter := cancelScopeSubtree_program_validity_of_structural program state root.id .retain priorProgram priorIncidents structural
  have positionAfter := cancelScopeSubtree_hosting_preserves_position program state hosting hosting valid running root rootMember parentless rootHosting
  have runningAfter : (cancelScopeSubtree state root.id .retain).control = .running hosting := running
  have callsAfter := runtimePositionValid_called_associations program hosting hosting _ positionAfter runningAfter
  have racesAfter := regional_reference_retention_preserves_event_race_associations state
    (cancelScopeSubtree state root.id .retain) _ (cancellationReferenceRetention_matches_removal state root.id .retain) closed priorRaces
  have incidentsAfter := cancelScopeSubtree_preserves_incident_associations state root.id .retain priorIncidents
  have messagesAfter := cancelScopeSubtree_message_projection_validity program state root.id .retain unique priorMessages
  obtain ⟨tasks, messages, timers, effects, incidents⟩ := cancelScopeSubtree_hosting_waits_empty program state hosting root valid running
    rootMember parentless rootHosting owners
  obtain ⟨scopes, _, calls⟩ := cancelScopeSubtree_hosting_position_fields program state hosting hosting valid running root rootMember parentless rootHosting
  have admitted : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at valid
    exact valid.1.1
  simp [projectOpenFlowNodeOccurrences?, runningAfter, admitted, programAfter, callsAfter, racesAfter,
    incidentsAfter, messagesAfter, projectWaits?, tasks, messages, timers, effects, incidents, scopes, calls,
    parentless, sortFlowNodeOccurrenceStarts, BpmnSemantics.SemanticProcess.sortBy]

theorem hosting_cancellation_public_filter_empty (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : RuntimeScopeOccurrence) (current : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (parentless : root.parent = none)
    (rootHosting : root.id.processInstanceId = hosting)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    current.filter (fun entry => decide (entry.anchor = .scope root.id) ||
      !flowNodeOccurrenceOwnedBySubtree program state root.id entry .retain) = [] := by
  have coverage := hosting_cancellation_covers_live_scope program state hosting hosting valid running
    root rootMember parentless rootHosting
  have unique := runtimePositionValid_scope_ids_nodup program hosting hosting state valid running
  apply List.filter_eq_nil_iff.mpr
  intro entry member
  have ownership := projectOpen_regional_ownership program state hosting current entry running projected member
  obtain ⟨owner, ownerMember, ownerEq⟩ := List.mem_map.mp ownership.1
  have ownerInside := coverage owner ownerMember
  rw [ownerEq] at ownerInside
  cases anchor : entry.anchor with
  | scope id =>
      obtain ⟨scope, scopeMember, scopeEq, parentEq⟩ := ownership.2 id anchor
      have inside := coverage scope scopeMember
      rw [scopeEq] at inside
      have different : id ≠ root.id := by
        intro same
        have left := occurrence_find_exact state.scopeOccurrences unique scope scopeMember
        have right := occurrence_find_exact state.scopeOccurrences unique root rootMember
        rw [scopeEq, same, right] at left
        have equal := Option.some.inj left
        rw [← equal, parentless] at parentEq
        contradiction
      simp only [flowNodeOccurrenceOwnedBySubtree, anchor]
      rw [inside]
      simp [different]
  | wait _ | callActivity _ | compensationTrigger _ | compensationHandler _ =>
      simp only [flowNodeOccurrenceOwnedBySubtree, anchor]
      rw [ownerInside]
      simp
  | transition command index localIndex =>
      exact False.elim ((projectOpenFlowNodeOccurrences_transitionAnchor_false program state current projected)
        ⟨entry, member, by simp [transitionAnchor, anchor]⟩)

end BpmnSemantics.SemanticProcess.InternalCommutation
