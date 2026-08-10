import BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance

/-! # Actual cyclic automatic-closure conformance

This module owns arbitrary finite traces of the selected program's actual internal evaluator actions, their correspondence to the retained resumption-cut DAG, and the representative schedule specialization. It proves no termination or fairness claim.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- An arbitrary finite sequence of raw selected-program evaluator steps. -/
inductive CyclicActualInternalTrace :
    RuntimeState → List OperationId → RuntimeState → Prop where
  | nil (state : RuntimeState) : CyclicActualInternalTrace state [] state
  | cons (before middle after : RuntimeState) (operationId : OperationId)
      (remaining : List OperationId)
      (execution : step cyclicProgram before operationId = some middle)
      (rest : CyclicActualInternalTrace middle remaining after) :
      CyclicActualInternalTrace before (operationId :: remaining) after

private theorem selected_internal_action_is_an_evaluator_step
    (before after : RuntimeState) (operationId : OperationId)
    (action : CyclicSelectedInternalAction before operationId after) :
    step cyclicProgram before operationId = some after := by
  cases action <;> assumption

/-- An actual automatic closure begins in a selected reachable state and ends when no internal evaluator action is enabled. -/
def CyclicActualAutomaticClosure (before : RuntimeState)
    (operations : List OperationId) (after : RuntimeState) : Prop :=
  CyclicSelectedReachable before ∧
    CyclicActualInternalTrace before operations after ∧
    enabledInternalOperationCount cyclicProgram after = 0

private theorem consecutive_actual_internal_steps_are_retained
    (before middle after : RuntimeState) (first second : OperationId)
    (reachable : CyclicSelectedReachable before)
    (firstExecution : step cyclicProgram before first = some middle)
    (secondExecution : step cyclicProgram middle second = some after) :
    { source := first, target := second } ∈ cyclicProgramCutEdges := by
  have firstAction := actual_selected_internal_action_is_complete
    before middle first reachable firstExecution
  cases firstAction with
  | choose activation route execution =>
      cases route with
      | absent =>
          rcases successful_selected_program_step_uses_declared_operation
              _ _ _ secondExecution with rfl | rfl | rfl | rfl | rfl | rfl
          all_goals first
            | (change none = some after at secondExecution; contradiction)
            | simp [cyclicProgramCutEdges, cyclicProgramEdges]
      | nullValue =>
          rcases successful_selected_program_step_uses_declared_operation
              _ _ _ secondExecution with rfl | rfl | rfl | rfl | rfl | rfl
          all_goals first
            | (change none = some after at secondExecution; contradiction)
            | simp [cyclicProgramCutEdges, cyclicProgramEdges]
      | stringValue value =>
          by_cases isRepeat : value = "repeat"
          · subst value
            rcases successful_selected_program_step_uses_declared_operation
                _ _ _ secondExecution with rfl | rfl | rfl | rfl | rfl | rfl
            all_goals first
              | (change none = some after at secondExecution; contradiction)
              | simp [cyclicProgramCutEdges, cyclicProgramEdges]
          · by_cases rework : value = "rework"
            · subst value
              rcases successful_selected_program_step_uses_declared_operation
                  _ _ _ secondExecution with rfl | rfl | rfl | rfl | rfl | rfl
              all_goals first
                | (change none = some after at secondExecution; contradiction)
                | simp [cyclicProgramCutEdges, cyclicProgramEdges]
            · have defaultOutput :
                  (CyclicRouteValue.stringValue value).output =
                    ⟨"place:Flow_Exit"⟩ := by
                simp [CyclicRouteValue.output, isRepeat, rework]
              rw [defaultOutput] at secondExecution
              rcases successful_selected_program_step_uses_declared_operation
                  _ _ _ secondExecution with rfl | rfl | rfl | rfl | rfl | rfl
              all_goals first
                | (change none = some after at secondExecution; contradiction)
                | simp [cyclicProgramCutEdges, cyclicProgramEdges]
  | start execution
  | initialMerge execution
  | initialReview execution
  | mergeRepeat activation execution
  | mergeRework activation execution
  | review activation route execution
  | endDefault activation route defaultSelected execution
  | complete activation route execution =>
      rcases successful_selected_program_step_uses_declared_operation
          _ _ _ secondExecution with rfl | rfl | rfl | rfl | rfl | rfl
      all_goals first
        | (change none = some after at secondExecution; contradiction)
        | simp [cyclicProgramCutEdges, cyclicProgramEdges]

