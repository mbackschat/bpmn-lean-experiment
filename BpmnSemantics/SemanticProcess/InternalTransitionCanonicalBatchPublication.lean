import BpmnSemantics.SemanticProcess.InternalTransitionBatchPublication
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationOrder

/-! Actual finite mixed publication uses ranks of complete predecessor templates under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def acceptedPreparedTransitionBatch? (program : Program) (instanceId commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (prepared : List PreparedInternalTransition) :
    Option (RuntimeState × List InstantiatedInternalTransitionPublication) := do
  let templates ← prepared.mapM (preparedTransitionPublicationTemplate? program state)
  let (final, publications) ← runPreparedTransitionBatchPublication? program instanceId commandId
    (internalTransitionPublicationIndex first templates) state prepared
  some (final, canonicalInstantiatedTransitionPublications publications)

theorem prepared_transition_canonical_batch_publication (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (instanceId commandId : SemanticId) (first : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (selected : PreparedTransitionList program state prepared)
    (independent : prepared.Pairwise PreparedInternalTransition.Independent)
    (distinct : prepared.Pairwise (fun left right => left.operation.id ≠ right.operation.id)) :
    ∃ templates,
      prepared.mapM (preparedTransitionPublicationTemplate? program state) = some templates ∧
      acceptedPreparedTransitionBatch? program instanceId commandId first state prepared =
        some (applyInternalTransitionBatch state prepared,
          instantiateTransitionPublicationBatch commandId first templates) := by
  obtain ⟨templates, found, _⟩ := prepared_transition_batch_publications program state prepared
    instanceId commandId (fun _ => 0) programWF beforeWF running projectable snapshots selected independent
  obtain ⟨actualTemplates, actualFound, actualRun⟩ := prepared_transition_batch_publications program state prepared
    instanceId commandId (internalTransitionPublicationIndex first templates) programWF beforeWF
    running projectable snapshots selected independent
  rw [found] at actualFound
  cases actualFound
  have unique := prepared_transition_batch_template_ids_unique program state prepared templates found distinct
  refine ⟨templates, found, ?_⟩
  simp only [acceptedPreparedTransitionBatch?, found, Bind.bind, Option.bind, actualRun,
    canonicalInstantiatedTransitionPublications_numbering commandId first templates unique]

/-- Every multiplicity-preserving permutation has the same successful actual publication and raw
final state; validity and both execution folds are derived from the original preparations. -/
theorem prepared_transition_canonical_batch_publication_perm (program : Program) (state : RuntimeState)
    (left right : List PreparedInternalTransition) (instanceId commandId : SemanticId) (first : Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (selected : PreparedTransitionList program state left)
    (independent : left.Pairwise PreparedInternalTransition.Independent)
    (distinct : left.Pairwise (fun a b => a.operation.id ≠ b.operation.id))
    (permutation : left.Perm right) :
    ∃ final publications,
      acceptedPreparedTransitionBatch? program instanceId commandId first state left = some (final, publications) ∧
      acceptedPreparedTransitionBatch? program instanceId commandId first state right = some (final, publications) ∧
      applyInternalTransitionBatch state left = final ∧
      applyInternalTransitionBatch state right = final ∧
      runPreparedTransitionBatch? program state left = some final ∧
      runPreparedTransitionBatch? program state right = some final ∧
      fireInternalTransitionBatch? program state (left.map PreparedInternalTransition.operation) = some final ∧
      fireInternalTransitionBatch? program state (right.map PreparedInternalTransition.operation) = some final ∧
      runtimeStateWellFormed program instanceId final = true ∧
      final.control = .running instanceId ∧
      (projectOpenFlowNodeOccurrences? program final).isSome = true := by
  have rightSelected : PreparedTransitionList program state right :=
    fun member present => selected member (permutation.mem_iff.mpr present)
  have rightIndependent := independent.perm permutation PreparedInternalTransition.independent_symm
  have rightDistinct := distinct.perm permutation Ne.symm
  obtain ⟨leftTemplates, leftFound, leftAccepted⟩ := prepared_transition_canonical_batch_publication
    program state left instanceId commandId first programWF beforeWF running projectable snapshots
    selected independent distinct
  obtain ⟨rightTemplates, rightFound, rightAccepted⟩ := prepared_transition_canonical_batch_publication
    program state right instanceId commandId first programWF beforeWF running projectable snapshots
    rightSelected rightIndependent rightDistinct
  have templatesPerm := prepared_transition_batch_templates_perm program state left right
    leftTemplates rightTemplates leftFound rightFound permutation
  have unique := prepared_transition_batch_template_ids_unique program state left leftTemplates leftFound distinct
  have samePublication := instantiateTransitionPublicationBatch_perm commandId first leftTemplates
    rightTemplates unique templatesPerm
  have sameState := prepared_transition_batch_perm program state left right instanceId programWF beforeWF
    running projectable selected independent permutation
  have leftApplies := prepared_transition_batch_applies program state left instanceId programWF beforeWF
    running projectable snapshots selected independent
  have rightApplies := prepared_transition_batch_applies program state right instanceId programWF beforeWF
    running projectable snapshots rightSelected rightIndependent
  have valid := prepared_transition_batch_preserves program state left instanceId programWF beforeWF
    running projectable selected independent
  rw [← sameState, ← samePublication] at rightAccepted
  rw [← sameState] at rightApplies
  exact ⟨applyInternalTransitionBatch state left,
    instantiateTransitionPublicationBatch commandId first leftTemplates,
    leftAccepted, rightAccepted, rfl, sameState.symm, leftApplies.1, rightApplies.1,
    leftApplies.2, rightApplies.2, valid⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
