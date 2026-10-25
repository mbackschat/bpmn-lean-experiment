module

public import BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance
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
import all Lean.Data.Json.Elab
import all Lean.Data.Json.FromToJson
import all Lean.Data.Json.FromToJson.Basic
import all Lean.Data.Json.FromToJson.Extra
import all Lean.Data.Json.Parser
import all Lean.Data.Json.Printer
import all Lean.Data.Json.Stream
/-! # Actual cyclic reachability and closure conformance

This module owns reflexive-transitive selected-program reachability and arbitrary automatic internal-closure traces. Representative schedule facts remain in `CyclicControlFlowExecutionConformance`.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
private theorem cyclic_actual_choice_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Choice"⟩)) =
      some cyclicChoiceOperation := by
  decide +kernel

private theorem cyclic_actual_end_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:End"⟩)) =
      some cyclicEndOperation := by
  decide +kernel

private theorem cyclic_actual_review_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Review"⟩)) =
      some cyclicReviewOperation := by
  decide +kernel

private theorem cyclic_actual_completion_lookup :
    cyclicProgram.operations.find? (fun operation => decide (operation.id =
      ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩)) =
      some cyclicCompletionOperation := by
  decide +kernel

theorem arbitrary_route_choice_is_exact
    (activation : Nat) (route : CyclicRouteValue) :
    step cyclicProgram (cyclicPostCompletionWithBindings activation route)
      ⟨"operation:Choice"⟩ =
      some (cyclicPostChooseWithBindings activation route route.output) := by
  unfold step
  rw [cyclic_actual_choice_lookup]
  cases route with
  | absent =>
      simp [cyclicChoiceOperation, cyclic_program_has_no_snapshot_declaration, chooseState?,
        cyclicPostCompletionWithBindings, cyclicPostChooseWithBindings,
        cyclicWaitingWithBindings, cyclicScopedVariables,
        CyclicRouteValue.output, CyclicRouteValue.bindings,
        singletonWaitingState, chooseToken, onlyTokenOwner?, tokenOwners,
        selectConditionalOutput, evaluateSimpleBooleanExpression,
        removeToken, addToken, canonicalInsertBy, initialState]
  | nullValue =>
      simp [cyclicChoiceOperation, cyclic_program_has_no_snapshot_declaration, chooseState?,
        cyclicPostCompletionWithBindings, cyclicPostChooseWithBindings,
        cyclicWaitingWithBindings, cyclicScopedVariables,
        CyclicRouteValue.output, CyclicRouteValue.bindings,
        singletonWaitingState, chooseToken, onlyTokenOwner?, tokenOwners,
        selectConditionalOutput, evaluateSimpleBooleanExpression,
        removeToken, addToken, canonicalInsertBy, initialState]
  | stringValue value =>
      by_cases isRepeat : value = "repeat"
      · subst value
        simp [cyclicChoiceOperation, cyclic_program_has_no_snapshot_declaration, chooseState?,
          cyclicPostCompletionWithBindings, cyclicPostChooseWithBindings,
          cyclicWaitingWithBindings, cyclicScopedVariables,
          CyclicRouteValue.output, CyclicRouteValue.bindings,
          singletonWaitingState, chooseToken, onlyTokenOwner?, tokenOwners,
          selectConditionalOutput, evaluateSimpleBooleanExpression,
          removeToken, addToken, canonicalInsertBy, initialState]
      · by_cases rework : value = "rework"
        · subst value
          simp [cyclicChoiceOperation, cyclic_program_has_no_snapshot_declaration, chooseState?,
            cyclicPostCompletionWithBindings, cyclicPostChooseWithBindings,
            cyclicWaitingWithBindings, cyclicScopedVariables,
            CyclicRouteValue.output, CyclicRouteValue.bindings,
            singletonWaitingState, chooseToken, onlyTokenOwner?, tokenOwners,
            selectConditionalOutput, evaluateSimpleBooleanExpression,
            removeToken, addToken, canonicalInsertBy, initialState]
        · simp [cyclicChoiceOperation, cyclic_program_has_no_snapshot_declaration, chooseState?,
            cyclicPostCompletionWithBindings, cyclicPostChooseWithBindings,
            cyclicWaitingWithBindings, cyclicScopedVariables,
            CyclicRouteValue.output, CyclicRouteValue.bindings,
            singletonWaitingState, chooseToken, onlyTokenOwner?, tokenOwners,
            selectConditionalOutput, evaluateSimpleBooleanExpression,
            removeToken, addToken, canonicalInsertBy, initialState, isRepeat, rework]

