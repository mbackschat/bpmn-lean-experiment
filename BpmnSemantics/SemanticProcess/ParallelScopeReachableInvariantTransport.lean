module

public import BpmnSemantics.SemanticProcess.ParallelScopeSchedulerReadinessProofs

/-! Actual PMIS command boundaries and internal prefixes share one invariant
transport. Handlers consume predecessor invariants and actual evaluator results;
rejected and rolled-back commands retain the predecessor. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

private theorem closure_invariant_transport (program : Program)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (predicate : RuntimeState → Prop)
    (singleton : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ candidate, predicate before → applyInternalOperationOccurrence? program before candidate = some after → predicate after)
    (batch : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ batch successors, predicate before → applyInternalOccurrenceBatch? program before batch = some successors →
        successors.getLast? = some after → predicate after)
    (commandId : SemanticId) (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (prior : predicate state) :
    ParallelScopeInternalPrefixReachable program
        (closeScheduledTraced fuel program commandId index ordinal schedule state).state ∧
      predicate (closeScheduledTraced fuel program commandId index ordinal schedule state).state := by
  have result := closeScheduledTraced_prefix_induction program commandId
    (fun _ current => ParallelScopeInternalPrefixReachable program current ∧ predicate current) (by
      intro position nextOrdinal nextSchedule before offers remaining consumed step preceding nonempty chosen executed
      rcases executeSelectedFrontier_parallel_scope_steps program commandId position nextOrdinal nextSchedule before
        offers remaining consumed step profile nonempty chosen executed with
        ⟨offer, candidate, shape, _, alternative, applied, _⟩ |
          ⟨reservedBatch, successors, reserved, applied, _, endpoint, alternatives, _⟩
      · rw [shape] at chosen
        exact ⟨.singleton before step.state nextOrdinal nextSchedule remaining consumed offer candidate preceding.1
          chosen alternative applied, singleton before step.state preceding.1 candidate preceding.2 applied⟩
      · exact ⟨.batch before step.state nextOrdinal nextSchedule remaining consumed offers reservedBatch successors
          preceding.1 chosen reserved alternatives applied endpoint,
          batch before step.state preceding.1 reservedBatch successors preceding.2 applied endpoint⟩)
    fuel index ordinal schedule state ⟨reachable, prior⟩
  exact result.choose_spec.2

/-- Complete actual commands transport an invariant that accepted ingress establishes, including
unchanged rejection and rollback. The explicit pre-Start state need not satisfy it. -/
private theorem boundary_invariant_and_provenance (program : Program)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (predicate : RuntimeState → Prop)
    (ingress : ∀ before, ParallelScopeCommandBoundaryReachable program before → ∀ stimulus,
      (before = initialState ∨ predicate before) → (admitStimulus program before stimulus).outcome = .committed →
        predicate (admitStimulus program before stimulus).state)
    (singleton : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ candidate, predicate before → applyInternalOperationOccurrence? program before candidate = some after → predicate after)
    (batch : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ batch successors, predicate before → applyInternalOccurrenceBatch? program before batch = some successors →
        successors.getLast? = some after → predicate after)
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state) :
    (state = initialState ∨ ParallelScopeInternalPrefixReachable program state) ∧
      (state = initialState ∨ predicate state) := by
  have selected : ParallelScopeStart.programSelected program = true := by
    simp [ParallelScopeStart.programSelected, profile]
  induction reachable with
  | initial => exact ⟨Or.inl rfl, Or.inl rfl⟩
  | command before fuel stimulus boundary ih =>
    rcases parallelScope_applyStimulus_commits_or_preserves_state program selected fuel before stimulus with committed | unchanged
    · cases outcome : (admitStimulus program before stimulus).outcome <;>
        simp only [applyStimulus, outcome] at committed ⊢ <;> try contradiction
      have preserved := closure_invariant_transport program profile predicate singleton batch
        (stimulusCommandId stimulus) fuel 1 0 [] _ (.admitted before stimulus boundary outcome)
        (ingress before boundary stimulus ih.2 outcome)
      unfold StimulusResult.ofScheduledClosure at committed ⊢
      split at committed
      · simp at committed
      · rename_i accepted
        simp only [ite_eq_right accepted]
        unfold StimulusResult.ofClosure at committed ⊢
        split at committed
        · simp at committed
        · rename_i successful
          simp only [ite_eq_right successful]
          exact ⟨Or.inr preserved.1, Or.inr preserved.2⟩
    · rw [unchanged]; exact ih

/-- Complete commands expose actual prefix provenance or retain the explicit initial state. -/
theorem ParallelScopeCommandBoundaryReachable.initial_or_prefix (program : Program)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state) :
    state = initialState ∨ ParallelScopeInternalPrefixReachable program state :=
  (boundary_invariant_and_provenance program profile (fun _ => True)
    (by intros; trivial) (by intros; trivial) (by intros; trivial) state reachable).1

