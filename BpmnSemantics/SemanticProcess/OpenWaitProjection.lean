module

public import BpmnSemantics.SemanticProcess.InternalCommutationRegion
public import BpmnSemantics.SemanticProcess.ActivityOccurrence
public import BpmnSemantics.SemanticProcess.Data

/-! Public User Task and Timer occurrences are projected independently of scenario admission and execution. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The selected InputSet one live task occurrence publishes, or `none` when its Activity owns no
local data.

Read from the committed Activity record and its occurrence-owned scope only. A scope of any other
cardinality answers `none` rather than a truncated collection, because publishing part of an InputSet
would present partial data as the complete selection. -/
def selectedTaskInputs? (state : RuntimeState) (wait : UserTaskWait) :
    Option (List VariableBinding) := do
  let record ← activityOccurrenceForTaskWait? state.activityOccurrences wait
  let bindings ← activityOccurrenceVariableBindings state.variables
    { processInstanceId := record.processInstanceId
      activityElementId := ⟨record.activityElementId.value⟩
      activation := record.activation }
  match bindings with
  | [_] => some bindings
  | _ => none

/-- The canonical observation contract orders public identities, independently of runtime scope storage. -/
def sortOpenWaitOccurrences (identity : α → OccurrenceId) (values : List α) : List α :=
  InternalCommutation.sortBy (fun left right =>
    let leftId := identity left
    let rightId := identity right
    if leftId.processInstanceId ≠ rightId.processInstanceId then
      leftId.processInstanceId.value < rightId.processInstanceId.value
    else if leftId.elementId ≠ rightId.elementId then leftId.elementId.value < rightId.elementId.value
    else leftId.activation ≤ rightId.activation) values

def projectOpenUserTasks (tasks : List UserTaskDefinition) (state : RuntimeState) :
    List OpenUserTask :=
  sortOpenWaitOccurrences (·.id) (tasks.flatMap fun task =>
    (state.waits.filter fun wait => decide (wait.task.id = task.id)).map fun wait =>
      { id :=
          { processInstanceId := wait.processInstanceId
            elementId := ⟨task.id.value⟩
            activation := wait.activation }
        name := task.name
        state := .active
        metadata := wait.metadata
        inputs := selectedTaskInputs? state wait })

def projectOpenTimers (timers : List TimerDefinition) (state : RuntimeState) :
    List OpenTimer :=
  sortOpenWaitOccurrences (·.id) (timers.flatMap fun timer =>
    (state.timerWaits.filter fun wait =>
      decide (wait.elementId = timer.elementId)).map fun wait =>
        { id :=
            { processInstanceId := wait.processInstanceId
              elementId := ⟨timer.elementId.value⟩
              activation := wait.activation }
          deadlineMs := wait.deadlineMs })

end BpmnSemantics.SemanticProcess
