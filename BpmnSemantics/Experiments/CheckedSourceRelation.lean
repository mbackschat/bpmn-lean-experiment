import BpmnSemantics.Experiments.CheckedSourceSemantics
import BpmnSemantics.ParallelForkJoinConformance
import BpmnSemantics.SemanticProcess.Fixtures
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.UserTaskInteractionConformance

/-! # BpmnSemantics.Experiments.CheckedSourceRelation — positional-lowering discriminator

The deliberately wrong lowerer zips checked User Tasks with separately sorted input/output Sequence Flows. It also obtains task metadata through the wrongly paired input Flow target, which makes the positional error publicly observable under an admitted renaming while the retained fixtures happen to align.
-/

namespace BpmnSemantics.Experiments.CheckedSourceRelation

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def nodeIsUserTask (source : CheckedProcess) (nodeId : NodeId) :
    Bool :=
  source.nodes.any fun
    | .userTask id _ => decide (id = nodeId)
    | _ => false

private def taskNameAt (source : CheckedProcess) (nodeId : NodeId) :
    Option String :=
  match source.nodes.find? fun node => decide (node.id = nodeId) with
  | some (.userTask _ name) => name
  | some _
  | none => none

private def taskInputFlows (source : CheckedProcess) :
    List CheckedSequenceFlow :=
  source.sequenceFlows.filter fun flow =>
    nodeIsUserTask source flow.targetId

private def taskOutputFlows (source : CheckedProcess) :
    List CheckedSequenceFlow :=
  source.sequenceFlows.filter fun flow =>
    nodeIsUserTask source flow.sourceId

private def rewriteTaskOperations (source : CheckedProcess) :
    List SemanticOperation → List CheckedSequenceFlow →
      List CheckedSequenceFlow → List SemanticOperation
  | [], _, _ => []
  | operation :: operations, inputs, outputs =>
      match operation, inputs, outputs with
      | .awaitUserTask id origin _ _ task,
          input :: remainingInputs,
          output :: remainingOutputs =>
          .awaitUserTask id origin
              (flowControlPlaceId input.id)
              (flowControlPlaceId output.id)
              { task with name := taskNameAt source input.targetId } ::
            rewriteTaskOperations source operations remainingInputs
              remainingOutputs
      | operation, _, _ =>
          operation ::
            rewriteTaskOperations source operations inputs outputs

/-- Deliberately wrong lowering retained only as the experiment countermodel. -/
def positionalLowerCheckedProcess (source : CheckedProcess) : Program :=
  let program := lowerCheckedProcess source
  { program with
    operations :=
      rewriteTaskOperations source program.operations
        (taskInputFlows source) (taskOutputFlows source) }

private def retainedScenarios : List (CheckedProcess × Scenario) :=
  [ (sequentialCheckedProcess,
      UserTaskInteractionConformance.successfulScenario)
  , (sequentialCheckedProcess,
      UserTaskInteractionConformance.wrongActivationScenario)
  , (sequentialCheckedProcess,
      UserTaskInteractionConformance.staleCompletionScenario)
  , (parallelCheckedProcess,
      ParallelForkJoinConformance.aThenBScenario)
  , (parallelCheckedProcess,
      ParallelForkJoinConformance.bThenAScenario)
  , (parallelCheckedProcess,
      ParallelForkJoinConformance.staleAWhileBActiveScenario) ]

def retainedFixturesSurvivePositionalLowering : Bool :=
  retainedScenarios.all fun (source, scenario) =>
    decide (
      runScenario (positionalLowerCheckedProcess source) scenario =
        runScenario (lowerCheckedProcess source) scenario)

def renamedCountermodel : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"parallel-fork-join-draft"⟩
        sourceId := ⟨"renamed-positional-countermodel"⟩
        sourceSha256 :=
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := ⟨"Process_Renamed"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_Renamed"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_Renamed"⟩
      [ ⟨"End"⟩, ⟨"Fork"⟩, ⟨"Join"⟩, ⟨"Start"⟩, ⟨"Task_A"⟩
      , ⟨"Task_Z"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"Process_Renamed"⟩
      [ ⟨"Flow_1_ToZ"⟩, ⟨"Flow_2_ToA"⟩, ⟨"Flow_3_AJoin"⟩
      , ⟨"Flow_4_ZJoin"⟩, ⟨"Flow_5_JoinEnd"⟩
      , ⟨"Flow_6_StartFork"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"End"⟩
      , .parallelGateway ⟨"Fork"⟩ .diverging
      , .parallelGateway ⟨"Join"⟩ .converging
      , .noneStartEvent ⟨"Start"⟩
      , .userTask ⟨"Task_A"⟩ (some "Alpha")
      , .userTask ⟨"Task_Z"⟩ (some "Zulu") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_1_ToZ"⟩
          sourceId := ⟨"Fork"⟩
          targetId := ⟨"Task_Z"⟩ }
      , { id := ⟨"Flow_2_ToA"⟩
          sourceId := ⟨"Fork"⟩
          targetId := ⟨"Task_A"⟩ }
      , { id := ⟨"Flow_3_AJoin"⟩
          sourceId := ⟨"Task_A"⟩
          targetId := ⟨"Join"⟩ }
      , { id := ⟨"Flow_4_ZJoin"⟩
          sourceId := ⟨"Task_Z"⟩
          targetId := ⟨"Join"⟩ }
      , { id := ⟨"Flow_5_JoinEnd"⟩
          sourceId := ⟨"Join"⟩
          targetId := ⟨"End"⟩ }
      , { id := ⟨"Flow_6_StartFork"⟩
          sourceId := ⟨"Start"⟩
          targetId := ⟨"Fork"⟩ } ] }

def renamedCountermodelScenario : Scenario :=
  { kind := .scenario
    id := ⟨"renamed-positional-countermodel"⟩
    profile := renamedCountermodel.identity.semanticProfile
    bpmn :=
      { id := renamedCountermodel.identity.sourceId
        relativePath := "experiment-only"
        sha256 := renamedCountermodel.identity.sourceSha256 }
    stimuli :=
      [ .startProcess ⟨"start-renamed"⟩
          ⟨renamedCountermodel.processId.value⟩ ⟨"Instance_Renamed"⟩ [] ]
    observations := CheckedSourceSemantics.requiredObservations
    provenance :=
      { normativeRefs := []
        cibRevision := ""
        cibRefs := [] } }

def renamedCountermodelDiverges : Bool :=
  checkedWellFormed renamedCountermodel &&
    programWellFormed (positionalLowerCheckedProcess renamedCountermodel) &&
    decide (
      CheckedSourceSemantics.runScenarioWithClosureLimit scenarioClosureLimit
          renamedCountermodel renamedCountermodelScenario ≠
        runScenario (positionalLowerCheckedProcess renamedCountermodel)
          renamedCountermodelScenario)

/-- The retained positional-lowering discriminator remains structurally admissible. -/
theorem positionalCountermodelProgramIsAccepted :
    programWellFormed (positionalLowerCheckedProcess renamedCountermodel) =
      true := by
  decide

def renamedCountermodelMatchesEndpointLowering : Bool :=
  decide (
    CheckedSourceSemantics.runScenarioWithClosureLimit scenarioClosureLimit
        renamedCountermodel renamedCountermodelScenario =
      runScenario (lowerCheckedProcess renamedCountermodel)
        renamedCountermodelScenario)

end BpmnSemantics.Experiments.CheckedSourceRelation
