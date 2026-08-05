import BpmnSemantics.SemanticProcess

/-! # Structured Inclusive Gateway conformance

This module owns the exact Lean fixture and finite laws for one acyclic split/task/join region. It proves selected-branch synchronization for one-true, both-true, and default-only bindings; general Inclusive Gateway reachability remains outside this profile.
-/

namespace BpmnSemantics.InclusiveGatewayConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-inclusive-gateway-selected-branches-draft"⟩

def processId : ProcessId := ⟨"Process_Inclusive"⟩

private def condition (body : String) : Option CheckedCondition :=
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

def program : Program := lowerCheckedProcess checkedProcess

def instanceId : SemanticId := ⟨"inclusive-instance"⟩

private def present (name : String) : VariableBinding :=
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

private def swapExpectedInputs : SemanticOperation → SemanticOperation
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

theorem lowering_derives_branch_local_join_inputs :
    program.operations.find? (fun operation =>
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

theorem permuted_branch_pairing_fails_definition_binding :
    programWellFormed wronglyPairedProgram = true ∧
      definitionBindingValid checkedProcess wronglyPairedProgram = false := by
  decide +kernel

theorem one_true_selects_exactly_one_branch :
    oneWaiting.outcome = .committed ∧
      oneWaiting.internalStepBoundExceeded = false ∧
      oneWaiting.state.waits.map (·.task.id.value) = ["Task_A"] ∧
      oneWaiting.state.selectedBranchSets.map (·.expectedInputs) =
        [[⟨"place:Flow_A_Join"⟩]] := by
  decide +kernel

theorem both_true_selects_both_branches :
    bothWaiting.outcome = .committed ∧
      bothWaiting.internalStepBoundExceeded = false ∧
      bothWaiting.state.waits.map (·.task.id.value) = ["Task_A", "Task_B"] ∧
      bothWaiting.state.selectedBranchSets.map (·.expectedInputs) =
        [[⟨"place:Flow_A_Join"⟩, ⟨"place:Flow_B_Join"⟩]] := by
  decide +kernel

theorem all_false_selects_only_default :
    defaultWaiting.outcome = .committed ∧
      defaultWaiting.state.waits.map (·.task.id.value) = ["Task_Default"] ∧
      defaultWaiting.state.selectedBranchSets.map (·.expectedInputs) =
        [[⟨"place:Flow_Default_Join"⟩]] := by
  decide +kernel

theorem longest_start_closure_is_four_steps :
    (applyStimulus 3 program initialState
        (start [present "takeA", present "takeB"])).internalStepBoundExceeded =
        true ∧
      (applyStimulus 4 program initialState
        (start [present "takeA", present "takeB"])).internalStepBoundExceeded =
        false := by
  decide +kernel

private def bothSplitState : RuntimeState :=
  (applyStimulus 2 program initialState
    (start [present "takeA", present "takeB"])).state

private def activatedAThenB : RuntimeState :=
  (runChoices program bothSplitState
    [⟨"operation:Task_A"⟩, ⟨"operation:Task_B"⟩]).getD initialState

private def activatedBThenA : RuntimeState :=
  (runChoices program bothSplitState
    [⟨"operation:Task_B"⟩, ⟨"operation:Task_A"⟩]).getD initialState

theorem both_task_activation_orders_have_equal_runtime_and_observation :
    activatedAThenB = activatedBThenA ∧
      observeStableState program activatedAThenB =
        observeStableState program activatedBThenA := by
  decide +kernel

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

theorem terminal_closure_uses_three_internal_steps :
    (applyStimulus 2 program bothAfterA.state
        (completeTask "Task_B")).internalStepBoundExceeded = true ∧
      (applyStimulus 3 program bothAfterA.state
        (completeTask "Task_B")).internalStepBoundExceeded = false := by
  decide +kernel

theorem synchronize_without_selection_record_is_disabled :
    let stranded := { bothAfterA.state with selectedBranchSets := [] }
    synchronizeSelectedState? stranded ⟨"place:Flow_End"⟩ "Split" = none := by
  decide +kernel

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

end BpmnSemantics.InclusiveGatewayConformance
