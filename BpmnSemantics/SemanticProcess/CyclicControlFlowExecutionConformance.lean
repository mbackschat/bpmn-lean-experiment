import BpmnSemantics.SemanticProcess.CyclicControlFlowConformance
import BpmnSemantics.SemanticProcess.GraphReachabilityLaws

/-! # Representative cyclic execution conformance

This module owns actual reachable execution, finite reviewed-choice schedules, and automatic-closure bounds for the selected cyclic fixture. It proves no general termination, fairness, arbitrary-cycle, or concurrent-arrival claim.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem full_graph_cycle_avoiding_selected_cut_is_retained
    (vertices : List OperationId)
    (cycle : DirectedCycle cyclicProgramEdges vertices)
    (avoids : ∀ edge ∈ directedPathEdges vertices,
      programEdgeIsResumptionContinuation cyclicProgram edge = false) :
    DirectedCycle cyclicProgramCutEdges vertices := by
  exact directed_cycle_survives_program_resumption_cut cyclicProgram
    cyclicProgramEdges vertices cycle avoids

theorem no_full_graph_cycle_avoids_the_selected_resumption_cut
    (vertices : List OperationId) :
    ¬ (DirectedCycle cyclicProgramEdges vertices ∧
      ∀ edge ∈ directedPathEdges vertices,
        programEdgeIsResumptionContinuation cyclicProgram edge = false) := by
  intro ⟨cycle, avoids⟩
  exact acyclicClosed_excludes_directedCycle cyclicProgramCutEdges 6
    cyclic_program_cut_is_saturation_certified_acyclic vertices
    (full_graph_cycle_avoiding_selected_cut_is_retained vertices cycle avoids)

private theorem cyclic_execution_start_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Start"⟩)) =
      some cyclicStartOperation := by
  decide +kernel

private theorem cyclic_execution_merge_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Merge"⟩)) =
      some cyclicMergeOperation := by
  decide +kernel

private theorem cyclic_execution_review_lookup :
    cyclicProgram.operations.find? (fun operation =>
      decide (operation.id = ⟨"operation:Review"⟩)) =
      some cyclicReviewOperation := by
  decide +kernel

theorem representative_start_admission_is_exact :
    applyStimulus 0 cyclicProgram initialState cyclicStartStimulus =
      cyclicBoundedResult cyclicAdmittedStartState := by
  decide +kernel

theorem representative_start_operation_is_exact :
    step cyclicProgram cyclicAdmittedStartState ⟨"operation:Start"⟩ =
      some cyclicPostStartState := by
  unfold step
  rw [cyclic_execution_start_lookup]
  rfl

theorem representative_initial_merge_is_exact :
    step cyclicProgram cyclicPostStartState ⟨"operation:Merge"⟩ =
      some cyclicInitialPostMergeState := by
  unfold step
  rw [cyclic_execution_merge_lookup]
  simp only [fire?, cyclicMergeOperation]
  simpa [cyclicPostStartState, cyclicInitialPostMergeState] using
    (mergeExclusiveState_singleton_offer cyclicPostStartState
      cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩
      { placeId := ⟨"place:Flow_Start"⟩, owner := cyclicOwner }
      rfl (by simp [cyclicMergeInputs]))

theorem representative_initial_review_is_exact :
    step cyclicProgram cyclicInitialPostMergeState ⟨"operation:Review"⟩ =
      some (cyclicWaitingState 1 none) := by
  unfold step
  rw [cyclic_execution_review_lookup]
  rfl

def cyclicRoutePatch (state : RuntimeState) (route : String) : RuntimeState :=
  { state with
    variables :=
      { state.variables with
        process :=
          { bindings := mergeProcessVariableBindings
              state.variables.process.bindings
              [{ name := "route", value := .string route }] } } }

/-- Exact User Task completion plus the submitted Process-variable patch used by the selected profile. -/
inductive CyclicReviewCompletion :
    RuntimeState → Nat → String → RuntimeState → Prop where
  | permitted (before raw after : RuntimeState) (activation : Nat) (route : String)
      (completion : completeUserTask before cyclicInstanceId ⟨"Review"⟩
        activation = some raw)
      (patched : cyclicRoutePatch raw route = after) :
      CyclicReviewCompletion before activation route after