theorem arbitrary_route_review_is_exact
    (activation : Nat) (route : CyclicRouteValue) :
    step cyclicProgram (cyclicPostMergeWithBindings activation route)
      ⟨"operation:Review"⟩ =
      some (cyclicWaitingWithBindings (activation + 1) route) := by
  unfold step
  rw [cyclic_actual_review_lookup]
  rfl

theorem initial_absent_route_review_is_exact :
    step cyclicProgram cyclicInitialPostMergeState ⟨"operation:Review"⟩ =
      some (cyclicWaitingWithBindings 1 .absent) := by
  unfold step
  rw [cyclic_actual_review_lookup]
  rfl

theorem arbitrary_default_end_is_exact
    (activation : Nat) (route : CyclicRouteValue)
    (defaultSelected : route.output = ⟨"place:Flow_Exit"⟩) :
    step cyclicProgram
      (cyclicPostChooseWithBindings activation route route.output)
      ⟨"operation:End"⟩ = some (cyclicPostEndWithBindings activation route) := by
  unfold step
  rw [cyclic_actual_end_lookup]
  rw [defaultSelected]
  rfl

theorem arbitrary_default_completion_is_exact
    (activation : Nat) (route : CyclicRouteValue) :
    step cyclicProgram (cyclicPostEndWithBindings activation route)
      ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩ =
      some (cyclicCompletedWithBindings activation route) := by
  unfold step
  rw [cyclic_actual_completion_lookup]
  rfl

private theorem exact_review_completion_before_patch
    (activation : Nat) (route : CyclicRouteValue) :
    completeUserTask (cyclicWaitingWithBindings activation route)
      cyclicInstanceId ⟨"Review"⟩ activation =
        some (cyclicPostCompletionWithBindings activation route) := by
  simp [taskIdNamesWait, completeUserTask, cyclicWaitingWithBindings,
    cyclicPostCompletionWithBindings, cyclicWait, cyclicScopedVariables,
    singletonWaitingState, initialState, addToken, canonicalInsertBy]

private theorem exact_review_patch
    (activation : Nat) (route : CyclicRouteValue)
    (patch : CyclicReviewPatch) :
    cyclicPatchReviewState (cyclicPostCompletionWithBindings activation route)
      patch = cyclicPostCompletionWithBindings activation (patch.apply route) := by
  cases patch <;> cases route <;>
    simp [cyclicPatchReviewState, cyclicPostCompletionWithBindings,
      cyclicWaitingWithBindings, cyclicScopedVariables,
      CyclicReviewPatch.apply, CyclicReviewPatch.bindings,
      CyclicRouteValue.bindings, mergeProcessVariableBindings,
      singletonWaitingState, cyclicWait, initialState]
  all_goals rfl

