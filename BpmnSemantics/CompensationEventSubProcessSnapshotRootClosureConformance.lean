import BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance

/-! # Compensation Event Sub-Process snapshot root closure

Kernel-decided witnesses for selected and unselected root closure. The fixture declares its
definition scopes in canonical order directly so kernel reduction does not repeatedly sort
immutable Program data while evaluating each witness.
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
  decide +kernel

def unselectedRootCompleted : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit
    CompensationEventSubProcessSnapshotAdmissionConformance.program childCompletionResult.state
    (.completeUserTaskInstance ⟨"complete-unselected-root"⟩ afterScopeTaskId [])

/-- An unselected root discards its promoted child when the containing occurrence closes. -/
theorem unselected_root_completion_discards_child_snapshot :
    unselectedRootCompleted.outcome = .committed ∧
      unselectedRootCompleted.state.control =
        .completed CompensationEventSubProcessSnapshotConformance.instanceId ∧
      unselectedRootCompleted.state.compensationParentContextRetentions = [] := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
