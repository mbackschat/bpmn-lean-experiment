module

import BpmnSemantics.SemanticProcess.ParallelScopeParentAccounting
public import BpmnSemantics.SemanticProcess.ParallelScopeLifetimeAccounting
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import all BpmnSemantics.SemanticProcess.ParallelScopeData
public import BpmnSemantics.SemanticProcess.ParallelScopeContinuationMarking
import BpmnSemantics.SemanticProcess.ContinuationMarkingLaws
import BpmnSemantics.SemanticProcess.TokenStorage
import BpmnSemantics.SemanticProcess.ParallelScopeRuntimeLaws
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! # Actual parent execution and parallel-entry uniqueness

PMIS-ENTER-01 needs fresh child continuation credit, independently of clean scope
population. This finite history retains exact evaluator calls; it does not assert
that every published command is a member of this pre-entry phase. Two-phase
parent accounting exhausts the selected entry input after its first execution,
independently of whether the collection is empty.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- Each constructor records actual successful execution before the selected parallel entry. -/
inductive ParallelScopeParentHistory (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) : RuntimeState → Prop where
  | start (instanceId : SemanticId) (root : DefinitionScope) (values : List VariableBinding)
      (state : RuntimeState) (selected : rootDefinitionScope? program = some root)
      (started : runningProgramStartState? program instanceId values = some state)
      (owner : parent = ⟨instanceId, root.id, 1⟩)
      (distinct : entry.childScopeId ≠ root.id) : ParallelScopeParentHistory program entry parent state
  | initiate {before after : RuntimeState} (history : ParallelScopeParentHistory program entry parent before)
      (output : ControlPlaceId)
      (declared : ∃ id origin, SemanticOperation.initiate id origin output ∈ program.operations)
      (applied : initiateState? before output = some after) :
      ParallelScopeParentHistory program entry parent after
  | body {before after : RuntimeState} (history : ParallelScopeParentHistory program entry parent before)
      (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
      (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
      (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
        .duplicate, .synchronize, .reachNoneEnd])
      (applied : applyInternalOperationOccurrence? program before candidate = some after) :
      ParallelScopeParentHistory program entry parent after
  | human {before after : RuntimeState} (history : ParallelScopeParentHistory program entry parent before)
      (id : UserTaskInstanceId) (values : List VariableBinding) (wait : UserTaskWait)
      (selected : before.waits.filter ((taskIdNamesWait id)) = [wait])
      (ordinary : hasParallelScopeDefinition program wait.owner = false)
      (applied : ParallelScopeCommand.completeTask? program before id values = some after) :
      ParallelScopeParentHistory program entry parent after
  | service {before after : RuntimeState} (history : ParallelScopeParentHistory program entry parent before)
      (id : EffectOccurrenceId) (values : List VariableBinding) (wait : EffectWait)
      (selected : before.effectWaits.filter (effectIdNamesWait id) = [wait])
      (ordinary : hasParallelScopeDefinition program wait.owner = false)
      (applied : ParallelScopeCommand.completeEffect? program before id (.success values) = some after) :
      ParallelScopeParentHistory program entry parent after

private theorem clean_resolved_owner (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (state : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation) (clean : ParallelScopeCleanEntry entry parent state)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    candidate.owner = parent := by
  obtain ⟨candidates, discovered, present⟩ :=
    resolveInternalOperationOccurrence_requires_exact_candidate program state candidate operation resolved
  unfold internalOperationOccurrences? at discovered
  split at discovered <;> try contradiction
  split at discovered <;> try contradiction
  dsimp only at discovered
  split at discovered <;> try contradiction
  cases Option.some.inj discovered
  obtain ⟨owner, member, same⟩ := List.mem_map.mp present
  rw [mem_sortBy] at member
  have rootMember := (List.mem_filter.mp member).1
  have ownerEq : owner = parent := by simpa [clean.1] using rootMember
  simpa [ownerEq] using (congrArg InternalOperationOccurrence.owner same).symm

/-- Actual Start and each permitted parent transition retain clean entry and zero foreign continuation credit. -/
theorem ParallelScopeParentHistory.clean_and_foreign_marking (program : Program)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program entry parent state) :
    ParallelScopeCleanEntry entry parent state ∧
      ∀ owner ≠ parent, ∀ place, continuationMarking state owner place = 0 := by
  induction history with
  | start instanceId root values state selected started owner distinct =>
      subst parent
      refine ⟨runningProgramStartState_clean_parallel_entry program instanceId values state root entry selected started distinct, ?_⟩
      simp only [runningProgramStartState?, selected, bind, Option.bind_some, pure, Option.some.injEq] at started
      subst state
      simp [continuationMarking, runningStartState, initialState]
  | @initiate before after history output _declared applied ih =>
      refine ⟨initiateState_preserves_clean_parallel_entry entry parent before after output ih.1 applied, ?_⟩
      have root : rootScopeOccurrence? before = some parent := by simp [rootScopeOccurrence?, ih.1.1]
      simp only [initiateState?, root, bind, Option.bind_some] at applied
      split at applied <;> try contradiction
      cases Option.some.inj applied
      intro owner different place
      have inserted := addToken_filter_length before.tokens output parent
        (fun token => token.owner == owner && token.placeId == place)
      have unchanged : continuationMarking
          { before with tokens := addToken before.tokens output parent } owner place =
          continuationMarking before owner place := by
        simp only [continuationMarking]
        rw [inserted]
        simp [Ne.symm different]
      exact unchanged.trans (ih.2 owner different place)
  | @body before after history candidate operation resolved kind applied ih =>
      refine ⟨applyInternalOperationOccurrence_body_clean_entry program before after candidate operation entry parent ih.1 resolved kind applied, ?_⟩
      have owned := clean_resolved_owner program entry parent before candidate operation ih.1 resolved
      intro owner different place
      have balance := applyInternalOperationOccurrence_continuation_balance program before after candidate operation resolved kind applied owner place
      rw [owned, ownedPortCount_foreign _ parent owner place (Ne.symm different),
        ownedPortCount_foreign _ parent owner place (Ne.symm different)] at balance
      simpa [ih.2 owner different place] using balance
  | @human before after history id values wait selected ordinary applied ih =>
      refine ⟨ParallelScopeCommand.completeTask_preserves_clean_entry program before after id values entry parent wait ih.1 selected ordinary applied, ?_⟩
      intro owner different place
      rw [ParallelScopeCommand.completeTask_continuation_marking program before after id values applied owner place]
      exact ih.2 owner different place
  | @service before after history id values wait selected ordinary applied ih =>
      refine ⟨ParallelScopeCommand.completeEffect_preserves_clean_entry program before after id (.success values) entry parent wait ih.1 selected ordinary applied, ?_⟩
      intro owner different place
      rw [ParallelScopeCommand.completeEffect_continuation_marking program before after id (.success values) applied owner place]
      exact ih.2 owner different place

/-- Every real pre-entry token or wait is owned by the live root, as forced by its positive marking contribution. -/
theorem ParallelScopeParentHistory.live_owners (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program entry parent state) :
    (∀ token ∈ state.tokens, ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = token.owner) ∧
    (∀ wait ∈ state.waits, ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = wait.owner) ∧
    (∀ wait ∈ state.effectWaits, ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = wait.owner) := by
  obtain ⟨clean, fresh⟩ := history.clean_and_foreign_marking program entry parent state
  have rootPresent : (⟨parent, none⟩ : RuntimeScopeOccurrence) ∈ state.scopeOccurrences := by simp [clean.1]
  refine ⟨?_, ?_, ?_⟩
  · intro token member
    have owned : token.owner = parent := by
      by_cases same : token.owner = parent
      · exact same
      have selected : token ∈ state.tokens.filter (fun current => current.owner == token.owner && current.placeId == token.placeId) := by simp [member]
      have positive : 0 < (state.tokens.filter (fun current => current.owner == token.owner && current.placeId == token.placeId)).length :=
        List.length_pos_iff.mpr (by intro empty; simp [empty] at selected)
      have zero := fresh token.owner same token.placeId
      simp only [continuationMarking] at zero
      omega
    exact ⟨⟨parent, none⟩, rootPresent, owned.symm⟩
  · intro wait member
    have owned : wait.owner = parent := by
      by_cases same : wait.owner = parent
      · exact same
      have selected : wait ∈ state.waits.filter (fun current => current.owner == wait.owner && current.output == wait.output) := by simp [member]
      have positive : 0 < (state.waits.filter (fun current => current.owner == wait.owner && current.output == wait.output)).length :=
        List.length_pos_iff.mpr (by intro empty; simp [empty] at selected)
      have zero := fresh wait.owner same wait.output
      simp only [continuationMarking] at zero
      omega
    exact ⟨⟨parent, none⟩, rootPresent, owned.symm⟩
  · intro wait member
    have owned : wait.owner = parent := by
      by_cases same : wait.owner = parent
      · exact same
      have selected : wait ∈ state.effectWaits.filter (fun current => current.owner == wait.owner && current.output == wait.output) := by simp [member]
      have positive : 0 < (state.effectWaits.filter (fun current => current.owner == wait.owner && current.output == wait.output)).length :=
        List.length_pos_iff.mpr (by intro empty; simp [empty] at selected)
      have zero := fresh wait.owner same wait.output
      simp only [continuationMarking] at zero
      omega
    exact ⟨⟨parent, none⟩, rootPresent, owned.symm⟩

/-- Actual parent execution establishes the structural root frame needed after entry and retirement. -/
theorem ParallelScopeParentHistory.structural_frame (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program entry parent state) :
    ParallelScopeStructuralFrame parent state := by
  induction history with
  | start instanceId root values state selected started owner distinct =>
    rw [owner]
    exact runningProgramStartState_structural_parallel_frame program instanceId values state root selected started
  | @initiate before after history output _declared applied ih =>
    exact initiateState_structural_parallel_frame parent before after output ih applied
  | @body before after history candidate operation resolved kind applied ih =>
    exact InternalCommutation.applyInternalOperationOccurrence_body_structural_parallel_frame program parent before after
      candidate operation ih resolved kind applied
  | @human before after history id values wait selected ordinary applied ih =>
    exact ParallelScopeCommand.completeTask_structural_parallel_frame program parent before after id values ih applied
  | @service before after history id values wait selected ordinary applied ih =>
    exact ParallelScopeCommand.completeEffect_structural_parallel_frame program parent before after id (.success values) ih applied

namespace ParallelScopeReplay

private theorem trace_entry_input_source (entryId : OperationId) (operations : List SemanticOperation)
    (next : ControlPlaceId) (entered : Bool) (path : List SemanticOperation)
    (trace : ParallelScopeStart.ParentSpineTrace entryId operations next entered path) :
    entered = false → ∃ operation ∈ path, ∃ entry, parallelScopeEntry? operation = some entry ∧
      (entry.input = next ∨ ∃ producer ∈ path, entry.input ∈ operationOutputs producer) := by
  induction trace with
  | finish => simp
  | step operations next output entered nextEntered operation tail selected edge rest ih =>
    intro pending
    cases operation <;> simp only [ParallelScopeStart.ParentSpineStep] at edge <;> try contradiction
    case awaitUserTask id origin input out task =>
      obtain ⟨consumer, member, entry, decoded, source⟩ := ih (edge.2.trans pending)
      refine ⟨consumer, by simp [member], entry, decoded, Or.inr ?_⟩
      rcases source with seed | ⟨producer, member, produced⟩
      · exact ⟨.awaitUserTask id origin input out task, by simp, by simp [operationOutputs, seed, edge.1]⟩
      · exact ⟨producer, by simp [member], produced⟩
    case awaitEffect id origin input out effect route =>
      cases route <;> simp only at edge <;> try contradiction
      obtain ⟨consumer, member, entry, decoded, source⟩ := ih (edge.2.trans pending)
      refine ⟨consumer, by simp [member], entry, decoded, Or.inr ?_⟩
      rcases source with seed | ⟨producer, member, produced⟩
      · exact ⟨.awaitEffect id origin input out effect none, by simp, by simp [operationOutputs, seed, edge.1]⟩
      · exact ⟨producer, by simp [member], produced⟩
    case enterParallelMultiInstanceScope id origin input childEntry childScope normal collection item mappings condition =>
      have present : SemanticOperation.enterParallelMultiInstanceScope id origin input childEntry childScope normal collection item mappings condition ∈
          operations.filter (fun operation => (SequentialScopeControl.inputs operation).contains next) := by rw [selected]; simp
      have inputEq : input = next := by
        have chosen : next = input := by simpa [SequentialScopeControl.inputs, bodyConsumedPorts] using (List.mem_filter.mp present).2
        exact chosen.symm
      exact ⟨.enterParallelMultiInstanceScope id origin input childEntry childScope normal collection item mappings condition,
        by simp, ⟨id, origin.elementId, input, childEntry, childScope, normal, collection, item, mappings, condition⟩, rfl, Or.inl inputEq⟩

/-- Start, actual entry and both actual lifetime phases exhaust the selected entry's parent input credit. -/
theorem ContinuationCommandHistory.no_second_parallel_entry
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
    parentContinuationMarking analysis.entry parent final analysis.entry.input = 0 ∧
      enterParallelScope? analysis.entry final parent = none := by
  obtain ⟨admittedRoot, parentOperations, start, completion, path, roots, population, startEq,
    _, trace, coverage, unique, bounded⟩ := preceding.parent_path_firing_le_one program analysis admitted owner parent selected
      instanceId values root ready initial before issued final startId origin output startDeclared rootSelected parentIdentity
      started initiated priorRecords suffix entered following clean
  obtain ⟨consumer, member, entry, decoded, source⟩ := trace_entry_input_source analysis.entry.id _ output false path trace rfl
  have declared : ∀ operation ∈ path, operation ∈ program.operations := by
    intro operation member
    exact (List.mem_filter.mp (population ▸ (coverage.mem_iff.mpr (by simp [member])))).1
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
  have parsed : entry ∈ program.operations.filterMap parallelScopeEntry? := List.mem_filterMap.mpr ⟨consumer, declared consumer member, decoded⟩
  rw [entries] at parsed
  have identity : entry = analysis.entry := by simpa using parsed
  subst entry
  have input : analysis.entry.input ∈ bodyConsumedPorts consumer := by
    cases consumer <;> simp only [parallelScopeEntry?] at decoded <;> try contradiction
    have same := Option.some.inj decoded
    simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton] using (congrArg ParallelScopeEntry.input same).symm
  have place : ∃ place ∈ program.controlPlaces, place.id = analysis.entry.input := by
    have valid := List.all_eq_true.mp (programWellFormed_operations program
      (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1) consumer (declared consumer member)
    cases consumer <;> simp only [parallelScopeEntry?] at decoded <;> try contradiction
    have same := Option.some.inj decoded
    simp only [operationWellFormed, parallelScopeOperationWellFormed, Bool.and_eq_true] at valid
    have port := List.all_eq_true.mp valid.1.1.1.1.2 analysis.entry.input
      (by simp [(congrArg ParallelScopeEntry.input same).symm])
    simpa only [beq_iff_eq] using List.any_eq_true.mp port
  obtain ⟨place, placeMember, placeEq⟩ := place
  have balance := preceding.parent_balance_from_start program analysis admitted owner parent selected instanceId values root
    ready initial before issued final output rootSelected parentIdentity started initiated priorRecords suffix entered following clean analysis.entry.input
  have unit : ownedPortCount [analysis.entry.input] parent parent analysis.entry.input = 1 := by simp [ownedPortCount]
  have exhausted : parentContinuationMarking analysis.entry parent final analysis.entry.input = 0 := by
    by_cases seed : analysis.entry.input = output
    · have first := preceding.start_output_produced_charge_zero program analysis admitted owner parent selected initial before priorRecords startId origin output startDeclared
      have second := following.start_output_produced_charge_zero program analysis admitted owner parent selected issued final suffix startId origin output startDeclared
      have distinct := admitted_start_output_ne_entry_normal program analysis admitted startId origin output startDeclared
      simp only [List.map_append, List.sum_append] at balance
      rw [seed, first, second] at balance
      simp [ownedPortCount, distinct.symm] at balance
      rw [seed]
      omega
    by_cases normal : analysis.entry.input = analysis.entry.normalOutput
    · have first := preceding.entry_normal_produced_charge_zero program analysis admitted owner parent selected initial before priorRecords
      have second := following.entry_normal_produced_charge_zero program analysis admitted owner parent selected issued final suffix
      simp only [List.map_append, List.sum_append] at balance
      rw [normal, first, second] at balance
      have different : output ≠ analysis.entry.normalOutput := by
        intro same
        exact seed (normal.trans same.symm)
      simp [ownedPortCount, different] at balance
      rw [normal]
      omega
    obtain ⟨producerId, only, budget, _⟩ := preceding.parent_port_firing_budget_from_start program analysis admitted owner parent selected
      instanceId values root ready initial before issued final startId origin output startDeclared rootSelected parentIdentity started initiated
      priorRecords suffix entered following clean consumer (declared consumer member) place placeMember (placeEq ▸ input)
    rcases source with first | ⟨producer, producerMember, produced⟩
    · exact False.elim (seed first)
    have present := declared_output_producer program producer (declared producer producerMember) place.id (placeEq ▸ produced)
    rw [only] at present
    have same : producer.id = producerId := by simpa using present
    have count := bounded producer producerMember
    rw [placeEq, unit, ← same] at budget
    have noSeed : ownedPortCount [output] parent parent analysis.entry.input = 0 := by simp [ownedPortCount, Ne.symm seed]
    have noNormal : ownedPortCount [analysis.entry.normalOutput] parent parent analysis.entry.input = 0 := by simp [ownedPortCount, Ne.symm normal]
    rw [noSeed, noNormal] at budget
    omega
  refine ⟨exhausted, ?_⟩
  have empty : (final.tokens.filter (fun token => token.placeId == analysis.entry.input && token.owner == parent)).length = 0 := by
    simp only [parentContinuationMarking, continuationMarking] at exhausted
    have same : final.tokens.filter (fun token => token.placeId == analysis.entry.input && token.owner == parent) =
        final.tokens.filter (fun token => token.owner == parent && token.placeId == analysis.entry.input) := by
      congr 1
      funext token
      exact Bool.and_comm _ _
    rw [same]
    omega
  simp [enterParallelScope?, empty]

theorem entry_scope_count (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before initial : RuntimeState) (clean : ParallelScopeCleanEntry entry parent before)
    (entered : enterParallelScope? entry before parent = some initial) :
    ∃ (items : List String) (binding : VariableBinding),
      before.variables.process.bindings.filter (·.name == entry.collectionName) = [binding] ∧
      binding.value = .stringList items ∧ items.length ≤ 16 ∧
      initial.scopeOccurrences.length = items.length + 1 := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  rename_i binding selected
  split at entered <;> try contradiction
  rename_i items typed
  split at entered <;> try contradiction
  rename_i bounded
  have limit : items.length ≤ 16 := by
    have notTooMany : ¬16 < items.length := by
      intro tooMany
      simp [tooMany] at bounded
    omega
  cases items with
  | nil =>
    cases Option.some.inj entered
    exact ⟨[], binding, selected, typed, limit, by simp [clean.1]⟩
  | cons item items =>
    obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at entered
    | cons first rest =>
      cases Option.some.inj entered
      have population := (issueParallelBodies_scope_population generated).length_eq
      have itemCount := congrArg List.length (issueParallelBodies_preserves_items_and_indices generated).1
      simp only [List.length_map] at itemCount
      simp only [List.length_append, List.length_map, clean.1, List.length_cons, List.length_nil] at population
      refine ⟨item :: items, binding, selected, typed, limit, ?_⟩
      change issued.scopeOccurrences.length = (item :: items).length + 1
      simp only [List.length_cons] at itemCount ⊢
      omega

/-- Actual parent execution, entry and lifetime replay bound retirement by the collection actually captured at entry, including an empty collection. -/
theorem ContinuationCommandHistory.retirement_budget_from_parent_entry
    (program : Program) (entry : ParallelScopeEntry) (owner parent : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (before initial final : RuntimeState) (records : List CommittedTransition)
    (parents : ParallelScopeParentHistory program entry parent before)
    (entered : enterParallelScope? entry before parent = some initial)
    (history : ContinuationCommandHistory program owner initial final records) :
    ∃ (items : List String) (binding : VariableBinding),
      before.variables.process.bindings.filter (·.name == entry.collectionName) = [binding] ∧
      binding.value = .stringList items ∧ items.length ≤ 16 ∧
      (records.map retirementCharge).sum ≤ items.length := by
  have clean := (parents.clean_and_foreign_marking program entry parent before).1
  have frame := enterParallelScope_structural_parallel_frame entry parent before initial clean
    (parents.structural_frame program entry parent before) entered
  have budget := history.retirement_budget_with_root program owner parent selected initial final records frame
  obtain ⟨items, binding, selectedBinding, typed, limit, count⟩ := entry_scope_count entry parent before initial clean entered
  refine ⟨items, binding, selectedBinding, typed, limit, ?_⟩
  rw [count] at budget
  omega


/-- PMIS admission and actual singleton execution expose their real phase without assuming phase order or a body-only command suffix. -/
theorem applyInternalOperationOccurrence_admitted_phases (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    ∃ (operation : SemanticOperation) (record : InternalTransitionRecord),
      resolveInternalOperationOccurrence? program before candidate = some operation ∧
      operation ∈ program.operations ∧ operation.id = candidate.operationId ∧
      record = {
        operationId := candidate.operationId, operationKind := operation.kind,
        origin := operation.origin, owner := candidate.owner, mergeInput := none } ∧
      replayInternalOperationOccurrence? program before record = some after ∧
      ((record.operationKind = .initiate ∧ ∃ output root,
        SemanticOperation.initiate record.operationId record.origin output ∈ program.operations ∧
        before.scopeOccurrences.filter (·.parent.isNone) = [root] ∧ root.id = record.owner ∧
        rootScopeOccurrence? before = some record.owner ∧ initiateState? before output = some after) ∨
      (record.operationKind = .enterParallelMultiInstanceScope ∧
        enterParallelScope? analysis.entry before record.owner = some after) ∨
      (record.operationKind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] ∨
        record.operationKind = .completeParallelMultiInstanceScope) ∨
      (record.operationKind = .completeScope ∧ ∃ root instanceId, root.id = record.owner ∧
        root.parent = none ∧ root ∈ before.scopeOccurrences ∧ after.control = .completed instanceId ∧
        ∀ next, replayInternalOperationOccurrence? program after next = none)) := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selected : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selected] at admitted
    | true => simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  have merge (operation : SemanticOperation) : isMergeTargetOperation program operation = false :=
    isMergeTargetOperation_eq_false_of_profile program operation (by rw [profile]; decide +kernel)
  obtain ⟨operation, resolved, identity, replayed⟩ := applyInternalOperationOccurrence_replay_record
    program before after candidate profile applied
  let record : InternalTransitionRecord := {
    operationId := candidate.operationId, operationKind := operation.kind,
    origin := operation.origin, owner := candidate.owner, mergeInput := none }
  have replay : replayInternalOperationOccurrence? program before record = some after := replayed
  have member := (resolveInternalOperationOccurrence_declaration program before candidate operation resolved).1
  refine ⟨operation, record, resolved, member, identity, rfl, replay, ?_⟩
  by_cases ordinary : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] ∨
      operation.kind = .completeParallelMultiInstanceScope
  · exact Or.inr (Or.inr (Or.inl ordinary))
  · cases operation <;> simp [SemanticOperation.kind] at ordinary
    case initiate =>
      exact Or.inl ⟨rfl, replayed_initiation_execution program before after record rfl replay⟩
    case enterParallelMultiInstanceScope =>
      exact Or.inr (Or.inl ⟨rfl, replayed_parallel_entry_execution program analysis admitted before after record rfl replay⟩)
    case completeScope =>
      exact Or.inr (Or.inr (Or.inr ⟨rfl, replayed_final_root_completion program analysis admitted before after record rfl replay⟩))
    all_goals cases control : before.control <;>
      simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some, merge,
        Bool.false_eq_true, Bool.false_and, ↓reduceIte] at applied <;> contradiction