private theorem selected_action_preserves_shape
    (before after : RuntimeState) (shape : CyclicReachableShape before)
    (action : CyclicSelectedAction before after) :
    CyclicReachableShape after := by
  cases action with
  | admitStart => exact .admitted
  | internal _ _ _ execution =>
      cases execution with
      | start => exact .started
      | initialMerge => exact .initialMerged
      | initialReview => exact .waiting 1 .absent
      | choose activation route => exact .chosen activation route
      | mergeRepeat activation => exact .merged activation (.stringValue "repeat")
      | mergeRework activation => exact .merged activation (.stringValue "rework")
      | review activation route => exact .waiting (activation + 1) route
      | endDefault activation route => exact .ended activation route
      | complete activation route => exact .completed activation route
  | completeReview before raw after activation patch running completion patched =>
      cases shape with
      | initial => simp [completeUserTask, initialState] at completion
      | admitted => simp [completeUserTask, cyclicAdmittedStartState,
          runningStartState, initialState] at completion
      | started => simp [completeUserTask, cyclicPostStartState,
          cyclicAdmittedStartState, runningStartState, initialState] at completion
      | initialMerged => simp [completeUserTask, cyclicInitialPostMergeState,
          cyclicPostStartState, cyclicAdmittedStartState, runningStartState,
          initialState] at completion
      | waiting currentActivation route =>
          by_cases activationExact : activation = currentActivation
          · subst activation
            have rawExact : raw = cyclicPostCompletionWithBindings
                currentActivation route := by
              symm
              simpa [taskIdNamesWait, completeUserTask, cyclicWaitingWithBindings,
                cyclicPostCompletionWithBindings, cyclicWait,
                cyclicScopedVariables, singletonWaitingState, initialState,
                addToken, canonicalInsertBy] using completion
            subst raw
            have afterExact : after = cyclicPostCompletionWithBindings
                currentActivation (patch.apply route) := by
              rw [← patched]
              cases patch <;> cases route <;>
                simp [cyclicPatchReviewState, cyclicPostCompletionWithBindings,
                  cyclicWaitingWithBindings, cyclicScopedVariables,
                  CyclicReviewPatch.apply, CyclicReviewPatch.bindings,
                  CyclicRouteValue.bindings, mergeProcessVariableBindings,
                  singletonWaitingState, cyclicWait, initialState]
              all_goals rfl
            exact afterExact.symm ▸
              CyclicReachableShape.completedTask currentActivation
                (patch.apply route)
          · simp [taskIdNamesWait, completeUserTask, cyclicWaitingWithBindings, cyclicWait,
              cyclicScopedVariables, singletonWaitingState, initialState,
              activationExact] at completion
      | completedTask activation route =>
          simp [completeUserTask, cyclicPostCompletionWithBindings,
            cyclicWaitingWithBindings, singletonWaitingState, initialState] at completion
      | chosen activation route =>
          simp [completeUserTask, cyclicPostChooseWithBindings,
            cyclicPostCompletionWithBindings, cyclicWaitingWithBindings,
            singletonWaitingState, initialState] at completion
      | merged activation route =>
          simp [completeUserTask, cyclicPostMergeWithBindings,
            cyclicPostCompletionWithBindings, cyclicWaitingWithBindings,
            singletonWaitingState, initialState] at completion
      | ended activation route =>
          simp [completeUserTask, cyclicPostEndWithBindings,
            cyclicPostCompletionWithBindings, cyclicWaitingWithBindings,
            singletonWaitingState, initialState] at completion
      | completed activation route =>
          simp [completeUserTask, cyclicCompletedWithBindings,
            cyclicPostEndWithBindings, cyclicPostCompletionWithBindings,
            cyclicWaitingWithBindings, singletonWaitingState, initialState] at completion

theorem actual_reachability_has_shape
    (state : RuntimeState) (reachable : CyclicSelectedReachable state) :
    CyclicReachableShape state := by
  induction reachable with
  | initial => exact .initial
  | next before after _ action induction =>
      exact selected_action_preserves_shape before after induction action

theorem actual_selected_reachability_preserves_active_unit_invariant
    (state : RuntimeState) (reachable : CyclicSelectedReachable state) :
    cyclicActiveUnitCount state ≤ 1 := by
  have shape := actual_reachability_has_shape state reachable
  cases shape <;>
    simp [cyclicActiveUnitCount, cyclicAdmittedStartState,
      cyclicPostStartState, cyclicInitialPostMergeState,
      cyclicWaitingWithBindings, cyclicPostCompletionWithBindings,
      cyclicPostChooseWithBindings, cyclicPostMergeWithBindings,
      cyclicPostEndWithBindings, cyclicCompletedWithBindings,
      cyclicScopedVariables, singletonWaitingState, initialState,
      runningStartState]

