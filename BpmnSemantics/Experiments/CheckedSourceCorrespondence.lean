module

public import BpmnSemantics.Experiments.CheckedSourceTransition
public import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.Fixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # Stage 1 checked-source correspondence

This provisional module establishes the ordering substrate and a two-segment enabled-transition correspondence before any graph-admission proof is attempted. It compares the direct checked-source selector with the production operation evaluator; it does not claim closure or run preservation.
-/

@[expose] public section

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

def lowerControl :
    CheckedSourceSemantics.SourceControl → ProcessControl
  | .notStarted => .notStarted
  | .running instanceId => .running instanceId
  | .completed instanceId => .completed instanceId

def lowerWait
    (source : CheckedProcess)
    (wait : CheckedSourceSemantics.SourceUserTaskWait) : UserTaskWait :=
  { processInstanceId := wait.processInstanceId
    owner := rootScopeOccurrenceId wait.processInstanceId source.processId
    task := { id := ⟨wait.taskNodeId.value⟩, name := wait.name }
    activation := wait.activation
    output := flowControlPlaceId wait.output }

def lowerActivation
    (activation : CheckedSourceSemantics.SourceTaskActivation) :
    TaskActivation :=
  { taskId := ⟨activation.taskNodeId.value⟩
    count := activation.count }

def insertActivation (activation : TaskActivation) :
    List TaskActivation → List TaskActivation
  | [] => [activation]
  | current :: rest =>
      if activation.taskId.value < current.taskId.value then
        activation :: current :: rest
      else current :: insertActivation activation rest

def sortActivations : List TaskActivation → List TaskActivation
  | [] => []
  | activation :: rest =>
      insertActivation activation (sortActivations rest)

def lowerState
    (source : CheckedProcess)
    (state : CheckedSourceSemantics.SourceRuntimeState) : RuntimeState :=
  let instanceId? := match state.control with
    | .notStarted => none
    | .running instanceId
    | .completed instanceId => some instanceId
  let owner? := instanceId?.map fun instanceId =>
    rootScopeOccurrenceId instanceId source.processId
  { control := lowerControl state.control
    initiationPending := state.initiationPending
    scopeOccurrences := match state.control with
      | .running instanceId =>
          [{ id := rootScopeOccurrenceId instanceId source.processId, parent := none }]
      | .notStarted
      | .completed _ => []
    tokens := state.tokens.filterMap fun token => owner?.map fun owner =>
      { placeId := flowControlPlaceId token, owner }
    waits := state.waits.map (lowerWait source)
    messageWaits := []
    timerWaits := []
    effectWaits := []
    selectedBranchSets := []
    variables := emptyScopedVariables
    activations := sortActivations (state.activations.map lowerActivation)
    messageActivations := []
    timerActivations := []
    effectActivations := []
    scopeActivations := instanceId?.map (fun _ =>
      { scopeId := rootDefinitionScopeId source.processId, count := 1 }) |>.toList
    endOccurrences := state.endOccurrences
    logicalTimeMs := state.logicalTimeMs }

def sourceEnabledTransitions (source : CheckedProcess)
    (state : CheckedSourceSemantics.SourceRuntimeState) :
    List (OperationId × RuntimeState) :=
  (CheckedSourceSemantics.enabledTransitions source state).map
    fun (node, successor) =>
      (nodeOperationId node.id, lowerState source successor)

def closeRootIfEnabled (program : Program) (state : RuntimeState) :
    RuntimeState :=
  match program.operations.find? fun
      | .completeScope _ _ _ none => true
      | _ => false with
  | none => state
  | some completion => (fire? program completion state).getD state

/-- Frozen operation surface for this pre-Terminate experiment. The new family is explicit and fail-closed. -/
def correspondenceOperationSupported : SemanticOperation → Bool
  | .initiate .. | .awaitUserTask .. | .duplicate .. | .synchronize ..
  | .reachNoneEnd .. | .completeScope .. => true
  | .initiateMessage .. | .initiateTimer .. | .enterScope ..
  | .enterBoundedScope .. | .invokeProcess .. | .returnProcess ..
  | .enterMonitoredScope ..
  | .awaitDataInputUserTask ..
  | .awaitDataInputOutputUserTask ..
  | .awaitDataOutputUserTask ..
  | .enterSequentialMultiInstanceScope .. | .completeSequentialMultiInstanceScope ..
  | .enterParallelMultiInstanceScope .. | .completeParallelMultiInstanceScope ..
  | .awaitSequentialMultiInstanceUserTask ..
  | .awaitParallelMultiInstanceUserTask ..
  | .completeParallelMultiInstanceUserTask ..
  | .awaitTimer .. | .awaitMessage .. | .awaitPayloadMessage ..
  | .awaitCorrelatedPayloadMessage .. | .awaitEventRace ..
  | .awaitBoundedUserTask .. | .awaitMessageBoundedUserTask ..
  | .awaitMessageMonitoredUserTask ..
  | .awaitMonitoredUserTask .. | .awaitEffect ..
  | .mergeExclusive .. | .choose .. | .selectMany ..
  | .synchronizeSelected .. | .throwError .. | .triggerCompensation .. | .cancelTransaction ..
  | .terminateScope .. | .completeEventSubProcess .. => false

