import BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance

/-! # Selected cyclic evaluator-step completeness

This module proves that the classified internal-action relation contains every successful evaluator step from an actually reachable selected-program state. It adds no transition or profile behavior.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem cyclic_complete_choice_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Choice"⟩)) =
      some cyclicChoiceOperation := by
  decide +kernel

private theorem cyclic_complete_end_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:End"⟩)) =
      some cyclicEndOperation := by
  decide +kernel

private theorem cyclic_complete_merge_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Merge"⟩)) =
      some cyclicMergeOperation := by
  decide +kernel

private theorem cyclic_complete_review_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Review"⟩)) =
      some cyclicReviewOperation := by
  decide +kernel

private theorem cyclic_complete_start_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Start"⟩)) =
      some cyclicStartOperation := by
  decide +kernel

private theorem cyclic_complete_scope_lookup :
    cyclicProgram.operations.find? (fun operation => decide (operation.id =
      ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩)) =
      some cyclicCompletionOperation := by
  decide +kernel

/-- Every successful selected-program evaluator step names one of the program's six declared operations. -/
theorem successful_selected_program_step_uses_declared_operation
    (before after : RuntimeState) (operationId : OperationId)
    (execution : step cyclicProgram before operationId = some after) :
    operationId = ⟨"operation:Choice"⟩ ∨
      operationId = ⟨"operation:End"⟩ ∨
      operationId = ⟨"operation:Merge"⟩ ∨
      operationId = ⟨"operation:Review"⟩ ∨
      operationId = ⟨"operation:Start"⟩ ∨
      operationId =
        ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩ := by
  unfold step at execution
  generalize selectedEq : cyclicProgram.operations.find? (fun operation =>
    decide (operation.id = operationId)) = selected at execution
  cases selected with
  | none => simp at execution
  | some operation =>
      have operationMember : operation ∈ cyclicProgram.operations :=
        List.mem_of_find?_eq_some selectedEq
      have selectedMatches : decide (operation.id = operationId) = true :=
        List.find?_some
          (p := fun candidate : SemanticOperation =>
            decide (candidate.id = operationId)) selectedEq
      have idExact : operation.id = operationId :=
        of_decide_eq_true selectedMatches
      have member : operationId ∈ cyclicProgram.operations.map (·.id) := by
        rw [← idExact]
        exact List.mem_map.mpr ⟨operation, operationMember, rfl⟩
      simpa [cyclicProgram, cyclicOperations, cyclicChoiceOperation,
        cyclicEndOperation, cyclicMergeOperation, cyclicReviewOperation,
        cyclicStartOperation, cyclicCompletionOperation,
        SemanticOperation.id] using member

