import BpmnSemantics.TerminateEndEventFixtures

/-! # Terminate End Event conformance

This module owns the direct Lean witnesses for containing-scope termination. The nested witness keeps
parent work live while removing the selected child region, and the root witness reuses the same
operation shape without a parent continuation.
-/

namespace BpmnSemantics.TerminateEndEventConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.TerminateEndEventFixtures

private def instanceId : SemanticId := ⟨"TerminateInstance"⟩

private def rootOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:Process_Terminate"⟩
    activation := 1 }

private def childOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:SubProcess_Terminate"⟩
    activation := 1 }

private def descendantOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:Descendant"⟩
    activation := 1 }

private def calledInstanceId : SemanticId := ⟨"CalledTerminateInstance"⟩

private def calledRootOwner : ScopeOccurrenceId :=
  { processInstanceId := calledInstanceId
    definitionScopeId := ⟨"scope:CalledRoot"⟩
    activation := 1 }

private def siblingWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := childOwner
    task := { id := ⟨"Sibling"⟩, name := some "Sibling" }
    activation := 1
    output := ⟨"place:SiblingToEnd"⟩ }

/-- Parent work is present so global cancellation is observably wrong for nested termination. -/
def nestedCounterexampleState : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences :=
      [ { id := calledRootOwner, parent := none }
      , { id := descendantOwner, parent := some childOwner }
      , { id := childOwner, parent := some rootOwner }
      , { id := rootOwner, parent := none } ]
    tokens :=
      [ { placeId := ⟨"place:CalledWork"⟩, owner := calledRootOwner }
      , { placeId := ⟨"place:DescendantWork"⟩, owner := descendantOwner }
      , { placeId := ⟨"place:RootWork"⟩, owner := rootOwner }
      , { placeId := ⟨"place:Flow_TriggerTerminate"⟩, owner := childOwner } ]
    waits :=
      [ siblingWait
      , { processInstanceId := instanceId
          owner := rootOwner
          task := { id := ⟨"Outer"⟩, name := some "Outer" }
          activation := 1
          output := ⟨"place:OuterToEnd"⟩ } ]
    messageWaits :=
      [{ processInstanceId := instanceId
         owner := childOwner
         elementId := ⟨"ChildMessage"⟩
         activation := 1
         channel := .directMessage ⟨"Message"⟩
         output := ⟨"place:MessageOutput"⟩ }]
    timerWaits :=
      [{ processInstanceId := instanceId
         owner := descendantOwner
         elementId := ⟨"ChildTimer"⟩
         activation := 1
         deadlineMs := 1000
         output := ⟨"place:TimerOutput"⟩ }]
    effectWaits :=
      [{ processInstanceId := instanceId
         owner := childOwner
         elementId := ⟨"ChildEffect"⟩
         activation := 1
         descriptor := { protocol := "synthetic", operation := "synthetic" }
         arguments := []
         outputMappings := []
         output := ⟨"place:EffectOutput"⟩
         bpmnErrorRoute := none }]
    selectedBranchSets :=
      [{ owner := childOwner
         selectionKey := "selection"
         expectedInputs := [⟨"place:Selected"⟩] }]
    eventRaces :=
      [{ id :=
          { processInstanceId := instanceId
            elementId := ⟨"Race"⟩
            activation := 1 }
         owner := childOwner
         messageSubscriptionId :=
          { processInstanceId := instanceId
            elementId := ⟨"RaceMessage"⟩
            activation := 1 }
         timerOccurrenceId :=
          { processInstanceId := instanceId
            elementId := ⟨"RaceTimer"⟩
            activation := 1 } }]
    calledProcessOccurrences :=
      [{ id :=
          { processInstanceId := instanceId
            elementId := ⟨"SyntheticCall"⟩
            activation := 1 }
         caller := childOwner
         calledProcessId := ⟨"CalledProcess"⟩
         calledRoot := calledRootOwner
         returnOperationId := ⟨"operation:return:synthetic"⟩ }]
    variables :=
      { process :=
          { bindings := [{ name := "preserved", value := .string "yes" }] }
        activities :=
          [{ owner :=
              { processInstanceId := instanceId
                elementId := ⟨"ChildEffect"⟩
                activation := 1 }
             bindings := [{ name := "local", value := .string "gone" }] }] }
    activations := [{ taskId := ⟨"HistoryTask"⟩, count := 7 }]
    messageActivations := [{ elementId := ⟨"HistoryMessage"⟩, count := 6 }]
    timerActivations := [{ elementId := ⟨"HistoryTimer"⟩, count := 5 }]
    effectActivations := [{ elementId := ⟨"HistoryEffect"⟩, count := 4 }]
    scopeActivations := [{ scopeId := ⟨"HistoryScope"⟩, count := 3 }]
    eventRaceActivations := [{ elementId := ⟨"HistoryRace"⟩, count := 2 }]
    callActivations := [{ elementId := ⟨"HistoryCall"⟩, count := 1 }]
    endOccurrences := 4
    logicalTimeMs := 27 }

