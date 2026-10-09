import BpmnSemantics.SemanticProcess.ParallelScopeFrontierTotalityProofs

/-! PMIS-SELECT-01 composes phase-local selection laws through actual command boundaries. Committed ingress and the exact retirement prefix supply their premises; arbitrary interleaved replay history is insufficient. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem post_entry_prefix_history
    (program : Program) (commandId : SemanticId)
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
    (absent : startState.compensationHandlerEffectWaits = [])
    (initialFuel initialIndex initialOrdinal fuel index ordinal : Nat)
    (initialSchedule schedule : InternalChoiceSchedule) (current : RuntimeState)
    (path : ScheduledClosurePrefix program commandId initialFuel initialIndex initialOrdinal initialSchedule startState
      fuel index ordinal schedule current) :
    (∃ records, ContinuationCommandHistory program owner issued current records ∧
      current.compensationHandlerEffectWaits = []) ∨ ∃ id, current.control = .completed id := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  induction path with
  | initial => exact Or.inl ⟨suffix, following, absent⟩
  | @step fuel index ordinal schedule remaining state first rest consumed step earlier unstable chosen enough executed ih =>
    rcases ih with ⟨records, history, absent⟩ | ⟨id, completed⟩
    · have mechanics := executeSelectedFrontier_parallel_scope_steps program commandId index ordinal schedule state
        (first :: rest) remaining consumed step profile (by simp) chosen executed
      have witness : (∃ candidate, (first :: rest).length = 1 ∧
          applyInternalOperationOccurrence? program state candidate = some step.state) ∨
          (∃ batch successors, applyInternalOccurrenceBatch? program state batch = some successors ∧
            successors.length = (first :: rest).length ∧ successors.getLast? = some step.state) := by
        rcases mechanics with ⟨offer, candidate, _, length, _, applied, _⟩ |
          ⟨batch, successors, _, applied, length, endpoint, _, _⟩
        · exact Or.inl ⟨candidate, length, applied⟩
        · exact Or.inr ⟨batch, successors, applied, length, endpoint⟩
      obtain ⟨added, _, nextAbsent, phase⟩ := ContinuationCommandHistory.extend_post_entry_selected_execution
        program analysis admitted owner parent different instanceId values root ready initial before issued state step.state
        startId origin output startDeclared rootSelected parentIdentity started initiated prior records preceding parents
        entered history absent (first :: rest).length witness
      rcases phase with extended | ⟨_, _, _, _, _, terminalId, _, _, _, completed, _⟩
      · exact Or.inl ⟨records ++ added, extended, nextAbsent⟩
      · exact Or.inr ⟨terminalId, completed⟩
    · exact False.elim (completed_parallel_selection_refused program state profile id completed
        ordinal schedule remaining (first :: rest) consumed (by simp) chosen)

