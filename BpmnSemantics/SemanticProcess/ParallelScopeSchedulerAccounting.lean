import BpmnSemantics.SemanticProcess.InternalScheduledClosure
import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability
import BpmnSemantics.SemanticProcess.ParallelScopeRecordAccounting
import BpmnSemantics.SemanticProcess.ParallelScopeParentProgress
import BpmnSemantics.SemanticProcess.ParallelScopeWaitHistoryProofs
import BpmnSemantics.SemanticProcess.ParallelScopeLocalFrameHistoryProofs
import BpmnSemantics.SemanticProcess.ParallelScopeLogicalTimeProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReservationAncestryProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReservationOwnerProofs

/-! # Parallel scope scheduler phase accounting

PMIS-SELECT-01 accounts for actual selected execution before publication. This downstream owner composes phase-aware lifetime history with the runtime closure prefix law, including fuel exhaustion and terminal root completion.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem completed_parallel_selection_refused (program : Program) (state : RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (completed : state.control = .completed instanceId)
    (ordinal : Nat) (schedule remaining : InternalChoiceSchedule) (offers : List InternalExecutionOffer)
    (consumed : Bool) (nonempty : offers ≠ [])
    (selected : selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program state) = .execute offers remaining consumed) : False := by
  let frontier := deriveInternalExecutionFrontier program state
  have empty : frontier.offers = [] := by
    cases discovered : frontier.offers with
    | nil => rfl
    | cons first rest =>
      obtain ⟨candidate, _, applied, _⟩ := deriveInternalExecutionFrontier_occurrence_sound program state profile first
        (by change first ∈ frontier.offers; rw [discovered]; simp)
      simp only [applyInternalOperationOccurrence?, completed] at applied
      contradiction
  change selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule frontier = _ at selected
  unfold selectInternalExecutionFrontier at selected
  rw [empty] at selected
  split at selected <;> try contradiction
  split at selected
  · cases selected
    exact nonempty rfl
  · simp [classifyPreparedInternalFrontier, sortBy] at selected

open ParallelScopeReplay in
/-- Post-entry PMIS closure retains actual body accounting or its final root-completion boundary for every outcome, including fuel exhaustion and publication-free execution. -/
theorem closeScheduledTraced_post_entry_history (program : Program) (commandId : SemanticId)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued startState : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial) (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued startState suffix)
    (noCompensation : startState.compensationHandlerEffectWaits = [])
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule) :
    ∃ spent added, spent ≤ fuel ∧ added.length = spent ∧
      (closeScheduledTraced fuel program commandId index ordinal schedule startState).state.compensationHandlerEffectWaits = [] ∧
      (ContinuationCommandHistory program owner issued
        (closeScheduledTraced fuel program commandId index ordinal schedule startState).state (suffix ++ added) ∨
        ∃ terminalPrefix record middle, added = terminalPrefix ++ [.internalOperation record] ∧
          ContinuationCommandHistory program owner issued middle (suffix ++ terminalPrefix) ∧
          record.operationKind = .completeScope ∧ replayInternalOperationOccurrence? program middle record =
            some (closeScheduledTraced fuel program commandId index ordinal schedule startState).state ∧
          (∃ terminalInstance, (closeScheduledTraced fuel program commandId index ordinal schedule startState).state.control = .completed terminalInstance) ∧
          ∀ next, replayInternalOperationOccurrence? program
            (closeScheduledTraced fuel program commandId index ordinal schedule startState).state next = none) := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selected : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selected] at admitted
    | true => simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  let predicate : Nat → RuntimeState → Prop := fun position current =>
    ∃ added : List CommittedTransition, position = index + added.length ∧ current.compensationHandlerEffectWaits = [] ∧
      (ContinuationCommandHistory program owner issued current (suffix ++ added) ∨
        ∃ terminalPrefix record middle, added = terminalPrefix ++ [.internalOperation record] ∧
          ContinuationCommandHistory program owner issued middle (suffix ++ terminalPrefix) ∧ record.operationKind = .completeScope ∧
          replayInternalOperationOccurrence? program middle record = some current ∧
          (∃ terminalInstance, current.control = .completed terminalInstance) ∧
          ∀ next, replayInternalOperationOccurrence? program current next = none)
  have initialPredicate : predicate index startState := by
    refine ⟨[], by simp, noCompensation, Or.inl ?_⟩
    simpa only [List.append_nil] using following
  have retained := closeScheduledTraced_prefix_induction program commandId predicate (by
    intro position nextOrdinal nextSchedule current offers remaining consumed step retained nonempty selected executed
    obtain ⟨added, positionEq, currentAbsent, currentPhase⟩ := retained
    rcases currentPhase with currentHistory | terminal
    · have mechanics := executeSelectedFrontier_parallel_scope_steps program commandId position nextOrdinal
        nextSchedule current offers remaining consumed step profile nonempty selected executed
      have witness : (∃ candidate, offers.length = 1 ∧ applyInternalOperationOccurrence? program current candidate = some step.state) ∨
          (∃ batch successors, applyInternalOccurrenceBatch? program current batch = some successors ∧
            successors.length = offers.length ∧ successors.getLast? = some step.state) := by
        rcases mechanics with ⟨offer, candidate, _, length, _, applied, _⟩ | ⟨batch, successors, _, applied, length, last, _, _⟩
        · exact Or.inl ⟨candidate, length, applied⟩
        · exact Or.inr ⟨batch, successors, applied, length, last⟩
      obtain ⟨nextRecords, length, nextAbsent, nextPhase⟩ :=
        ContinuationCommandHistory.extend_post_entry_selected_execution program analysis admitted owner parent different
          instanceId values root ready initial before issued current step.state startId origin output startDeclared rootSelected
          parentIdentity started initiated priorRecords (suffix ++ added) preceding parents entered currentHistory currentAbsent offers.length witness
      refine ⟨added ++ nextRecords, ?_, nextAbsent, ?_⟩
      · simp only [List.length_append]
        omega
      · rcases nextPhase with extended | ⟨record, recordEq, kind, replayed, terminalRoot, terminalInstance, _, _, _, completed, refused⟩
        · exact Or.inl (by simpa only [List.append_assoc] using extended)
        · exact Or.inr ⟨added, record, current, by rw [recordEq], currentHistory, kind, replayed, ⟨terminalInstance, completed⟩, refused⟩
    · obtain ⟨terminalPrefix, record, middle, _, _, _, _, ⟨terminalInstance, completed⟩, _⟩ := terminal
      exact False.elim (completed_parallel_selection_refused program current profile terminalInstance completed
        nextOrdinal nextSchedule remaining offers consumed nonempty selected)
  ) fuel index ordinal schedule startState initialPredicate
  obtain ⟨spent, bounded, added, positionEq, finalAbsent, finalPhase⟩ := retained
  exact ⟨spent, added, bounded, by omega, finalAbsent, finalPhase⟩