theorem representative_review_completion_is_exact
    (activation : Nat) (previousRoute : Option String) (route : String) :
    CyclicReviewCompletion (cyclicWaitingState activation previousRoute)
      activation route (cyclicPostCompletionState activation route) := by
  apply CyclicReviewCompletion.permitted
    (cyclicWaitingState activation previousRoute)
    { cyclicWaitingState activation previousRoute with
      waits := []
      tokens :=
        [{ placeId := ⟨"place:Flow_Review_Choice"⟩, owner := cyclicOwner }] }
  · simp [completeUserTask, cyclicWaitingState, cyclicWait,
      singletonWaitingState, initialState, addToken]
  · cases previousRoute <;>
      simp [cyclicRoutePatch, cyclicWaitingState, cyclicPostCompletionState,
        cyclicVariables, singletonWaitingState, initialState,
        mergeProcessVariableBindings]
    all_goals rfl

inductive CyclicReviewedChoice where
  | repeatReview
  | reworkReview
  deriving Repr, DecidableEq

def CyclicReviewedChoice.route : CyclicReviewedChoice → String
  | .repeatReview => "repeat"
  | .reworkReview => "rework"

def CyclicReviewedChoice.output : CyclicReviewedChoice → ControlPlaceId
  | .repeatReview => ⟨"place:Flow_Repeat"⟩
  | .reworkReview => ⟨"place:Flow_Rework"⟩

theorem representative_reviewed_choice_closes_to_next_activation
    (activation : Nat) (choice : CyclicReviewedChoice) :
    runChoices cyclicProgram
      (cyclicPostCompletionState activation choice.route)
      cyclicRepeatChoices =
      some (cyclicWaitingState (activation + 1) (some choice.route)) := by
  cases choice with
  | repeatReview =>
      exact representative_program_repeats_for_every_natural activation
  | reworkReview =>
      simp [CyclicReviewedChoice.route, cyclicRepeatChoices, runChoices,
        representative_choice_selects_rework_for_every_activation activation,
        representative_merge_passes_selected_branch_for_every_activation
          activation "rework" ⟨"place:Flow_Rework"⟩ (Or.inr rfl),
        representative_review_awaits_next_activation]

