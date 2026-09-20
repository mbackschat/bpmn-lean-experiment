import BpmnSemantics.SemanticProcess.InternalRegionalCancellationWaitValidity
import BpmnSemantics.SemanticProcess.Incident

/-! Effect-local data and its open or suspended wait must survive cancellation together.
The projection's exact identity census excludes a cancelled alias from deleting a survivor's
data; incident association supplies the identity used by the actual cleanup filter. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem effect_program_validity_identity_injective (program : Program) (state : RuntimeState)
    (valid : flowNodeOccurrenceEffectProgramValidity program state = true)
    (wait other : EffectWait)
    (member : wait ∈ state.effectWaits ++ state.effectIncidents.map (·.wait))
    (otherMember : other ∈ state.effectWaits ++ state.effectIncidents.map (·.wait))
    (same : effectWaitOccurrenceId other = effectWaitOccurrenceId wait) : other = wait := by
  simp only [flowNodeOccurrenceEffectProgramValidity, Bool.and_eq_true] at valid
  have exactLocals := valid.2
  change ((state.effectWaits ++ state.effectIncidents.map (·.wait)).all _ && _) = true at exactLocals
  rw [Bool.and_eq_true] at exactLocals
  have bound := List.all_eq_true.mp exactLocals.1 wait member
  simp only [Bool.and_eq_true] at bound
  obtain ⟨only, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true bound.1)
  have selected : wait ∈ (state.effectWaits ++ state.effectIncidents.map (·.wait)).filter
      (fun candidate => decide (effectWaitOccurrenceId candidate = effectWaitOccurrenceId wait)) :=
    List.mem_filter.mpr ⟨member, by simp⟩
  have candidate : other ∈ (state.effectWaits ++ state.effectIncidents.map (·.wait)).filter
      (fun candidate => decide (effectWaitOccurrenceId candidate = effectWaitOccurrenceId wait)) :=
    List.mem_filter.mpr ⟨otherMember, by simp [same]⟩
  rw [census] at selected candidate
  exact (List.mem_singleton.mp candidate).trans (List.mem_singleton.mp selected).symm

theorem incident_association_wait_identity (state : RuntimeState)
    (valid : effectIncidentAssociationsValid state = true)
    (incident : SemanticEffectIncident) (member : incident ∈ state.effectIncidents) :
    incident.id.effectId = effectWaitOccurrenceId incident.wait := by
  cases shape : state.effectIncidents with
  | nil => simp [shape] at member
  | cons only rest =>
    cases rest with
    | cons next tail => simp [effectIncidentAssociationsValid, shape] at valid
    | nil =>
      have same : incident = only := by simpa [shape] using member
      subst incident
      simp only [effectIncidentAssociationsValid, shape, effectIncidentAssociationValid,
        Bool.and_eq_true, decide_eq_true_eq] at valid
      exact valid.1.1.1.1.2

