import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs
import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmissionProofs
import BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta

/-! # Admitted token-patch position totality

PMIS-ADMIT-01 supplies unique Sequence Flow source identities in addition to
structural place keys. Resolved same-scope ports therefore pass every immutable
origin check of local-control position construction, independently of token
availability, successful preparation, or a future publication.
-/

namespace BpmnSemantics.SemanticProcess.ParallelScopeStart

open BpmnSemantics

/-- PMIS-ADMIT-01 rejects source-origin aliases that raw Program structural validation permits. -/
theorem analyzeProgram_control_place_origins_unique (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) :
    (program.controlPlaces.map (·.origin.elementId)).Nodup := by
  have fromGuard (source : SemanticOperation → Option String)
      (checked : (program.processId.value :: program.controlPlaces.map (·.origin.elementId.value) ++
        program.operations.filterMap source).eraseDups.length =
        (program.processId.value :: program.controlPlaces.map (·.origin.elementId.value) ++
        program.operations.filterMap source).length) :
      (program.controlPlaces.map (·.origin.elementId.value)).Nodup := by
    have unique := StructuredComposition.equal_deduplicated_length_has_unique_names _ checked
    exact (List.nodup_append.mp (List.nodup_cons.mp unique).2).1
  have strings : (program.controlPlaces.map (·.origin.elementId.value)).Nodup := by
    unfold analyzeProgram at analyzed
    split at analyzed <;> try contradiction
    split at analyzed <;> try contradiction
    split at analyzed <;> try contradiction
    split at analyzed <;> try contradiction
    split at analyzed <;> try contradiction
    split at analyzed <;> try contradiction
    try dsimp only at analyzed
    split at analyzed <;> try contradiction
    split at analyzed <;> try contradiction
    split at analyzed <;> try contradiction
    try dsimp only at analyzed
    split at analyzed <;> try contradiction
    rename_i checked
    simp only [bne_iff_ne, Classical.not_not] at checked
    exact fromGuard _ checked
  apply List.Pairwise.of_map (S := (· ≠ ·)) SequenceFlowId.value
    (fun _ _ different same => different (congrArg SequenceFlowId.value same))
  rw [List.map_map]
  exact strings

end BpmnSemantics.SemanticProcess.ParallelScopeStart

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem selected_origin_declaration (program : Program) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (origin : BpmnSequenceFlowOrigin)
    (selected : selectedInputOrigin? program place owner = some origin) :
    ∃ declaration ∈ program.controlPlaces, declaration.origin = origin := by
  unfold selectedInputOrigin? at selected
  generalize declarations : program.controlPlaces.filter
    (fun candidate => decide (candidate.id = place)) = candidates at selected
  cases candidates with
  | nil => simp at selected
  | cons declaration rest =>
      cases rest with
      | cons other tail => simp at selected
      | nil =>
          simp only [bind, Option.bind_some] at selected
          split at selected <;> try contradiction
          split at selected <;> try contradiction
          have member : declaration ∈ program.controlPlaces :=
            (List.mem_filter.mp (declarations.symm ▸ List.mem_singleton_self declaration)).1
          exact ⟨declaration, member, Option.some.inj selected⟩

/-- Structural nonempty origins and the separate source-origin census discharge the position evaluator's extra provenance checks. -/
theorem selectedInputOrigin_has_local_control_origin (program : Program) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (origin : BpmnSequenceFlowOrigin)
    (wellFormed : programWellFormed program = true)
    (origins : (program.controlPlaces.map (·.origin.elementId)).Nodup)
    (selected : selectedInputOrigin? program place owner = some origin) :
    internalLocalControlPlaceOrigin? program place owner = some origin := by
  obtain ⟨declaration, member, originEq⟩ := selected_origin_declaration program place owner origin selected
  have uniqueOrigin := filter_key_eq_singleton_of_nodup program.controlPlaces (·.origin.elementId)
    declaration origins member
  have nonemptyOrigins : program.controlPlaces.all (fun place =>
      nonempty place.id.value && nonempty place.origin.elementId.value) = true := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    grind
  have nonemptyOrigin : declaration.origin.elementId.value ≠ "" := by
    have valid := List.all_eq_true.mp nonemptyOrigins declaration member
    simp only [Bool.and_eq_true] at valid
    simpa [nonempty] using valid.2
  rw [← originEq] at selected ⊢
  simp [internalLocalControlPlaceOrigin?, selected, nonemptyOrigin, uniqueOrigin]

