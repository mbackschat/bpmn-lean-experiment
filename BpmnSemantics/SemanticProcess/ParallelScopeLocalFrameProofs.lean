module

public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import all BpmnSemantics.SemanticProcess.ParallelScopeData

/-! # Activity-local frame provenance for parallel scopes

PMIS-SELECT-01 checks an Activity-occurrence frame before Human arming. Actual
PMIS execution creates only Effect-local frames; entry initializes scope data
and retirement or completion can only remove existing local frames.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- Actual Start has no Activity-local frame for any later Human reservation query. -/
theorem runningProgramStartState_activity_frame_absent (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState) (query : ActivityOccurrenceId → Bool)
    (started : runningProgramStartState? program instanceId values = some state) :
    (state.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false := by
  unfold runningProgramStartState? at started
  obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases Option.some.inj started
  rfl

private theorem issued_activity_frames (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState)
    (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations)) :
    after.variables.activities = before.variables.activities := by
  induction items generalizing before index iterations with
  | nil =>
      simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
      exact issued.1 ▸ rfl
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      exact (ih _ _ _ generated).trans (initializeScopeVariables_preserves_other_data initialized).2.1

/-- PMIS entry initializes scope frames and preserves the separate Activity-local population exactly. -/
theorem enterParallelScope_activity_frames (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (entered : enterParallelScope? entry before parent = some after) :
    after.variables.activities = before.variables.activities := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; rfl
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
        cases Option.some.inj entered
        exact issued_activity_frames entry parent _ 0
          { before with tokens := removeToken before.tokens entry.input parent } issued (first :: rest) generated

private theorem cancelled_activity_frames (state : RuntimeState) (target : ScopeOccurrenceId) :
    (cancelScopeSubtree state target .remove).variables.activities.Sublist state.variables.activities :=
  List.filter_sublist

private theorem cancelled_bodies_activity_frames (iterations : List ParallelScopeIteration)
    (state : RuntimeState) :
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove)
      state).variables.activities.Sublist state.variables.activities := by
  induction iterations generalizing state with
  | nil => exact List.Sublist.refl _
  | cons first rest ih =>
      exact (ih _).trans (cancelled_activity_frames state first.scope)

/-- Every actual retirement arm can only remove Activity-local frames, including early sibling cancellation. -/
theorem completeParallelScope_activity_frames (entry : ParallelScopeEntry) (target : ScopeOccurrenceId)
    (before after : RuntimeState) (completed : completeParallelScope? entry before target = some after) :
    after.variables.activities.Sublist before.variables.activities := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  have frames := (removeScopeVariables_preserves_other_data removed).2.1
  rcases retirement with ⟨_, _, _, _⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;>
    cases Option.some.inj completed
  · exact (cancelled_activity_frames _ target).trans (frames ▸ List.Sublist.refl _)
  · exact (cancelled_activity_frames _ target).trans (frames ▸ List.Sublist.refl _)
  · exact (cancelled_bodies_activity_frames (first :: rest) _).trans
      ((cancelled_activity_frames _ target).trans (frames ▸ List.Sublist.refl _))

/-- Actual body execution preserves every Human Activity-frame query; Service arming uses the separate Effect owner. -/
theorem InternalCommutation.applyInternalOperationOccurrence_body_activity_frame
    (program : Program) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation) (query : ActivityOccurrenceId → Bool)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    (after.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) =
    (before.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) := by
  rcases applyInternalOperationOccurrence_body_effect program before after candidate operation resolved body applied with
    ⟨patch, _, _, rfl⟩ | ⟨patch, increment, _, rfl⟩
  · cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
    case effect wait bindings =>
      simp only [List.any_eq_not_all_not, all_insertActivityVariableScope, Bool.not_false, Bool.true_and]
  · rfl

namespace ParallelScopeCommand

/-- Both Human completion routes preserve the separate Activity-local data population. -/
theorem completeTask_activity_frames (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : completeTask? program before id values = some after) :
    after.variables.activities = before.variables.activities := by
  unfold completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact writeParallelScopeValues_preserves_activities written
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    rfl

/-- Successful Service completion removes its local frame without creating another local-data owner. -/
theorem completeEffect_success_activity_frames (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : completeEffect? program before id (.success values) = some after) :
    after.variables.activities.Sublist before.variables.activities := by
  unfold completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  split at completed
  · unfold completeParallelScopeEffect? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    change (variables.activities.filter fun scope => !activityScopeMatches id scope).Sublist before.variables.activities
    rw [writeParallelScopeValues_preserves_activities written]
    exact List.filter_sublist
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at written
    split at written <;> try contradiction
    obtain ⟨bindings, _, written⟩ := Option.bind_eq_some_iff.mp written
    cases Option.some.inj written
    cases Option.some.inj completed
    exact List.filter_sublist

end ParallelScopeCommand
end BpmnSemantics.SemanticProcess
