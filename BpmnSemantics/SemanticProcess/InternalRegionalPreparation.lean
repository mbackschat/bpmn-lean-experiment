import BpmnSemantics.SemanticProcess.InternalRegionalPublication

/-! Complete regional preparation binds the selected removal, exact predecessor region,
dependency footprint, and publication before invoking the existing evaluator.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

structure PreparedInternalRegional where
  selection : InternalRegionalSelection
  region : InternalOccurrenceRegion
  footprint : InternalRegionalStateFootprint
  publicationTemplate : InternalRegionalPublicationTemplate
  deriving Repr, DecidableEq

def prepareInternalRegional? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalRegional := do
  if program.compensationEventSubProcessSnapshots ≠ none then none
  else if program.operations.filter (fun candidate => decide (candidate.id = operation.id)) ≠ [operation] then none
  else if !SemanticProcessJson.isSafeWireNat state.logicalTimeMs then none
  else
    let selected ← selectInternalOwnershipClosedRegional? program state operation
    let region ← deriveInternalOccurrenceRegion? state selected.root.id
    let footprint ← regionalStateFootprint? state selected region
    let publication ← regionalPublicationTemplate? program state selected region
    pure { selection := selected, region, footprint, publicationTemplate := publication }

def applyPreparedInternalRegional? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalRegional) : Option RuntimeState :=
  if prepareInternalRegional? program state prepared.selection.operation = some prepared then
    fire? program prepared.selection.operation state
  else none

theorem prepareInternalRegional_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program state operation = some prepared) :
    program.compensationEventSubProcessSnapshots = none ∧
    program.operations.filter (fun candidate => decide (candidate.id = operation.id)) = [operation] ∧
    SemanticProcessJson.isSafeWireNat state.logicalTimeMs = true ∧
    selectInternalOwnershipClosedRegional? program state operation = some prepared.selection ∧
    deriveInternalOccurrenceRegion? state prepared.selection.root.id = some prepared.region ∧
    regionalStateFootprint? state prepared.selection prepared.region = some prepared.footprint ∧
    regionalPublicationTemplate? program state prepared.selection prepared.region = some prepared.publicationTemplate := by
  unfold prepareInternalRegional? at found
  split at found
  · contradiction
  · split at found
    · contradiction
    · split at found
      · contradiction
      · obtain ⟨selected, selection, found⟩ := Option.bind_eq_some_iff.mp found
        obtain ⟨region, derived, found⟩ := Option.bind_eq_some_iff.mp found
        obtain ⟨footprint, dependencies, found⟩ := Option.bind_eq_some_iff.mp found
        obtain ⟨publication, published, found⟩ := Option.bind_eq_some_iff.mp found
        cases found
        simp_all

theorem prepareInternalRegional_of_components (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (publication : InternalRegionalPublicationTemplate)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (declared : program.operations.filter (fun candidate => decide (candidate.id = operation.id)) = [operation])
    (time : SemanticProcessJson.isSafeWireNat state.logicalTimeMs = true)
    (selection : selectInternalOwnershipClosedRegional? program state operation = some selected)
    (derived : deriveInternalOccurrenceRegion? state selected.root.id = some region)
    (dependencies : regionalStateFootprint? state selected region = some footprint)
    (published : regionalPublicationTemplate? program state selected region = some publication) :
    prepareInternalRegional? program state operation =
      some { selection := selected, region, footprint, publicationTemplate := publication } := by
  simp [prepareInternalRegional?, snapshots, declared, time, selection, derived, dependencies, published]

theorem applyPreparedInternalRegional_altered_region_refused (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalRegional)
    (altered : deriveInternalOccurrenceRegion? state prepared.selection.root.id ≠ some prepared.region) :
    applyPreparedInternalRegional? program state prepared = none := by
  unfold applyPreparedInternalRegional?
  split
  · next found => exact False.elim (altered (prepareInternalRegional_facts program state _ prepared found).2.2.2.2.1)
  · rfl

theorem applyPreparedInternalRegional_altered_footprint_refused (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalRegional)
    (altered : regionalStateFootprint? state prepared.selection prepared.region ≠ some prepared.footprint) :
    applyPreparedInternalRegional? program state prepared = none := by
  unfold applyPreparedInternalRegional?
  split
  · next found => exact False.elim (altered (prepareInternalRegional_facts program state _ prepared found).2.2.2.2.2.1)
  · rfl

theorem applyPreparedInternalRegional_altered_publication_refused (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalRegional)
    (altered : regionalPublicationTemplate? program state prepared.selection prepared.region ≠
      some prepared.publicationTemplate) :
    applyPreparedInternalRegional? program state prepared = none := by
  unfold applyPreparedInternalRegional?
  split
  · next found => exact False.elim (altered (prepareInternalRegional_facts program state _ prepared found).2.2.2.2.2.2)
  · rfl

theorem prepareInternalRegional_operation (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program state operation = some prepared) :
    prepared.selection.operation = operation := by
  have selected := (prepareInternalRegional_facts program state operation prepared found).2.2.2.1
  exact regionalSelection_operation program state operation prepared.selection
    (ownershipClosedSelection_facts program state operation prepared.selection selected).1

/-- A successful preparation permits the actual evaluator step; it cannot manufacture success
or silently refuse a retained selection after dependency and publication construction. -/
theorem prepareInternalRegional_executes (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program state operation = some prepared) :
    ∃ after, fire? program operation state = some after ∧
      applyPreparedInternalRegional? program state prepared = some after := by
  obtain ⟨snapshots, _, _, selected, _⟩ := prepareInternalRegional_facts program state operation prepared found
  have selectedBefore := (ownershipClosedSelection_facts program state operation prepared.selection selected).1
  obtain ⟨after, result⟩ := regionalSelection_refines program state operation prepared.selection snapshots selectedBefore
  exact ⟨after, result, by simp [applyPreparedInternalRegional?,
    prepareInternalRegional_operation program state operation prepared found, found, result]⟩

/-- Predecessor publication supplies the valid position, and exact declaration plus ownership
closure supply the selected evaluator's position and reference preservation premises. -/
theorem preparedInternalRegional_preserves_position_and_references (program : Program) (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (identities : waitIdentitiesUnique before = true)
    (activities : activityRecordsOwnLiveWork before = true)
    (races : eventRaceAssociationsValid before = true)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ hosting after, runningInstance? before = some hosting ∧
      applyPreparedInternalRegional? program before prepared = some after ∧
      runtimePositionValid program hosting after = true ∧
      activityRecordsOwnLiveWork after = true ∧ eventRaceAssociationsValid after = true := by
  obtain ⟨snapshots, declared, _, selected, _, _, published⟩ :=
    prepareInternalRegional_facts program before operation prepared found
  obtain ⟨hosting, positions, _, _, _, _, running, projected, _⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have position : runtimePositionValid program hosting before = true := by
    unfold projectControlPosition? at projected
    split at projected
    · assumption
    · contradiction
  have member : operation ∈ program.operations :=
    (List.mem_filter.mp (by rw [declared]; simp)).1
  obtain ⟨after, result, retainedPosition, retainedActivities, retainedRaces⟩ :=
    ownershipClosedSelection_preserves_position_and_references program before hosting operation prepared.selection
      snapshots position structural member identities activities races selected
  refine ⟨hosting, after, running, ?_, retainedPosition, retainedActivities, retainedRaces⟩
  simp [applyPreparedInternalRegional?, prepareInternalRegional_operation program before operation prepared found, found, result]

end BpmnSemantics.SemanticProcess.InternalCommutation