theorem mapM_total (values : List α) (project : α → Option β)
    (total : ∀ value ∈ values, ∃ result, project value = some result) :
    ∃ results, values.mapM project = some results := by
  induction values with
  | nil => exact ⟨[], rfl⟩
  | cons first rest ih =>
      obtain ⟨head, found⟩ := total first (by simp)
      obtain ⟨tail, mapped⟩ := ih (fun value member => total value (by simp [member]))
      exact ⟨head :: tail, by simp only [List.mapM_cons, found, mapped, bind, Option.bind_some, Option.pure_def]⟩

/-- Every patch port of a resolved same-scope operation has a total static position delta; token multiplicity remains in the original patch lists. -/
theorem resolved_token_patch_has_position_delta (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation) (patch : TokenPatch)
    (wellFormed : programWellFormed program = true)
    (origins : (program.controlPlaces.map (·.origin.elementId)).Nodup)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (sameScope : operationControlPlacesShareOwner operation = true)
    (ownerEq : patch.owner = candidate.owner)
    (ports : ∀ place ∈ patch.consumed ++ patch.produced, place ∈ operationControlPlaces operation) :
    ∃ delta, internalLocalControlPositionDelta? program patch = some delta := by
  have total (place : ControlPlaceId) (member : place ∈ (patch.consumed ++ patch.produced).eraseDups) :
      ∃ pair, (do
        let origin ← internalLocalControlPlaceOrigin? program place patch.owner
        pure (place, origin)) = some pair := by
    have port : place ∈ operationControlPlaces operation := ports place (by simpa using member)
    obtain ⟨origin, selected⟩ := resolved_selectedInputOrigin program state candidate operation place
      wellFormed resolved sameScope port
    have found : internalLocalControlPlaceOrigin? program place patch.owner = some origin := by
      rw [ownerEq]
      exact selectedInputOrigin_has_local_control_origin program place candidate.owner origin wellFormed origins selected
    exact ⟨(place, origin), by simp only [found, bind, Option.bind_some, Option.pure_def]⟩
  obtain ⟨mappedOrigins, mapped⟩ := mapM_total (patch.consumed ++ patch.produced).eraseDups _ total
  unfold internalLocalControlPositionDelta?
  rw [mapped]
  exact ⟨_, rfl⟩

end BpmnSemantics.SemanticProcess.InternalCommutation

namespace BpmnSemantics.SemanticProcess.ParallelScopeStart

open InternalCommutation

/-- PMIS admission closes all static position-construction checks for resolved Fork, Join, and End patches before preparation. -/
theorem resolved_token_patch_has_position_delta (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation) (patch : TokenPatch)
    (resolved : InternalCommutation.resolveInternalOperationOccurrence? program state candidate = some operation)
    (sameScope : operationControlPlacesShareOwner operation = true)
    (ownerEq : patch.owner = candidate.owner)
    (ports : ∀ place ∈ patch.consumed ++ patch.produced, place ∈ operationControlPlaces operation) :
    ∃ delta, InternalCommutation.internalLocalControlPositionDelta? program patch = some delta :=
  InternalCommutation.resolved_token_patch_has_position_delta program state candidate operation patch
    (analyzeProgram_incidence_admission program analysis analyzed).1
    (analyzeProgram_control_place_origins_unique program analysis analyzed) resolved sameScope ownerEq ports

end BpmnSemantics.SemanticProcess.ParallelScopeStart
