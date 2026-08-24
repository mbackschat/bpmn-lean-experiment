import BpmnSemantics.SemanticProcess.ActivityBodyTurnover
import BpmnSemantics.SemanticProcess.BoundedScope
import BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite

/-! # Activity identity issuing-discipline preservation

This module discharges `RSI-ISSUE-01` for committed transitions that preserve or remove Activity
occurrences. Arming laws remain with their issuer modules. Each proof supplies an exact predecessor
record or exact predecessor identity, so unchanged counters or collection cardinality cannot justify
withdrawal followed by reissue.
-/

namespace BpmnSemantics.ActivityIssuingDisciplineConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private theorem replaceBodyIn_identity_witness (records : List ActivityOccurrence)
    (target : ActivityOccurrence) (incoming : OccurrenceId) :
    ∀ record ∈ replaceBodyIn records target incoming,
      ∃ predecessor ∈ records, sameActivityOccurrence predecessor record = true := by
  intro record present
  simp only [replaceBodyIn, List.mem_map] at present
  obtain ⟨predecessor, predecessorPresent, rfl⟩ := present
  refine ⟨predecessor, predecessorPresent, ?_⟩
  by_cases same : sameActivityOccurrence predecessor target = true
  · rw [if_pos same]
    simp [sameActivityOccurrence]
  · rw [if_neg same]
    simp [sameActivityOccurrence]

private theorem replaceBodyIn_retains_identity (records : List ActivityOccurrence)
    (target record : ActivityOccurrence) (incoming : OccurrenceId)
    (present : record ∈ records) :
    ∃ successor ∈ replaceBodyIn records target incoming,
      sameActivityOccurrence record successor = true := by
  let successor :=
    if sameActivityOccurrence record target then
      { record with body := .userTask incoming }
    else record
  refine ⟨successor, ?_, ?_⟩
  · simp only [replaceBodyIn, List.mem_map]
    exact ⟨record, present, rfl⟩
  · dsimp only [successor]
    by_cases same : sameActivityOccurrence record target = true
    · rw [if_pos same]
      simp [sameActivityOccurrence]
    · rw [if_neg same]
      simp [sameActivityOccurrence]

/-- Body turnover retains the exact outer Activity identity while replacing only its body. -/
theorem replacedState_retains_outer_activity_identity (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId)
    (present : record ∈ state.activityOccurrences) :
    ∃ successor ∈ (replacedState state record wait body).activityOccurrences,
      sameActivityOccurrence record successor = true := by
  simpa only [replacedState] using
    replaceBodyIn_retains_identity state.activityOccurrences record record
      (turnoverBodyId state wait body) present

/-- Body turnover is preservation, not issuing: every successor identity has an exact predecessor
witness and the Activity-element high-water marks are untouched. -/
theorem replacedState_activity_identity_discipline (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId) :
    activityIdentityIssuingDiscipline state (replacedState state record wait body) = true ∧
      (replacedState state record wait body).activityActivations = state.activityActivations := by
  constructor
  · apply activityIdentityIssuingDiscipline_of_identity_witness
    intro successor present
    simpa only [replacedState] using
      replaceBodyIn_identity_witness state.activityOccurrences record
        (turnoverBodyId state wait body) successor present
  · rfl

/-- Scope completion changes no Activity occurrence. Kept local because the general scope-completion
owner intentionally exports only the unrelated components its existing consumers require. -/
private theorem completeScopeState_preserves_activity_occurrences
    (state completed : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId)
    (completion : completeScopeState? state scopeId parentOutput = some completed) :
    completed.activityOccurrences = state.activityOccurrences := by
  revert completion
  have expansion :
      completeScopeState? state scopeId parentOutput =
        (match state.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id.definitionScopeId = scopeId) with
      | [occurrence] =>
          if !scopeQuiescent state occurrence.id then none
          else
            match occurrence.parent, parentOutput, state.control with
            | none, none, .running instanceId =>
                if state.initiationPending then none
                else some
                  { state with
                    control := .completed instanceId
                    scopeOccurrences := [] }
            | some parent, some output, .running _ =>
                if state.scopeOccurrences.any fun candidate => candidate.id == parent then
                  some
                    { state with
                      tokens := addToken state.tokens output parent
                      scopeOccurrences := state.scopeOccurrences.filter fun candidate =>
                        decide (candidate.id ≠ occurrence.id) }
                else none
            | _, _, _ => none
      | _ => none) := rfl
  intro completion
  rw [expansion] at completion
  repeat' split at completion
  all_goals simp_all
  all_goals rw [← completion]