/-- Consuming only the triggering token leaves this sibling live, so token removal is not termination. -/
theorem incomplete_regional_cancellation_leaves_sibling_live :
    siblingWait ∈
      (reachNoneEndToken nestedCounterexampleState childOwner
        ⟨"place:Flow_TriggerTerminate"⟩).waits := by
  decide +kernel

/-- The selected no-output operation must target the exact child scope occurrence. -/
def nestedTerminateOperation : SemanticOperation :=
  .terminateScope
    ⟨"operation:End_Terminate"⟩
    { elementId := ⟨"End_Terminate"⟩ }
    ⟨"place:TriggerToTerminate"⟩
    childOwner.definitionScopeId

/-- The same generic operation shape must admit a root occurrence without reinterpretation. -/
def rootTerminateOperation : SemanticOperation :=
  .terminateScope
    ⟨"operation:Root_Terminate"⟩
    { elementId := ⟨"Root_Terminate"⟩ }
    ⟨"place:RootToTerminate"⟩
    rootOwner.definitionScopeId

/-- The exact representative checked graph passes structural and checkpoint-profile admission. -/
theorem checked_process_is_admitted :
    checkedWellFormed checkedProcess = true := by
  decide +kernel

/-- Canonical lowering is definitionally the checkpoint program. -/
theorem lowering_is_exact :
    lowerCheckedProcess checkedProcess = program := by
  rfl

/-- The lowered program has the exact no-output termination shape and passes structural admission. -/
theorem program_is_admitted :
    programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧
      program.operations.any (fun operation =>
        operation =
          .terminateScope ⟨"operation:I_Terminate"⟩
            { elementId := ⟨"I_Terminate"⟩ }
            ⟨"place:Flow_TriggerTerminate"⟩ childScopeId) = true := by
  decide +kernel

/-- The representative End has exactly one incoming Sequence Flow and no outgoing Sequence Flow. -/
theorem checked_terminate_end_exact_arity :
    (checkedProcess.sequenceFlows.filter fun flow =>
      flow.targetId = ⟨"I_Terminate"⟩).length = 1 ∧
    (checkedProcess.sequenceFlows.filter fun flow =>
      flow.sourceId = ⟨"I_Terminate"⟩).length = 0 := by
  decide +kernel

/-- Lowering retains one operation with the exact End identity, origin, input, and containing scope. -/
theorem lowered_terminate_operation_is_exact :
    (program.operations.filter fun operation =>
      operation.id = ⟨"operation:I_Terminate"⟩) =
      [.terminateScope ⟨"operation:I_Terminate"⟩
        { elementId := ⟨"I_Terminate"⟩ }
        ⟨"place:Flow_TriggerTerminate"⟩ childScopeId] := by
  decide +kernel

private def crossScopeTerminateProgram : Program :=
  { program with
    operations := program.operations.map fun operation =>
      if operation =
          .terminateScope ⟨"operation:I_Terminate"⟩
            { elementId := ⟨"I_Terminate"⟩ }
            ⟨"place:Flow_TriggerTerminate"⟩ childScopeId then
        .terminateScope ⟨"operation:I_Terminate"⟩
          { elementId := ⟨"I_Terminate"⟩ }
          ⟨"place:Flow_TriggerTerminate"⟩ rootScopeId
      else operation }

/-- A Terminate operation cannot reinterpret its input and operation ownership as a different scope. -/
theorem cross_scope_terminate_is_structurally_rejected :
    programWellFormed crossScopeTerminateProgram = false := by
  decide +kernel

/-- The generic root program is structurally valid while remaining outside exact nested profile capability. -/
theorem root_program_is_generic_not_profile_registered :
    programWellFormed rootSyntheticProgram = true ∧
      programProfileCapabilitiesValid rootSyntheticProgram = false := by
  decide +kernel

