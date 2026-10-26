module

public import BpmnSemantics.MessageStartConformanceFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation

/-! # Message Start Event admission conformance

This proof slice is kept separate so independent kernel-decided Message Start obligations do not accumulate in one near-cap elaboration process.
-/

@[expose] public section

namespace BpmnSemantics.MessageStartConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- The exact checked graph is independently admitted. -/
theorem exact_checked_process_is_admitted :
    checkedWellFormed checkedProcess = true := by
  decide +kernel

/-- The exact lowered IL is independently admitted. -/
theorem exact_program_is_admitted :
    programWellFormed program = true := by
  decide +kernel

/-- The registered profile selects exactly one Message Start operation with one output. -/
theorem exact_program_profile_is_admitted :
    programProfileCapabilitiesValid program = true := by
  decide +kernel

/-- Checked source and IL are bound by exact lowering equality. -/
theorem exact_definition_binding_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  decide +kernel

/-- Lowering preserves the exact Start Event origin, full channel, and endpoint-derived output. -/
theorem exact_lowering_preserves_message_start :
    lowerCheckedProcess checkedProcess = expectedProgram := by
  rfl

/-- Message Start output lowering is a canonical projection of checked Sequence Flow endpoints. -/
def exact_lowering_uses_only_checked_flow_endpoints : Bool := decide <|
    lowerMessageStartOutputs checkedProcess startEventId = [startOutput]

/-- A same-Message, same-Interface source mutation with a different Interface Operation changes the lowered operation. -/
def interface_operation_is_a_lowering_discriminator : Bool := decide <|
    lowerMessageStartOperation checkedProcess startEventId
        wrongInterfaceOperationChannel ≠
      lowerMessageStartOperation checkedProcess startEventId channel

/-- Generic IL validation admits canonical nonempty distinct Message initiation outputs. -/
def generic_message_initiation_accepts_multiple_distinct_outputs : Bool := decide <|
    messageInitiationOperationWellFormed
      [ { id := ⟨"place:A"⟩, origin := { elementId := ⟨"Flow_A"⟩ } }
      , { id := ⟨"place:B"⟩, origin := { elementId := ⟨"Flow_B"⟩ } } ]
      ⟨"operation:message-start"⟩
      { elementId := startEventId }
      channel
      [⟨"place:A"⟩, ⟨"place:B"⟩] = true

/-- Generic IL validation rejects empty and repeated output lists. -/
def generic_message_initiation_rejects_empty_or_repeated_outputs : Bool := decide <|
    messageInitiationOperationWellFormed
        [{ id := ⟨"place:A"⟩, origin := { elementId := ⟨"Flow_A"⟩ } }]
        ⟨"operation:message-start"⟩
        { elementId := startEventId }
        channel [] = false ∧
      messageInitiationOperationWellFormed
        [{ id := ⟨"place:A"⟩, origin := { elementId := ⟨"Flow_A"⟩ } }]
        ⟨"operation:message-start"⟩
        { elementId := startEventId }
        channel [⟨"place:A"⟩, ⟨"place:A"⟩] = false

/-- The selected profile refuses the generic multi-output representation. -/
theorem selected_profile_requires_exactly_one_output :
    programProfileCapabilitiesValid
      { expectedProgram with
        operations := expectedProgram.operations.map fun operation =>
          match operation with
          | .initiateMessage id origin messageChannel _ =>
              .initiateMessage id origin messageChannel
                [⟨"place:A"⟩, ⟨"place:B"⟩]
          | other => other } = false := by
  decide +kernel

/-- Exact trigger admission creates one fresh root occurrence and no payload or subscription state. -/
theorem exact_trigger_admission_state :
    admittedState =
      { runningStartState instanceId [] with
        scopeOccurrences := [{ id := rootOwner instanceId, parent := none }]
        scopeActivations :=
          [{ scopeId := rootDefinitionScopeId processId, count := 1 }] } := by
  decide +kernel

/-- Internal Message initiation creates the sole root-owned output token and no subscription. -/
def exact_message_initiation_state : Bool := decide <|
    initiatedState =
      { admittedState with
        initiationPending := false
        tokens := [rootToken instanceId processId startOutput] }

/-- Every executable check of this module, named for the driver's failure report. -/
def messageStartAdmissionConformanceChecks : List (String × Bool) := [
  ("exact_lowering_uses_only_checked_flow_endpoints", exact_lowering_uses_only_checked_flow_endpoints),
  ("interface_operation_is_a_lowering_discriminator", interface_operation_is_a_lowering_discriminator),
  ("generic_message_initiation_accepts_multiple_distinct_outputs", generic_message_initiation_accepts_multiple_distinct_outputs),
  ("generic_message_initiation_rejects_empty_or_repeated_outputs", generic_message_initiation_rejects_empty_or_repeated_outputs),
  ("exact_message_initiation_state", exact_message_initiation_state)
]

end BpmnSemantics.MessageStartConformance
