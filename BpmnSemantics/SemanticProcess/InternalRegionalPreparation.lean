module

public import BpmnSemantics.SemanticProcess.InternalRegionalPublication

/-! Complete regional preparation binds the selected removal, exact predecessor region,
dependency footprint, and publication before invoking the existing evaluator.
-/

@[expose] public section

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
  if program.operations.any (fun operation =>
      match operation with | .cancelTransaction .. => true | _ => false) then none
  else if program.compensationEventSubProcessSnapshots ≠ none then none
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
  split at found <;> try contradiction
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

/-- CDATA's scalar copy-back and CVM-OUT-01's mapped writes exclude them from control-only regional preparation. -/
theorem prepareInternalRegional_return_data_empty (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (data : CallDataInterface)
    (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program state
      (.returnProcess id origin process definition output data) = some prepared) : data = .empty := by
  have closed := (prepareInternalRegional_facts program state _ prepared found).2.2.2.1
  have selected := (ownershipClosedSelection_facts program state _ prepared.selection closed).1
  cases data with
  | empty => rfl
  | scalar =>
      rw [regionalSelection_scalar_return_refused] at selected
      contradiction
  | variableMappings =>
      rw [regionalSelection_mapped_return_refused] at selected
      contradiction

theorem prepareInternalRegional_of_components (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (publication : InternalRegionalPublicationTemplate)
    (domain : RootCompensationExecutionDomain program)
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
  intro candidate member
  have admitted := domain candidate member
  cases candidate <;> simp_all

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


end BpmnSemantics.SemanticProcess.InternalCommutation
