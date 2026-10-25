import BpmnSemantics.SemanticProcess.ExecutionRuntime
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # Structured Inclusive Gateway conformance

This module owns the exact Lean fixture and finite laws for one acyclic split/task/join region. It proves selected-branch synchronization for one-true, both-true, and default-only bindings; general Inclusive Gateway reachability remains outside this profile.
-/

namespace BpmnSemantics.InclusiveGatewayConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-inclusive-gateway-selected-branches-draft"⟩

def processId : ProcessId := ⟨"Process_Inclusive"⟩

def condition (body : String) : Option CheckedCondition :=
  some { language := simpleBooleanExpressionLanguage, body }

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"inclusive-gateway-test"⟩
        sourceSha256 :=
          "9a662129585d4bf89973c8f1eb2851023345a43bba31a9d51683d918ca4de9f1" }
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"End"⟩, ⟨"Join"⟩, ⟨"Split"⟩, ⟨"Start"⟩
      , ⟨"Task_A"⟩, ⟨"Task_B"⟩, ⟨"Task_Default"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_A"⟩, ⟨"Flow_A_Join"⟩, ⟨"Flow_B"⟩
      , ⟨"Flow_B_Join"⟩, ⟨"Flow_Default"⟩, ⟨"Flow_Default_Join"⟩
      , ⟨"Flow_End"⟩, ⟨"Flow_Start"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"End"⟩
      , .inclusiveGatewayConverging ⟨"Join"⟩ ⟨"Split"⟩
      , .inclusiveGatewayDiverging ⟨"Split"⟩
          [⟨"Flow_A"⟩, ⟨"Flow_B"⟩] ⟨"Flow_Default"⟩
      , .noneStartEvent ⟨"Start"⟩
      , .userTask ⟨"Task_A"⟩ (some "A")
      , .userTask ⟨"Task_B"⟩ (some "B")
      , .userTask ⟨"Task_Default"⟩ (some "Default") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_A"⟩, sourceId := ⟨"Split"⟩,
          targetId := ⟨"Task_A"⟩, condition := condition "isPresent(takeA)" }
      , { id := ⟨"Flow_A_Join"⟩, sourceId := ⟨"Task_A"⟩,
          targetId := ⟨"Join"⟩ }
      , { id := ⟨"Flow_B"⟩, sourceId := ⟨"Split"⟩,
          targetId := ⟨"Task_B"⟩, condition := condition "isPresent(takeB)" }
      , { id := ⟨"Flow_B_Join"⟩, sourceId := ⟨"Task_B"⟩,
          targetId := ⟨"Join"⟩ }
      , { id := ⟨"Flow_Default"⟩, sourceId := ⟨"Split"⟩,
          targetId := ⟨"Task_Default"⟩ }
      , { id := ⟨"Flow_Default_Join"⟩, sourceId := ⟨"Task_Default"⟩,
          targetId := ⟨"Join"⟩ }
      , { id := ⟨"Flow_End"⟩, sourceId := ⟨"Join"⟩,
          targetId := ⟨"End"⟩ }
      , { id := ⟨"Flow_Start"⟩, sourceId := ⟨"Start"⟩,
          targetId := ⟨"Split"⟩ } ] }

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := profileId
        sourceId := ⟨"inclusive-gateway-test"⟩
        sourceSha256 := "9a662129585d4bf89973c8f1eb2851023345a43bba31a9d51683d918ca4de9f1" }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes := [rootDefinitionScope ⟨"Process_Inclusive"⟩]
    operationScopes := ["End", "Join", "Split", "Start", "Task_A", "Task_B", "Task_Default",
      "complete-scope:scope:Process_Inclusive"].map fun name =>
      { operationId := ⟨"operation:" ++ name⟩, scopeId := ⟨"scope:Process_Inclusive"⟩ }
    controlPlaceScopes := ["Flow_A", "Flow_A_Join", "Flow_B", "Flow_B_Join", "Flow_Default",
      "Flow_Default_Join", "Flow_End", "Flow_Start"].map fun name =>
      { controlPlaceId := ⟨"place:" ++ name⟩, scopeId := ⟨"scope:Process_Inclusive"⟩ }
    controlPlaces := ["Flow_A", "Flow_A_Join", "Flow_B", "Flow_B_Join", "Flow_Default",
      "Flow_Default_Join", "Flow_End", "Flow_Start"].map fun name =>
      { id := ⟨"place:" ++ name⟩, origin := ⟨⟨name⟩⟩ }
    operations :=
      [ .reachNoneEnd ⟨"operation:End"⟩ ⟨⟨"End"⟩⟩ ⟨"place:Flow_End"⟩
      , .synchronizeSelected ⟨"operation:Join"⟩ ⟨⟨"Join"⟩⟩
          [⟨"place:Flow_A_Join"⟩, ⟨"place:Flow_B_Join"⟩, ⟨"place:Flow_Default_Join"⟩]
          ⟨"place:Flow_End"⟩ "Split"
      , .selectMany ⟨"operation:Split"⟩ ⟨⟨"Split"⟩⟩ ⟨"place:Flow_Start"⟩
          [{ condition := .isPresent "takeA", output := ⟨"place:Flow_A"⟩
             expectedJoinInput := ⟨"place:Flow_A_Join"⟩, origin := ⟨⟨"Flow_A"⟩⟩ },
           { condition := .isPresent "takeB", output := ⟨"place:Flow_B"⟩
             expectedJoinInput := ⟨"place:Flow_B_Join"⟩, origin := ⟨⟨"Flow_B"⟩⟩ }]
          { output := ⟨"place:Flow_Default"⟩, expectedJoinInput := ⟨"place:Flow_Default_Join"⟩
            origin := ⟨⟨"Flow_Default"⟩⟩ } "Split"
      , .initiate ⟨"operation:Start"⟩ ⟨⟨"Start"⟩⟩ ⟨"place:Flow_Start"⟩
      , .awaitUserTask ⟨"operation:Task_A"⟩ ⟨⟨"Task_A"⟩⟩
          ⟨"place:Flow_A"⟩ ⟨"place:Flow_A_Join"⟩ { id := ⟨"Task_A"⟩, name := some "A" }
      , .awaitUserTask ⟨"operation:Task_B"⟩ ⟨⟨"Task_B"⟩⟩
          ⟨"place:Flow_B"⟩ ⟨"place:Flow_B_Join"⟩ { id := ⟨"Task_B"⟩, name := some "B" }
      , .awaitUserTask ⟨"operation:Task_Default"⟩ ⟨⟨"Task_Default"⟩⟩
          ⟨"place:Flow_Default"⟩ ⟨"place:Flow_Default_Join"⟩ { id := ⟨"Task_Default"⟩, name := some "Default" }
      , .completeScope ⟨"operation:complete-scope:scope:Process_Inclusive"⟩
          ⟨⟨"Process_Inclusive"⟩⟩ ⟨"scope:Process_Inclusive"⟩ none ] }

