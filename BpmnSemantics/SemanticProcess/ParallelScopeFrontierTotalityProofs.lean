module

import BpmnSemantics.SemanticProcess.ParallelScopeResumptionFrontierProofs
import BpmnSemantics.SemanticProcess.ParallelScopeInitialEntryProofs
import BpmnSemantics.SemanticProcess.ParallelScopeInitialEntryClosureProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import BpmnSemantics.SemanticProcess.InternalTransitionAlternativeOrder
import BpmnSemantics.SemanticProcess.ParallelScopeBatchArmingProofs
import BpmnSemantics.SemanticProcess.ParallelScopeBatchIdentityProofs
import BpmnSemantics.SemanticProcess.ParallelScopeCounterFrameProofs
import BpmnSemantics.SemanticProcess.ParallelScopeDiscoveryProofs
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierCorrespondenceProofs
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierReservationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeInputMultiplicityProofs
import BpmnSemantics.SemanticProcess.ParallelScopeInstanceIdentityProofs
import BpmnSemantics.SemanticProcess.ParallelScopeLiveBindingProofs
import BpmnSemantics.SemanticProcess.ParallelScopeProgress
import BpmnSemantics.SemanticProcess.ParallelScopeRecordAccounting
import BpmnSemantics.SemanticProcess.ParallelScopeStructuralFrontierProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeResumptionProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeSchedulerAccounting
import BpmnSemantics.SemanticProcess.ParallelScopeCommandPhaseProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames
import BpmnSemantics.SemanticProcess.ParallelScopeReservationAncestryProofs

/-! PMIS-SELECT-01 separates discovery failure from dependent multi-offer selection.
Actual reachability rules out failed discovery and duplicate alternatives even at
empty or singleton frontiers. Initial-entry blockers and scoped resumption supply
complete batches, so selection consumes no private choice directive.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

/-- Reachable discovery cannot set the scheduler's failure flag; this does not assert that a dependent multi-offer frontier has a batch. -/
theorem ParallelScopeInternalPrefixReachable.execution_discovery_successful (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId) :
    (deriveInternalExecutionFrontier program state).preparationFailed = false := by
  obtain ⟨pairs, discovered⟩ := reachable.frontier_discovery_total program analysis admitted state instanceId running
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  have unique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program
    (analyzeProgram_incidence_admission program analysis admitted).1)
  have ordered := deriveInternalOccurrenceFrontier_ordered program state pairs unique discovered
  rw [← deriveInternalExecutionFrontier_occurrence_exact_order program state instanceId pairs
    profile running unique discovered] at ordered
  have distinct : (deriveInternalExecutionFrontier program state).offers.Pairwise
      (fun left right => left.alternative ≠ right.alternative) := by
    apply List.pairwise_map.mp
    exact ordered.imp (fun less same => by
      subst same
      exact Bool.noConfusion ((internalAlternativeBefore_asymm _ _ less).symm.trans less))
  have perOperation : ∀ operation ∈ program.operations, ∃ piece,
      internalOperationOccurrenceOffers? program state operation = some piece := by
    intro operation member
    apply reachable.operation_offers_from_input_bound program analysis admitted state instanceId running ?_ operation member
    intro candidate wait input resolved kind inputEq
    apply reachable.wait_input_multiplicity_le_one program analysis admitted state instanceId running
      candidate wait resolved kind input
    cases wait <;> simp [SemanticOperation.kind] at kind <;>
      simp_all [internalArmInput?, bodyConsumedPorts, SequentialScopeControl.inputs]
  simp only [deriveInternalExecutionFrontier, running] at distinct ⊢
  generalize aggregation : program.operations.foldl _ ({} : InternalExecutionFrontier) = aggregate at distinct ⊢
  have clean : aggregate.preparationFailed = false := by
    rw [← aggregation]
    apply List.foldlRecOn (motive := fun frontier : InternalExecutionFrontier => frontier.preparationFailed = false)
    · rfl
    · intro frontier clean operation member
      obtain ⟨piece, success⟩ := perOperation operation member
      cases operation
      case mergeExclusive => simp [internalOperationOccurrenceOffers?] at success
      all_goals simp [ordinaryExecutionFrontier, profile, success, clean]
  simp only [clean, decide_eq_true distinct, Bool.not_true, Bool.or_self]