/-- Every consecutive evaluator choice in an arbitrary actual reachable trace is a retained edge of the selected resumption-cut DAG. -/
theorem arbitrary_actual_internal_trace_follows_retained_cut_edges
    (before after : RuntimeState) (operations : List OperationId)
    (reachable : CyclicSelectedReachable before)
    (trace : CyclicActualInternalTrace before operations after) :
    DirectedPath cyclicProgramCutEdges operations := by
  induction trace with
  | nil => simp [DirectedPath, directedPathEdges]
  | cons before middle after first remaining execution rest induction =>
      have firstAction := actual_selected_internal_action_is_complete
        before middle first reachable execution
      have middleReachable := CyclicSelectedReachable.next before middle reachable
        (.internal before middle first firstAction)
      cases rest with
      | nil => simp [DirectedPath, directedPathEdges]
      | cons middle next after second tail secondExecution tailTrace =>
          intro edge member
          simp only [directedPathEdges, List.mem_cons] at member
          rcases member with rfl | member
          · exact consecutive_actual_internal_steps_are_retained
              before middle next first second reachable execution secondExecution
          · exact induction middleReachable edge member

/-- Every arbitrary internal trace from an actually reachable state ends in an actually reachable state. -/
theorem arbitrary_actual_internal_trace_preserves_selected_reachability
    (before after : RuntimeState) (operations : List OperationId)
    (reachable : CyclicSelectedReachable before)
    (trace : CyclicActualInternalTrace before operations after) :
    CyclicSelectedReachable after := by
  induction trace with
  | nil => exact reachable
  | cons before middle after operationId remaining execution rest induction =>
      have action := actual_selected_internal_action_is_complete
        before middle operationId reachable execution
      have middleReachable := CyclicSelectedReachable.next before middle reachable
        (.internal before middle operationId action)
      exact induction middleReachable

/-- Every actual automatic closure ends in an actually reachable selected-program state. -/
theorem actual_automatic_closure_ends_in_selected_reachability
    (before after : RuntimeState) (operations : List OperationId)
    (closure : CyclicActualAutomaticClosure before operations after) :
    CyclicSelectedReachable after := by
  rcases closure with ⟨reachable, trace, _⟩
  exact arbitrary_actual_internal_trace_preserves_selected_reachability
    before after operations reachable trace

private def cyclicClosureRank (operationId : OperationId) : Nat :=
  if operationId = ⟨"operation:Start"⟩ ∨
      operationId = ⟨"operation:Choice"⟩ then 0
  else if operationId = ⟨"operation:Merge"⟩ ∨
      operationId = ⟨"operation:End"⟩ then 1
  else 2

private theorem retained_cut_edge_ranks_increase
    (first second : OperationId)
    (retained : { source := first, target := second } ∈ cyclicProgramCutEdges) :
    cyclicClosureRank first < cyclicClosureRank second := by
  simp [cyclicProgramCutEdges, cyclicProgramEdges] at retained
  grind [cyclicClosureRank]

private theorem cyclic_closure_rank_is_bounded (operationId : OperationId) :
    cyclicClosureRank operationId ≤ 2 := by
  unfold cyclicClosureRank
  by_cases first : operationId = ⟨"operation:Start"⟩ ∨
      operationId = ⟨"operation:Choice"⟩
  · simp [first]
  · by_cases second : operationId = ⟨"operation:Merge"⟩ ∨
        operationId = ⟨"operation:End"⟩
    · simp [first, second]
    · simp [first, second]

private theorem every_trace_operation_has_bounded_rank
    (operations : List OperationId) :
    ∀ operationId ∈ operations, cyclicClosureRank operationId ≤ 2 := by
  intro operationId _
  exact cyclic_closure_rank_is_bounded operationId

private theorem retained_head_precedes_every_tail_rank
    (first second : OperationId) (remaining : List OperationId)
    (retained : { source := first, target := second } ∈ cyclicProgramCutEdges)
    (tailRanks : (second :: remaining).Pairwise fun left right =>
      cyclicClosureRank left < cyclicClosureRank right) :
    ∀ candidate ∈ second :: remaining,
      cyclicClosureRank first < cyclicClosureRank candidate := by
  intro candidate member
  rcases List.mem_cons.mp member with equal | member
  · rw [equal]
    exact retained_cut_edge_ranks_increase first second retained
  · exact Nat.lt_trans
      (retained_cut_edge_ranks_increase first second retained)
      (List.rel_of_pairwise_cons tailRanks member)

