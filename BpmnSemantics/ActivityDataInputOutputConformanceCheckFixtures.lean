module

public import BpmnSemantics.ActivityDataInputOutputAdmissionConformanceCheckFixtures
public import BpmnSemantics.ActivityDataInputOutputRefusalConformanceCheckFixtures
public import BpmnSemantics.ActivityDataInputOutputProjectionConformance
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity

/-! Fixture definitions and executable checks of [`ActivityDataInputOutputConformance`](ActivityDataInputOutputConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.ActivityDataInputOutputConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- `ADIO-SCOPE-01`: the active occurrence owns one scope containing only the copied DataInput. -/
def activationCreatesOneInputBearingScope : Bool := decide <|
    active.variables.activities =
      [{ owner := .activityOccurrence claimActivityOwner
         bindings :=
           [{ name := claimDirectInput.targetDataInputId, value := summary.value }] }]

/-- `ADIO-OBSERVE-01`: the copied input is public while no output or routed target is published. -/
def activeTaskPublishesOnlyItsCopiedInput : Bool := decide <|
    (observeStableState claimProgram active).map (fun observation =>
      (observation.openUserTasks, observation.variables)) =
      some
        ([{ id := claimTaskInstanceId
            name := some "Assess claim"
            state := .active
            inputs := some
              [{ name := claimDirectInput.targetDataInputId, value := summary.value }] }],
          [summary, unrelated])

/-- `ADIO-ROUTE-01` and `ADIO-PRESERVE-01`: the association writes only its target Property while
retaining the input Property and unrelated Process binding. -/
def acceptedOutputIsRoutedAndPreservesOtherProcessBindings : Bool := decide <|
    (approved.outcome, approved.state.variables.process.bindings) =
      (CommandOutcome.committed,
        [ { name := claimDirectOutput.target.id, value := .string "approve" }
        , summary
        , unrelated ])

/-- `ADIO-ATOMIC-01`: routed write, wait removal, record removal, and same-scope disposal commit
together. -/
def acceptedCompletionDisposesTheWholeActivityLifetime : Bool := decide <|
    (approved.state.waits.isEmpty, approved.state.activityOccurrences.isEmpty,
      approved.state.variables.activities.isEmpty,
      projectTokenMultiplicities claimProgram approved.state) =
      (true, true, true,
        [(⟨"place:Flow_AssessClaim_Recorded"⟩, 0),
         (⟨"place:Flow_ClaimReceived_Assess"⟩, 0)])

/-- The bounded positive active and completed states remain admitted by the aggregate runtime
predicate; the quantified family laws separately establish the one-scope and writer obligations. -/
def positiveStatesRemainRuntimeWellFormed : Bool := decide <|
    (runtimeStateWellFormed claimProgram claimInstanceId active,
      runtimeStateWellFormed claimProgram claimInstanceId approved.state) = (true, true)

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("activationCreatesOneInputBearingScope", activationCreatesOneInputBearingScope),
  ("activeTaskPublishesOnlyItsCopiedInput", activeTaskPublishesOnlyItsCopiedInput),
  ("acceptedOutputIsRoutedAndPreservesOtherProcessBindings", acceptedOutputIsRoutedAndPreservesOtherProcessBindings),
  ("acceptedCompletionDisposesTheWholeActivityLifetime", acceptedCompletionDisposesTheWholeActivityLifetime),
  ("positiveStatesRemainRuntimeWellFormed", positiveStatesRemainRuntimeWellFormed)
]

end BpmnSemantics.ActivityDataInputOutputConformance