open ParallelScopeReplay in
/-- Executed post-entry records fit accepted Start capacity; this counts actual prefixes without claiming that a selected next batch fits remaining fuel. -/
theorem closeScheduledTraced_post_entry_count_le_start_capacity (program : Program) (commandId : SemanticId)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued startState : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial) (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued startState suffix)
    (noCompensation : startState.compensationHandlerEffectWaits = [])
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (capacity : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program values = some capacity) :
    ∃ spent added, spent ≤ fuel ∧ added.length = spent ∧ priorRecords.length + suffix.length + spent + 2 ≤ capacity.closureBound ∧
      (closeScheduledTraced fuel program commandId index ordinal schedule startState).state.compensationHandlerEffectWaits = [] ∧
      (ContinuationCommandHistory program owner issued
        (closeScheduledTraced fuel program commandId index ordinal schedule startState).state (suffix ++ added) ∨
        ∃ terminalPrefix record middle, added = terminalPrefix ++ [.internalOperation record] ∧
          ContinuationCommandHistory program owner issued middle (suffix ++ terminalPrefix) ∧
          record.operationKind = .completeScope ∧ replayInternalOperationOccurrence? program middle record =
            some (closeScheduledTraced fuel program commandId index ordinal schedule startState).state ∧
          (∃ terminalInstance, (closeScheduledTraced fuel program commandId index ordinal schedule startState).state.control = .completed terminalInstance) ∧
          ∀ next, replayInternalOperationOccurrence? program
            (closeScheduledTraced fuel program commandId index ordinal schedule startState).state next = none) := by
  obtain ⟨spent, added, bounded, length, absent, phase⟩ :=
    closeScheduledTraced_post_entry_history program commandId analysis admitted owner parent different instanceId values root
      ready initial before issued startState startId origin output startDeclared rootSelected parentIdentity started initiated
      priorRecords suffix preceding parents entered following noCompensation fuel index ordinal schedule
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  have counted : priorRecords.length + suffix.length + spent + 2 ≤ capacity.closureBound := by
    rcases phase with finalHistory | ⟨terminalPrefix, record, middle, shape, terminalHistory, _, _, _, _⟩
    · have bound := preceding.two_phase_record_count_le_start_capacity program analysis admitted owner parent selected
        instanceId values root ready initial before issued _ startId origin output startDeclared rootSelected parentIdentity
        started initiated priorRecords (suffix ++ added) parents entered finalHistory capacity startCapacity
      simp only [List.length_append] at bound
      omega
    · have bound := preceding.two_phase_record_count_le_start_capacity program analysis admitted owner parent selected
        instanceId values root ready initial before issued middle startId origin output startDeclared rootSelected parentIdentity
        started initiated priorRecords (suffix ++ terminalPrefix) parents entered terminalHistory capacity startCapacity
      have actualLength := congrArg List.length shape
      simp only [List.length_append, List.length_singleton] at bound actualLength
      omega
  exact ⟨spent, added, bounded, length, counted, absent, phase⟩


