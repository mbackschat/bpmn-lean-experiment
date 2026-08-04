import BpmnSemantics.SemanticProcess

/-! # Ordinary embedded Sub-Process completion conformance

This module owns the direct Lean account for one ordinary embedded Sub-Process. A child scope starts once, retains both parallel User Task occurrences, refuses early scope completion after only one child End Event, resumes the parent only after child quiescence, and then completes through the outer User Task and None End Event.
-/

namespace BpmnSemantics.EmbeddedSubProcessCompletionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"cibseven-2.2.0-embedded-subprocess-completion-draft"⟩

def processId : ProcessId :=
  ⟨"Process_EmbeddedSubProcess"⟩

def rootScopeId : DefinitionScopeId :=
  ⟨"scope:Process_EmbeddedSubProcess"⟩

def childScopeId : DefinitionScopeId :=
  ⟨"scope:SubProcess_Work"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"embedded-subprocess-completion-process"⟩
        sourceSha256 :=
          "6ca0aa3bccb005de1ac4b6ef6283f2a29c4f4ef7c3e8aff6bf29d79247f09a36" }
    processId
    definitionScopes :=
      [ { id := rootScopeId
          parentScopeId := none
          originElementId := ⟨processId.value⟩ }
      , { id := childScopeId
          parentScopeId := some rootScopeId
          originElementId := ⟨"SubProcess_Work"⟩ } ]
    nodeScopes :=
      [ { nodeId := ⟨"EndEvent_ChildA"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"EndEvent_ChildB"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"EndEvent_Outer"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"Gateway_ChildFork"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"StartEvent_Child"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"StartEvent_Outer"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"SubProcess_Work"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"UserTask_AfterScope"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"UserTask_ChildA"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"UserTask_ChildB"⟩, scopeId := childScopeId } ]
    sequenceFlowScopes :=
      [ { sequenceFlowId := ⟨"Flow_AfterToOuterEnd"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_ChildAToEnd"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_ChildBToEnd"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_ChildForkToA"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_ChildForkToB"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_ChildStartToFork"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_OuterStartToScope"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_ScopeToAfter"⟩, scopeId := rootScopeId } ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_ChildA"⟩
      , .noneEndEvent ⟨"EndEvent_ChildB"⟩
      , .noneEndEvent ⟨"EndEvent_Outer"⟩
      , .parallelGateway ⟨"Gateway_ChildFork"⟩ .diverging
      , .noneStartEvent ⟨"StartEvent_Child"⟩
      , .noneStartEvent ⟨"StartEvent_Outer"⟩
      , .embeddedSubProcess ⟨"SubProcess_Work"⟩ childScopeId
      , .userTask ⟨"UserTask_AfterScope"⟩ (some "After Scope")
      , .userTask ⟨"UserTask_ChildA"⟩ (some "Child A")
      , .userTask ⟨"UserTask_ChildB"⟩ (some "Child B") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_AfterToOuterEnd"⟩
          sourceId := ⟨"UserTask_AfterScope"⟩
          targetId := ⟨"EndEvent_Outer"⟩ }
      , { id := ⟨"Flow_ChildAToEnd"⟩
          sourceId := ⟨"UserTask_ChildA"⟩
          targetId := ⟨"EndEvent_ChildA"⟩ }
      , { id := ⟨"Flow_ChildBToEnd"⟩
          sourceId := ⟨"UserTask_ChildB"⟩
          targetId := ⟨"EndEvent_ChildB"⟩ }
      , { id := ⟨"Flow_ChildForkToA"⟩
          sourceId := ⟨"Gateway_ChildFork"⟩
          targetId := ⟨"UserTask_ChildA"⟩ }
      , { id := ⟨"Flow_ChildForkToB"⟩
          sourceId := ⟨"Gateway_ChildFork"⟩
          targetId := ⟨"UserTask_ChildB"⟩ }
      , { id := ⟨"Flow_ChildStartToFork"⟩
          sourceId := ⟨"StartEvent_Child"⟩
          targetId := ⟨"Gateway_ChildFork"⟩ }
      , { id := ⟨"Flow_OuterStartToScope"⟩
          sourceId := ⟨"StartEvent_Outer"⟩
          targetId := ⟨"SubProcess_Work"⟩ }
      , { id := ⟨"Flow_ScopeToAfter"⟩
          sourceId := ⟨"SubProcess_Work"⟩
          targetId := ⟨"UserTask_AfterScope"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def instanceId : SemanticId :=
  ⟨"EmbeddedSubProcessInstance_1"⟩

def childTaskA : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"UserTask_ChildA"⟩
    activation := 1 }

def childTaskB : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"UserTask_ChildB"⟩
    activation := 1 }

