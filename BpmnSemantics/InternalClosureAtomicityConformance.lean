import BpmnSemantics.SemanticProcess.Fixtures
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import BpmnSemantics.RuntimeStateInitializationConformance

/-! # Whole-command closure rollback witnesses

`CLOSURE-ATOMIC-01` restores the state before external admission, including task completion and declaration-bearing reservation. Successful prefixes below reach actual enabled frontiers; no failed command supplies an intermediate fixture state. The late-choice counterexample lies outside admitted topology and checks the evaluator after accepted completion without claiming source admission.
-/

set_option Elab.async false

namespace BpmnSemantics.InternalClosureAtomicityConformance

open BpmnSemantics.SemanticProcess

def parallelStart : Stimulus :=
  .startProcess ⟨"closure-start"⟩ ⟨parallelProgram.processId.value⟩ parallelInstanceId []

def completeB : Stimulus :=
  .completeUserTaskInstance ⟨"closure-complete"⟩
    { processInstanceId := parallelInstanceId, elementId := ⟨"UserTask_B"⟩, activation := 1 } []

theorem start_fuel_failure_rolls_back_admission_and_internal_prefix :
    applyStimulus 2 parallelProgram initialState parallelStart =
      { outcome := .rolledBack, state := initialState,
        internalStepBoundExceeded := true, ambiguousInternalChoice := false } := by
  decide +kernel

theorem completion_fuel_failure_restores_exact_wait_and_ownership :
    applyStimulus 0 parallelProgram parallelAfterCompletingA completeB =
      { outcome := .rolledBack, state := parallelAfterCompletingA,
        internalStepBoundExceeded := true, ambiguousInternalChoice := false } := by
  decide +kernel

def lateAmbiguityProgram : Program :=
  { parallelProgram with
    operations :=
      .reachNoneEnd ⟨"operation:EndEvent_0"⟩ ⟨⟨"EndEvent_0"⟩⟩
        ⟨"place:Flow_JoinToEnd"⟩ :: parallelProgram.operations
    operationScopes :=
      { operationId := ⟨"operation:EndEvent_0"⟩,
        scopeId := ⟨"scope:Process_ParallelForkJoin"⟩ } :: parallelProgram.operationScopes }

theorem late_ambiguity_has_admitted_completion_and_successful_join_prefix :
    programWellFormed lateAmbiguityProgram = false ∧
      (admitStimulus lateAmbiguityProgram parallelAfterCompletingA completeB).outcome =
        .committed ∧
      (admitStimulus lateAmbiguityProgram parallelAfterCompletingA completeB).state =
        parallelAfterAThenB ∧
      (runChoices lateAmbiguityProgram parallelAfterAThenB [parallelJoinOperation]).isSome = true ∧
      enabledInternalOperationCount lateAmbiguityProgram
        ((runChoices lateAmbiguityProgram parallelAfterAThenB
          [parallelJoinOperation]).getD initialState) = 2 := by
  decide +kernel

theorem late_ambiguity_rolls_back_external_completion_and_join :
    applyStimulus scenarioClosureLimit lateAmbiguityProgram parallelAfterCompletingA completeB =
      { outcome := .rolledBack, state := parallelAfterCompletingA,
        internalStepBoundExceeded := false, ambiguousInternalChoice := true } := by
  decide +kernel

def dataStart : Stimulus :=
  .startProcess ⟨"data-start"⟩ ⟨sequentialProgram.processId.value⟩ ⟨"DataInstance"⟩
    [{ name := "status", value := .string "before" }]

def dataWaiting : RuntimeState :=
  (applyStimulus scenarioClosureLimit sequentialProgram initialState dataStart).state

def dataCompletion : Stimulus :=
  .completeUserTaskInstance ⟨"data-complete"⟩
    { processInstanceId := ⟨"DataInstance"⟩, elementId := ⟨"UserTask_Approve"⟩, activation := 1 }
    [{ name := "status", value := .string "after" }]

