import BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance

/-! # Compensation Event Sub-Process snapshot root closure

Kernel-decided witnesses for selected and unselected root closure. The fixture declares its
definition scopes in canonical order directly so kernel reduction does not repeatedly sort
immutable Program data while evaluating each witness.
Complete-result equality proofs prevent each projected fact from replaying its predecessor
commands; see the [measured correction](../docs/CAPSULE-COST-LEDGER.md#package-wide-theorem-elaboration-memory-correction).
-/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def rootAndChildProgram : Program :=
  { CompensationEventSubProcessSnapshotAdmissionConformance.program with
    definitionScopes :=
      [ { id := SubProcessBoundaryTimerConformance.rootScopeId
          parentScopeId := none
          originElementId := ⟨SubProcessBoundaryTimerConformance.processId.value⟩ }
      , { id := CompensationEventSubProcessSnapshotConformance.rootHandlerScopeId
          parentScopeId := some SubProcessBoundaryTimerConformance.rootScopeId
          originElementId := ⟨"RootSnapshotHandler"⟩ }
      , { id := SubProcessBoundaryTimerConformance.childScopeId
          parentScopeId := some SubProcessBoundaryTimerConformance.rootScopeId
          originElementId := ⟨"Scope"⟩ }
      , CompensationEventSubProcessSnapshotAdmissionConformance.handlerScope ]
    compensationEventSubProcessSnapshots := some
      { targets :=
          [ { parentScopeId := SubProcessBoundaryTimerConformance.rootScopeId
              handlerScopeId :=
                CompensationEventSubProcessSnapshotConformance.rootHandlerScopeId }
          , { parentScopeId := SubProcessBoundaryTimerConformance.childScopeId
              handlerScopeId :=
                CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId } ]
        maxRecords := 2
        maxCanonicalBytes := 4096 } }

def rootAndChildStarted : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit rootAndChildProgram initialState
    (.startProcess ⟨"start-root-and-child-snapshots"⟩
      ⟨SubProcessBoundaryTimerConformance.processId.value⟩
      CompensationEventSubProcessSnapshotConformance.instanceId [])

def rootAndChildChildCompleted : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit rootAndChildProgram
    rootAndChildStarted.state
    (.completeUserTaskInstance ⟨"complete-child-before-root"⟩ childTaskId [])

def afterScopeTaskId : UserTaskInstanceId :=
  { processInstanceId := CompensationEventSubProcessSnapshotConformance.instanceId
    elementId := ⟨"AfterScope"⟩
    activation := 1 }

def rootAndChildCompleted : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit rootAndChildProgram
    rootAndChildChildCompleted.state
    (.completeUserTaskInstance ⟨"complete-selected-root"⟩ afterScopeTaskId [])

open _root_.BpmnSemantics.CompensationEventSubProcessSnapshotConformance

private def rootAndChildStartedValue : StimulusResult :=
  { outcome := .committed
    state :=
      { initialState with
        control := .running instanceId
        scopeOccurrences := [rootOccurrence, childOccurrence]
        waits :=
          [{ processInstanceId := instanceId
             owner := childOccurrence.id
             task := { id := ⟨"ChildTask"⟩, name := some "Work inside the scope", metadata := none }
             activation := 1
             output := ⟨"place:Flow_Child_End"⟩
             metadata := none }]
        timerWaits :=
          [{ processInstanceId := instanceId
             owner := rootOccurrence.id
             elementId := ⟨"Deadline"⟩
             activation := 1
             deadlineMs := 1000
             output := ⟨"place:Flow_Boundary"⟩ }]
        activityOccurrences :=
          [{ processInstanceId := instanceId
             activityElementId := ⟨"scope:Scope"⟩
             activation := 1
             owner := rootOccurrence.id
             body := .childScope childOccurrence.id
             attachedHandlers :=
               [.timer
                 { processInstanceId := instanceId
                   elementId := ⟨"Deadline"⟩
                   activation := 1 }] }]
        compensationParentContextRetentions :=
          [.provisional rootOccurrence rootHandlerScopeId,
           .provisional childOccurrence
             CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId]
        activations := [{ taskId := ⟨"ChildTask"⟩, count := 1 }]
        timerActivations := [{ elementId := ⟨"Deadline"⟩, count := 1 }]
        scopeActivations :=
          [{ scopeId := rootOccurrence.id.definitionScopeId, count := 1 },
           { scopeId := childOccurrence.id.definitionScopeId, count := 1 }]
        activityActivations := [{ taskId := ⟨"scope:Scope"⟩, count := 1 }] }
    internalStepBoundExceeded := false
    ambiguousInternalChoice := false }

private theorem rootAndChildStarted_eq : rootAndChildStarted = rootAndChildStartedValue := by
  decide +kernel

private def promotedChild : CompensationParentContextRetention :=
  .promoted childOccurrence
    CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId
    { frames := [{ owner := rootOccurrence.id, bindings := [] },
                 { owner := childOccurrence.id, bindings := [] }] }

private def rootAndChildChildCompletedValue : StimulusResult :=
  { rootAndChildStartedValue with
    state :=
      { rootAndChildStartedValue.state with
        scopeOccurrences := [rootOccurrence]
        waits :=
          [{ processInstanceId := instanceId
             owner := rootOccurrence.id
             task := { id := ⟨"AfterScope"⟩, name := some "Scope completed in time", metadata := none }
             activation := 1
             output := ⟨"place:Flow_Normal_End"⟩
             metadata := none }]
        timerWaits := []
        activityOccurrences := []
        compensationParentContextRetentions :=
          [.provisional rootOccurrence rootHandlerScopeId, promotedChild]
        activations := [{ taskId := ⟨"AfterScope"⟩, count := 1 },
                        { taskId := ⟨"ChildTask"⟩, count := 1 }]
        endOccurrences := 1 } }

private theorem rootAndChildChildCompleted_eq :
    rootAndChildChildCompleted = rootAndChildChildCompletedValue := by
  unfold rootAndChildChildCompleted
  rw [rootAndChildStarted_eq]
  decide +kernel

private def rootAndChildCompletedValue : StimulusResult :=
  { rootAndChildChildCompletedValue with
    state :=
      { rootAndChildChildCompletedValue.state with
        control := .completed instanceId
        scopeOccurrences := []
        waits := []
        compensationParentContextRetentions :=
          [.promoted rootOccurrence rootHandlerScopeId
             { frames := [{ owner := rootOccurrence.id, bindings := [] }] },
           promotedChild]
        endOccurrences := 2 } }

private theorem rootAndChildCompleted_eq : rootAndChildCompleted = rootAndChildCompletedValue := by
  unfold rootAndChildCompleted
  rw [rootAndChildChildCompleted_eq]
  decide +kernel

/-- Selected root closure retains its promoted root and direct-child snapshots together. -/
theorem selected_root_terminal_state_owns_every_retained_child :
    programWellFormed rootAndChildProgram = true ∧
      rootAndChildStarted.outcome = .committed ∧
      rootAndChildStarted.state.compensationParentContextRetentions.length = 2 ∧
      rootAndChildChildCompleted.outcome = .committed ∧
      rootAndChildCompleted.outcome = .committed ∧
      rootAndChildCompleted.state.control =
        .completed CompensationEventSubProcessSnapshotConformance.instanceId ∧
      rootAndChildCompleted.state.compensationParentContextRetentions.length = 2 ∧
      rootAndChildCompleted.state.compensationParentContextRetentions.all
        CompensationParentContextRetention.isPromoted = true ∧
      compensationEventSubProcessSnapshotStateValid rootAndChildProgram
        rootAndChildCompleted.state = true := by
  rw [rootAndChildStarted_eq, rootAndChildChildCompleted_eq, rootAndChildCompleted_eq]
  decide +kernel

def unselectedRootCompleted : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit
    CompensationEventSubProcessSnapshotAdmissionConformance.program childCompletionResult.state
    (.completeUserTaskInstance ⟨"complete-unselected-root"⟩ afterScopeTaskId [])

private def unselectedStartedValue : StimulusResult :=
  { rootAndChildStartedValue with
    state := { rootAndChildStartedValue.state with
      compensationParentContextRetentions :=
        [.provisional childOccurrence
          CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId] } }

private theorem unselectedStarted_eq : startResult = unselectedStartedValue := by
  decide +kernel

private def unselectedChildCompletedValue : StimulusResult :=
  { rootAndChildChildCompletedValue with
    state := { rootAndChildChildCompletedValue.state with
      compensationParentContextRetentions := [promotedChild] } }

private theorem unselectedChildCompleted_eq :
    childCompletionResult = unselectedChildCompletedValue := by
  unfold childCompletionResult
  rw [unselectedStarted_eq]
  decide +kernel

private def unselectedRootCompletedValue : StimulusResult :=
  { rootAndChildCompletedValue with
    state := { rootAndChildCompletedValue.state with
      compensationParentContextRetentions := [] } }

private theorem unselectedRootCompleted_eq :
    unselectedRootCompleted = unselectedRootCompletedValue := by
  unfold unselectedRootCompleted
  rw [unselectedChildCompleted_eq]
  decide +kernel

/-- An unselected root discards its promoted child when the containing occurrence closes. -/
theorem unselected_root_completion_discards_child_snapshot :
    unselectedRootCompleted.outcome = .committed ∧
      unselectedRootCompleted.state.control =
        .completed CompensationEventSubProcessSnapshotConformance.instanceId ∧
      unselectedRootCompleted.state.compensationParentContextRetentions = [] := by
  rw [unselectedRootCompleted_eq]
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
