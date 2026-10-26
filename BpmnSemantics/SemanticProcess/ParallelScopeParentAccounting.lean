module

public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import all BpmnSemantics.SemanticProcess.ParallelScopeData

/-! # Actual lifetime parent continuation accounting

PMIS-END-01 exchanges the pending outer continuation for a parent token. This
accounting uses the existing replay history and does not assert published phase
correspondence or parent at-most-once execution.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeReplay

open BpmnSemantics

private theorem human_activities (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after) :
    after.activityOccurrences = before.activityOccurrences := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    rfl
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    rfl

private theorem effect_activities (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after) :
    after.activityOccurrences = before.activityOccurrences := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i wait selected
  split at completed
  · simp only [completeParallelScopeEffect?, selected] at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    rfl
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    rfl

theorem admission_parent_activities (program : Program) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) :
    (admitStimulus program before stimulus).state.activityOccurrences = before.activityOccurrences := by
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first | rfl | (apply human_activities; assumption) | split
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    all_goals
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first | rfl | (apply effect_activities; assumption) | split

theorem admission_parent_marking (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) (place : ControlPlaceId) :
    parentContinuationMarking entry parent (admitStimulus program before stimulus).state place =
      parentContinuationMarking entry parent before place := by
  have activities := admission_parent_activities program before stimulus selected completion
  have marking : continuationMarking (admitStimulus program before stimulus).state parent place =
      continuationMarking before parent place := by
    cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
    case completeUserTaskInstance commandId id values =>
      exact admitStimulus_parallel_scope_human_continuation_marking program before commandId id values selected parent place
    case completeEffect commandId id result =>
      cases result <;> simp only at completion <;> try contradiction
      exact admitStimulus_parallel_scope_effect_continuation_marking program before commandId id _ selected parent place
  simp only [parentContinuationMarking, activities, marking]

