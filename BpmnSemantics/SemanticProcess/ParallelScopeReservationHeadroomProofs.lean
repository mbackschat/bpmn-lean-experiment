import BpmnSemantics.SemanticProcess.ParallelScopeCounterHistoryProofs
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierCorrespondenceProofs
import BpmnSemantics.SemanticProcess.ParallelScopeBatchReadinessProofs

/-! # Reachable reservation ordinal headroom

PMIS-SELECT-01 reserves shared family ordinals across every owner in a frontier.
Admitted Program size and the actual issued scope census bound that frontier;
the cumulative Start counter bound then leaves safe wire headroom for every
partial reservation accumulator. No successful batch preparation is assumed.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem ParallelScopeStart.analyzeProgram_operation_count (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) :
    program.operations.length ≤ 1024 := by
  unfold ParallelScopeStart.analyzeProgram at admitted
  split at admitted <;> try contradiction
  rename_i accepted
  have bounded : ¬1024 < program.operations.length := by
    intro tooMany
    simp [tooMany] at accepted
  omega

namespace InternalCommutation

open ParallelScopeReplay

/-- A running phase contains only the Start root and at most sixteen actually issued child scopes. -/
theorem ParallelScopeSchedulerPhase.scope_count (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState)
    (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (instanceId : SemanticId) (running : current.control = .running instanceId) :
    current.scopeOccurrences.length ≤ 17 := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · have clean := (parents.clean_and_foreign_marking program analysis.entry parent current).1
    rw [clean.1]
    change 1 ≤ 17
    decide +kernel
  · rcases later with history | ⟨_, _, _, _, _, _, _, completed, _⟩
    · have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
      obtain ⟨items, binding, _, _, bounded, count⟩ :=
        entry_scope_count analysis.entry parent before issued clean entered
      have retained := (history.scopeOccurrences_sublist program owner selected issued current suffix).length_le
      omega
    · obtain ⟨completedInstance, completed⟩ := completed
      rw [running] at completed
      cases completed

/-- The admitted operation census and actual phase population bound the complete discovered frontier before reservation construction. -/
theorem ParallelScopeSchedulerPhase.frontier_count (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState)
    (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (instanceId : SemanticId) (running : current.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program current = some pairs) :
    pairs.length ≤ 17408 := by
  have operations := ParallelScopeStart.analyzeProgram_operation_count program analysis admitted
  have scopes := phase.scope_count program analysis admitted owner parent initial current records instanceId running
  have count := deriveInternalOccurrenceFrontier_length_le_population program current pairs discovered
  have product := Nat.mul_le_mul operations scopes
  omega

theorem reservedCohortSize_le_length (members : List InternalOccurrencePatch)
    (kind : InternalWaitKind) (element : String) :
    reservedCohortSize members kind element ≤ members.length :=
  List.length_filter_le _ _

private theorem allocated_ordinal_safe (base slots : Nat) (baseBound : base < 16400)
    (slotBound : slots ≤ 17408) :
    0 < base + slots + 1 ∧ SemanticProcessJson.isSafeWireNat (base + slots + 1) = true := by
  refine ⟨by omega, ?_⟩
  change decide (base + slots + 1 ≤ (9007199254740991 : Nat)) = true
  apply decide_eq_true
  omega

/-- Every partial accumulator bounded by discovery has safe next Human/Service cohort ordinals, without assuming preparation succeeds. -/
theorem ParallelScopeSchedulerPhase.reservation_cohort_headroom
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (instanceId : SemanticId) (values : List VariableBinding)
    (root : DefinitionScope) (ready initial : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (current : RuntimeState) (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (runtimeId : SemanticId) (running : current.control = .running runtimeId)
    (capacity : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program values = some capacity)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program current = some pairs)
    (reserved : List InternalOccurrencePatch) (length : reserved.length ≤ pairs.length)
    (human : TaskDefinitionId) (effect : NodeId) :
    (0 < activationCount current human + reservedCohortSize reserved .userTask human.value + 1 ∧
      SemanticProcessJson.isSafeWireNat (activationCount current human + reservedCohortSize reserved .userTask human.value + 1) = true) ∧
    (0 < effectActivationCount current effect + reservedCohortSize reserved .effect effect.value + 1 ∧
      SemanticProcessJson.isSafeWireNat (effectActivationCount current effect + reservedCohortSize reserved .effect effect.value + 1) = true) ∧
    SemanticProcessJson.isSafeWireNat (current.endOccurrences + reserved.length) = true := by
  obtain ⟨humanBound, effectBound, endBound, ceiling⟩ := phase.native_counters_below_start_capacity program analysis admitted
    owner parent instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity
    started initiated current records capacity startCapacity human effect
  have frontier := phase.frontier_count program analysis admitted owner parent initial current records runtimeId running pairs discovered
  have humanSlots := reservedCohortSize_le_length reserved .userTask human.value
  have effectSlots := reservedCohortSize_le_length reserved .effect effect.value
  refine ⟨allocated_ordinal_safe _ _ (by omega) (by omega),
    allocated_ordinal_safe _ _ (by omega) (by omega), ?_⟩
  change decide (current.endOccurrences + reserved.length ≤ (9007199254740991 : Nat)) = true
  apply decide_eq_true
  omega

end InternalCommutation
end BpmnSemantics.SemanticProcess