private def exactTerminateId : OperationId := ⟨"operation:I_Terminate"⟩
private def exactTerminateOrigin : BpmnElementOrigin :=
  { elementId := ⟨"I_Terminate"⟩ }
private def exactTerminateInput : ControlPlaceId :=
  ⟨"place:Flow_TriggerTerminate"⟩

def nestedTerminatedState : RuntimeState :=
  let cancelled := cancelScopeSubtree nestedCounterexampleState childOwner .retain
  { cancelled with
    endOccurrences := nestedCounterexampleState.endOccurrences + 1 }

/-- The evaluator selects the child occurrence from the exact offered token and applies the declarative relation. -/
theorem nested_termination_evaluator_and_relation :
    terminateScopeState? program nestedCounterexampleState exactTerminateId
        exactTerminateOrigin exactTerminateInput childScopeId =
      some nestedTerminatedState ∧
    TerminateScopeStep program exactTerminateId exactTerminateOrigin
      exactTerminateInput childScopeId nestedCounterexampleState
      nestedTerminatedState := by
  constructor
  · decide +kernel
  · exact terminateScopeState_sound program nestedCounterexampleState
      nestedTerminatedState exactTerminateId exactTerminateOrigin
      exactTerminateInput childScopeId (by decide +kernel)

/-- Selected-subtree termination removes every represented owner family and called descendant, retains the selected occurrence, and preserves parent work. -/
theorem selected_subtree_inventory_is_exact :
    nestedTerminatedState.scopeOccurrences =
      [ { id := childOwner, parent := some rootOwner }
      , { id := rootOwner, parent := none } ] ∧
    nestedTerminatedState.tokens =
      [{ placeId := ⟨"place:RootWork"⟩, owner := rootOwner }] ∧
    nestedTerminatedState.waits =
      [{ processInstanceId := instanceId
         owner := rootOwner
         task := { id := ⟨"Outer"⟩, name := some "Outer" }
         activation := 1
         output := ⟨"place:OuterToEnd"⟩ }] ∧
    nestedTerminatedState.messageWaits = [] ∧
    nestedTerminatedState.timerWaits = [] ∧
    nestedTerminatedState.effectWaits = [] ∧
    nestedTerminatedState.selectedBranchSets = [] ∧
    nestedTerminatedState.eventRaces = [] ∧
    nestedTerminatedState.calledProcessOccurrences = [] ∧
    nestedTerminatedState.variables.activities = [] ∧
    nestedTerminatedState.variables.process =
      nestedCounterexampleState.variables.process ∧
    nestedTerminatedState.endOccurrences = 5 ∧
    scopeQuiescent nestedTerminatedState childOwner = true := by
  decide +kernel

/-- Termination preserves every unrelated monotonic counter, Process variable, and logical clock. -/
theorem nested_termination_preserves_unrelated_state :
    nestedTerminatedState.activations = nestedCounterexampleState.activations ∧
    nestedTerminatedState.messageActivations =
      nestedCounterexampleState.messageActivations ∧
    nestedTerminatedState.timerActivations =
      nestedCounterexampleState.timerActivations ∧
    nestedTerminatedState.effectActivations =
      nestedCounterexampleState.effectActivations ∧
    nestedTerminatedState.scopeActivations =
      nestedCounterexampleState.scopeActivations ∧
    nestedTerminatedState.eventRaceActivations =
      nestedCounterexampleState.eventRaceActivations ∧
    nestedTerminatedState.callActivations =
      nestedCounterexampleState.callActivations ∧
    nestedTerminatedState.logicalTimeMs = nestedCounterexampleState.logicalTimeMs := by
  decide +kernel

/-- A global-cancellation mutation removes the higher-level Outer owner that correct child termination preserves. -/
theorem global_cancellation_is_wrong_for_nested_terminate :
    let globallyCancelled :=
      cancelScopeSubtree nestedCounterexampleState rootOwner .retain
    nestedTerminatedState.waits.length = 1 ∧ globallyCancelled.waits = [] := by
  decide +kernel

private def zeroTokenState : RuntimeState :=
  { nestedCounterexampleState with
    tokens := nestedCounterexampleState.tokens.filter fun token =>
      token.placeId ≠ exactTerminateInput }

