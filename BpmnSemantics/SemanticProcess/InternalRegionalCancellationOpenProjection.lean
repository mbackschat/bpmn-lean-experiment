import BpmnSemantics.SemanticProcess.InternalRegionalCancellationWaitProjection
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationScopeProjection
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationProgramValidity
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationMessageValidity
import BpmnSemantics.SemanticProcess.InternalRegionalIncidentValidity
import BpmnSemantics.SemanticProcess.InternalRegionalReferencePreservation

/-! The complete child-cancellation projector follows from predecessor validity and
closed reference retention. Component filters preserve the original canonical order
and anchor multiplicity; no successor projection or validity is assumed. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem cancelScopeSubtree_child_open_projection (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (current : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (unique : attachedMessagesUnambiguous state = true)
    (closed : regionalOwnershipClosed state (cancellationReferenceRetention state root.id disposition) = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    projectOpenFlowNodeOccurrences? program (cancelScopeSubtree state root.id disposition) =
      some (current.filter fun entry =>
        (decide (disposition = .retain) && decide (entry.anchor = .scope root.id)) ||
          !flowNodeOccurrenceOwnedBySubtree program state root.id entry disposition) := by
  let keep := fun entry : OpenSemanticFlowNodeOccurrence =>
    (decide (disposition = .retain) && decide (entry.anchor = .scope root.id)) ||
      !flowNodeOccurrenceOwnedBySubtree program state root.id entry disposition
  have admitted : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at valid
    exact valid.1.1
  obtain ⟨priorProgram, _, priorRaces, priorIncidents, priorMessages⟩ :=
    projectOpenFlowNodeOccurrences_validities program state current hosting running projected
  have priorParts := priorProgram
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at priorParts
  have programAfter := cancelScopeSubtree_child_program_validity program state expected hosting root disposition
    valid running rootMember child priorProgram priorIncidents
  have positionAfter := cancelScopeSubtree_child_preserves_position program state expected hosting valid running
    root rootMember child disposition
  have runningAfter : (cancelScopeSubtree state root.id disposition).control = .running hosting := running
  have callsAfter := runtimePositionValid_called_associations program expected hosting _ positionAfter runningAfter
  have racesAfter := regional_reference_retention_preserves_event_race_associations state
    (cancelScopeSubtree state root.id disposition) _
    (cancellationReferenceRetention_matches_removal state root.id disposition) closed priorRaces
  have incidentsAfter := cancelScopeSubtree_preserves_incident_associations state root.id disposition priorIncidents
  have messagesAfter := cancelScopeSubtree_message_projection_validity program state root.id disposition unique priorMessages
  have raw := projected
  simp only [projectOpenFlowNodeOccurrences?, running] at raw
  split at raw
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at raw
    obtain ⟨waits, waitsEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    obtain ⟨scopes, scopesEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    obtain ⟨calls, callsEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    have currentEq : current = sortFlowNodeOccurrenceStarts (waits ++ scopes ++ calls) := by
      split at raw
      · exact (Option.some.inj raw).symm
      · contradiction
    have waitKeep : waits.filter (fun entry => !flowNodeOccurrenceOwnedBySubtree program state root.id entry disposition) =
        waits.filter keep := by
      apply List.filter_congr
      intro entry member
      have mapped : entry.anchor ∈ waits.map (·.anchor) := List.mem_map.mpr ⟨entry, member, rfl⟩
      rw [projected_public_wait_identity_census program state waits priorParts.1.1.2 waitsEq] at mapped
      obtain ⟨id, _, same⟩ := List.mem_map.mp mapped
      simp only [keep, ← same, reduceCtorEq, decide_false, Bool.and_false, Bool.false_or]
    have waitAfter := cancelScopeSubtree_child_wait_projection program state expected hosting root disposition current waits
      valid running rootMember child priorParts.1.1.2 projected waitsEq
    rw [waitKeep] at waitAfter
    have scopeAfter := cancelScopeSubtree_child_scope_projection program state expected hosting root disposition scopes
      valid running rootMember child scopesEq
    have callAfter := cancelScopeSubtree_child_call_projection_filtered program state expected hosting root disposition calls
      valid running rootMember child callsEq
    have sortedEq : sortFlowNodeOccurrenceStarts (waits.filter keep ++ scopes.filter keep ++ calls.filter keep) =
        current.filter keep := by
      rw [currentEq, ← sortFlowNodeOccurrenceStarts_filter]
      simp only [List.filter_append]
    have retainedNodup : ((current.filter keep).map (·.anchor)).Nodup :=
      (projectOpenFlowNodeOccurrences_anchor_nodup program state current projected).sublist
        (List.Sublist.map _ List.filter_sublist)
    change projectOpenFlowNodeOccurrences? program (cancelScopeSubtree state root.id disposition) = some (current.filter keep)
    change _ = some (scopes.filter keep) at scopeAfter
    change _ = some (calls.filter keep) at callAfter
    simp only [projectOpenFlowNodeOccurrences?, runningAfter, admitted, programAfter, callsAfter,
      racesAfter, incidentsAfter, messagesAfter, Bool.not_true, Bool.or_self, Bool.false_eq_true,
      ↓reduceIte, bind, Option.bind, pure, Pure.pure, waitAfter, scopeAfter, callAfter, sortedEq, retainedNodup]

end BpmnSemantics.SemanticProcess.InternalCommutation
