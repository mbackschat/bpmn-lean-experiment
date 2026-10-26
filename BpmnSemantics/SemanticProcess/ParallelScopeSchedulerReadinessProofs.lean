module

import BpmnSemantics.SemanticProcess.ParallelScopeBatchArmingProofs
import BpmnSemantics.SemanticProcess.ParallelScopeBatchIdentityProofs
import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.ParallelScopeProgress
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import BpmnSemantics.SemanticProcess.InternalTransitionAlternativeOrder
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierCorrespondenceProofs
public import BpmnSemantics.SemanticProcess.TransitionTrace

/-! # Reserved parallel batch readiness at scheduler selection

PMIS-SELECT-01 selects a retained complete batch without consuming an external
choice. Command provenance separates completed commands from speculative scheduler
prefixes, because the accounting histories permit ingress between replay steps.
Application readiness, reachable-frontier classification and publication acceptance
remain separate.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- A retained scheduler batch is the actual successful preparation at its exact predecessor. -/
theorem deriveInternalExecutionFrontier_batch_prepared (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch)
    (reserved : (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch) :
    prepareInternalOccurrenceBatch? program state = some batch := by
  cases control : state.control <;> simp only [deriveInternalExecutionFrontier, control] at reserved <;> try contradiction
  all_goals
    split at reserved
    · contradiction
    · exact reserved

/-- Selecting a retained complete reservation preserves the entire frontier and consumes no choice directive. -/
theorem selectInternalExecutionFrontier_reserved_offers (mode : InternalSchedulingMode) (ordinal : Nat)
    (schedule : InternalChoiceSchedule) (frontier : InternalExecutionFrontier)
    (offers : List InternalExecutionOffer) (remaining : InternalChoiceSchedule) (consumed : Bool)
    (batch : InternalOccurrenceBatch) (reserved : frontier.occurrenceBatch = some batch)
    (selected : selectInternalExecutionFrontier mode ordinal schedule frontier = .execute offers remaining consumed) :
    offers = frontier.offers ∧ remaining = schedule ∧ consumed = false := by
  simp only [selectInternalExecutionFrontier, reserved, Option.isSome_some, ↓reduceIte] at selected
  split at selected
  · contradiction
  · cases selected; exact ⟨rfl, rfl, rfl⟩

/-- A retained PMIS reservation cannot carry discovery failure or duplicate exact alternatives when declaration identities are unique. -/
theorem deriveInternalExecutionFrontier_reserved_unambiguous (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (batch : InternalOccurrenceBatch)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (running : state.control = .running instanceId)
    (unique : (program.operations.map (fun operation => operation.id.value)).Nodup)
    (reserved : (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch) :
    (deriveInternalExecutionFrontier program state).preparationFailed = false := by
  have prepared := deriveInternalExecutionFrontier_batch_prepared program state batch reserved
  obtain ⟨pairs, discovered, _⟩ := prepareInternalOccurrenceBatch_member_candidates program state batch prepared
  have ordered := deriveInternalOccurrenceFrontier_ordered program state pairs unique discovered
  rw [← deriveInternalExecutionFrontier_occurrence_exact_order program state instanceId pairs
    profile running unique discovered] at ordered
  have distinct : (deriveInternalExecutionFrontier program state).offers.Pairwise
      (fun left right => left.alternative ≠ right.alternative) := by
    apply List.pairwise_map.mp
    exact ordered.imp (fun less same => by
      subst same
      exact Bool.noConfusion ((internalAlternativeBefore_asymm _ _ less).symm.trans less))
  simp only [deriveInternalExecutionFrontier, running] at reserved distinct ⊢
  split at reserved
  · contradiction
  · rename_i valid
    simp only [Bool.or_eq_true, not_or] at valid
    simp only [Bool.eq_false_iff.mpr valid.2, decide_eq_true distinct, Bool.not_true, Bool.or_self]

/-- A retained batch reaches its actual final successor, charges every member against fuel, and leaves directives untouched. Later closure and publication may still fail independently. -/
theorem closeScheduledTraced_reserved_batch_step (fuel : Nat) (program : Program)
    (commandId instanceId : SemanticId) (index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (state : RuntimeState) (batch : InternalOccurrenceBatch)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (running : state.control = .running instanceId)
    (wellFormed : programWellFormed program = true)
    (noCompensation : state.compensationHandlerEffectWaits = [])
    (reserved : (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch)
    (enough : batch.members.length ≤ fuel + 1) :
    ∃ (successors : List RuntimeState) (nonempty : successors ≠ []),
      applyInternalOccurrenceBatch? program state batch = some successors ∧
      successors.length = batch.members.length ∧
      (closeScheduledTraced (fuel + 1) program commandId index ordinal schedule state).state =
        (closeScheduledTraced (fuel + 1 - batch.members.length) program commandId
          (index + batch.members.length) ordinal schedule (successors.getLast nonempty)).state ∧
      (closeScheduledTraced (fuel + 1) program commandId index ordinal schedule state).failed =
        (closeScheduledTraced (fuel + 1 - batch.members.length) program commandId
          (index + batch.members.length) ordinal schedule (successors.getLast nonempty)).failed := by
  have prepared := deriveInternalExecutionFrontier_batch_prepared program state batch reserved
  have unique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have unambiguous := deriveInternalExecutionFrontier_reserved_unambiguous program state instanceId batch
    profile running unique reserved
  have aligned := prepareInternalOccurrenceBatch_frontier_alternatives program state instanceId batch
    profile running unique prepared
  obtain ⟨successors, applied, length⟩ := preparedOccurrenceBatch_applies program state batch
    prepared wellFormed noCompensation
  have size := (prepareInternalOccurrenceBatch_certificate program state batch prepared).2.2.2.1
  have nonempty : successors ≠ [] := by intro empty; simp [empty] at length; omega
  have frontierLength : (deriveInternalExecutionFrontier program state).offers.length = batch.members.length := by
    simpa only [List.length_map] using congrArg List.length aligned
  have selected : selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program state) =
      .execute (deriveInternalExecutionFrontier program state).offers schedule false := by
    simp only [selectInternalExecutionFrontier, unambiguous, reserved, Option.isSome_some,
      Bool.false_eq_true, ↓reduceIte]
  obtain ⟨step, executed, final⟩ := executeSelectedFrontier_reserved_batch_ready program commandId
    index state (deriveInternalExecutionFrontier program state)
    (deriveInternalExecutionFrontier program state).offers batch successors reserved aligned applied nonempty
  cases offersEq : (deriveInternalExecutionFrontier program state).offers with
  | nil => simp only [offersEq, List.length_nil] at frontierLength; omega
  | cons first rest =>
      have restBound : rest.length ≤ fuel := by
        simp only [offersEq, List.length_cons] at frontierLength
        omega
      have frontierNonempty : (deriveInternalExecutionFrontier program state).offers.isEmpty = false := by
        simp only [offersEq, List.isEmpty_cons]
      rw [offersEq] at selected executed
      have progress := closeScheduledTraced_selected_step fuel program commandId index ordinal
        schedule schedule state first rest false step frontierNonempty selected restBound executed
      have count : rest.length + 1 = batch.members.length := by
        simpa only [offersEq, List.length_cons] using frontierLength
      have fuelEq : fuel - rest.length = fuel + 1 - batch.members.length := by omega
      have indexEq : index + rest.length + 1 = index + batch.members.length := by omega
      refine ⟨successors, nonempty, applied, length, ?_⟩
      simpa only [fuelEq, indexEq, Bool.false_eq_true, ↓reduceIte, Nat.add_zero, final] using progress

end BpmnSemantics.SemanticProcess.InternalCommutation

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- Every state-changing admission in the selected PMIS grammar reports commitment;
rejection and semantic failure retain the exact supplied predecessor. -/
theorem parallelScope_admission_commits_or_preserves_state (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (before : RuntimeState) (stimulus : Stimulus) :
    (admitStimulus program before stimulus).outcome = .committed ∨
      (admitStimulus program before stimulus).state = before := by
  cases stimulus
  case startProcess commandId processId instanceId values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;>
        simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first | exact Or.inl rfl | exact Or.inr rfl | split
  case completeUserTaskInstance commandId taskId values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;>
        simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first | exact Or.inl rfl | exact Or.inr rfl | split
  case completeEffect commandId effectId result =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;>
        simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first | exact Or.inl rfl | exact Or.inr rfl | split
  all_goals
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases analysis : ParallelScopeStart.analyzeProgram program <;>
        simp [admitStimulus, snapshot, ParallelScopeCommand.stimulusAdmitted, selected, analysis]

private theorem scheduledClosure_commits_or_preserves_state (before : RuntimeState)
    (closed : ScheduledClosureResult) :
    (StimulusResult.ofScheduledClosure before closed).outcome = .committed ∨
      (StimulusResult.ofScheduledClosure before closed).state = before := by
  unfold StimulusResult.ofScheduledClosure
  split
  · exact Or.inr rfl
  · unfold StimulusResult.ofClosure
    split <;> simp_all

/-- Actual PMIS command evaluation includes failed admission and atomic closure
rollback; neither exposes a speculative admitted or partially executed state. -/
theorem parallelScope_applyStimulus_commits_or_preserves_state (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (fuel : Nat) (before : RuntimeState) (stimulus : Stimulus) :
    (applyStimulus fuel program before stimulus).outcome = .committed ∨
      (applyStimulus fuel program before stimulus).state = before := by
  have admitted := parallelScope_admission_commits_or_preserves_state program selected before stimulus
  cases outcome : (admitStimulus program before stimulus).outcome
  case committed =>
    simpa only [applyStimulus, outcome] using scheduledClosure_commits_or_preserves_state before
      (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
        (admitStimulus program before stimulus).state)
  all_goals
    rcases admitted with committed | unchanged
    · simp only [outcome] at committed
      contradiction
    · exact Or.inr (by simpa only [applyStimulus, outcome] using unchanged)

/-- Accepted Start binds the raw running state and capacity to the exact submitted values. -/
theorem parallelScope_committed_start_exact (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (commandId processId instanceId : SemanticId) (values : List VariableBinding)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId values)).outcome = .committed) :
    runningProgramStartState? program instanceId values = some (admitStimulus program initialState
      (.startProcess commandId processId instanceId values)).state ∧
    ∃ capacity, ParallelScopeStart.programStartCapacity program values = some capacity := by
  have snapshots := (admitStimulus_committed_start_shape program
    (.startProcess commandId processId instanceId values) instanceId rfl committed).1
  have accepted : ParallelScopeCommand.stimulusAdmitted program initialState
      (.startProcess commandId processId instanceId values) = true := by
    cases checked : ParallelScopeCommand.stimulusAdmitted program initialState
        (.startProcess commandId processId instanceId values) with
    | false => simp [admitStimulus, snapshots, checked] at committed
    | true => rfl
  have capacity : ∃ capacity, ParallelScopeStart.programStartCapacity program values = some capacity := by
    simp only [ParallelScopeCommand.stimulusAdmitted, selected, Bool.not_true,
      Bool.false_eq_true, ↓reduceIte] at accepted
    split at accepted <;> try contradiction
    split at accepted <;> try contradiction
    have some := (Bool.and_eq_true_iff.mp accepted).2
    exact Option.isSome_iff_exists.mp some
  refine ⟨?_, capacity⟩
  simp [admitStimulus, snapshots, initialState] at committed ⊢
  all_goals repeat' (split at committed <;> simp_all)

/-- Boundaries arise from complete actual command evaluations, including unchanged
rejection and rollback, rather than arbitrary admission or internal replay. -/
inductive ParallelScopeCommandBoundaryReachable (program : Program) : RuntimeState → Prop where
  | initial : ParallelScopeCommandBoundaryReachable program initialState
  | command (before : RuntimeState) (fuel : Nat) (stimulus : Stimulus)
      (reachable : ParallelScopeCommandBoundaryReachable program before) :
      ParallelScopeCommandBoundaryReachable program (applyStimulus fuel program before stimulus).state

/-- The pre-Start state is explicit; every other actual PMIS boundary is a complete
stable frontier. No successful future closure is assumed. -/
theorem ParallelScopeCommandBoundaryReachable.initial_or_stable (program : Program)
    (selected : ParallelScopeStart.programSelected program = true) (state : RuntimeState)
    (reachable : ParallelScopeCommandBoundaryReachable program state) :
    state = initialState ∨
      ((deriveInternalExecutionFrontier program state).offers.isEmpty &&
        !(deriveInternalExecutionFrontier program state).preparationFailed) = true := by
  induction reachable with
  | initial => exact Or.inl rfl
  | command before fuel stimulus reachable ih =>
    rcases parallelScope_applyStimulus_commits_or_preserves_state program selected fuel before stimulus with
      committed | unchanged
    · exact Or.inr (applyStimulus_committed_frontier_stable fuel program before stimulus committed)
    · rw [unchanged]
      exact ih

theorem ParallelScopeCommandBoundaryReachable.running_stable (program : Program)
    (selected : ParallelScopeStart.programSelected program = true) (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (reachable : ParallelScopeCommandBoundaryReachable program state) :
    ((deriveInternalExecutionFrontier program state).offers.isEmpty &&
      !(deriveInternalExecutionFrontier program state).preparationFailed) = true := by
  rcases reachable.initial_or_stable program selected state with initial | stable
  · subst state
    simp [initialState] at running
  · exact stable

/-- Prefixes start only at accepted ingress from a completed command boundary.
Each later constructor retains the real whole-frontier selection and its actual
singleton or complete reserved-batch application; there is no prefix ingress. -/
inductive ParallelScopeInternalPrefixReachable (program : Program) : RuntimeState → Prop where
  | admitted (before : RuntimeState) (stimulus : Stimulus)
      (reachable : ParallelScopeCommandBoundaryReachable program before)
      (committed : (admitStimulus program before stimulus).outcome = .committed) :
      ParallelScopeInternalPrefixReachable program (admitStimulus program before stimulus).state
  | singleton (before after : RuntimeState) (ordinal : Nat)
      (schedule remaining : InternalChoiceSchedule) (consumed : Bool)
      (offer : InternalExecutionOffer) (candidate : InternalOperationOccurrence)
      (reachable : ParallelScopeInternalPrefixReachable program before)
      (selected : selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
        (deriveInternalExecutionFrontier program before) = .execute [offer] remaining consumed)
      (alternative : offer.alternative = .operationOccurrence candidate.operationId candidate.owner)
      (applied : applyInternalOperationOccurrence? program before candidate = some after) :
      ParallelScopeInternalPrefixReachable program after
  | batch (before after : RuntimeState) (ordinal : Nat)
      (schedule remaining : InternalChoiceSchedule) (consumed : Bool)
      (offers : List InternalExecutionOffer) (batch : InternalOccurrenceBatch)
      (successors : List RuntimeState)
      (reachable : ParallelScopeInternalPrefixReachable program before)
      (selected : selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
        (deriveInternalExecutionFrontier program before) = .execute offers remaining consumed)
      (reserved : (deriveInternalExecutionFrontier program before).occurrenceBatch = some batch)
      (alternatives : offers.map (·.alternative) = batch.members.map (fun patch =>
        InternalAlternative.operationOccurrence patch.operation.id patch.owner))
      (applied : applyInternalOccurrenceBatch? program before batch = some successors)
      (endpoint : successors.getLast? = some after) :
      ParallelScopeInternalPrefixReachable program after

/-- Every actual closure outcome retains prefix provenance through whole selected
steps, even when fuel exhaustion or missing publication suppresses its records. -/
theorem closeScheduledTraced_parallelScope_prefix_reachable (program : Program)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (commandId : SemanticId) (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) :
    ∃ spent ≤ fuel, ParallelScopeInternalPrefixReachable program
      (closeScheduledTraced fuel program commandId index ordinal schedule state).state := by
  apply closeScheduledTraced_prefix_induction program commandId
    (fun _ current => ParallelScopeInternalPrefixReachable program current) _
    fuel index ordinal schedule state reachable
  intro currentIndex currentOrdinal currentSchedule before offers remaining consumed step
    preceding nonempty selected executed
  rcases executeSelectedFrontier_parallel_scope_steps program commandId currentIndex currentOrdinal
    currentSchedule before offers remaining consumed step profile nonempty selected executed with
    ⟨offer, candidate, shape, _, alternative, applied, _⟩ |
      ⟨batch, successors, reserved, applied, _, endpoint, alternatives, _⟩
  · rw [shape] at selected
    exact ParallelScopeInternalPrefixReachable.singleton before step.state currentOrdinal
      currentSchedule remaining consumed offer candidate preceding selected alternative applied
  · exact ParallelScopeInternalPrefixReachable.batch before step.state currentOrdinal currentSchedule
      remaining consumed offers batch successors preceding selected reserved alternatives applied endpoint

/-- Actual accepted ingress and actual closure compose directly into prefix
provenance; a syntax admission check alone cannot construct this witness. -/
theorem applyStimulus_parallelScope_closure_prefix_reachable (program : Program)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (before : RuntimeState) (stimulus : Stimulus) (fuel : Nat)
    (boundary : ParallelScopeCommandBoundaryReachable program before)
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    ∃ spent ≤ fuel, ParallelScopeInternalPrefixReachable program
      (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
        (admitStimulus program before stimulus).state).state :=
  closeScheduledTraced_parallelScope_prefix_reachable program profile (stimulusCommandId stimulus)
    fuel 1 0 [] _ (ParallelScopeInternalPrefixReachable.admitted before stimulus boundary committed)

/-- In particular the interrupted-Start separator, whose Running frontier has
multiple offers, cannot be the result of any completed command history. -/
theorem parallelScope_multiple_running_offers_not_command_boundary (program : Program)
    (selected : ParallelScopeStart.programSelected program = true) (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (multiple : 2 ≤ (deriveInternalExecutionFrontier program state).offers.length) :
    ¬ ParallelScopeCommandBoundaryReachable program state := by
  intro reachable
  have stable := reachable.running_stable program selected state instanceId running
  have empty := (Bool.and_eq_true_iff.mp stable).1
  cases offers : (deriveInternalExecutionFrontier program state).offers with
  | nil => simp only [offers, List.length_nil] at multiple; omega
  | cons first rest => simp only [offers, List.isEmpty_cons, Bool.false_eq_true] at empty


/-- Actual completed-command reachability supplies the stable predecessor for the sibling read boundary. The subsequent state need not itself be stable or have accepted publication. -/
theorem ParallelScopeCommandBoundaryReachable.body_refusal_of_token_frame
    (program : Program) (before after : RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : before.control = .running instanceId)
    (reachable : ParallelScopeCommandBoundaryReachable program before)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (control : after.control = before.control) (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (counts : ∀ place, (after.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length =
      (before.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length) :
    applyInternalOperationOccurrence? program after candidate = none := by
  have stable := reachable.running_stable program (by simp [ParallelScopeStart.programSelected, profile]) before instanceId running
  have boundary : (deriveInternalExecutionFrontier program before).offers = [] ∧
      (deriveInternalExecutionFrontier program before).preparationFailed = false := by
    simpa using stable
  exact stable_frontier_body_refusal_of_token_frame program before after profile candidate operation resolved bodyKind
    boundary.1 boundary.2 control scopes counts

end BpmnSemantics.SemanticProcess
