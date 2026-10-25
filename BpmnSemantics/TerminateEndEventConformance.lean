module

public import BpmnSemantics.SemanticProcess.ExecutionRuntime
public import BpmnSemantics.TerminateEndEventFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # Terminate End Event conformance

This module owns the direct Lean witnesses for containing-scope termination. The nested witness keeps
parent work live while removing the selected child region, and the root witness reuses the same
operation shape without a parent continuation.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.TerminateEndEventConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.TerminateEndEventFixtures

def instanceId : SemanticId := ⟨"TerminateInstance"⟩

def rootOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:Process_Terminate"⟩
    activation := 1 }

def childOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:SubProcess_Terminate"⟩
    activation := 1 }

def descendantOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:Descendant"⟩
    activation := 1 }

def calledInstanceId : SemanticId := ⟨"CalledTerminateInstance"⟩

def calledRootOwner : ScopeOccurrenceId :=
  { processInstanceId := calledInstanceId
    definitionScopeId := ⟨"scope:CalledRoot"⟩
    activation := 1 }

def siblingWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := childOwner
    task := { id := ⟨"Sibling"⟩, name := some "Sibling" }
    activation := 1
    output := ⟨"place:SiblingToEnd"⟩ }

def cancelledActivity : ActivityOccurrence :=
  { processInstanceId := instanceId
    activityElementId := ⟨"ChildSequentialMultiInstance"⟩
    activation := 1
    owner := childOwner
    body := .userTask
      { processInstanceId := instanceId
        elementId := ⟨"Sibling"⟩
        activation := 1 }
    attachedHandlers := [] }

def unrelatedActivity : ActivityOccurrence :=
  { processInstanceId := instanceId
    activityElementId := ⟨"RootSequentialMultiInstance"⟩
    activation := 1
    owner := rootOwner
    body := .userTask
      { processInstanceId := instanceId
        elementId := ⟨"Outer"⟩
        activation := 1 }
    attachedHandlers := [] }

def cancelledController : SequentialMultiInstanceController :=
  { processInstanceId := instanceId
    activityElementId := cancelledActivity.activityElementId
    activation := cancelledActivity.activation
    snapshot := ["cancelled"]
    outputSlots := [] }

def unrelatedController : SequentialMultiInstanceController :=
  { processInstanceId := instanceId
    activityElementId := unrelatedActivity.activityElementId
    activation := unrelatedActivity.activation
    snapshot := ["unrelated"]
    outputSlots := [] }

def calledController : SequentialMultiInstanceController :=
  { processInstanceId := calledInstanceId
    activityElementId := ⟨"CalledSequentialMultiInstance"⟩
    activation := 1
    snapshot := ["called"]
    outputSlots := [] }

def cancelledParallelController : ParallelMultiInstanceController :=
  { id :=
      { processInstanceId := instanceId
        activityElementId := ⟨cancelledActivity.activityElementId.value⟩
        activation := cancelledActivity.activation }
    snapshot := ["cancelled"]
    slots := [] }

def unrelatedParallelController : ParallelMultiInstanceController :=
  { id :=
      { processInstanceId := instanceId
        activityElementId := ⟨unrelatedActivity.activityElementId.value⟩
        activation := unrelatedActivity.activation }
    snapshot := ["unrelated"]
    slots := [] }

def calledParallelController : ParallelMultiInstanceController :=
  { id :=
      { processInstanceId := calledInstanceId
        activityElementId := ⟨"CalledParallelMultiInstance"⟩
        activation := 1 }
    snapshot := ["called"]
    slots := [] }

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
          [{ owner := .effectOccurrence
              { processInstanceId := instanceId
                elementId := ⟨"ChildEffect"⟩
                activation := 1 }
             bindings := [{ name := "local", value := .string "gone" }] }]
        processInterfaces := [], scopes := [] }
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
def incomplete_regional_cancellation_leaves_sibling_live : Bool := decide <|
    siblingWait ∈
      (reachNoneEndToken nestedCounterexampleState childOwner
        ⟨"place:Flow_TriggerTerminate"⟩).waits

def controllerCancellationState : RuntimeState :=
  { nestedCounterexampleState with
    activityOccurrences := [cancelledActivity, unrelatedActivity]
    sequentialMultiInstanceControllers :=
      [cancelledController, calledController, unrelatedController]
    parallelMultiInstanceControllers :=
      [cancelledParallelController, calledParallelController, unrelatedParallelController]
    activityActivations := [{ taskId := ⟨"HistoryActivity"⟩, count := 8 }] }