/-- Actual selected execution closes only under the admitted start, exact internal steps, and exact reviewed User Task completions. -/
inductive CyclicSelectedReachable : RuntimeState → Prop where
  | initial : CyclicSelectedReachable initialState
  | admitStart
      (before : CyclicSelectedReachable initialState)
      (execution : applyStimulus 0 cyclicProgram initialState
        cyclicStartStimulus = cyclicBoundedResult cyclicAdmittedStartState) :
      CyclicSelectedReachable cyclicAdmittedStartState
  | initiate
      (before : CyclicSelectedReachable cyclicAdmittedStartState)
      (execution : step cyclicProgram cyclicAdmittedStartState
        ⟨"operation:Start"⟩ = some cyclicPostStartState) :
      CyclicSelectedReachable cyclicPostStartState
  | initialMerge
      (before : CyclicSelectedReachable cyclicPostStartState)
      (execution : step cyclicProgram cyclicPostStartState
        ⟨"operation:Merge"⟩ = some cyclicInitialPostMergeState) :
      CyclicSelectedReachable cyclicInitialPostMergeState
  | initialReview
      (before : CyclicSelectedReachable cyclicInitialPostMergeState)
      (execution : step cyclicProgram cyclicInitialPostMergeState
        ⟨"operation:Review"⟩ = some (cyclicWaitingState 1 none)) :
      CyclicSelectedReachable (cyclicWaitingState 1 none)
  | completeReview (activation : Nat) (previousRoute : Option String)
      (choice : CyclicReviewedChoice)
      (before : CyclicSelectedReachable
        (cyclicWaitingState activation previousRoute))
      (execution : CyclicReviewCompletion
        (cyclicWaitingState activation previousRoute) activation choice.route
        (cyclicPostCompletionState activation choice.route)) :
      CyclicSelectedReachable
        (cyclicPostCompletionState activation choice.route)
  | chooseReviewed (activation : Nat) (choice : CyclicReviewedChoice)
      (before : CyclicSelectedReachable
        (cyclicPostCompletionState activation choice.route))
      (execution : step cyclicProgram
        (cyclicPostCompletionState activation choice.route)
        ⟨"operation:Choice"⟩ = some
          (cyclicPostChooseState activation choice.route choice.output)) :
      CyclicSelectedReachable
        (cyclicPostChooseState activation choice.route choice.output)
  | mergeReviewed (activation : Nat) (choice : CyclicReviewedChoice)
      (before : CyclicSelectedReachable
        (cyclicPostChooseState activation choice.route choice.output))
      (execution : step cyclicProgram
        (cyclicPostChooseState activation choice.route choice.output)
        ⟨"operation:Merge"⟩ =
          some (cyclicPostMergeState activation choice.route)) :
      CyclicSelectedReachable (cyclicPostMergeState activation choice.route)
  | awaitNextReview (activation : Nat) (choice : CyclicReviewedChoice)
      (before : CyclicSelectedReachable
        (cyclicPostMergeState activation choice.route))
      (execution : step cyclicProgram
        (cyclicPostMergeState activation choice.route)
        ⟨"operation:Review"⟩ = some
          (cyclicWaitingState (activation + 1) (some choice.route))) :
      CyclicSelectedReachable
        (cyclicWaitingState (activation + 1) (some choice.route))
  | completeForExit (activation : Nat) (previousRoute : Option String)
      (before : CyclicSelectedReachable
        (cyclicWaitingState activation previousRoute))
      (execution : CyclicReviewCompletion
        (cyclicWaitingState activation previousRoute) activation "exit"
        (cyclicPostCompletionState activation "exit")) :
      CyclicSelectedReachable (cyclicPostCompletionState activation "exit")
  | chooseExit (activation : Nat)
      (before : CyclicSelectedReachable
        (cyclicPostCompletionState activation "exit"))
      (execution : step cyclicProgram
        (cyclicPostCompletionState activation "exit")
        ⟨"operation:Choice"⟩ = some
          (cyclicPostChooseState activation "exit" ⟨"place:Flow_Exit"⟩)) :
      CyclicSelectedReachable
        (cyclicPostChooseState activation "exit" ⟨"place:Flow_Exit"⟩)
  | consumeNoneEnd (activation : Nat)
      (before : CyclicSelectedReachable
        (cyclicPostChooseState activation "exit" ⟨"place:Flow_Exit"⟩))
      (execution : step cyclicProgram
        (cyclicPostChooseState activation "exit" ⟨"place:Flow_Exit"⟩)
        ⟨"operation:End"⟩ = some (cyclicPostEndState activation "exit")) :
      CyclicSelectedReachable (cyclicPostEndState activation "exit")
  | completeRoot (activation : Nat)
      (before : CyclicSelectedReachable
        (cyclicPostEndState activation "exit"))
      (execution : step cyclicProgram (cyclicPostEndState activation "exit")
        ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩ =
          some (cyclicCompletedState activation "exit")) :
      CyclicSelectedReachable (cyclicCompletedState activation "exit")

theorem exact_initiation_is_actual_selected_reachable :
    CyclicSelectedReachable (cyclicWaitingState 1 none) :=
  .initialReview
    (.initialMerge
      (.initiate
        (.admitStart .initial representative_start_admission_is_exact)
        representative_start_operation_is_exact)
      representative_initial_merge_is_exact)
    representative_initial_review_is_exact

theorem actual_selected_reachability_preserves_active_unit_invariant
    (state : RuntimeState) (reachable : CyclicSelectedReachable state) :
    cyclicActiveUnitCount state ≤ 1 := by
  cases reachable <;>
    simp [cyclicActiveUnitCount, cyclicAdmittedStartState,
      cyclicPostStartState, cyclicInitialPostMergeState,
      cyclicWaitingState, cyclicPostCompletionState, cyclicPostChooseState,
      cyclicPostMergeState, cyclicPostEndState, cyclicCompletedState,
      singletonWaitingState, initialState, runningStartState]

