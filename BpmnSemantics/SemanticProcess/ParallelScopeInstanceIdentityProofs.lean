module

import BpmnSemantics.SemanticProcess.ParallelScopeCounterFrameProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeSchedulerAccounting
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! # Actual parallel hosting-instance provenance

PMIS-SELECT-01 requires the reservation owner to belong to the running instance.
Actual Start and control-preserving execution retain that identity across entry
and completion commands. Nonempty identity comes separately from actual Start
admission; the history constructors alone deliberately do not impose it.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

theorem ParallelScopeCommand.admitted_start_instance_nonempty (program : Program)
    (before : RuntimeState) (commandId processId instanceId : SemanticId) (values : List VariableBinding)
    (selected : ParallelScopeStart.programSelected program = true)
    (accepted : ParallelScopeCommand.stimulusAdmitted program before (.startProcess commandId processId instanceId values) = true) :
    instanceId.value.isEmpty = false := by
  unfold ParallelScopeCommand.stimulusAdmitted at accepted
  simp only [selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte] at accepted
  split at accepted <;> try contradiction
  cases analyzed : ParallelScopeStart.analyzeProgram program <;>
    simp only [analyzed, Bool.and_eq_true, Bool.not_eq_true'] at accepted
  · contradiction
  · exact accepted.1

/-- Actual pre-entry history retains the running identity chosen by Start. -/
theorem ParallelScopeParentHistory.running_control (program : Program)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program entry parent state) :
    state.control = .running parent.processInstanceId := by
  induction history with
  | start instanceId root values state selected started owner distinct =>
      subst parent
      exact runningProgramStartState_control program instanceId values state started
  | @initiate before after history output declared applied ih =>
      exact (initiateState_control_frame before after output applied).trans ih
  | @body before after history candidate operation resolved kind applied ih =>
      exact (applyInternalOperationOccurrence_body_retirement_frame program before after candidate operation resolved kind applied).1.trans ih
  | @human before after history id values wait selected ordinary applied ih =>
      exact (ParallelScopeCommand.completeTask_control_frame program before after id values applied).trans ih
  | @service before after history id values wait selected ordinary applied ih =>
      exact (ParallelScopeCommand.completeEffect_success_control_frame program before after id values applied).trans ih

namespace ParallelScopeReplay

private theorem replayed_control_frame (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    after.control = before.control := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    replayInternalOperationOccurrence_sound program before after record replayed
  rcases kind with body | retirement
  · exact (applyInternalOperationOccurrence_body_retirement_frame program before after
      ⟨record.operationId, record.owner⟩ operation resolved (by rw [metadata]; exact body) applied).1
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    exact completeParallelScope_control_frame entry record.owner before after completed

private theorem ordered_control_frame (program : Program)
    (initial final : RuntimeState) (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record) :
    final.control = initial.control := by
  induction records generalizing initial successors with
  | nil =>
      have empty : successors = [] := by simpa using length
      subst successors
      have same : initial = final := by simpa using last
      exact congrArg RuntimeState.control same.symm
  | cons head rest ih =>
      cases successors with
      | nil => simp at length
      | cons next tail =>
          obtain ⟨record, same, actual⟩ := aligned (head, initial, next) (by simp)
          change head = .internalOperation record at same
          have first := replayed_control_frame program initial next record
            (same ▸ kinds head (by simp)) actual
          have later := ih next tail (by simpa using length) (by simpa using last)
            (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
            (fun record member => kinds record (by simp [member]))
          exact later.trans first

theorem admitStimulus_control_frame (program : Program) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) :
    (admitStimulus program before stimulus).state.control = before.control := by
  apply admitStimulus_wait_preserves program before stimulus selected completion
    (fun state => state.control = before.control) rfl
  · intro id values after completed
    exact ParallelScopeCommand.completeTask_control_frame program before after id values completed
  · intro id values after completed
    exact ParallelScopeCommand.completeEffect_success_control_frame program before after id values completed

/-- Body execution, retirement and actual completion ingress preserve the initial runtime control and its instance identifier. -/
theorem ContinuationCommandHistory.control_frame (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    final.control = initial.control := by
  induction history with
  | initial => rfl
  | @internalStep before after earlier record history replayed kind outside ih =>
      exact (replayed_control_frame program before after record kind replayed).trans ih
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
      obtain ⟨actualStimulus, actualRest, admitted, successors, shape, committed, stateEq, length, last, aligned⟩ :=
        committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
      cases shape
      have internal := ordered_control_frame program admitted after rest successors length last aligned kinds
      have ingress := admitStimulus_control_frame program before stimulus selected completion
      rw [stateEq] at ingress
      exact internal.trans (ingress.trans ih)

end ParallelScopeReplay

namespace InternalCommutation

open ParallelScopeReplay

/-- Running phase control names the same instance as the actual Start root, independently of whether entry has occurred. -/
theorem ParallelScopeSchedulerPhase.running_instance (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState)
    (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (instanceId : SemanticId) (running : current.control = .running instanceId) :
    instanceId = parent.processInstanceId := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  have actual : current.control = .running parent.processInstanceId := by
    rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
    · exact parents.running_control program analysis.entry parent current
    · rcases later with history | ⟨_, _, _, _, _, _, _, completed, _⟩
      · exact (history.control_frame program owner selected issued current suffix).trans
          ((enterParallelScope_control_frame analysis.entry parent before issued entered).trans
            (parents.running_control program analysis.entry parent before))
      · obtain ⟨completedInstance, completed⟩ := completed
        rw [running] at completed
        cases completed
  rw [running] at actual
  cases actual
  rfl

/-- Actual Start admission supplies nonempty identity and the actual phase aligns each resolved reservation owner with running control. -/
theorem ParallelScopeSchedulerPhase.reservation_instance_identity (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (startState : RuntimeState) (commandId processId startInstance : SemanticId) (values : List VariableBinding)
    (startAccepted : ParallelScopeCommand.stimulusAdmitted program startState
      (.startProcess commandId processId startInstance values) = true)
    (owner parent : ScopeOccurrenceId) (parentIdentity : parent.processInstanceId = startInstance)
    (initial current : RuntimeState) (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (runtimeId : SemanticId) (running : current.control = .running runtimeId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program current candidate = some operation) :
    candidate.owner.processInstanceId = runtimeId ∧ runtimeId.value.isEmpty = false := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  have instanceEq := phase.running_instance program analysis admitted owner parent initial current records runtimeId running
  have ownerEq := (phase.reservation_owner_bounds program analysis admitted owner parent initial current records
    runtimeId running candidate operation resolved).1.1
  have named := ParallelScopeCommand.admitted_start_instance_nonempty program startState commandId processId startInstance
    values selected startAccepted
  exact ⟨ownerEq.trans instanceEq.symm, by simpa only [instanceEq, parentIdentity] using named⟩

end InternalCommutation
end BpmnSemantics.SemanticProcess