open ParallelScopeReplay in
/-- The phase witness retains actual entry separately from body records, preserving both sides of its accounting boundary. -/
def ParallelScopeSchedulerPhase (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState) (records : List CommittedTransition) : Prop :=
  (ParallelScopeParentHistory program analysis.entry parent current ∧
    ContinuationCommandHistory program owner initial current records) ∨
  ∃ before issued prior entryRecord suffix,
    records = prior ++ [.internalOperation entryRecord] ++ suffix ∧
    ParallelScopeParentHistory program analysis.entry parent before ∧
    ContinuationCommandHistory program owner initial before prior ∧
    entryRecord.operationKind = .enterParallelMultiInstanceScope ∧
    replayInternalOperationOccurrence? program before entryRecord = some issued ∧
    enterParallelScope? analysis.entry before parent = some issued ∧
    (ContinuationCommandHistory program owner issued current suffix ∨
      ∃ terminalPrefix record middle, suffix = terminalPrefix ++ [.internalOperation record] ∧
        ContinuationCommandHistory program owner issued middle terminalPrefix ∧ record.operationKind = .completeScope ∧
        replayInternalOperationOccurrence? program middle record = some current ∧
        (∃ instanceId, current.control = .completed instanceId) ∧
        ∀ next, replayInternalOperationOccurrence? program current next = none)

open ParallelScopeReplay in
/-- Actual phase provenance establishes canonical declarations before entry, during body execution and after terminal root completion. -/
theorem ParallelScopeSchedulerPhase.wait_declarations (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState)
    (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records) :
    waitDeclarationsValid program parent.processInstanceId current = true := by
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · exact parents.wait_declarations program analysis.entry parent current wellFormed
  · have beforeValid := parents.wait_declarations program analysis.entry parent before wellFormed
    have issuedValid := enterParallelScope_preserves_wait_declarations program parent.processInstanceId
      analysis.entry parent before issued beforeValid entered
    rcases later with history | ⟨terminalPrefix, record, middle, _, history, kind, replayed, _, _⟩
    · exact history.wait_declarations program parent.processInstanceId owner selected wellFormed
        issued current suffix issuedValid
    · have middleValid := history.wait_declarations program parent.processInstanceId owner selected wellFormed
        issued middle terminalPrefix issuedValid
      obtain ⟨scopeId, output, root, _, _, _, completed⟩ :=
        replayed_scope_completion_execution program middle current record kind replayed (ParallelScopeStart.analyzed_not_nested program analysis admitted)
      obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
      rw [completeSelectedScope?, unmonitored,
        completeBoundedScope_eq_completeScope_of_unbounded program middle scopeId output unbounded] at completed
      unfold completeScopeState? at completed
      split at completed <;> try contradiction
      split at completed <;> try contradiction
      unfold completeQuiescentScope? at completed
      all_goals repeat' split at completed
      all_goals first
        | contradiction
        | (cases Option.some.inj completed; exact middleValid)

open ParallelScopeReplay in
/-- Actual Start and phase history exclude every Activity-local frame queried by Human reservation. -/
theorem ParallelScopeSchedulerPhase.activity_frame_absent (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState)
    (records : List CommittedTransition) (query : ActivityOccurrenceId → Bool)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records) :
    (current.variables.activities.any fun frame =>
      match frame.owner with | .activityOccurrence id => query id | _ => false) = false := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · exact parents.activity_frame_absent program analysis.entry parent current query
  · have beforeValid := parents.activity_frame_absent program analysis.entry parent before query
    have issuedValid : (issued.variables.activities.any fun frame =>
        match frame.owner with | .activityOccurrence id => query id | _ => false) = false := by
      rw [enterParallelScope_activity_frames analysis.entry parent before issued entered]
      exact beforeValid
    rcases later with history | ⟨terminalPrefix, record, middle, _, history, kind, replayed, _, _⟩
    · exact history.activity_frame_absent program query owner selected
        issued current suffix issuedValid
    · have middleValid := history.activity_frame_absent program query owner selected
        issued middle terminalPrefix issuedValid
      obtain ⟨scopeId, output, root, _, _, _, completed⟩ :=
        replayed_scope_completion_execution program middle current record kind replayed (ParallelScopeStart.analyzed_not_nested program analysis admitted)
      obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
      rw [completeSelectedScope?, unmonitored,
        completeBoundedScope_eq_completeScope_of_unbounded program middle scopeId output unbounded] at completed
      unfold completeScopeState? at completed
      split at completed <;> try contradiction
      split at completed <;> try contradiction
      unfold completeQuiescentScope? at completed
      all_goals repeat' split at completed
      all_goals first
        | contradiction
        | (cases Option.some.inj completed; exact middleValid)

open ParallelScopeReplay in
/-- Actual scheduler phases retain Start logical time, including terminal root completion. -/
theorem ParallelScopeSchedulerPhase.logical_time (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState)
    (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records) :
    current.logicalTimeMs = 0 := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · exact parents.logical_time program analysis.entry parent current
  · have beforeValid := parents.logical_time program analysis.entry parent before
    have issuedValid := enterParallelScope_preserves_logical_time 0
      analysis.entry parent before issued beforeValid entered
    rcases later with history | ⟨terminalPrefix, record, middle, _, history, kind, replayed, _, _⟩
    · exact history.logical_time program 0 owner selected
        issued current suffix issuedValid
    · have middleValid := history.logical_time program 0 owner selected
        issued middle terminalPrefix issuedValid
      obtain ⟨scopeId, output, root, _, _, _, completed⟩ :=
        replayed_scope_completion_execution program middle current record kind replayed (ParallelScopeStart.analyzed_not_nested program analysis admitted)
      obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
      rw [completeSelectedScope?, unmonitored,
        completeBoundedScope_eq_completeScope_of_unbounded program middle scopeId output unbounded] at completed
      unfold completeScopeState? at completed
      split at completed <;> try contradiction
      split at completed <;> try contradiction
      unfold completeQuiescentScope? at completed
      all_goals repeat' split at completed
      all_goals first
        | contradiction
        | (cases Option.some.inj completed; exact middleValid)

