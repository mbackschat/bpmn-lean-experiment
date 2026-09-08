import BpmnSemantics.SemanticProcess.ControlPositionContract
import BpmnSemantics.SemanticProcess.InternalCommutationCore
import BpmnSemantics.SemanticProcess.TokenPatch

/-! Local-control publication templates retain signed token units from the immutable Program and
patch, as required by the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def internalLocalControlTokenResidual (owner : ScopeOccurrenceId) (flow : SequenceFlowId)
    (consumed produced : List ControlPlaceId) (place : ControlPlaceId) :
    Option PublicControlTokenPosition :=
  let multiplicity := consumed.count place - produced.count place
  if multiplicity = 0 then none else some { sequenceFlowId := flow, owner, multiplicity }

def internalLocalControlPlaceOrigin? (program : Program) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) : Option BpmnSequenceFlowOrigin := do
  let origin ← selectedInputOrigin? program place owner
  if origin.elementId.value = "" then none
  else if (program.controlPlaces.filter fun candidate =>
      decide (candidate.origin.elementId = origin.elementId)).length = 1 then some origin
  else none

theorem internalLocalControlPlaceOrigin?_selectedInputOrigin
    (program : Program) (place : ControlPlaceId) (owner : ScopeOccurrenceId)
    (origin : BpmnSequenceFlowOrigin)
    (resolved : internalLocalControlPlaceOrigin? program place owner = some origin) :
    selectedInputOrigin? program place owner = some origin := by
  unfold internalLocalControlPlaceOrigin? at resolved
  cases selected : selectedInputOrigin? program place owner with
  | none => simp [selected] at resolved
  | some candidate =>
      simp only [selected, Option.bind_eq_bind, Option.bind_some] at resolved
      split at resolved
      · contradiction
      · split at resolved
        · cases resolved
          rfl
        · contradiction

theorem internalLocalControlPlaceOrigin?_provenance
    (program : Program) (place : ControlPlaceId) (owner : ScopeOccurrenceId)
    (origin : BpmnSequenceFlowOrigin)
    (resolved : internalLocalControlPlaceOrigin? program place owner = some origin) :
    origin.elementId.value ≠ "" ∧
      (program.controlPlaces.filter fun candidate =>
        decide (candidate.origin.elementId = origin.elementId)).length = 1 := by
  have selected := internalLocalControlPlaceOrigin?_selectedInputOrigin _ _ _ _ resolved
  simp only [internalLocalControlPlaceOrigin?, selected, Option.bind_eq_bind,
    Option.bind_some] at resolved
  split at resolved
  · contradiction
  · split at resolved
    · exact ⟨by assumption, by assumption⟩
    · contradiction

theorem internalLocalControlPlaceOrigin?_unique_declaration
    (program : Program) (place : ControlPlaceId) (owner : ScopeOccurrenceId)
    (origin : BpmnSequenceFlowOrigin)
    (resolved : internalLocalControlPlaceOrigin? program place owner = some origin) :
    ∃ declaration, (program.controlPlaces.filter fun candidate =>
      decide (candidate.origin.elementId = origin.elementId)) = [declaration] :=
  List.length_eq_one_iff.mp
    (internalLocalControlPlaceOrigin?_provenance program place owner origin resolved).2

theorem internalLocalControlPlaceOrigin?_reject_alias
    (program : Program) (place : ControlPlaceId) (owner : ScopeOccurrenceId)
    (origin : BpmnSequenceFlowOrigin) (left right : ControlPlace)
    (selected : selectedInputOrigin? program place owner = some origin)
    (leftMember : left ∈ program.controlPlaces) (rightMember : right ∈ program.controlPlaces)
    (leftOrigin : left.origin.elementId = origin.elementId)
    (rightOrigin : right.origin.elementId = origin.elementId)
    (different : left.id ≠ right.id) :
    internalLocalControlPlaceOrigin? program place owner = none := by
  cases resolved : internalLocalControlPlaceOrigin? program place owner with
  | none => rfl
  | some found =>
      have exactOrigin := internalLocalControlPlaceOrigin?_selectedInputOrigin
        program place owner found resolved
      rw [selected] at exactOrigin
      cases exactOrigin
      obtain ⟨declaration, unique⟩ :=
        internalLocalControlPlaceOrigin?_unique_declaration program place owner origin resolved
      have leftFiltered : left ∈ program.controlPlaces.filter (fun candidate =>
          decide (candidate.origin.elementId = origin.elementId)) := by
        simp [leftMember, leftOrigin]
      have rightFiltered : right ∈ program.controlPlaces.filter (fun candidate =>
          decide (candidate.origin.elementId = origin.elementId)) := by
        simp [rightMember, rightOrigin]
      rw [unique] at leftFiltered rightFiltered
      have same := (List.eq_of_mem_singleton leftFiltered).trans
        (List.eq_of_mem_singleton rightFiltered).symm
      exact False.elim (different (congrArg ControlPlace.id same))

def internalLocalControlPositionDelta? (program : Program) (patch : TokenPatch) :
    Option PublicControlPositionDelta := do
  let origins ← (patch.consumed ++ patch.produced).eraseDups.mapM fun place => do
    let origin ← internalLocalControlPlaceOrigin? program place patch.owner
    pure (place, origin)
  let ordered := sortBy (fun left right : ControlPlaceId × BpmnSequenceFlowOrigin =>
    decide (left.2.elementId.value < right.2.elementId.value)) origins
  some
    { consumedTokens := ordered.filterMap fun (place, origin) =>
        internalLocalControlTokenResidual patch.owner origin.elementId
          patch.consumed patch.produced place
      producedTokens := ordered.filterMap fun (place, origin) =>
        internalLocalControlTokenResidual patch.owner origin.elementId
          patch.produced patch.consumed place
      enteredScopes := []
      exitedScopes := [] }

theorem internalLocalControlTokenResidual_repeated
    (owner : ScopeOccurrenceId) (flow : SequenceFlowId) (place : ControlPlaceId) :
    internalLocalControlTokenResidual owner flow [place, place] [place] place =
      some { sequenceFlowId := flow, owner, multiplicity := 1 } := by
  simp [internalLocalControlTokenResidual]

theorem internalLocalControlTokenResidual_turnover
    (owner : ScopeOccurrenceId) (flow : SequenceFlowId)
    (units : List ControlPlaceId) (place : ControlPlaceId) :
    internalLocalControlTokenResidual owner flow units units place = none := by
  simp [internalLocalControlTokenResidual]

end BpmnSemantics.SemanticProcess.InternalCommutation