private def multipleTokenState : RuntimeState :=
  { nestedCounterexampleState with
    tokens :=
      { placeId := exactTerminateInput, owner := childOwner } ::
        nestedCounterexampleState.tokens }

private def wrongOwnerState : RuntimeState :=
  { nestedCounterexampleState with
    tokens :=
      [{ placeId := exactTerminateInput, owner := rootOwner }] }

private def staleOwnerState : RuntimeState :=
  { nestedCounterexampleState with
    scopeOccurrences := nestedCounterexampleState.scopeOccurrences.filter fun occurrence =>
      occurrence.id ≠ childOwner }

/-- Zero, multiple, wrong-scope, stale-occurrence, and non-running offers refuse without a successor. -/
theorem exact_termination_refusals :
    terminateScopeState? program zeroTokenState exactTerminateId
      exactTerminateOrigin exactTerminateInput childScopeId = none ∧
    terminateScopeState? program multipleTokenState exactTerminateId
      exactTerminateOrigin exactTerminateInput childScopeId = none ∧
    terminateScopeState? program wrongOwnerState exactTerminateId
      exactTerminateOrigin exactTerminateInput childScopeId = none ∧
    terminateScopeState? program staleOwnerState exactTerminateId
      exactTerminateOrigin exactTerminateInput childScopeId = none ∧
    terminateScopeState? program
      { nestedCounterexampleState with control := .notStarted }
      exactTerminateId exactTerminateOrigin exactTerminateInput childScopeId = none := by
  decide +kernel

def startedState : RuntimeState :=
  (applyStimulus 5 program initialState startStimulus).state

def triggerFirstState : RuntimeState :=
  (applyStimulus 3 program startedState completeTrigger).state

def siblingFirstState : RuntimeState :=
  (applyStimulus 1 program startedState completeSibling).state

def siblingThenTriggerState : RuntimeState :=
  (applyStimulus 3 program siblingFirstState completeTrigger).state

/-- Start closure takes five steps, exposes exactly Trigger and Sibling, and one-smaller fuel reports exhaustion. -/
theorem start_closure_bounds_and_order_invariance :
    let exact := applyStimulus 5 program initialState startStimulus
    let short := applyStimulus 4 program initialState startStimulus
    exact.outcome = .committed ∧
      exact.internalStepBoundExceeded = false ∧
      exact.ambiguousInternalChoice = false ∧
      waitMultiplicity exact.state ⟨"G_Sibling"⟩ = 1 ∧
      waitMultiplicity exact.state ⟨"J_Trigger"⟩ = 1 ∧
      enabledInternalOperationCount program exact.state = 0 ∧
      stableStateResumable exact.state = true ∧
      short.internalStepBoundExceeded = true ∧
      (runningProgramStartState? program semanticInstanceId []).bind (fun state =>
        runChoices program state
          [ ⟨"operation:F_RootStart"⟩
          , ⟨"operation:H_SubProcess"⟩
          , ⟨"operation:B_ChildFork"⟩
          , ⟨"operation:G_Sibling"⟩
          , ⟨"operation:J_Trigger"⟩ ]) = some exact.state ∧
      (runningProgramStartState? program semanticInstanceId []).bind (fun state =>
        runChoices program state
          [ ⟨"operation:F_RootStart"⟩
          , ⟨"operation:H_SubProcess"⟩
          , ⟨"operation:B_ChildFork"⟩
          , ⟨"operation:J_Trigger"⟩
          , ⟨"operation:G_Sibling"⟩ ]) = some exact.state := by
  decide +kernel

