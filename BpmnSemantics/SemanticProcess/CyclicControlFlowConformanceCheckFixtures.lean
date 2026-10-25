module

public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.CyclicControlFlowFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all Init.Data.String.Basic
import all Init.Data.String.Bootstrap
import all Init.Data.String.Decode
import all Init.Data.String.Defs
import all Init.Data.String.Extra
import all Init.Data.String.FindPos
import all Init.Data.String.Hashable
import all Init.Data.String.Iter
import all Init.Data.String.Iter.Basic
import all Init.Data.String.Iter.Intercalate
import all Init.Data.String.Iterate
import all Init.Data.String.Iterator
import all Init.Data.String.Legacy
import all Init.Data.String.Length
import all Init.Data.String.Modify
import all Init.Data.String.OrderInstances
import all Init.Data.String.Pattern
import all Init.Data.String.Pattern.Basic
import all Init.Data.String.Pattern.Char
import all Init.Data.String.Pattern.Pred
import all Init.Data.String.Pattern.String
import all Init.Data.String.PosRaw
import all Init.Data.String.Search
import all Init.Data.String.Slice
import all Init.Data.String.Stream
import all Init.Data.String.Subslice
import all Init.Data.String.Substring
import all Init.Data.String.TakeDrop
import all Init.Data.String.Termination
import all Init.Data.String.ToSlice

/-! Fixture definitions and executable checks of [`CyclicControlFlowConformance`](CyclicControlFlowConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess


open BpmnSemantics

def cyclicCheckedEdges : List (GraphEdge NodeId) :=
  [ { source := ⟨"Choice"⟩, target := ⟨"End"⟩ }
  , { source := ⟨"Merge"⟩, target := ⟨"Review"⟩ }
  , { source := ⟨"Choice"⟩, target := ⟨"Merge"⟩ }
  , { source := ⟨"Review"⟩, target := ⟨"Choice"⟩ }
  , { source := ⟨"Choice"⟩, target := ⟨"Merge"⟩ }
  , { source := ⟨"Start"⟩, target := ⟨"Merge"⟩ } ]

def cyclicCheckedCutEdges : List (GraphEdge NodeId) :=
  cyclicCheckedEdges.filter fun edge => edge.source != ⟨"Review"⟩

def cyclicProgramEdges : List (GraphEdge OperationId) :=
  [ { source := ⟨"operation:Choice"⟩, target := ⟨"operation:End"⟩ }
  , { source := ⟨"operation:Merge"⟩, target := ⟨"operation:Review"⟩ }
  , { source := ⟨"operation:Choice"⟩, target := ⟨"operation:Merge"⟩ }
  , { source := ⟨"operation:Review"⟩, target := ⟨"operation:Choice"⟩ }
  , { source := ⟨"operation:Choice"⟩, target := ⟨"operation:Merge"⟩ }
  , { source := ⟨"operation:Start"⟩, target := ⟨"operation:Merge"⟩ }
  , { source := ⟨"operation:End"⟩,
      target := ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩ } ]

def cyclicProgramCutEdges : List (GraphEdge OperationId) :=
  cyclicProgramEdges.filter fun edge => edge.source != ⟨"operation:Review"⟩

def cyclic_checked_merge_has_exact_three_to_one_flow_arity : Bool := decide <|
    (cyclicCheckedProcess.sequenceFlows.filter fun flow =>
      decide (flow.targetId = ⟨"Merge"⟩)).length = 3 ∧
    (cyclicCheckedProcess.sequenceFlows.filter fun flow =>
      decide (flow.sourceId = ⟨"Merge"⟩)).length = 1

def cyclic_program_is_well_formed : Bool := decide <|
    programWellFormed cyclicProgram = true

def cyclic_profile_alone_selects_resumption_bounded_graphs : Bool := decide <|
    profileGraphPolicy? "bpmn-2.0.2-user-task-cycle-draft" =
      some .resumptionBounded

def existing_exclusive_gateway_profile_remains_whole_graph_acyclic : Bool := decide <|
    profileGraphPolicy?
      "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft" = some .acyclic

def checked_cut_removes_exactly_user_task_continuations : Bool := decide <|
    checkedResumptionCutEdges cyclicCheckedProcess.nodes cyclicCheckedEdges =
      cyclicCheckedCutEdges

def program_cut_independently_removes_exactly_user_task_continuations : Bool := decide <|
    programResumptionCutEdges cyclicProgram cyclicProgramEdges =
      cyclicProgramCutEdges

def unique_offer_evaluator_refuses_zero_offers : Bool := decide <|
    mergeExclusiveState? (cyclicWaitingState 1 none) cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩ = none

def unique_offer_evaluator_leaves_multi_offer_selection_open : Bool := decide <|
    mergeExclusiveState? cyclicTwoInputState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩ = none ∧
    mergeExclusiveState? cyclicSameInputMultiplicityTwoState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩ = none ∧
    mergeExclusiveState? cyclicDifferentOwnerState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩ = none

def cyclicActiveUnitCount (state : RuntimeState) : Nat :=
  state.tokens.length + state.waits.length

/-- Exact phase overapproximation used between public command boundaries. Every listed phase is generated by the operation equalities above, while stable reachability below remains tied to executable command results. -/
inductive CyclicSelectedPhase : RuntimeState → Prop where
  | initial : CyclicSelectedPhase initialState
  | admitted : CyclicSelectedPhase cyclicAdmittedStartState
  | started : CyclicSelectedPhase cyclicPostStartState
  | initialMerged : CyclicSelectedPhase cyclicInitialPostMergeState
  | waiting (activation : Nat) (route : Option String) :
      CyclicSelectedPhase (cyclicWaitingState activation route)
  | completedTask (activation : Nat) (route : String) :
      CyclicSelectedPhase (cyclicPostCompletionState activation route)
  | chosenRepeat (activation : Nat) (route : String) :
      CyclicSelectedPhase
        (cyclicPostChooseState activation route ⟨"place:Flow_Repeat"⟩)
  | chosenRework (activation : Nat) (route : String) :
      CyclicSelectedPhase
        (cyclicPostChooseState activation route ⟨"place:Flow_Rework"⟩)
  | chosenExit (activation : Nat) :
      CyclicSelectedPhase
        (cyclicPostChooseState activation "exit" ⟨"place:Flow_Exit"⟩)
  | merged (activation : Nat) (route : String) :
      CyclicSelectedPhase (cyclicPostMergeState activation route)
  | ended (activation : Nat) :
      CyclicSelectedPhase (cyclicPostEndState activation "exit")
  | completed (activation : Nat) :
      CyclicSelectedPhase (cyclicCompletedState activation "exit")

def start_fails_closed_at_internal_limit_two : Bool := decide <|
    applyStimulus 2 cyclicProgram initialState cyclicStartStimulus =
      cyclicBoundedResult initialState

def repeat_fails_closed_at_internal_limit_two : Bool := decide <|
    applyStimulus 2 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "repeat") =
      cyclicBoundedResult (cyclicWaitingState 1 none)

