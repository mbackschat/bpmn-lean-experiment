import BpmnSemantics.SemanticProcess.ParallelScopeCounterGrowthProofs
import BpmnSemantics.SemanticProcess.ParallelScopeCounterFrameProofs
import BpmnSemantics.SemanticProcess.ParallelScopeSchedulerAccounting

/-! # Cumulative parallel command counter bounds

PMIS-SELECT-01 charges actual internal replay records across completion commands.
Completion ingress and retirement never allocate Human or Service ordinals or
End occurrences. Each body record contributes at most one, so command boundaries
cannot reset the credit needed to establish reservation headroom.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

private theorem native_counter_queries (before after : RuntimeState)
    (frame : after.activations = before.activations ∧
      after.effectActivations = before.effectActivations ∧ after.endOccurrences = before.endOccurrences)
    (human : TaskDefinitionId) (effect : NodeId) :
    activationCount after human = activationCount before human ∧
      effectActivationCount after effect = effectActivationCount before effect ∧
      after.endOccurrences = before.endOccurrences := by
  simp only [activationCount, effectActivationCount, frame.1, frame.2.1, frame.2.2, and_self]

namespace ParallelScopeReplay

private theorem replayed_counter_growth (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after)
    (human : TaskDefinitionId) (effect : NodeId) :
    activationCount after human ≤ activationCount before human + 1 ∧
      effectActivationCount after effect ≤ effectActivationCount before effect + 1 ∧
      after.endOccurrences ≤ before.endOccurrences + 1 := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    replayInternalOperationOccurrence_sound program before after record replayed
  rcases kind with body | retirement
  · exact applyInternalOperationOccurrence_body_counter_growth program before after
      ⟨record.operationId, record.owner⟩ operation resolved (by rw [metadata]; exact body) applied human effect
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    obtain ⟨humanEq, effectEq, endEq⟩ := native_counter_queries before after
      (completeParallelScope_native_counter_frame entry record.owner before after completed) human effect
    rw [humanEq, effectEq, endEq]
    exact ⟨Nat.le_succ _, Nat.le_succ _, Nat.le_succ _⟩