open ParallelScopeReplay in
/-- A running scheduler phase supplies exact root ancestry for every resolved reservation candidate. -/
theorem ParallelScopeSchedulerPhase.reservation_owner_root_valid (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState)
    (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (instanceId : SemanticId) (running : current.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program current candidate = some operation) :
    occurrenceOwnerRootValid program current (current.scopeOccurrences.length + 1) candidate.owner = true := by
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · exact parents.reservation_owner_root_valid program analysis parent current admitted candidate operation resolved
  · rcases later with history | ⟨terminalPrefix, record, middle, _, history, kind, replayed, completed, _⟩
    · exact history.reservation_owner_root_valid_post_entry program analysis admitted owner parent before issued current
        parents entered suffix candidate operation resolved
    · obtain ⟨completedInstance, completed⟩ := completed
      rw [running] at completed
      cases completed

open ParallelScopeReplay in
/-- PMIS Start and entry provenance bound each live reservation owner and retain its admitted definition name. -/
theorem ParallelScopeSchedulerPhase.reservation_owner_bounds (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial current : RuntimeState)
    (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (instanceId : SemanticId) (running : current.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program current candidate = some operation) :
    (candidate.owner.processInstanceId = parent.processInstanceId ∧
      0 < candidate.owner.activation ∧ candidate.owner.activation ≤ 16) ∧
    candidate.owner.definitionScopeId.value.isEmpty = false := by
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · exact ⟨parents.reservation_owner_bounds program analysis.entry parent current candidate operation resolved,
      parents.reservation_owner_definition_nonempty program analysis parent current admitted candidate operation resolved⟩
  · rcases later with history | ⟨terminalPrefix, record, middle, _, history, kind, replayed, completed, _⟩
    · exact ⟨history.reservation_owner_bounds_post_entry program analysis admitted owner parent before issued current
        parents entered suffix candidate operation resolved,
        history.reservation_owner_definition_nonempty_post_entry program analysis admitted owner parent before issued current
          parents entered suffix candidate operation resolved⟩
    · obtain ⟨completedInstance, completed⟩ := completed
      rw [running] at completed
      cases completed

open ParallelScopeReplay in
/-- Phase provenance is preserved by actual occurrence or batch execution, independently of
whether the surrounding closure later commits, exhausts fuel or rejects publication. -/
theorem ParallelScopeSchedulerPhase.occurrence_execution (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (distinct : analysis.entry.childScopeId ≠ root.id)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (current after : RuntimeState) (earlier : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current earlier)
    (absent : current.compensationHandlerEffectWaits = [])
    (count : Nat)
    (witness : (∃ candidate, count = 1 ∧ applyInternalOperationOccurrence? program current candidate = some after) ∨
      (∃ batch successors, applyInternalOccurrenceBatch? program current batch = some successors ∧
        successors.length = count ∧ successors.getLast? = some after)) :
    ∃ added, added.length = count ∧ after.compensationHandlerEffectWaits = [] ∧
      ParallelScopeSchedulerPhase program analysis owner parent initial after (earlier ++ added) := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  have initialParents : ParallelScopeParentHistory program analysis.entry parent initial :=
    .initiate (.start instanceId root values ready rootSelected started parentIdentity distinct) output
      ⟨startId, origin, startDeclared⟩ initiated
  have initialFlag : initial.initiationPending = false := by
    unfold initiateState? at initiated
    obtain ⟨root, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
    split at initiated <;> try contradiction
    cases Option.some.inj initiated
    rfl
  rcases phase with ⟨currentParents, currentHistory⟩ |
    ⟨before, issued, prior, entryRecord, suffix, shape, parents, preceding, entryKind, entryReplay, entered, currentPhase⟩
  · obtain ⟨added, length, nextAbsent, nextPhase⟩ := currentHistory.extend_pre_entry_selected_execution
      program analysis admitted owner parent selected initial current after earlier initialParents absent different count witness
    refine ⟨added, length, nextAbsent, ?_⟩
    rcases nextPhase with ⟨nextParents, extended⟩ | ⟨record, recordEq, replayed, special⟩
    · exact Or.inl ⟨nextParents, extended⟩
    · rcases special with ⟨_, nextOutput, again, _⟩ | ⟨kind, entry⟩
      · have flag := (currentHistory.initiation_pending_frame program owner selected initial current earlier).trans initialFlag
        unfold initiateState? at again
        obtain ⟨root, _, again⟩ := Option.bind_eq_some_iff.mp again
        simp [flag] at again
      · exact Or.inr ⟨current, after, earlier, record, [], by simp [recordEq],
          currentParents, currentHistory, kind, replayed, entry, Or.inl (.initial after)⟩
  · rcases currentPhase with currentHistory | terminal
    · obtain ⟨added, length, nextAbsent, nextPhase⟩ :=
        ContinuationCommandHistory.extend_post_entry_selected_execution program analysis admitted owner parent different
          instanceId values root ready initial before issued current after startId origin output startDeclared rootSelected
          parentIdentity started initiated prior suffix preceding parents entered currentHistory absent count witness
      refine ⟨added, length, nextAbsent, Or.inr ?_⟩
      refine ⟨before, issued, prior, entryRecord, suffix ++ added, ?_, parents, preceding, entryKind, entryReplay, entered, ?_⟩
      · rw [← List.append_assoc, shape]
      · rcases nextPhase with extended | ⟨record, recordEq, kind, replayed, terminalRoot, terminalInstance, _, _, _, completed, refused⟩
        · exact Or.inl extended
        · exact Or.inr ⟨suffix, record, current, by rw [recordEq], currentHistory, kind, replayed,
            ⟨terminalInstance, completed⟩, refused⟩
    · obtain ⟨terminalPrefix, record, middle, _, _, _, _, ⟨terminalInstance, completed⟩, _⟩ := terminal
      rcases witness with ⟨candidate, _, applied⟩ | ⟨batch, successors, applied, _, endpoint⟩
      · simp [applyInternalOperationOccurrence?, completed] at applied
      · obtain ⟨length, steps⟩ := applyInternalOccurrenceBatch_ordered_steps program current batch successors applied
        cases successors with
        | nil => simp at endpoint
        | cons first rest =>
          cases members : batch.members with
          | nil => simp [members] at length
          | cons patch tail =>
            have step := steps (patch, current, first) (by simp [members])
            cases patch <;> simp [InternalOccurrencePatchStep, prepareReservedOccurrenceArm?,
              prepareOccurrenceTokenPatch?, completed] at step

open ParallelScopeReplay in
/-- One phase induction extends actual earlier records across pre-entry resumption, canonical entry and terminal completion for every closure outcome. -/
theorem closeScheduledTraced_phase_history (program : Program) (commandId : SemanticId)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (distinct : analysis.entry.childScopeId ≠ root.id)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (startState : RuntimeState) (earlier : List CommittedTransition)
    (initialPhase : ParallelScopeSchedulerPhase program analysis owner parent initial startState earlier)
    (noCompensation : startState.compensationHandlerEffectWaits = [])
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule) :
    ∃ spent records, spent ≤ fuel ∧ records.length = spent ∧
      (closeScheduledTraced fuel program commandId index ordinal schedule startState).state.compensationHandlerEffectWaits = [] ∧
      ParallelScopeSchedulerPhase program analysis owner parent initial
        (closeScheduledTraced fuel program commandId index ordinal schedule startState).state (earlier ++ records) := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  let predicate : Nat → RuntimeState → Prop := fun position current =>
    ∃ records : List CommittedTransition, position = index + records.length ∧
      current.compensationHandlerEffectWaits = [] ∧
      ParallelScopeSchedulerPhase program analysis owner parent initial current (earlier ++ records)
  have initialPredicate : predicate index startState := by
    refine ⟨[], by simp, noCompensation, ?_⟩
    simpa only [List.append_nil] using initialPhase
  have retained := closeScheduledTraced_prefix_induction program commandId predicate (by
    intro position nextOrdinal nextSchedule current offers remaining consumed step retained nonempty chosen executed
    obtain ⟨records, positionEq, absent, phase⟩ := retained
    have mechanics := executeSelectedFrontier_parallel_scope_steps program commandId position nextOrdinal
      nextSchedule current offers remaining consumed step profile nonempty chosen executed
    have witness : (∃ candidate, offers.length = 1 ∧ applyInternalOperationOccurrence? program current candidate = some step.state) ∨
        (∃ batch successors, applyInternalOccurrenceBatch? program current batch = some successors ∧
          successors.length = offers.length ∧ successors.getLast? = some step.state) := by
      rcases mechanics with ⟨offer, candidate, _, length, _, applied, _⟩ | ⟨batch, successors, _, applied, length, last, _, _⟩
      · exact Or.inl ⟨candidate, length, applied⟩
      · exact Or.inr ⟨batch, successors, applied, length, last⟩
    obtain ⟨added, length, nextAbsent, nextPhase⟩ := phase.occurrence_execution program analysis admitted owner parent
      different instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity distinct
      started initiated current step.state (earlier ++ records) absent offers.length witness
    refine ⟨records ++ added, ?_, nextAbsent, ?_⟩
    · simp only [List.length_append]; omega
    · simpa only [List.append_assoc] using nextPhase
  ) fuel index ordinal schedule startState initialPredicate
  obtain ⟨spent, bounded, records, positionEq, absent, phase⟩ := retained
  exact ⟨spent, records, bounded, by omega, absent, phase⟩


open ParallelScopeReplay in
/-- Actual Start and declared initiation supply the empty-record instance of the shared scheduler phase induction. -/
theorem closeScheduledTraced_after_initiation_phases (program : Program) (commandId : SemanticId)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (distinct : analysis.entry.childScopeId ≠ root.id)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule) :
    ∃ spent records, spent ≤ fuel ∧ records.length = spent ∧
      (closeScheduledTraced fuel program commandId index ordinal schedule initial).state.compensationHandlerEffectWaits = [] ∧
      ParallelScopeSchedulerPhase program analysis owner parent initial
        (closeScheduledTraced fuel program commandId index ordinal schedule initial).state records := by
  have parents : ParallelScopeParentHistory program analysis.entry parent initial :=
    .initiate (.start instanceId root values ready rootSelected started parentIdentity distinct) output
      ⟨startId, origin, startDeclared⟩ initiated
  have readyValid := runningProgramStartState_reservation_valid program instanceId values ready started
  have absent := (initiateState_reservation_valid ready initial output initiated readyValid.1 readyValid.2).2
  have phase : ParallelScopeSchedulerPhase program analysis owner parent initial initial [] :=
    Or.inl ⟨parents, .initial initial⟩
  simpa only [List.nil_append] using closeScheduledTraced_phase_history program commandId analysis admitted owner parent
    different instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity distinct
    started initiated initial [] phase absent fuel index ordinal schedule

open ParallelScopeReplay in
private theorem completed_wait_ingress_refused (program : Program) (before : RuntimeState)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (instanceId : SemanticId) (completed : before.control = .completed instanceId)
    (committed : (admitStimulus program before stimulus).outcome = .committed) : False := by
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    cases incidents : before.effectIncidents <;>
      simp [admitStimulus, snapshots, completed, incidents] at committed
    all_goals repeat' (split at committed <;> try contradiction)
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    cases incidents : before.effectIncidents <;>
      simp [admitStimulus, snapshots, completed, incidents] at committed
    all_goals repeat' (split at committed <;> try contradiction)

open ParallelScopeReplay in
/-- Actual committed wait ingress changes no internal records and preserves the established scheduler phase before closure. -/
theorem ParallelScopeSchedulerPhase.wait_admission (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (initial before : RuntimeState) (records : List CommittedTransition)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program before stimulus).outcome = .committed)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial before records)
    (absent : before.compensationHandlerEffectWaits = []) :
    ParallelScopeSchedulerPhase program analysis owner parent initial (admitStimulus program before stimulus).state records ∧
      (admitStimulus program before stimulus).state.compensationHandlerEffectWaits = [] := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  have snapshots : program.compensationEventSubProcessSnapshots = none := by
    cases snapshot : program.compensationEventSubProcessSnapshots with
    | none => rfl
    | some value => simp [ParallelScopeStart.analyzeProgram, snapshot] at admitted
  refine ⟨?_, admitStimulus_wait_compensation_absent program before stimulus selected completion absent⟩
  rcases phase with ⟨parents, history⟩ |
    ⟨entryBefore, issued, prior, entryRecord, suffix, shape, parents, preceding, entryKind, entryReplay, entered, following⟩
  · exact Or.inl ⟨parents.wait_admission program analysis.entry parent before stimulus selected completion,
      history.extend_wait_admission program owner selected snapshots initial before records stimulus completion committed⟩
  · rcases following with history | terminal
    · exact Or.inr ⟨entryBefore, issued, prior, entryRecord, suffix, shape, parents, preceding, entryKind, entryReplay, entered,
        Or.inl (history.extend_wait_admission program owner selected snapshots issued before suffix stimulus completion committed)⟩
    · obtain ⟨terminalPrefix, record, middle, _, _, _, _, ⟨instanceId, completed⟩, _⟩ := terminal
      exact False.elim (completed_wait_ingress_refused program before snapshots stimulus completion instanceId completed committed)

