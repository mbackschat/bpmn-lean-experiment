module

public import BpmnSemantics.ActivityDataInputOutputConformanceDefinitionFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity

/-! Fixture definitions and executable checks of [`ActivityDataInputOutputAdmissionConformance`](ActivityDataInputOutputAdmissionConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.ActivityDataInputOutputConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess
def readyWithInput (value : VariableValue) : RuntimeState :=
  let ready := (runStart startWithoutSummary).state
  { ready with
    variables := { ready.variables with process :=
      { bindings := [{ name := claimDirectInput.source.id, value }] } } }

def unsupportedReadyInputStatesRemainRuntimeWellFormed : Bool := decide <|
    [.boolean true, .integer 1, .stringList ["item"]].all (fun value =>
      runtimeStateWellFormed claimProgram claimInstanceId (readyWithInput value)) = true

def unsupportedReadyInputsRefuseComposedActivation : Bool := decide <|
    [.boolean true, .integer 1, .stringList ["item"]].any (fun value =>
      (activateDataInputOutputUserTask? (programPropertyPathValuePolicy claimProgram) (readyWithInput value)
        ⟨"place:Flow_ClaimReceived_Assess"⟩ ⟨"place:Flow_AssessClaim_Recorded"⟩
        ⟨"UserTask_AssessClaim"⟩ (some "Assess claim") claimDirectInput).isSome) = false

/-- `ADIO-READY-01`: a present String activates the task and leaves the Process source unchanged. -/
def presentSummaryActivatesOneTask : Bool := decide <|
    ((runStart startWithSummary).outcome,
      (runStart startWithSummary).state.waits.map (·.task.id),
      (runStart startWithSummary).state.variables.process.bindings) =
      (CommandOutcome.committed, [⟨"UserTask_AssessClaim"⟩], [summary])

/-- `ADIO-READY-01`: explicit null is present and is copied without erasure. -/
def explicitNullActivatesAndRemainsNull : Bool := decide <|
    (runStart startWithNullSummary).state.variables.activities =
      [{ owner := .activityOccurrence claimActivityOwner
         bindings :=
           [{ name := claimDirectInput.targetDataInputId, value := .null }] }]

/-- `ADIO-READY-01`: an absent required source commits Process start but creates no Activity state. -/
def absentSourceLeavesTheIncomingTokenWithoutActivity : Bool := decide <|
    ((runStart startWithoutSummary).outcome,
      (runStart startWithoutSummary).state.waits.isEmpty,
      (runStart startWithoutSummary).state.activityOccurrences.isEmpty,
      (runStart startWithoutSummary).state.variables.activities.isEmpty,
      projectTokenMultiplicities claimProgram (runStart startWithoutSummary).state) =
      (CommandOutcome.committed, true, true, true,
        [(⟨"place:Flow_AssessClaim_Recorded"⟩, 0),
         (⟨"place:Flow_ClaimReceived_Assess"⟩, 1)])

/-- Every executable check of this module, named for the driver's failure report. -/
def activityDataInputOutputAdmissionConformanceChecks : List (String × Bool) := [
  ("unsupportedReadyInputStatesRemainRuntimeWellFormed", unsupportedReadyInputStatesRemainRuntimeWellFormed),
  ("unsupportedReadyInputsRefuseComposedActivation", unsupportedReadyInputsRefuseComposedActivation),
  ("presentSummaryActivatesOneTask", presentSummaryActivatesOneTask),
  ("explicitNullActivatesAndRemainsNull", explicitNullActivatesAndRemainsNull),
  ("absentSourceLeavesTheIncomingTokenWithoutActivity", absentSourceLeavesTheIncomingTokenWithoutActivity)
]

end BpmnSemantics.ActivityDataInputOutputConformance
