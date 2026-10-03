import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! Token-free completion of a declared Message Event Sub-Process. Exact child/parent binding and the
shared quiescence predicate gate disposal; ordinary scope continuation keeps its existing owner. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- BPMN 2.0.2 §13.5.4 closes an Event Sub-Process without an ordinary outgoing Sequence Flow. -/
def completeEventSubProcessState? (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (elementId : NodeId) : Option RuntimeState :=
  match program.interruptingMessageEventSubProcesses.filter
      (fun candidate => candidate.handlerScopeId == scopeId),
      state.scopeOccurrences.filter (fun candidate => candidate.id.definitionScopeId == scopeId) with
  | [declaration], [child] =>
    match child.parent with
    | none => none
    | some parent =>
      if declaration.elementId = elementId ∧
          state.control = .running child.id.processInstanceId ∧
          parent.processInstanceId = child.id.processInstanceId ∧
          parent.definitionScopeId = declaration.parentScopeId ∧
          program.definitionScopes.filter (fun candidate => candidate.id == scopeId) =
            [{ id := scopeId, parentScopeId := some declaration.parentScopeId,
               originElementId := declaration.elementId }] ∧
          (program.definitionScopes.filter
            (fun candidate => candidate.id == declaration.parentScopeId)).length = 1 ∧
          (state.scopeOccurrences.filter (fun candidate => candidate.id == parent)).length = 1 ∧
          scopeQuiescent state child.id = true then
        some { state with
          scopeOccurrences := state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ child.id)) }
      else none
  | _, _ => none

end BpmnSemantics.SemanticProcess