theorem replayed_scope_sublist (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    after.scopeOccurrences.Sublist before.scopeOccurrences := by
  rcases kind with body | retirement
  · obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
      replayInternalOperationOccurrence_sound program before after record replayed
    have same := (applyInternalOperationOccurrence_body_retirement_frame program before after
      ⟨record.operationId, record.owner⟩ operation resolved (by rw [metadata]; exact body) applied).2.1
    rw [same]
    exact List.Sublist.refl _
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    exact (completeParallelScope_scope_census entry before after record.owner completed).1

private theorem ordered_scope_sublist (program : Program) (initial final : RuntimeState)
    (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧ replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record) :
    final.scopeOccurrences.Sublist initial.scopeOccurrences := by
  induction records generalizing initial successors with
  | nil =>
    have empty : successors = [] := by simpa using length
    subst successors
    have same : initial = final := by simpa using last
    rw [same]
    exact List.Sublist.refl _
  | cons head rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      obtain ⟨record, same, actual⟩ := aligned (head, initial, next) (by simp)
      change head = .internalOperation record at same
      have first := replayed_scope_sublist program initial next record (same ▸ kinds head (by simp)) actual
      have later := ih next tail (by simpa using length) (by simpa using last)
        (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
        (fun record member => kinds record (by simp [member]))
      exact later.trans first

/-- Actual lifetime body, retirement and wait-command execution never allocates a scope; surviving populations remain a sublist of the issued census. -/
theorem ContinuationCommandHistory.scopeOccurrences_sublist (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true) (initial final : RuntimeState)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial final records) :
    final.scopeOccurrences.Sublist initial.scopeOccurrences := by
  induction history with
  | initial => exact List.Sublist.refl _
  | @internalStep before after earlier record history replayed kind outside ih =>
    exact (replayed_scope_sublist program before after record kind replayed).trans ih
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    obtain ⟨actualStimulus, actualRest, admitted, successors, shape, _, stateEq, length, last, aligned⟩ :=
      committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
    cases shape
    have scopes := admission_scope_frame program before stimulus selected completion
    rw [stateEq] at scopes
    have retained := ordered_scope_sublist program admitted after rest successors length last aligned kinds
    rw [scopes] at retained
    exact retained.trans ih


/-- A clean actual entry issues only its selected parent and body definition, including the empty collection. -/
theorem enterParallelScope_clean_scope_domain (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before issued : RuntimeState) (clean : ParallelScopeCleanEntry entry parent before)
    (entered : enterParallelScope? entry before parent = some issued) :
    ∀ occurrence ∈ issued.scopeOccurrences, occurrence.id = parent ∨ occurrence.id.definitionScopeId = entry.childScopeId := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    intro occurrence member
    have same : occurrence = ⟨parent, none⟩ := by simpa [clean.1] using member
    subst occurrence
    exact Or.inl rfl
  · obtain ⟨⟨generated, iterations⟩, issuedBodies, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at entered
    | cons first rest =>
      cases Option.some.inj entered
      intro occurrence member
      have population := issueParallelBodies_scope_population issuedBodies
      have present := population.mem_iff.mp member
      rcases List.mem_append.mp present with body | root
      · obtain ⟨iteration, iterationMember, same⟩ := List.mem_map.mp body
        subst occurrence
        exact Or.inr (issueParallelBodies_scope_domain issuedBodies iteration iterationMember).2
      · have same : occurrence = ⟨parent, none⟩ := by simpa [clean.1] using root
        subst occurrence
        exact Or.inl rfl

private theorem entered_owner_from_domain (entry : ParallelScopeEntry) (parent owner : ScopeOccurrenceId)
    (state after : RuntimeState)
    (domain : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id = parent ∨ occurrence.id.definitionScopeId = entry.childScopeId)
    (entered : enterParallelScope? entry state owner = some after) : owner = parent := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  rename_i admitted
  have count : (state.scopeOccurrences.filter fun occurrence => occurrence.id == owner).length = 1 := by
    apply Classical.byContradiction
    intro different
    simp [different] at admitted
  have noChildren : (state.scopeOccurrences.any fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = false := by
    cases children : state.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) with
    | false => rfl
    | true => simp [children] at admitted
  have positive : 0 < (state.scopeOccurrences.filter fun occurrence => occurrence.id == owner).length := by omega
  obtain ⟨occurrence, present⟩ := List.exists_mem_of_ne_nil _ (List.length_pos_iff.mp positive)
  obtain ⟨member, owned⟩ := List.mem_filter.mp present
  have same : occurrence.id = owner := by simpa only [beq_iff_eq] using owned
  rcases domain occurrence member with root | child
  · exact same.symm.trans root
  · have absent := List.any_eq_false.mp noChildren occurrence member
    simp [child] at absent

/-- Actual Start, parent execution and entry exclude initiation or entry from a later successful singleton; terminal root completion remains a distinct phase. -/
theorem ContinuationCommandHistory.post_entry_occurrence_phases
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued final after : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial) (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (candidate : InternalOperationOccurrence) (applied : applyInternalOperationOccurrence? program final candidate = some after) :
    ∃ (operation : SemanticOperation) (record : InternalTransitionRecord),
      resolveInternalOperationOccurrence? program final candidate = some operation ∧ operation ∈ program.operations ∧
      operation.id = candidate.operationId ∧ record = {
        operationId := candidate.operationId, operationKind := operation.kind,
        origin := operation.origin, owner := candidate.owner, mergeInput := none } ∧
      replayInternalOperationOccurrence? program final record = some after ∧
      ((record.operationKind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] ∨
        record.operationKind = .completeParallelMultiInstanceScope) ∨
      (record.operationKind = .completeScope ∧ ∃ root instanceId, root.id = record.owner ∧ root.parent = none ∧
        root ∈ final.scopeOccurrences ∧ after.control = .completed instanceId ∧
        ∀ next, replayInternalOperationOccurrence? program after next = none)) := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at admitted
    | true => rfl
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have domain := enterParallelScope_clean_scope_domain analysis.entry parent before issued clean entered
  have retained := following.scopeOccurrences_sublist program owner selected issued final suffix
  have finalDomain : ∀ occurrence ∈ final.scopeOccurrences,
      occurrence.id = parent ∨ occurrence.id.definitionScopeId = analysis.entry.childScopeId :=
    fun occurrence member => domain occurrence (retained.subset member)
  obtain ⟨operation, record, resolved, member, identity, metadata, replayed, phases⟩ :=
    applyInternalOperationOccurrence_admitted_phases program analysis admitted final after candidate applied
  refine ⟨operation, record, resolved, member, identity, metadata, replayed, ?_⟩
  rcases phases with ⟨_, nextOutput, nextRoot, _, _, _, _, initiatedAgain⟩ | ⟨_, enteredAgain⟩ | body | terminal
  · have refused := (preceding.no_reinitiation_through_entry program owner selected ready initial before issued final output
      initiated analysis.entry parent priorRecords suffix entered following).2 nextOutput
    rw [refused] at initiatedAgain
    contradiction
  · have actualOwner := entered_owner_from_domain analysis.entry parent record.owner final after finalDomain enteredAgain
    rw [actualOwner] at enteredAgain
    have refused := (preceding.no_second_parallel_entry program analysis admitted owner parent selected instanceId values root
      ready initial before issued final startId origin output startDeclared rootSelected parentIdentity started initiated
      priorRecords suffix entered following clean).2
    rw [refused] at enteredAgain
    contradiction
  · exact Or.inl body
  · exact Or.inr terminal


