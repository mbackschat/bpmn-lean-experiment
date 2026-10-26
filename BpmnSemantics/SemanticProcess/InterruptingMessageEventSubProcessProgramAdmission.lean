module

public import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
public import BpmnSemantics.SemanticProcessContract

/-! Independent IL admission for IMES-ARM-01 and IMES-CLOSE-01. Exact operation, port and scope
partitions distinguish a declaration-triggered handler from an ordinary entered child with a continuation. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

def uniqueOperationOwner? (program : Program) (id : OperationId) : Option DefinitionScopeId :=
  match program.operationScopes.filter (fun ownership => ownership.operationId == id) with
  | [ownership] => some ownership.scopeId
  | _ => none

def placeOwner? (program : Program) (id : ControlPlaceId) : Option DefinitionScopeId :=
  match program.controlPlaceScopes.filter (fun ownership => ownership.controlPlaceId == id) with
  | [ownership] => some ownership.scopeId
  | _ => none

def taskPorts (operations : List SemanticOperation) : List (ControlPlaceId × ControlPlaceId) :=
  operations.filterMap fun
    | .awaitUserTask _ origin input output task =>
        if task.metadata.isNone && task.id.value == origin.elementId.value then some (input, output) else none
    | _ => none

def endInputs (operations : List SemanticOperation) : List ControlPlaceId :=
  operations.filterMap fun | .reachNoneEnd _ _ input => some input | _ => none

def distinctNonempty (ids : List String) : Bool :=
  ids.all nonempty && ids.eraseDups.length == ids.length

def flowNodeOrigins (operations : List SemanticOperation) : List String :=
  operations.filterMap fun
    | .initiate _ origin _ | .duplicate _ origin _ _
    | .awaitUserTask _ origin _ _ _ | .reachNoneEnd _ origin _ => some origin.elementId.value
    | _ => none

def declarationScopesValid (program : Program)
    (declaration : InterruptingMessageEventSubProcessDeclaration) : Bool :=
  match program.definitionScopes.filter (fun scope => scope.id == declaration.parentScopeId),
      program.definitionScopes.filter (fun scope => scope.id == declaration.handlerScopeId) with
  | [parent], [child] =>
      program.definitionScopes.length == 2 && parent.id != child.id &&
        nonempty parent.id.value && nonempty child.id.value &&
        parent.parentScopeId.isNone && parent.originElementId.value == program.processId.value &&
        child.parentScopeId == some parent.id && child.originElementId == declaration.elementId
  | _, _ => false

def withdrawalProgramTopology (program : Program)
    (declaration : InterruptingMessageEventSubProcessDeclaration) : Bool :=
  let parent := declaration.parentScopeId
  let child := declaration.handlerScopeId
  let parentOps := program.operations.filter fun operation => uniqueOperationOwner? program operation.id == some parent
  let childOps := program.operations.filter fun operation => uniqueOperationOwner? program operation.id == some child
  let starts := parentOps.filterMap fun | .initiate _ _ output => some output | _ => none
  let forks := parentOps.filterMap fun | .duplicate _ _ input outputs => some (input, outputs) | _ => none
  let parentCompletions := parentOps.filterMap fun
    | .completeScope _ origin scope output => some (origin.elementId, scope, output)
    | _ => none
  let childCompletions := childOps.filterMap fun
    | .completeEventSubProcess _ origin scope => some (origin.elementId, scope)
    | _ => none
  match starts, forks, taskPorts parentOps, endInputs parentOps,
      taskPorts childOps, endInputs childOps, parentCompletions, childCompletions with
  | [startOutput], [(forkInput, forkOutputs)], [(inputA, outputA), (inputB, outputB)], [endA, endB],
      [(handlerInput, handlerOutput)], [handlerEnd], [(parentOrigin, parentScope, none)], [(childOrigin, childScope)] =>
      let parentPlaces := [startOutput, inputA, inputB, outputA, outputB]
      let childPlaces := [handlerInput, handlerOutput]
      let places := parentPlaces ++ childPlaces
      parentOps.length == 7 && childOps.length == 3 &&
        parentOrigin.value == program.processId.value && parentScope == parent &&
        childOrigin == declaration.elementId && childScope == child &&
        startOutput == forkInput && forkOutputs.length == 2 &&
        forkOutputs.contains inputA && forkOutputs.contains inputB && inputA != inputB &&
        ((outputA == endA && outputB == endB) || (outputA == endB && outputB == endA)) &&
        outputA != outputB && handlerInput == declaration.childEntry && handlerOutput == handlerEnd &&
        distinctNonempty (places.map (·.value)) &&
        parentPlaces.all (fun place => placeOwner? program place == some parent) &&
        childPlaces.all (fun place => placeOwner? program place == some child) &&
        program.controlPlaces.all (fun place => places.contains place.id)
  | _, _, _, _, _, _, _, _ => false

/-- Validate the Program directly; checked-source equality and runtime validity are separate gates. -/
def interruptingMessageEventSubProcessProgramGraph (program : Program) : Bool :=
  match program.interruptingMessageEventSubProcesses with
  | [declaration] =>
      match declaration.channel with
      | .operationMessage interfaceId operationId messageId =>
          let sourceIds := [program.processId.value, declaration.elementId.value, declaration.startEventId.value,
            interfaceId.value, operationId.value, messageId.value] ++
            flowNodeOrigins program.operations ++ program.controlPlaces.map (·.origin.elementId.value)
          program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
            program.compensationExecution.isNone && declarationScopesValid program declaration &&
            program.operations.length == 10 && program.operationScopes.length == 10 &&
            program.controlPlaces.length == 7 && program.controlPlaceScopes.length == 7 &&
            distinctNonempty (program.operations.map (·.id.value)) &&
            distinctNonempty (program.controlPlaces.map (·.id.value)) &&
            distinctNonempty sourceIds && withdrawalProgramTopology program declaration
      | _ => false
  | _ => false

/-- IMES-CLOSE-01 binds completion to its declared child and the child's parent, without a token port. -/
def completeEventSubProcessOperationWellFormed (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (scopeId : DefinitionScopeId) : Bool :=
  nonempty id.value && nonempty origin.elementId.value && nonempty scopeId.value &&
    match program.interruptingMessageEventSubProcesses.filter (fun declaration => declaration.handlerScopeId == scopeId) with
    | [declaration] =>
        origin.elementId == declaration.elementId && uniqueOperationOwner? program id == some scopeId &&
          placeOwner? program declaration.childEntry == some scopeId &&
          match program.definitionScopes.filter (fun scope => scope.id == scopeId) with
          | [scope] => scope.parentScopeId == some declaration.parentScopeId && scope.originElementId == origin.elementId
          | _ => false
    | _ => false

end BpmnSemantics.SemanticProcess
