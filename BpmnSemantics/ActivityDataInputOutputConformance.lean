import BpmnSemantics.SemanticProcess.ActivityDataInputOutputActivationRuntimeStatePreservation
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputCompletionRuntimeStatePreservation
import BpmnSemantics.ActivityDataInputOutputAdmissionConformance
import BpmnSemantics.ActivityDataInputOutputRefusalConformance

/-! # Composed Activity data-input/output conformance

Finite claim-assessment witnesses for the composed one-Activity account. The quantified activation,
copy, completion, routing, cleanup, and refusal laws remain in
[ActivityDataInputOutput](SemanticProcess/ActivityDataInputOutput.lean); the two imported preservation
owners prove aggregate runtime well-formedness. These checks bind the laws to the source identities.
-/

namespace BpmnSemantics.ActivityDataInputOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- `ADIO-SCOPE-01`: the active occurrence owns one scope containing only the copied DataInput. -/
theorem activationCreatesOneInputBearingScope :
    active.variables.activities =
      [{ owner := .activityOccurrence claimActivityOwner
         bindings :=
           [{ name := claimDirectInput.targetDataInputId, value := summary.value }] }] := by
  decide +kernel

/-- `ADIO-OBSERVE-01`: the copied input is public while no output or routed target is published. -/
theorem activeTaskPublishesOnlyItsCopiedInput :
    (observeStableState claimProgram active).map (fun observation =>
      (observation.openUserTasks, observation.variables)) =
      some
        ([{ id := claimTaskInstanceId
            name := some "Assess claim"
            state := .active
            inputs := some
              [{ name := claimDirectInput.targetDataInputId, value := summary.value }] }],
          [summary, unrelated]) := by
  decide +kernel

/-- `ADIO-ROUTE-01` and `ADIO-PRESERVE-01`: the association writes only its target Property while
retaining the input Property and unrelated Process binding. -/
theorem acceptedOutputIsRoutedAndPreservesOtherProcessBindings :
    (approved.outcome, approved.state.variables.process.bindings) =
      (CommandOutcome.committed,
        [ { name := claimDirectOutput.targetPropertyId, value := .string "approve" }
        , summary
        , unrelated ]) := by
  decide +kernel

/-- `ADIO-ATOMIC-01`: routed write, wait removal, record removal, and same-scope disposal commit
together. -/
theorem acceptedCompletionDisposesTheWholeActivityLifetime :
    (approved.state.waits.isEmpty, approved.state.activityOccurrences.isEmpty,
      approved.state.variables.activities.isEmpty,
      projectTokenMultiplicities claimProgram approved.state) =
      (true, true, true,
        [(⟨"place:Flow_AssessClaim_Recorded"⟩, 0),
         (⟨"place:Flow_ClaimReceived_Assess"⟩, 0)]) := by
  decide +kernel

/-- The composed activation preservation law is quantified over its predecessor and successor. -/
theorem quantifiedActivationRuntimeWellFormedPreservationIsAvailable
    (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed claimProgram claimInstanceId before = true)
    (transition : DataInputOutputActivationStep claimProgram before after) :
    runtimeStateWellFormed claimProgram claimInstanceId after = true := by
  exact dataInputOutputActivationStep_preserves_runtimeStateWellFormed
    claimProgram claimInstanceId before after (by decide +kernel) (by decide +kernel) wellFormed
      transition

/-- The composed completion preservation law is quantified over its predecessor and successor. -/
theorem quantifiedCompletionRuntimeWellFormedPreservationIsAvailable
    (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed claimProgram claimInstanceId before = true)
    (transition : DataInputOutputCompletionStep claimProgram before after) :
    runtimeStateWellFormed claimProgram claimInstanceId after = true := by
  exact dataInputOutputCompletionStep_preserves_runtimeStateWellFormed
    claimProgram claimInstanceId before after (by decide +kernel) (by decide +kernel) wellFormed
      transition

/-- The bounded positive active and completed states remain admitted by the aggregate runtime
predicate; the quantified family laws separately establish the one-scope and writer obligations. -/
theorem positiveStatesRemainRuntimeWellFormed :
    (runtimeStateWellFormed claimProgram claimInstanceId active,
      runtimeStateWellFormed claimProgram claimInstanceId approved.state) = (true, true) := by
  decide +kernel

end BpmnSemantics.ActivityDataInputOutputConformance