end BpmnSemantics.SemanticProcess.InternalCommutation

namespace BpmnSemantics.SemanticProcess.ParallelScopeReplay

open BpmnSemantics InternalCommutation ParallelScopeStart

/-- A single actual pre-entry history reserves the admitted entry and endpoint slots in the parent's scoped declaration matrix. -/
theorem ContinuationCommandHistory.pre_entry_parent_scoped_firing_sum_reserves_entry
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial final : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
      binding.operationId == operation.id && binding.scopeId == parent.definitionScopeId))).map
      (fun operation => declarationFiringCount records parent operation.id)).sum + 3 ≤ analysis.parentCount := by
  obtain ⟨admittedRoot, parentOperations, start, completion, path, roots, population,
    startShape, completionKind, trace, coverage, unique, bounded⟩ :=
    history.pre_entry_parent_path_firing_le_one program analysis admitted owner parent selected instanceId values root
      ready initial final startId origin output startDeclared rootSelected parentIdentity started initiated records
  obtain ⟨entry, entryMember, entryId, entryKind, _⟩ := admitted_entry_declaration program analysis admitted
  have entryZero := history.phase_declaration_firing_zero program analysis admitted owner parent selected initial final
    records entry entryMember (Or.inr (Or.inl entryKind))
  obtain ⟨selectedEntry, present, identity⟩ := spine_entry_member analysis.entry.id _ output false path trace rfl
  have reserved := sum_map_reserved_zero_slot path (fun operation => declarationFiringCount records parent operation.id)
    bounded ⟨selectedEntry, present, by simpa only [identity, ← entryId] using entryZero⟩
  obtain ⟨staticRoot, staticParent, counts, staticStart, staticCompletion, staticOutput, staticPath,
    staticRoots, staticPopulation, _, _, _, _, _, _, _, _, _, counted⟩ := analyzeProgram_parent_spine program analysis admitted
  have sameRoot : staticRoot = admittedRoot := by simpa using staticRoots.symm.trans roots
  have sameParent : staticParent = parentOperations := staticPopulation.trans (by rw [sameRoot]; exact population.symm)
  rw [sameParent] at counted
  have length := coverage.length_eq
  simp only [List.length_cons, List.length_append, List.length_nil] at length
  have rootIdentity : admittedRoot = root := by
    have filters : program.definitionScopes.filter (fun scope => scope.parentScopeId.isNone &&
        decide (scope.originElementId.value = program.processId.value)) =
        (program.definitionScopes.filter (·.parentScopeId.isNone)).filter
          (fun scope => decide (scope.originElementId.value = program.processId.value)) := by
      simp only [List.filter_filter, Bool.and_comm]
    unfold rootDefinitionScope? at rootSelected
    rw [filters, roots] at rootSelected
    by_cases originMatches : admittedRoot.originElementId.value = program.processId.value
    · simpa [originMatches] using rootSelected
    · simp [originMatches] at rootSelected
  have parentScope : parent.definitionScopeId = admittedRoot.id := by simp [parentIdentity, rootIdentity]
  have startMember : start ∈ program.operations := (List.mem_filter.mp
    (population ▸ (coverage.mem_iff.mpr (by simp)))).1
  have completionMember : completion ∈ program.operations := (List.mem_filter.mp
    (population ▸ (coverage.mem_iff.mpr (by simp)))).1
  have startKind : start.kind = .initiate := by rw [startShape]; rfl
  have startZero := history.phase_declaration_firing_zero program analysis admitted owner parent selected initial final
    records start startMember (Or.inl startKind)
  have finishZero := history.phase_declaration_firing_zero program analysis admitted owner parent selected initial final
    records completion completionMember (Or.inr (Or.inr completionKind))
  have summed := sum_map_permutation _ _ coverage (fun operation => declarationFiringCount records parent operation.id)
  simp only [List.map_cons, List.map_append, List.map_nil, List.sum_cons, List.sum_append,
    List.sum_nil, Nat.add_zero, startZero, finishZero, Nat.zero_add] at summed
  rw [parentScope, ← population]
  omega

