module

public import BpmnSemantics.ActivityBoundaryTimerConformance
public import BpmnSemantics.NonInterruptingBoundaryTimerConformance
public import BpmnSemantics.ActivityBodyTurnoverConformance
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog

/-! BTP-LEGACY-HOST-01 affects both Task arms as well as bounded scopes. These constructed
states distinguish AOO-JOIN-03's exact attachment from the retired ordinal coincidence;
they establish no additional profile reachability. -/

@[expose] public section

namespace BpmnSemantics.BoundaryTimerProjectionConformance

open BpmnSemantics.SemanticProcess

def ownershipRefusal (program : Program) (expected : SemanticId) (state : RuntimeState) : Prop :=
  let missingRecord := { state with activityOccurrences := [] }
  let missingAttachment := { state with activityOccurrences := state.activityOccurrences.map fun record =>
    { record with attachedHandlers := [] } }
  runtimeStateWellFormed program expected missingRecord = true ∧
    runtimeStateWellFormed program expected missingAttachment = true ∧
    projectOpenFlowNodeOccurrences? program missingRecord = none ∧
    projectOpenFlowNodeOccurrences? program missingAttachment = none

def divergentTimerState (state : RuntimeState) : RuntimeState :=
  { state with
    timerWaits := state.timerWaits.map fun wait => { wait with activation := 2 }
    timerActivations := state.timerActivations.map fun counter => { counter with count := 2 }
    activityOccurrences := state.activityOccurrences.map fun record =>
      { record with attachedHandlers := record.attachedHandlers.map fun handler =>
          match handler with
          | .timer occurrence => .timer { occurrence with activation := 2 }
          | .message occurrence => .message occurrence } }

def divergentProjection (program : Program) (expected : SemanticId) (state : RuntimeState) : Prop :=
  let after := divergentTimerState state
  state.waits.map (·.activation) = [1] ∧ after.timerWaits.map (·.activation) = [2] ∧
    runtimeStateWellFormed program expected after = true ∧
    (projectOpenFlowNodeOccurrences? program state).isSome = true ∧
    projectOpenFlowNodeOccurrences? program after = projectOpenFlowNodeOccurrences? program state

theorem bounded_task_missing_ownership_refused : ownershipRefusal
    ActivityBoundaryTimerConformance.program ActivityBoundaryTimerConformance.instanceId
    ActivityBoundaryTimerConformance.armedState := by
  unfold ownershipRefusal
  decide +kernel

theorem monitored_task_missing_ownership_refused : ownershipRefusal
    NonInterruptingBoundaryTimerConformance.program NonInterruptingBoundaryTimerConformance.instanceId
    NonInterruptingBoundaryTimerConformance.armedState := by
  unfold ownershipRefusal
  decide +kernel

theorem bounded_task_divergent_deadline_projected : divergentProjection
    ActivityBoundaryTimerConformance.program ActivityBoundaryTimerConformance.instanceId
    ActivityBoundaryTimerConformance.armedState := by
  unfold divergentProjection
  decide +kernel

theorem monitored_task_divergent_deadline_projected : divergentProjection
    NonInterruptingBoundaryTimerConformance.program NonInterruptingBoundaryTimerConformance.instanceId
    NonInterruptingBoundaryTimerConformance.armedState := by
  unfold divergentProjection
  decide +kernel

def attachedTaskPublication (before : RuntimeState) (taskActivation timerActivation : Nat) : Bool :=
  let program := ActivityBoundaryTimerConformance.program
  let timer := { ActivityBoundaryTimerConformance.deadlineId with activation := timerActivation }
  let task := { ActivityBoundaryTimerConformance.taskId with activation := taskActivation }
  let command : BpmnSemantics.SemanticId := ⟨"fire-attached-deadline"⟩
  let stimulus := Stimulus.fireTimer command timer 1000
  let admission := admitStimulus program before stimulus
  match before.timerWaits.head? >>= (fun wait => candidateFlowNodeIdentity? program wait.owner ⟨"Deadline"⟩) with
  | none => false
  | some identity =>
    let expected := instantaneousFlowNodeOccurrenceDeltaWithEnds command 0 [identity]
      [{ anchor := .wait task, terminal := .cancelled }]
    programWellFormed program &&
      runtimeStateWellFormed program ActivityBoundaryTimerConformance.instanceId before &&
      decide (before.waits.map (·.activation) = [taskActivation]) &&
      decide (before.timerWaits.map (·.activation) = [timerActivation]) &&
      (projectOpenFlowNodeOccurrences? program before).isSome &&
      decide (admission.outcome = .committed) && admission.state.waits.isEmpty &&
      admission.state.timerWaits.isEmpty &&
      decide (flowNodeOccurrenceDeltaForStimulus? program before admission.state stimulus 0 = some expected)

def replaced_task_deadline_publication_exact : Bool := decide <|
    ActivityBodyTurnoverConformance.turnedOver?.map (attachedTaskPublication · 2 1) = some true

def advanced_deadline_task_publication_exact : Bool := decide <| attachedTaskPublication
    (divergentTimerState ActivityBoundaryTimerConformance.armedState) 1 2 = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("replaced_task_deadline_publication_exact", replaced_task_deadline_publication_exact),
  ("advanced_deadline_task_publication_exact", advanced_deadline_task_publication_exact)
]

end BpmnSemantics.BoundaryTimerProjectionConformance