/-- Trigger-first closure is uniquely `terminateScope`, child `completeScope`, then Outer activation; one-smaller fuel fails. -/
theorem trigger_closure_bounds_and_unique_enabledness :
    let transient :=
      (completeUserTask startedState semanticInstanceId ⟨"J_Trigger"⟩ 1).getD initialState
    let terminated :=
      (step program transient ⟨"operation:I_Terminate"⟩).getD initialState
    let completedChild :=
      (step program terminated
        ⟨"operation:complete-scope:scope:SubProcess_Terminate"⟩).getD initialState
    let exact := applyStimulus 3 program startedState completeTrigger
    let short := applyStimulus 2 program startedState completeTrigger
    enabledInternalOperationCount program transient = 1 ∧
      enabledInternalOperationCount program terminated = 1 ∧
      terminated.tokens = [] ∧
      scopeQuiescent terminated
        { processInstanceId := semanticInstanceId
          definitionScopeId := childScopeId
          activation := 1 } = true ∧
      completedChild.tokens =
        [{ placeId := ⟨"place:Flow_SubProcessOuter"⟩
           owner :=
            { processInstanceId := semanticInstanceId
              definitionScopeId := rootScopeId
              activation := 1 } }] ∧
      enabledInternalOperationCount program completedChild = 1 ∧
      exact.outcome = .committed ∧
      exact.internalStepBoundExceeded = false ∧
      waitMultiplicity exact.state ⟨"E_OuterTask"⟩ = 1 ∧
      waitMultiplicity exact.state ⟨"G_Sibling"⟩ = 0 ∧
      waitMultiplicity exact.state ⟨"J_Trigger"⟩ = 0 ∧
      enabledInternalOperationCount program exact.state = 0 ∧
      stableStateResumable exact.state = true ∧
      short.internalStepBoundExceeded = true := by
  decide +kernel

/-- Sibling-first reaches a stable Trigger wait, and later termination still reaches the Outer-only state. -/
theorem sibling_first_is_stable_then_terminates :
    waitMultiplicity siblingFirstState ⟨"G_Sibling"⟩ = 0 ∧
    waitMultiplicity siblingFirstState ⟨"J_Trigger"⟩ = 1 ∧
    enabledInternalOperationCount program siblingFirstState = 0 ∧
    stableStateResumable siblingFirstState = true ∧
    waitMultiplicity siblingThenTriggerState ⟨"E_OuterTask"⟩ = 1 ∧
    waitMultiplicity siblingThenTriggerState ⟨"J_Trigger"⟩ = 0 ∧
    enabledInternalOperationCount program siblingThenTriggerState = 0 ∧
    stableStateResumable siblingThenTriggerState = true := by
  decide +kernel

/-- The stable public projection contains only the Outer User Task and no termination-specific wait. -/
theorem termination_has_no_public_wait_classification :
    (observeStableState program triggerFirstState).map (fun snapshot =>
      (snapshot.status, snapshot.activeWaits,
        snapshot.openUserTasks.map fun task => task.id)) =
      some
        ( .running
        , [{ elementId := ⟨"E_OuterTask"⟩, kind := .userTask, multiplicity := 1 }]
        , [outerOccurrence] ) := by
  decide +kernel

/-- A cancelled Sibling occurrence rejects with exact state identity. -/
theorem stale_sibling_rejects_with_exact_state :
    applyStimulus 3 program triggerFirstState completeSibling =
      { outcome := .rejected
        state := triggerFirstState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Outer completion takes exactly two internal steps, and one-smaller fuel reports exhaustion. -/
theorem outer_completion_bounds :
    let exact := applyStimulus 2 program triggerFirstState completeOuter
    let short := applyStimulus 1 program triggerFirstState completeOuter
    exact.outcome = .committed ∧
      exact.state.control = .completed semanticInstanceId ∧
      exact.internalStepBoundExceeded = false ∧
      stableStateResumable exact.state = true ∧
      short.internalStepBoundExceeded = true := by
  decide +kernel

/-- The generic root operation records one End occurrence, emits no token, and only existing root completion ends the Process. -/
theorem root_termination_reuses_scope_completion :
    let terminated :=
      (step rootSyntheticProgram rootSyntheticOfferedState
        ⟨"operation:RootTerminate"⟩).getD initialState
    let completed :=
      step rootSyntheticProgram terminated
        ⟨"operation:complete-scope:scope:RootSynthetic"⟩
    terminated.tokens = [] ∧
      terminated.scopeOccurrences =
        [{ id := rootSyntheticOwner, parent := none }] ∧
      terminated.endOccurrences = 1 ∧
      scopeQuiescent terminated rootSyntheticOwner = true ∧
      completed = some
        { terminated with
          control := .completed semanticInstanceId
          scopeOccurrences := [] } := by
  decide +kernel

/-- Old product profiles do not enable the checkpoint-only operation family. -/
theorem old_profile_fails_closed :
    terminateScopeState?
      { program with
        identity :=
          { program.identity with
            semanticProfile := ⟨"parallel-fork-join-draft"⟩ } }
      nestedCounterexampleState exactTerminateId exactTerminateOrigin
      exactTerminateInput childScopeId = none := by
  decide +kernel

end BpmnSemantics.TerminateEndEventConformance