theorem actual_selected_live_reachability_has_exactly_one_active_unit
    (state : RuntimeState) (reachable : CyclicSelectedReachable state)
    (running : state.control = .running cyclicInstanceId)
    (initiated : state.initiationPending = false)
    (beforeNoneEnd : state.endOccurrences = 0) :
    cyclicActiveUnitCount state = 1 := by
  cases reachable <;>
    simp [cyclicActiveUnitCount, cyclicAdmittedStartState,
      cyclicPostStartState, cyclicInitialPostMergeState,
      cyclicWaitingState, cyclicPostCompletionState, cyclicPostChooseState,
      cyclicPostMergeState, cyclicPostEndState, cyclicCompletedState,
      singletonWaitingState, initialState, runningStartState] at *

theorem actual_selected_reachability_excludes_every_multi_offer_witness :
    ¬ CyclicSelectedReachable cyclicTwoInputState ∧
      ¬ CyclicSelectedReachable cyclicSameInputMultiplicityTwoState ∧
      ¬ CyclicSelectedReachable cyclicDifferentOwnerState := by
  constructor
  · intro reachable
    have bound := actual_selected_reachability_preserves_active_unit_invariant
      _ reachable
    simp [cyclicActiveUnitCount, cyclicTwoInputState] at bound
  constructor
  · intro reachable
    have bound := actual_selected_reachability_preserves_active_unit_invariant
      _ reachable
    simp [cyclicActiveUnitCount, cyclicSameInputMultiplicityTwoState] at bound
  · intro reachable
    have bound := actual_selected_reachability_preserves_active_unit_invariant
      _ reachable
    simp [cyclicActiveUnitCount, cyclicDifferentOwnerState] at bound

/-- Exact external completion plus automatic internal traversal for every finite reviewed choice list. -/
inductive CyclicReviewedExecution :
    Nat → Option String → List CyclicReviewedChoice → RuntimeState → Prop where
  | nil (activation : Nat) (previousRoute : Option String) :
      CyclicReviewedExecution activation previousRoute []
        (cyclicWaitingState activation previousRoute)
  | cons (activation : Nat) (previousRoute : Option String)
      (choice : CyclicReviewedChoice) (remaining : List CyclicReviewedChoice)
      (final : RuntimeState)
      (completion : CyclicReviewCompletion
        (cyclicWaitingState activation previousRoute) activation choice.route
        (cyclicPostCompletionState activation choice.route))
      (closure : runChoices cyclicProgram
        (cyclicPostCompletionState activation choice.route)
        cyclicRepeatChoices = some
          (cyclicWaitingState (activation + 1) (some choice.route)))
      (rest : CyclicReviewedExecution (activation + 1) (some choice.route)
        remaining final) :
      CyclicReviewedExecution activation previousRoute
        (choice :: remaining) final

private theorem reviewed_execution_reaches_length_offset
    (activation : Nat) (previousRoute : Option String)
    (choices : List CyclicReviewedChoice) :
    ∃ route,
      CyclicReviewedExecution activation previousRoute choices
        (cyclicWaitingState (activation + choices.length) route) := by
  induction choices generalizing activation previousRoute with
  | nil =>
      exact ⟨previousRoute, by simpa using
        CyclicReviewedExecution.nil activation previousRoute⟩
  | cons choice remaining induction =>
      obtain ⟨route, rest⟩ :=
        induction (activation := activation + 1)
          (previousRoute := some choice.route)
      refine ⟨route, ?_⟩
      simpa [Nat.add_assoc, Nat.add_comm, Nat.add_left_comm] using
        CyclicReviewedExecution.cons activation previousRoute choice remaining
          (cyclicWaitingState ((activation + 1) + remaining.length) route)
          (representative_review_completion_is_exact activation
            previousRoute choice.route)
          (representative_reviewed_choice_closes_to_next_activation
            activation choice)
          rest