theorem cancelScopeSubtree_effect_local_retention (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : flowNodeOccurrenceEffectProgramValidity program state = true)
    (incidents : effectIncidentAssociationsValid state = true)
    (wait : EffectWait) (member : wait ∈ state.effectWaits ++ state.effectIncidents.map (·.wait))
    (dataScope : ActivityVariableScope) (localMember : dataScope ∈ state.variables.activities)
    (matched : activityScopeMatches (effectWaitOccurrenceId wait) dataScope = true) :
    dataScope ∈ (cancelScopeSubtree state root disposition).variables.activities ↔
      (occurrenceInSubtree state.scopeOccurrences root wait.owner ||
        (calledInstanceClosure state root).contains wait.owner.processInstanceId) = false := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  have dataOwner : dataScope.owner = .effectOccurrence (effectWaitOccurrenceId wait) :=
    (of_decide_eq_true matched).symm
  have sameWait (other : EffectWait)
      (otherMember : other ∈ state.effectWaits ++ state.effectIncidents.map (·.wait))
      (named : activityScopeMatches (effectWaitOccurrenceId other) dataScope = true) : other = wait := by
    apply effect_program_validity_identity_injective program state valid wait other member otherMember
    have owner := of_decide_eq_true named
    rw [dataOwner] at owner
    exact LocalDataOwner.effectOccurrence.inj owner
  have waitOwner : wait.processInstanceId = wait.owner.processInstanceId := by
    have identities := flowNodeOccurrenceEffectProgramValidity_wait_owner_ids program state valid
    rcases List.mem_append.mp member with present | present
    · exact identities.1 wait present
    · obtain ⟨incident, incidentMember, rfl⟩ := List.mem_map.mp present
      exact identities.2 incident incidentMember
  constructor
  · intro retained
    have kept := (List.mem_filter.mp retained).2
    change (_ && _ &&
      !((state.effectWaits.filter fun other => cancelled other.owner).any fun other =>
        activityScopeMatches (effectWaitOccurrenceId other) dataScope) &&
      !((state.effectIncidents.filter fun incident => cancelled incident.wait.owner).any fun incident =>
        activityScopeMatches incident.id.effectId dataScope)) = true at kept
    simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
    apply Bool.eq_false_iff.mpr
    intro removed
    rcases List.mem_append.mp member with present | present
    · have deleted : ((state.effectWaits.filter fun other => cancelled other.owner).any fun other =>
          activityScopeMatches (effectWaitOccurrenceId other) dataScope) = true := List.any_eq_true.mpr
        ⟨wait, List.mem_filter.mpr ⟨present, removed⟩, matched⟩
      rw [kept.1.2] at deleted
      contradiction
    · obtain ⟨incident, incidentMember, rfl⟩ := List.mem_map.mp present
      have named : activityScopeMatches incident.id.effectId dataScope = true := by
        rw [incident_association_wait_identity state incidents incident incidentMember]
        exact matched
      have deleted : ((state.effectIncidents.filter fun incident => cancelled incident.wait.owner).any fun incident =>
          activityScopeMatches incident.id.effectId dataScope) = true := List.any_eq_true.mpr
        ⟨incident, List.mem_filter.mpr ⟨incidentMember, removed⟩, named⟩
      rw [kept.2] at deleted
      contradiction
  · intro outside
    have noEffects : ((state.effectWaits.filter fun other => cancelled other.owner).any fun other =>
        activityScopeMatches (effectWaitOccurrenceId other) dataScope) = false := by
      apply Bool.eq_false_iff.mpr
      intro deleted
      obtain ⟨other, present, named⟩ := List.any_eq_true.mp deleted
      obtain ⟨beforeMember, removed⟩ := List.mem_filter.mp present
      have same := sameWait other (List.mem_append_left _ beforeMember) named
      rw [same, show cancelled wait.owner = false from outside] at removed
      contradiction
    have noIncidents : ((state.effectIncidents.filter fun incident => cancelled incident.wait.owner).any fun incident =>
        activityScopeMatches incident.id.effectId dataScope) = false := by
      apply Bool.eq_false_iff.mpr
      intro deleted
      obtain ⟨incident, present, named⟩ := List.any_eq_true.mp deleted
      obtain ⟨beforeMember, removed⟩ := List.mem_filter.mp present
      rw [incident_association_wait_identity state incidents incident beforeMember] at named
      have same := sameWait incident.wait (List.mem_append_right _ (List.mem_map.mpr ⟨incident, beforeMember, rfl⟩)) named
      rw [same, show cancelled wait.owner = false from outside] at removed
      contradiction
    apply List.mem_filter.mpr
    refine ⟨localMember, ?_⟩
    change (_ && _ &&
      !((state.effectWaits.filter fun other => cancelled other.owner).any fun other =>
        activityScopeMatches (effectWaitOccurrenceId other) dataScope) &&
      !((state.effectIncidents.filter fun incident => cancelled incident.wait.owner).any fun incident =>
        activityScopeMatches incident.id.effectId dataScope)) = true
    have processOutside := (Bool.or_eq_false_iff.mp outside).2
    simp only [noEffects, noIncidents, Bool.not_false, Bool.and_true]
    simp only [dataOwner, LocalDataOwner.processInstanceId, effectWaitOccurrenceId,
      waitOwner, processOutside, Bool.not_false, Bool.true_and]
    simp [activityOccurrenceScopeMatches, localDataOwnerMatches, dataOwner]