/-- Actual selected reachability is closed under every admitted selected-program action. -/
theorem actual_selected_reachability_is_closed_under_actions
    (before after : RuntimeState) (reachable : CyclicSelectedReachable before)
    (action : CyclicSelectedAction before after) :
    CyclicSelectedReachable after :=
  .next before after reachable action

/-- Every empty, null-route, or arbitrary-string route patch is one actual selected User Task completion action. -/
theorem every_valid_review_patch_is_an_actual_selected_action
    (activation : Nat) (route : CyclicRouteValue)
    (patch : CyclicReviewPatch) :
    CyclicSelectedAction (cyclicWaitingWithBindings activation route)
      (cyclicPostCompletionWithBindings activation (patch.apply route)) := by
  apply CyclicSelectedAction.completeReview
    (cyclicWaitingWithBindings activation route)
    (cyclicPostCompletionWithBindings activation route)
    (cyclicPostCompletionWithBindings activation (patch.apply route))
    activation patch
  · rfl
  · exact exact_review_completion_before_patch activation route
  · exact exact_review_patch activation route patch

/-- Exact initiation reaches the first live User Task through actual admission and evaluator actions. -/
theorem exact_initiation_is_actual_selected_reachable :
    CyclicSelectedReachable (cyclicWaitingWithBindings 1 .absent) := by
  have admitted : CyclicSelectedReachable cyclicAdmittedStartState :=
    .next initialState cyclicAdmittedStartState .initial
      (.admitStart representative_start_admission_is_exact)
  have started : CyclicSelectedReachable cyclicPostStartState :=
    .next cyclicAdmittedStartState cyclicPostStartState admitted
      (.internal _ _ _ (.start representative_start_operation_is_exact))
  have merged : CyclicSelectedReachable cyclicInitialPostMergeState :=
    .next cyclicPostStartState cyclicInitialPostMergeState started
      (.internal _ _ _ (.initialMerge representative_initial_merge_is_exact))
  apply CyclicSelectedReachable.next cyclicInitialPostMergeState _ merged
  apply CyclicSelectedAction.internal _ _ _
  apply CyclicSelectedInternalAction.initialReview
  unfold step
  rw [cyclic_actual_review_lookup]
  rfl

private theorem actual_choice_action (activation : Nat)
    (route : CyclicRouteValue) :
    CyclicSelectedAction (cyclicPostCompletionWithBindings activation route)
      (cyclicPostChooseWithBindings activation route route.output) :=
  .internal _ _ _ (.choose activation route
    (arbitrary_route_choice_is_exact activation route))

private theorem actual_default_exit_actions (activation : Nat)
    (route : CyclicRouteValue)
    (defaultSelected : route.output = ⟨"place:Flow_Exit"⟩) :
    CyclicSelectedAction
        (cyclicPostChooseWithBindings activation route route.output)
        (cyclicPostEndWithBindings activation route) ∧
      CyclicSelectedAction (cyclicPostEndWithBindings activation route)
        (cyclicCompletedWithBindings activation route) := by
  constructor
  · exact .internal _ _ _ (.endDefault activation route defaultSelected
      (arbitrary_default_end_is_exact activation route defaultSelected))
  · exact .internal _ _ _ (.complete activation route
      (arbitrary_default_completion_is_exact activation route))

/-- Every empty, null, or string patch whose resulting route selects the default branch reaches exact completion. -/
theorem every_default_selecting_review_patch_reaches_completion
    (activation : Nat) (previous : CyclicRouteValue)
    (patch : CyclicReviewPatch)
    (reachable : CyclicSelectedReachable
      (cyclicWaitingWithBindings activation previous))
    (defaultSelected : (patch.apply previous).output =
      ⟨"place:Flow_Exit"⟩) :
    CyclicSelectedReachable
      (cyclicCompletedWithBindings activation (patch.apply previous)) := by
  have completedTask := CyclicSelectedReachable.next _ _ reachable
    (every_valid_review_patch_is_an_actual_selected_action
      activation previous patch)
  have chosen := CyclicSelectedReachable.next _ _ completedTask
    (actual_choice_action activation (patch.apply previous))
  obtain ⟨endedAction, completedAction⟩ := actual_default_exit_actions
    activation (patch.apply previous) defaultSelected
  have ended := CyclicSelectedReachable.next _ _ chosen endedAction
  exact CyclicSelectedReachable.next _ _ ended completedAction