/-- Every successful selected-program evaluator step from an actually reachable state belongs to the complete internal-action relation. -/
theorem actual_selected_internal_action_is_complete
    (before after : RuntimeState) (operationId : OperationId)
    (reachable : CyclicSelectedReachable before)
    (execution : step cyclicProgram before operationId = some after) :
    CyclicSelectedInternalAction before operationId after := by
  have shape := actual_reachability_has_shape before reachable
  rcases successful_selected_program_step_uses_declared_operation
      before after operationId
      execution with rfl | rfl | rfl | rfl | rfl | rfl
  · cases shape
    case completedTask activation route =>
        rw [arbitrary_route_choice_is_exact activation route] at execution
        simp at execution
        subst after
        exact .choose activation route
          (arbitrary_route_choice_is_exact activation route)
    case chosen activation route =>
      cases route with
      | absent => change none = some after at execution; contradiction
      | nullValue => change none = some after at execution; contradiction
      | stringValue value =>
          by_cases isRepeat : value = "repeat"
          · subst value
            change none = some after at execution
            contradiction
          · by_cases rework : value = "rework"
            · subst value
              change none = some after at execution
              contradiction
            · simp [step, cyclic_complete_choice_lookup, cyclicChoiceOperation,
                cyclicPostChooseWithBindings, cyclicPostCompletionWithBindings,
                cyclicWaitingWithBindings, cyclicScopedVariables,
                CyclicRouteValue.output, CyclicRouteValue.bindings,
                singletonWaitingState, initialState, fire?, chooseState?,
                onlyTokenOwner?, tokenOwners, isRepeat, rework] at execution
    all_goals
      change none = some after at execution
      contradiction
  · cases shape
    case chosen activation route =>
        cases route with
        | absent =>
            rw [arbitrary_default_end_is_exact activation .absent rfl] at execution
            simp at execution
            subst after
            exact .endDefault activation .absent rfl
              (arbitrary_default_end_is_exact activation .absent rfl)
        | nullValue =>
            rw [arbitrary_default_end_is_exact activation .nullValue rfl] at execution
            simp at execution
            subst after
            exact .endDefault activation .nullValue rfl
              (arbitrary_default_end_is_exact activation .nullValue rfl)
        | stringValue value =>
            by_cases isRepeat : value = "repeat"
            · subst value
              unfold step at execution
              rw [cyclic_complete_end_lookup] at execution
              simp [cyclicEndOperation,
                cyclicPostChooseWithBindings, cyclicPostCompletionWithBindings,
                cyclicWaitingWithBindings, cyclicScopedVariables,
                CyclicRouteValue.output, CyclicRouteValue.bindings,
                singletonWaitingState, initialState, fire?,
                reachNoneEndState?, onlyTokenOwner?, tokenOwners] at execution
            · by_cases rework : value = "rework"
              · subst value
                unfold step at execution
                rw [cyclic_complete_end_lookup] at execution
                simp [cyclicEndOperation,
                  cyclicPostChooseWithBindings, cyclicPostCompletionWithBindings,
                  cyclicWaitingWithBindings, cyclicScopedVariables,
                  CyclicRouteValue.output, CyclicRouteValue.bindings,
                  singletonWaitingState, initialState, fire?,
                  reachNoneEndState?, onlyTokenOwner?, tokenOwners] at execution
              · have defaultSelected :
                    (CyclicRouteValue.stringValue value).output =
                      ⟨"place:Flow_Exit"⟩ := by
                    simp [CyclicRouteValue.output, isRepeat, rework]
                rw [arbitrary_default_end_is_exact activation
                  (.stringValue value) defaultSelected] at execution
                simp at execution
                subst after
                exact .endDefault activation (.stringValue value)
                  defaultSelected (arbitrary_default_end_is_exact activation
                    (.stringValue value) defaultSelected)
    all_goals
      change none = some after at execution
      contradiction
  · cases shape
    case started =>
        rw [representative_initial_merge_is_exact] at execution
        simp at execution
        subst after
        exact .initialMerge representative_initial_merge_is_exact
    case chosen activation route =>
        cases route with
        | stringValue value =>
            by_cases isRepeat : value = "repeat"
            · subst value
              have exactStepWithBindings :
                  step cyclicProgram
                      (cyclicPostChooseWithBindings activation
                      (CyclicRouteValue.stringValue "repeat")
                      (CyclicRouteValue.stringValue "repeat").output)
                    ⟨"operation:Merge"⟩ =
                    some (cyclicPostMergeWithBindings activation
                      (CyclicRouteValue.stringValue "repeat")) := by
                unfold step
                rw [cyclic_complete_merge_lookup]
                rfl
              rw [exactStepWithBindings] at execution
              simp at execution
              subst after
              exact .mergeRepeat activation exactStepWithBindings
            · by_cases rework : value = "rework"
              · subst value
                have exactStepWithBindings :
                    step cyclicProgram
                      (cyclicPostChooseWithBindings activation
                        (CyclicRouteValue.stringValue "rework")
                        (CyclicRouteValue.stringValue "rework").output)
                      ⟨"operation:Merge"⟩ =
                      some (cyclicPostMergeWithBindings activation
                        (CyclicRouteValue.stringValue "rework")) := by
                  unfold step
                  rw [cyclic_complete_merge_lookup]
                  rfl
                rw [exactStepWithBindings] at execution
                simp at execution
                subst after
                exact .mergeRework activation exactStepWithBindings
              · exact False.elim
                  (by
                    have defaultOutput :
                        (CyclicRouteValue.stringValue value).output =
                          ⟨"place:Flow_Exit"⟩ := by
                      simp [CyclicRouteValue.output, isRepeat, rework]
                    have noOffer :
                        exclusiveMergeInputTokens
                          (cyclicPostChooseWithBindings activation
                            (CyclicRouteValue.stringValue value)
                            ⟨"place:Flow_Exit"⟩)
                          cyclicMergeInputs = [] := by
                      rfl
                    have refused :
                        mergeExclusiveState?
                          (cyclicPostChooseWithBindings activation
                            (CyclicRouteValue.stringValue value)
                            ⟨"place:Flow_Exit"⟩)
                          cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩ =
                          none := by
                      simp [mergeExclusiveState?, noOffer]
                    unfold step at execution
                    rw [cyclic_complete_merge_lookup] at execution
                    change mergeExclusiveState?
                      (cyclicPostChooseWithBindings activation
                        (CyclicRouteValue.stringValue value)
                        (CyclicRouteValue.stringValue value).output)
                      cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩ =
                        some after at execution
                    rw [defaultOutput, refused] at execution
                    contradiction)
        | absent =>
            change none = some after at execution
            contradiction
        | nullValue =>
            change none = some after at execution
            contradiction
    all_goals
      change none = some after at execution
      contradiction
  · cases shape
    case initialMerged =>
        rw [initial_absent_route_review_is_exact] at execution
        simp at execution
        subst after
        exact .initialReview initial_absent_route_review_is_exact
    case merged activation route =>
        rw [arbitrary_route_review_is_exact activation route] at execution
        simp at execution
        subst after
        exact .review activation route
          (arbitrary_route_review_is_exact activation route)
    case chosen activation route =>
      cases route with
      | absent => change none = some after at execution; contradiction
      | nullValue => change none = some after at execution; contradiction
      | stringValue value =>
          by_cases isRepeat : value = "repeat"
          · subst value
            change none = some after at execution
            contradiction
          · by_cases rework : value = "rework"
            · subst value
              change none = some after at execution
              contradiction
            · simp [step, cyclic_complete_review_lookup,
                cyclicReviewOperation, cyclicPostChooseWithBindings,
                cyclicPostCompletionWithBindings, cyclicWaitingWithBindings,
                cyclicScopedVariables, CyclicRouteValue.output,
                CyclicRouteValue.bindings, singletonWaitingState,
                initialState, fire?, awaitUserTaskState?, onlyTokenOwner?,
                tokenOwners, isRepeat, rework] at execution
    all_goals
      change none = some after at execution
      contradiction
  · cases shape
    case admitted =>
        rw [representative_start_operation_is_exact] at execution
        simp at execution
        subst after
        exact .start representative_start_operation_is_exact
    all_goals
      change none = some after at execution
      contradiction
  · cases shape
    case ended activation route =>
        rw [arbitrary_default_completion_is_exact activation route] at execution
        simp at execution
        subst after
        exact .complete activation route
          (arbitrary_default_completion_is_exact activation route)
    all_goals
      change none = some after at execution
      contradiction

end BpmnSemantics.SemanticProcess