def instanceId : SemanticId := ⟨"inclusive-instance"⟩

def present (name : String) : VariableBinding :=
  { name, value := .null }

def start (variables : List VariableBinding) : Stimulus :=
  .startProcess ⟨"start-inclusive"⟩ ⟨processId.value⟩ instanceId variables

def completeTask (elementId : String) : Stimulus :=
  .completeUserTaskInstance ⟨"complete-" ++ elementId⟩
    { processInstanceId := instanceId
      elementId := ⟨elementId⟩
      activation := 1 } []

def oneWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState (start [present "takeA"])

def bothWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState
    (start [present "takeA", present "takeB"])

def defaultWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState (start [])

def bothAfterA : StimulusResult :=
  applyStimulus scenarioClosureLimit program bothWaiting.state
    (completeTask "Task_A")

def bothAThenB : StimulusResult :=
  applyStimulus scenarioClosureLimit program bothAfterA.state
    (completeTask "Task_B")

def bothAfterB : StimulusResult :=
  applyStimulus scenarioClosureLimit program bothWaiting.state
    (completeTask "Task_B")

def bothBThenA : StimulusResult :=
  applyStimulus scenarioClosureLimit program bothAfterB.state
    (completeTask "Task_A")

def swapExpectedInputs : SemanticOperation → SemanticOperation
  | .selectMany id origin input [first, second] defaultBranch selectionKey =>
      .selectMany id origin input
        [{ first with expectedJoinInput := second.expectedJoinInput },
         { second with expectedJoinInput := first.expectedJoinInput }]
        defaultBranch selectionKey
  | operation => operation

def wronglyPairedProgram : Program :=
  { program with operations := program.operations.map swapExpectedInputs }

theorem exact_checked_definition_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  decide +kernel

theorem inclusive_lowering_is_exact :
    lowerCheckedProcess checkedProcess = program := by decide +kernel

theorem lowering_derives_branch_local_join_inputs :
    (lowerCheckedProcess checkedProcess).operations.find? (fun operation =>
        decide (operation.id.value = "operation:Split")) =
      some
        (.selectMany ⟨"operation:Split"⟩ { elementId := ⟨"Split"⟩ }
          ⟨"place:Flow_Start"⟩
          [ { condition := .isPresent "takeA"
              output := ⟨"place:Flow_A"⟩
              expectedJoinInput := ⟨"place:Flow_A_Join"⟩
              origin := { elementId := ⟨"Flow_A"⟩ } }
          , { condition := .isPresent "takeB"
              output := ⟨"place:Flow_B"⟩
              expectedJoinInput := ⟨"place:Flow_B_Join"⟩
              origin := { elementId := ⟨"Flow_B"⟩ } } ]
          { output := ⟨"place:Flow_Default"⟩
            expectedJoinInput := ⟨"place:Flow_Default_Join"⟩
            origin := { elementId := ⟨"Flow_Default"⟩ } }
          "Split") := by
  decide +kernel

def permuted_branch_pairing_fails_definition_binding : Bool := decide <|
    programWellFormed wronglyPairedProgram = true ∧
      definitionBindingValid checkedProcess wronglyPairedProgram = false

