import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.CyclicControlFlowFixtures

/-! # Resumption-bounded cyclic control-flow conformance

This module owns proved locks for the reviewed three-input Exclusive Merge, the exact User Task resumption cut, and the representative repeat/exit process. It proves no general termination, fairness, arbitrary-cycle, concurrent-arrival, nested-scope, or host-runtime claim.
-/

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

theorem cyclic_checked_merge_has_exact_three_to_one_flow_arity :
    (cyclicCheckedProcess.sequenceFlows.filter fun flow =>
      decide (flow.targetId = ⟨"Merge"⟩)).length = 3 ∧
    (cyclicCheckedProcess.sequenceFlows.filter fun flow =>
      decide (flow.sourceId = ⟨"Merge"⟩)).length = 1 := by
  decide +kernel

theorem cyclic_program_is_well_formed :
    programWellFormed cyclicProgram = true := by
  decide +kernel

theorem cyclic_profile_alone_selects_resumption_bounded_graphs :
    profileGraphPolicy? "bpmn-2.0.2-user-task-cycle-draft" =
      some .resumptionBounded := by
  decide +kernel

theorem existing_exclusive_gateway_profile_remains_whole_graph_acyclic :
    profileGraphPolicy?
      "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft" = some .acyclic := by
  decide +kernel

theorem checked_cut_removes_exactly_user_task_continuations :
    checkedResumptionCutEdges cyclicCheckedProcess.nodes cyclicCheckedEdges =
      cyclicCheckedCutEdges := by
  decide +kernel

theorem program_cut_independently_removes_exactly_user_task_continuations :
    programResumptionCutEdges cyclicProgram cyclicProgramEdges =
      cyclicProgramCutEdges := by
  decide +kernel

theorem cyclic_full_checked_graph_contains_a_cycle :
    CycleWitnessWithin cyclicCheckedEdges 5 := by
  refine ⟨{ source := ⟨"Review"⟩, target := ⟨"Choice"⟩ }, ?_, ?_⟩
  · simp [cyclicCheckedEdges]
  · decide +kernel

theorem cyclic_checked_cut_is_saturation_certified_acyclic :
    acyclicClosed cyclicCheckedCutEdges 5 = true := by
  decide +kernel

theorem cyclic_program_cut_is_saturation_certified_acyclic :
    acyclicClosed cyclicProgramCutEdges 6 = true := by
  decide +kernel

theorem cyclic_checked_cut_excludes_every_surviving_cycle :
    ¬ CycleWitnessWithin cyclicCheckedCutEdges 5 :=
  saturation_certified_cut_excludes_uncut_cycle cyclicCheckedCutEdges 5
    cyclic_checked_cut_is_saturation_certified_acyclic

theorem cyclic_program_cut_excludes_every_surviving_cycle :
    ¬ CycleWitnessWithin cyclicProgramCutEdges 6 :=
  saturation_certified_cut_excludes_uncut_cycle cyclicProgramCutEdges 6
    cyclic_program_cut_is_saturation_certified_acyclic

theorem cyclic_merge_has_exact_canonical_checked_endpoints :
    cyclicMergeOperation =
      .mergeExclusive ⟨"operation:Merge"⟩ ⟨⟨"Merge"⟩⟩
        [⟨"place:Flow_Repeat"⟩, ⟨"place:Flow_Rework"⟩,
          ⟨"place:Flow_Start"⟩]
        ⟨"place:Flow_Merge_Review"⟩ := by
  rfl

theorem cyclic_user_task_cut_classification_is_preserved_by_lowering :
    ∃ operation,
      operation = cyclicReviewOperation ∧
        checkedNodeIsResumptionCut (.userTask ⟨"Review"⟩
          (some "Review request")) = true ∧
        semanticOperationIsResumptionCut operation = true := by
  exact ⟨cyclicReviewOperation, rfl, rfl, rfl⟩

theorem exclusive_merge_evaluator_is_sound
    (before after : RuntimeState) (inputs : List ControlPlaceId)
    (output : ControlPlaceId)
    (result : mergeExclusiveState? before inputs output = some after) :
    MergeExclusiveStep before inputs output after :=
  mergeExclusiveState_sound before after inputs output result