/-- Actual Start and a single pre-entry history fit the parent capacity while retaining all three exceptional phase slots. -/
theorem ContinuationCommandHistory.pre_entry_record_count_le_parent_capacity
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial final : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) : records.length + 3 ≤ analysis.parentCount := by
  have census := (start_initiation_scope_and_process program instanceId values root parent ready initial output
    rootSelected parentIdentity started initiated).1
  have counted := history.record_count_le_scoped_population_firings program owner selected initial final records
  rw [census] at counted
  simp only [List.map_cons, List.map_nil, List.sum_cons, List.sum_nil, Nat.add_zero] at counted
  have budget := history.pre_entry_parent_scoped_firing_sum_reserves_entry program analysis admitted owner parent selected
    instanceId values root ready initial final startId origin output startDeclared rootSelected parentIdentity started initiated records
  omega

end BpmnSemantics.SemanticProcess.ParallelScopeReplay

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics ParallelScopeReplay

/-- Every actual scheduler phase fits the captured Start capacity, retaining a final record slot until terminal completion. -/
theorem ParallelScopeSchedulerPhase.record_count_le_start_capacity
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
    (capacity : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program values = some capacity) :
    records.length + 1 ≤ capacity.closureBound := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  rcases phase with ⟨parents, history⟩ |
    ⟨before, issued, prior, entryRecord, suffix, shape, parents, preceding, entryKind, entryReplay, entered, phase⟩
  · have bounded := history.pre_entry_record_count_le_parent_capacity program analysis admitted owner parent selected
      instanceId values root ready initial current startId origin output startDeclared rootSelected parentIdentity started initiated records
    obtain ⟨startAnalysis, binding, items, analyzed, _, _, _, capacityEq, _, _⟩ :=
      ParallelScopeStart.programStartCapacity_bound_certificate program values capacity startCapacity
    have sameAnalysis : startAnalysis = analysis := Option.some.inj (analyzed.symm.trans admitted)
    subst startAnalysis
    rw [capacityEq]
    omega
  · have recordLength := congrArg List.length shape
    simp only [List.length_append, List.length_singleton] at recordLength
    rcases phase with following | ⟨terminalPrefix, record, middle, terminalShape, history, _, _, _, _⟩
    · have bounded := preceding.two_phase_record_count_le_start_capacity program analysis admitted owner parent selected
        instanceId values root ready initial before issued current startId origin output startDeclared rootSelected parentIdentity
        started initiated prior suffix parents entered following capacity startCapacity
      omega
    · have bounded := preceding.two_phase_record_count_le_start_capacity program analysis admitted owner parent selected
        instanceId values root ready initial before issued middle startId origin output startDeclared rootSelected parentIdentity
        started initiated prior terminalPrefix parents entered history capacity startCapacity
      have suffixLength := congrArg List.length terminalShape
      simp only [List.length_append, List.length_singleton] at suffixLength
      omega