theorem completion_admission_changes_data_before_internal_closure :
    (admitStimulus sequentialProgram dataWaiting dataCompletion).outcome = .committed ∧
      (admitStimulus sequentialProgram dataWaiting dataCompletion).state.variables ≠
        dataWaiting.variables := by
  decide +kernel

theorem completion_fuel_failure_restores_exact_process_data :
    let result := applyStimulus 0 sequentialProgram dataWaiting dataCompletion
    result.outcome = .rolledBack ∧ result.state = dataWaiting ∧
      result.internalStepBoundExceeded = true ∧ result.ambiguousInternalChoice = false := by
  decide +kernel

theorem equal_admitted_successors_do_not_equate_distinct_rolled_back_inputs :
    let changed := { dataWaiting with waits := dataWaiting.waits.map fun wait =>
      { wait with task := { wait.task with name := some "Changed task label" } } }
    changed ≠ dataWaiting ∧
      (admitStimulus sequentialProgram changed dataCompletion).outcome = .committed ∧
      (admitStimulus sequentialProgram changed dataCompletion).state =
        (admitStimulus sequentialProgram dataWaiting dataCompletion).state ∧
      (applyStimulus 0 sequentialProgram changed dataCompletion).outcome = .rolledBack ∧
      (applyStimulus 0 sequentialProgram changed dataCompletion).state = changed ∧
      (applyStimulus 0 sequentialProgram changed dataCompletion).state ≠
        (applyStimulus 0 sequentialProgram dataWaiting dataCompletion).state := by
  decide +kernel

theorem declaration_bearing_fuel_failure_erases_root_reservation :
    let result := applyStimulusWithCompensationSnapshots 0
      RuntimeStateInitializationConformance.rootProgram initialState
      RuntimeStateInitializationConformance.ordinaryTrigger
    result.outcome = .rolledBack ∧ result.state = initialState ∧
      result.internalStepBoundExceeded = true ∧ result.ambiguousInternalChoice = false := by
  decide +kernel

theorem successful_start_and_rejected_repeat_keep_both_flags_false :
    applyStimulus scenarioClosureLimit parallelProgram initialState parallelStart =
        { outcome := .committed, state := parallelWaitingState,
          internalStepBoundExceeded := false, ambiguousInternalChoice := false } ∧
      applyStimulus scenarioClosureLimit parallelProgram parallelWaitingState parallelStart =
        { outcome := .rejected, state := parallelWaitingState,
          internalStepBoundExceeded := false, ambiguousInternalChoice := false } := by
  decide +kernel

private def emittedStart : List CommittedTransition :=
  (applyStimulusTraced scenarioClosureLimit parallelProgram initialState
    parallelStart).committedTransitions

private def swappedTaskRecords : List CommittedTransition :=
  match emittedStart with
  | [external, start, fork, taskA, taskB] => [external, start, fork, taskB, taskA]
  | records => records

private def swappedDependentRecords : List CommittedTransition :=
  match emittedStart with
  | [external, start, fork, taskA, taskB] => [external, fork, start, taskA, taskB]
  | records => records

theorem emitted_trace_contains_the_selected_independent_and_dependent_pairs :
    emittedStart.map (fun
      | .externalStimulus _ => none
      | .internalOperation record => some record.operationId.value) =
      [none, some "operation:StartEvent_1", some "operation:Gateway_Fork",
        some "operation:UserTask_A", some "operation:UserTask_B"] := by
  decide +kernel

theorem public_replay_accepts_swapped_independent_emitted_records :
    swappedTaskRecords ≠ emittedStart ∧
      replayCommittedTransitions parallelProgram initialState emittedStart =
        some parallelWaitingState ∧
      replayCommittedTransitions parallelProgram initialState swappedTaskRecords =
        some parallelWaitingState := by
  decide +kernel

theorem public_replay_rejects_swapped_dependent_emitted_records :
    swappedDependentRecords ≠ emittedStart ∧
      replayCommittedTransitions parallelProgram initialState swappedDependentRecords = none := by
  decide +kernel

end BpmnSemantics.InternalClosureAtomicityConformance
