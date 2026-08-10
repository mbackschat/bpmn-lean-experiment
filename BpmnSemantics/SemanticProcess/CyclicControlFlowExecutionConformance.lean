import BpmnSemantics.SemanticProcess.CyclicControlFlowConformance
import BpmnSemantics.SemanticProcess.GraphReachabilityLaws

/-! # Representative cyclic execution conformance

This module owns exact representative execution and finite reviewed-choice schedules for the selected cyclic fixture. It proves no general termination, fairness, arbitrary-cycle, or concurrent-arrival claim.
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

end BpmnSemantics.SemanticProcess
