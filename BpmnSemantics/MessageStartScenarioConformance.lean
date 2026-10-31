module

public import BpmnSemantics.SemanticProcess.ScenarioAdmission
public import BpmnSemantics.SemanticProcess.Scenario
public import BpmnSemantics.MessageStartConformanceFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.MessageStartConformanceFixtures
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationStartDataAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.InclusiveGateway
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import all BpmnSemantics.SemanticProcess.MessageStart
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.PortableHandoffAdmission
import all BpmnSemantics.SemanticProcess.ProfileCardinalities
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ScenarioAdmission
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.StructuredCompositionCommandAdmission
import all BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import all BpmnSemantics.SemanticProcess.TopologyFixtures
import all BpmnSemantics.Scenario
import all BpmnSemantics.SemanticProcess.UserTaskMetadata
import all BpmnSemantics.SemanticProcessContract

/-! # Message Start Event scenario conformance

This proof slice is kept separate so independent kernel-decided Message Start obligations do not accumulate in one near-cap elaboration process.
-/

public section

namespace BpmnSemantics.MessageStartConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- Both supported start variants are first-only, and no later start stimulus is admitted. -/
theorem scenario_start_sequence_is_first_only :
    stimulusSequenceSupported
        [trigger,
          .completeUserTaskInstance ⟨"complete"⟩
            { processInstanceId := instanceId
              elementId := ⟨taskNodeId.value⟩
              activation := 1 } []] = true ∧
      stimulusSequenceSupported
        [.startProcess ⟨"ordinary"⟩ ⟨"P"⟩ ⟨"I"⟩ []] = true ∧
      stimulusSequenceSupported [trigger, trigger] = false ∧
      stimulusSequenceSupported
        [.completeUserTaskInstance ⟨"complete"⟩
          { processInstanceId := instanceId
            elementId := ⟨taskNodeId.value⟩
            activation := 1 } []] = false := by
  decide +kernel

/-- Scenario admission pairs the first start kind with the program before executing any stimulus. -/
def scenario_start_is_paired_with_program : Bool := decide <|
    supportsScenario program (scenarioForProgram program [trigger]) = true ∧
      supportsScenario sequentialProgram
        (scenarioForProgram sequentialProgram
          [.startProcess ⟨"ordinary"⟩
            ⟨sequentialProgram.processId.value⟩ noneStartInstanceId []]) = true ∧
      supportsScenario program
        (scenarioForProgram program
          [.startProcess ⟨"wrong-kind"⟩ ⟨processId.value⟩ instanceId []]) = false ∧
      supportsScenario sequentialProgram
        (scenarioForProgram sequentialProgram
          [.triggerMessageStart
            ⟨"message-against-none-start"⟩
            ⟨sequentialProgram.processId.value⟩
            instanceId
            ⟨"StartEvent_1"⟩
            channel]) = false

/-- Cross-kind starts fail deployment admission and therefore execute no stimulus. -/
theorem cross_kind_scenarios_execute_no_stimulus :
    runScenario program
        (scenarioForProgram program
          [.startProcess ⟨"wrong-kind"⟩ ⟨processId.value⟩ instanceId []]) =
      { outcome := .semantic .unsupported
        trace := [.deployment .unsupported] } ∧
      runScenario sequentialProgram
        (scenarioForProgram sequentialProgram
          [.triggerMessageStart
            ⟨"message-against-none-start"⟩
            ⟨sequentialProgram.processId.value⟩
            instanceId
            ⟨"StartEvent_1"⟩
            channel]) =
        { outcome := .semantic .unsupported
          trace := [.deployment .unsupported] } := by
  decide +kernel

/-- Exact full-channel target pairing participates in scenario support admission. -/
def wrong_interface_operation_is_unsupported_before_execution : Bool := decide <|
    supportsScenario program
      (scenarioForProgram program
        [.triggerMessageStart
          ⟨"wrong-operation"⟩
          ⟨processId.value⟩
          instanceId
          ⟨startEventId.value⟩
          wrongInterfaceOperationChannel]) = false

/-- Every executable check of this module, named for the driver's failure report. -/
def messageStartScenarioConformanceChecks : List (String × Bool) := [
  ("scenario_start_is_paired_with_program", scenario_start_is_paired_with_program),
  ("wrong_interface_operation_is_unsupported_before_execution", wrong_interface_operation_is_unsupported_before_execution)
]

end BpmnSemantics.MessageStartConformance
