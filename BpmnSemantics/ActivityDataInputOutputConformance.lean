import BpmnSemantics.SemanticProcess.ActivityDataInputOutputActivationRuntimeStatePreservation
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputCompletionRuntimeStatePreservation
import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # Composed Activity data-input/output conformance

Finite claim-assessment witnesses for the composed one-Activity account. The quantified activation,
copy, completion, routing, cleanup, refusal, and family-local well-formedness laws remain in
[ActivityDataInputOutput](SemanticProcess/ActivityDataInputOutput.lean); these checks bind those laws
to the approved source identities and observable business path.
-/

namespace BpmnSemantics.ActivityDataInputOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def claimDirectInput : DirectActivityDataInput :=
  { associationId := "DataInputAssociation_ClaimSummary"
    sourcePropertyId := "Property_ClaimSummary"
    targetDataInputId := "DataInput_ClaimSummary"
    targetDataInputName := some "Claim summary" }

private def claimDirectOutput : DirectActivityDataOutput :=
  { associationId := "DataOutputAssociation_ClaimDecision"
    sourceDataOutputId := "DataOutput_ClaimDecision"
    sourceDataOutputName := some "Claim decision"
    targetPropertyId := "Property_ClaimDecision" }

private def claimProcessId : ProcessId := ⟨"Process_ClaimAssessment"⟩

private def claimCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := activityDataInputOutputUserTaskProfileId
        sourceId := ⟨"activity-data-input-output-user-task-process"⟩
        sourceSha256 :=
          "32a1fbbb0fe6035d0c80eeadd951e5f1f244e0f03417330cbb46c4904a666724" }
    processId := claimProcessId
    definitionScopes := [rootDefinitionScope claimProcessId]
    nodeScopes := rootNodeScopes claimProcessId
      [⟨"EndEvent_Recorded"⟩, ⟨"StartEvent_ClaimReceived"⟩, ⟨"UserTask_AssessClaim"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes claimProcessId
      [⟨"Flow_AssessClaim_Recorded"⟩, ⟨"Flow_ClaimReceived_Assess"⟩]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_Recorded"⟩
      , .noneStartEvent ⟨"StartEvent_ClaimReceived"⟩
      , .dataInputOutputUserTask ⟨"UserTask_AssessClaim"⟩ (some "Assess claim")
          claimDirectInput claimDirectOutput ]
    sequenceFlows :=
      [ { id := ⟨"Flow_AssessClaim_Recorded"⟩
          sourceId := ⟨"UserTask_AssessClaim"⟩
          targetId := ⟨"EndEvent_Recorded"⟩ }
      , { id := ⟨"Flow_ClaimReceived_Assess"⟩
          sourceId := ⟨"StartEvent_ClaimReceived"⟩
          targetId := ⟨"UserTask_AssessClaim"⟩ } ] }

private def claimProgram : Program := lowerCheckedProcess claimCheckedProcess

private def claimInstanceId : SemanticId := ⟨"ClaimAssessmentInstance_1"⟩

private def summary : VariableBinding :=
  { name := claimDirectInput.sourcePropertyId, value := .string "claim-4711" }

private def nullSummary : VariableBinding :=
  { name := claimDirectInput.sourcePropertyId, value := .null }

private def unrelated : VariableBinding :=
  { name := "Property_Unrelated", value := .string "retain-me" }

private def startClaim (commandId : String) (bindings : List VariableBinding) : Stimulus :=
  .startProcess ⟨commandId⟩ ⟨claimProcessId.value⟩ claimInstanceId bindings

private def startWithSummary : Stimulus :=
  startClaim "start-claim" [summary, unrelated]

private def startWithNullSummary : Stimulus :=
  startClaim "start-null-claim" [nullSummary]

private def startWithoutSummary : Stimulus :=
  startClaim "start-missing-claim" []

private def runStart (stimulus : Stimulus) : StimulusResult :=
  applyStimulus scenarioClosureLimit claimProgram initialState stimulus

private def active : RuntimeState := (runStart startWithSummary).state

private def claimTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := claimInstanceId
    elementId := ⟨"UserTask_AssessClaim"⟩
    activation := 1 }

private def claimActivityOwner : ActivityOccurrenceId :=
  { processInstanceId := claimInstanceId
    activityElementId := ⟨"UserTask_AssessClaim"⟩
    activation := 1 }

private def completeClaim (commandId : String)
    (bindings : List VariableBinding) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ claimTaskInstanceId bindings

private def decision (value : VariableValue) : VariableBinding :=
  { name := claimDirectOutput.sourceDataOutputId, value }

private def approved : StimulusResult :=
  applyStimulus scenarioClosureLimit claimProgram active
    (completeClaim "complete-claim" [decision (.string "approve")])

private def refused (state : RuntimeState) : StimulusResult :=
  { outcome := .rejected
    state
    internalStepBoundExceeded := false
    ambiguousInternalChoice := false }

/-- `ADIO-READY-01`: a present String activates the task and leaves the Process source unchanged. -/
theorem presentSummaryActivatesOneTask :
    ((runStart startWithSummary).outcome,
      (runStart startWithSummary).state.waits.map (·.task.id),
      (runStart startWithSummary).state.variables.process.bindings) =
      (CommandOutcome.committed, [⟨"UserTask_AssessClaim"⟩], [summary, unrelated]) := by
  decide +kernel

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

/-- `ADIO-FILL-01`: omitting the sole required output preserves the complete active state. -/
theorem zeroOutputsRefuseWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram active
        (completeClaim "complete-without-decision" []) = refused active := by
  decide +kernel

/-- `ADIO-FILL-01`: the association target is not a declared DataOutput name. -/
theorem targetPropertyNamedOutputRefusesWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram active
        (completeClaim "complete-under-target"
          [{ name := claimDirectOutput.targetPropertyId, value := .string "approve" }]) =
      refused active := by
  decide +kernel

/-- `ADIO-FILL-01`: a second submitted output is not silently discarded. -/
theorem twoOutputsRefuseWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram active
        (completeClaim "complete-with-two-decisions"
          [decision (.string "approve"),
           { name := "DataOutput_Unadmitted", value := .string "second" }]) =
      refused active := by
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
  decide +kernel

/-- `ADIO-REFUSE-01`: one scope with the wrong local binding is not the activation-time input. -/
theorem wrongLocalContentRefusesWithExactStatePreservation :
    let malformed : ActivityVariableScope :=
      { copiedScope with bindings := [{ name := "DataInput_Wrong", value := summary.value }] }
    applyStimulus scenarioClosureLimit claimProgram (withLocalScopes [malformed])
        (completeClaim "complete-wrong-local" [decision (.string "approve")]) =
      refused (withLocalScopes [malformed]) := by
  decide +kernel

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
  decide +kernel

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