/-- Complete actual commands either retain the explicit pre-Start state or satisfy an invariant
that accepted ingress establishes and actual singleton or reserved-batch steps preserve. -/
theorem ParallelScopeCommandBoundaryReachable.initial_or_invariant (program : Program)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (predicate : RuntimeState → Prop)
    (ingress : ∀ before, ParallelScopeCommandBoundaryReachable program before → ∀ stimulus,
      (before = initialState ∨ predicate before) → (admitStimulus program before stimulus).outcome = .committed →
        predicate (admitStimulus program before stimulus).state)
    (singleton : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ candidate, predicate before → applyInternalOperationOccurrence? program before candidate = some after → predicate after)
    (batch : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ batch successors, predicate before → applyInternalOccurrenceBatch? program before batch = some successors →
        successors.getLast? = some after → predicate after)
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state) :
    state = initialState ∨ predicate state :=
  (boundary_invariant_and_provenance program profile predicate ingress singleton batch state reachable).2

/-- Accepted ingress and actual singleton or reserved-batch prefixes carry an invariant that ingress
establishes from the pre-Start state or from an earlier boundary satisfying it. -/
theorem ParallelScopeInternalPrefixReachable.invariant_from_ingress (program : Program)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (predicate : RuntimeState → Prop)
    (ingress : ∀ before, ParallelScopeCommandBoundaryReachable program before → ∀ stimulus,
      (before = initialState ∨ predicate before) → (admitStimulus program before stimulus).outcome = .committed →
        predicate (admitStimulus program before stimulus).state)
    (singleton : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ candidate, predicate before → applyInternalOperationOccurrence? program before candidate = some after → predicate after)
    (batch : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ batch successors, predicate before → applyInternalOccurrenceBatch? program before batch = some successors →
        successors.getLast? = some after → predicate after)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) : predicate state := by
  induction reachable with
  | admitted before stimulus boundary committed =>
    exact ingress before boundary stimulus
      (ParallelScopeCommandBoundaryReachable.initial_or_invariant program profile predicate ingress singleton batch
        before boundary) committed
  | singleton before after ordinal schedule remaining consumed offer candidate preceding chosen alternative applied ih =>
    exact singleton before after preceding candidate ih applied
  | batch before after ordinal schedule remaining consumed offers reservedBatch successors preceding chosen reserved alternatives applied endpoint ih =>
    exact batch before after preceding reservedBatch successors ih applied endpoint

private theorem ingress_of_initial {program : Program} {predicate : RuntimeState → Prop}
    (initial : predicate initialState)
    (ingress : ∀ before, ParallelScopeCommandBoundaryReachable program before → ∀ stimulus,
      predicate before → (admitStimulus program before stimulus).outcome = .committed →
        predicate (admitStimulus program before stimulus).state) :
    ∀ before, ParallelScopeCommandBoundaryReachable program before → ∀ stimulus,
      (before = initialState ∨ predicate before) → (admitStimulus program before stimulus).outcome = .committed →
        predicate (admitStimulus program before stimulus).state :=
  fun before boundary stimulus prior committed =>
    ingress before boundary stimulus (prior.elim (fun equal => equal ▸ initial) id) committed

/-- Complete actual commands transport any locally preserved invariant, including unchanged rejection and rollback. -/
theorem ParallelScopeCommandBoundaryReachable.invariant_transport (program : Program)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (predicate : RuntimeState → Prop) (initial : predicate initialState)
    (ingress : ∀ before, ParallelScopeCommandBoundaryReachable program before → ∀ stimulus,
      predicate before → (admitStimulus program before stimulus).outcome = .committed →
        predicate (admitStimulus program before stimulus).state)
    (singleton : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ candidate, predicate before → applyInternalOperationOccurrence? program before candidate = some after → predicate after)
    (batch : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ batch successors, predicate before → applyInternalOccurrenceBatch? program before batch = some successors →
        successors.getLast? = some after → predicate after)
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state) : predicate state :=
  (ParallelScopeCommandBoundaryReachable.initial_or_invariant program profile predicate
    (ingress_of_initial initial ingress) singleton batch state reachable).elim (fun equal => equal ▸ initial) id

/-- Accepted ingress and actual singleton or reserved-batch prefixes consume the same invariant contract as command boundaries. -/
theorem ParallelScopeInternalPrefixReachable.invariant_transport (program : Program)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (predicate : RuntimeState → Prop) (initial : predicate initialState)
    (ingress : ∀ before, ParallelScopeCommandBoundaryReachable program before → ∀ stimulus,
      predicate before → (admitStimulus program before stimulus).outcome = .committed →
        predicate (admitStimulus program before stimulus).state)
    (singleton : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ candidate, predicate before → applyInternalOperationOccurrence? program before candidate = some after → predicate after)
    (batch : ∀ before after, ParallelScopeInternalPrefixReachable program before →
      ∀ batch successors, predicate before → applyInternalOccurrenceBatch? program before batch = some successors →
        successors.getLast? = some after → predicate after)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) : predicate state :=
  ParallelScopeInternalPrefixReachable.invariant_from_ingress program profile predicate
    (ingress_of_initial initial ingress) singleton batch state reachable

end BpmnSemantics.SemanticProcess