/-- PMIS-SELECT-01: actual committed scoped completion selects every remaining offer without a private choice. No successful closure or caller-supplied phase is assumed. -/
theorem ParallelScopeCommandBoundaryReachable.scoped_completion_selection_total
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (actor : ScopeOccurrenceId) (resumed : scopedWaitCompletionOwner program stable stimulus actor)
    (fuel : Nat) (current : RuntimeState)
    (closed : current = (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
      (admitStimulus program stable stimulus).state).state)
    (nonempty : (deriveInternalExecutionFrontier program current).offers ≠ [])
    (ordinal : Nat) (schedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program current) =
      .execute (deriveInternalExecutionFrontier program current).offers schedule false := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  have ingress := scoped_admission_owner_frame program stable stimulus actor selected instanceId running resumed committed
  rcases reachable.initialized_certificate program analysis admitted stable with original | ⟨seed, absent, phases⟩
  · subst stable
    simp [initialState] at running
  let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  obtain ⟨id, origin, output, initial, records, declared, initiated, phase⟩ := phases observer rfl
  rcases phase with ⟨parents, _⟩ |
    ⟨before, issued, prior, entryRecord, suffix, _, parents, preceding, kind, replayed, entered, following⟩
  · obtain ⟨entry, binding, bound⟩ := ingress.actorBound
    have empty := (parents.clean_and_foreign_marking program analysis.entry seed.parent stable).1.2.2.1
    simp [parallelScopeBinding?, running, empty] at bound
  rcases following with history | ⟨_, _, _, _, _, _, _, ⟨terminalId, terminal⟩, _⟩
  · have clean := (parents.clean_and_foreign_marking program analysis.entry seed.parent before).1
    have different : observer ≠ seed.parent := by
      intro same
      exact clean.2.1 (congrArg ScopeOccurrenceId.definitionScopeId same)
    have actualEntry := replayed_parallel_entry_execution program analysis admitted before issued entryRecord kind replayed
    have entryOwner : entryRecord.owner = seed.parent := by
      apply Classical.byContradiction
      intro other
      unfold enterParallelScope? at actualEntry
      simp [clean.1, Ne.symm other] at actualEntry
    have structural := history.structural_frame program observer seed.parent selected issued stable suffix
      (enterParallelScope_structural_parallel_frame analysis.entry seed.parent before issued clean
        (parents.structural_frame program analysis.entry seed.parent before) entered)
    have entryStructural : ParallelScopeStructuralFrame entryRecord.owner stable := entryOwner ▸ structural
    have stableFrontier : (deriveInternalExecutionFrontier program stable).offers = [] ∧
        (deriveInternalExecutionFrontier program stable).preparationFailed = false := by
      simpa using reachable.running_stable program selected stable instanceId running
    obtain ⟨capacity, accepted⟩ := Option.isSome_iff_exists.mp
      (parallelScope_committed_resumption_capacity program analysis stable stimulus selected admitted completion committed)
    have blocked : ∀ scope ∈ stable.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
        scopeQuiescent stable scope.id = false := by
      intro scope member child
      obtain ⟨binding, bound⟩ := programStateCapacity_live_body_binding program analysis stable capacity admitted accepted scope member child
      exact parallelScope_stable_resumption_body_nonquiescent program analysis selected admitted before issued stable entryRecord
        kind replayed stimulus completion committed scope.id binding entryStructural bound stableFrontier.1 stableFrontier.2
    have startReachable : ParallelScopeInternalPrefixReachable program (admitStimulus program stable stimulus).state :=
      .admitted stable stimulus reachable committed
    obtain ⟨_, _, currentReachable⟩ := closeScheduledTraced_parallelScope_prefix_reachable program profile
      (stimulusCommandId stimulus) fuel 1 0 [] (admitStimulus program stable stimulus).state startReachable
    rw [← closed] at currentReachable
    rcases reachable.scoped_retirement_sibling_frame program analysis selected admitted before issued stable entryRecord kind
      replayed instanceId running stimulus completion committed entryStructural actor resumed fuel with frame |
      ⟨cut, frame, _, _, binding, bound, completed, siblings⟩
    · rw [← closed] at frame
      exact currentReachable.scoped_resumption_selection_total program analysis admitted stable current instanceId
        (frame.control.trans running) actor frame stableFrontier.1 stableFrontier.2 blocked nonempty ordinal schedule
    · rcases completeParallelScope_survivor_or_final_return analysis.entry entryRecord.owner actor cut.before cut.step.state binding
        (frame.population entryRecord.owner entryStructural) bound completed with ⟨iteration, member, other, survives⟩ | returned
      · have empty := (siblings iteration member other survives).2.2
        rw [closed, (cut.stable_success empty).1, empty] at nonempty
        exact False.elim (nonempty rfl)
      · have snapshots : program.compensationEventSubProcessSnapshots = none := by
          cases snapshot : program.compensationEventSubProcessSnapshots with
          | none => rfl
          | some value => simp [analyzeProgram, snapshot] at admitted
        have admittedHistory := history.extend_wait_admission program observer selected snapshots issued stable suffix stimulus completion committed
        obtain ⟨_, admissionAbsent, _⟩ := startReachable.start_certificate program analysis admitted _
        have atCut := post_entry_prefix_history program (stimulusCommandId stimulus) analysis admitted observer seed.parent different
          seed.instanceId seed.values seed.root seed.ready initial before issued _ id origin output declared seed.rootSelected rfl
          seed.started initiated prior suffix preceding parents entered admittedHistory admissionAbsent fuel 1 0
          cut.fuel (cut.index + 1) (cut.ordinal + if cut.consumed then 1 else 0) [] cut.remaining cut.step.state cut.after_prefix
        rcases atCut with ⟨cutRecords, cutHistory, _⟩ | ⟨terminalId, terminal⟩
        · exact closeScheduledTraced_post_retirement_selection_total program (stimulusCommandId stimulus) analysis admitted observer seed.parent
            different seed.instanceId seed.values seed.root seed.ready initial before issued cut.step.state id origin output declared
            seed.rootSelected rfl seed.started initiated prior cutRecords preceding parents entered cutHistory returned.activities
            (reachable_at_scheduled_prefix cut.after_prefix profile startReachable) cut.fuel (cut.index + 1)
            (cut.ordinal + if cut.consumed then 1 else 0) cut.remaining current (closed.trans cut.continuation.1) nonempty ordinal schedule
        · have cutRunning := returned.control.trans (frame.control.trans running)
          rw [cutRunning] at terminal
          contradiction
  · rw [running] at terminal
    contradiction