theorem cancelScopeSubtree_effect_program_validity (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (prior : flowNodeOccurrenceEffectProgramValidity program state = true)
    (incidents : effectIncidentAssociationsValid state = true) :
    flowNodeOccurrenceEffectProgramValidity program (cancelScopeSubtree state root disposition) = true := by
  let after := cancelScopeSubtree state root disposition
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  let waits := state.effectWaits ++ state.effectIncidents.map (·.wait)
  have waitFilter : after.effectWaits ++ after.effectIncidents.map (·.wait) =
      waits.filter (fun wait => !cancelled wait.owner) := by
    simp only [after, cancelScopeSubtree, waits, List.filter_append, List.filter_map]
    rfl
  have original := prior
  simp only [flowNodeOccurrenceEffectProgramValidity, Bool.and_eq_true] at prior ⊢
  refine ⟨⟨?_, ?_⟩, ?_⟩
  · apply List.all_eq_true.mpr
    intro wait member
    obtain ⟨beforeMember, outside⟩ := List.mem_filter.mp member
    simp only [Bool.not_eq_true'] at outside
    have valid := List.all_eq_true.mp prior.1.1 wait beforeMember
    change (occurrenceOwnerValid after wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true
    change (occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation && _) = true at valid
    simpa only [after, cancelScopeSubtree_occurrence_owner_frame state root disposition wait.owner _ _ _ outside] using valid
  · apply List.all_eq_true.mpr
    intro incident member
    obtain ⟨beforeMember, outside⟩ := List.mem_filter.mp member
    simp only [Bool.not_eq_true'] at outside
    have valid := List.all_eq_true.mp prior.1.2 incident beforeMember
    change (occurrenceOwnerValid after incident.wait.processInstanceId incident.wait.owner
      incident.wait.elementId incident.wait.activation && _) = true
    change (occurrenceOwnerValid state incident.wait.processInstanceId incident.wait.owner
      incident.wait.elementId incident.wait.activation && _) = true at valid
    simpa only [after, cancelScopeSubtree_occurrence_owner_frame state root disposition incident.wait.owner _ _ _ outside] using valid
  · have localValidity := prior.2
    change (waits.all _ && state.variables.activities.all _) = true at localValidity
    change ((after.effectWaits ++ after.effectIncidents.map (·.wait)).all _ &&
      after.variables.activities.all _) = true
    rw [Bool.and_eq_true] at localValidity ⊢
    refine ⟨?_, ?_⟩
    · apply List.all_eq_true.mpr
      intro wait member
      have kept := member
      rw [waitFilter, List.mem_filter] at kept
      have outside : cancelled wait.owner = false := by simpa only [Bool.not_eq_true'] using kept.2
      have identityCensus :
          ((after.effectWaits ++ after.effectIncidents.map (·.wait)).filter fun candidate =>
            decide (effectWaitOccurrenceId candidate = effectWaitOccurrenceId wait)) =
          (waits.filter fun candidate => decide (effectWaitOccurrenceId candidate = effectWaitOccurrenceId wait)) := by
        rw [waitFilter, List.filter_filter]
        apply List.filter_congr
        intro other otherMember
        by_cases sameId : effectWaitOccurrenceId other = effectWaitOccurrenceId wait
        · have same := effect_program_validity_identity_injective program state original wait other kept.1 otherMember sameId
          simp only [same, outside, Bool.not_false, Bool.and_true]
        · simp [sameId]
      have localCensus : after.variables.activities.filter (activityScopeMatches (effectWaitOccurrenceId wait)) =
          state.variables.activities.filter (activityScopeMatches (effectWaitOccurrenceId wait)) := by
        change (state.variables.activities.filter _).filter _ = _
        rw [List.filter_filter]
        apply List.filter_congr
        intro dataScope localMember
        cases named : activityScopeMatches (effectWaitOccurrenceId wait) dataScope with
        | false => simp
        | true =>
          have retained := (cancelScopeSubtree_effect_local_retention program state root disposition original incidents
            wait kept.1 dataScope localMember named).mpr outside
          have retainedByFilter := (List.mem_filter.mp retained).2
          simp only [retainedByFilter, Bool.and_true]
      change (decide (_ = 1) && match after.variables.activities.filter
          (activityScopeMatches (effectWaitOccurrenceId wait)) with
        | [dataScope] => decide (dataScope.bindings = wait.arguments)
        | _ => false) = true
      rw [identityCensus, localCensus]
      exact List.all_eq_true.mp localValidity.1 wait kept.1
    · apply List.all_eq_true.mpr
      intro dataScope retained
      have localMember := (List.mem_filter.mp retained).1
      have originalLocal := List.all_eq_true.mp localValidity.2 dataScope localMember
      cases owner : dataScope.owner with
      | activityOccurrence id => rfl
      | effectOccurrence id =>
        change decide (((after.effectWaits ++ after.effectIncidents.map (·.wait)).filter fun wait =>
          activityScopeMatches (effectWaitOccurrenceId wait) dataScope).length = 1) = true
        have census : ((after.effectWaits ++ after.effectIncidents.map (·.wait)).filter fun wait =>
            activityScopeMatches (effectWaitOccurrenceId wait) dataScope) =
          waits.filter (fun wait => activityScopeMatches (effectWaitOccurrenceId wait) dataScope) := by
          rw [waitFilter, List.filter_filter]
          apply List.filter_congr
          intro wait member
          cases named : activityScopeMatches (effectWaitOccurrenceId wait) dataScope with
          | false => simp
          | true =>
            have outside := (cancelScopeSubtree_effect_local_retention program state root disposition original incidents
              wait member dataScope localMember named).mp retained
            have kept : (!cancelled wait.owner) = true := by simpa only [Bool.not_eq_true'] using outside
            simp only [kept, Bool.and_true]
        rw [census]
        simpa only [owner] using originalLocal

/-- The actual cleanup preserves the complete wait validator from predecessor facts alone. -/
theorem cancelScopeSubtree_complete_wait_program_validity (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (incidents : effectIncidentAssociationsValid state = true) :
    flowNodeOccurrenceWaitProgramValidity program (cancelScopeSubtree state root disposition) = true := by
  have effectPrior := prior
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at effectPrior
  exact cancelScopeSubtree_wait_program_validity program state root disposition prior
    (cancelScopeSubtree_effect_program_validity program state root disposition effectPrior.2 incidents)

end BpmnSemantics.SemanticProcess.InternalCommutation