private theorem reviewed_execution_preserves_actual_reachability
    (activation : Nat) (previousRoute : Option String)
    (choices : List CyclicReviewedChoice) (final : RuntimeState)
    (before : CyclicSelectedReachable
      (cyclicWaitingState activation previousRoute))
    (execution : CyclicReviewedExecution activation previousRoute choices final) :
    CyclicSelectedReachable final := by
  induction execution with
  | nil => exact before
  | cons activation previousRoute choice remaining final completion closure rest induction =>
      have completed : CyclicSelectedReachable
          (cyclicPostCompletionState activation choice.route) :=
        .completeReview activation previousRoute choice before completion
      have chosen : CyclicSelectedReachable
          (cyclicPostChooseState activation choice.route choice.output) := by
        apply CyclicSelectedReachable.chooseReviewed activation choice completed
        cases choice with
        | repeatReview =>
            exact representative_choice_selects_repeat_for_every_activation activation
        | reworkReview =>
            exact representative_choice_selects_rework_for_every_activation activation
      have merged : CyclicSelectedReachable
          (cyclicPostMergeState activation choice.route) := by
        apply CyclicSelectedReachable.mergeReviewed activation choice chosen
        apply representative_merge_passes_selected_branch_for_every_activation
        cases choice <;> simp [CyclicReviewedChoice.output]
      have awaited : CyclicSelectedReachable
          (cyclicWaitingState (activation + 1) (some choice.route)) :=
        .awaitNextReview activation choice merged
          (representative_review_awaits_next_activation activation choice.route)
      exact induction awaited

def cyclicStartClosureTrace : List OperationId :=
  [⟨"operation:Start"⟩, ⟨"operation:Merge"⟩, ⟨"operation:Review"⟩]

def cyclicReviewedClosureTrace : List OperationId := cyclicRepeatChoices

def cyclicExitClosureTrace : List OperationId := cyclicExitChoices

/-- Material execution account for an arbitrary reviewed schedule followed by the exact default exit. -/
inductive CyclicReviewedThenExitExecution
    (choices : List CyclicReviewedChoice) (final : RuntimeState) : Prop where
  | performed (priorRoute : Option String)
      (admission : applyStimulus 0 cyclicProgram initialState
        cyclicStartStimulus = cyclicBoundedResult cyclicAdmittedStartState)
      (initialClosure : runChoices cyclicProgram cyclicAdmittedStartState
        cyclicStartClosureTrace = some (cyclicWaitingState 1 none))
      (reviewed : CyclicReviewedExecution 1 none choices
        (cyclicWaitingState (choices.length + 1) priorRoute))
      (completion : CyclicReviewCompletion
        (cyclicWaitingState (choices.length + 1) priorRoute)
        (choices.length + 1) "exit"
        (cyclicPostCompletionState (choices.length + 1) "exit"))
      (closure : runChoices cyclicProgram
        (cyclicPostCompletionState (choices.length + 1) "exit")
        cyclicExitChoices = some final) :
      CyclicReviewedThenExitExecution choices final

theorem every_finite_reviewed_schedule_reaches_next_activation_then_exits
    (choices : List CyclicReviewedChoice) :
    ∃ route,
      CyclicReviewedExecution 1 none choices
        (cyclicWaitingState (choices.length + 1) route) ∧
      CyclicReviewedThenExitExecution choices
        (cyclicCompletedState (choices.length + 1) "exit") := by
  obtain ⟨route, reviewed⟩ :=
    reviewed_execution_reaches_length_offset 1 none choices
  refine ⟨route, ?_, ?_⟩
  · simpa [Nat.add_comm] using reviewed
  · apply CyclicReviewedThenExitExecution.performed route
    · exact representative_start_admission_is_exact
    · simp [cyclicStartClosureTrace, runChoices,
        representative_start_operation_is_exact,
        representative_initial_merge_is_exact,
        representative_initial_review_is_exact]
    · simpa [Nat.add_comm] using reviewed
    · exact representative_review_completion_is_exact
        (choices.length + 1) route "exit"
    · exact representative_program_exits_after_any_finite_repeat_count
        (choices.length + 1)

