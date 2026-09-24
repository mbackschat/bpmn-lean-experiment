import BpmnSemantics.SemanticProcess.InternalRegionalRemovalValidity

/-! Regional cleanup must retain an incident's suspended wait and exact local-data owner together.
The incident validator requires a singleton local scope and excludes an open wait with the same
identity, so arbitrary sublist retention alone cannot establish its preservation. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The actual incident validator rejects cleanup that strands its retained local-data reference. -/
theorem incident_binding_rejects_missing_local_scope (state : RuntimeState)
    (incident : SemanticEffectIncident)
    (missing : state.variables.activities.filter (activityScopeMatches incident.id.effectId) = []) :
    effectIncidentAssociationValid state incident = false := by
  simp [effectIncidentAssociationValid, missing]

private theorem incident_binding_of_retained_fields (before after : RuntimeState)
    (incident : SemanticEffectIncident)
    (valid : effectIncidentAssociationValid before incident = true)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences.filter (fun occurrence => occurrence.id == incident.wait.owner) =
      before.scopeOccurrences.filter (fun occurrence => occurrence.id == incident.wait.owner))
    (locals : after.variables.activities.filter (activityScopeMatches incident.id.effectId) =
      before.variables.activities.filter (activityScopeMatches incident.id.effectId))
    (waits : after.effectWaits.Sublist before.effectWaits) :
    effectIncidentAssociationValid after incident = true := by
  have owner : effectWaitOwnerAssociationValid after incident.wait =
      effectWaitOwnerAssociationValid before incident.wait := by
    simp only [effectWaitOwnerAssociationValid, control, scopes]
  simp only [effectIncidentAssociationValid, Bool.and_eq_true, Bool.not_eq_true'] at valid ⊢
  refine ⟨?_, ?_⟩
  · simpa only [owner, locals] using valid.1
  · apply Bool.eq_false_iff.mpr
    intro openWait
    obtain ⟨wait, member, named⟩ := List.any_eq_true.mp openWait
    have prior := List.any_eq_true.mpr ⟨wait, waits.subset member, named⟩
    rw [valid.2] at prior
    contradiction

private theorem incident_associations_after_filter (before after : RuntimeState)
    (keep : SemanticEffectIncident → Bool)
    (field : after.effectIncidents = before.effectIncidents.filter keep)
    (valid : effectIncidentAssociationsValid before = true)
    (retained : ∀ incident ∈ before.effectIncidents, keep incident = true →
      effectIncidentAssociationValid before incident = true →
      effectIncidentAssociationValid after incident = true) :
    effectIncidentAssociationsValid after = true := by
  cases incidents : before.effectIncidents with
  | nil => simp [effectIncidentAssociationsValid, field, incidents]
  | cons incident rest =>
    cases rest with
    | cons other tail => simp [effectIncidentAssociationsValid, incidents] at valid
    | nil =>
      have binding : effectIncidentAssociationValid before incident = true := by
        simpa only [effectIncidentAssociationsValid, incidents] using valid
      cases kept : keep incident with
      | false => simp [effectIncidentAssociationsValid, field, incidents, kept]
      | true =>
        simpa only [effectIncidentAssociationsValid, field, incidents, List.filter_cons,
          kept, ↓reduceIte, List.filter_nil] using retained incident (by simp [incidents]) kept binding

private theorem incident_owner_process (state : RuntimeState) (incident : SemanticEffectIncident)
    (valid : effectIncidentAssociationValid state incident = true) :
    incident.id.effectId.processInstanceId = incident.wait.owner.processInstanceId := by
  simp only [effectIncidentAssociationValid, Bool.and_eq_true, decide_eq_true_eq] at valid
  have identity := valid.1.1.1.1.2
  have owner := valid.1.1.2
  cases control : state.control <;> simp [effectWaitOwnerAssociationValid, control] at owner
  next instanceId =>
    rw [identity]
    exact owner.1.1.trans owner.1.2.symm

/-- Call cleanup filters local data by identity Process and incidents by scope owner. Their
existing association joins those filters, retaining the complete local census of a survivor. -/
theorem removeCalledProcessTree_preserves_incident_associations (state : RuntimeState)
    (call : CalledProcessOccurrence) (valid : effectIncidentAssociationsValid state = true) :
    effectIncidentAssociationsValid (removeCalledProcessTree state call) = true := by
  apply incident_associations_after_filter state (removeCalledProcessTree state call) _ rfl valid
  intro incident _ kept binding
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [call.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  have outside : removed.contains incident.wait.owner.processInstanceId = false := by
    simpa only [Bool.not_eq_true'] using kept
  apply incident_binding_of_retained_fields state (removeCalledProcessTree state call) incident binding rfl
  · change (state.scopeOccurrences.filter _).filter _ = _
    rw [List.filter_filter]
    apply List.filter_congr
    intro occurrence _
    by_cases same : occurrence.id = incident.wait.owner <;> simp_all [removed]
  · change (state.variables.activities.filter _).filter _ = _
    rw [List.filter_filter]
    apply List.filter_congr
    intro scope _
    have process := incident_owner_process state incident binding
    cases named : activityScopeMatches incident.id.effectId scope with
    | false => simp
    | true =>
      have owner : scope.owner = .effectOccurrence incident.id.effectId :=
        (of_decide_eq_true named).symm
      simp only [Bool.true_and, owner, LocalDataOwner.processInstanceId, process, Bool.not_eq_true']
      exact outside
  · exact List.filter_sublist

private theorem incident_scope_rejects_open_waits (state : RuntimeState)
    (incident : SemanticEffectIncident) (scope : ActivityVariableScope)
    (valid : effectIncidentAssociationValid state incident = true)
    (owner : scope.owner = .effectOccurrence incident.id.effectId)
    (wait : EffectWait) (member : wait ∈ state.effectWaits) :
    activityScopeMatches (effectWaitOccurrenceId wait) scope = false := by
  apply Bool.eq_false_iff.mpr
  intro named
  have identity : effectWaitOccurrenceId wait = incident.id.effectId := by
    have same := of_decide_eq_true named
    rw [owner] at same
    exact LocalDataOwner.effectOccurrence.inj same
  have matched : effectOccurrenceMatches incident.id.effectId wait = true := by
    rw [← identity]
    simp [effectOccurrenceMatches, effectWaitOccurrenceId]
  have present := List.any_eq_true.mpr ⟨wait, member, matched⟩
  simp only [effectIncidentAssociationValid, Bool.and_eq_true, Bool.not_eq_true'] at valid
  rw [valid.2] at present
  contradiction

/-- Cancellation's incident and effect-data filters remove the same occurrence. The local-owner
tag excludes Activity-owned data, and the existing singleton incident rule excludes another
cancelled incident from deleting a surviving incident's local scope. -/
theorem cancelScopeSubtree_preserves_incident_associations (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : effectIncidentAssociationsValid state = true) :
    effectIncidentAssociationsValid (cancelScopeSubtree state root disposition) = true := by
  apply incident_associations_after_filter state (cancelScopeSubtree state root disposition) _ rfl valid
  intro incident member kept binding
  let called := calledInstanceClosure state root
  let cancelled := fun owner : ScopeOccurrenceId =>
    occurrenceInSubtree state.scopeOccurrences root owner || called.contains owner.processInstanceId
  have outside : cancelled incident.wait.owner = false := by
    simpa only [Bool.not_eq_true'] using kept
  have single : state.effectIncidents = [incident] := by
    cases allIncidents : state.effectIncidents with
    | nil => simp [allIncidents] at member
    | cons only rest =>
      cases rest with
      | nil =>
        have same : incident = only := by simpa only [allIncidents, List.mem_singleton] using member
        simp [same]
      | cons other tail => simp [effectIncidentAssociationsValid, allIncidents] at valid
  have cancelledIncidents : state.effectIncidents.filter (fun other => cancelled other.wait.owner) = [] := by
    simp [single, outside]
  have ownerProcess := incident_owner_process state incident binding
  apply incident_binding_of_retained_fields state (cancelScopeSubtree state root disposition) incident binding rfl
  · change (state.scopeOccurrences.filter (fun occurrence => match disposition with
      | .retain => decide (occurrence.id = root) || !cancelled occurrence.id
      | .remove => !cancelled occurrence.id)).filter _ = _
    rw [List.filter_filter]
    apply List.filter_congr
    intro occurrence _
    cases disposition <;> by_cases same : occurrence.id = incident.wait.owner <;>
      simp_all [cancelled, called]
  · change (state.variables.activities.filter (fun scope =>
      !called.contains scope.owner.processInstanceId &&
      !((withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)).any fun record =>
        activityOccurrenceScopeMatches
          ⟨record.processInstanceId, ⟨record.activityElementId.value⟩, record.activation⟩ scope) &&
      !((state.effectWaits.filter fun wait => cancelled wait.owner).any fun wait =>
        activityScopeMatches (effectWaitOccurrenceId wait) scope) &&
      !((state.effectIncidents.filter fun other => cancelled other.wait.owner).any fun other =>
        activityScopeMatches other.id.effectId scope))).filter _ = _
    rw [List.filter_filter]
    apply List.filter_congr
    intro scope _
    cases named : activityScopeMatches incident.id.effectId scope with
    | false => simp
    | true =>
      have owner : scope.owner = .effectOccurrence incident.id.effectId :=
        (of_decide_eq_true named).symm
      have calledOutside : called.contains incident.wait.owner.processInstanceId = false :=
        (Bool.or_eq_false_iff.mp outside).2
      have noOpen : ((state.effectWaits.filter fun wait => cancelled wait.owner).any fun wait =>
          activityScopeMatches (effectWaitOccurrenceId wait) scope) = false := by
        apply Bool.eq_false_iff.mpr
        intro claim
        obtain ⟨wait, present, linked⟩ := List.any_eq_true.mp claim
        have absent := incident_scope_rejects_open_waits state incident scope binding owner
          wait (List.mem_filter.mp present).1
        rw [absent] at linked
        contradiction
      simp [owner, LocalDataOwner.processInstanceId, ownerProcess, noOpen,
        cancelledIncidents, activityOccurrenceScopeMatches, localDataOwnerMatches]
      simpa using calledOutside
  · exact List.filter_sublist

end BpmnSemantics.SemanticProcess
