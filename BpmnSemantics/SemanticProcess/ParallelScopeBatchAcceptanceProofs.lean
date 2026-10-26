module

import BpmnSemantics.SemanticProcess.ParallelScopeReservedTokenProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReservedAnchorProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierCorrespondenceProofs
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierReservationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeWaitReadiness
public import BpmnSemantics.SemanticProcess.ParallelScopeSchedulerReadinessProofs
import BpmnSemantics.SemanticProcess.ParallelScopeCommandPhaseProofs
import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs

/-! # Complete ordinary frontier acceptance

PMIS-SELECT-01 checks the complete reservation against one predecessor. Actual
reachability and admission discharge its collision, identity and numeric gates;
the ordinary-frontier classification remains an explicit boundary.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- A complete reservation from actual discovery passes every collective gate once the frontier has at least two members. -/
theorem ParallelScopeInternalPrefixReachable.reserved_batch_accepted (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (multiple : 2 ≤ pairs.length) (members : List InternalOccurrencePatch)
    (reserved : reserveOccurrenceMembers? program state [] (pairs.map Prod.fst) = some members) :
    acceptOccurrenceBatch? program state members = some { program, predecessor := state, members } := by
  have length := (reserveOccurrenceMembers_trace program state [] (pairs.map Prod.fst) members reserved).length
    program state [] members (pairs.map Prod.fst)
  have enough : 2 ≤ members.length := by
    simp only [List.length_nil, List.length_map, Nat.zero_add] at length
    omega
  have separate := reachable.reserved_token_keys_disjoint program analysis analyzed state instanceId running pairs discovered members reserved
  have anchors := reserved_members_wait_anchors_unique program analysis analyzed state (pairs.map Prod.fst) members reserved
  have ordinals := reserved_members_wait_ordinals program state (pairs.map Prod.fst) members reserved
  have increments := reachable.reserved_end_sum_safe program analysis analyzed state instanceId running pairs discovered members reserved
  simp only [acceptOccurrenceBatch?, enough, separate, anchors, decide_true, ordinals, increments,
    Bool.or_true, Bool.and_self, ite_true]

/-- Every reachable, classified ordinary frontier with at least two offers prepares a complete batch; neither reservation nor acceptance is assumed. -/
theorem ParallelScopeInternalPrefixReachable.ordinary_frontier_batch_prepared (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (multiple : 2 ≤ pairs.length)
    (classified : ∀ pair ∈ pairs, ∀ operation,
      resolveInternalOperationOccurrence? program state pair.1 = some operation →
      operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]) :
    ∃ batch, prepareInternalOccurrenceBatch? program state = some batch ∧ batch.members.length = pairs.length := by
  obtain ⟨members, reserved, length⟩ := reachable.ordinary_frontier_reserves program analysis analyzed state instanceId running pairs discovered classified
  have accepted := reachable.reserved_batch_accepted program analysis analyzed state instanceId running pairs discovered multiple members reserved
  have valid := reachable.reservation_valid program analysis analyzed state
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  refine ⟨{ program, predecessor := state, members }, ?_, length⟩
  simpa only [prepareInternalOccurrenceBatch?, profile, bne_self_eq_false, valid, Bool.not_true,
    Bool.or_self, Bool.false_eq_true, ite_false, discovered, bind, Option.bind_some, reserved] using accepted

private theorem mapM_all_success (values : List α) (project : α → Option β)
    (results : List β) (mapped : values.mapM project = some results) :
    ∀ value ∈ values, ∃ result, project value = some result := by
  induction values generalizing results with
  | nil => simp
  | cons head tail ih =>
      simp only [List.mapM_cons, bind] at mapped
      obtain ⟨first, found, rest⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨remaining, mapped, _⟩ := Option.bind_eq_some_iff.mp rest
      intro value member
      rcases List.mem_cons.mp member with rfl | later
      · exact ⟨first, found⟩
      · exact ih remaining mapped value later

private theorem successful_discovery_members (program : Program) (state : RuntimeState)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs) :
    ∀ operation ∈ program.operations, ∃ piece,
      internalOperationOccurrenceOffers? program state operation = some piece := by
  unfold deriveInternalOccurrenceFrontier? at discovered
  obtain ⟨pieces, mapped, _⟩ := Option.bind_eq_some_iff.mp discovered
  intro operation member
  exact mapM_all_success _ _ pieces mapped operation ((mem_sortBy _ _ _).mpr member)

