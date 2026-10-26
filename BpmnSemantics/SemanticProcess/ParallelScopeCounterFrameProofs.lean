module

import all BpmnSemantics.SemanticProcess.ParallelScopeData
public import BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! # Counter and hosting-control frames across actual parallel lifetime operations

PMIS-SELECT-01 reserves Human and Service ordinals from native counters and
checks End credit and hosting identity separately. Start initializes the native
counters and fixes running control; entry, retirement and completion ingress
retain that control and the counters while changing population or data.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

private theorem runningProgramStartState_frame (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some state) :
    state.control = .running instanceId ∧ state.activations = [] ∧
      state.effectActivations = [] ∧ state.endOccurrences = 0 := by
  unfold runningProgramStartState? at started
  obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases Option.some.inj started
  exact ⟨rfl, rfl, rfl, rfl⟩

private theorem initiateState_frame (before after : RuntimeState) (output : ControlPlaceId)
    (initiated : initiateState? before output = some after) :
    after.control = before.control ∧ after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences := by
  unfold initiateState? at initiated
  obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
  split at initiated <;> try contradiction
  cases Option.some.inj initiated
  exact ⟨rfl, rfl, rfl, rfl⟩

private theorem issueParallelBodies_frame
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (items : List String)
    (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations)) :
    after.control = before.control ∧ after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences := by
  induction items generalizing before index iterations with
  | nil =>
      simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
      cases issued.1
      exact ⟨rfl, rfl, rfl, rfl⟩
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      have frame := ih _ _ _ generated
      exact frame

private theorem enterParallelScope_frame (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (entered : enterParallelScope? entry before parent = some after) :
    after.control = before.control ∧ after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    exact ⟨rfl, rfl, rfl, rfl⟩
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
        cases Option.some.inj entered
        have frame := issueParallelBodies_frame entry parent _ 0 _ issued (first :: rest) generated
        exact frame

private theorem cancelParallelBodies_frame
    (iterations : List ParallelScopeIteration) (before : RuntimeState) :
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before).control = before.control ∧
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before).activations = before.activations ∧
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before).effectActivations = before.effectActivations ∧
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before).endOccurrences = before.endOccurrences := by
  induction iterations generalizing before with
  | nil => exact ⟨rfl, rfl, rfl, rfl⟩
  | cons first rest ih => exact ih _

private theorem completeParallelScope_frame (entry : ParallelScopeEntry)
    (target : ScopeOccurrenceId) (before after : RuntimeState)
    (completed : completeParallelScope? entry before target = some after) :
    after.control = before.control ∧ after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  rcases retirement with ⟨_, _, _, _⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;>
    cases Option.some.inj completed
  · exact ⟨rfl, rfl, rfl, rfl⟩
  · exact ⟨rfl, rfl, rfl, rfl⟩
  · exact cancelParallelBodies_frame (first :: rest) _

/-- Actual running Start initializes both native issuance families and End credit. -/
theorem runningProgramStartState_native_counters (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some state) :
    state.activations = [] ∧ state.effectActivations = [] ∧ state.endOccurrences = 0 :=
  (runningProgramStartState_frame program instanceId values state started).2

/-- Actual running Start fixes the hosting control to the requested semantic instance. -/
theorem runningProgramStartState_control (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some state) :
    state.control = .running instanceId :=
  (runningProgramStartState_frame program instanceId values state started).1

/-- Actual initiation changes the pending flag and root token without issuing wait ordinals or End credit. -/
theorem initiateState_native_counter_frame (before after : RuntimeState) (output : ControlPlaceId)
    (initiated : initiateState? before output = some after) :
    after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences :=
  (initiateState_frame before after output initiated).2

/-- Actual initiation retains the predecessor control and hosting instance. -/
theorem initiateState_control_frame (before after : RuntimeState) (output : ControlPlaceId)
    (initiated : initiateState? before output = some after) : after.control = before.control :=
  (initiateState_frame before after output initiated).1

/-- Actual entry allocates scopes and Activity control while retaining native wait counters and End credit. -/
theorem enterParallelScope_native_counter_frame (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (entered : enterParallelScope? entry before parent = some after) :
    after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences :=
  (enterParallelScope_frame entry parent before after entered).2

/-- Actual entry retains the predecessor control and hosting instance for its entire issued population. -/
theorem enterParallelScope_control_frame (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (entered : enterParallelScope? entry before parent = some after) :
    after.control = before.control :=
  (enterParallelScope_frame entry parent before after entered).1

/-- Every actual retirement arm, including completion-condition sibling cancellation, retains the native counter resources. -/
theorem completeParallelScope_native_counter_frame (entry : ParallelScopeEntry)
    (target : ScopeOccurrenceId) (before after : RuntimeState)
    (completed : completeParallelScope? entry before target = some after) :
    after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences :=
  (completeParallelScope_frame entry target before after completed).2

/-- Every actual retirement and sibling cancellation retains the predecessor control and hosting instance. -/
theorem completeParallelScope_control_frame (entry : ParallelScopeEntry)
    (target : ScopeOccurrenceId) (before after : RuntimeState)
    (completed : completeParallelScope? entry before target = some after) :
    after.control = before.control :=
  (completeParallelScope_frame entry target before after completed).1

namespace ParallelScopeCommand

private theorem completeTask_frame (program : Program)
    (before after : RuntimeState) (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : completeTask? program before id values = some after) :
    after.control = before.control ∧ after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences := by
  unfold completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact ⟨rfl, rfl, rfl, rfl⟩
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact ⟨rfl, rfl, rfl, rfl⟩

private theorem completeEffect_success_frame (program : Program)
    (before after : RuntimeState) (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : completeEffect? program before id (.success values) = some after) :
    after.control = before.control ∧ after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences := by
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
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact ⟨rfl, rfl, rfl, rfl⟩
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact ⟨rfl, rfl, rfl, rfl⟩

/-- Actual ordinary and scoped Human completion dispose work without issuing wait ordinals or End credit. -/
theorem completeTask_native_counter_frame (program : Program)
    (before after : RuntimeState) (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : completeTask? program before id values = some after) :
    after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences :=
  (completeTask_frame program before after id values completed).2

/-- Actual ordinary and scoped Human completion retain the predecessor control and hosting instance. -/
theorem completeTask_control_frame (program : Program)
    (before after : RuntimeState) (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : completeTask? program before id values = some after) : after.control = before.control :=
  (completeTask_frame program before after id values completed).1

/-- Both actual successful Service completion routes retain Human, Effect and End counter resources. -/
theorem completeEffect_success_native_counter_frame (program : Program)
    (before after : RuntimeState) (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : completeEffect? program before id (.success values) = some after) :
    after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences :=
  (completeEffect_success_frame program before after id values completed).2

/-- Both actual successful Service completion routes retain the predecessor control and hosting instance. -/
theorem completeEffect_success_control_frame (program : Program)
    (before after : RuntimeState) (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : completeEffect? program before id (.success values) = some after) : after.control = before.control :=
  (completeEffect_success_frame program before after id values completed).1

end ParallelScopeCommand
end BpmnSemantics.SemanticProcess