private theorem entry_cut_selection_total
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (commandId : SemanticId) (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule) (state : RuntimeState)
    (reachable : ParallelScopeInternalPrefixReachable program state)
    (cut : ParallelScopeSingletonCut program commandId fuel index ordinal schedule state)
    (entryKind : cut.operation.kind = .enterParallelMultiInstanceScope)
    (current : RuntimeState) (closed : current = (closeScheduledTraced fuel program commandId index ordinal schedule state).state)
    (nonempty : (deriveInternalExecutionFrontier program current).offers ≠ [])
    (nextOrdinal : Nat) (nextSchedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode nextOrdinal nextSchedule
      (deriveInternalExecutionFrontier program current) =
      .execute (deriveInternalExecutionFrontier program current).offers nextSchedule false := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  have beforeReachable := reachable_at_scheduled_prefix cut.path profile reachable
  have afterReachable := reachable_at_scheduled_prefix cut.after_prefix profile reachable
  obtain ⟨seed, _, phases⟩ := beforeReachable.start_certificate program analysis admitted cut.before
  obtain ⟨_, absent, _⟩ := afterReachable.start_certificate program analysis admitted cut.step.state
  let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  rcases phases observer rfl with ready | ⟨id, origin, output, initial, records, declared, initiated, phase⟩
  · have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    change _ = seed.ready at raw
    have tokens : cut.before.tokens = [] := by rw [ready, ← raw]; rfl
    have actual := replayed_parallel_entry_execution program analysis admitted cut.before cut.step.state
      { operationId := cut.candidate.operationId, operationKind := cut.operation.kind,
        origin := cut.operation.origin, owner := cut.candidate.owner, mergeInput := none } entryKind
      (by
        obtain ⟨operation, resolved, _, replayed⟩ := applyInternalOperationOccurrence_replay_record program cut.before cut.step.state cut.candidate profile cut.applied
        have same := Option.some.inj (resolved.symm.trans cut.resolved)
        simpa only [same] using replayed)
    simp [enterParallelScope?, tokens] at actual
  rcases phase with ⟨parents, history⟩ |
    ⟨before, issued, prior, entryRecord, suffix, _, parents, preceding, _, _, entered, following⟩
  · obtain ⟨operation, record, resolved, _, _, _, metadata, _, replayed, phases⟩ :=
      parents.pre_entry_occurrence_phases program analysis admitted seed.parent cut.before cut.step.state cut.candidate cut.applied
    have same := Option.some.inj (resolved.symm.trans cut.resolved)
    have kind : record.operationKind = .enterParallelMultiInstanceScope := by simpa only [same, metadata] using entryKind
    rcases phases with ⟨other, _⟩ | ⟨other, _⟩ | ⟨_, entry⟩ | ⟨other, _⟩
    · simp [kind] at other
    · simp [kind] at other
    · exact closeScheduledTraced_initial_entry_selection_total program commandId analysis admitted observer seed.parent
        seed.instanceId seed.values seed.root seed.ready initial cut.before cut.step.state id origin output declared seed.rootSelected
        rfl seed.started initiated records history parents entry absent cut.fuel (cut.index + 1)
        (cut.ordinal + if cut.consumed then 1 else 0) cut.remaining afterReachable current
        (closed.trans cut.continuation.1) nonempty nextOrdinal nextSchedule
    · simp [kind] at other
  · rcases following with history | ⟨_, _, _, _, _, _, _, ⟨terminalId, terminal⟩, _⟩
    · obtain ⟨operation, record, resolved, _, _, metadata, _, kinds⟩ := preceding.post_entry_occurrence_phases
        program analysis admitted observer seed.parent seed.instanceId seed.values seed.root seed.ready initial before issued
        cut.before cut.step.state id origin output declared seed.rootSelected rfl seed.started initiated prior suffix parents entered
        history cut.candidate cut.applied
      have same := Option.some.inj (resolved.symm.trans cut.resolved)
      simp [metadata, same, entryKind] at kinds
    · have applied := cut.applied
      simp [applyInternalOperationOccurrence?, terminal] at applied

/-- PMIS-SELECT-01 follows actual pre-entry closure through its unique entry cut, including initial population draining. -/
theorem ParallelScopeParentHistory.command_selection_total
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (parent : ScopeOccurrenceId) (state : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent state)
    (reachable : ParallelScopeInternalPrefixReachable program state)
    (commandId : SemanticId) (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (current : RuntimeState) (closed : current = (closeScheduledTraced fuel program commandId index ordinal schedule state).state)
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
  let exited : Prop := ∃ cut : ParallelScopeSingletonCut program commandId fuel index ordinal schedule state,
    cut.operation.kind = .enterParallelMultiInstanceScope
  obtain ⟨_, _, _, _, _, _, result⟩ := closeScheduledTraced_cursor_induction program commandId
    (fun remainingFuel position nextOrdinal nextSchedule current =>
      ScheduledClosurePrefix program commandId fuel index ordinal schedule state remainingFuel position nextOrdinal nextSchedule current ∧
      (ParallelScopeParentHistory program analysis.entry parent current ∨ exited)) (by
      intro nextFuel position nextOrdinal nextSchedule before first rest remaining consumed step earlier unstable chosen enough executed
      refine ⟨.step earlier.1 unstable chosen enough executed, ?_⟩
      rcases earlier.2 with parents | exit
      · rcases executeSelectedFrontier_parallel_scope_steps program commandId position nextOrdinal nextSchedule before
          (first :: rest) remaining consumed step profile (by simp) chosen executed with
          ⟨offer, candidate, shape, _, alternative, applied, _⟩ |
          ⟨batch, successors, _, applied, _, endpoint, _, _⟩
        · obtain ⟨operation, record, resolved, _, _, _, metadata, _, replayed, phases⟩ :=
            parents.pre_entry_occurrence_phases program analysis admitted parent before step.state candidate applied
          rcases phases with ⟨_, _, _, nextParents⟩ | ⟨_, nextParents⟩ | ⟨kind, _⟩ | ⟨kind, _⟩
          · exact Or.inl nextParents
          · exact Or.inl nextParents
          · obtain ⟨rfl, rfl⟩ := List.cons.inj shape
            exact Or.inr ⟨{
              fuel := nextFuel, index := position, ordinal := nextOrdinal, schedule := nextSchedule
              remaining, consumed, before, offer := first, step, candidate, operation
              path := earlier.1, unstable, selected := chosen, alternative, resolved, applied
              after_prefix := by
                simpa only [List.length_nil, Nat.sub_zero, Nat.add_zero] using
                  ScheduledClosurePrefix.step earlier.1 unstable chosen (Nat.zero_le _) executed },
              by simpa only [metadata] using kind⟩
          · exact False.elim (parents.no_root_completion_replay program analysis admitted parent before step.state record kind replayed)
        · have currentReachable := reachable_at_scheduled_prefix earlier.1 profile reachable
          obtain ⟨_, absent, _⟩ := currentReachable.start_certificate program analysis admitted before
          let observer : ScopeOccurrenceId := ⟨parent.processInstanceId, analysis.entry.childScopeId, 1⟩
          have different : observer ≠ parent := by
            intro same
            exact (parents.clean_and_foreign_marking program analysis.entry parent before).1.2.1
              (congrArg ScopeOccurrenceId.definitionScopeId same)
          obtain ⟨_, _, nextParents, _⟩ := ContinuationCommandHistory.reserved_batch_parent_history program analysis admitted
            observer parent selected before before [] (.initial before) parents batch successors applied absent different
          exact Or.inl (by simpa only [endpoint, Option.getD_some] using nextParents)
      · exact Or.inr exit) fuel index ordinal schedule state ⟨.initial, Or.inl parents⟩
  rw [← closed] at result
  rcases result with parents | ⟨cut, kind⟩
  · obtain ⟨_, _, currentReachable⟩ := closeScheduledTraced_parallelScope_prefix_reachable program profile commandId
      fuel index ordinal schedule state reachable
    rw [← closed] at currentReachable
    have clean := (parents.clean_and_foreign_marking program analysis.entry parent current).1
    apply currentReachable.blocked_children_selection_total program analysis admitted current parent.processInstanceId
      (parents.running_control program analysis.entry parent current) ?_ nonempty nextOrdinal nextSchedule
    intro occurrence member child
    have same : occurrence = ⟨parent, none⟩ := by simpa only [clean.1, List.mem_singleton] using member
    exact False.elim (clean.2.1 (by simpa only [same] using child.symm))
  · exact entry_cut_selection_total program analysis admitted commandId fuel index ordinal schedule state reachable cut kind
      current closed nonempty nextOrdinal nextSchedule

/-- Committed pre-entry Human/Service resumption can cross parallel entry without assuming that the entry population has already drained. -/
theorem ParallelScopeParentHistory.completion_selection_total
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (parent : ScopeOccurrenceId) (stable : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent stable)
    (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat) (current : RuntimeState)
    (closed : current = (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
      (admitStimulus program stable stimulus).state).state)
    (nonempty : (deriveInternalExecutionFrontier program current).offers ≠ [])
    (ordinal : Nat) (schedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program current) =
      .execute (deriveInternalExecutionFrontier program current).offers schedule false := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  exact (parents.wait_admission program analysis.entry parent stable stimulus selected completion).command_selection_total
    program analysis admitted parent _ (.admitted stable stimulus reachable committed)
    (stimulusCommandId stimulus) fuel 1 0 [] current closed nonempty ordinal schedule

/-- Accepted Start derives complete selection across initiation, parent prelude, parallel entry and initial draining; the caller supplies no phase or populated-collection premise. -/
theorem parallelScope_start_command_selection_total
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (commandId processId instanceId : SemanticId) (values : List VariableBinding)
    (committed : (admitStimulus program initialState (.startProcess commandId processId instanceId values)).outcome = .committed)
    (fuel : Nat) (current : RuntimeState)
    (closed : current = (closeScheduledTraced fuel program commandId 1 0 []
      (admitStimulus program initialState (.startProcess commandId processId instanceId values)).state).state)
    (nonempty : (deriveInternalExecutionFrontier program current).offers ≠ [])
    (ordinal : Nat) (schedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program current) =
      .execute (deriveInternalExecutionFrontier program current).offers schedule false := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  obtain ⟨started, _, _⟩ := parallelScope_committed_start_exact program selected commandId processId instanceId values committed
  have builder := started
  unfold runningProgramStartState? at builder
  obtain ⟨root, rootSelected, _⟩ := Option.bind_eq_some_iff.mp builder
  exact ParallelScopeParentHistory.command_selection_total program analysis admitted ⟨instanceId, root.id, 1⟩ _
    (.start instanceId root values _ rootSelected started rfl
      (analyzeProgram_child_root_distinct program analysis admitted root rootSelected))
    (.admitted initialState (.startProcess commandId processId instanceId values) .initial committed)
    commandId fuel 1 0 [] current closed nonempty ordinal schedule

private theorem entry_foreign_credit_zero (program : Program) (entry : ParallelScopeEntry)
    (parent queried : ScopeOccurrenceId) (before issued : RuntimeState)
    (parents : ParallelScopeParentHistory program entry parent before)
    (entered : enterParallelScope? entry before parent = some issued)
    (different : queried ≠ parent) (foreignScope : queried.definitionScopeId ≠ entry.childScopeId)
    (place : ControlPlaceId) : continuationMarking issued queried place = 0 := by
  have zero := (parents.clean_and_foreign_marking program entry parent before).2 queried different place
  have removed := filter_removeToken_of_rejected before.tokens entry.input parent
    (fun token => token.owner == queried && token.placeId == place) (by simp [Ne.symm different])
  have consumed : continuationMarking { before with tokens := removeToken before.tokens entry.input parent } queried place = 0 := by
    simpa only [continuationMarking, removed] using zero
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    have added := addToken_filter_length (removeToken before.tokens entry.input parent)
      entry.normalOutput parent (fun token => token.owner == queried && token.placeId == place)
    simp only [continuationMarking] at consumed ⊢
    simp [Ne.symm different] at added
    omega
  · obtain ⟨⟨bodies, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
      cases Option.some.inj installed
      have balance := issueParallelBodies_continuation_balance entry parent _ 0 _ bodies (first :: rest) generated queried place
      have charges : ((first :: rest).map (fun iteration => ownedPortCount [entry.childEntry] iteration.scope queried place)).sum = 0 := by
        apply List.sum_eq_zero_iff_forall_eq_nat.mpr
        intro charge member
        obtain ⟨iteration, present, rfl⟩ := List.mem_map.mp member
        apply ownedPortCount_foreign
        intro equal
        exact foreignScope (equal ▸ (issueParallelBodies_scope_domain generated iteration present).2)
      rw [consumed, charges] at balance
      simpa only [continuationMarking] using balance

private theorem post_entry_foreign_credit_zero (program : Program) (entry : ParallelScopeEntry)
    (observer parent queried : ScopeOccurrenceId) (selected : programSelected program = true)
    (before issued current : RuntimeState) (parents : ParallelScopeParentHistory program entry parent before)
    (entered : enterParallelScope? entry before parent = some issued)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program observer issued current records)
    (different : queried ≠ parent) (foreignScope : queried.definitionScopeId ≠ entry.childScopeId)
    (place : ControlPlaceId) : continuationMarking current queried place = 0 := by
  have clean := (parents.clean_and_foreign_marking program entry parent before).1
  have frame := enterParallelScope_structural_parallel_frame entry parent before issued clean
    (parents.structural_frame program entry parent before) entered
  have reindexed := history.reindex_nonparent program observer queried parent selected issued current records frame different
  have balance := reindexed.continuation_budget program queried selected issued current records place
  have zero := entry_foreign_credit_zero program entry parent queried before issued parents entered different foreignScope place
  have domain := enterParallelScope_clean_scope_domain entry parent before issued clean entered
  have charges : (records.map (transitionPortCharge program bodyProducedPorts queried place)).sum = 0 := by
    apply List.sum_eq_zero_iff_forall_eq_nat.mpr
    intro charge member
    obtain ⟨transition, present, rfl⟩ := List.mem_map.mp member
    obtain ⟨record, occurrence, operation, rfl, live, owned, lookup, _⟩ :=
      history.record_population_coverage program observer selected issued current records transition present
    simp only [transitionPortCharge, lookup]
    apply ownedPortCount_foreign
    intro equal
    rcases domain occurrence live with root | body
    · exact different (equal.symm.trans (owned.symm.trans root))
    · exact foreignScope (by simpa only [owned, equal] using body)
  rw [zero, charges] at balance
  omega

private theorem committed_completion_credit (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (selected : programSelected program = true) (stimulus : Stimulus)
    (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program state stimulus).outcome = .committed) :
    (∃ actor, scopedWaitCompletionOwner program state stimulus actor) ∨
      ∃ actor place, actor.definitionScopeId ≠ analysis.entry.childScopeId ∧
        0 < continuationMarking state actor place := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
  have snapshots : program.compensationEventSubProcessSnapshots = none := by
    cases snapshot : program.compensationEventSubProcessSnapshots with
    | none => rfl
    | some value => simp [analyzeProgram, snapshot] at admitted
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    have applied : (ParallelScopeCommand.completeTask? program state id values).isSome = true := by
      cases result : ParallelScopeCommand.completeTask? program state id values <;>
        cases incidents : state.effectIncidents <;>
        simp [admitStimulus, snapshots, running, selected, result, incidents] at committed ⊢
      all_goals repeat' split at committed <;> contradiction
    unfold ParallelScopeCommand.completeTask? at applied
    split at applied <;> try contradiction
    rename_i wait chosen
    cases routed : hasParallelScopeDefinition program wait.owner with
    | true => exact Or.inl ⟨wait.owner, wait, chosen, routed, rfl⟩
    | false =>
      have foreignScope : wait.owner.definitionScopeId ≠ analysis.entry.childScopeId := by
        unfold hasParallelScopeDefinition at routed
        rw [entries] at routed
        simp only [List.any_cons, List.any_nil, Bool.or_false, beq_eq_false_iff_ne] at routed
        exact Ne.symm routed
      have member : wait ∈ state.waits := (List.mem_filter.mp (chosen.symm ▸ List.mem_singleton_self wait)).1
      have present : wait ∈ state.waits.filter (fun current => current.owner == wait.owner && current.output == wait.output) := by simp [member]
      have positive : 0 < (state.waits.filter (fun current => current.owner == wait.owner && current.output == wait.output)).length :=
        List.length_pos_iff.mpr (by intro empty; simp [empty] at present)
      refine Or.inr ⟨wait.owner, wait.output, foreignScope, ?_⟩
      simp only [continuationMarking]
      omega
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    rename_i values
    have applied : (ParallelScopeCommand.completeEffect? program state id (.success values)).isSome = true := by
      cases result : ParallelScopeCommand.completeEffect? program state id (.success values) <;>
        cases incidents : state.effectIncidents <;>
        simp [admitStimulus, snapshots, running, selected, result, incidents] at committed ⊢
      all_goals repeat' split at committed <;> contradiction
    unfold ParallelScopeCommand.completeEffect? at applied
    split at applied <;> try contradiction
    rename_i wait chosen
    cases routed : hasParallelScopeDefinition program wait.owner with
    | true => exact Or.inl ⟨wait.owner, wait, chosen, routed, rfl⟩
    | false =>
      have foreignScope : wait.owner.definitionScopeId ≠ analysis.entry.childScopeId := by
        unfold hasParallelScopeDefinition at routed
        rw [entries] at routed
        simp only [List.any_cons, List.any_nil, Bool.or_false, beq_eq_false_iff_ne] at routed
        exact Ne.symm routed
      have member : wait ∈ state.effectWaits := (List.mem_filter.mp (chosen.symm ▸ List.mem_singleton_self wait)).1
      have present : wait ∈ state.effectWaits.filter (fun current => current.owner == wait.owner && current.output == wait.output) := by simp [member]
      have positive : 0 < (state.effectWaits.filter (fun current => current.owner == wait.owner && current.output == wait.output)).length :=
        List.length_pos_iff.mpr (by intro empty; simp [empty] at present)
      refine Or.inr ⟨wait.owner, wait.output, foreignScope, ?_⟩
      simp only [continuationMarking]
      omega

/-- PMIS-SELECT-01 derives complete selection for every committed Human/Service completion from its actual reachable command boundary. -/
theorem ParallelScopeCommandBoundaryReachable.completion_selection_total
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat) (current : RuntimeState)
    (closed : current = (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
      (admitStimulus program stable stimulus).state).state)
    (nonempty : (deriveInternalExecutionFrontier program current).offers ≠ [])
    (ordinal : Nat) (schedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program current) =
      .execute (deriveInternalExecutionFrontier program current).offers schedule false := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  rcases committed_completion_credit program analysis admitted stable instanceId running selected stimulus completion committed with
    ⟨actor, resumed⟩ | ⟨actor, place, foreignScope, positive⟩
  · exact reachable.scoped_completion_selection_total program analysis admitted stable instanceId running stimulus completion committed
      actor resumed fuel current closed nonempty ordinal schedule
  rcases reachable.initialized_certificate program analysis admitted stable with original | ⟨seed, _, phases⟩
  · subst stable
    simp [initialState] at running
  let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  obtain ⟨id, origin, output, initial, records, declared, initiated, phase⟩ := phases observer rfl
  rcases phase with ⟨parents, _⟩ |
    ⟨before, issued, prior, entryRecord, suffix, _, parents, preceding, _, _, entered, following⟩
  · exact parents.completion_selection_total program analysis admitted seed.parent stable reachable stimulus completion committed
      fuel current closed nonempty ordinal schedule
  rcases following with history | ⟨_, _, _, _, _, _, _, ⟨terminalId, terminal⟩, _⟩
  · have owner : actor = seed.parent := by
      by_cases same : actor = seed.parent
      · exact same
      have zero := post_entry_foreign_credit_zero program analysis.entry observer seed.parent actor selected before issued stable
        parents entered suffix history same foreignScope place
      rw [zero] at positive
      omega
    have retired := history.parent_credit_requires_retirement program analysis admitted observer seed.parent selected before issued stable
      parents entered suffix place (by simpa only [owner] using positive)
    have snapshots : program.compensationEventSubProcessSnapshots = none := by
      cases snapshot : program.compensationEventSubProcessSnapshots with
      | none => rfl
      | some value => simp [analyzeProgram, snapshot] at admitted
    have admittedHistory := history.extend_wait_admission program observer selected snapshots issued stable suffix stimulus completion committed
    have different : observer ≠ seed.parent := by
      intro same
      exact (parents.clean_and_foreign_marking program analysis.entry seed.parent before).1.2.1
        (congrArg ScopeOccurrenceId.definitionScopeId same)
    exact closeScheduledTraced_post_retirement_selection_total program (stimulusCommandId stimulus) analysis admitted observer seed.parent
      different seed.instanceId seed.values seed.root seed.ready initial before issued _ id origin output declared seed.rootSelected rfl
      seed.started initiated prior suffix preceding parents entered admittedHistory
      ((admission_parent_activities program stable stimulus selected completion).trans retired)
      (.admitted stable stimulus reachable committed) fuel 1 0 [] current closed nonempty ordinal schedule
  · rw [running] at terminal
    contradiction