theorem exclusive_merge_evaluator_conserves_one_token
    (before after : RuntimeState) (inputs : List ControlPlaceId)
    (output : ControlPlaceId)
    (result : mergeExclusiveState? before inputs output = some after) :
    after.tokens.length = before.tokens.length :=
  mergeExclusiveState_preserves_token_count before after inputs output result

theorem different_input_offers_each_have_a_relational_pass_through :
    MergeExclusiveStep cyclicTwoInputState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩
      { cyclicTwoInputState with
        tokens :=
          addToken
            (removeToken cyclicTwoInputState.tokens ⟨"place:Flow_Repeat"⟩
              cyclicOwner)
            ⟨"place:Flow_Merge_Review"⟩ cyclicOwner } ∧
    MergeExclusiveStep cyclicTwoInputState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩
      { cyclicTwoInputState with
        tokens :=
          addToken
            (removeToken cyclicTwoInputState.tokens ⟨"place:Flow_Rework"⟩
              cyclicOwner)
            ⟨"place:Flow_Merge_Review"⟩ cyclicOwner } := by
  constructor
  · apply mergeExclusiveStep_of_offered_token
      cyclicTwoInputState cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩
      { placeId := ⟨"place:Flow_Repeat"⟩, owner := cyclicOwner }
    · simp [cyclicTwoInputState]
    · simp [cyclicMergeInputs]
  · apply mergeExclusiveStep_of_offered_token
      cyclicTwoInputState cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩
      { placeId := ⟨"place:Flow_Rework"⟩, owner := cyclicOwner }
    · simp [cyclicTwoInputState]
    · simp [cyclicMergeInputs]

theorem same_input_multiplicity_two_has_a_relational_pass_through :
    MergeExclusiveStep cyclicSameInputMultiplicityTwoState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩
      { cyclicSameInputMultiplicityTwoState with
        tokens :=
          addToken
            (removeToken cyclicSameInputMultiplicityTwoState.tokens
              ⟨"place:Flow_Repeat"⟩ cyclicOwner)
            ⟨"place:Flow_Merge_Review"⟩ cyclicOwner } := by
  apply mergeExclusiveStep_of_offered_token
    cyclicSameInputMultiplicityTwoState cyclicMergeInputs
    ⟨"place:Flow_Merge_Review"⟩
    { placeId := ⟨"place:Flow_Repeat"⟩, owner := cyclicOwner }
  · simp [cyclicSameInputMultiplicityTwoState]
  · simp [cyclicMergeInputs]

theorem different_owner_offer_has_its_own_relational_pass_through :
    MergeExclusiveStep cyclicDifferentOwnerState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩
      { cyclicDifferentOwnerState with
        tokens := addToken
          (removeToken cyclicDifferentOwnerState.tokens
            ⟨"place:Flow_Rework"⟩ cyclicOtherOwner)
          ⟨"place:Flow_Merge_Review"⟩ cyclicOtherOwner } := by
  apply mergeExclusiveStep_of_offered_token cyclicDifferentOwnerState
    cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩
    { placeId := ⟨"place:Flow_Rework"⟩, owner := cyclicOtherOwner }
  · simp [cyclicDifferentOwnerState]
  · simp [cyclicMergeInputs]

theorem unique_offer_evaluator_refuses_zero_offers :
    mergeExclusiveState? (cyclicWaitingState 1 none) cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩ = none := by
  decide +kernel

theorem unique_offer_evaluator_leaves_multi_offer_selection_open :
    mergeExclusiveState? cyclicTwoInputState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩ = none ∧
    mergeExclusiveState? cyclicSameInputMultiplicityTwoState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩ = none ∧
    mergeExclusiveState? cyclicDifferentOwnerState cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩ = none := by
  decide +kernel