private theorem retained_path_ranks_are_pairwise_increasing
    (operations : List OperationId)
    (path : DirectedPath cyclicProgramCutEdges operations) :
    operations.Pairwise fun left right =>
      cyclicClosureRank left < cyclicClosureRank right := by
  induction operations with
  | nil => simp
  | cons first remaining induction =>
      cases remaining with
      | nil => simp
      | cons second remaining =>
          have retained :
              { source := first, target := second } ∈ cyclicProgramCutEdges :=
            path _ (by simp [directedPathEdges])
          have tailPath : DirectedPath cyclicProgramCutEdges
              (second :: remaining) := by
            intro edge member
            exact path edge (by
              simp only [directedPathEdges, List.mem_cons]
              exact Or.inr member)
          have tailRanks := induction tailPath
          exact List.pairwise_cons.mpr ⟨
            retained_head_precedes_every_tail_rank first second remaining
              retained tailRanks,
            tailRanks⟩

/-- Arbitrary actual automatic closure never revisits an operation before the next external stimulus. -/
theorem arbitrary_actual_internal_trace_does_not_repeat_operations
    (before after : RuntimeState) (operations : List OperationId)
    (reachable : CyclicSelectedReachable before)
    (trace : CyclicActualInternalTrace before operations after) :
    operations.Nodup := by
  have path := arbitrary_actual_internal_trace_follows_retained_cut_edges
    before after operations reachable trace
  rw [List.nodup_iff_pairwise_ne]
  apply (retained_path_ranks_are_pairwise_increasing operations path).imp
  intro left right less equal
  subst right
  exact Nat.lt_irrefl _ less

private theorem arbitrary_actual_internal_trace_has_at_most_three_steps
    (before after : RuntimeState) (operations : List OperationId)
    (reachable : CyclicSelectedReachable before)
    (trace : CyclicActualInternalTrace before operations after) :
    operations.length ≤ 3 := by
  have path := arbitrary_actual_internal_trace_follows_retained_cut_edges
    before after operations reachable trace
  have ranks := retained_path_ranks_are_pairwise_increasing operations path
  have bounded := every_trace_operation_has_bounded_rank operations
  cases operations with
  | nil => simp
  | cons first remaining =>
      cases remaining with
      | nil => simp
      | cons second remaining =>
          cases remaining with
          | nil => simp
          | cons third remaining =>
              cases remaining with
              | nil => simp
              | cons fourth remaining =>
                  have fourthBound : cyclicClosureRank fourth ≤ 2 :=
                    bounded fourth (by simp)
                  have firstSecond := List.rel_of_pairwise_cons ranks
                    (by simp : second ∈ second :: third :: fourth :: remaining)
                  have tailRanks := List.Pairwise.of_cons ranks
                  have secondThird := List.rel_of_pairwise_cons tailRanks
                    (by simp : third ∈ third :: fourth :: remaining)
                  have thirdRanks := List.Pairwise.of_cons tailRanks
                  have thirdFourth := List.rel_of_pairwise_cons thirdRanks
                    (by simp : fourth ∈ fourth :: remaining)
                  omega

/-- Every arbitrary actual automatic closure follows the retained cut DAG, has no repeated operation, and is bounded by all six selected operations. -/
theorem arbitrary_actual_automatic_closure_is_cut_bounded
    (before after : RuntimeState) (operations : List OperationId)
    (closure : CyclicActualAutomaticClosure before operations after) :
    DirectedPath cyclicProgramCutEdges operations ∧
      operations.Nodup ∧
      operations.length ≤ cyclicProgram.operations.length := by
  rcases closure with ⟨reachable, trace, _⟩
  refine ⟨arbitrary_actual_internal_trace_follows_retained_cut_edges
    before after operations reachable trace, ?_, ?_⟩
  · exact arbitrary_actual_internal_trace_does_not_repeat_operations
      before after operations reachable trace
  · have short := arbitrary_actual_internal_trace_has_at_most_three_steps
      before after operations reachable trace
    simpa [cyclicProgram, cyclicOperations] using
      Nat.le_trans short (by decide +kernel)

theorem representative_automatic_closure_follows_cut_dag_without_revisit
    (before after : RuntimeState) (operations : List OperationId)
    (closure : CyclicActualAutomaticClosure before operations after) :
    DirectedPath cyclicProgramCutEdges operations ∧
      operations.Nodup ∧ operations.length ≤ 6 := by
  obtain ⟨path, distinct, bounded⟩ :=
    arbitrary_actual_automatic_closure_is_cut_bounded
      before after operations closure
  exact ⟨path, distinct, by
    simpa [cyclicProgram, cyclicOperations] using bounded⟩