theorem one_true_selects_exactly_one_branch :
    oneWaiting.outcome = .committed ∧
      oneWaiting.internalStepBoundExceeded = false ∧
      oneWaiting.state.waits.map (·.task.id.value) = ["Task_A"] ∧
      oneWaiting.state.selectedBranchSets.map (·.expectedInputs) =
        [[⟨"place:Flow_A_Join"⟩]] := by
  decide +kernel

def both_true_selects_both_branches : Bool := decide <|
    bothWaiting.outcome = .committed ∧
      bothWaiting.internalStepBoundExceeded = false ∧
      bothWaiting.state.waits.map (·.task.id.value) = ["Task_A", "Task_B"] ∧
      bothWaiting.state.selectedBranchSets.map (·.expectedInputs) =
        [[⟨"place:Flow_A_Join"⟩, ⟨"place:Flow_B_Join"⟩]]

def all_false_selects_only_default : Bool := decide <|
    defaultWaiting.outcome = .committed ∧
      defaultWaiting.state.waits.map (·.task.id.value) = ["Task_Default"] ∧
      defaultWaiting.state.selectedBranchSets.map (·.expectedInputs) =
        [[⟨"place:Flow_Default_Join"⟩]]

def longest_start_closure_is_four_steps : Bool := decide <|
    (applyStimulus 3 program initialState
        (start [present "takeA", present "takeB"])).internalStepBoundExceeded =
        true ∧
      (applyStimulus 4 program initialState
        (start [present "takeA", present "takeB"])).internalStepBoundExceeded =
        false

def bothSplitState : RuntimeState :=
  (runChoices program
    (admitStimulus program initialState (start [present "takeA", present "takeB"])).state
    [⟨"operation:Start"⟩, ⟨"operation:Split"⟩]).getD initialState

def activatedAThenB : RuntimeState :=
  (runChoices program bothSplitState
    [⟨"operation:Task_A"⟩, ⟨"operation:Task_B"⟩]).getD initialState

def activatedBThenA : RuntimeState :=
  (runChoices program bothSplitState
    [⟨"operation:Task_B"⟩, ⟨"operation:Task_A"⟩]).getD initialState

def both_task_activation_orders_have_equal_runtime_and_observation : Bool := decide <|
    (runChoices program bothSplitState
        [⟨"operation:Task_A"⟩, ⟨"operation:Task_B"⟩]).isSome = true ∧
      (runChoices program bothSplitState
        [⟨"operation:Task_B"⟩, ⟨"operation:Task_A"⟩]).isSome = true ∧
      activatedAThenB.waits.map (·.task.id.value) = ["Task_A", "Task_B"] ∧
      activatedAThenB = activatedBThenA ∧
      observeStableState program activatedAThenB =
        observeStableState program activatedBThenA

theorem first_arrival_does_not_complete_selected_join :
    bothAfterA.outcome = .committed ∧
      bothAfterA.state.control = .running instanceId ∧
      bothAfterA.state.waits.map (·.task.id.value) = ["Task_B"] ∧
      bothAfterA.state.selectedBranchSets.length = 1 := by
  decide +kernel

theorem both_completion_orders_reach_the_same_terminal_state :
    bothAThenB.state = bothBThenA.state ∧
      bothAThenB.state.control = .completed instanceId ∧
      bothAThenB.state.selectedBranchSets = [] := by
  decide +kernel

def terminal_closure_uses_three_internal_steps : Bool := decide <|
    (applyStimulus 2 program bothAfterA.state
        (completeTask "Task_B")).internalStepBoundExceeded = true ∧
      (applyStimulus 3 program bothAfterA.state
        (completeTask "Task_B")).internalStepBoundExceeded = false

def synchronize_without_selection_record_is_disabled : Bool := decide <|
    let stranded := { bothAfterA.state with selectedBranchSets := [] }
    synchronizeSelectedState? stranded ⟨"place:Flow_End"⟩ "Split" = none

theorem live_selection_blocks_scope_quiescence :
    let owner := rootScopeOccurrenceId instanceId processId
    let otherwiseQuiescent :=
      { (runningProgramStartState? program instanceId []).getD initialState with
        initiationPending := false
        selectedBranchSets :=
          [{ owner, selectionKey := "Split",
             expectedInputs := [⟨"place:Flow_A_Join"⟩] }] }
    scopeQuiescent otherwiseQuiescent owner = false := by
  decide +kernel

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("permuted_branch_pairing_fails_definition_binding", permuted_branch_pairing_fails_definition_binding),
  ("both_true_selects_both_branches", both_true_selects_both_branches),
  ("all_false_selects_only_default", all_false_selects_only_default),
  ("longest_start_closure_is_four_steps", longest_start_closure_is_four_steps),
  ("both_task_activation_orders_have_equal_runtime_and_observation", both_task_activation_orders_have_equal_runtime_and_observation),
  ("terminal_closure_uses_three_internal_steps", terminal_closure_uses_three_internal_steps),
  ("synchronize_without_selection_record_is_disabled", synchronize_without_selection_record_is_disabled)
]

end BpmnSemantics.InclusiveGatewayConformance
