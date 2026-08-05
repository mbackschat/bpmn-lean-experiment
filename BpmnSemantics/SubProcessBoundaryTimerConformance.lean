import BpmnSemantics.SemanticProcess

/-! # BpmnSemantics.SubProcessBoundaryTimerConformance — interrupting Sub-Process boundary Timer locks

These checks own the direct Lean account for the admitted interrupting Sub-Process boundary Timer capsule: the armed triple of child scope occurrence, child entry token, and parent-owned deadline; the two mutually exclusive victories over that triple; and the refusals that keep each arm exact.

The family differs from the Activity boundary Timer in the fact that gives it its own capsule: the cancelled Activity is a *scope*, so interruption arrives from outside a region that may hold its own live work, and the deadline must be withdrawn by quiescent completion rather than left for a later firing. The deadline is owned by the parent occurrence, so regional cancellation does not reach it and both arms must consume it explicitly.
-/

namespace BpmnSemantics.SubProcessBoundaryTimerConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-subprocess-boundary-timer-draft"⟩

def processId : ProcessId :=
  ⟨"Process_SubProcessBoundaryTimer"⟩

def rootScopeId : DefinitionScopeId :=
  ⟨"scope:Process_SubProcessBoundaryTimer"⟩

def childScopeId : DefinitionScopeId :=
  ⟨"scope:Scope"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"subprocess-boundary-timer"⟩
        sourceSha256 :=
          "dc2875fb0c24deeab9d8f180fa4adf44652a504778f3dda187ac19839e60016e" }
    processId
    definitionScopes :=
      [ { id := rootScopeId
          parentScopeId := none
          originElementId := ⟨processId.value⟩ }
      , { id := childScopeId
          parentScopeId := some rootScopeId
          originElementId := ⟨"Scope"⟩ } ]
    nodeScopes :=
      [ { nodeId := ⟨"AfterScope"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"BoundaryEnd"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"ChildEnd"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"ChildStart"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"ChildTask"⟩, scopeId := childScopeId }
      , { nodeId := ⟨"Deadline"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"EscalationTask"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"NormalEnd"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"Scope"⟩, scopeId := rootScopeId }
      , { nodeId := ⟨"Start"⟩, scopeId := rootScopeId } ]
    sequenceFlowScopes :=
      [ { sequenceFlowId := ⟨"Flow_Boundary"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_Boundary_End"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_Child"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_Child_End"⟩, scopeId := childScopeId }
      , { sequenceFlowId := ⟨"Flow_Normal"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_Normal_End"⟩, scopeId := rootScopeId }
      , { sequenceFlowId := ⟨"Flow_Start"⟩, scopeId := rootScopeId } ]
    nodes :=
      [ .userTask ⟨"AfterScope"⟩ (some "Scope completed in time")
      , .noneEndEvent ⟨"BoundaryEnd"⟩
      , .noneEndEvent ⟨"ChildEnd"⟩
      , .noneStartEvent ⟨"ChildStart"⟩
      , .userTask ⟨"ChildTask"⟩ (some "Work inside the scope")
      , .timerBoundaryEvent ⟨"Deadline"⟩ ⟨"Scope"⟩ "PT1S" ⟨"Flow_Boundary"⟩
      , .userTask ⟨"EscalationTask"⟩ (some "Deadline reached")
      , .noneEndEvent ⟨"NormalEnd"⟩
      , .embeddedSubProcess ⟨"Scope"⟩ childScopeId
      , .noneStartEvent ⟨"Start"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Boundary"⟩
          sourceId := ⟨"Deadline"⟩
          targetId := ⟨"EscalationTask"⟩ }
      , { id := ⟨"Flow_Boundary_End"⟩
          sourceId := ⟨"EscalationTask"⟩
          targetId := ⟨"BoundaryEnd"⟩ }
      , { id := ⟨"Flow_Child"⟩
          sourceId := ⟨"ChildStart"⟩
          targetId := ⟨"ChildTask"⟩ }
      , { id := ⟨"Flow_Child_End"⟩
          sourceId := ⟨"ChildTask"⟩
          targetId := ⟨"ChildEnd"⟩ }
      , { id := ⟨"Flow_Normal"⟩
          sourceId := ⟨"Scope"⟩
          targetId := ⟨"AfterScope"⟩ }
      , { id := ⟨"Flow_Normal_End"⟩
          sourceId := ⟨"AfterScope"⟩
          targetId := ⟨"NormalEnd"⟩ }
      , { id := ⟨"Flow_Start"⟩
          sourceId := ⟨"Start"⟩
          targetId := ⟨"Scope"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide +kernel

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide +kernel

theorem checked_process_lowering_is_exact :
    lowerCheckedProcess checkedProcess = program := by decide +kernel

/-- The deadline never becomes an independent `awaitTimer`; it exists only as the scope-entry operation's own arm. Without this the program would hold a standalone Timer that no scope owns. -/
theorem boundary_timer_is_not_lowered_as_a_standalone_timer :
    (program.operations.filter fun
      | .awaitTimer .. => true
      | _ => false) = [] := by decide +kernel

theorem exactly_one_scope_owns_a_boundary_deadline :
    (boundedScopeOperations program).length = 1 := by decide +kernel

def instanceId : SemanticId := ⟨"Instance_1"⟩

def childTaskId : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"ChildTask"⟩
    activation := 1 }

def deadlineId : TimerOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"Deadline"⟩
    activation := 1 }

def startCommandId : SemanticId := ⟨"start-process"⟩

def armedState : RuntimeState :=
  (applyStimulus scenarioClosureLimit program initialState
    (.startProcess startCommandId ⟨processId.value⟩ instanceId [])).state

/-- Arming is atomic: entering the Sub-Process creates the child occurrence, its entry token, and the parent-owned deadline together, and the deadline takes activation ordinal one from its own element counter. That shared ordinal is what later recovers the triple without a stored ownership record. -/
theorem scope_and_deadline_arm_atomically :
    (armedState.scopeOccurrences.map fun occurrence =>
        (occurrence.id.definitionScopeId.value, occurrence.id.activation)) =
        [("scope:Scope", 1), ("scope:Process_SubProcessBoundaryTimer", 1)] ∧
      (armedState.timerWaits.map fun wait =>
        (wait.elementId.value, wait.activation, wait.deadlineMs)) =
        [("Deadline", 1, 1000)] ∧
      (armedState.waits.map fun wait => wait.task.id.value) = ["ChildTask"] := by
  decide +kernel

/-- The deadline is owned by the *parent* occurrence, not the child it bounds.

This is a correctness requirement rather than a modelling preference: `scopeQuiescent` counts an owned
Timer wait as live work, so a child-owned deadline would make the child permanently non-quiescent and
its normal completion unreachable. The deadline arm would still behave correctly, so no separating
witness at the public boundary would expose the mistake. -/
theorem deadline_is_owned_by_the_parent_occurrence :
    (armedState.timerWaits.map fun wait =>
      (wait.owner.definitionScopeId.value, wait.owner.activation)) =
      [("scope:Process_SubProcessBoundaryTimer", 1)] := by decide +kernel

def quiescentVictoryState : RuntimeState :=
  (applyStimulus scenarioClosureLimit program armedState
    (.completeUserTaskInstance ⟨"complete-child-task"⟩ childTaskId [])).state

/-- `SPTIMER-QUIESCE-01`: child quiescence withdraws the deadline in the same transition.

The child scope's completion is the only instant that may retire the deadline, and it must, because the
deadline is owned by the parent: a surviving Timer wait would keep the *parent* occurrence permanently
non-quiescent and could never be consumed afterwards, since its child region no longer exists. The
published follow-on is the After Scope task on the Sub-Process's normal outgoing Flow. -/
theorem quiescent_completion_withdraws_the_deadline :
    quiescentVictoryState.timerWaits = [] ∧
      (quiescentVictoryState.scopeOccurrences.map fun occurrence =>
        occurrence.id.definitionScopeId.value) =
        ["scope:Process_SubProcessBoundaryTimer"] ∧
      (quiescentVictoryState.waits.map fun wait => wait.task.id.value) =
        ["AfterScope"] := by decide +kernel

/-- The quiescence arm leaves logical time untouched, which is half of the arms' separating law. -/
theorem quiescent_completion_preserves_logical_time :
    quiescentVictoryState.logicalTimeMs = armedState.logicalTimeMs := by
  decide +kernel

end BpmnSemantics.SubProcessBoundaryTimerConformance