/-- Regional cancellation withdraws each controller bound to the withdrawn Activity identity and each
called-instance controller even though it has no Activity record, retains the unrelated controllers,
and frames every monotonic counter, Process data, and logical time. -/
def regional_cancellation_withdraws_exact_controller : Bool := decide <|
    let cancelled := cancelScopeSubtree controllerCancellationState childOwner .retain
    cancelled.activityOccurrences = [unrelatedActivity] ∧
      cancelled.sequentialMultiInstanceControllers = [unrelatedController] ∧
      cancelled.parallelMultiInstanceControllers = [unrelatedParallelController] ∧
      siblingWait ∉ cancelled.waits ∧
      cancelled.activations = controllerCancellationState.activations ∧
      cancelled.messageActivations = controllerCancellationState.messageActivations ∧
      cancelled.timerActivations = controllerCancellationState.timerActivations ∧
      cancelled.effectActivations = controllerCancellationState.effectActivations ∧
      cancelled.scopeActivations = controllerCancellationState.scopeActivations ∧
      cancelled.eventRaceActivations = controllerCancellationState.eventRaceActivations ∧
      cancelled.callActivations = controllerCancellationState.callActivations ∧
      cancelled.activityActivations = controllerCancellationState.activityActivations ∧
      cancelled.variables.process = controllerCancellationState.variables.process ∧
      cancelled.logicalTimeMs = controllerCancellationState.logicalTimeMs

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
def checked_process_is_admitted : Bool := decide <|
    checkedWellFormed checkedProcess = true

/-- Canonical lowering is definitionally the checkpoint program. -/
theorem lowering_is_exact :
    lowerCheckedProcess checkedProcess = program := by
  rfl

/-- The lowered program has the exact no-output termination shape and passes structural admission. -/
def program_is_admitted : Bool := decide <|
    programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧
      program.operations.any (fun operation =>
        operation =
          .terminateScope ⟨"operation:I_Terminate"⟩
            { elementId := ⟨"I_Terminate"⟩ }
            ⟨"place:Flow_TriggerTerminate"⟩ childScopeId) = true

/-- The representative End has exactly one incoming Sequence Flow and no outgoing Sequence Flow. -/
def checked_terminate_end_exact_arity : Bool := decide <|
    (checkedProcess.sequenceFlows.filter fun flow =>
      flow.targetId = ⟨"I_Terminate"⟩).length = 1 ∧
    (checkedProcess.sequenceFlows.filter fun flow =>
      flow.sourceId = ⟨"I_Terminate"⟩).length = 0

/-- Lowering retains one operation with the exact End identity, origin, input, and containing scope. -/
theorem lowered_terminate_operation_is_exact :
    ((lowerCheckedProcess checkedProcess).operations.filter fun operation =>
      operation.id = ⟨"operation:I_Terminate"⟩) =
      [.terminateScope ⟨"operation:I_Terminate"⟩
        { elementId := ⟨"I_Terminate"⟩ }
        ⟨"place:Flow_TriggerTerminate"⟩ childScopeId] := by
  decide +kernel

def crossScopeTerminateProgram : Program :=
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
def cross_scope_terminate_is_structurally_rejected : Bool := decide <|
    programWellFormed crossScopeTerminateProgram = false

/-- The generic root program is structurally valid while remaining outside exact nested profile capability. -/
def root_program_is_generic_not_profile_registered : Bool := decide <|
    programWellFormed rootSyntheticProgram = true ∧
      programProfileCapabilitiesValid rootSyntheticProgram = false

def exactTerminateId : OperationId := ⟨"operation:I_Terminate"⟩
def exactTerminateOrigin : BpmnElementOrigin :=
  { elementId := ⟨"I_Terminate"⟩ }
def exactTerminateInput : ControlPlaceId :=
  ⟨"place:Flow_TriggerTerminate"⟩

def nestedTerminatedState : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := childOwner, parent := some rootOwner }, { id := rootOwner, parent := none }]
    tokens := [{ placeId := ⟨"place:RootWork"⟩, owner := rootOwner }]
    waits := [{ processInstanceId := instanceId, owner := rootOwner, task := { id := ⟨"Outer"⟩, name := some "Outer" }, activation := 1, output := ⟨"place:OuterToEnd"⟩ }]
    variables := { emptyScopedVariables with
      process := { bindings := [{ name := "preserved", value := .string "yes" }] } }
    activations := [{ taskId := ⟨"HistoryTask"⟩, count := 7 }]
    messageActivations := [{ elementId := ⟨"HistoryMessage"⟩, count := 6 }]
    timerActivations := [{ elementId := ⟨"HistoryTimer"⟩, count := 5 }]
    effectActivations := [{ elementId := ⟨"HistoryEffect"⟩, count := 4 }]
    scopeActivations := [{ scopeId := ⟨"HistoryScope"⟩, count := 3 }]
    eventRaceActivations := [{ elementId := ⟨"HistoryRace"⟩, count := 2 }]
    callActivations := [{ elementId := ⟨"HistoryCall"⟩, count := 1 }]
    endOccurrences := 5
    logicalTimeMs := 27 }

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

/-- Selected-subtree termination removes the populated work and called-descendant inventory listed below, retains the selected occurrence, and preserves parent work. -/
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
def global_cancellation_is_wrong_for_nested_terminate : Bool := decide <|
    let globallyCancelled :=
      cancelScopeSubtree nestedCounterexampleState rootOwner .retain
    nestedTerminatedState.waits.length = 1 ∧ globallyCancelled.waits = []

def zeroTokenState : RuntimeState :=
  { nestedCounterexampleState with
    tokens := nestedCounterexampleState.tokens.filter fun token =>
      token.placeId ≠ exactTerminateInput }