theorem cyclic_choice_candidate_order_is_exact :
    cyclicChoiceOperation =
      .choose ⟨"operation:Choice"⟩ ⟨⟨"Choice"⟩⟩
        ⟨"place:Flow_Review_Choice"⟩
        [ { condition := .stringEquals "route" "repeat"
            output := ⟨"place:Flow_Repeat"⟩
            origin := ⟨⟨"Flow_Repeat"⟩⟩ }
        , { condition := .stringEquals "route" "rework"
            output := ⟨"place:Flow_Rework"⟩
            origin := ⟨⟨"Flow_Rework"⟩⟩ } ]
        ⟨"place:Flow_Exit"⟩ ⟨⟨"Flow_Exit"⟩⟩ := by
  rfl

private theorem cyclic_choice_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Choice"⟩)) =
      some cyclicChoiceOperation := by
  decide +kernel

private theorem cyclic_end_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:End"⟩)) =
      some cyclicEndOperation := by
  decide +kernel

private theorem cyclic_merge_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Merge"⟩)) =
      some cyclicMergeOperation := by
  decide +kernel

private theorem cyclic_review_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Review"⟩)) =
      some cyclicReviewOperation := by
  decide +kernel

private theorem cyclic_start_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Start"⟩)) =
      some cyclicStartOperation := by
  decide +kernel

private theorem cyclic_completion_lookup :
    cyclicProgram.operations.find? (fun operation => decide (operation.id =
      ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩)) =
      some cyclicCompletionOperation := by
  decide +kernel

theorem representative_choice_selects_repeat_for_every_activation
    (activation : Nat) :
    step cyclicProgram (cyclicPostCompletionState activation "repeat")
      ⟨"operation:Choice"⟩ =
      some (cyclicPostChooseState activation "repeat"
        ⟨"place:Flow_Repeat"⟩) := by
  unfold step
  rw [cyclic_choice_lookup]
  simp [cyclicChoiceOperation, fire?, chooseState?,
    cyclicPostCompletionState, cyclicPostChooseState, cyclicWaitingState,
    cyclicVariables, singletonWaitingState, chooseToken, onlyTokenOwner?,
    tokenOwners, selectConditionalOutput, evaluateSimpleBooleanExpression,
    removeToken, addToken]

theorem representative_choice_selects_rework_for_every_activation
    (activation : Nat) :
    step cyclicProgram (cyclicPostCompletionState activation "rework")
      ⟨"operation:Choice"⟩ =
      some (cyclicPostChooseState activation "rework"
        ⟨"place:Flow_Rework"⟩) := by
  unfold step
  rw [cyclic_choice_lookup]
  simp [cyclicChoiceOperation, fire?, chooseState?,
    cyclicPostCompletionState, cyclicPostChooseState, cyclicWaitingState,
    cyclicVariables, singletonWaitingState, chooseToken, onlyTokenOwner?,
    tokenOwners, selectConditionalOutput, evaluateSimpleBooleanExpression,
    removeToken, addToken]

theorem representative_merge_passes_selected_branch_for_every_activation
    (activation : Nat) (route : String) (output : ControlPlaceId)
    (selected : output = ⟨"place:Flow_Repeat"⟩ ∨
      output = ⟨"place:Flow_Rework"⟩) :
    step cyclicProgram (cyclicPostChooseState activation route output)
      ⟨"operation:Merge"⟩ =
      some (cyclicPostMergeState activation route) := by
  rcases selected with rfl | rfl
  · unfold step
    rw [cyclic_merge_lookup]
    simp only [fire?, cyclicMergeOperation]
    simpa [cyclicPostChooseState, cyclicPostMergeState] using
      (mergeExclusiveState_singleton_offer
        (cyclicPostChooseState activation route ⟨"place:Flow_Repeat"⟩)
        cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩
        { placeId := ⟨"place:Flow_Repeat"⟩, owner := cyclicOwner }
        rfl (by simp [cyclicMergeInputs]))
  · unfold step
    rw [cyclic_merge_lookup]
    simp only [fire?, cyclicMergeOperation]
    simpa [cyclicPostChooseState, cyclicPostMergeState] using
      (mergeExclusiveState_singleton_offer
        (cyclicPostChooseState activation route ⟨"place:Flow_Rework"⟩)
        cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩
        { placeId := ⟨"place:Flow_Rework"⟩, owner := cyclicOwner }
        rfl (by simp [cyclicMergeInputs]))