/-- Actual post-entry selected execution retains lifetime accounting or exposes terminal root completion, with exact executed-record count and independent Compensation absence. -/
theorem ContinuationCommandHistory.extend_post_entry_selected_execution
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued current after : RuntimeState) (startId : OperationId)
    (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial) (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued current suffix)
    (noCompensation : current.compensationHandlerEffectWaits = []) (count : Nat)
    (executed : (∃ candidate, count = 1 ∧ applyInternalOperationOccurrence? program current candidate = some after) ∨
      (∃ batch successors, applyInternalOccurrenceBatch? program current batch = some successors ∧
        successors.length = count ∧ successors.getLast? = some after)) :
    ∃ added : List CommittedTransition, added.length = count ∧ after.compensationHandlerEffectWaits = [] ∧
      (ContinuationCommandHistory program owner issued after (suffix ++ added) ∨
        ∃ record, added = [.internalOperation record] ∧ record.operationKind = .completeScope ∧
          replayInternalOperationOccurrence? program current record = some after ∧
          ∃ root instanceId, root.id = record.owner ∧ root.parent = none ∧ root ∈ current.scopeOccurrences ∧
            after.control = .completed instanceId ∧ ∀ next, replayInternalOperationOccurrence? program after next = none) := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selected : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, selected] at admitted
    | true => simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  have selected : ParallelScopeStart.programSelected program = true := by simp [ParallelScopeStart.programSelected, profile]
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have issuedFrame := enterParallelScope_structural_parallel_frame analysis.entry parent before issued clean
    (parents.structural_frame program analysis.entry parent before) entered
  have currentFrame := following.structural_frame program owner parent selected issued current suffix issuedFrame
  rcases executed with ⟨candidate, countEq, applied⟩ | ⟨batch, successors, applied, countEq, last⟩
  · obtain ⟨operation, record, resolved, _, _, metadata, replayed, phases⟩ :=
      preceding.post_entry_occurrence_phases program analysis admitted owner parent instanceId values root
        ready initial before issued current after startId origin output startDeclared rootSelected parentIdentity started initiated
        priorRecords suffix parents entered following candidate applied
    have absent := applyInternalOperationOccurrence_compensation_absent program analysis admitted current after candidate applied noCompensation
    refine ⟨[.internalOperation record], by simp [countEq], absent, ?_⟩
    rcases phases with body | ⟨kind, terminal⟩
    · obtain ⟨chosen, chosenEq, _, extended⟩ := following.extend_occurrence_application
        program owner parent issued current after suffix candidate profile applied
        (by
          intro chosen chosenEq
          rw [resolved] at chosenEq
          cases Option.some.inj chosenEq
          simpa only [metadata] using body) currentFrame different
      rw [resolved] at chosenEq
      cases Option.some.inj chosenEq
      exact Or.inl (by simpa only [metadata] using extended)
    · exact Or.inr ⟨record, rfl, kind, replayed, terminal⟩
  · have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1
    obtain ⟨length, _⟩ := applyInternalOccurrenceBatch_ordered_steps program current batch successors applied
    have extended := following.extend_reserved_batch program owner parent issued current suffix batch successors
      applied wellFormed profile noCompensation currentFrame different
    have endpoint : (current :: successors)[batch.members.length]? = some after := by
      rw [← length]
      have finalIndex := (List.getLast?_eq_getElem? (l := current :: successors)).symm.trans
        (List.getLast?_cons (a := current))
      simpa only [List.length_cons, Nat.add_sub_cancel, last, Option.getD_some] using finalIndex
    refine ⟨batch.members.map reservedPatchTransition, ?_, (extended.1 _ _ endpoint).2.1, Or.inl ?_⟩
    · simp only [List.length_map]
      omega
    · simpa only [last, Option.getD_some] using extended.2