theorem every_finite_reviewed_schedule_and_exit_is_actual_reachable
    (choices : List CyclicReviewedChoice) :
    CyclicSelectedReachable
      (cyclicCompletedState (choices.length + 1) "exit") := by
  obtain ⟨_, _, exited⟩ :=
    every_finite_reviewed_schedule_reaches_next_activation_then_exits choices
  obtain ⟨route, _, _, reviewed, completion, _⟩ := exited
  have waiting := reviewed_execution_preserves_actual_reachability 1 none choices
    (cyclicWaitingState (choices.length + 1) route)
    exact_initiation_is_actual_selected_reachable reviewed
  have completed : CyclicSelectedReachable
      (cyclicPostCompletionState (choices.length + 1) "exit") :=
    .completeForExit (choices.length + 1) route waiting completion
  have chosen : CyclicSelectedReachable
      (cyclicPostChooseState (choices.length + 1) "exit"
        ⟨"place:Flow_Exit"⟩) :=
    .chooseExit (choices.length + 1) completed
      (representative_choice_selects_exit_for_every_activation
        (choices.length + 1))
  have ended : CyclicSelectedReachable
      (cyclicPostEndState (choices.length + 1) "exit") :=
    .consumeNoneEnd (choices.length + 1) chosen
      (representative_none_end_consumes_the_only_token (choices.length + 1))
  exact .completeRoot (choices.length + 1) ended
    (representative_root_scope_completes_after_none_end (choices.length + 1))

/-- Actual representative automatic closures, with the exact operation sequence retained as evidence. -/
inductive CyclicAutomaticClosure :
    RuntimeState → List OperationId → RuntimeState → Prop where
  | start
      (execution : runChoices cyclicProgram cyclicAdmittedStartState
        cyclicStartClosureTrace = some (cyclicWaitingState 1 none)) :
      CyclicAutomaticClosure cyclicAdmittedStartState cyclicStartClosureTrace
        (cyclicWaitingState 1 none)
  | reviewed (activation : Nat) (choice : CyclicReviewedChoice)
      (execution : runChoices cyclicProgram
        (cyclicPostCompletionState activation choice.route)
        cyclicReviewedClosureTrace = some
          (cyclicWaitingState (activation + 1) (some choice.route))) :
      CyclicAutomaticClosure
        (cyclicPostCompletionState activation choice.route)
        cyclicReviewedClosureTrace
        (cyclicWaitingState (activation + 1) (some choice.route))
  | exit (activation : Nat)
      (execution : runChoices cyclicProgram
        (cyclicPostCompletionState activation "exit")
        cyclicExitClosureTrace = some (cyclicCompletedState activation "exit")) :
      CyclicAutomaticClosure (cyclicPostCompletionState activation "exit")
        cyclicExitClosureTrace (cyclicCompletedState activation "exit")

theorem representative_automatic_closure_follows_cut_dag_without_revisit
    (before after : RuntimeState) (trace : List OperationId)
    (closure : CyclicAutomaticClosure before trace after) :
    DirectedPath cyclicProgramCutEdges trace ∧
      trace.Nodup ∧ trace.length ≤ 6 := by
  cases closure <;>
    simp [DirectedPath, directedPathEdges, cyclicProgramCutEdges,
      cyclicProgramEdges, cyclicStartClosureTrace, cyclicReviewedClosureTrace,
      cyclicExitClosureTrace, cyclicRepeatChoices, cyclicExitChoices]

theorem representative_start_automatic_closure_is_material :
    CyclicAutomaticClosure cyclicAdmittedStartState cyclicStartClosureTrace
      (cyclicWaitingState 1 none) := by
  apply CyclicAutomaticClosure.start
  simp [cyclicStartClosureTrace, runChoices,
    representative_start_operation_is_exact,
    representative_initial_merge_is_exact,
    representative_initial_review_is_exact]

theorem representative_reviewed_automatic_closure_is_material
    (activation : Nat) (choice : CyclicReviewedChoice) :
    CyclicAutomaticClosure
      (cyclicPostCompletionState activation choice.route)
      cyclicReviewedClosureTrace
      (cyclicWaitingState (activation + 1) (some choice.route)) := by
  apply CyclicAutomaticClosure.reviewed
  exact representative_reviewed_choice_closes_to_next_activation
    activation choice

theorem representative_exit_automatic_closure_is_material (activation : Nat) :
    CyclicAutomaticClosure (cyclicPostCompletionState activation "exit")
      cyclicExitClosureTrace (cyclicCompletedState activation "exit") := by
  apply CyclicAutomaticClosure.exit
  exact representative_program_exits_after_any_finite_repeat_count activation

end BpmnSemantics.SemanticProcess
