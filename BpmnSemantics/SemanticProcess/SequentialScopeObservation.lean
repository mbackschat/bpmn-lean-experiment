module

public import BpmnSemantics.SemanticProcess.SequentialScopeRuntime

/-! SMIS-PUBLISH-01 derives progress from the committed current-body binding. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

def sequentialScopeInteractionBefore (left right : OccurrenceId) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.elementId.value ≠ right.elementId.value then left.elementId.value < right.elementId.value
  else left.activation < right.activation

def sequentialScopeInteractionsDistinct : List OccurrenceId → Bool
  | [] | [_] => true
  | first :: second :: rest => sequentialScopeInteractionBefore first second && sequentialScopeInteractionsDistinct (second :: rest)

def sequentialScopeInteractionIds? (body : ScopeOccurrenceId) (ids : List OccurrenceId) : Option (List OccurrenceId) :=
  let ordered := ids.mergeSort fun left right => !sequentialScopeInteractionBefore right left
  if ordered.all (fun id => id.processInstanceId == body.processInstanceId) && sequentialScopeInteractionsDistinct ordered
  then some ordered else none

/-- A malformed controller, body or interaction binding refuses projection instead of disappearing from it. -/
def sequentialScopeProgress? (program : Program) (state : RuntimeState) :
    Option (List OpenSequentialSubProcessMultiInstance) := do
  let entries := program.operations.filterMap sequentialScopeEntry?
  if entries.isEmpty then return []
  let records := state.activityOccurrences.filter fun record =>
    entries.any fun entry => record.activityElementId == entry.elementId
  if records.length ≠ state.sequentialScopeControllers.length then none
  else state.sequentialScopeControllers.mapM fun controller => do
    let [entry] := entries.filter (fun entry => entry.elementId.value == controller.id.activityElementId.value) | none
    let binding ← sequentialScopeBindingForEntry? entry state
    if binding.controller.id ≠ controller.id then none
    else
      let userTaskIds ← sequentialScopeInteractionIds? binding.body.id
        ((state.waits.filter fun wait => wait.owner == binding.body.id).map fun wait =>
          ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩)
      let effectIds ← sequentialScopeInteractionIds? binding.body.id
        ((state.effectWaits.filter fun wait => wait.owner == binding.body.id).map fun wait =>
          ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩)
      let generated := controller.completed + 1
      some {
        id := controller.id, plannedInstanceCount := controller.total,
        pendingItemCount := controller.total - generated, numberOfInstances := generated,
        numberOfActiveInstances := 1, numberOfCompletedInstances := controller.completed,
        numberOfTerminatedInstances := 0,
        activeIterations := [{
          loopCounter := controller.completed, body := binding.body.id,
          item := ⟨entry.itemName, .string controller.currentItem⟩,
          bindings := binding.locals.bindings, userTaskIds, effectIds }] }

end BpmnSemantics.SemanticProcess