def exit_fails_closed_at_internal_limit_two : Bool := decide <|
    applyStimulus 2 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "exit") =
      cyclicBoundedResult (cyclicWaitingState 1 none)

/-- Stable reachability is generated only by exact executable command results, rather than by the phase inventory used for intermediate invariants. -/
inductive CyclicSelectedStableReachable : RuntimeState → Prop where
  | initial : CyclicSelectedStableReachable initialState
  | start
      (execution : applyStimulus 3 cyclicProgram initialState
        cyclicStartStimulus = cyclicCommittedResult (cyclicWaitingState 1 none)) :
      CyclicSelectedStableReachable (cyclicWaitingState 1 none)
  | repeat (activation : Nat) (route : Option String)
      (before : CyclicSelectedStableReachable
        (cyclicWaitingState activation route))
      (execution : applyStimulus 3 cyclicProgram
        (cyclicWaitingState activation route)
        (cyclicCompletionStimulus activation "repeat") =
          cyclicCommittedResult
            (cyclicWaitingState (activation + 1) (some "repeat"))) :
      CyclicSelectedStableReachable
        (cyclicWaitingState (activation + 1) (some "repeat"))
  | exit (activation : Nat) (route : Option String)
      (before : CyclicSelectedStableReachable
        (cyclicWaitingState activation route))
      (execution : applyStimulus 3 cyclicProgram
        (cyclicWaitingState activation route)
        (cyclicCompletionStimulus activation "exit") =
          cyclicCommittedResult (cyclicCompletedState activation "exit")) :
      CyclicSelectedStableReachable (cyclicCompletedState activation "exit")

def wrong_process_element_and_future_activation_preserve_complete_state : Bool := decide <|
    applyStimulus scenarioClosureLimit cyclicProgram
      (cyclicWaitingState 1 none)
      (cyclicCompletionFor
        { processInstanceId := ⟨"Instance_Other"⟩
          elementId := ⟨"Review"⟩, activation := 1 }) =
        cyclicRejectedResult (cyclicWaitingState 1 none) ∧
    applyStimulus scenarioClosureLimit cyclicProgram
      (cyclicWaitingState 1 none)
      (cyclicCompletionFor
        { processInstanceId := cyclicInstanceId
          elementId := ⟨"Other"⟩, activation := 1 }) =
        cyclicRejectedResult (cyclicWaitingState 1 none) ∧
    applyStimulus scenarioClosureLimit cyclicProgram
      (cyclicWaitingState 1 none)
      (cyclicCompletionFor
        { processInstanceId := cyclicInstanceId
          elementId := ⟨"Review"⟩, activation := 2 }) =
        cyclicRejectedResult (cyclicWaitingState 1 none)

def structural_closure_bound_is_six_and_below_production_eight : Bool := decide <|
    cyclicProgram.operations.length = 6 ∧ 6 < scenarioClosureLimit

