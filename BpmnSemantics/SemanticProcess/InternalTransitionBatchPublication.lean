import BpmnSemantics.SemanticProcess.InternalTransitionBatch
import BpmnSemantics.SemanticProcess.InternalTransitionPublicationTemplate

/-! Every mixed execution prefix publishes its original prepared value under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem prepared_transition_templates_after_step (program : Program) (state : RuntimeState)
    (step : PreparedInternalTransition) (queries : List PreparedInternalTransition) :
    queries.mapM (preparedTransitionPublicationTemplate? program (step.apply state)) =
      queries.mapM (preparedTransitionPublicationTemplate? program state) := by
  induction queries with
  | nil => rfl
  | cons head tail ih =>
      simp only [List.mapM_cons, prepared_transition_template_after_step, ih]

/-- Every actual prefix publication equals its complete original template at the assigned index.
Canonical assignment is supplied after sorting; this theorem does not infer indices from execution order. -/
theorem prepared_transition_batch_publications (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (instanceId commandId : SemanticId)
    (indexForOperation : OperationId → Nat)
    (programWF : programWellFormed program = true)
    (beforeWF : runtimeStateWellFormed program instanceId state = true)
    (running : state.control = .running instanceId)
    (projectable : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (selected : PreparedTransitionList program state prepared)
    (independent : prepared.Pairwise PreparedInternalTransition.Independent) :
    ∃ templates,
      prepared.mapM (preparedTransitionPublicationTemplate? program state) = some templates ∧
      runPreparedTransitionBatchPublication? program instanceId commandId indexForOperation state prepared =
        some (applyInternalTransitionBatch state prepared,
          templates.map fun template => template.instantiate commandId
            (indexForOperation template.record.operationId)) := by
  induction prepared generalizing state with
  | nil => exact ⟨[], rfl, rfl⟩
  | cons head tail ih =>
      have headPrepared := selected head (by simp)
      have preserved := prepared_transition_preserves program state head instanceId programWF
        beforeWF running projectable headPrepared
      have remaining := prepared_transition_tail program state head tail selected
        (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state beforeWF) independent
      obtain ⟨templates, tailMap, tailRun⟩ := ih (head.apply state) preserved.1 preserved.2.1
        preserved.2.2 remaining (List.pairwise_cons.mp independent).2
      rw [prepared_transition_templates_after_step program state head tail] at tailMap
      obtain ⟨template, headMap, headActual⟩ := prepared_transition_publication_template_accepted
        program state head instanceId commandId (indexForOperation head.operation.id)
        programWF beforeWF running projectable headPrepared
      have headId := prepared_transition_template_operation_id program state head template headMap
      have applied := (prepared_transition_applies program state head snapshots headPrepared).2
      refine ⟨template :: templates, ?_, ?_⟩
      · simp [List.mapM_cons, headMap, tailMap]
      · simp only [runPreparedTransitionBatchPublication?, applied, headActual, tailRun,
          Bind.bind, Option.bind, List.map_cons, headId, applyInternalTransitionBatch, List.foldl_cons]

theorem prepared_transition_batch_template_ids (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (templates : List InternalTransitionPublicationTemplate)
    (found : prepared.mapM (preparedTransitionPublicationTemplate? program state) = some templates) :
    templates.map (fun template => template.record.operationId) =
      prepared.map (fun member => member.operation.id) := by
  induction prepared generalizing templates with
  | nil => simp at found; cases found; rfl
  | cons head tail ih =>
      simp only [List.mapM_cons] at found
      obtain ⟨template, headMap, found⟩ := Option.bind_eq_some_iff.mp found
      obtain ⟨rest, tailMap, found⟩ := Option.bind_eq_some_iff.mp found
      cases found
      simp only [List.map_cons, prepared_transition_template_operation_id program state head template headMap,
        ih rest tailMap]

theorem prepared_transition_batch_template_ids_unique (program : Program) (state : RuntimeState)
    (prepared : List PreparedInternalTransition) (templates : List InternalTransitionPublicationTemplate)
    (found : prepared.mapM (preparedTransitionPublicationTemplate? program state) = some templates)
    (distinct : prepared.Pairwise (fun left right => left.operation.id ≠ right.operation.id)) :
    templates.Pairwise (fun left right => left.record.operationId ≠ right.record.operationId) := by
  have ids := prepared_transition_batch_template_ids program state prepared templates found
  have unique : (prepared.map (fun member => member.operation.id)).Pairwise Ne := by
    simpa only [List.pairwise_map] using distinct
  rw [← ids] at unique
  simpa only [List.pairwise_map] using unique

theorem prepared_transition_batch_templates_perm (program : Program) (state : RuntimeState)
    (left right : List PreparedInternalTransition)
    (leftTemplates rightTemplates : List InternalTransitionPublicationTemplate)
    (leftFound : left.mapM (preparedTransitionPublicationTemplate? program state) = some leftTemplates)
    (rightFound : right.mapM (preparedTransitionPublicationTemplate? program state) = some rightTemplates)
    (permutation : left.Perm right) : leftTemplates.Perm rightTemplates := by
  obtain ⟨mapped, mappedEq, mappedPerm⟩ := mapM_some_of_perm
    (preparedTransitionPublicationTemplate? program state) left right permutation rightTemplates rightFound
  rw [leftFound] at mappedEq
  cases mappedEq
  exact mappedPerm

end BpmnSemantics.SemanticProcess.InternalCommutation