theorem representative_review_awaits_next_activation
    (activation : Nat) (route : String) :
    step cyclicProgram (cyclicPostMergeState activation route)
      ⟨"operation:Review"⟩ =
      some (cyclicWaitingState (activation + 1) (some route)) := by
  unfold step
  rw [cyclic_review_lookup]
  change awaitUserTaskState? (cyclicPostMergeState activation route)
      ⟨"place:Flow_Merge_Review"⟩ ⟨"place:Flow_Review_Choice"⟩
      cyclicTask = some (cyclicAwaitedState activation route)
  rfl

theorem representative_choice_selects_exit_for_every_activation
    (activation : Nat) :
    step cyclicProgram (cyclicPostCompletionState activation "exit")
      ⟨"operation:Choice"⟩ =
      some (cyclicPostChooseState activation "exit"
        ⟨"place:Flow_Exit"⟩) := by
  unfold step
  rw [cyclic_choice_lookup]
  simp [cyclicChoiceOperation, fire?, chooseState?,
    cyclicPostCompletionState, cyclicPostChooseState, cyclicWaitingState,
    cyclicVariables, singletonWaitingState, chooseToken, onlyTokenOwner?,
    tokenOwners, selectConditionalOutput, evaluateSimpleBooleanExpression,
    removeToken, addToken]

theorem representative_none_end_consumes_the_only_token
    (activation : Nat) :
    step cyclicProgram
      (cyclicPostChooseState activation "exit" ⟨"place:Flow_Exit"⟩)
      ⟨"operation:End"⟩ =
      some (cyclicPostEndState activation "exit") := by
  unfold step
  rw [cyclic_end_lookup]
  rfl

theorem representative_root_scope_completes_after_none_end
    (activation : Nat) :
    step cyclicProgram (cyclicPostEndState activation "exit")
      ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩ =
      some (cyclicCompletedState activation "exit") := by
  unfold step
  rw [cyclic_completion_lookup]
  rfl

/-- At every natural activation count, one repeat traversal returns to the same User Task with the next activation identity. -/
theorem representative_program_repeats_for_every_natural
    (activation : Nat) :
    runChoices cyclicProgram (cyclicPostCompletionState activation "repeat")
      cyclicRepeatChoices =
      some (cyclicWaitingState (activation + 1) (some "repeat")) := by
  simp [cyclicRepeatChoices, runChoices,
    representative_choice_selects_repeat_for_every_activation activation,
    representative_merge_passes_selected_branch_for_every_activation
      activation "repeat" ⟨"place:Flow_Repeat"⟩ (Or.inl rfl),
    representative_review_awaits_next_activation]

/-- At every natural activation count, selecting the default branch consumes the None End and completes the root scope. -/
theorem representative_program_exits_after_any_finite_repeat_count
    (activation : Nat) :
    runChoices cyclicProgram (cyclicPostCompletionState activation "exit")
      cyclicExitChoices = some (cyclicCompletedState activation "exit") := by
  simp [cyclicExitChoices, runChoices,
    representative_choice_selects_exit_for_every_activation,
    representative_none_end_consumes_the_only_token,
    representative_root_scope_completes_after_none_end]

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

/-- Every selected-profile reachable phase has at most one control token or live User Task wait. -/
theorem selected_profile_global_active_unit_bound
    (state : RuntimeState) (reachable : CyclicSelectedPhase state) :
    cyclicActiveUnitCount state ≤ 1 := by
  cases reachable <;>
    simp [cyclicActiveUnitCount, cyclicAdmittedStartState,
      cyclicPostStartState, cyclicInitialPostMergeState,
      cyclicWaitingState, cyclicPostCompletionState, cyclicPostChooseState,
      cyclicPostMergeState, cyclicPostEndState, cyclicCompletedState,
      singletonWaitingState, initialState, runningStartState]