private theorem ordered_counter_growth (program : Program)
    (initial final : RuntimeState) (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (human : TaskDefinitionId) (effect : NodeId) :
    activationCount final human ≤ activationCount initial human + records.length ∧
      effectActivationCount final effect ≤ effectActivationCount initial effect + records.length ∧
      final.endOccurrences ≤ initial.endOccurrences + records.length := by
  induction records generalizing initial successors with
  | nil =>
      have empty : successors = [] := by simpa using length
      subst successors
      have same : initial = final := by simpa using last
      subst initial
      exact ⟨Nat.le_refl _, Nat.le_refl _, Nat.le_refl _⟩
  | cons head rest ih =>
      cases successors with
      | nil => simp at length
      | cons next tail =>
          obtain ⟨record, same, actual⟩ := aligned (head, initial, next) (by simp)
          change head = .internalOperation record at same
          obtain ⟨humanFirst, effectFirst, endFirst⟩ := replayed_counter_growth program initial next record
            (same ▸ kinds head (by simp)) actual human effect
          obtain ⟨humanRest, effectRest, endRest⟩ := ih next tail (by simpa using length) (by simpa using last)
            (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
            (fun record member => kinds record (by simp [member]))
          simp only [List.length_cons]
          exact ⟨by omega, by omega, by omega⟩

/-- Actual completion ingress consumes no native counter credit, including unchanged refusal. -/
theorem admitStimulus_native_counter_frame (program : Program) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) :
    (admitStimulus program before stimulus).state.activations = before.activations ∧
      (admitStimulus program before stimulus).state.effectActivations = before.effectActivations ∧
      (admitStimulus program before stimulus).state.endOccurrences = before.endOccurrences := by
  apply admitStimulus_wait_preserves program before stimulus selected completion
    (fun state => state.activations = before.activations ∧
      state.effectActivations = before.effectActivations ∧ state.endOccurrences = before.endOccurrences)
    ⟨rfl, rfl, rfl⟩
  · intro id values after completed
    exact ParallelScopeCommand.completeTask_native_counter_frame program before after id values completed
  · intro id values after completed
    exact ParallelScopeCommand.completeEffect_success_native_counter_frame program before after id values completed

/-- Cumulative internal records bound every native Human/Service counter and the End count across actual completion commands. -/
theorem ContinuationCommandHistory.native_counter_growth (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (human : TaskDefinitionId) (effect : NodeId) :
    activationCount final human ≤ activationCount initial human + records.length ∧
      effectActivationCount final effect ≤ effectActivationCount initial effect + records.length ∧
      final.endOccurrences ≤ initial.endOccurrences + records.length := by
  induction history with
  | initial => exact ⟨Nat.le_refl _, Nat.le_refl _, Nat.le_refl _⟩
  | @internalStep before after earlier record history replayed kind outside ih =>
      obtain ⟨humanStep, effectStep, endStep⟩ := replayed_counter_growth program before after record kind replayed human effect
      obtain ⟨humanBefore, effectBefore, endBefore⟩ := ih
      simp only [List.length_append, List.length_singleton]
      exact ⟨by omega, by omega, by omega⟩
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
      obtain ⟨actualStimulus, actualRest, admitted, successors, shape, committed, stateEq, length, last, aligned⟩ :=
        committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
      cases shape
      obtain ⟨humanRest, effectRest, endRest⟩ :=
        ordered_counter_growth program admitted after rest successors length last aligned kinds human effect
      have frame := admitStimulus_native_counter_frame program before stimulus selected completion
      rw [stateEq] at frame
      obtain ⟨humanEq, effectEq, endEq⟩ := native_counter_queries before admitted frame human effect
      obtain ⟨humanBefore, effectBefore, endBefore⟩ := ih
      simp only [List.length_append]
      exact ⟨by omega, by omega, by omega⟩

end ParallelScopeReplay

namespace InternalCommutation

open ParallelScopeReplay

private theorem replayed_root_completion_native_counter_frame
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (record : InternalTransitionRecord)
    (kind : record.operationKind = .completeScope)
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    after.activations = before.activations ∧ after.effectActivations = before.effectActivations ∧
      after.endOccurrences = before.endOccurrences := by
  obtain ⟨scopeId, output, root, _, _, _, completed⟩ :=
    replayed_scope_completion_execution program before after record kind replayed
  obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
  rw [completeSelectedScope?, unmonitored,
    completeBoundedScope_eq_completeScope_of_unbounded program before scopeId output unbounded] at completed
  unfold completeScopeState? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  unfold completeQuiescentScope? at completed
  all_goals repeat' split at completed
  all_goals first
    | contradiction
    | (cases Option.some.inj completed; exact ⟨rfl, rfl, rfl⟩)

/-- Actual entry and terminal completion preserve cumulative counter credit across every scheduler phase. -/
theorem ParallelScopeSchedulerPhase.native_counter_growth (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState)
    (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (human : TaskDefinitionId) (effect : NodeId) :
    activationCount current human ≤ activationCount initial human + records.length ∧
      effectActivationCount current effect ≤ effectActivationCount initial effect + records.length ∧
      current.endOccurrences ≤ initial.endOccurrences + records.length := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  rcases phase with ⟨_, history⟩ | ⟨before, issued, prior, entryRecord, suffix, shape, _, preceding, _, _, entered, later⟩
  · exact history.native_counter_growth program owner selected initial current records human effect
  · obtain ⟨humanPrior, effectPrior, endPrior⟩ :=
      preceding.native_counter_growth program owner selected initial before prior human effect
    obtain ⟨humanEntry, effectEntry, endEntry⟩ := native_counter_queries before issued
      (enterParallelScope_native_counter_frame analysis.entry parent before issued entered) human effect
    have count := congrArg List.length shape
    simp only [List.length_append, List.length_singleton] at count
    rcases later with following | ⟨terminalPrefix, record, middle, terminalShape, history, kind, replayed, _, _⟩
    · obtain ⟨humanRest, effectRest, endRest⟩ :=
        following.native_counter_growth program owner selected issued current suffix human effect
      exact ⟨by omega, by omega, by omega⟩
    · obtain ⟨humanRest, effectRest, endRest⟩ :=
        history.native_counter_growth program owner selected issued middle terminalPrefix human effect
      obtain ⟨humanTerminal, effectTerminal, endTerminal⟩ := native_counter_queries middle current
        (replayed_root_completion_native_counter_frame program analysis admitted middle current record kind replayed) human effect
      have suffixCount := congrArg List.length terminalShape
      simp only [List.length_append, List.length_singleton] at suffixCount
      exact ⟨by omega, by omega, by omega⟩

/-- Actual Start zeroes the native counters, so every scheduler phase stays below its accepted closure capacity and the fixed admission ceiling. -/
theorem ParallelScopeSchedulerPhase.native_counters_below_start_capacity
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (instanceId : SemanticId) (values : List VariableBinding)
    (root : DefinitionScope) (ready initial : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (current : RuntimeState) (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (capacity : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program values = some capacity)
    (human : TaskDefinitionId) (effect : NodeId) :
    activationCount current human < capacity.closureBound ∧
      effectActivationCount current effect < capacity.closureBound ∧
      current.endOccurrences < capacity.closureBound ∧ capacity.closureBound ≤ 16400 := by
  obtain ⟨humanStart, effectStart, endStart⟩ := runningProgramStartState_native_counters program instanceId values ready started
  obtain ⟨humanInit, effectInit, endInit⟩ := initiateState_native_counter_frame ready initial output initiated
  have humanZero : activationCount initial human = 0 := by
    simp only [activationCount, humanInit, humanStart, taskActivationCount]
  have effectZero : effectActivationCount initial effect = 0 := by
    simp only [effectActivationCount, effectInit, effectStart, List.map_nil, elementActivationCount]
    rfl
  obtain ⟨humanBound, effectBound, endBound⟩ := phase.native_counter_growth program analysis admitted
    owner parent initial current records human effect
  have count := phase.record_count_le_start_capacity program analysis admitted owner parent instanceId values root
    ready initial startId origin output startDeclared rootSelected parentIdentity started initiated current records capacity startCapacity
  obtain ⟨_, _, _, _, _, _, _, _, _, ceiling⟩ :=
    ParallelScopeStart.programStartCapacity_bound_certificate program values capacity startCapacity
  exact ⟨by omega, by omega, by omega, ceiling⟩

end InternalCommutation
end BpmnSemantics.SemanticProcess
