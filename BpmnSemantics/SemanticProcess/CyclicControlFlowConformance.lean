module

public import BpmnSemantics.SemanticProcess.CyclicControlFlowConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.CyclicControlFlowLaws
public import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.CyclicControlFlowFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
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
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
/-! # Resumption-bounded cyclic control-flow conformance

This module owns proved locks for the reviewed three-input Exclusive Merge, the exact User Task resumption cut, and the representative repeat/exit process. It proves no general termination, fairness, arbitrary-cycle, concurrent-arrival, nested-scope, or host-runtime claim.

The full lowering equality crosses the private partial JSON parser used by string conditions.
The executable `user-task-cycle-repeat-rework-exit` case in
`packages/differential/test/cyclic-control-flow-pipeline-cases.ts` instead passes the independently
supplied Program through `SemanticProcessJson.DefinitionInput.validateDefinitionInput`, which
compares it with actual Lean lowering before execution. The structural lowering facts below
stay within kernel-reducible projections; the fixture Program remains an independent literal.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
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
    (lowerCheckedProcess cyclicCheckedProcess).operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Merge"⟩)) =
      some (.mergeExclusive ⟨"operation:Merge"⟩ ⟨⟨"Merge"⟩⟩
        [⟨"place:Flow_Repeat"⟩, ⟨"place:Flow_Rework"⟩,
          ⟨"place:Flow_Start"⟩]
        ⟨"place:Flow_Merge_Review"⟩) := by
  decide +kernel

theorem cyclic_user_task_cut_classification_is_preserved_by_lowering :
    ∃ operation,
      (lowerCheckedProcess cyclicCheckedProcess).operations.find? (fun candidate =>
        decide (candidate.id = ⟨"operation:Review"⟩)) = some operation ∧
        checkedNodeIsResumptionCut (.userTask ⟨"Review"⟩
          (some "Review request")) = true ∧
        semanticOperationIsResumptionCut operation = true := by
  exact ⟨cyclicReviewOperation, by decide +kernel, rfl, rfl⟩

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

theorem cyclic_choice_candidate_order_is_exact :
    ((lowerCheckedProcess cyclicCheckedProcess).operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Choice"⟩))).map (fun operation =>
        match operation with
        | .choose _ _ _ candidates _ _ => candidates.map (fun candidate =>
            (candidate.origin.elementId, candidate.output))
        | _ => []) =
      some [(⟨"Flow_Repeat"⟩, ⟨"place:Flow_Repeat"⟩),
        (⟨"Flow_Rework"⟩, ⟨"place:Flow_Rework"⟩)] := by
  decide +kernel

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
  simp [cyclicChoiceOperation, cyclic_program_has_no_snapshot_declaration, chooseState?,
    cyclicPostCompletionState, cyclicPostChooseState, cyclicWaitingState,
    cyclicVariables, singletonWaitingState, chooseToken, onlyTokenOwner?,
    tokenOwners, selectConditionalOutput, evaluateSimpleBooleanExpression,
    removeToken, addToken, canonicalInsertBy]

theorem representative_choice_selects_rework_for_every_activation
    (activation : Nat) :
    step cyclicProgram (cyclicPostCompletionState activation "rework")
      ⟨"operation:Choice"⟩ =
      some (cyclicPostChooseState activation "rework"
        ⟨"place:Flow_Rework"⟩) := by
  unfold step
  rw [cyclic_choice_lookup]
  simp [cyclicChoiceOperation, cyclic_program_has_no_snapshot_declaration, chooseState?,
    cyclicPostCompletionState, cyclicPostChooseState, cyclicWaitingState,
    cyclicVariables, singletonWaitingState, chooseToken, onlyTokenOwner?,
    tokenOwners, selectConditionalOutput, evaluateSimpleBooleanExpression,
    removeToken, addToken, canonicalInsertBy]

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
    simp only [fire_mergeExclusive_withoutSnapshotDeclaration,
      cyclic_program_has_no_snapshot_declaration, cyclicMergeOperation]
    simpa [cyclicPostChooseState, cyclicPostMergeState] using
      (mergeExclusiveState_singleton_offer
        (cyclicPostChooseState activation route ⟨"place:Flow_Repeat"⟩)
        cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩
        { placeId := ⟨"place:Flow_Repeat"⟩, owner := cyclicOwner }
        rfl (by simp [cyclicMergeInputs]))
  · unfold step
    rw [cyclic_merge_lookup]
    simp only [fire_mergeExclusive_withoutSnapshotDeclaration,
      cyclic_program_has_no_snapshot_declaration, cyclicMergeOperation]
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
  simp [cyclicChoiceOperation, cyclic_program_has_no_snapshot_declaration, chooseState?,
    cyclicPostCompletionState, cyclicPostChooseState, cyclicWaitingState,
    cyclicVariables, singletonWaitingState, chooseToken, onlyTokenOwner?,
    tokenOwners, selectConditionalOutput, evaluateSimpleBooleanExpression,
    removeToken, addToken, canonicalInsertBy]

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

theorem repeat_closes_in_exactly_three_internal_steps :
    applyStimulus 3 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "repeat") =
      cyclicCommittedResult (cyclicWaitingState 2 (some "repeat")) := by
  decide +kernel

theorem exit_closes_in_exactly_three_internal_steps :
    applyStimulus 3 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "exit") =
      cyclicCommittedResult (cyclicCompletedState 1 "exit") := by
  decide +kernel

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

end BpmnSemantics.SemanticProcess
