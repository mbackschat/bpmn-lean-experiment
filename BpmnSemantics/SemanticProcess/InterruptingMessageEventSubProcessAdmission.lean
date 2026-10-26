module

public import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
public import BpmnSemantics.CheckedProcessContract

/-! Structural admission for the bounded application-withdrawal graph. The dormant handler is identified
by declaration and ownership, never by a fixture name; generic artifact and profile admission remain separate. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

abbrev interruptingMessageEventSubProcessProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-interrupting-message-event-subprocess-draft"⟩

def nodeOwner? (source : CheckedProcess) (id : NodeId) : Option DefinitionScopeId :=
  match source.nodeScopes.filter (fun ownership => ownership.nodeId == id) with
  | [ownership] => some ownership.scopeId
  | _ => none

def flowOwner? (source : CheckedProcess) (id : SequenceFlowId) : Option DefinitionScopeId :=
  match source.sequenceFlowScopes.filter (fun ownership => ownership.sequenceFlowId == id) with
  | [ownership] => some ownership.scopeId
  | _ => none

def ordinaryTasks (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .userTask id _ none => some id
    | _ => none

def noneEnds (nodes : List CheckedNode) : List NodeId :=
  nodes.filterMap fun
    | .noneEndEvent id => some id
    | _ => none

def between (source : CheckedProcess) (sourceId targetId : NodeId) : List CheckedSequenceFlow :=
  source.sequenceFlows.filter (fun flow => flow.sourceId == sourceId && flow.targetId == targetId)

def exactEdge (source : CheckedProcess) (sourceId targetId : NodeId) : Bool :=
  (between source sourceId targetId).length == 1

def withdrawalTopology (source : CheckedProcess)
    (declaration : CheckedInterruptingMessageEventSubProcess) : Bool :=
  let parentNodes := source.nodes.filter fun node => nodeOwner? source node.id == some declaration.parentScopeId
  let childNodes := source.nodes.filter fun node => nodeOwner? source node.id == some declaration.handlerScopeId
  let starts := parentNodes.filterMap fun | .noneStartEvent id => some id | _ => none
  let forks := parentNodes.filterMap fun | .parallelGateway id .diverging => some id | _ => none
  let handlers := parentNodes.filterMap fun | .embeddedSubProcess id scope => some (id, scope) | _ => none
  let messages := childNodes.filterMap fun | .messageStartEvent id channel => some (id, channel) | _ => none
  match starts, forks, handlers, messages, ordinaryTasks parentNodes, noneEnds parentNodes,
      ordinaryTasks childNodes, noneEnds childNodes with
  | [start], [fork], [(handler, childScope)], [(message, channel)], [taskA, taskB], [endA, endB], [handlerTask], [handlerEnd] =>
    parentNodes.length == 7 && childNodes.length == 3 &&
      handler == declaration.elementId && childScope == declaration.handlerScopeId &&
      message == declaration.startEventId && channel == declaration.channel &&
      exactEdge source start fork && exactEdge source fork taskA && exactEdge source fork taskB &&
      ((exactEdge source taskA endA && exactEdge source taskB endB) ||
        (exactEdge source taskA endB && exactEdge source taskB endA)) &&
      exactEdge source handlerTask handlerEnd &&
      match between source message handlerTask with
      | [entry] => entry.id == declaration.childEntryFlowId
      | _ => false
  | _, _, _, _, _, _, _, _ => false

/-- The seven required edges exhaust the graph, leaving no ordinary incoming or outgoing handler flow. -/
def interruptingMessageEventSubProcessCheckedGraph (source : CheckedProcess) : Bool :=
  match source.interruptingMessageEventSubProcesses with
  | [declaration] =>
    match declaration.channel,
        source.definitionScopes.filter (fun scope => scope.id == declaration.parentScopeId),
        source.definitionScopes.filter (fun scope => scope.id == declaration.handlerScopeId) with
    | .operationMessage interfaceId operationId messageId, [parent], [child] =>
      let sourceIds := [source.processId.value, interfaceId.value, operationId.value, messageId.value] ++
        source.nodes.map (·.id.value) ++ source.sequenceFlows.map (·.id.value)
      source.compensation.isNone && source.transactionCancellation.isNone &&
        declaration.interruption == .interrupting &&
        source.definitionScopes.length == 2 && source.nodes.length == 10 && source.sequenceFlows.length == 7 &&
        sourceIds.all nonempty && sourceIds.eraseDups.length == sourceIds.length &&
        parent.id != child.id && nonempty parent.id.value && nonempty child.id.value &&
        parent.parentScopeId.isNone && parent.originElementId.value == source.processId.value &&
        child.parentScopeId == some parent.id && child.originElementId == declaration.elementId &&
        source.nodeScopes.length == source.nodes.length &&
        source.sequenceFlowScopes.length == source.sequenceFlows.length &&
        source.nodes.all (fun node => nodeOwner? source node.id == some parent.id ||
          nodeOwner? source node.id == some child.id) &&
        source.sequenceFlows.all (fun flow =>
          flow.condition.isNone && (flowOwner? source flow.id).isSome &&
          flowOwner? source flow.id == nodeOwner? source flow.sourceId &&
          flowOwner? source flow.id == nodeOwner? source flow.targetId) &&
        withdrawalTopology source declaration
    | _, _, _ => false
  | _ => false

end BpmnSemantics.SemanticProcess
