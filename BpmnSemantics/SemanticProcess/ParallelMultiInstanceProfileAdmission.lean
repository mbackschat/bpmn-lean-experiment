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

/-- Exact entry payload admitted by the selected parallel Multi-Instance profile. -/
def parallelMultiInstanceExactEntry : SemanticOperation → Bool
  | .awaitParallelMultiInstanceUserTask _ origin _ taskId _ _ _ boundaryTimer condition limits =>
      origin.elementId.value = taskId.value &&
        condition = .stringEquals "completionPolicy" "first" &&
        boundaryTimer.durationMs = 1000 &&
        limits =
          { maximumItems := 16
            maximumItemUtf8Bytes := 512
            maximumCanonicalCollectionUtf8Bytes := 8192 }
  | _ => false

/-- The distinct completion-operation census paired with the exact entry census. -/
def parallelMultiInstanceCompletionOperation : SemanticOperation → Bool
  | .completeParallelMultiInstanceUserTask .. => true
  | _ => false

theorem parallelMultiInstanceCompletionOperation_projects (operation : SemanticOperation) :
    parallelMultiInstanceCompletionOperation operation =
      (ParallelMultiInstanceCompletionArm.ofOperation? operation).isSome := by
  cases operation <;> rfl

theorem parallelMultiInstanceExactEntry_projects (operation : SemanticOperation)
    (exact : parallelMultiInstanceExactEntry operation = true) :
    (ParallelMultiInstanceArm.ofOperation? operation).isSome = true := by
  cases operation <;> simp_all [parallelMultiInstanceExactEntry,
    ParallelMultiInstanceArm.ofOperation?]

def programParallelMultiInstanceProfileMatches (program : Program) : Bool :=
  let entries := program.operations.filter parallelMultiInstanceExactEntry
  let completions := program.operations.filter parallelMultiInstanceCompletionOperation
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

/-- A selected valid profile exposes exactly one exact entry and its one paired completion. -/
theorem programParallelMultiInstanceProfile_pair_census (program : Program)
    (profile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId)
    (valid : programParallelMultiInstanceProfileMatches program = true) :
    ∃ entry completion,
      program.operations.filter parallelMultiInstanceExactEntry = [entry] ∧
      program.operations.filter parallelMultiInstanceCompletionOperation = [completion] ∧
      parallelMultiInstanceOperationsPair entry completion = true ∧
      parallelMultiInstanceCompletionForEntry? program.operations entry = some completion := by
  simp only [programParallelMultiInstanceProfileMatches, profile, decide_true, if_true,
    Bool.and_eq_true] at valid
  have pairMatch := valid.2
  generalize entriesEq : program.operations.filter parallelMultiInstanceExactEntry = entries
    at pairMatch
  generalize completionsEq : program.operations.filter parallelMultiInstanceCompletionOperation =
    completions at pairMatch
  cases entries with
  | nil => simp at pairMatch
  | cons entry rest =>
      cases rest with
      | cons next tail => simp at pairMatch
      | nil =>
          cases completions with
          | nil => simp at pairMatch
          | cons completion rest =>
              cases rest with
              | cons next tail => simp at pairMatch
              | nil =>
                  have pairFilter : program.operations.filter
                      (parallelMultiInstanceOperationsPair entry) =
                      (program.operations.filter parallelMultiInstanceCompletionOperation).filter
                        (parallelMultiInstanceOperationsPair entry) := by
                    induction program.operations with
                    | nil => rfl
                    | cons operation rest ih =>
                        by_cases pair :
                            parallelMultiInstanceOperationsPair entry operation = true
                        · have completionOperation :
                              parallelMultiInstanceCompletionOperation operation = true := by
                            rw [parallelMultiInstanceCompletionOperation_projects]
                            unfold parallelMultiInstanceOperationsPair at pair
                            cases entryProjection : ParallelMultiInstanceArm.ofOperation? entry <;>
                              cases completionProjection :
                                ParallelMultiInstanceCompletionArm.ofOperation? operation <;>
                              simp_all
                          simp [pair, completionOperation, ih]
                        · simp [pair, ih]
                  refine ⟨entry, completion, rfl, rfl, pairMatch, ?_⟩
                  unfold parallelMultiInstanceCompletionForEntry?
                  rw [pairFilter, completionsEq]
                  simp [pairMatch]

def parallelMultiInstanceOperationWellFormed (places : List ControlPlace) :
    SemanticOperation → Bool
  | operation@(.awaitParallelMultiInstanceUserTask id origin input _ _ data normalOutput
      boundaryTimer _ _) =>
      parallelMultiInstanceExactEntry operation &&
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