/-- The selected live phases after initiation and before None End consumption have exactly one active unit. -/
theorem selected_profile_live_phases_have_exactly_one_active_unit
    (state : RuntimeState) (reachable : CyclicSelectedPhase state)
    (live : state ≠ initialState ∧ state ≠ cyclicAdmittedStartState ∧
      (∀ activation, state ≠ cyclicPostEndState activation "exit") ∧
      (∀ activation, state ≠ cyclicCompletedState activation "exit")) :
    cyclicActiveUnitCount state = 1 := by
  cases reachable with
  | initial => exact False.elim (live.1 rfl)
  | admitted => exact False.elim (live.2.1 rfl)
  | ended activation => exact False.elim (live.2.2.1 activation rfl)
  | completed activation => exact False.elim (live.2.2.2 activation rfl)
  | started | initialMerged | waiting | completedTask | chosenRepeat |
      chosenRework | chosenExit | merged =>
      simp [cyclicActiveUnitCount, cyclicPostStartState,
        cyclicAdmittedStartState, cyclicInitialPostMergeState, cyclicWaitingState,
        cyclicPostCompletionState, cyclicPostChooseState,
        cyclicPostMergeState, singletonWaitingState, initialState,
        runningStartState]

theorem every_executable_merge_fire_has_exactly_one_active_unit
    (before after : RuntimeState)
    (result : mergeExclusiveState? before cyclicMergeInputs
      ⟨"place:Flow_Merge_Review"⟩ = some after)
    (beforeHasOne : cyclicActiveUnitCount before = 1) :
    cyclicActiveUnitCount after = 1 := by
  rw [cyclicActiveUnitCount,
    mergeExclusiveState_preserves_active_unit_count before after
      cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩ result]
  exact beforeHasOne

theorem different_input_multi_offer_is_unreachable_in_selected_profile :
    ¬ CyclicSelectedPhase cyclicTwoInputState := by
  intro reachable
  have bound := selected_profile_global_active_unit_bound _ reachable
  simp [cyclicActiveUnitCount, cyclicTwoInputState] at bound

theorem same_input_multiplicity_two_is_unreachable_in_selected_profile :
    ¬ CyclicSelectedPhase cyclicSameInputMultiplicityTwoState := by
  intro reachable
  have bound := selected_profile_global_active_unit_bound _ reachable
  simp [cyclicActiveUnitCount, cyclicSameInputMultiplicityTwoState] at bound

theorem different_owner_multi_offer_is_unreachable_in_selected_profile :
    ¬ CyclicSelectedPhase cyclicDifferentOwnerState := by
  intro reachable
  have bound := selected_profile_global_active_unit_bound _ reachable
  simp [cyclicActiveUnitCount, cyclicDifferentOwnerState] at bound

theorem start_closes_in_exactly_three_internal_steps :
    applyStimulus 3 cyclicProgram initialState cyclicStartStimulus =
      cyclicCommittedResult (cyclicWaitingState 1 none) := by
  decide +kernel

theorem start_fails_closed_at_internal_limit_two :
    applyStimulus 2 cyclicProgram initialState cyclicStartStimulus =
      cyclicBoundedResult cyclicInitialPostMergeState := by
  decide +kernel

theorem repeat_closes_in_exactly_three_internal_steps :
    applyStimulus 3 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "repeat") =
      cyclicCommittedResult (cyclicWaitingState 2 (some "repeat")) := by
  decide +kernel

theorem repeat_fails_closed_at_internal_limit_two :
    applyStimulus 2 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "repeat") =
      cyclicBoundedResult (cyclicPostMergeState 1 "repeat") := by
  decide +kernel

theorem exit_closes_in_exactly_three_internal_steps :
    applyStimulus 3 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "exit") =
      cyclicCommittedResult (cyclicCompletedState 1 "exit") := by
  decide +kernel

theorem exit_fails_closed_at_internal_limit_two :
    applyStimulus 2 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "exit") =
      cyclicBoundedResult (cyclicPostEndState 1 "exit") := by
  decide +kernel

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