def programEnabledTransitions (program : Program)
    (state : RuntimeState) : List (OperationId × RuntimeState) :=
  program.operations.filterMap fun operation =>
    if correspondenceOperationSupported operation then
      (fire? program operation state).map fun successor =>
        (operation.id, closeRootIfEnabled program successor)
    else none

def enabledTransitionsCorrespondAt (source : CheckedProcess)
    (state : CheckedSourceSemantics.SourceRuntimeState) : Bool :=
  decide (
    sourceEnabledTransitions source state =
      programEnabledTransitions (lowerCheckedProcess source)
        (lowerState source state))

def correspondenceTwoSegmentSource : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"checked-source-stage-1"⟩
        sourceId := ⟨"two-segment-chain"⟩
        sourceSha256 :=
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := ⟨"Process_TwoSegment"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_TwoSegment"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_TwoSegment"⟩
      [⟨"End"⟩, ⟨"Start"⟩, ⟨"Task_A"⟩, ⟨"Task_B"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"Process_TwoSegment"⟩
      [⟨"Flow_A_B"⟩, ⟨"Flow_B_End"⟩, ⟨"Flow_Start_A"⟩]
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

def sourceFire (node : CheckedNode)
    (state : CheckedSourceSemantics.SourceRuntimeState) :
    CheckedSourceSemantics.SourceRuntimeState :=
  (CheckedSourceSemantics.fireNode? correspondenceTwoSegmentSource node state).getD state

def sourceComplete (nodeId : NodeId)
    (state : CheckedSourceSemantics.SourceRuntimeState) :
    CheckedSourceSemantics.SourceRuntimeState :=
  (CheckedSourceSemantics.completeUserTask state ⟨"Instance_1"⟩ nodeId 1)
    |>.getD state

def beforeStart : CheckedSourceSemantics.SourceRuntimeState :=
  CheckedSourceSemantics.runningStartState ⟨"Instance_1"⟩

def beforeTaskA : CheckedSourceSemantics.SourceRuntimeState :=
  sourceFire (.noneStartEvent ⟨"Start"⟩) beforeStart

def beforeTaskB : CheckedSourceSemantics.SourceRuntimeState :=
  sourceComplete ⟨"Task_A"⟩
    (sourceFire (.userTask ⟨"Task_A"⟩ (some "A")) beforeTaskA)

def beforeEnd : CheckedSourceSemantics.SourceRuntimeState :=
  sourceComplete ⟨"Task_B"⟩
    (sourceFire (.userTask ⟨"Task_B"⟩ (some "B")) beforeTaskB)

/-- The direct and lowered selectors agree at every automatic boundary in a two-segment serial chain. -/
theorem twoSegmentEnabledTransitionsCorrespondence :
    enabledTransitionsCorrespondAt correspondenceTwoSegmentSource beforeStart = true ∧
      enabledTransitionsCorrespondAt correspondenceTwoSegmentSource beforeTaskA = true ∧
      enabledTransitionsCorrespondAt correspondenceTwoSegmentSource beforeTaskB = true ∧
      enabledTransitionsCorrespondAt correspondenceTwoSegmentSource beforeEnd = true := by
  decide +kernel

def twoSegmentEnabledTransitionsCorrespond : Bool :=
  enabledTransitionsCorrespondAt correspondenceTwoSegmentSource beforeStart &&
    enabledTransitionsCorrespondAt correspondenceTwoSegmentSource beforeTaskA &&
    enabledTransitionsCorrespondAt correspondenceTwoSegmentSource beforeTaskB &&
    enabledTransitionsCorrespondAt correspondenceTwoSegmentSource beforeEnd

end BpmnSemantics.Experiments.CheckedSourceCorrespondence