private theorem discovery_fold_clean (operations : List SemanticOperation)
    (next : SemanticOperation → InternalExecutionFrontier) (initial : InternalExecutionFrontier)
    (clean : ∀ operation ∈ operations, (next operation).preparationFailed = false)
    (valid : initial.preparationFailed = false) :
    (operations.foldl (fun frontier operation => { frontier with
      offers := frontier.offers ++ (next operation).offers
      preparationFailed := frontier.preparationFailed || (next operation).preparationFailed }) initial).preparationFailed = false := by
  induction operations generalizing initial with
  | nil => exact valid
  | cons head tail ih =>
      rw [List.foldl_cons]
      exact ih _ (fun operation member => clean operation (by simp [member]))
        (by simp only [valid, clean head (by simp), Bool.or_self])

/-- Successful ordinary discovery installs the constructed batch into the actual scheduler frontier, with no retained-batch premise. -/
theorem ParallelScopeInternalPrefixReachable.ordinary_frontier_batch_installed (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (multiple : 2 ≤ pairs.length)
    (classified : ∀ pair ∈ pairs, ∀ operation,
      resolveInternalOperationOccurrence? program state pair.1 = some operation →
      operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]) :
    ∃ batch, (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch ∧
      batch.members.length = pairs.length ∧ (deriveInternalExecutionFrontier program state).preparationFailed = false := by
  obtain ⟨batch, prepared, length⟩ := reachable.ordinary_frontier_batch_prepared program analysis analyzed state instanceId running pairs discovered multiple classified
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  have count := deriveInternalExecutionFrontier_occurrence_length program state instanceId pairs profile running discovered
  have many : ¬(deriveInternalExecutionFrontier program state).offers.length < 2 := by omega
  have installed : (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch := by
    simp only [deriveInternalExecutionFrontier, running] at many ⊢
    generalize aggregation : program.operations.foldl _ ({} : InternalExecutionFrontier) = aggregate at many ⊢
    have clean : aggregate.preparationFailed = false := by
      rw [← aggregation]
      apply discovery_fold_clean
      · intro operation member
        obtain ⟨piece, offered⟩ := successful_discovery_members program state pairs discovered operation member
        cases operation
        case mergeExclusive => simp [internalOperationOccurrenceOffers?] at offered
        all_goals simp [ordinaryExecutionFrontier, profile, offered]
      · rfl
    rw [clean]
    simp only [many, decide_false, Bool.or_self, Bool.false_eq_true, ite_false, prepared]
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).1
  have unique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  exact ⟨batch, installed, length,
    deriveInternalExecutionFrontier_reserved_unambiguous program state instanceId batch profile running unique installed⟩

/-- An ordinary multi-offer frontier advances through every reserved member with exactly its admitted fuel charge. Later closure and publication remain separate. -/
theorem ParallelScopeInternalPrefixReachable.ordinary_frontier_advances (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (multiple : 2 ≤ pairs.length)
    (classified : ∀ pair ∈ pairs, ∀ operation,
      resolveInternalOperationOccurrence? program state pair.1 = some operation →
      operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (commandId : SemanticId) (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (enough : pairs.length ≤ fuel + 1) :
    ∃ batch successors, (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch ∧
      applyInternalOccurrenceBatch? program state batch = some successors ∧
      successors.length = pairs.length ∧ ∃ nonempty : successors ≠ [],
      (closeScheduledTraced (fuel + 1) program commandId index ordinal schedule state).state =
        (closeScheduledTraced (fuel + 1 - pairs.length) program commandId
          (index + pairs.length) ordinal schedule (successors.getLast nonempty)).state ∧
      (closeScheduledTraced (fuel + 1) program commandId index ordinal schedule state).failed =
        (closeScheduledTraced (fuel + 1 - pairs.length) program commandId
          (index + pairs.length) ordinal schedule (successors.getLast nonempty)).failed := by
  obtain ⟨batch, installed, length, _⟩ := reachable.ordinary_frontier_batch_installed program analysis analyzed state instanceId running pairs discovered multiple classified
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).1
  obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis analyzed state
  obtain ⟨successors, nonempty, applied, count, advanced⟩ := closeScheduledTraced_reserved_batch_step fuel program commandId instanceId index ordinal schedule state batch
    profile running wellFormed absent installed (by simpa only [length] using enough)
  exact ⟨batch, successors, installed, applied, count.trans length, nonempty, by simpa only [length] using advanced⟩

end BpmnSemantics.SemanticProcess