def representative_cycle_has_no_unconditional_termination_law : Bool := decide <|
    (applyStimulus 3 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "repeat")).state.control =
      .running cyclicInstanceId

def internal_only_cycle_is_rejected_by_both_validators : Bool := decide <|
    checkedProcessGraphWellFormed cyclicInternalOnlyCheckedProcess = false ∧
      programGraphWellFormed cyclicInternalOnlyProgram = false

def old_profile_rejects_the_cycle_in_both_validators : Bool := decide <|
    checkedProcessGraphWellFormed cyclicOldProfileCheckedProcess = false ∧
      programGraphWellFormed cyclicOldProfileProgram = false

def generic_structure_accepts_distinct_nonempty_merge_fan_in : Bool := decide <|
    programWellFormed cyclicTwoInputMergeProgram = true ∧
      programWellFormed cyclicFourInputMergeProgram = true

def selected_profile_separately_rejects_non_three_merge_fan_in : Bool := decide <|
    programProfileCapabilitiesValid cyclicTwoInputMergeProgram = false ∧
      programProfileCapabilitiesValid cyclicFourInputMergeProgram = false

def selected_profile_payload_requires_exactly_three_merge_inputs : Bool := decide <|
    programProfileCapabilitiesValid cyclicProgram = true ∧
      programProfileCapabilitiesValid
        { cyclicProgram with
          operations := cyclicProgram.operations.map fun
            | .mergeExclusive id origin _ output =>
                .mergeExclusive id origin
                  [⟨"place:Flow_Repeat"⟩, ⟨"place:Flow_Start"⟩] output
            | operation => operation } = false ∧
      programProfileCapabilitiesValid
        { cyclicProgram with
          operations := cyclicProgram.operations.map fun
            | .mergeExclusive id origin _ output =>
                .mergeExclusive id origin
                  [⟨"place:Flow_Repeat"⟩, ⟨"place:Flow_Rework"⟩,
                    ⟨"place:Flow_Start"⟩, ⟨"place:Fourth"⟩] output
            | operation => operation } = false

def selected_profile_excludes_nested_scope_and_unlisted_wait_cycles : Bool := decide <|
    checkedWellFormed cyclicNestedScopeCheckedProcess = false ∧
      programWellFormed cyclicUnlistedWaitProgram = false

/-- Every executable check of this module, named for the driver's failure report. -/
def cyclicControlFlowConformanceChecks : List (String × Bool) := [
  ("cyclic_checked_merge_has_exact_three_to_one_flow_arity", cyclic_checked_merge_has_exact_three_to_one_flow_arity),
  ("cyclic_program_is_well_formed", cyclic_program_is_well_formed),
  ("cyclic_profile_alone_selects_resumption_bounded_graphs", cyclic_profile_alone_selects_resumption_bounded_graphs),
  ("existing_exclusive_gateway_profile_remains_whole_graph_acyclic", existing_exclusive_gateway_profile_remains_whole_graph_acyclic),
  ("checked_cut_removes_exactly_user_task_continuations", checked_cut_removes_exactly_user_task_continuations),
  ("program_cut_independently_removes_exactly_user_task_continuations", program_cut_independently_removes_exactly_user_task_continuations),
  ("unique_offer_evaluator_refuses_zero_offers", unique_offer_evaluator_refuses_zero_offers),
  ("unique_offer_evaluator_leaves_multi_offer_selection_open", unique_offer_evaluator_leaves_multi_offer_selection_open),
  ("start_fails_closed_at_internal_limit_two", start_fails_closed_at_internal_limit_two),
  ("repeat_fails_closed_at_internal_limit_two", repeat_fails_closed_at_internal_limit_two),
  ("exit_fails_closed_at_internal_limit_two", exit_fails_closed_at_internal_limit_two),
  ("wrong_process_element_and_future_activation_preserve_complete_state", wrong_process_element_and_future_activation_preserve_complete_state),
  ("structural_closure_bound_is_six_and_below_production_eight", structural_closure_bound_is_six_and_below_production_eight),
  ("representative_cycle_has_no_unconditional_termination_law", representative_cycle_has_no_unconditional_termination_law),
  ("internal_only_cycle_is_rejected_by_both_validators", internal_only_cycle_is_rejected_by_both_validators),
  ("old_profile_rejects_the_cycle_in_both_validators", old_profile_rejects_the_cycle_in_both_validators),
  ("generic_structure_accepts_distinct_nonempty_merge_fan_in", generic_structure_accepts_distinct_nonempty_merge_fan_in),
  ("selected_profile_separately_rejects_non_three_merge_fan_in", selected_profile_separately_rejects_non_three_merge_fan_in),
  ("selected_profile_payload_requires_exactly_three_merge_inputs", selected_profile_payload_requires_exactly_three_merge_inputs),
  ("selected_profile_excludes_nested_scope_and_unlisted_wait_cycles", selected_profile_excludes_nested_scope_and_unlisted_wait_cycles)
]

end BpmnSemantics.SemanticProcess
