import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability

/-! # Logical time of admitted parallel histories

PMIS-ADMIT-01 admits no clock-advancing ingress. Actual Start fixes logical time
at zero and every admitted internal or completion step preserves it, supplying
the safe logical-time gate required by PMIS-SELECT-01 reservation.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- Actual running Start initializes logical time to zero. -/
theorem runningProgramStartState_logical_time (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some state) :
    state.logicalTimeMs = 0 := by
  unfold runningProgramStartState? at started
  obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases Option.some.inj started
  rfl

private theorem issueParallelBodies_logical_time (time : Nat)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (items : List String)
    (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (valid : before.logicalTimeMs = time)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations)) :
    after.logicalTimeMs = time := by
  induction items generalizing before index iterations with
  | nil =>
      simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
      exact issued.1 ▸ valid
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      apply ih _ _ _ ?_ generated
      exact valid

/-- PMIS entry changes scopes and tokens without advancing logical time. -/
theorem enterParallelScope_preserves_logical_time (time : Nat)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState)
    (valid : before.logicalTimeMs = time)
    (entered : enterParallelScope? entry before parent = some after) :
    after.logicalTimeMs = time := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; exact valid
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
        cases Option.some.inj entered
        apply issueParallelBodies_logical_time time entry parent
          _ 0 _ issued (first :: rest) ?_ generated
        exact valid

private theorem cancelParallelBodies_logical_time (time : Nat)
    (iterations : List ParallelScopeIteration) (state : RuntimeState)
    (valid : state.logicalTimeMs = time) :
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state).logicalTimeMs = time := by
  induction iterations generalizing state with
  | nil => exact valid
  | cons first rest ih =>
      exact ih _ valid

/-- PMIS retirement and sibling cancellation preserve logical time. -/
theorem completeParallelScope_preserves_logical_time (time : Nat)
    (entry : ParallelScopeEntry) (target : ScopeOccurrenceId) (before after : RuntimeState)
    (valid : before.logicalTimeMs = time)
    (completed : completeParallelScope? entry before target = some after) :
    after.logicalTimeMs = time := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  rcases retirement with ⟨_, _, _, _⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;>
    cases Option.some.inj completed
  · exact valid
  · exact valid
  · exact cancelParallelBodies_logical_time time (first :: rest) _ valid

namespace ParallelScopeCommand

/-- Actual ordinary and scoped Human completion preserve logical time. -/
theorem completeTask_logical_time (program : Program) (time : Nat)
    (before after : RuntimeState) (id : UserTaskInstanceId) (values : List VariableBinding)
    (valid : before.logicalTimeMs = time)
    (completed : completeTask? program before id values = some after) :
    after.logicalTimeMs = time := by
  unfold completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact valid
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact valid

/-- Successful Service completion preserves logical time through both routing paths. -/
theorem completeEffect_success_logical_time (program : Program) (time : Nat)
    (before after : RuntimeState) (id : EffectOccurrenceId) (values : List VariableBinding)
    (valid : before.logicalTimeMs = time)
    (completed : completeEffect? program before id (.success values) = some after) :
    after.logicalTimeMs = time := by
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
    exact valid
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact valid

end ParallelScopeCommand

/-- Raw body arming and token controls do not advance the semantic clock. -/
theorem InternalCommutation.applyInternalOperationOccurrence_body_logical_time
    (program : Program) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    after.logicalTimeMs = before.logicalTimeMs := by
  rcases applyInternalOperationOccurrence_body_effect program before after candidate operation resolved body applied with
    ⟨patch, _, _, rfl⟩ | ⟨patch, increment, _, rfl⟩
  · cases write : patch.write <;> simp only [applyInternalArmingPatch, write]
  · rfl

/-- Every actual pre-entry history retains Start logical time. -/
theorem ParallelScopeParentHistory.logical_time (program : Program)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program entry parent state) :
    state.logicalTimeMs = 0 := by
  induction history with
  | start instanceId root values state selected started owner distinct =>
      subst parent
      exact runningProgramStartState_logical_time program instanceId values state started
  | @initiate before after history output declared applied ih =>
      unfold initiateState? at applied
      obtain ⟨owner, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      split at applied <;> try contradiction
      cases Option.some.inj applied
      exact ih
  | @body before after history candidate operation resolved kind applied ih =>
      exact (InternalCommutation.applyInternalOperationOccurrence_body_logical_time
        program before after candidate operation resolved kind applied).trans ih
  | @human before after history id values wait selected ordinary applied ih =>
      exact ParallelScopeCommand.completeTask_logical_time program 0
        before after id values ih applied
  | @service before after history id values wait selected ordinary applied ih =>
      exact ParallelScopeCommand.completeEffect_success_logical_time program 0
        before after id values ih applied

namespace ParallelScopeReplay

private theorem replayed_logical_time (program : Program) (time : Nat)
    (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (valid : before.logicalTimeMs = time)
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    after.logicalTimeMs = time := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    replayInternalOperationOccurrence_sound program before after record replayed
  rcases kind with body | retirement
  · exact (InternalCommutation.applyInternalOperationOccurrence_body_logical_time program before after
      ⟨record.operationId, record.owner⟩ operation resolved (by rw [metadata]; exact body) applied).trans valid
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    exact completeParallelScope_preserves_logical_time time entry record.owner before after valid completed

private theorem ordered_logical_time (program : Program) (time : Nat)
    (initial final : RuntimeState) (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (valid : initial.logicalTimeMs = time) :
    final.logicalTimeMs = time := by
  induction records generalizing initial successors with
  | nil =>
      have empty : successors = [] := by simpa using length
      subst successors
      have same : initial = final := by simpa using last
      exact same ▸ valid
  | cons head rest ih =>
      cases successors with
      | nil => simp at length
      | cons next tail =>
          obtain ⟨record, same, actual⟩ := aligned (head, initial, next) (by simp)
          change head = .internalOperation record at same
          have first := replayed_logical_time program time initial next record
            (same ▸ kinds head (by simp)) valid actual
          exact ih next tail (by simpa using length) (by simpa using last)
            (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
            (fun record member => kinds record (by simp [member])) first

/-- Completion ingress preserves logical time, including unchanged refusal. -/
theorem admitStimulus_logical_time (program : Program) (time : Nat)
    (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus)
    (valid : before.logicalTimeMs = time) :
    (admitStimulus program before stimulus).state.logicalTimeMs = time := by
  apply admitStimulus_wait_preserves program before stimulus selected completion
    (fun state => state.logicalTimeMs = time) valid
  · intro id values after completed
    exact ParallelScopeCommand.completeTask_logical_time program time before after id values valid completed
  · intro id values after completed
    exact ParallelScopeCommand.completeEffect_success_logical_time program time before after id values valid completed

/-- Actual continuation histories preserve their initial logical time. -/
theorem ContinuationCommandHistory.logical_time (program : Program) (time : Nat)
    (owner : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (valid : initial.logicalTimeMs = time) :
    final.logicalTimeMs = time := by
  induction history with
  | initial => exact valid
  | @internalStep before after earlier record history replayed kind outside ih =>
      exact replayed_logical_time program time before after record kind ih replayed
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
      obtain ⟨actualStimulus, actualRest, admitted, successors, shape, committed, stateEq, length, last, aligned⟩ :=
        committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
      cases shape
      apply ordered_logical_time program time admitted after rest successors length last aligned kinds
      rw [← stateEq]
      exact admitStimulus_logical_time program time before stimulus selected completion ih

end ParallelScopeReplay
end BpmnSemantics.SemanticProcess
