module

public import BpmnSemantics.MessageStartConformanceFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog

/-! # Message Start Event identity conformance

This proof slice is kept separate so independent kernel-decided Message Start obligations do not accumulate in one near-cap elaboration process.
-/

@[expose] public section

namespace BpmnSemantics.MessageStartConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def rejectedExactly (candidateProgram : Program)
    (state : RuntimeState) (stimulus : Stimulus) : Bool :=
  decide (applyStimulus scenarioClosureLimit candidateProgram state stimulus =
    { outcome := .rejected
      state
      internalStepBoundExceeded := false
      ambiguousInternalChoice := false })

/-- An ordinary None Start command cannot select a Message Start program. -/
def wrong_start_kind_is_rejected_with_exact_state : Bool := decide <|
    ordinaryStartMatchesProgram program = false ∧
      rejectedExactly program initialState
        (.startProcess ⟨"wrong-kind"⟩ ⟨processId.value⟩ instanceId []) = true

/-- The inverse cross-kind discriminator also holds: a Message trigger cannot start a None Start program. -/
def message_trigger_cannot_start_none_start_program : Bool := decide <|
    admitMessageStart? sequentialProgram initialState
        ⟨sequentialProgram.processId.value⟩ instanceId ⟨"StartEvent_1"⟩
        channel = none ∧
      rejectedExactly sequentialProgram initialState
        (.triggerMessageStart
          ⟨"message-against-none-start"⟩
          ⟨sequentialProgram.processId.value⟩
          instanceId
          ⟨"StartEvent_1"⟩
          channel) = true

/-- Equivalent one-output Message and None starts have the same post-initiation control shape under explicit identity renaming. -/
theorem message_and_none_start_post_initiation_control_shapes_agree :
    OneOutputPostInitiationControlRelated startIdentityRenaming
      initiatedState noneStartInitiatedState := by
  unfold OneOutputPostInitiationControlRelated
  decide +kernel

/-- Process and Start Event identity mismatches reject with exact state preservation. -/
def process_or_start_event_mismatch_is_rejected_with_exact_state : Bool := decide <|
    admitMessageStart? program initialState ⟨"Other_Process"⟩ instanceId
        ⟨startEventId.value⟩ channel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-process"⟩ ⟨"Other_Process"⟩
          instanceId ⟨startEventId.value⟩ channel) = true ∧
      admitMessageStart? program initialState ⟨processId.value⟩ instanceId
        ⟨"Other_Start"⟩ channel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-start"⟩ ⟨processId.value⟩
          instanceId ⟨"Other_Start"⟩ channel) = true

/-- Every component of the operation-addressed Message channel participates in trigger identity. -/
theorem every_channel_component_mismatch_is_rejected_with_exact_state :
    admitMessageStart? program initialState ⟨processId.value⟩ instanceId
        ⟨startEventId.value⟩ wrongInterfaceChannel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-interface"⟩ ⟨processId.value⟩
          instanceId ⟨startEventId.value⟩ wrongInterfaceChannel) = true ∧
      admitMessageStart? program initialState ⟨processId.value⟩ instanceId
        ⟨startEventId.value⟩ wrongInterfaceOperationChannel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-operation"⟩ ⟨processId.value⟩
          instanceId ⟨startEventId.value⟩
          wrongInterfaceOperationChannel) = true ∧
      admitMessageStart? program initialState ⟨processId.value⟩ instanceId
        ⟨startEventId.value⟩ wrongMessageChannel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-message"⟩ ⟨processId.value⟩
          instanceId ⟨startEventId.value⟩ wrongMessageChannel) = true := by
  decide +kernel

/-- Wrong profile, broken root binding, and repeated-state triggers all preserve the exact input state. -/
def profile_root_or_state_mismatch_is_rejected_with_exact_state : Bool := decide <|
    let wrongProfileProgram :=
      { program with
          identity :=
            { program.identity with
              semanticProfile :=
                ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩ } }
    let brokenRootProgram := { program with definitionScopes := [] }
    admitMessageStart? wrongProfileProgram initialState ⟨processId.value⟩
        instanceId ⟨startEventId.value⟩ channel = none ∧
      rejectedExactly wrongProfileProgram initialState trigger = true ∧
      admitMessageStart? brokenRootProgram initialState ⟨processId.value⟩
        instanceId ⟨startEventId.value⟩ channel = none ∧
      rejectedExactly brokenRootProgram initialState trigger = true ∧
      admitMessageStart? program waitingState ⟨processId.value⟩ instanceId
        ⟨startEventId.value⟩ channel = none ∧
      rejectedExactly program waitingState trigger = true

/-- Distinct semantic instance identities create distinct root occurrences and controls. -/
theorem distinct_fresh_instances_do_not_alias :
    let first := (admitMessageStart? program initialState
      ⟨processId.value⟩ ⟨"Instance_A"⟩ ⟨startEventId.value⟩
      channel).getD initialState
    let second := (admitMessageStart? program initialState
      ⟨processId.value⟩ ⟨"Instance_B"⟩ ⟨startEventId.value⟩
      channel).getD initialState
    first.control ≠ second.control ∧
      first.scopeOccurrences ≠ second.scopeOccurrences := by
  decide +kernel

/-- Every executable check of this module, named for the driver's failure report. -/
def messageStartIdentityConformanceChecks : List (String × Bool) := [
  ("wrong_start_kind_is_rejected_with_exact_state", wrong_start_kind_is_rejected_with_exact_state),
  ("message_trigger_cannot_start_none_start_program", message_trigger_cannot_start_none_start_program),
  ("process_or_start_event_mismatch_is_rejected_with_exact_state", process_or_start_event_mismatch_is_rejected_with_exact_state),
  ("profile_root_or_state_mismatch_is_rejected_with_exact_state", profile_root_or_state_mismatch_is_rejected_with_exact_state)
]

end BpmnSemantics.MessageStartConformance