/-- Actual closure prefixes fit accepted Start capacity for every outcome, independently of publication and next-batch readiness. -/
theorem closeScheduledTraced_phase_count_le_start_capacity
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
    (commandId : SemanticId) (different : owner ≠ parent)
    (distinct : analysis.entry.childScopeId ≠ root.id)
    (startState : RuntimeState) (earlier : List CommittedTransition)
    (initialPhase : ParallelScopeSchedulerPhase program analysis owner parent initial startState earlier)
    (noCompensation : startState.compensationHandlerEffectWaits = [])
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (capacity : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program values = some capacity) :
    ∃ spent added, spent ≤ fuel ∧ added.length = spent ∧ earlier.length + spent + 1 ≤ capacity.closureBound ∧
      (closeScheduledTraced fuel program commandId index ordinal schedule startState).state.compensationHandlerEffectWaits = [] ∧
      ParallelScopeSchedulerPhase program analysis owner parent initial
        (closeScheduledTraced fuel program commandId index ordinal schedule startState).state (earlier ++ added) := by
  obtain ⟨spent, added, bounded, length, absent, phase⟩ := closeScheduledTraced_phase_history program commandId analysis admitted
    owner parent different instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity distinct
    started initiated startState earlier initialPhase noCompensation fuel index ordinal schedule
  have counted := phase.record_count_le_start_capacity program analysis admitted owner parent instanceId values root
    ready initial startId origin output startDeclared rootSelected parentIdentity started initiated _ (earlier ++ added) capacity startCapacity
  simp only [List.length_append] at counted
  exact ⟨spent, added, bounded, length, by omega, absent, phase⟩