private theorem reachable_selection_total (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (prepared : 2 ≤ (deriveInternalExecutionFrontier program state).offers.length →
      ∃ batch, (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch)
    (nonempty : (deriveInternalExecutionFrontier program state).offers ≠ [])
    (ordinal : Nat) (schedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program state) =
      .execute (deriveInternalExecutionFrontier program state).offers schedule false := by
  have clean := reachable.execution_discovery_successful program analysis admitted state instanceId running
  by_cases multiple : 2 ≤ (deriveInternalExecutionFrontier program state).offers.length
  · obtain ⟨batch, reserved⟩ := prepared multiple
    simp only [selectInternalExecutionFrontier, clean, Bool.false_eq_true, ↓reduceIte,
      reserved, Option.isSome_some]
  · have one : (deriveInternalExecutionFrontier program state).offers.length = 1 := by
      have positive := List.length_pos_iff.mpr nonempty
      omega
    obtain ⟨offer, singleton⟩ := List.length_eq_one_iff.mp one
    have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
      cases selection : programSelected program with
      | false => simp [analyzeProgram, selection] at admitted
      | true => simpa only [programSelected, beq_iff_eq] using selection
    obtain ⟨_, _, _, preparation⟩ := deriveInternalExecutionFrontier_occurrence_sound program state profile offer
      (by rw [singleton]; simp)
    simp only [selectInternalExecutionFrontier, clean, Bool.false_eq_true, ↓reduceIte, singleton]
    split
    · rfl
    · simp [List.mapM_cons, List.mapM_nil, preparation]

/-- Every nonempty scoped-resumption frontier is selected completely, without ambiguity or consumption of a choice directive. Fuel and publication acceptance remain separate. -/
theorem ParallelScopeInternalPrefixReachable.scoped_resumption_selection_total (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable state actor)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (blocked : ∀ scope ∈ stable.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
      scopeQuiescent stable scope.id = false)
    (nonempty : (deriveInternalExecutionFrontier program state).offers ≠ [])
    (ordinal : Nat) (schedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program state) =
      .execute (deriveInternalExecutionFrontier program state).offers schedule false := by
  apply reachable_selection_total program analysis admitted state reachable instanceId running ?_ nonempty ordinal schedule
  intro multiple
  obtain ⟨batch, reserved, _, _⟩ := reachable.scoped_resumption_batch_total program analysis admitted
    stable state instanceId running actor frame empty successful blocked multiple
  exact ⟨batch, reserved⟩

/-- A nonempty scoped frontier advances to an actually reachable successor and charges every offer. The recursive suffix still owns final progress and publication. -/
theorem ParallelScopeInternalPrefixReachable.scoped_resumption_advances (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable state actor)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (blocked : ∀ scope ∈ stable.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
      scopeQuiescent stable scope.id = false)
    (nonempty : (deriveInternalExecutionFrontier program state).offers ≠ [])
    (commandId : SemanticId) (fuel index ordinal : Nat)
    (enough : (deriveInternalExecutionFrontier program state).offers.length ≤ fuel + 1) :
    ∃ next, ParallelScopeInternalPrefixReachable program next ∧
      (closeScheduledTraced (fuel + 1) program commandId index ordinal [] state).state =
        (closeScheduledTraced (fuel + 1 - (deriveInternalExecutionFrontier program state).offers.length)
          program commandId (index + (deriveInternalExecutionFrontier program state).offers.length) ordinal [] next).state ∧
      (closeScheduledTraced (fuel + 1) program commandId index ordinal [] state).failed =
        (closeScheduledTraced (fuel + 1 - (deriveInternalExecutionFrontier program state).offers.length)
          program commandId (index + (deriveInternalExecutionFrontier program state).offers.length) ordinal [] next).failed := by
  have clean := reachable.execution_discovery_successful program analysis admitted state instanceId running
  have selected := reachable.scoped_resumption_selection_total program analysis admitted stable state instanceId running
    actor frame empty successful blocked nonempty ordinal []
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  by_cases multiple : 2 ≤ (deriveInternalExecutionFrontier program state).offers.length
  · obtain ⟨batch, reserved, count, _⟩ := reachable.scoped_resumption_batch_total program analysis admitted
      stable state instanceId running actor frame empty successful blocked multiple
    have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
    obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis admitted state
    obtain ⟨successors, inhabited, applied, _, advanced⟩ := closeScheduledTraced_reserved_batch_step fuel program
      commandId instanceId index ordinal [] state batch profile running wellFormed absent reserved (by omega)
    have unique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
    have aligned := prepareInternalOccurrenceBatch_frontier_alternatives program state instanceId batch profile running
      unique (deriveInternalExecutionFrontier_batch_prepared program state batch reserved)
    refine ⟨successors.getLast inhabited, ?_, ?_⟩
    · exact .batch state _ ordinal [] [] false (deriveInternalExecutionFrontier program state).offers batch successors
        reachable selected reserved aligned applied (List.getLast?_eq_some_getLast inhabited)
    · simpa only [count] using advanced
  · have one : (deriveInternalExecutionFrontier program state).offers.length = 1 := by
      have positive := List.length_pos_iff.mpr nonempty
      omega
    obtain ⟨offer, singleton⟩ := List.length_eq_one_iff.mp one
    have noBatch : (deriveInternalExecutionFrontier program state).occurrenceBatch = none := by
      simp only [deriveInternalExecutionFrontier, running] at singleton ⊢
      rw [singleton]
      rfl
    have frontier : deriveInternalExecutionFrontier program state = { offers := [offer] } := by
      cases computed : deriveInternalExecutionFrontier program state
      simp_all
    obtain ⟨candidate, alternative, applied, preparation⟩ := deriveInternalExecutionFrontier_occurrence_sound
      program state profile offer (by rw [singleton]; simp)
    refine ⟨offer.successor, ?_, ?_⟩
    · exact .singleton state offer.successor ordinal [] [] false offer candidate reachable
        (by simpa only [singleton] using selected) alternative applied
    · simpa only [singleton, List.length_singleton, Nat.add_sub_cancel] using
        closeScheduledTraced_singleton_step fuel program commandId index ordinal state offer frontier
          (by intro prepared accepted; rw [preparation] at accepted; contradiction)

/-- Child blockers exclude all retirement offers, so complete reachable discovery
installs every member of a multi-offer frontier without assuming preparation. -/
theorem ParallelScopeInternalPrefixReachable.blocked_children_batch_total (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (blocked : ∀ scope ∈ state.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
      scopeQuiescent state scope.id = false)
    (multiple : 2 ≤ (deriveInternalExecutionFrontier program state).offers.length) :
    ∃ batch, (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch ∧
      batch.members.length = (deriveInternalExecutionFrontier program state).offers.length ∧
      (deriveInternalExecutionFrontier program state).preparationFailed = false := by
  obtain ⟨pairs, discovered⟩ := reachable.frontier_discovery_total program analysis admitted state instanceId running
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  have count := deriveInternalExecutionFrontier_occurrence_length program state instanceId pairs profile running discovered
  have excluded : ∀ pair ∈ pairs, ∀ operation,
      resolveInternalOperationOccurrence? program state pair.1 = some operation →
      operation.kind ≠ .completeParallelMultiInstanceScope := by
    intro pair present operation resolved kind
    have applied := deriveInternalOccurrenceFrontier_member_applied program state pairs discovered pair present
    obtain ⟨actual, actualResolved, _, replayed⟩ :=
      applyInternalOperationOccurrence_replay_record program state pair.2 pair.1 profile applied
    rw [resolved] at actualResolved
    cases Option.some.inj actualResolved
    obtain ⟨entry, member, completed⟩ := ParallelScopeReplay.replayed_retirement_execution program state pair.2
      { operationId := pair.1.operationId, operationKind := operation.kind,
        origin := operation.origin, owner := pair.1.owner, mergeInput := none } kind replayed
    obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
    rw [entries] at member
    have same : entry = analysis.entry := List.mem_singleton.mp member
    subst entry
    have binding := completed
    unfold completeParallelScope? at binding
    obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp binding
    obtain ⟨scope, population, owner, _, definition⟩ := parallelScopeBinding_body_record analysis.entry state pair.1.owner binding bound
    have included : scope ∈ state.scopeOccurrences :=
      (List.mem_filter.mp (show scope ∈ state.scopeOccurrences.filter (fun scope => scope.id == pair.1.owner) by rw [population]; simp)).1
    have quiet := blocked scope included (owner ▸ definition)
    rw [owner] at quiet
    have refused := completeParallelScope_refuses_nonquiescent analysis.entry state pair.1.owner quiet
    rw [refused] at completed
    contradiction
  obtain ⟨batch, installed, length, clean⟩ := reachable.retirement_free_frontier_batch_installed program analysis admitted
    state instanceId running pairs discovered (by omega) excluded
  exact ⟨batch, installed, length.trans count.symm, clean⟩

/-- Initial-entry child blockers suffice for complete nonempty selection; fuel and
publication are not inferred from this selection theorem. Empty child sets are allowed. -/
theorem ParallelScopeInternalPrefixReachable.blocked_children_selection_total (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (blocked : ∀ scope ∈ state.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
      scopeQuiescent state scope.id = false)
    (nonempty : (deriveInternalExecutionFrontier program state).offers ≠ [])
    (ordinal : Nat) (schedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program state) =
      .execute (deriveInternalExecutionFrontier program state).offers schedule false := by
  apply reachable_selection_total program analysis admitted state reachable instanceId running ?_ nonempty ordinal schedule
  intro multiple
  obtain ⟨batch, installed, _, _⟩ := reachable.blocked_children_batch_total program analysis admitted
    state instanceId running blocked multiple
  exact ⟨batch, installed⟩

/-- Every nonempty frontier returned by real initial draining selects completely,
including empty collections and their parent continuation. Failed closure outcomes
retain this guarantee; no drained-state or batch premise is used. -/
theorem closeScheduledTraced_initial_entry_selection_total (program : Program) (commandId : SemanticId)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready) (initiated : initiateState? ready output = some initial)
    (prior : List CommittedTransition) (preceding : ParallelScopeReplay.ContinuationCommandHistory program owner initial before prior)
    (parents : ParallelScopeParentHistory program analysis.entry parent before) (entered : enterParallelScope? analysis.entry before parent = some issued)
    (absent : issued.compensationHandlerEffectWaits = []) (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (reachable : ParallelScopeInternalPrefixReachable program issued)
    (current : RuntimeState) (closed : current = (closeScheduledTraced fuel program commandId index ordinal schedule issued).state)
    (nonempty : (deriveInternalExecutionFrontier program current).offers ≠ [])
    (nextOrdinal : Nat) (nextSchedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode nextOrdinal nextSchedule
      (deriveInternalExecutionFrontier program current) =
      .execute (deriveInternalExecutionFrontier program current).offers nextSchedule false := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  have selected : programSelected program = true := by simp [programSelected, profile]
  obtain ⟨offer, present⟩ := List.exists_mem_of_ne_nil _ nonempty
  obtain ⟨candidate, _, applied, _⟩ := deriveInternalExecutionFrontier_occurrence_sound program current profile offer present
  have ⟨runtimeId, running⟩ : ∃ id, current.control = .running id := by
    cases control : current.control <;> first
      | exact ⟨_, rfl⟩
      | simp [applyInternalOperationOccurrence?, control] at applied
  obtain ⟨_, _, currentReachable⟩ := closeScheduledTraced_parallelScope_prefix_reachable program profile commandId
    fuel index ordinal schedule issued reachable
  rw [← closed] at currentReachable
  have blocked : ∀ occurrence ∈ current.scopeOccurrences,
      occurrence.id.definitionScopeId = analysis.entry.childScopeId → scopeQuiescent current occurrence.id = false := by
    by_cases populated : ∃ child ∈ issued.scopeOccurrences, child.id.definitionScopeId = analysis.entry.childScopeId
    · obtain ⟨child, member, childScope⟩ := populated
      obtain ⟨_, _, records, replayed, body, noCompensation, blocked⟩ := closeScheduledTraced_initial_entry_nonquiescent
        program commandId analysis admitted owner parent instanceId values root ready initial before issued startId origin output
        startDeclared rootSelected parentIdentity started initiated prior preceding parents entered child member childScope absent fuel index ordinal schedule
      simpa only [← closed] using blocked
    · have distinct := analyzeProgram_child_root_distinct program analysis admitted root rootSelected
      let observer : ScopeOccurrenceId := ⟨instanceId, analysis.entry.childScopeId, 1⟩
      have different : observer ≠ parent := by
        intro same
        exact distinct (congrArg ScopeOccurrenceId.definitionScopeId (same.trans parentIdentity))
      have initialParents : ParallelScopeParentHistory program analysis.entry parent initial :=
        .initiate (.start instanceId root values ready rootSelected started parentIdentity distinct) output
          ⟨startId, origin, startDeclared⟩ initiated
      have preceding := preceding.reindex_nonparent program owner observer parent selected initial before prior
        (initialParents.structural_frame program analysis.entry parent initial) different
      obtain ⟨_, added, _, _, _, following⟩ := closeScheduledTraced_post_entry_history program commandId analysis admitted
        observer parent different instanceId values root ready initial before issued issued startId origin output startDeclared
        rootSelected parentIdentity started initiated prior [] preceding parents entered (.initial issued) absent fuel index ordinal schedule
      rw [← closed] at following
      rcases following with history | ⟨_, _, _, _, _, _, _, ⟨terminalInstance, completed⟩, _⟩
      · intro occurrence present childScope
        exact False.elim (populated ⟨occurrence,
          (history.scopeOccurrences_sublist program observer selected issued current ([] ++ added)).subset present, childScope⟩)
      · rw [running] at completed
        cases completed
  exact currentReachable.blocked_children_selection_total program analysis admitted current runtimeId running
    blocked nonempty nextOrdinal nextSchedule

/-- Once the outer population has been removed, actual post-entry closure cannot
recreate child scopes. Every remaining parent frontier selects completely, even
when the surrounding closure fails before publication. -/
theorem closeScheduledTraced_post_retirement_selection_total (program : Program) (commandId : SemanticId)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued startState : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial) (prior suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before prior)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued startState suffix)
    (retired : startState.activityOccurrences = [])
    (reachable : ParallelScopeInternalPrefixReachable program startState)
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (current : RuntimeState) (closed : current = (closeScheduledTraced fuel program commandId index ordinal schedule startState).state)
    (nonempty : (deriveInternalExecutionFrontier program current).offers ≠ [])
    (nextOrdinal : Nat) (nextSchedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode nextOrdinal nextSchedule
      (deriveInternalExecutionFrontier program current) =
      .execute (deriveInternalExecutionFrontier program current).offers nextSchedule false := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  have issuedRunning := (enterParallelScope_control_frame analysis.entry parent before issued entered).trans
    (parents.running_control program analysis.entry parent before)
  have startRunning := (following.control_frame program owner selected issued startState suffix).trans issuedRunning
  have noChildren : ∀ occurrence ∈ startState.scopeOccurrences,
      occurrence.id.definitionScopeId = analysis.entry.childScopeId → False := by
    intro occurrence present child
    obtain ⟨binding, bound⟩ := reachable.live_child_binding program analysis admitted startState
      parent.processInstanceId startRunning occurrence.id child ⟨occurrence, present, rfl⟩
    simp [parallelScopeBinding?, startRunning, retired] at bound
  obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis admitted startState
  let predicate : Nat → RuntimeState → Prop := fun _ state =>
    (∃ records, ContinuationCommandHistory program owner issued state records ∧
      state.compensationHandlerEffectWaits = [] ∧ state.scopeOccurrences.Sublist startState.scopeOccurrences) ∨
      ∃ terminalId, state.control = .completed terminalId
  have invariant := closeScheduledTraced_prefix_induction program commandId predicate (by
    intro position nextOrdinal nextSchedule state offers remaining consumed step invariant nonempty chosen executed
    rcases invariant with ⟨records, history, absent, scopes⟩ | ⟨terminalId, completed⟩
    · have mechanics := executeSelectedFrontier_parallel_scope_steps program commandId position nextOrdinal
        nextSchedule state offers remaining consumed step profile nonempty chosen executed
      have witness : (∃ candidate, offers.length = 1 ∧ applyInternalOperationOccurrence? program state candidate = some step.state) ∨
          (∃ batch successors, applyInternalOccurrenceBatch? program state batch = some successors ∧
            successors.length = offers.length ∧ successors.getLast? = some step.state) := by
        rcases mechanics with ⟨offer, candidate, _, length, _, applied, _⟩ | ⟨batch, successors, _, applied, length, endpoint, _, _⟩
        · exact Or.inl ⟨candidate, length, applied⟩
        · exact Or.inr ⟨batch, successors, applied, length, endpoint⟩
      obtain ⟨added, _, nextAbsent, nextPhase⟩ := ContinuationCommandHistory.extend_post_entry_selected_execution program analysis admitted
        owner parent different instanceId values root ready initial before issued state step.state startId origin output
        startDeclared rootSelected parentIdentity started initiated prior records preceding parents entered history absent offers.length witness
      rcases nextPhase with extended | ⟨_, _, _, _, _, terminalId, _, _, _, completed, _⟩
      · have nextRunning := (extended.control_frame program owner selected issued step.state (records ++ added)).trans issuedRunning
        have retained : step.state.scopeOccurrences.Sublist state.scopeOccurrences := by
          rcases mechanics with ⟨offer, candidate, _, _, _, applied, _⟩ | ⟨batch, successors, _, applied, _, endpoint, _, _⟩
          · obtain ⟨operation, record, _, _, _, _, replayed, phases⟩ := preceding.post_entry_occurrence_phases
              program analysis admitted owner parent instanceId values root ready initial before issued state step.state
              startId origin output startDeclared rootSelected parentIdentity started initiated prior records
              parents entered history candidate applied
            rcases phases with ordinary | ⟨_, _, terminalId, _, _, _, completed, _⟩
            · exact replayed_scope_sublist program state step.state record ordinary replayed
            · rw [nextRunning] at completed
              contradiction
          · have framed := applyInternalOccurrenceBatch_retirement_frames program state batch successors applied
              step.state (List.mem_of_getLast? endpoint)
            rw [framed.2.1]
            exact List.Sublist.refl _
        exact Or.inl ⟨records ++ added, extended, nextAbsent, retained.trans scopes⟩
      · exact Or.inr ⟨terminalId, completed⟩
    · exact False.elim (completed_parallel_selection_refused program state profile terminalId completed
        nextOrdinal nextSchedule remaining offers consumed nonempty chosen)) fuel index ordinal schedule startState
      (Or.inl ⟨suffix, following, absent, List.Sublist.refl _⟩)
  obtain ⟨_, _, invariant⟩ := invariant
  rw [← closed] at invariant
  obtain ⟨offer, present⟩ := List.exists_mem_of_ne_nil _ nonempty
  obtain ⟨candidate, _, applied, _⟩ := deriveInternalExecutionFrontier_occurrence_sound program current profile offer present
  have ⟨runtimeId, running⟩ : ∃ id, current.control = .running id := by
    cases control : current.control <;> first
      | exact ⟨_, rfl⟩
      | simp [applyInternalOperationOccurrence?, control] at applied
  obtain ⟨_, _, currentReachable⟩ := closeScheduledTraced_parallelScope_prefix_reachable program profile commandId
    fuel index ordinal schedule startState reachable
  rw [← closed] at currentReachable
  rcases invariant with ⟨_, _, _, scopes⟩ | ⟨terminalId, completed⟩
  · exact currentReachable.blocked_children_selection_total program analysis admitted current runtimeId running
      (fun occurrence present child => False.elim (noChildren occurrence (scopes.subset present) child))
      nonempty nextOrdinal nextSchedule
  · rw [running] at completed
    contradiction

/-- Extending the actual lifetime history by the whole next frontier proves its
fuel charge fits Start capacity. Preparation and successor existence are derived
before the count bound; neither is assumed from a fuel-limited execution. -/
theorem ParallelScopeInternalPrefixReachable.frontier_extension_within_start_capacity
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (state : RuntimeState) (earlier : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial state earlier)
    (reachable : ParallelScopeInternalPrefixReachable program state)
    (runtimeId : SemanticId) (running : state.control = .running runtimeId)
    (boundary : (∀ scope ∈ state.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
        scopeQuiescent state scope.id = false) ∨
      ∃ stable actor, ParallelScopeOwnerFrame stable state actor ∧
        (deriveInternalExecutionFrontier program stable).offers = [] ∧
        (deriveInternalExecutionFrontier program stable).preparationFailed = false ∧
        ∀ scope ∈ stable.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
          scopeQuiescent stable scope.id = false)
    (nonempty : (deriveInternalExecutionFrontier program state).offers ≠ [])
    (capacity : ProgramCapacity) (startCapacity : programStartCapacity program values = some capacity) :
    ∃ after added, added.length = (deriveInternalExecutionFrontier program state).offers.length ∧
      after.compensationHandlerEffectWaits = [] ∧
      ParallelScopeSchedulerPhase program analysis owner parent initial after (earlier ++ added) ∧
      earlier.length + (deriveInternalExecutionFrontier program state).offers.length + 1 ≤ capacity.closureBound := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  have prepared : 2 ≤ (deriveInternalExecutionFrontier program state).offers.length →
      ∃ batch, (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch ∧
        batch.members.length = (deriveInternalExecutionFrontier program state).offers.length := by
    intro multiple
    rcases boundary with blocked | ⟨stable, actor, frame, empty, successful, blocked⟩
    · obtain ⟨batch, installed, length, _⟩ := reachable.blocked_children_batch_total program analysis admitted
        state runtimeId running blocked multiple
      exact ⟨batch, installed, length⟩
    · obtain ⟨batch, installed, length, _⟩ := reachable.scoped_resumption_batch_total program analysis admitted
        stable state runtimeId running actor frame empty successful blocked multiple
      exact ⟨batch, installed, length⟩
  obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis admitted state
  have execution : ∃ after,
      (∃ candidate, (deriveInternalExecutionFrontier program state).offers.length = 1 ∧
        applyInternalOperationOccurrence? program state candidate = some after) ∨
      (∃ batch successors, applyInternalOccurrenceBatch? program state batch = some successors ∧
        successors.length = (deriveInternalExecutionFrontier program state).offers.length ∧ successors.getLast? = some after) := by
    by_cases multiple : 2 ≤ (deriveInternalExecutionFrontier program state).offers.length
    · obtain ⟨batch, installed, length⟩ := prepared multiple
      obtain ⟨successors, applied, count⟩ := preparedOccurrenceBatch_applies program state batch
        (deriveInternalExecutionFrontier_batch_prepared program state batch installed)
        (analyzeProgram_incidence_admission program analysis admitted).1 absent
      have inhabited : successors ≠ [] := by intro empty; simp [empty] at count; omega
      exact ⟨successors.getLast inhabited, Or.inr ⟨batch, successors, applied,
        count.trans length, List.getLast?_eq_some_getLast inhabited⟩⟩
    · have one : (deriveInternalExecutionFrontier program state).offers.length = 1 := by
        have positive := List.length_pos_iff.mpr nonempty
        omega
      obtain ⟨offer, singleton⟩ := List.length_eq_one_iff.mp one
      obtain ⟨candidate, _, applied, _⟩ := deriveInternalExecutionFrontier_occurrence_sound program state profile offer
        (by rw [singleton]; simp)
      exact ⟨offer.successor, Or.inl ⟨candidate, one, applied⟩⟩
  obtain ⟨after, witness⟩ := execution
  obtain ⟨added, length, nextAbsent, nextPhase⟩ := phase.occurrence_execution program analysis admitted owner parent
    different instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity
    (analyzeProgram_child_root_distinct program analysis admitted root rootSelected)
    started initiated state after earlier absent (deriveInternalExecutionFrontier program state).offers.length witness
  have counted := nextPhase.record_count_le_start_capacity program analysis admitted owner parent instanceId values root
    ready initial startId origin output startDeclared rootSelected parentIdentity started initiated after
    (earlier ++ added) capacity startCapacity
  simp only [List.length_append, length] at counted
  exact ⟨after, added, length, nextAbsent, nextPhase, counted⟩

private theorem consumed_prefix_length (total fuel count : Nat)
    (fits : fuel + 1 ≤ total) (enough : count ≤ fuel) :
    (total - (fuel + 1)) + (count + 1) = total - (fuel - count) := by
  omega

/-- Exact recursive-call provenance binds lifetime records to the remaining fuel,
including prefixes whose final command refuses or publishes no records. -/
theorem InternalCommutation.ScheduledClosurePrefix.parallelScope_phase_history
    (program : Program) (commandId : SemanticId)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (before after : RuntimeState) (earlier : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial before earlier)
    (absent : before.compensationHandlerEffectWaits = [])
    (initialFuel initialIndex initialOrdinal fuel index ordinal : Nat)
    (initialSchedule schedule : InternalChoiceSchedule)
    (path : ScheduledClosurePrefix program commandId initialFuel initialIndex initialOrdinal initialSchedule before
      fuel index ordinal schedule after) :
    ∃ added : List CommittedTransition, added.length = initialFuel - fuel ∧
      after.compensationHandlerEffectWaits = [] ∧
      ParallelScopeSchedulerPhase program analysis owner parent initial after (earlier ++ added) := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  induction path with
  | initial => exact ⟨[], by simp, absent, by simpa only [List.append_nil] using phase⟩
  | @step fuel index ordinal schedule remaining current first rest consumed step preceding unstable chosen enough executed ih =>
      obtain ⟨records, count, noCompensation, currentPhase⟩ := ih
      have mechanics := executeSelectedFrontier_parallel_scope_steps program commandId index ordinal schedule current
        (first :: rest) remaining consumed step profile (by simp) chosen executed
      have witness : (∃ candidate, (first :: rest).length = 1 ∧
          applyInternalOperationOccurrence? program current candidate = some step.state) ∨
          (∃ batch successors, applyInternalOccurrenceBatch? program current batch = some successors ∧
            successors.length = (first :: rest).length ∧ successors.getLast? = some step.state) := by
        rcases mechanics with ⟨offer, candidate, _, length, _, applied, _⟩ |
          ⟨batch, successors, _, applied, length, last, _, _⟩
        · exact Or.inl ⟨candidate, length, applied⟩
        · exact Or.inr ⟨batch, successors, applied, length, last⟩
      obtain ⟨added, length, nextAbsent, nextPhase⟩ := currentPhase.occurrence_execution program analysis admitted owner parent
        different instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity
        (analyzeProgram_child_root_distinct program analysis admitted root rootSelected) started initiated
        current step.state (earlier ++ records) noCompensation (first :: rest).length witness
      have budget := preceding.budget
      refine ⟨records ++ added, ?_, nextAbsent, ?_⟩
      · simpa only [List.length_append, count, length, List.length_cons] using
          consumed_prefix_length initialFuel fuel rest.length budget.1 enough
      · simpa only [List.append_assoc] using nextPhase

/-- Actual lifetime accounting rules out fuel refusal at every reachable Running
endpoint. A single enabled occurrence refutes zero fuel; a selected reserved batch
refutes overflow. No phase-specific readiness or successful-closure premise is used. -/
theorem closeScheduledTraced_parallelScope_no_fuel_refusal
    (program : Program) (commandId : SemanticId)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (state : RuntimeState) (earlier : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial state earlier)
    (reachable : ParallelScopeInternalPrefixReachable program state)
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (final : RuntimeState) (closed : final = (closeScheduledTraced fuel program commandId index ordinal schedule state).state)
    (runtimeId : SemanticId) (running : final.control = .running runtimeId)
    (capacity : ProgramCapacity) (startCapacity : programStartCapacity program values = some capacity)
    (allocated : capacity.closureBound ≤ earlier.length + fuel + 1) :
    (closeScheduledTraced fuel program commandId index ordinal schedule state).hitBound = false := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis admitted state
  obtain ⟨_, _, finalReachable⟩ := closeScheduledTraced_parallelScope_prefix_reachable program profile commandId
    fuel index ordinal schedule state reachable
  rw [← closed] at finalReachable
  have clean := finalReachable.execution_discovery_successful program analysis admitted final runtimeId running
  apply Bool.eq_false_iff.mpr
  intro hit
  obtain ⟨remainingFuel, nextIndex, nextOrdinal, nextSchedule, path, unstable, deficit⟩ :=
    closeScheduledTraced_hitBound_cursor program commandId fuel index ordinal schedule state hit
  rw [← closed] at path unstable deficit
  obtain ⟨records, count, finalAbsent, finalPhase⟩ := path.parallelScope_phase_history program commandId analysis admitted
    owner parent different instanceId values root ready initial startId origin output startDeclared rootSelected
    parentIdentity started initiated state final earlier phase absent fuel index ordinal remainingFuel nextIndex
    nextOrdinal schedule nextSchedule
  have nonempty : (deriveInternalExecutionFrontier program final).offers ≠ [] := by
    intro empty
    simp [empty, clean] at unstable
  have budget := path.budget
  have within (next : RuntimeState) (charge : Nat)
      (witness : (∃ candidate, charge = 1 ∧ applyInternalOperationOccurrence? program final candidate = some next) ∨
        (∃ batch successors, applyInternalOccurrenceBatch? program final batch = some successors ∧
          successors.length = charge ∧ successors.getLast? = some next)) : charge ≤ remainingFuel := by
    obtain ⟨added, length, _, nextPhase⟩ := finalPhase.occurrence_execution program analysis admitted owner parent
      different instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity
      (analyzeProgram_child_root_distinct program analysis admitted root rootSelected)
      started initiated final next (earlier ++ records) finalAbsent charge witness
    have bounded := nextPhase.record_count_le_start_capacity program analysis admitted owner parent instanceId values root
      ready initial startId origin output startDeclared rootSelected parentIdentity started initiated next
      ((earlier ++ records) ++ added) capacity startCapacity
    simp only [List.length_append, length] at bounded
    omega
  obtain ⟨first, member⟩ := List.exists_mem_of_ne_nil _ nonempty
  obtain ⟨candidate, _, applied, _⟩ := deriveInternalExecutionFrontier_occurrence_sound program final profile first member
  have positive := within first.successor 1 (Or.inl ⟨candidate, rfl, applied⟩)
  rcases deficit with exhausted | ⟨offers, remaining, consumed, chosen, overflow⟩
  · omega
  · cases batchEq : (deriveInternalExecutionFrontier program final).occurrenceBatch with
    | some batch =>
      obtain ⟨same, _, _⟩ := selectInternalExecutionFrontier_reserved_offers program.internalSchedulingMode nextOrdinal
        nextSchedule (deriveInternalExecutionFrontier program final) offers remaining consumed batch batchEq chosen
      have prepared := deriveInternalExecutionFrontier_batch_prepared program final batch batchEq
      have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
      have unique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
      have aligned := prepareInternalOccurrenceBatch_frontier_alternatives program final runtimeId batch profile running unique prepared
      have length : batch.members.length = offers.length := by
        simpa only [List.length_map, same] using (congrArg List.length aligned).symm
      obtain ⟨successors, applied, count⟩ := preparedOccurrenceBatch_applies program final batch prepared wellFormed finalAbsent
      have inhabited : successors ≠ [] := by intro empty; simp [empty] at count; omega
      have enough := within (successors.getLast inhabited) offers.length
        (Or.inr ⟨batch, successors, applied, count.trans length, List.getLast?_eq_some_getLast inhabited⟩)
      omega
    | none =>
      cases discovered : (deriveInternalExecutionFrontier program final).offers with
      | nil => exact nonempty discovered
      | cons head tail =>
        obtain ⟨_, _, _, preparation⟩ := deriveInternalExecutionFrontier_occurrence_sound program final profile head
          (by rw [discovered]; simp)
        simp only [selectInternalExecutionFrontier, clean, batchEq, Option.isSome_none,
          Bool.false_eq_true, ↓reduceIte, discovered, List.mapM_cons, preparation] at chosen
        cases tail with
        | nil => cases chosen; simp only [List.length_singleton] at overflow; omega
        | cons next rest => contradiction

/-- Actual initial draining of a nonempty issued collection cannot exhaust its
allocated budget. The body replay derives Running control and all child blockers;
neither final frontier readiness nor successful closure is a premise. -/
theorem closeScheduledTraced_initial_entry_no_fuel_refusal (program : Program) (commandId : SemanticId)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (prior : List CommittedTransition) (preceding : ContinuationCommandHistory program owner initial before prior)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (child : RuntimeScopeOccurrence) (member : child ∈ issued.scopeOccurrences)
    (childScope : child.id.definitionScopeId = analysis.entry.childScopeId)
    (earlier : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial issued earlier)
    (reachable : ParallelScopeInternalPrefixReachable program issued)
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (capacity : ProgramCapacity) (startCapacity : programStartCapacity program values = some capacity)
    (allocated : capacity.closureBound ≤ earlier.length + fuel + 1) :
    (closeScheduledTraced fuel program commandId index ordinal schedule issued).hitBound = false := by
  obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis admitted issued
  obtain ⟨_, _, records, replayed, body, _, _⟩ := closeScheduledTraced_initial_entry_nonquiescent
    program commandId analysis admitted owner parent instanceId values root ready initial before issued startId origin output
    startDeclared rootSelected parentIdentity started initiated prior preceding parents entered child member childScope absent
    fuel index ordinal schedule
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  have history := body_replay_history program selected issued _ records replayed body owner
  have running := (history.control_frame program owner selected issued _ records).trans
    ((enterParallelScope_control_frame analysis.entry parent before issued entered).trans
      (parents.running_control program analysis.entry parent before))
  exact closeScheduledTraced_parallelScope_no_fuel_refusal program commandId analysis admitted owner parent different
    instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity started initiated
    issued earlier phase reachable fuel index ordinal schedule _ rfl parent.processInstanceId running
    capacity startCapacity allocated

end BpmnSemantics.SemanticProcess
