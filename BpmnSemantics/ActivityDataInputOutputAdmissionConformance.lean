import BpmnSemantics.ActivityDataInputOutputConformanceFixtures

/-! # Composed Activity data-input/output admission conformance

Exact start-binding and ready-input decisions for the claim-assessment profile. These decisions are
separate from completion and lifetime reductions to preserve the fixed build-memory boundary.
-/

set_option Elab.async false

namespace BpmnSemantics.ActivityDataInputOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem outputPropertyStartRefusesWithExactStatePreservation :
    runStart (startClaim "start-output-property"
      [{ name := claimDirectOutput.targetPropertyId, value := .string "seed" }]) =
      refused initialState := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

theorem extraStartBindingRefusesWithExactStatePreservation :
    runStart (startClaim "start-extra-binding" [summary, unrelated]) =
      refused initialState := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

private def readyWithInput (value : VariableValue) : RuntimeState :=
  let ready := (runStart startWithoutSummary).state
  { ready with
    variables := { ready.variables with process :=
      { bindings := [{ name := claimDirectInput.sourcePropertyId, value }] } } }

theorem unsupportedReadyInputStatesRemainRuntimeWellFormed :
    [.boolean true, .integer 1, .stringList ["item"]].all (fun value =>
      runtimeStateWellFormed claimProgram claimInstanceId (readyWithInput value)) = true := by
  decide +kernel

theorem unsupportedReadyInputsRefuseComposedActivation :
    [.boolean true, .integer 1, .stringList ["item"]].any (fun value =>
      (activateDataInputOutputUserTask? (readyWithInput value)
        ⟨"place:Flow_ClaimReceived_Assess"⟩ ⟨"place:Flow_AssessClaim_Recorded"⟩
        ⟨"UserTask_AssessClaim"⟩ (some "Assess claim") claimDirectInput).isSome) = false := by
  decide +kernel

/-- `ADIO-READY-01`: a present String activates the task and leaves the Process source unchanged. -/
theorem presentSummaryActivatesOneTask :
    ((runStart startWithSummary).outcome,
      (runStart startWithSummary).state.waits.map (·.task.id),
      (runStart startWithSummary).state.variables.process.bindings) =
      (CommandOutcome.committed, [⟨"UserTask_AssessClaim"⟩], [summary]) := by
  decide +kernel

/-- `ADIO-READY-01`: explicit null is present and is copied without erasure. -/
theorem explicitNullActivatesAndRemainsNull :
    (runStart startWithNullSummary).state.variables.activities =
      [{ owner := .activityOccurrence claimActivityOwner
         bindings :=
           [{ name := claimDirectInput.targetDataInputId, value := .null }] }] := by
  decide +kernel

/-- `ADIO-READY-01`: an absent required source commits Process start but creates no Activity state. -/
theorem absentSourceLeavesTheIncomingTokenWithoutActivity :
    ((runStart startWithoutSummary).outcome,
      (runStart startWithoutSummary).state.waits.isEmpty,
      (runStart startWithoutSummary).state.activityOccurrences.isEmpty,
      (runStart startWithoutSummary).state.variables.activities.isEmpty,
      projectTokenMultiplicities claimProgram (runStart startWithoutSummary).state) =
      (CommandOutcome.committed, true, true, true,
        [(⟨"place:Flow_AssessClaim_Recorded"⟩, 0),
         (⟨"place:Flow_ClaimReceived_Assess"⟩, 1)]) := by
  decide +kernel

end BpmnSemantics.ActivityDataInputOutputConformance