theorem executable_selected_profile_reachability_has_global_active_unit_bound
    (state : RuntimeState) (reachable : CyclicSelectedStableReachable state) :
    cyclicActiveUnitCount state ≤ 1 := by
  cases reachable <;>
    simp [cyclicActiveUnitCount, cyclicWaitingState, cyclicCompletedState,
      cyclicPostEndState, cyclicPostCompletionState, singletonWaitingState,
      initialState]

theorem exact_start_result_is_executable_selected_reachable :
    CyclicSelectedStableReachable (cyclicWaitingState 1 none) :=
  .start start_closes_in_exactly_three_internal_steps

theorem exact_repeat_result_is_executable_selected_reachable :
    CyclicSelectedStableReachable
      (cyclicWaitingState 2 (some "repeat")) :=
  .repeat 1 none exact_start_result_is_executable_selected_reachable
    repeat_closes_in_exactly_three_internal_steps

theorem exact_exit_result_is_executable_selected_reachable :
    CyclicSelectedStableReachable (cyclicCompletedState 1 "exit") :=
  .exit 1 none exact_start_result_is_executable_selected_reachable
    exit_closes_in_exactly_three_internal_steps

theorem earlier_activation_refusal_preserves_complete_state
    (activation submitted : Nat) (route : Option String)
    (earlier : submitted < activation) :
    applyStimulus scenarioClosureLimit cyclicProgram
      (cyclicWaitingState activation route)
      (cyclicCompletionStimulus submitted "repeat") =
      { outcome := .rejected
        state := cyclicWaitingState activation route
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  simpa [cyclicWaitingState, cyclicCompletionStimulus] using
    (task_identity_mismatch_is_rejected cyclicProgram (cyclicWait activation)
      ⟨"complete-cycle"⟩
      { processInstanceId := cyclicInstanceId
        elementId := ⟨"Review"⟩
        activation := submitted }
      [{ name := "route", value := .string "repeat" }] 0
      (cyclicVariables route)
      (by rfl)
      (by rfl)
      (Or.inr (Or.inr (Nat.ne_of_lt earlier))))

theorem wrong_process_element_and_future_activation_preserve_complete_state :
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
        cyclicRejectedResult (cyclicWaitingState 1 none) := by
  decide +kernel

theorem structural_closure_bound_is_six_and_below_production_eight :
    cyclicProgram.operations.length = 6 ∧ 6 < scenarioClosureLimit := by
  decide +kernel

theorem representative_cycle_has_no_unconditional_termination_law :
    (applyStimulus 3 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "repeat")).state.control =
      .running cyclicInstanceId := by
  decide +kernel

theorem internal_only_cycle_is_rejected_by_both_validators :
    checkedProcessGraphWellFormed cyclicInternalOnlyCheckedProcess = false ∧
      programGraphWellFormed cyclicInternalOnlyProgram = false := by
  decide +kernel

theorem old_profile_rejects_the_cycle_in_both_validators :
    checkedProcessGraphWellFormed cyclicOldProfileCheckedProcess = false ∧
      programGraphWellFormed cyclicOldProfileProgram = false := by
  decide +kernel

theorem generic_structure_accepts_distinct_nonempty_merge_fan_in :
    programWellFormed cyclicTwoInputMergeProgram = true ∧
      programWellFormed cyclicFourInputMergeProgram = true := by
  decide +kernel

theorem selected_profile_separately_rejects_non_three_merge_fan_in :
    programProfileCapabilitiesValid cyclicTwoInputMergeProgram = false ∧
      programProfileCapabilitiesValid cyclicFourInputMergeProgram = false := by
  decide +kernel

theorem selected_profile_payload_requires_exactly_three_merge_inputs :
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
            | operation => operation } = false := by
  decide +kernel

theorem selected_profile_excludes_nested_scope_and_unlisted_wait_cycles :
    checkedWellFormed cyclicNestedScopeCheckedProcess = false ∧
      programWellFormed cyclicUnlistedWaitProgram = false := by
  decide +kernel

end BpmnSemantics.SemanticProcess