theorem representative_start_automatic_closure_is_material :
    CyclicActualAutomaticClosure cyclicAdmittedStartState
      cyclicStartClosureTrace (cyclicWaitingWithBindings 1 .absent) := by
  refine ⟨?_, ?_, by decide +kernel⟩
  · exact CyclicSelectedReachable.next initialState cyclicAdmittedStartState
      .initial (.admitStart representative_start_admission_is_exact)
  · unfold cyclicStartClosureTrace
    exact .cons cyclicAdmittedStartState cyclicPostStartState _
      ⟨"operation:Start"⟩ _ representative_start_operation_is_exact
      (.cons cyclicPostStartState cyclicInitialPostMergeState _
        ⟨"operation:Merge"⟩ _ representative_initial_merge_is_exact
        (.cons cyclicInitialPostMergeState
          (cyclicWaitingWithBindings 1 .absent) _
          ⟨"operation:Review"⟩ [] initial_absent_route_review_is_exact
          (.nil _)))

private theorem actual_repeat_merge_action (activation : Nat) :
    CyclicSelectedInternalAction
      (cyclicPostChooseWithBindings activation (.stringValue "repeat")
        ⟨"place:Flow_Repeat"⟩) ⟨"operation:Merge"⟩
      (cyclicPostMergeWithBindings activation (.stringValue "repeat")) := by
  apply CyclicSelectedInternalAction.mergeRepeat activation
  exact representative_merge_passes_selected_branch_for_every_activation
    activation "repeat" ⟨"place:Flow_Repeat"⟩ (Or.inl rfl)

private theorem actual_rework_merge_action (activation : Nat) :
    CyclicSelectedInternalAction
      (cyclicPostChooseWithBindings activation (.stringValue "rework")
        ⟨"place:Flow_Rework"⟩) ⟨"operation:Merge"⟩
      (cyclicPostMergeWithBindings activation (.stringValue "rework")) := by
  apply CyclicSelectedInternalAction.mergeRework activation
  exact representative_merge_passes_selected_branch_for_every_activation
    activation "rework" ⟨"place:Flow_Rework"⟩ (Or.inr rfl)

theorem representative_reviewed_automatic_closure_is_material
    (activation : Nat) (choice : CyclicReviewedChoice)
    (reachable : CyclicSelectedReachable
      (cyclicPostCompletionWithBindings activation (.stringValue choice.route))) :
    CyclicActualAutomaticClosure
      (cyclicPostCompletionWithBindings activation (.stringValue choice.route))
      cyclicReviewedClosureTrace
      (cyclicWaitingWithBindings (activation + 1) (.stringValue choice.route)) := by
  refine ⟨reachable, ?_, ?_⟩
  · unfold cyclicReviewedClosureTrace cyclicRepeatChoices
    cases choice with
    | repeatReview =>
        exact .cons _ _ _ ⟨"operation:Choice"⟩ _
          (arbitrary_route_choice_is_exact activation (.stringValue "repeat"))
          (.cons _ _ _ ⟨"operation:Merge"⟩ _
            (selected_internal_action_is_an_evaluator_step _ _ _
              (actual_repeat_merge_action activation))
            (.cons _ _ _ ⟨"operation:Review"⟩ []
              (arbitrary_route_review_is_exact activation
                (.stringValue "repeat")) (.nil _)))
    | reworkReview =>
        exact .cons _ _ _ ⟨"operation:Choice"⟩ _
          (arbitrary_route_choice_is_exact activation (.stringValue "rework"))
          (.cons _ _ _ ⟨"operation:Merge"⟩ _
            (selected_internal_action_is_an_evaluator_step _ _ _
              (actual_rework_merge_action activation))
            (.cons _ _ _ ⟨"operation:Review"⟩ []
              (arbitrary_route_review_is_exact activation
                (.stringValue "rework")) (.nil _)))
  · cases choice <;> rfl

theorem representative_exit_automatic_closure_is_material (activation : Nat)
    (reachable : CyclicSelectedReachable
      (cyclicPostCompletionWithBindings activation (.stringValue "exit"))) :
    CyclicActualAutomaticClosure
      (cyclicPostCompletionWithBindings activation (.stringValue "exit"))
      cyclicExitClosureTrace
      (cyclicCompletedWithBindings activation (.stringValue "exit")) := by
  refine ⟨reachable, ?_, rfl⟩
  · unfold cyclicExitClosureTrace cyclicExitChoices
    exact .cons _ _ _ ⟨"operation:Choice"⟩ _
      (arbitrary_route_choice_is_exact activation (.stringValue "exit"))
      (.cons _ _ _ ⟨"operation:End"⟩ _
        (arbitrary_default_end_is_exact activation (.stringValue "exit") rfl)
        (.cons _ _ _
          ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩ []
          (arbitrary_default_completion_is_exact activation
            (.stringValue "exit")) (.nil _)))

