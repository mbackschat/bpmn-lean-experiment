import BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import BpmnSemantics.SemanticProcess.ControlPositionMultiplicity

/-! Prepared origins bind public multiplicities to private places under the alias refusal rule in
the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

private theorem selectedInputOrigin?_declaration (program : Program)
    (place : ControlPlaceId) (owner : ScopeOccurrenceId) (origin : BpmnSequenceFlowOrigin)
    (found : selectedInputOrigin? program place owner = some origin) :
    ∃ declaration, program.controlPlaces.filter (fun candidate => decide (candidate.id = place)) =
      [declaration] ∧ declaration.origin = origin := by
  unfold selectedInputOrigin? at found
  generalize declarations : program.controlPlaces.filter
    (fun candidate => decide (candidate.id = place)) = places at found
  cases places with
  | nil => simp at found
  | cons declaration rest =>
      cases rest with
      | cons _ _ => simp at found
      | nil =>
          simp only [Option.bind_eq_bind, Option.bind_some] at found
          generalize bindings : program.controlPlaceScopes.filter
            (fun binding => decide (binding.controlPlaceId = place)) = scopes at found
          cases scopes with
          | nil => simp at found
          | cons binding rest =>
              cases rest with
              | cons _ _ => simp at found
              | nil =>
                  change (if binding.scopeId = owner.definitionScopeId then
                    some declaration.origin else none) = some origin at found
                  split at found
                  · exact ⟨declaration, rfl, Option.some.inj found⟩
                  · contradiction

theorem internalLocalControlPlaceOrigin?_declaration (program : Program)
    (place : ControlPlaceId) (owner : ScopeOccurrenceId) (origin : BpmnSequenceFlowOrigin)
    (found : internalLocalControlPlaceOrigin? program place owner = some origin) :
    ∃ declaration, declaration ∈ program.controlPlaces ∧ declaration.id = place ∧
      declaration.origin = origin ∧ uniqueControlPlace? program place = some declaration := by
  obtain ⟨declaration, declarations, originEq⟩ := selectedInputOrigin?_declaration program place owner origin
    (internalLocalControlPlaceOrigin?_selectedInputOrigin program place owner origin found)
  have member : declaration ∈ program.controlPlaces.filter
      (fun candidate => decide (candidate.id = place)) := by rw [declarations]; simp
  obtain ⟨member, idEq⟩ := List.mem_filter.mp member
  simp only [decide_eq_true_eq] at idEq
  obtain ⟨unique, uniqueEq⟩ := internalLocalControlPlaceOrigin?_unique_declaration program place owner origin found
  have originMember : declaration ∈ program.controlPlaces.filter
      (fun candidate => decide (candidate.origin.elementId = origin.elementId)) := by
    simp [member, originEq]
  rw [uniqueEq] at originMember
  have uniqueSame := List.eq_of_mem_singleton originMember
  subst unique
  have fullOrigin : program.controlPlaces.filter
      (fun candidate => decide (candidate.origin = declaration.origin)) = [declaration] := by
    have frame : program.controlPlaces.filter (fun candidate => decide (candidate.origin = declaration.origin)) =
        (program.controlPlaces.filter (fun candidate => decide (candidate.origin.elementId = origin.elementId))).filter
          (fun candidate => decide (candidate.origin = declaration.origin)) := by
      rw [List.filter_filter]
      apply List.filter_congr
      intro candidate _
      apply Bool.eq_iff_iff.mpr
      simp only [decide_eq_true_eq, Bool.and_eq_true]
      constructor
      · intro same
        exact ⟨same, by rw [same, originEq]⟩
      · exact And.left
    rw [frame, uniqueEq]
    simp
  refine ⟨declaration, member, idEq, originEq, ?_⟩
  simp [uniqueControlPlace?, declarations, fullOrigin]

theorem internalLocalControlPlaceOrigin?_tokenOrigin (program : Program)
    (place : ControlPlaceId) (owner : ScopeOccurrenceId) (origin : BpmnSequenceFlowOrigin)
    (found : internalLocalControlPlaceOrigin? program place owner = some origin) :
    tokenOrigin program { placeId := place, owner } = origin.elementId := by
  obtain ⟨declaration, _, _, originEq, unique⟩ :=
    internalLocalControlPlaceOrigin?_declaration program place owner origin found
  simp [tokenOrigin, unique, originEq]