/-- PMIS-SELECT-01 covers the complete committed-ingress grammar at actual command boundaries; phase, control and resumed-owner premises are derived internally. -/
theorem ParallelScopeCommandBoundaryReachable.command_selection_total
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (stimulus : Stimulus) (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat) (current : RuntimeState)
    (closed : current = (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
      (admitStimulus program stable stimulus).state).state)
    (nonempty : (deriveInternalExecutionFrontier program current).offers ≠ [])
    (ordinal : Nat) (schedule : InternalChoiceSchedule) :
    selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program current) =
      .execute (deriveInternalExecutionFrontier program current).offers schedule false := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  rcases parallelScope_committed_ingress_kind program selected stable stimulus committed with
    ⟨commandId, processId, instanceId, values, rfl, control⟩ | completion
  · rcases reachable.initialized_certificate program analysis admitted stable with rfl | ⟨seed, _, phases⟩
    · exact parallelScope_start_command_selection_total program analysis admitted commandId processId instanceId values
        committed fuel current closed nonempty ordinal schedule
    · obtain ⟨id, origin, output, initial, records, _, _, phase⟩ :=
        phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl
      exact False.elim (phase.not_notStarted program analysis selected _ seed.parent initial stable records control)
  · have running : ∃ instanceId, stable.control = .running instanceId := by
      cases control : stable.control <;> try exact ⟨_, rfl⟩
      all_goals cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
      all_goals cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases incidents : stable.effectIncidents <;> simp [admitStimulus, snapshot, control, incidents] at committed
    obtain ⟨instanceId, running⟩ := running
    exact reachable.completion_selection_total program analysis admitted stable instanceId running stimulus completion committed
      fuel current closed nonempty ordinal schedule

end BpmnSemantics.SemanticProcess