/-- An arbitrary non-conditional string selects the default branch and is included by actual selected reachability. -/
theorem arbitrary_default_string_is_actual_selected_reachable
    (value : String) (notRepeat : value ≠ "repeat")
    (notRework : value ≠ "rework") :
    CyclicSelectedReachable (cyclicCompletedWithBindings 1 (.stringValue value)) := by
  have defaultSelected :
      (CyclicRouteValue.stringValue value).output =
        ⟨"place:Flow_Exit"⟩ := by
    simp [CyclicRouteValue.output, notRepeat, notRework]
  exact every_default_selecting_review_patch_reaches_completion
    1 .absent (.stringRoute value) exact_initiation_is_actual_selected_reachable
    defaultSelected

theorem other_route_default_exit_is_actual_selected_reachable :
    CyclicSelectedReachable (cyclicCompletedState 1 "other") := by
  have stateExact : cyclicCompletedWithBindings 1 (.stringValue "other") =
      cyclicCompletedState 1 "other" := by
    rfl
  rw [← stateExact]
  exact arbitrary_default_string_is_actual_selected_reachable "other"
    (by decide +kernel) (by decide +kernel)

/-- Every actual live phase after successful initiation and before None End consumption has exactly one active unit. -/
theorem actual_selected_live_reachability_has_exactly_one_active_unit
    (state : RuntimeState) (reachable : CyclicSelectedReachable state)
    (running : state.control = .running cyclicInstanceId)
    (initiated : state.initiationPending = false)
    (beforeEnd : state.endOccurrences = 0) :
    cyclicActiveUnitCount state = 1 := by
  have shape := actual_reachability_has_shape state reachable
  cases shape <;>
    simp [cyclicActiveUnitCount, cyclicAdmittedStartState,
      cyclicPostStartState, cyclicInitialPostMergeState,
      cyclicWaitingWithBindings, cyclicPostCompletionWithBindings,
      cyclicPostChooseWithBindings, cyclicPostMergeWithBindings,
      cyclicPostEndWithBindings, cyclicCompletedWithBindings,
      cyclicScopedVariables, singletonWaitingState, initialState,
      runningStartState] at running initiated beforeEnd ⊢

theorem different_input_multi_offer_is_not_actual_selected_reachable :
    ¬ CyclicSelectedReachable cyclicTwoInputState := by
  intro reachable
  have bound := actual_selected_reachability_preserves_active_unit_invariant
    cyclicTwoInputState reachable
  simp [cyclicActiveUnitCount, cyclicTwoInputState] at bound

theorem same_input_multi_offer_is_not_actual_selected_reachable :
    ¬ CyclicSelectedReachable cyclicSameInputMultiplicityTwoState := by
  intro reachable
  have bound := actual_selected_reachability_preserves_active_unit_invariant
    cyclicSameInputMultiplicityTwoState reachable
  simp [cyclicActiveUnitCount, cyclicSameInputMultiplicityTwoState] at bound

theorem different_owner_multi_offer_is_not_actual_selected_reachable :
    ¬ CyclicSelectedReachable cyclicDifferentOwnerState := by
  intro reachable
  have bound := actual_selected_reachability_preserves_active_unit_invariant
    cyclicDifferentOwnerState reachable
  simp [cyclicActiveUnitCount, cyclicDifferentOwnerState] at bound

theorem actual_selected_reachability_excludes_every_multi_offer_witness :
    ¬ CyclicSelectedReachable cyclicTwoInputState ∧
      ¬ CyclicSelectedReachable cyclicSameInputMultiplicityTwoState ∧
      ¬ CyclicSelectedReachable cyclicDifferentOwnerState :=
  ⟨different_input_multi_offer_is_not_actual_selected_reachable,
    same_input_multi_offer_is_not_actual_selected_reachable,
    different_owner_multi_offer_is_not_actual_selected_reachable⟩

end BpmnSemantics.SemanticProcess