def multipleTokenState : RuntimeState :=
  { nestedCounterexampleState with
    tokens :=
      { placeId := exactTerminateInput, owner := childOwner } ::
        nestedCounterexampleState.tokens }

def wrongOwnerState : RuntimeState :=
  { nestedCounterexampleState with
    tokens :=
      [{ placeId := exactTerminateInput, owner := rootOwner }] }

def staleOwnerState : RuntimeState :=
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
def start_closure_bounds_and_order_invariance : Bool := decide <|
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
          , ⟨"operation:G_Sibling"⟩ ]) = some exact.state

/-- Trigger-first closure is uniquely `terminateScope`, child `completeScope`, then Outer activation; one-smaller fuel fails. -/
def trigger_closure_bounds_and_unique_enabledness : Bool := decide <|
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
      short.internalStepBoundExceeded = true

/-- Sibling-first reaches a stable Trigger wait, and later termination still reaches the Outer-only state. -/
def sibling_first_is_stable_then_terminates : Bool := decide <|
    waitMultiplicity siblingFirstState ⟨"G_Sibling"⟩ = 0 ∧
    waitMultiplicity siblingFirstState ⟨"J_Trigger"⟩ = 1 ∧
    enabledInternalOperationCount program siblingFirstState = 0 ∧
    stableStateResumable siblingFirstState = true ∧
    waitMultiplicity siblingThenTriggerState ⟨"E_OuterTask"⟩ = 1 ∧
    waitMultiplicity siblingThenTriggerState ⟨"J_Trigger"⟩ = 0 ∧
    enabledInternalOperationCount program siblingThenTriggerState = 0 ∧
    stableStateResumable siblingThenTriggerState = true

/-- The stable public projection contains only the Outer User Task and no termination-specific wait. -/
def termination_has_no_public_wait_classification : Bool := decide <|
    (observeStableState program triggerFirstState).map (fun snapshot =>
      (snapshot.status, snapshot.activeWaits,
        snapshot.openUserTasks.map fun task => task.id)) =
      some
        ( .running
        , [{ elementId := ⟨"E_OuterTask"⟩, kind := .userTask, multiplicity := 1 }]
        , [outerOccurrence] )

/-- A cancelled Sibling occurrence rejects with exact state identity. -/
def stale_sibling_rejects_with_exact_state : Bool := decide <|
    applyStimulus 3 program triggerFirstState completeSibling =
      { outcome := .rejected
        state := triggerFirstState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

/-- Outer completion takes exactly two internal steps, and one-smaller fuel reports exhaustion. -/
def outer_completion_bounds : Bool := decide <|
    let exact := applyStimulus 2 program triggerFirstState completeOuter
    let short := applyStimulus 1 program triggerFirstState completeOuter
    exact.outcome = .committed ∧
      exact.state.control = .completed semanticInstanceId ∧
      exact.internalStepBoundExceeded = false ∧
      stableStateResumable exact.state = true ∧
      short.internalStepBoundExceeded = true

/-- The generic root operation records one End occurrence, emits no token, and only existing root completion ends the Process. -/
def root_termination_reuses_scope_completion : Bool := decide <|
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
          scopeOccurrences := [] }

/-- Old product profiles do not enable the checkpoint-only operation family. -/
def old_profile_fails_closed : Bool := decide <|
    terminateScopeState?
      { program with
        identity :=
          { program.identity with
            semanticProfile := ⟨"parallel-fork-join-draft"⟩ } }
      nestedCounterexampleState exactTerminateId exactTerminateOrigin
      exactTerminateInput childScopeId = none

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("incomplete_regional_cancellation_leaves_sibling_live", incomplete_regional_cancellation_leaves_sibling_live),
  ("regional_cancellation_withdraws_exact_controller", regional_cancellation_withdraws_exact_controller),
  ("checked_process_is_admitted", checked_process_is_admitted),
  ("program_is_admitted", program_is_admitted),
  ("checked_terminate_end_exact_arity", checked_terminate_end_exact_arity),
  ("cross_scope_terminate_is_structurally_rejected", cross_scope_terminate_is_structurally_rejected),
  ("root_program_is_generic_not_profile_registered", root_program_is_generic_not_profile_registered),
  ("global_cancellation_is_wrong_for_nested_terminate", global_cancellation_is_wrong_for_nested_terminate),
  ("start_closure_bounds_and_order_invariance", start_closure_bounds_and_order_invariance),
  ("trigger_closure_bounds_and_unique_enabledness", trigger_closure_bounds_and_unique_enabledness),
  ("sibling_first_is_stable_then_terminates", sibling_first_is_stable_then_terminates),
  ("termination_has_no_public_wait_classification", termination_has_no_public_wait_classification),
  ("stale_sibling_rejects_with_exact_state", stale_sibling_rejects_with_exact_state),
  ("outer_completion_bounds", outer_completion_bounds),
  ("root_termination_reuses_scope_completion", root_termination_reuses_scope_completion),
  ("old_profile_fails_closed", old_profile_fails_closed)
]

end BpmnSemantics.TerminateEndEventConformance