def afterScopeTask : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"UserTask_AfterScope"⟩
    activation := 1 }

def start : Stimulus :=
  .startProcess ⟨"start-embedded-subprocess"⟩ ⟨processId.value⟩ instanceId []

def completeA : Stimulus :=
  .completeUserTaskInstance ⟨"complete-child-a"⟩ childTaskA []

def completeB : Stimulus :=
  .completeUserTaskInstance ⟨"complete-child-b"⟩ childTaskB []

def completeAfterScope : Stimulus :=
  .completeUserTaskInstance ⟨"complete-after-scope"⟩ afterScopeTask []

def childWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState start

def afterA : StimulusResult :=
  applyStimulus scenarioClosureLimit program childWaiting.state completeA

def afterAThenB : StimulusResult :=
  applyStimulus scenarioClosureLimit program afterA.state completeB

def afterB : StimulusResult :=
  applyStimulus scenarioClosureLimit program childWaiting.state completeB

def afterBThenA : StimulusResult :=
  applyStimulus scenarioClosureLimit program afterB.state completeA

def completed : StimulusResult :=
  applyStimulus scenarioClosureLimit program afterAThenB.state completeAfterScope

private def taskObservation (id : UserTaskInstanceId) (name : String) :
    OpenUserTask :=
  { id, name := some name, state := .active }

def childWaitingObservation : StateObservation :=
  { instanceId
    status := .running
    activeWaits :=
      [ { elementId := childTaskA.elementId, kind := .userTask, multiplicity := 1 }
      , { elementId := childTaskB.elementId, kind := .userTask, multiplicity := 1 } ]
    openUserTasks :=
      [taskObservation childTaskA "Child A", taskObservation childTaskB "Child B"]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions :=
      [.completeUserTaskInstance childTaskA, .completeUserTaskInstance childTaskB]
    logicalTimeMs := 0 }

def afterFirstChildObservation : StateObservation :=
  { childWaitingObservation with
    activeWaits :=
      [{ elementId := childTaskB.elementId, kind := .userTask, multiplicity := 1 }]
    openUserTasks := [taskObservation childTaskB "Child B"]
    enabledInteractions := [.completeUserTaskInstance childTaskB] }

def afterScopeObservation : StateObservation :=
  { childWaitingObservation with
    activeWaits :=
      [{ elementId := afterScopeTask.elementId, kind := .userTask, multiplicity := 1 }]
    openUserTasks := [taskObservation afterScopeTask "After Scope"]
    enabledInteractions := [.completeUserTaskInstance afterScopeTask] }

def completedObservation : StateObservation :=
  { afterScopeObservation with
    status := .completed
    activeWaits := []
    openUserTasks := []
    enabledInteractions := [] }

theorem exact_scoped_definition_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  decide +kernel

theorem start_enters_one_child_scope_and_opens_both_tasks :
    childWaiting.outcome = .committed ∧
      observeStableState program childWaiting.state = some childWaitingObservation ∧
      childWaiting.state.scopeOccurrences.length = 2 := by
  decide +kernel

/-- Reaching one child None End Event preserves the other child wait, so the child scope is not quiescent and cannot resume its parent. -/
theorem first_child_end_does_not_complete_scope :
    afterA.outcome = .committed ∧
      observeStableState program afterA.state = some afterFirstChildObservation ∧
      afterA.state.scopeOccurrences.length = 2 ∧
      afterA.state.endOccurrences = 1 := by
  decide +kernel

theorem stale_child_completion_preserves_state :
    applyStimulus scenarioClosureLimit program afterA.state
        (.completeUserTaskInstance ⟨"stale-child-a"⟩ childTaskA []) =
      { outcome := .rejected
        state := afterA.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem child_completion_order_has_same_parent_observation :
    observeStableState program afterAThenB.state = some afterScopeObservation ∧
      observeStableState program afterBThenA.state = some afterScopeObservation := by
  decide +kernel

theorem outer_task_completes_root_scope :
    completed.outcome = .committed ∧
      observeStableState program completed.state = some completedObservation ∧
      completed.state.scopeOccurrences = [] ∧
      completed.state.endOccurrences = 3 := by
  decide +kernel

end BpmnSemantics.EmbeddedSubProcessCompletionConformance
