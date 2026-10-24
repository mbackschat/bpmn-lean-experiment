module

public import BpmnSemantics.SemanticProcess.LoweringIdentity

/-! Lower the declaration-owned handler without an ordinary flow entry. The checked source keeps
Sequence Flow identity; the IL keeps its resolved control place and a token-free completion strategy. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def checkedMessageEventSubProcessElement (source : CheckedProcess) (id : NodeId) : Bool :=
  source.interruptingMessageEventSubProcesses.any (fun declaration => declaration.elementId == id)

def lowerMessageEventSubProcessDeclarations (source : CheckedProcess) :
    List InterruptingMessageEventSubProcessDeclaration :=
  source.interruptingMessageEventSubProcesses.map fun declaration => {
    parentScopeId := declaration.parentScopeId
    handlerScopeId := declaration.handlerScopeId
    elementId := declaration.elementId
    startEventId := declaration.startEventId
    channel := declaration.channel
    childEntry := flowControlPlaceId declaration.childEntryFlowId }

def lowerMessageEventSubProcessCompletion? (source : CheckedProcess) (scope : DefinitionScope) :
    Option (SemanticOperation × DefinitionScopeId) := do
  let declaration ← source.interruptingMessageEventSubProcesses.find?
    (fun candidate => candidate.handlerScopeId == scope.id)
  pure (.completeEventSubProcess ⟨"operation:complete-event-subprocess:" ++ scope.id.value⟩
    { elementId := declaration.elementId } scope.id, scope.id)

end BpmnSemantics.SemanticProcess
