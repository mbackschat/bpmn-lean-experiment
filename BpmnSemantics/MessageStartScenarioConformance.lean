import BpmnSemantics.MessageStartConformanceFixtures

/-! # Message Start Event scenario conformance

This proof slice is kept separate so independent kernel-decided Message Start obligations do not accumulate in one near-cap elaboration process.
-/

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
theorem scenario_start_is_paired_with_program :
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
            channel]) = false := by
  decide +kernel

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
theorem wrong_interface_operation_is_unsupported_before_execution :
    supportsScenario program
      (scenarioForProgram program
        [.triggerMessageStart
          ⟨"wrong-operation"⟩
          ⟨processId.value⟩
          instanceId
          ⟨startEventId.value⟩
          wrongInterfaceOperationChannel]) = false := by
  decide +kernel

end BpmnSemantics.MessageStartConformance