private theorem parallel_write_without_activity (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind)
    (empty : state.activityOccurrences = []) : writeParallelScopeValues? program state owner values kind = none := by
  unfold writeParallelScopeValues?
  split <;> try rfl
  cases control : state.control <;> simp [parallelScopeBinding?, control, empty]

private theorem parent_human_completion (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (parents : ParallelScopeParentHistory program entry parent before)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after) :
    ParallelScopeParentHistory program entry parent after := by
  have evaluated := completed
  unfold ParallelScopeCommand.completeTask? at evaluated
  split at evaluated <;> try contradiction
  rename_i candidates wait selected
  cases parallel : hasParallelScopeDefinition program wait.owner with
  | false => exact ParallelScopeParentHistory.human parents id values wait selected parallel completed
  | true =>
    simp only [parallel, ↓reduceIte] at evaluated
    unfold completeParallelScopeUserTask? at evaluated
    split at evaluated <;> try contradiction
    split at evaluated <;> try contradiction
    obtain ⟨variables, written, _⟩ := Option.bind_eq_some_iff.mp evaluated
    have empty := (parents.clean_and_foreign_marking program entry parent before).1.2.2.1
    rw [parallel_write_without_activity program before _ _ _ empty] at written
    contradiction

private theorem parent_service_completion (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (parents : ParallelScopeParentHistory program entry parent before)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after) :
    ParallelScopeParentHistory program entry parent after := by
  have evaluated := completed
  unfold ParallelScopeCommand.completeEffect? at evaluated
  split at evaluated <;> try contradiction
  rename_i candidates wait selected
  cases parallel : hasParallelScopeDefinition program wait.owner with
  | false => exact ParallelScopeParentHistory.service parents id values wait selected parallel completed
  | true =>
    simp only [parallel, ↓reduceIte] at evaluated
    unfold completeParallelScopeEffect? at evaluated
    split at evaluated <;> try contradiction
    split at evaluated <;> try contradiction
    split at evaluated <;> try contradiction
    split at evaluated <;> try contradiction
    obtain ⟨projected, _, evaluated⟩ := Option.bind_eq_some_iff.mp evaluated
    obtain ⟨variables, written, _⟩ := Option.bind_eq_some_iff.mp evaluated
    have empty := (parents.clean_and_foreign_marking program entry parent before).1.2.2.1
    rw [parallel_write_without_activity program before _ _ _ empty] at written
    contradiction
    case h_2 =>
      rename_i impossible
      exact False.elim (impossible values rfl)

