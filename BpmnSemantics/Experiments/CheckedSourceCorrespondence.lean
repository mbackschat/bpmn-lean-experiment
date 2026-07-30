import BpmnSemantics.Experiments.CheckedSourceTransition
import BpmnSemantics.SemanticProcess.Execution

/-! # Stage 1 checked-source correspondence

This provisional module establishes the ordering substrate and a two-segment enabled-transition correspondence before any graph-admission proof is attempted. It compares the direct checked-source selector with the production operation evaluator; it does not claim closure or run preservation.
-/

namespace BpmnSemantics.Experiments.CheckedSourceCorrespondence

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private theorem lex_same_prefix {α : Type} [LT α]
    (ltIrrefl : ∀ value : α, ¬value < value)
    (common left right : List α) :
    List.Lex (· < ·) (common ++ left) (common ++ right) ↔
      List.Lex (· < ·) left right := by
  induction common with
  | nil => simp
  | cons head tail ih =>
      simp only [List.cons_append, List.cons_lex_cons_iff]
      simp [ltIrrefl head, ih]

/-- Adding the production operation-ID prefix preserves and reflects identifier order. -/
theorem operationPrefixPreservesLt (left right : String) :
    ("operation:" ++ left < "operation:" ++ right) ↔ left < right := by
  simp only [String.lt_iff, String.toList_append]
  exact lex_same_prefix (fun _ => Std.lt_irrefl)
    "operation:".toList left.toList right.toList

private def lowerControl :
    CheckedSourceSemantics.SourceControl → ProcessControl
  | .notStarted => .notStarted
  | .running instanceId => .running instanceId
  | .completed instanceId => .completed instanceId

private def lowerWait
    (wait : CheckedSourceSemantics.SourceUserTaskWait) : UserTaskWait :=
  { processInstanceId := wait.processInstanceId
    task := { id := ⟨wait.taskNodeId.value⟩, name := wait.name }
    activation := wait.activation
    output := flowControlPlaceId wait.output }

private def lowerActivation
    (activation : CheckedSourceSemantics.SourceTaskActivation) :
    TaskActivation :=
  { taskId := ⟨activation.taskNodeId.value⟩
    count := activation.count }

private def lowerState
    (state : CheckedSourceSemantics.SourceRuntimeState) : RuntimeState :=
  { control := lowerControl state.control
    initiationPending := state.initiationPending
    tokens := state.tokens.map flowControlPlaceId
    waits := state.waits.map lowerWait
    timerWaits := []
    effectWaits := []
    variables := emptyScopedVariables
    activations := state.activations.map lowerActivation
    timerActivations := []
    effectActivations := []
    endOccurrences := state.endOccurrences
    logicalTimeMs := state.logicalTimeMs }

private def sourceEnabledTransitions (source : CheckedProcess)
    (state : CheckedSourceSemantics.SourceRuntimeState) :
    List (OperationId × RuntimeState) :=
  (CheckedSourceSemantics.enabledTransitions source state).map
    fun (node, successor) =>
      (nodeOperationId node.id, lowerState successor)

private def programEnabledTransitions (program : Program)
    (state : RuntimeState) : List (OperationId × RuntimeState) :=
  program.operations.filterMap fun operation =>
    (fire? operation state).map fun successor => (operation.id, successor)

private def enabledTransitionsCorrespondAt (source : CheckedProcess)
    (state : CheckedSourceSemantics.SourceRuntimeState) : Bool :=
  decide (
    sourceEnabledTransitions source state =
      programEnabledTransitions (lowerCheckedProcess source)
        (lowerState state))

private def twoSegmentSource : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"checked-source-stage-1"⟩
        sourceId := ⟨"two-segment-chain"⟩
        sourceSha256 :=
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := ⟨"Process_TwoSegment"⟩
    nodes :=
      [ .noneEndEvent ⟨"End"⟩
      , .noneStartEvent ⟨"Start"⟩
      , .userTask ⟨"Task_A"⟩ (some "A")
      , .userTask ⟨"Task_B"⟩ (some "B") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_A_B"⟩
          sourceId := ⟨"Task_A"⟩
          targetId := ⟨"Task_B"⟩ }
      , { id := ⟨"Flow_B_End"⟩
          sourceId := ⟨"Task_B"⟩
          targetId := ⟨"End"⟩ }
      , { id := ⟨"Flow_Start_A"⟩
          sourceId := ⟨"Start"⟩
          targetId := ⟨"Task_A"⟩ } ] }

private def sourceFire (node : CheckedNode)
    (state : CheckedSourceSemantics.SourceRuntimeState) :
    CheckedSourceSemantics.SourceRuntimeState :=
  (CheckedSourceSemantics.fireNode? twoSegmentSource node state).getD state

private def sourceComplete (nodeId : NodeId)
    (state : CheckedSourceSemantics.SourceRuntimeState) :
    CheckedSourceSemantics.SourceRuntimeState :=
  (CheckedSourceSemantics.completeUserTask state ⟨"Instance_1"⟩ nodeId 1)
    |>.getD state

private def beforeStart : CheckedSourceSemantics.SourceRuntimeState :=
  CheckedSourceSemantics.runningStartState ⟨"Instance_1"⟩

private def beforeTaskA : CheckedSourceSemantics.SourceRuntimeState :=
  sourceFire (.noneStartEvent ⟨"Start"⟩) beforeStart

private def beforeTaskB : CheckedSourceSemantics.SourceRuntimeState :=
  sourceComplete ⟨"Task_A"⟩
    (sourceFire (.userTask ⟨"Task_A"⟩ (some "A")) beforeTaskA)

private def beforeEnd : CheckedSourceSemantics.SourceRuntimeState :=
  sourceComplete ⟨"Task_B"⟩
    (sourceFire (.userTask ⟨"Task_B"⟩ (some "B")) beforeTaskB)

/-- The direct and lowered selectors agree at every automatic boundary in a two-segment serial chain. -/
theorem twoSegmentEnabledTransitionsCorrespondence :
    enabledTransitionsCorrespondAt twoSegmentSource beforeStart = true ∧
      enabledTransitionsCorrespondAt twoSegmentSource beforeTaskA = true ∧
      enabledTransitionsCorrespondAt twoSegmentSource beforeTaskB = true ∧
      enabledTransitionsCorrespondAt twoSegmentSource beforeEnd = true := by
  decide

def twoSegmentEnabledTransitionsCorrespond : Bool :=
  enabledTransitionsCorrespondAt twoSegmentSource beforeStart &&
    enabledTransitionsCorrespondAt twoSegmentSource beforeTaskA &&
    enabledTransitionsCorrespondAt twoSegmentSource beforeTaskB &&
    enabledTransitionsCorrespondAt twoSegmentSource beforeEnd

end BpmnSemantics.Experiments.CheckedSourceCorrespondence