/-- A running scheduler phase retains the captured collection behind its accepted resumption capacity. -/
theorem ParallelScopeSchedulerPhase.resumption_closure_bound
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (instanceId : SemanticId) (values : List VariableBinding)
    (root : DefinitionScope) (ready initial : RuntimeState) (output : ControlPlaceId)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (current : RuntimeState) (runtimeId : SemanticId) (running : current.control = .running runtimeId)
    (records : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial current records)
    (original resumed : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program values = some original)
    (stateCapacity : ParallelScopeStart.programStateCapacity program current = some resumed) :
    resumed.closureBound = original.closureBound := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases selection : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selection] at admitted
    | true => rfl
  have bindings := (start_initiation_scope_and_process program instanceId values root parent ready initial output
    rootSelected parentIdentity started initiated).2
  have initialCapacity : ParallelScopeStart.programStartCapacity program initial.variables.process.bindings = some original := by
    simpa only [bindings] using startCapacity
  rcases phase with ⟨parents, history⟩ |
    ⟨before, issued, prior, entryRecord, suffix, shape, parents, preceding, entryKind, entryReplay, entered, phase⟩
  · exact history.resumption_closure_bound program owner selected initial current records original resumed initialCapacity stateCapacity
  · rcases phase with following | ⟨terminalPrefix, record, middle, _, _, _, _, ⟨terminalId, completed⟩, _⟩
    · exact preceding.resumption_closure_bound_through_entry program owner parent analysis.entry selected
        initial before issued current prior suffix entered following original resumed initialCapacity stateCapacity
    · rw [running] at completed
      contradiction

/-- Accepted live resumption capacity bounds all actual closure-prefix outcomes through the same retained Start capacity. -/
theorem closeScheduledTraced_phase_count_le_resumption_capacity
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
    (commandId : SemanticId) (different : owner ≠ parent)
    (distinct : analysis.entry.childScopeId ≠ root.id)
    (startState : RuntimeState) (runtimeId : SemanticId) (running : startState.control = .running runtimeId)
    (earlier : List CommittedTransition)
    (initialPhase : ParallelScopeSchedulerPhase program analysis owner parent initial startState earlier)
    (noCompensation : startState.compensationHandlerEffectWaits = [])
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (original resumed : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program values = some original)
    (stateCapacity : ParallelScopeStart.programStateCapacity program startState = some resumed) :
    ∃ spent added, spent ≤ fuel ∧ added.length = spent ∧ earlier.length + spent + 1 ≤ resumed.closureBound ∧
      (closeScheduledTraced fuel program commandId index ordinal schedule startState).state.compensationHandlerEffectWaits = [] ∧
      ParallelScopeSchedulerPhase program analysis owner parent initial
        (closeScheduledTraced fuel program commandId index ordinal schedule startState).state (earlier ++ added) := by
  have boundEq := initialPhase.resumption_closure_bound program analysis admitted owner parent instanceId values root ready initial output
    rootSelected parentIdentity started initiated startState runtimeId running earlier original resumed startCapacity stateCapacity
  obtain ⟨spent, added, bounded, length, counted, absent, phase⟩ := closeScheduledTraced_phase_count_le_start_capacity program analysis admitted
    owner parent instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity started initiated
    commandId different distinct startState earlier initialPhase noCompensation fuel index ordinal schedule original startCapacity
  rw [← boundEq] at counted
  exact ⟨spent, added, bounded, length, counted, absent, phase⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
