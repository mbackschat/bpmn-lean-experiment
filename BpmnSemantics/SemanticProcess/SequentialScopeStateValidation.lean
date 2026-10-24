module

public import BpmnSemantics.SemanticProcess.SequentialScopeRuntime

/-! SMIS-IDENTITY-01 binds controllers and generated bodies in both directions; SMIS-ENTER-01 fixes their collection index. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

def sequentialScopeStateValid (program : Program) (state : RuntimeState) : Bool :=
  let entries := program.operations.filterMap sequentialScopeEntry?
  state.sequentialScopeControllers.all (fun controller =>
    match entries.filter (fun entry => entry.elementId.value == controller.id.activityElementId.value) with
    | [entry] => match sequentialScopeBindingForEntry? entry state with
      | some binding => binding.controller.id == controller.id
      | none => false
    | _ => false) &&
  entries.all (fun entry =>
    let activities := state.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId)
    let bodies := state.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId)
    match activities, bodies with
    | [], [] => true
    | [_], [_] => match sequentialScopeBindingForEntry? entry state, sequentialScopeCollection? entry state with
      | some binding, some items => binding.controller.total == items.length &&
          items[binding.controller.completed]? == some binding.controller.currentItem
      | _, _ => false
    | _, _ => false)

end BpmnSemantics.SemanticProcess