private theorem reviewed_choice_reaches_next_activation
    (activation : Nat) (route : CyclicRouteValue)
    (reachable : CyclicSelectedReachable
      (cyclicWaitingWithBindings activation route))
    (choice : CyclicReviewedChoice) :
    CyclicSelectedReachable
      (cyclicWaitingWithBindings (activation + 1)
        (.stringValue choice.route)) := by
  have completedTask := CyclicSelectedReachable.next _ _ reachable
    (every_valid_review_patch_is_an_actual_selected_action activation route
      (.stringRoute choice.route))
  cases choice with
  | repeatReview =>
      have chosen := CyclicSelectedReachable.next _ _ completedTask
        (.internal _ _ _ (.choose activation (.stringValue "repeat")
          (arbitrary_route_choice_is_exact activation (.stringValue "repeat"))))
      have merged := CyclicSelectedReachable.next _ _ chosen
        (.internal _ _ _ (actual_repeat_merge_action activation))
      exact CyclicSelectedReachable.next _ _ merged
        (.internal _ _ _ (.review activation (.stringValue "repeat")
          (arbitrary_route_review_is_exact activation (.stringValue "repeat"))))
  | reworkReview =>
      have chosen := CyclicSelectedReachable.next _ _ completedTask
        (.internal _ _ _ (.choose activation (.stringValue "rework")
          (arbitrary_route_choice_is_exact activation (.stringValue "rework"))))
      have merged := CyclicSelectedReachable.next _ _ chosen
        (.internal _ _ _ (actual_rework_merge_action activation))
      exact CyclicSelectedReachable.next _ _ merged
        (.internal _ _ _ (.review activation (.stringValue "rework")
          (arbitrary_route_review_is_exact activation (.stringValue "rework"))))

private theorem every_reviewed_choice_list_is_actual
    (activation : Nat) (route : CyclicRouteValue)
    (choices : List CyclicReviewedChoice)
    (reachable : CyclicSelectedReachable
      (cyclicWaitingWithBindings activation route)) :
    ∃ finalRoute,
      CyclicSelectedReachable
        (cyclicWaitingWithBindings (activation + choices.length) finalRoute) := by
  induction choices generalizing activation route with
  | nil => exact ⟨route, by simpa using reachable⟩
  | cons choice remaining induction =>
      have next := reviewed_choice_reaches_next_activation
        activation route reachable choice
      obtain ⟨finalRoute, finalReach⟩ := induction
        (activation := activation + 1)
        (route := .stringValue choice.route) next
      exact ⟨finalRoute, by
        simpa [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm] using finalReach⟩

/-- Every finite reviewed repeat/rework schedule is actual reachable and its next arbitrary default selection completes. -/
theorem every_finite_reviewed_schedule_and_exit_is_actual_reachable
    (choices : List CyclicReviewedChoice) :
    CyclicSelectedReachable
      (cyclicCompletedState (choices.length + 1) "exit") := by
  obtain ⟨route, waiting⟩ := every_reviewed_choice_list_is_actual
    1 .absent choices exact_initiation_is_actual_selected_reachable
  have normalizedWaiting : CyclicSelectedReachable
      (cyclicWaitingWithBindings (choices.length + 1) route) := by
    simpa [Nat.add_comm] using waiting
  have completedTask := CyclicSelectedReachable.next _ _ normalizedWaiting
    (every_valid_review_patch_is_an_actual_selected_action
      (choices.length + 1) route (.stringRoute "exit"))
  have chosen := CyclicSelectedReachable.next _ _ completedTask
    (.internal _ _ _ (.choose (choices.length + 1) (.stringValue "exit")
      (arbitrary_route_choice_is_exact (choices.length + 1)
        (.stringValue "exit"))))
  have ended := CyclicSelectedReachable.next _ _ chosen
    (.internal _ _ _ (.endDefault (choices.length + 1) (.stringValue "exit")
      rfl (arbitrary_default_end_is_exact (choices.length + 1)
        (.stringValue "exit") rfl)))
  have completed := CyclicSelectedReachable.next _ _ ended
    (.internal _ _ _ (.complete (choices.length + 1) (.stringValue "exit")
      (arbitrary_default_completion_is_exact (choices.length + 1)
        (.stringValue "exit"))))
  exact completed

end BpmnSemantics.SemanticProcess