private theorem uniqueControlPlace?_member (program : Program) (place : ControlPlaceId)
    (declaration : ControlPlace) (found : uniqueControlPlace? program place = some declaration) :
    declaration ∈ program.controlPlaces ∧ declaration.id = place := by
  unfold uniqueControlPlace? at found
  generalize declarations : program.controlPlaces.filter
    (fun candidate => decide (candidate.id = place)) = places at found
  cases places with
  | nil => simp at found
  | cons candidate rest =>
      cases rest with
      | cons _ _ => simp at found
      | nil =>
          change (match program.controlPlaces.filter (fun other => decide (other.origin = candidate.origin)) with
            | [_] => some candidate
            | _ => none) = some declaration at found
          split at found
          · cases found
            have member : declaration ∈ program.controlPlaces.filter
                (fun candidate => decide (candidate.id = place)) := by rw [declarations]; simp
            simpa only [List.mem_filter, decide_eq_true_eq] using member
          · contradiction

/-- The preparation's global Sequence Flow uniqueness check excludes aliases even outside the
currently occupied buckets; the projection's empty fallback cannot equal its nonempty origin. -/
theorem internalLocalControlPlaceOrigin?_tokenOrigin_iff (program : Program)
    (place : ControlPlaceId) (owner : ScopeOccurrenceId) (origin : BpmnSequenceFlowOrigin)
    (found : internalLocalControlPlaceOrigin? program place owner = some origin)
    (token : ControlToken) :
    tokenOrigin program token = origin.elementId ↔ token.placeId = place := by
  constructor
  · intro sameFlow
    obtain ⟨declaration, member, idEq, originEq, _⟩ :=
      internalLocalControlPlaceOrigin?_declaration program place owner origin found
    obtain ⟨unique, uniqueEq⟩ := internalLocalControlPlaceOrigin?_unique_declaration program place owner origin found
    cases selected : uniqueControlPlace? program token.placeId with
    | none =>
        have empty := congrArg SequenceFlowId.value sameFlow
        simp only [tokenOrigin, selected] at empty
        exact False.elim ((internalLocalControlPlaceOrigin?_provenance program place owner origin found).1 empty.symm)
    | some candidate =>
        obtain ⟨candidateMember, candidateId⟩ := uniqueControlPlace?_member program token.placeId candidate selected
        have candidateOrigin : candidate.origin.elementId = origin.elementId := by
          simpa [tokenOrigin, selected] using sameFlow
        have leftMember : declaration ∈ program.controlPlaces.filter
            (fun candidate => decide (candidate.origin.elementId = origin.elementId)) := by
          simp [member, originEq]
        have rightMember : candidate ∈ program.controlPlaces.filter
            (fun candidate => decide (candidate.origin.elementId = origin.elementId)) := by
          simp [candidateMember, candidateOrigin]
        rw [uniqueEq] at leftMember rightMember
        have same := (List.eq_of_mem_singleton rightMember).trans
          (List.eq_of_mem_singleton leftMember).symm
        exact candidateId.symm.trans ((congrArg ControlPlace.id same).trans idEq)
  · intro samePlace
    have sameOrigin : tokenOrigin program token = tokenOrigin program { placeId := place, owner } := by
      simp only [tokenOrigin, samePlace]
    exact sameOrigin.trans (internalLocalControlPlaceOrigin?_tokenOrigin program place owner origin found)

theorem internalLocalControlPlaceOrigin?_injective (program : Program)
    (left right : ControlPlaceId) (owner : ScopeOccurrenceId)
    (leftOrigin rightOrigin : BpmnSequenceFlowOrigin)
    (leftFound : internalLocalControlPlaceOrigin? program left owner = some leftOrigin)
    (rightFound : internalLocalControlPlaceOrigin? program right owner = some rightOrigin)
    (same : leftOrigin.elementId = rightOrigin.elementId) : left = right := by
  apply Eq.symm
  apply (internalLocalControlPlaceOrigin?_tokenOrigin_iff program left owner leftOrigin leftFound
    { placeId := right, owner }).mp
  rw [internalLocalControlPlaceOrigin?_tokenOrigin program right owner rightOrigin rightFound, same]

theorem internalLocalControlPlaceOrigin?_projected_count (program : Program)
    (place : ControlPlaceId) (owner : ScopeOccurrenceId) (origin : BpmnSequenceFlowOrigin)
    (found : internalLocalControlPlaceOrigin? program place owner = some origin)
    (tokens : List ControlToken) (queriedOwner : ScopeOccurrenceId) :
    tokenMultiplicityAt (projectTokens program tokens)
      { sequenceFlowId := origin.elementId, owner := queriedOwner, multiplicity := 1 } =
        tokens.count { placeId := place, owner := queriedOwner } := by
  rw [projectTokens_multiplicity, List.count_eq_countP]
  apply List.countP_congr
  intro token _
  simp only [sameTokenPosition, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq]
  rw [eq_comm (a := origin.elementId), internalLocalControlPlaceOrigin?_tokenOrigin_iff program place owner origin found token]
  cases token
  simp [eq_comm]

end BpmnSemantics.SemanticProcess.InternalCommutation