end ParallelScopeReplay

open ParallelScopeReplay

/-- Before entry, actual wait admission retains the parent history; clean population refuses scoped writes and rejected ingress leaves the predecessor unchanged. -/
theorem ParallelScopeParentHistory.wait_admission (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (before : RuntimeState)
    (parents : ParallelScopeParentHistory program entry parent before)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) :
    ParallelScopeParentHistory program entry parent (admitStimulus program before stimulus).state := by
  apply admitStimulus_wait_preserves program before stimulus selected completion
    (ParallelScopeParentHistory program entry parent) parents
  · exact fun id values after applied => parent_human_completion program entry parent before after parents id values applied
  · exact fun id values after applied => parent_service_completion program entry parent before after parents id values applied

/-- Committed pre-entry wait ingress preserves both actual histories without adding internal records before closure. -/
theorem ParallelScopeParentHistory.wait_admission_histories (program : Program) (entry : ParallelScopeEntry)
    (parent owner : ScopeOccurrenceId) (initial before : RuntimeState) (records : List CommittedTransition)
    (parents : ParallelScopeParentHistory program entry parent before)
    (history : ContinuationCommandHistory program owner initial before records)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    ParallelScopeParentHistory program entry parent (admitStimulus program before stimulus).state ∧
      ContinuationCommandHistory program owner initial (admitStimulus program before stimulus).state records := by
  exact ⟨parents.wait_admission program entry parent before stimulus selected completion,
    history.extend_wait_admission program owner selected snapshots initial before records stimulus completion committed⟩



