import BpmnSemantics.ActivityDataInputOutputConformanceFixtures

/-! # Composed Activity data-input/output refusal conformance

Whole-state and direct-transition refusal decisions over the shared claim fixture. The separate
owner prevents malformed-state reductions from accumulating with successful lifetime proofs.
-/

set_option Elab.async false

namespace BpmnSemantics.ActivityDataInputOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- `ADIO-FILL-01`: omitting the sole required output preserves the complete active state. -/
theorem zeroOutputsRefuseWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram active
        (completeClaim "complete-without-decision" []) = refused active := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-FILL-01`: the association target is not a declared DataOutput name. -/
theorem targetPropertyNamedOutputRefusesWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram active
        (completeClaim "complete-under-target"
          [{ name := claimDirectOutput.targetPropertyId, value := .string "approve" }]) =
      refused active := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-FILL-01`: a second submitted output is not silently discarded. -/
theorem twoOutputsRefuseWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram active
        (completeClaim "complete-with-two-decisions"
          [decision (.string "approve"),
           { name := "DataOutput_Unadmitted", value := .string "second" }]) =
      refused active := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

private def copiedScope : ActivityVariableScope :=
  { owner := .activityOccurrence claimActivityOwner
    bindings := [{ name := claimDirectInput.targetDataInputId, value := summary.value }] }

private def withLocalScopes (scopes : List ActivityVariableScope) : RuntimeState :=
  { active with variables := { active.variables with activities := scopes } }

/-- `ADIO-SCOPE-01` and `ADIO-REFUSE-01`: two scopes for one Activity cannot be resolved by order. -/
theorem duplicateActivityOwnerRefusesWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram
        (withLocalScopes [copiedScope, copiedScope])
        (completeClaim "complete-duplicate-owner" [decision (.string "approve")]) =
      refused (withLocalScopes [copiedScope, copiedScope]) := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-REFUSE-01`: one scope with the wrong local binding is not the activation-time input. -/
theorem wrongLocalContentRefusesWithExactStatePreservation :
    let malformed : ActivityVariableScope :=
      { copiedScope with bindings := [{ name := "DataInput_Wrong", value := summary.value }] }
    applyStimulus scenarioClosureLimit claimProgram (withLocalScopes [malformed])
        (completeClaim "complete-wrong-local" [decision (.string "approve")]) =
      refused (withLocalScopes [malformed]) := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-REFUSE-01`: the copied local value remains in the composed profile's String-or-Null
domain even when an otherwise valid state is injected directly below Process-data admission. -/
theorem booleanLocalValueRefusesWithExactStatePreservation :
    let malformed : ActivityVariableScope :=
      { copiedScope with
          bindings :=
            [{ name := claimDirectInput.targetDataInputId, value := .boolean true }] }
    applyStimulus scenarioClosureLimit claimProgram (withLocalScopes [malformed])
        (completeClaim "complete-boolean-local" [decision (.string "approve")]) =
      refused (withLocalScopes [malformed]) := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

private def foreignClaimInstanceId : SemanticId := ⟨"ClaimAssessmentInstance_foreign"⟩

private def wrongClaimScopeOwner : ScopeOccurrenceId :=
  { processInstanceId := claimInstanceId
    definitionScopeId := ⟨"scope:wrong"⟩
    activation := 1 }

private def wrongOutputActive : RuntimeState :=
  { active with
    waits := active.waits.map fun wait =>
      { wait with output := ⟨"place:Flow_ClaimReceived_Assess"⟩ } }

private def wrongStaticScopeActive : RuntimeState :=
  { active with
    waits := active.waits.map fun wait => { wait with owner := wrongClaimScopeOwner }
    activityOccurrences := active.activityOccurrences.map fun record =>
      { record with owner := wrongClaimScopeOwner } }

private def wrongWaitProcessActive : RuntimeState :=
  { active with
    waits := active.waits.map fun wait => { wait with processInstanceId := foreignClaimInstanceId }
    activityOccurrences := active.activityOccurrences.map fun record =>
      { record with
        body := .userTask
          { processInstanceId := foreignClaimInstanceId
            elementId := ⟨"UserTask_AssessClaim"⟩
            activation := 1 } } }

private def wrongRecordProcessActive : RuntimeState :=
  { active with
    activityOccurrences := active.activityOccurrences.map fun record =>
      { record with processInstanceId := foreignClaimInstanceId }
    variables :=
      { active.variables with
        activities :=
          [{ copiedScope with
             owner := .activityOccurrence
               { claimActivityOwner with processInstanceId := foreignClaimInstanceId } }] } }

/-- The live wait must route to the output declared by its exact composed operation. -/
theorem wrongLiveWaitOutputRefusesBeforeMutation :
    completeDataInputOutputUserTask? claimProgram wrongOutputActive claimInstanceId
      ⟨"UserTask_AssessClaim"⟩ 1 [decision (.string "approve")] = none := by
  decide +kernel

/-- The wait and record owner cannot substitute a static scope outside the declaring operation. -/
theorem wrongLiveWaitStaticScopeRefusesBeforeMutation :
    completeDataInputOutputUserTask? claimProgram wrongStaticScopeActive claimInstanceId
      ⟨"UserTask_AssessClaim"⟩ 1 [decision (.string "approve")] = none := by
  decide +kernel

/-- A wait occurrence cannot claim a process distinct from its live scope owner. -/
theorem mismatchedLiveWaitProcessOwnerRefusesBeforeMutation :
    completeDataInputOutputUserTask? claimProgram wrongWaitProcessActive foreignClaimInstanceId
      ⟨"UserTask_AssessClaim"⟩ 1 [decision (.string "approve")] = none := by
  decide +kernel

/-- An Activity record cannot claim a process distinct from its live scope owner. -/
theorem mismatchedActivityRecordProcessOwnerRefusesBeforeMutation :
    completeDataInputOutputUserTask? claimProgram wrongRecordProcessActive claimInstanceId
      ⟨"UserTask_AssessClaim"⟩ 1 [decision (.string "approve")] = none := by
  decide +kernel

end BpmnSemantics.ActivityDataInputOutputConformance
