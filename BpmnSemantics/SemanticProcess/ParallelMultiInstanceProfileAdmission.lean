import BpmnSemantics.SemanticProcess.ParallelMultiInstanceContract
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression
import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants

/-! # Multi-Instance profile-family admission

This owner keeps the distinct sequential and parallel closed-sum arms from leaking into another
profile. The parallel profile additionally fixes its checked completion expression and exact paired
entry/completion operation payload.
-/

namespace BpmnSemantics.SemanticProcess

def sequentialMultiInstanceUserTaskProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-sequential-multi-instance-user-task-draft"⟩

def parallelMultiInstanceUserTaskProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-parallel-multi-instance-user-task-draft"⟩

def checkedSequentialMultiInstanceProfileMatches (source : CheckedProcess) : Bool :=
  source.nodes.any (fun
    | .sequentialMultiInstanceUserTask .. => true
    | _ => false) ==
      decide (source.identity.semanticProfile = sequentialMultiInstanceUserTaskProfileId)

def programSequentialMultiInstanceProfileMatches (program : Program) : Bool :=
  program.operations.any (fun
    | .awaitSequentialMultiInstanceUserTask .. => true
    | _ => false) ==
      decide (program.identity.semanticProfile = sequentialMultiInstanceUserTaskProfileId)

private def exactParallelCheckedNode : CheckedNode → Bool
  | .parallelMultiInstanceUserTask _ _ _ _ condition _ boundaryTimer =>
      condition.language = simpleBooleanExpressionLanguage &&
        condition.body = "stringEquals(completionPolicy,\"first\")" &&
        boundaryTimer.durationLiteral = "PT1S"
  | _ => false

def checkedParallelMultiInstanceProfileMatches (source : CheckedProcess) : Bool :=
  let nodes := source.nodes.filter exactParallelCheckedNode
  let declares := source.nodes.any fun
    | .parallelMultiInstanceUserTask .. => true
    | _ => false
  let selected := source.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId
  declares == decide selected && if selected then nodes.length = 1 else true

private def exactParallelEntry : SemanticOperation → Bool
  | .awaitParallelMultiInstanceUserTask _ origin _ taskId _ _ _ boundaryTimer condition limits =>
      origin.elementId.value = taskId.value &&
        condition = .stringEquals "completionPolicy" "first" &&
        boundaryTimer.durationMs = 1000 &&
        limits =
          { maximumItems := 16
            maximumItemUtf8Bytes := 512
            maximumCanonicalCollectionUtf8Bytes := 8192 }
  | _ => false

def programParallelMultiInstanceProfileMatches (program : Program) : Bool :=
  let entries := program.operations.filter exactParallelEntry
  let completions := program.operations.filter fun
    | .completeParallelMultiInstanceUserTask .. => true
    | _ => false
  let declares := program.operations.any fun
    | .awaitParallelMultiInstanceUserTask ..
    | .completeParallelMultiInstanceUserTask .. => true
    | _ => false
  let selected := program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId
  declares == decide selected &&
    if selected then
      match entries, completions with
      | [entry], [completion] => parallelMultiInstanceOperationsPair entry completion
      | _, _ => false
    else true

def parallelMultiInstanceOperationWellFormed (places : List ControlPlace) :
    SemanticOperation → Bool
  | operation@(.awaitParallelMultiInstanceUserTask id origin input _ _ data normalOutput
      boundaryTimer _ _) =>
      exactParallelEntry operation &&
        let identities :=
          [id.value, origin.elementId.value, boundaryTimer.elementId.value,
            data.input.collectionItemDefinitionId, data.input.scalarItemDefinitionId,
            data.input.dataObjectId, data.input.dataObjectReferenceId,
            data.input.loopDataInputId, data.input.inputDataItemId,
            data.input.taskDataInputId, data.input.collectionAssociationId,
            data.input.itemAssociationId, data.output.dataObjectId,
            data.output.dataObjectReferenceId, data.output.taskDataOutputId,
            data.output.outputDataItemId, data.output.loopDataOutputId,
            data.output.itemAssociationId, data.output.collectionAssociationId]
        identities.all nonempty && identities.eraseDups.length = identities.length &&
          decide (input ≠ normalOutput ∧ input ≠ boundaryTimer.output ∧
            normalOutput ≠ boundaryTimer.output) &&
          places.any (fun place => decide
            (place.id = boundaryTimer.output ∧ place.origin = boundaryTimer.origin)) &&
          places.any (fun place => decide (place.id = input)) &&
          places.any (fun place => decide (place.id = normalOutput))
  | .completeParallelMultiInstanceUserTask id origin entryOperationId taskElementId normalOutput =>
      nonempty id.value && nonempty entryOperationId.value && nonempty taskElementId.value &&
        nonempty origin.elementId.value &&
        origin.elementId.value = taskElementId.value &&
        places.any (fun place => decide (place.id = normalOutput))
  | _ => false

def parallelMultiInstanceCheckedNodeWellFormed (flows : List CheckedSequenceFlow) : CheckedNode → Bool
  | node@(.parallelMultiInstanceUserTask id _ input output _ normalOutputFlowId boundaryTimer) =>
      let identities :=
        [id.value, boundaryTimer.elementId.value,
          input.collectionItemDefinitionId, input.scalarItemDefinitionId,
          input.dataObjectId, input.dataObjectReferenceId, input.loopDataInputId,
          input.inputDataItemId, input.taskDataInputId, input.collectionAssociationId,
          input.itemAssociationId, output.dataObjectId, output.dataObjectReferenceId,
          output.taskDataOutputId, output.outputDataItemId, output.loopDataOutputId,
          output.itemAssociationId, output.collectionAssociationId]
      exactParallelCheckedNode node &&
        (flows.filter fun flow => decide (flow.targetId = id)).length = 1 &&
        (flows.filter fun flow => decide (flow.sourceId = id)).length = 1 &&
        flows.any (fun flow => decide
          (flow.id = normalOutputFlowId && flow.sourceId = id)) &&
        flows.any (fun flow => decide
          (flow.id = boundaryTimer.outputFlowId && flow.sourceId = boundaryTimer.elementId)) &&
        identities.all nonempty && identities.eraseDups.length = identities.length &&
        nonempty normalOutputFlowId.value && nonempty boundaryTimer.outputFlowId.value
  | _ => false

end BpmnSemantics.SemanticProcess