private theorem replayed_parent_balance (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (parent : ScopeOccurrenceId) (before after : RuntimeState) (record : InternalTransitionRecord)
    (frame : ParallelScopeStructuralFrame parent before)
    (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after)
    (place : ControlPlaceId) :
    parentContinuationMarking analysis.entry parent after place +
        transitionPortCharge program bodyConsumedPorts parent place (.internalOperation record) =
      parentContinuationMarking analysis.entry parent before place +
        transitionPortCharge program bodyProducedPorts parent place (.internalOperation record) := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
  obtain ⟨declared, lookup, _, declaredKind, _⟩ := replayed_declaration_scope program before after record replayed
  rcases kind with body | retirement
  · have balance := applyInternalOperationOccurrence_continuation_balance program before after
      ⟨record.operationId, record.owner⟩ operation resolved (by rw [metadata]; exact body) applied parent place
    have activities := (InternalCommutation.applyInternalOperationOccurrence_body_retirement_frame program before after
      ⟨record.operationId, record.owner⟩ operation resolved (by rw [metadata]; exact body) applied).2.2.1
    have same : declared = operation := by
      unfold InternalCommutation.resolveInternalOperationOccurrence? at resolved
      obtain ⟨candidates, _, resolved⟩ := Option.bind_eq_some_iff.mp resolved
      split at resolved <;> try contradiction
      rw [lookup] at resolved
      exact Option.some.inj resolved
    subst declared
    change continuationMarking after parent place + ownedPortCount (bodyConsumedPorts operation) record.owner parent place =
      continuationMarking before parent place + ownedPortCount (bodyProducedPorts operation) record.owner parent place at balance
    simp only [parentContinuationMarking, activities, transitionPortCharge, lookup]
    omega
  · obtain ⟨entry, member, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
    rw [entries] at member
    have same : entry = analysis.entry := by simpa using member
    subst entry
    have zero : bodyConsumedPorts declared = [] ∧ bodyProducedPorts declared = [] := by
      rw [retirement] at declaredKind
      cases declared <;> simp only [SemanticOperation.kind] at declaredKind <;> try contradiction
      exact ⟨rfl, rfl⟩
    simp only [transitionPortCharge, lookup, zero.1, zero.2, ownedPortCount]
    unfold completeParallelScope? at completed
    obtain ⟨binding, bound, completed⟩ := Option.bind_eq_some_iff.mp completed
    exact completeParallelScope_parent_continuation_marking analysis.entry parent record.owner before after binding frame bound
      (by unfold completeParallelScope?; exact Option.bind_eq_some_iff.mpr ⟨binding, bound, completed⟩) place

private theorem ordered_parent_balance (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) (parent : ScopeOccurrenceId)
    (initial final : RuntimeState) (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        InternalCommutation.replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (frame : ParallelScopeStructuralFrame parent initial) (place : ControlPlaceId) :
    parentContinuationMarking analysis.entry parent final place +
        (records.map (transitionPortCharge program bodyConsumedPorts parent place)).sum =
      parentContinuationMarking analysis.entry parent initial place +
        (records.map (transitionPortCharge program bodyProducedPorts parent place)).sum := by
  induction records generalizing initial successors with
  | nil =>
    have empty : successors = [] := by simpa using length
    subst successors
    have same : initial = final := by simpa using last
    simp [same]
  | cons head rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      obtain ⟨record, same, actual⟩ := aligned (head, initial, next) (by simp)
      change head = .internalOperation record at same
      have first := replayed_parent_balance program analysis admitted parent initial next record frame
        (same ▸ kinds head (by simp)) actual place
      have nextFrame := replayed_structural_frame program parent initial next record frame
        (same ▸ kinds head (by simp)) actual
      have later := ih next tail (by simpa using length) (by simpa using last)
        (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
        (fun record member => kinds record (by simp [member])) nextFrame
      simp only [List.map_cons, List.sum_cons]
      rw [same]
      omega

/-- Actual lifetime commands conserve the parent's real and pending continuation credit with their declared parent-port charges. -/
theorem ContinuationCommandHistory.parent_continuation_balance
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (frame : ParallelScopeStructuralFrame parent initial) (place : ControlPlaceId) :
    parentContinuationMarking analysis.entry parent final place +
        (records.map (transitionPortCharge program bodyConsumedPorts parent place)).sum =
      parentContinuationMarking analysis.entry parent initial place +
        (records.map (transitionPortCharge program bodyProducedPorts parent place)).sum := by
  induction history with
  | initial => simp
  | @internalStep before after earlier record history replayed kind outside ih =>
    have step := replayed_parent_balance program analysis admitted parent before after record
      (history.structural_frame program owner parent selected initial before earlier frame) kind replayed place
    simp only [List.map_append, List.sum_append, List.map_cons, List.map_nil, List.sum_cons, List.sum_nil, Nat.add_zero]
    omega
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    obtain ⟨actualStimulus, actualRest, next, successors, shape, _, stateEq, length, last, aligned⟩ :=
      committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
    cases shape
    have beforeFrame := history.structural_frame program owner parent selected initial before earlier frame
    have nextFrame := admission_structural_frame program parent before stimulus selected completion beforeFrame
    rw [stateEq] at nextFrame
    have step := ordered_parent_balance program analysis admitted parent next after rest successors length last aligned kinds nextFrame place
    have external := admission_parent_marking program analysis.entry parent before stimulus selected completion place
    rw [stateEq] at external
    simp only [List.map_append, List.sum_append]
    omega

/-- The actual entry transition joins two existing lifetime histories and charges its parent ports exactly once. -/
theorem ContinuationCommandHistory.parent_balance_through_entry
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial before issued final : RuntimeState) (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (frame : ParallelScopeStructuralFrame parent initial)
    (clean : ParallelScopeCleanEntry analysis.entry parent before) (place : ControlPlaceId) :
    parentContinuationMarking analysis.entry parent final place +
        ((priorRecords ++ suffix).map (transitionPortCharge program bodyConsumedPorts parent place)).sum +
        ownedPortCount [analysis.entry.input] parent parent place =
      parentContinuationMarking analysis.entry parent initial place +
        ((priorRecords ++ suffix).map (transitionPortCharge program bodyProducedPorts parent place)).sum +
        ownedPortCount [analysis.entry.normalOutput] parent parent place := by
  have beforeFrame := preceding.structural_frame program owner parent selected initial before priorRecords frame
  have issuedFrame := enterParallelScope_structural_parallel_frame analysis.entry parent before issued clean beforeFrame entered
  have first := preceding.parent_continuation_balance program analysis admitted owner parent selected initial before priorRecords frame place
  have middle := enterParallelScope_parent_continuation_balance analysis.entry parent before issued clean entered place
  have last := following.parent_continuation_balance program analysis admitted owner parent selected issued final suffix issuedFrame place
  simp only [List.map_append, List.sum_append]
  omega

/-- Actual Program Start followed by root initiation supplies its one normal token and the root structural frame. -/
theorem runningProgramStartState_parent_continuation_seed
    (program : Program) (entry : ParallelScopeEntry) (instanceId : SemanticId)
    (values : List VariableBinding) (root : DefinitionScope) (parent : ScopeOccurrenceId)
    (ready initial : RuntimeState) (output : ControlPlaceId)
    (selected : rootDefinitionScope? program = some root)
    (owner : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial) :
    ParallelScopeStructuralFrame parent initial ∧
      ∀ place, parentContinuationMarking entry parent initial place = ownedPortCount [output] parent parent place := by
  have readyFrame := runningProgramStartState_structural_parallel_frame program instanceId values ready root selected started
  rw [← owner] at readyFrame
  refine ⟨initiateState_structural_parallel_frame parent ready initial output readyFrame initiated, ?_⟩
  simp only [runningProgramStartState?, selected, bind, Option.bind_some, pure, Option.some.injEq] at started
  subst ready
  simp [initiateState?, rootScopeOccurrence?, runningStartState, initialState, addToken] at initiated
  subst initial
  intro place
  rw [owner]
  simp [parentContinuationMarking, continuationMarking, ownedPortCount, canonicalInsertBy, List.filter_cons]
  by_cases equal : output = place <;> simp [equal]

/-- Two actual lifetime phases and actual entry consume parent ports from the one token supplied by Start initiation. -/
theorem ContinuationCommandHistory.parent_balance_from_start
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued final : RuntimeState) (output : ControlPlaceId)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (clean : ParallelScopeCleanEntry analysis.entry parent before) (place : ControlPlaceId) :
    parentContinuationMarking analysis.entry parent final place +
        ((priorRecords ++ suffix).map (transitionPortCharge program bodyConsumedPorts parent place)).sum +
        ownedPortCount [analysis.entry.input] parent parent place =
      ownedPortCount [output] parent parent place +
        ((priorRecords ++ suffix).map (transitionPortCharge program bodyProducedPorts parent place)).sum +
        ownedPortCount [analysis.entry.normalOutput] parent parent place := by
  obtain ⟨frame, seed⟩ := runningProgramStartState_parent_continuation_seed program analysis.entry instanceId values root parent
    ready initial output rootSelected parentIdentity started initiated
  have balance := preceding.parent_balance_through_entry program analysis admitted owner parent selected initial before issued final
    priorRecords suffix entered following frame clean place
  rw [seed] at balance
  exact balance

/-- Actual two-phase parent accounting bounds each declared consumer by its unique producer and the admitted Start/entry credits. -/
theorem ContinuationCommandHistory.parent_port_firing_budget_from_start
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued final : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (clean : ParallelScopeCleanEntry analysis.entry parent before)
    (consumer : SemanticOperation) (consumerMember : consumer ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (input : place.id ∈ bodyConsumedPorts consumer) :
    ∃ producerId, producers program.operations place.id = [producerId] ∧
      parentContinuationMarking analysis.entry parent final place.id +
        declarationFiringCount (priorRecords ++ suffix) parent consumer.id +
        ownedPortCount [analysis.entry.input] parent parent place.id ≤
      ownedPortCount [output] parent parent place.id +
        declarationFiringCount (priorRecords ++ suffix) parent producerId +
        ownedPortCount [analysis.entry.normalOutput] parent parent place.id ∧
      startId ∈ producers program.operations output := by
  have attributed : ∀ record, .internalOperation record ∈ priorRecords ++ suffix →
      ∃ operation, program.operations.find? (·.id == record.operationId) = some operation ∧
        operation.id = record.operationId ∧ operation ∈ program.operations := by
    intro record member
    rcases List.mem_append.mp member with earlier | later
    · obtain ⟨operation, lookup, key, _, population⟩ := preceding.record_declaration_scope
        program owner selected initial before priorRecords record earlier
      exact ⟨operation, lookup, key, (List.mem_filter.mp population).1⟩
    · obtain ⟨operation, lookup, key, _, population⟩ := following.record_declaration_scope
        program owner selected issued final suffix record later
      exact ⟨operation, lookup, key, (List.mem_filter.mp population).1⟩
  obtain ⟨producerId, unique, consumed, produced⟩ := attributed_port_firing_counts program analysis admitted
    (priorRecords ++ suffix) parent attributed consumer consumerMember place declared input
  have balance := preceding.parent_balance_from_start program analysis admitted owner parent selected instanceId values root
    ready initial before issued final output rootSelected parentIdentity started initiated priorRecords suffix entered following clean place.id
  refine ⟨producerId, unique, by omega, ?_⟩
  exact declared_output_producer program (.initiate startId origin output) startDeclared output (by simp [operationOutputs])

private theorem parent_step_output (entryId : OperationId) (entered : Bool)
    (operation : SemanticOperation) (output : ControlPlaceId) (nextEntered : Bool)
    (step : ParallelScopeStart.ParentSpineStep entryId entered operation output nextEntered) :
    output ∈ operationOutputs operation ∨ ∃ entry, parallelScopeEntry? operation = some entry ∧
      entry.id = operation.id ∧ output = entry.normalOutput := by
  cases operation <;> simp only [ParallelScopeStart.ParentSpineStep] at step <;> try contradiction
  case awaitUserTask id origin input next task => exact Or.inl (by simp [operationOutputs, step.1])
  case awaitEffect id origin input next effect route =>
    cases route <;> simp_all [operationOutputs]
  case enterParallelMultiInstanceScope id origin input childEntry childScope next collection item mappings condition =>
    exact Or.inr ⟨⟨id, origin.elementId, input, childEntry, childScope, next, collection, item, mappings, condition⟩,
      rfl, rfl, step.2.2.1⟩

theorem parent_trace_predecessors (entryId : OperationId)
    (operations : List SemanticOperation) (next : ControlPlaceId) (entered : Bool)
    (path : List SemanticOperation)
    (trace : ParallelScopeStart.ParentSpineTrace entryId operations next entered path) :
    ∀ consumer ∈ path, ∃ port ∈ SequentialScopeControl.inputs consumer,
      port = next ∨ ∃ producer earlier middle later,
        path = earlier ++ producer :: middle ++ consumer :: later ∧
        (port ∈ operationOutputs producer ∨ ∃ entry, parallelScopeEntry? producer = some entry ∧
          entry.id = producer.id ∧ port = entry.normalOutput) := by
  induction trace with
  | finish operations next id origin input selected empty =>
    intro consumer member
    have same : consumer = .reachNoneEnd id origin input := by simpa using member
    subst consumer
    have present : SemanticOperation.reachNoneEnd id origin input ∈ operations.filter
        (fun operation => (SequentialScopeControl.inputs operation).contains next) := by rw [selected]; simp
    have chosen := (List.mem_filter.mp present).2
    refine ⟨next, ?_, Or.inl rfl⟩
    simpa using chosen
  | step operations next output entered nextEntered operation tail selected edge rest ih =>
    intro consumer member
    rcases List.mem_cons.mp member with same | member
    · subst consumer
      have present : operation ∈ operations.filter
          (fun operation => (SequentialScopeControl.inputs operation).contains next) := by rw [selected]; simp
      exact ⟨next, by simpa using (List.mem_filter.mp present).2, Or.inl rfl⟩
    · obtain ⟨port, input, source⟩ := ih consumer member
      refine ⟨port, input, ?_⟩
      rcases source with first | ⟨producer, earlier, middle, later, order, produced⟩
      · obtain ⟨middle, later, shape⟩ := List.mem_iff_append.mp member
        refine Or.inr ⟨operation, [], middle, later, ?_, ?_⟩
        · simp [shape]
        · exact first ▸ parent_step_output entryId entered operation output nextEntered edge
      · refine Or.inr ⟨producer, operation :: earlier, middle, later, ?_, produced⟩
        simp [order]

/-- Actual admission supplies every parent input from the selected Start or a strictly earlier path declaration, retaining exact shared ports. -/
theorem admitted_parent_input_predecessors (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) :
    ∃ (root : DefinitionScope) (parent : List SemanticOperation) (start completion : SemanticOperation)
      (output : ControlPlaceId) (path : List SemanticOperation),
      program.definitionScopes.filter (·.parentScopeId.isNone) = [root] ∧
      parent = program.operations.filter (fun operation => program.operationScopes.any
        (fun binding => binding.operationId == operation.id && binding.scopeId == root.id)) ∧
      parent.filter (fun operation => match operation with | .initiate .. => true | _ => false) = [start] ∧
      start = .initiate start.id start.origin output ∧ completion.kind = .completeScope ∧
      ParallelScopeStart.ParentSpineTrace analysis.entry.id
        (parent.filter (fun operation => operation.id != start.id && operation.id != completion.id)) output false path ∧
      parent.Perm (start :: path ++ [completion]) ∧ (path.map (·.id)).Nodup ∧
      (∀ operation ∈ path, operation ∈ parent) ∧
      ∀ consumer ∈ path, ∃ port ∈ SequentialScopeControl.inputs consumer,
        port = output ∨ ∃ producer earlier middle later,
          path = earlier ++ producer :: middle ++ consumer :: later ∧
          (port ∈ operationOutputs producer ∨ producer.id = analysis.entry.id ∧ port = analysis.entry.normalOutput) := by
  obtain ⟨root, parent, counts, start, completion, output, path, rootEq, parentEq, _, startSelected, completionSelected, startEq,
    trace, _, unique, members, coverage, _⟩ := ParallelScopeStart.analyzeProgram_parent_spine program analysis admitted
  have completionKind : completion.kind = .completeScope := by
    have member : completion ∈ parent.filter (fun operation => match operation with | .completeScope .. => true | _ => false) :=
      completionSelected.symm ▸ (show completion ∈ [completion] from by simp)
    have accepted := (List.mem_filter.mp member).2
    cases completion <;> simp only at accepted <;> try contradiction
    rfl
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
  refine ⟨root, parent, start, completion, output, path, rootEq, parentEq, startSelected, startEq, completionKind, trace, coverage, unique, members, ?_⟩
  intro consumer member
  obtain ⟨port, input, source⟩ := parent_trace_predecessors analysis.entry.id _ output false path trace consumer member
  refine ⟨port, input, ?_⟩
  rcases source with startPort | ⟨producer, earlier, middle, later, order, outputPort⟩
  · exact Or.inl startPort
  · refine Or.inr ⟨producer, earlier, middle, later, order, ?_⟩
    rcases outputPort with ordinary | ⟨entry, decoded, identity, normal⟩
    · exact Or.inl ordinary
    · have producerMember : producer ∈ path := by rw [order]; simp
      have declared : producer ∈ program.operations := (List.mem_filter.mp (parentEq ▸ members producer producerMember)).1
      have parsed : entry ∈ program.operations.filterMap parallelScopeEntry? := List.mem_filterMap.mpr ⟨producer, declared, decoded⟩
      rw [entries] at parsed
      have same : entry = analysis.entry := by simpa using parsed
      exact Or.inr ⟨identity.symm.trans (congrArg ParallelScopeEntry.id same), normal.trans (congrArg ParallelScopeEntry.normalOutput same)⟩

private theorem entry_continuation_selected (operations : List SemanticOperation) (entry : ParallelScopeEntry)
    (selected : operations.filterMap parallelScopeEntry? = [entry]) :
    parallelScopeContinuation? operations entry.id = some entry.normalOutput := by
  induction operations with
  | nil => simp at selected
  | cons operation rest ih =>
    cases operation <;> simp only [List.filterMap_cons, parallelScopeEntry?] at selected
    all_goals first
      | (exact ih selected)
      | (simp only [List.cons.injEq] at selected; cases selected.1; simp [parallelScopeContinuation?, List.findSome?])

private theorem entry_normal_producer (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) :
    ∃ completion ∈ program.operations, completion.kind = .completeParallelMultiInstanceScope ∧
      completion.id ∈ producers program.operations analysis.entry.normalOutput ∧
      ∃ place ∈ program.controlPlaces, place.id = analysis.entry.normalOutput := by
  obtain ⟨child, completion, origin, body, first, converted, ordered, entries, childEq, completionSelected,
    paired, _, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
  have present : completion ∈ child := (List.mem_filter.mp (completionSelected.symm ▸ (show completion ∈ [completion] from by simp))).1
  have declared : completion ∈ program.operations := (List.mem_filter.mp (childEq ▸ present)).1
  have continuation := entry_continuation_selected program.operations analysis.entry entries
  have producer : completion.id ∈ producers program.operations analysis.entry.normalOutput := by
    apply List.mem_filterMap.mpr
    refine ⟨completion, declared, ?_⟩
    rw [paired]
    simp [continuation, SemanticOperation.id]
  have entryMember : analysis.entry ∈ program.operations.filterMap parallelScopeEntry? := by rw [entries]; simp
  obtain ⟨operation, operationMember, parsed⟩ := List.mem_filterMap.mp entryMember
  have valid := List.all_eq_true.mp (programWellFormed_operations program
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1) operation operationMember
  refine ⟨completion, declared, by rw [paired]; rfl, producer, ?_⟩
  cases operation <;> simp only [parallelScopeEntry?] at parsed <;> try contradiction
  rename_i id entryOrigin input childEntry childScope normalOutput collection item mappings condition
  have same := Option.some.inj parsed
  simp only [operationWellFormed, parallelScopeOperationWellFormed, Bool.and_eq_true] at valid
  have ports := valid.1.1.1.1.2
  have normalDeclared := List.all_eq_true.mp ports normalOutput (by simp)
  have normal := congrArg ParallelScopeEntry.normalOutput same
  change normalOutput = analysis.entry.normalOutput at normal
  rw [normal] at normalDeclared
  simpa only [beq_iff_eq] using List.any_eq_true.mp normalDeclared

private theorem singleton_producer (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces) (id : OperationId)
    (member : id ∈ producers program.operations place.id) : producers program.operations place.id = [id] := by
  have incidence := (ParallelScopeStart.analyzeProgram_place_incidence program analysis admitted place declared).1
  cases population : producers program.operations place.id with
  | nil => simp [population] at member
  | cons current tail =>
    have empty : tail = [] := by
      have length : tail.length = 0 := by simpa [population] using incidence
      simpa using length
    subst tail
    have same : id = current := by simpa [population] using member
    simp [same]

private theorem history_produced_charge_zero (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner queried : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (port : ControlPlaceId) (producer : SemanticOperation) (producerMember : producer ∈ program.operations)
    (only : producers program.operations port = [producer.id]) (emptyPorts : bodyProducedPorts producer = []) :
    (records.map (transitionPortCharge program bodyProducedPorts queried port)).sum = 0 := by
  have zero : ∀ transition ∈ records, transitionPortCharge program bodyProducedPorts queried port transition = 0 := by
    intro transition member
    cases transition with
    | externalStimulus stimulus => rfl
    | internalOperation record =>
      obtain ⟨operation, lookup, key, kind, population⟩ := history.record_declaration_scope
        program owner selected initial final records record member
      have operationMember := (List.mem_filter.mp population).1
      have absent : port ∉ bodyProducedPorts operation := by
        intro output
        have outputDeclared : port ∈ operationOutputs operation := by
          cases operation <;> simp_all [bodyProducedPorts, operationOutputs]
        have produced := declared_output_producer program operation operationMember _ outputDeclared
        rw [only] at produced
        have identity : operation.id = producer.id := by simpa using produced
        have same := same_declaration program analysis admitted operation producer operationMember producerMember identity
        rw [same] at output
        rw [emptyPorts] at output
        exact List.not_mem_nil output
      simp [transitionPortCharge, lookup, ownedPortCount]
      intro value present ownerSame portSame
      exact absent (portSame ▸ present)
  clear history
  induction records with
  | nil => rfl
  | cons head tail ih =>
    have first := zero head (by simp)
    have rest := ih (fun record member => zero record (by simp [member]))
    simp only [List.map_cons, List.sum_cons, first, rest, Nat.zero_add]

/-- Actual lifetime records contribute no body-output charge at the parent continuation port owned by the paired retirement declaration. -/
theorem ContinuationCommandHistory.entry_normal_produced_charge_zero
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner queried : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    (records.map (transitionPortCharge program bodyProducedPorts queried analysis.entry.normalOutput)).sum = 0 := by
  obtain ⟨completion, completionMember, completionKind, producer, place, declared, placeEq⟩ := entry_normal_producer program analysis admitted
  have only := singleton_producer program analysis admitted place declared completion.id (by simpa [placeEq] using producer)
  rw [placeEq] at only
  have emptyPorts : bodyProducedPorts completion = [] := by
    cases completion <;> simp only [SemanticOperation.kind] at completionKind <;> try contradiction
    rfl
  exact history_produced_charge_zero program analysis admitted owner queried selected initial final records history
    analysis.entry.normalOutput completion completionMember only emptyPorts

/-- Across actual entry and both actual lifetime phases, parent normal-port consumption is paid only by its initial credit and the single reserved entry continuation. -/
theorem ContinuationCommandHistory.parent_entry_normal_consumption_bound
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial before issued final : RuntimeState) (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (frame : ParallelScopeStructuralFrame parent initial)
    (clean : ParallelScopeCleanEntry analysis.entry parent before) :
    ((priorRecords ++ suffix).map (transitionPortCharge program bodyConsumedPorts parent analysis.entry.normalOutput)).sum ≤
      parentContinuationMarking analysis.entry parent initial analysis.entry.normalOutput + 1 := by
  have earlier := preceding.entry_normal_produced_charge_zero program analysis admitted owner parent selected initial before priorRecords
  have later := following.entry_normal_produced_charge_zero program analysis admitted owner parent selected issued final suffix
  have zero : ((priorRecords ++ suffix).map (transitionPortCharge program bodyProducedPorts parent analysis.entry.normalOutput)).sum = 0 := by
    simp only [List.map_append, List.sum_append, earlier, later, Nat.zero_add]
  have balance := preceding.parent_balance_through_entry program analysis admitted owner parent selected initial before issued final
    priorRecords suffix entered following frame clean analysis.entry.normalOutput
  have unit : ownedPortCount [analysis.entry.normalOutput] parent parent analysis.entry.normalOutput = 1 := by
    simp [ownedPortCount]
  rw [zero, unit] at balance
  omega

private theorem start_output_declared (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (id : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (member : SemanticOperation.initiate id origin output ∈ program.operations) :
    ∃ place ∈ program.controlPlaces, place.id = output := by
  have valid := List.all_eq_true.mp (programWellFormed_operations program
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1) _ member
  simp only [operationWellFormed, Bool.and_eq_true] at valid
  have declared := valid.2
  change program.controlPlaces.any (fun place => decide (place.id = output)) = true at declared
  simpa using List.any_eq_true.mp declared

/-- Actual admission separates Start's seed port from the paired retirement continuation. -/
theorem admitted_start_output_ne_entry_normal (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (id : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (member : SemanticOperation.initiate id origin output ∈ program.operations) : output ≠ analysis.entry.normalOutput := by
  obtain ⟨completion, completionMember, completionKind, produced, place, declared, placeEq⟩ := entry_normal_producer program analysis admitted
  have only := singleton_producer program analysis admitted place declared completion.id (by simpa [placeEq] using produced)
  rw [placeEq] at only
  intro samePort
  have startProducer := declared_output_producer program (.initiate id origin output) member output (by simp [operationOutputs])
  rw [samePort, only] at startProducer
  have sameId : id = completion.id := by simpa [SemanticOperation.id] using startProducer
  have same := same_declaration program analysis admitted (.initiate id origin output) completion member completionMember sameId
  have kinds := congrArg SemanticOperation.kind same
  rw [completionKind] at kinds
  contradiction

/-- Actual lifetime records contribute no body-output charge at the admitted Start seed port. -/
theorem ContinuationCommandHistory.start_output_produced_charge_zero
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner queried : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (id : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (member : SemanticOperation.initiate id origin output ∈ program.operations) :
    (records.map (transitionPortCharge program bodyProducedPorts queried output)).sum = 0 := by
  obtain ⟨place, declared, placeEq⟩ := start_output_declared program analysis admitted id origin output member
  have produced := declared_output_producer program (.initiate id origin output) member output (by simp [operationOutputs])
  have only := singleton_producer program analysis admitted place declared id (by simpa [placeEq, SemanticOperation.id] using produced)
  rw [placeEq] at only
  exact history_produced_charge_zero program analysis admitted owner queried selected initial final records history
    output (.initiate id origin output) member only rfl

/-- Across actual Start, entry and two lifetime phases, each seed port pays for at most one parent continuation consumption. -/
theorem ContinuationCommandHistory.parent_base_port_consumption_le_one
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued final : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (clean : ParallelScopeCleanEntry analysis.entry parent before) :
    ((priorRecords ++ suffix).map (transitionPortCharge program bodyConsumedPorts parent output)).sum ≤ 1 ∧
      ((priorRecords ++ suffix).map (transitionPortCharge program bodyConsumedPorts parent analysis.entry.normalOutput)).sum ≤ 1 := by
  have distinct := admitted_start_output_ne_entry_normal program analysis admitted startId origin output startDeclared
  obtain ⟨frame, seed⟩ := runningProgramStartState_parent_continuation_seed program analysis.entry instanceId values root parent
    ready initial output rootSelected parentIdentity started initiated
  have earlyZero := preceding.start_output_produced_charge_zero program analysis admitted owner parent selected initial before priorRecords
    startId origin output startDeclared
  have lateZero := following.start_output_produced_charge_zero program analysis admitted owner parent selected issued final suffix
    startId origin output startDeclared
  have producedZero : ((priorRecords ++ suffix).map (transitionPortCharge program bodyProducedPorts parent output)).sum = 0 := by
    simp only [List.map_append, List.sum_append, earlyZero, lateZero, Nat.zero_add]
  have startBalance := preceding.parent_balance_from_start program analysis admitted owner parent selected instanceId values root
    ready initial before issued final output rootSelected parentIdentity started initiated priorRecords suffix entered following clean output
  have one : ownedPortCount [output] parent parent output = 1 := by simp [ownedPortCount]
  have noEntry : ownedPortCount [analysis.entry.normalOutput] parent parent output = 0 := by simp [ownedPortCount, distinct.symm]
  rw [producedZero, one, noEntry] at startBalance
  have normalBudget := preceding.parent_entry_normal_consumption_bound program analysis admitted owner parent selected initial before issued final
    priorRecords suffix entered following frame clean
  have seedZero : parentContinuationMarking analysis.entry parent initial analysis.entry.normalOutput = 0 := by
    rw [seed]
    simp [ownedPortCount, distinct]
  rw [seedZero] at normalBudget
  exact ⟨by omega, by simpa using normalBudget⟩

/-- Actual consumers of Start or the reserved entry continuation fire at most once across both lifetime phases. -/
theorem ContinuationCommandHistory.parent_base_port_firing_le_one
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued final : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (clean : ParallelScopeCleanEntry analysis.entry parent before)
    (consumer : SemanticOperation) (consumerMember : consumer ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (input : place.id ∈ bodyConsumedPorts consumer)
    (base : place.id = output ∨ place.id = analysis.entry.normalOutput) :
    declarationFiringCount (priorRecords ++ suffix) parent consumer.id ≤ 1 := by
  have attributed : ∀ record, .internalOperation record ∈ priorRecords ++ suffix →
      ∃ operation, program.operations.find? (·.id == record.operationId) = some operation ∧
        operation.id = record.operationId ∧ operation ∈ program.operations := by
    intro record member
    rcases List.mem_append.mp member with earlier | later
    · obtain ⟨operation, lookup, key, _, population⟩ := preceding.record_declaration_scope
        program owner selected initial before priorRecords record earlier
      exact ⟨operation, lookup, key, (List.mem_filter.mp population).1⟩
    · obtain ⟨operation, lookup, key, _, population⟩ := following.record_declaration_scope
        program owner selected issued final suffix record later
      exact ⟨operation, lookup, key, (List.mem_filter.mp population).1⟩
  obtain ⟨_, _, consumed, _⟩ := attributed_port_firing_counts program analysis admitted
    (priorRecords ++ suffix) parent attributed consumer consumerMember place declared input
  have bounds := preceding.parent_base_port_consumption_le_one program analysis admitted owner parent selected
    instanceId values root ready initial before issued final startId origin output startDeclared rootSelected
    parentIdentity started initiated priorRecords suffix entered following clean
  rcases base with startPort | entryPort
  · rw [startPort] at consumed
    exact Nat.le_trans consumed bounds.1
  · rw [entryPort] at consumed
    exact Nat.le_trans consumed bounds.2

theorem parent_predecessor_rank (ordered : List OperationId) (unique : ordered.Nodup)
    (producer consumer : OperationId) (earlier middle suffix : List OperationId)
    (shape : ordered = earlier ++ producer :: middle ++ consumer :: suffix) :
    ordered.idxOf producer < ordered.idxOf consumer := by
  rw [shape] at unique ⊢
  simp only [List.append_assoc, List.cons_append] at unique ⊢
  have separated := List.nodup_append.mp unique
  have producerAbsent : producer ∉ earlier := by
    intro present
    exact separated.2.2 producer present producer (by simp) rfl
  have consumerAbsent : consumer ∉ earlier := by
    intro present
    exact separated.2.2 consumer present consumer (by simp) rfl
  have tailUnique := List.nodup_cons.mp separated.2.1
  have different : producer ≠ consumer := by
    intro same
    exact tailUnique.1 (by simp [same])
  have middleUnique := List.nodup_append.mp tailUnique.2
  have middleAbsent : consumer ∉ middle := by
    intro present
    exact middleUnique.2.2 consumer present consumer (by simp) rfl
  simp only [List.idxOf_append, producerAbsent, consumerAbsent, ite_false,
    List.idxOf_cons_self, Nat.zero_add, List.idxOf_cons, cond_eq_ite, beq_iff_eq,
    different, ite_false, middleAbsent]
  omega

theorem admitted_start_unique (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (id other : OperationId) (origin otherOrigin : BpmnElementOrigin) (output next : ControlPlaceId)
    (member : SemanticOperation.initiate id origin output ∈ program.operations)
    (otherMember : SemanticOperation.initiate other otherOrigin next ∈ program.operations) : output = next := by
  have graph := programWellFormed_graph program (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1
  unfold programGraphWellFormedForProgram programGraphWellFormedWithScopeLifecycle at graph
  dsimp only at graph
  split at graph <;> try contradiction
  rename_i start startsEq
  have singleton : program.operations.filterMap (fun operation => match operation with
      | .initiate id .. | .initiateMessage id .. | .initiateTimer id .. => some id | _ => none) = [start] := startsEq
  have first : id ∈ program.operations.filterMap (fun operation => match operation with
      | .initiate id .. | .initiateMessage id .. | .initiateTimer id .. => some id | _ => none) := List.mem_filterMap.mpr ⟨_, member, rfl⟩
  have second : other ∈ program.operations.filterMap (fun operation => match operation with
      | .initiate id .. | .initiateMessage id .. | .initiateTimer id .. => some id | _ => none) := List.mem_filterMap.mpr ⟨_, otherMember, rfl⟩
  rw [singleton] at first second
  have same := same_declaration program analysis admitted _ _ member otherMember (by simpa [SemanticOperation.id] using (List.mem_singleton.mp first).trans (List.mem_singleton.mp second).symm)
  exact SemanticOperation.initiate.inj same |>.2.2

theorem parent_input_declared (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (operation : SemanticOperation) (member : operation ∈ program.operations)
    (port : ControlPlaceId) (input : port ∈ SequentialScopeControl.inputs operation) :
    ∃ place ∈ program.controlPlaces, place.id = port := by
  obtain ⟨wellFormed, _, allowed⟩ := ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted
  have valid := List.all_eq_true.mp (programWellFormed_operations program wellFormed) operation member
  have permitted := List.all_eq_true.mp allowed operation member
  change (fun operation : SemanticOperation => match operation with
    | .enterParallelMultiInstanceScope .. | .completeParallelMultiInstanceScope .. => true
    | .enterSequentialMultiInstanceScope .. | .completeSequentialMultiInstanceScope .. => false
    | operation => SequentialScopeProgram.operationAllowed operation) operation = true at permitted
  have declared : program.controlPlaces.any (fun place => place.id == port) = true := by
    cases operation <;> simp only [SequentialScopeProgram.operationAllowed] at permitted <;> try contradiction
    all_goals simp only [SequentialScopeControl.inputs, bodyConsumedPorts, List.mem_singleton] at input <;> try contradiction
    all_goals simp only [operationWellFormed, parallelScopeOperationWellFormed, Bool.and_eq_true] at valid
    all_goals first
      | (subst port; first | exact valid.2 | exact valid.1.2 | exact valid.1.1.2 | exact valid.1.1.1.2)
      | exact List.all_eq_true.mp valid.1.2 port input
      | (subst port; exact List.all_eq_true.mp valid.1.1.1.1.2 _ (by simp))
  simpa only [beq_iff_eq] using List.any_eq_true.mp declared

/-- The actual admitted parent spine fires each path declaration at most once across Start, entry and both lifetime histories. -/
theorem ContinuationCommandHistory.parent_path_firing_le_one
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued final : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root)
    (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (clean : ParallelScopeCleanEntry analysis.entry parent before) :
    ∃ admittedRoot parentOperations start completion path,
      program.definitionScopes.filter (·.parentScopeId.isNone) = [admittedRoot] ∧
      parentOperations = program.operations.filter (fun operation => program.operationScopes.any
        (fun binding => binding.operationId == operation.id && binding.scopeId == admittedRoot.id)) ∧
      start = .initiate start.id start.origin output ∧ completion.kind = .completeScope ∧
      ParallelScopeStart.ParentSpineTrace analysis.entry.id
        (parentOperations.filter (fun operation => operation.id != start.id && operation.id != completion.id)) output false path ∧
      parentOperations.Perm (start :: path ++ [completion]) ∧ (path.map (·.id)).Nodup ∧
      ∀ consumer ∈ path, declarationFiringCount (priorRecords ++ suffix) parent consumer.id ≤ 1 := by
  obtain ⟨admittedRoot, parentOperations, start, completion, startOutput, path, roots, population,
    _, startEq, completionKind, trace, coverage, unique, members, predecessors⟩ := admitted_parent_input_predecessors program analysis admitted
  have startMember : start ∈ program.operations := by
    apply (List.mem_filter.mp (population ▸ (coverage.mem_iff.mpr (by simp)))).1
  have aligned := admitted_start_unique program analysis admitted startId start.id origin start.origin output startOutput startDeclared (by simpa only [← startEq] using startMember)
  have declared : ∀ operation ∈ path, operation ∈ program.operations := by
    intro operation member
    exact (List.mem_filter.mp (population ▸ members operation member)).1
  have bounded : ∀ rank, ∀ consumer ∈ path, (path.map (·.id)).idxOf consumer.id = rank →
      declarationFiringCount (priorRecords ++ suffix) parent consumer.id ≤ 1 := by
    intro rank
    induction rank using Nat.strongRecOn with
    | ind rank ih =>
      intro consumer member rankEq
      obtain ⟨port, input, source⟩ := predecessors consumer member
      obtain ⟨place, placeMember, placeEq⟩ := parent_input_declared program analysis admitted consumer (declared consumer member) port input
      have consumed : place.id ∈ bodyConsumedPorts consumer := by simpa only [placeEq, SequentialScopeControl.inputs, bodyConsumedPorts] using input
      have base := preceding.parent_base_port_firing_le_one program analysis admitted owner parent selected instanceId values root ready initial before issued final
        startId origin output startDeclared rootSelected parentIdentity started initiated priorRecords suffix entered following clean consumer (declared consumer member) place placeMember consumed
      rcases source with seed | ⟨producer, earlier, middle, later, order, produced⟩
      · exact base (Or.inl (placeEq.trans (seed.trans aligned.symm)))
      · rcases produced with ordinary | reserved
        · by_cases first : port = output
          · exact base (Or.inl (placeEq.trans first))
          by_cases normal : port = analysis.entry.normalOutput
          · exact base (Or.inr (placeEq.trans normal))
          have producerMember : producer ∈ path := by rw [order]; simp
          have mapped : path.map (·.id) = earlier.map (·.id) ++ producer.id :: middle.map (·.id) ++ consumer.id :: later.map (·.id) := by simp [order]
          have lower := parent_predecessor_rank _ unique _ _ _ _ _ mapped
          have prior := ih _ (by omega) producer producerMember rfl
          obtain ⟨producerId, only, budget, _⟩ := preceding.parent_port_firing_budget_from_start program analysis admitted owner parent selected instanceId values root ready initial before issued final
            startId origin output startDeclared rootSelected parentIdentity started initiated priorRecords suffix entered following clean consumer (declared consumer member) place placeMember consumed
          have producerPresent := declared_output_producer program producer (declared producer producerMember) place.id (by simpa only [placeEq] using ordinary)
          rw [only] at producerPresent
          have identity := List.mem_singleton.mp producerPresent
          have noSeed : ownedPortCount [output] parent parent place.id = 0 := by simp [ownedPortCount, placeEq, Ne.symm first]
          have noNormal : ownedPortCount [analysis.entry.normalOutput] parent parent place.id = 0 := by simp [ownedPortCount, placeEq, Ne.symm normal]
          rw [noSeed, noNormal, ← identity] at budget
          omega
        · exact base (Or.inr (placeEq.trans reserved.2))
  exact ⟨admittedRoot, parentOperations, start, completion, path, roots, population,
    by simpa only [← aligned] using startEq, completionKind, by simpa only [← aligned] using trace,
    coverage, unique, fun consumer member => bounded _ consumer member rfl⟩

end BpmnSemantics.SemanticProcess.ParallelScopeReplay
