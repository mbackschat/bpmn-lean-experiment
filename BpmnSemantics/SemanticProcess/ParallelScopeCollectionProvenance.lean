module

public import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames
public import BpmnSemantics.SemanticProcess.ParallelScopeCollectionDataProofs

/-! # Parallel subprocess collection provenance

PMIS-ADMIT-01 binds capacity to Start data. These laws follow named string-list
values through actual body/retirement replay and admitted wait commands, so a
collection captured at entry can be traced back to Start without assuming that
an arbitrary stored Service wait has the admitted declaration's output mappings.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeReplay

open BpmnSemantics InternalCommutation

private theorem replayed_process_frame (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    after.variables.process = before.variables.process := by
  rcases kind with body | retirement
  · obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
      replayInternalOperationOccurrence_sound program before after record replayed
    exact (applyInternalOperationOccurrence_body_retirement_frame program before after
      ⟨record.operationId, record.owner⟩ operation resolved (by rw [metadata]; exact body) applied).2.2.2.2.2
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    exact completeParallelScope_preserves_process completed

/-- Actual body/retirement replay preserves the complete Process binding store, independently of published trace construction. -/
theorem internalTransitions_process_frame (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (before after : RuntimeState) (records : List CommittedTransition)
    (kinds : ∀ transition ∈ records, bodyOrRetirementTransition transition)
    (replayed : internalTransitions? program before records = some after) :
    after.variables.process = before.variables.process := by
  induction records generalizing before with
  | nil =>
    have same : before = after := by simpa [internalTransitions?] using replayed
    exact congrArg (fun state => state.variables.process) same.symm
  | cons head rest ih =>
    cases head with
    | externalStimulus stimulus => simp [internalTransitions?] at replayed
    | internalOperation record =>
      simp only [internalTransitions?] at replayed
      obtain ⟨next, first, tail⟩ := Option.bind_eq_some_iff.mp replayed
      have actual : replayInternalOperationOccurrence? program before record = some next := by
        simpa [internalTransition?, selected] using first
      have frame := replayed_process_frame program before next record (kinds _ (by simp)) actual
      exact (ih next (fun transition member => kinds transition (by simp [member])) tail).trans frame

/-- Actual admitted wait commands cannot introduce a string-list binding, including every refusal branch. -/
theorem admission_stringList_provenance (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) (name : String) (items : List String) :
    ({ name, value := .stringList items } : VariableBinding) ∈ (admitStimulus program before stimulus).state.variables.process.bindings →
      ({ name, value := .stringList items } : VariableBinding) ∈ before.variables.process.bindings := by
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId taskId values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first
      | exact fun member => member
      | (solve | exact ParallelScopeCommand.completeTask_stringList_provenance program before _ commandId taskId values selected (by simp_all only [Bool.not_eq_false]) (by assumption) name items)
      | split
  case completeEffect commandId effectId result =>
    cases result <;> simp only at completion <;> try contradiction
    case success values =>
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
      all_goals repeat' first
        | exact fun member => member
        | (solve | exact ParallelScopeCommand.completeEffect_stringList_provenance program before _ effectId (.success values) (by assumption) name items)
        | split

/-- Every named string-list value in an actual non-Start command history descends unchanged from its initial Process data. -/
theorem ContinuationCommandHistory.stringList_provenance (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (name : String) (items : List String) :
    ({ name, value := .stringList items } : VariableBinding) ∈ final.variables.process.bindings →
      ({ name, value := .stringList items } : VariableBinding) ∈ initial.variables.process.bindings := by
  induction history with
  | initial => exact id
  | @internalStep before after earlier record history replayed kind outside ih =>
    intro member
    apply ih
    rwa [replayed_process_frame program before after record kind replayed] at member
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    intro member
    simp only [committedTransitions?, selected, Bool.not_true, Bool.false_eq_true, ite_false] at replayed
    cases snapshot : program.compensationEventSubProcessSnapshots with
    | some value => simp [snapshot] at replayed
    | none =>
      simp only [snapshot] at replayed
      split at replayed <;> try contradiction
      have frame := internalTransitions_process_frame program selected _ after rest kinds replayed
      rw [frame] at member
      exact ih (admission_stringList_provenance program before stimulus selected completion name items member)

private theorem resumption_bound_of_stringList_ancestry
    (program : Program) (initialBindings : List VariableBinding) (final : RuntimeState)
    (original resumed : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program initialBindings = some original)
    (stateCapacity : ParallelScopeStart.programStateCapacity program final = some resumed)
    (ancestry : ∀ name items, ({ name, value := .stringList items } : VariableBinding) ∈ final.variables.process.bindings →
      ({ name, value := .stringList items } : VariableBinding) ∈ initialBindings) :
    resumed.closureBound = original.closureBound := by
  obtain ⟨analysis, binding, items, analyzed, _, captured, typed, boundEq, _, _⟩ :=
    ParallelScopeStart.programStartCapacity_bound_certificate program final.variables.process.bindings resumed
      (ParallelScopeStart.programStateCapacity_retains_start_capacity program final resumed stateCapacity)
  obtain ⟨originalAnalysis, originalBinding, originalItems, originalAnalyzed, _, originalCaptured,
      originalTyped, originalBound, _, _⟩ :=
    ParallelScopeStart.programStartCapacity_bound_certificate program initialBindings original startCapacity
  have sameAnalysis : originalAnalysis = analysis := Option.some.inj (originalAnalyzed.symm.trans analyzed)
  subst originalAnalysis
  have capturedMember : binding ∈ final.variables.process.bindings.filter (·.name == analysis.entry.collectionName) := by
    rw [captured]
    simp
  obtain ⟨present, named⟩ := List.mem_filter.mp capturedMember
  have key : binding.name = analysis.entry.collectionName := beq_iff_eq.mp named
  have canonical : binding = { name := analysis.entry.collectionName, value := .stringList items } := by
    cases binding with
    | mk bindingName value =>
      change bindingName = analysis.entry.collectionName at key
      change value = .stringList items at typed
      subst bindingName
      subst value
      rfl
  rw [canonical] at present
  have ancestor := ancestry analysis.entry.collectionName items present
  have originalMember : ({ name := analysis.entry.collectionName, value := .stringList items } : VariableBinding) ∈
      initialBindings.filter (·.name == analysis.entry.collectionName) :=
    List.mem_filter.mpr ⟨ancestor, by simp⟩
  rw [originalCaptured] at originalMember
  have sameBinding := List.mem_singleton.mp originalMember
  have sameItems : items = originalItems := VariableValue.stringList.inj
    ((congrArg VariableBinding.value sameBinding).trans originalTyped)
  rw [boundEq, originalBound, sameItems]

/-- Accepted capacities on both sides of actual non-Start history use the same retained collection cardinality. -/
theorem ContinuationCommandHistory.resumption_closure_bound
    (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (original resumed : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program initial.variables.process.bindings = some original)
    (stateCapacity : ParallelScopeStart.programStateCapacity program final = some resumed) :
    resumed.closureBound = original.closureBound := by
  exact resumption_bound_of_stringList_ancestry program initial.variables.process.bindings final original resumed
    startCapacity stateCapacity (history.stringList_provenance program owner selected initial final records)

/-- Actual entry preserves Process bindings, so two non-Start histories separated by entry retain the same accepted capacity. -/
theorem ContinuationCommandHistory.resumption_closure_bound_through_entry
    (program : Program) (owner parent : ScopeOccurrenceId) (entry : ParallelScopeEntry)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial before issued final : RuntimeState) (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (entered : enterParallelScope? entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (original resumed : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program initial.variables.process.bindings = some original)
    (stateCapacity : ParallelScopeStart.programStateCapacity program final = some resumed) :
    resumed.closureBound = original.closureBound := by
  apply resumption_bound_of_stringList_ancestry program initial.variables.process.bindings final original resumed
    startCapacity stateCapacity
  intro name items member
  have ancestor := following.stringList_provenance program owner selected issued final suffix name items member
  rw [enterParallelScope_preserves_process entered] at ancestor
  exact preceding.stringList_provenance program owner selected initial before priorRecords name items ancestor

end BpmnSemantics.SemanticProcess.ParallelScopeReplay