/-- Actual pre-entry execution is parent-owned and either extends parent history, enters its canonical population, or completes the root; premature completion is deliberately retained. -/
theorem ParallelScopeParentHistory.pre_entry_occurrence_phases
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (candidate : InternalOperationOccurrence) (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    ∃ (operation : SemanticOperation) (record : InternalTransitionRecord),
      resolveInternalOperationOccurrence? program before candidate = some operation ∧ operation ∈ program.operations ∧
      operation.id = candidate.operationId ∧ candidate.owner = parent ∧ record = {
        operationId := candidate.operationId, operationKind := operation.kind,
        origin := operation.origin, owner := candidate.owner, mergeInput := none } ∧ record.owner = parent ∧
      replayInternalOperationOccurrence? program before record = some after ∧
      ((record.operationKind = .initiate ∧ ∃ output, initiateState? before output = some after ∧
        ParallelScopeParentHistory program analysis.entry parent after) ∨
      (record.operationKind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] ∧
        ParallelScopeParentHistory program analysis.entry parent after) ∨
      (record.operationKind = .enterParallelMultiInstanceScope ∧ enterParallelScope? analysis.entry before parent = some after) ∨
      (record.operationKind = .completeScope ∧ ∃ root instanceId, root.id = record.owner ∧ root.parent = none ∧
        root ∈ before.scopeOccurrences ∧ after.control = .completed instanceId ∧
        ∀ next, replayInternalOperationOccurrence? program after next = none)) := by
  obtain ⟨operation, record, resolved, member, identity, metadata, replayed, phases⟩ :=
    applyInternalOperationOccurrence_admitted_phases program analysis admitted before after candidate applied
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have owned := clean_resolved_owner program analysis.entry parent before candidate operation clean resolved
  have recordOwned : record.owner = parent := by simpa only [metadata] using owned
  refine ⟨operation, record, resolved, member, identity, owned, metadata, recordOwned, replayed, ?_⟩
  rcases phases with ⟨kind, output, root, declared, _, _, _, initiated⟩ | ⟨kind, entered⟩ | body | terminal
  · exact Or.inl ⟨kind, output, initiated,
      ParallelScopeParentHistory.initiate parents output ⟨record.operationId, record.origin, declared⟩ initiated⟩
  · rw [recordOwned] at entered
    exact Or.inr (Or.inr (Or.inl ⟨kind, entered⟩))
  · rcases body with ordinary | retirement
    · have operationKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] := by
        simpa only [metadata] using ordinary
      exact Or.inr (Or.inl ⟨ordinary, ParallelScopeParentHistory.body parents candidate operation resolved operationKind applied⟩)
    · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
      have empty := clean.2.2.1
      cases control : before.control <;>
        simp [completeParallelScope?, parallelScopeBinding?, control, empty] at completed
  · exact Or.inr (Or.inr (Or.inr terminal))

end BpmnSemantics.SemanticProcess