/-- Regional cancellation only filters Activity records, so every successor record is an exact
predecessor record. -/
theorem cancelScopeSubtree_activity_occurrences_subset (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    ∀ record ∈ (cancelScopeSubtree state root disposition).activityOccurrences,
      record ∈ state.activityOccurrences := by
  intro record present
  simp only [cancelScopeSubtree, retainedByRegion, List.mem_filter] at present
  exact present.1

theorem cancelScopeSubtree_activity_identity_discipline (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    activityIdentityIssuingDiscipline state (cancelScopeSubtree state root disposition) = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  exact cancelScopeSubtree_activity_occurrences_subset state root disposition

private theorem interruptScope_activity_occurrences_subset (state : RuntimeState)
    (root parent : ScopeOccurrenceId) (output : ControlPlaceId) :
    ∀ record ∈ (interruptScope state root parent output).activityOccurrences,
      record ∈ state.activityOccurrences := by
  intro record present
  exact cancelScopeSubtree_activity_occurrences_subset state root .remove record
    (by simpa only [interruptScope] using present)

/-- Both declarative bounded-scope victories only remove Activity records. -/
theorem boundedScopeVictoryStep_activity_occurrences_subset (program : Program)
    (before after : RuntimeState) (step : BoundedScopeVictoryStep program before after) :
    ∀ record ∈ after.activityOccurrences, record ∈ before.activityOccurrences := by
  cases step with
  | quiescence completed _ child _ parentOutput _ _ _ completion _ =>
      intro record present
      have completedPreserves :=
        completeScopeState_preserves_activity_occurrences before completed
          child.definitionScopeId parentOutput completion
      simp only at present
      have presentInCompleted : record ∈ completed.activityOccurrences :=
        (List.mem_filter.mp present).1
      simpa only [completedPreserves] using presentInCompleted
  | deadline _ child deadline output _ _ _ =>
      intro record present
      exact interruptScope_activity_occurrences_subset before child deadline.owner output record
        (by simpa only using present)

theorem boundedScopeVictoryStep_activity_identity_discipline (program : Program)
    (before after : RuntimeState) (step : BoundedScopeVictoryStep program before after) :
    activityIdentityIssuingDiscipline before after = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  exact boundedScopeVictoryStep_activity_occurrences_subset program before after step

/-- The bounded-scope evaluator likewise returns only Activity records already in its predecessor. -/
theorem completeBoundedScope_activity_occurrences_subset (program : Program)
    (before after : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId)
    (success : completeBoundedScope? program before scopeId parentOutput = some after) :
    ∀ record ∈ after.activityOccurrences, record ∈ before.activityOccurrences := by
  unfold completeBoundedScope? at success
  cases completion : completeScopeState? before scopeId parentOutput with
  | none => simp [completion] at success
  | some completed =>
      have completedPreserves :=
        completeScopeState_preserves_activity_occurrences before completed scopeId parentOutput
          completion
      cases definitionFound : boundedScopeDefinitionForChild? program scopeId with
      | none =>
          simp only [completion, definitionFound, Option.some.injEq] at success
          subst after
          intro record present
          simpa only [completedPreserves] using present
      | some definition =>
          cases occurrenceFound : boundedScopeChildOccurrence? before scopeId with
          | none => simp [completion, definitionFound, occurrenceFound] at success
          | some occurrence =>
              cases deadlineFound :
                  parentOwnedDeadline? before occurrence.1 occurrence.2 definition.2 with
              | none => simp [completion, definitionFound, occurrenceFound, deadlineFound] at success
              | some deadline =>
                  simp only [completion, definitionFound, occurrenceFound, deadlineFound,
                    Option.some.injEq] at success
                  subst after
                  intro record present
                  have presentInCompleted : record ∈ completed.activityOccurrences :=
                    (List.mem_filter.mp present).1
                  simpa only [completedPreserves] using presentInCompleted

theorem completeBoundedScope_activity_identity_discipline (program : Program)
    (before after : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId)
    (success : completeBoundedScope? program before scopeId parentOutput = some after) :
    activityIdentityIssuingDiscipline before after = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  exact completeBoundedScope_activity_occurrences_subset program before after scopeId parentOutput
    success

theorem finalCompletionState_activity_occurrences_subset (arm : SequentialMultiInstanceArm)
    (state : RuntimeState) (record : ActivityOccurrence) (body : OccurrenceId)
    (target : SequentialMultiInstanceController) (items : List String) :
    ∀ successor ∈
        (finalCompletionState arm state record body target items).activityOccurrences,
      successor ∈ state.activityOccurrences := by
  intro successor present
  exact (List.mem_filter.mp present).1

theorem finalCompletionState_activity_identity_discipline (arm : SequentialMultiInstanceArm)
    (state : RuntimeState) (record : ActivityOccurrence) (body : OccurrenceId)
    (target : SequentialMultiInstanceController) (items : List String) :
    activityIdentityIssuingDiscipline state
        (finalCompletionState arm state record body target items) = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  exact finalCompletionState_activity_occurrences_subset arm state record body target items

theorem interruptionState_activity_occurrences_subset (arm : SequentialMultiInstanceArm)
    (state : RuntimeState) (record : ActivityOccurrence) (body : OccurrenceId)
    (deadline : TimerWait) (target : SequentialMultiInstanceController) :
    ∀ successor ∈
        (interruptionState arm state record body deadline target).activityOccurrences,
      successor ∈ state.activityOccurrences := by
  intro successor present
  exact (List.mem_filter.mp present).1

theorem interruptionState_activity_identity_discipline (arm : SequentialMultiInstanceArm)
    (state : RuntimeState) (record : ActivityOccurrence) (body : OccurrenceId)
    (deadline : TimerWait) (target : SequentialMultiInstanceController) :
    activityIdentityIssuingDiscipline state
        (interruptionState arm state record body deadline target) = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  exact interruptionState_activity_occurrences_subset arm state record body deadline target

end BpmnSemantics.ActivityIssuingDisciplineConformance
