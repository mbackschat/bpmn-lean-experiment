module

import BpmnSemantics.SemanticProcess.ParallelScopeBodyAccounting
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.ParallelScopeProgress
import BpmnSemantics.SemanticProcess.ParallelScopeReservedArmingReplay
import BpmnSemantics.SemanticProcess.ParallelScopeRuntimeLaws
public import BpmnSemantics.SemanticProcess.InternalScheduledClosure
public import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability
import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! # Initial parallel entry blockers

PMIS-ENTER-01 issues one entry credit per live child. PMIS-ADMIT-01's
strict predecessor order makes disappearance of every continuation imply a Task
firing; without external ingress its issued wait still blocks retirement.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

theorem parallelScopeStart_selected_of_admitted (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) :
    ParallelScopeStart.programSelected program = true := by
  cases selected : ParallelScopeStart.programSelected program with
  | false => simp [ParallelScopeStart.analyzeProgram, selected] at admitted
  | true => rfl

private theorem append_history (program : Program) (owner : ScopeOccurrenceId)
    (initial middle final : RuntimeState) (earlier later : List CommittedTransition)
    (first : ContinuationCommandHistory program owner initial middle earlier)
    (second : ContinuationCommandHistory program owner middle final later) :
    ContinuationCommandHistory program owner initial final (earlier ++ later) := by
  induction second with
  | initial => simpa using first
  | internalStep previous replayed kind outside ih =>
    simpa only [List.append_assoc] using ContinuationCommandHistory.internalStep ih replayed kind outside
  | command previous replayed completion kinds outside ih =>
    simpa only [List.append_assoc] using ContinuationCommandHistory.command ih replayed completion kinds outside

/-- Ingress-free body replay supplies the continuation history used for control and lifetime accounting. -/
theorem ParallelScopeReplay.body_replay_history (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (replayed : internalTransitions? program initial records = some final)
    (body : ∀ transition ∈ records, bodyTransition transition) (owner : ScopeOccurrenceId) :
    ContinuationCommandHistory program owner initial final records := by
  induction records generalizing initial with
  | nil =>
    have same : initial = final := by simpa [internalTransitions?] using replayed
    subst final
    exact .initial initial
  | cons transition rest ih =>
    cases transition with
    | externalStimulus stimulus => simp [internalTransitions?] at replayed
    | internalOperation record =>
      simp only [internalTransitions?] at replayed
      obtain ⟨next, step, replayed⟩ := Option.bind_eq_some_iff.mp replayed
      have actual : replayInternalOperationOccurrence? program initial record = some next := by
        simpa [internalTransition?, selected] using step
      have tail := ih next replayed (fun transition member => body transition (by simp [member]))
      have ordinary := body (.internalOperation record) (List.mem_cons_self ..)
      have first : ContinuationCommandHistory program owner initial next [.internalOperation record] :=
        ContinuationCommandHistory.internalStep (.initial initial) actual (Or.inl ordinary) (by
          intro retirement
          simp [bodyTransition, retirement] at ordinary)
      simpa using append_history program owner initial next final _ rest first tail

private theorem filtered_count (ports : List ControlPlaceId) (unique : ports.Nodup)
    (place : ControlPlaceId) :
    (ports.filter (· == place)).length = if place ∈ ports then 1 else 0 := by
  induction ports with
  | nil => simp
  | cons first rest ih =>
    obtain ⟨absent, unique⟩ := List.nodup_cons.mp unique
    by_cases same : first = place
    · subst first
      have empty : rest.filter (· == place) = [] := List.filter_eq_nil_iff.mpr (by
        intro value member equal
        exact absent ((show value = place by simpa using equal) ▸ member))
      simp [empty]
    · simp [same, Ne.symm same, ih unique]

private theorem body_ports (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (operation : SemanticOperation) (member : operation ∈ program.operations)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd]) :
    (bodyConsumedPorts operation).Nodup ∧ (bodyProducedPorts operation).Nodup ∧
      bodyProducedPorts operation = operationOutputs operation := by
  have distinct := ParallelScopeStart.analyzeProgram_fork_join_ports_nodup program analysis admitted
  have allowed := ParallelScopeStart.analyzeProgram_operation_allowed program analysis admitted operation member
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons, List.not_mem_nil] at kind <;>
    try contradiction
  case awaitEffect id origin input output effect route =>
    cases route <;> simp [SequentialScopeProgram.operationAllowed] at allowed
    simp [bodyConsumedPorts, SequentialScopeControl.inputs, bodyProducedPorts, operationOutputs]
  all_goals simp only [bodyConsumedPorts, SequentialScopeControl.inputs, bodyProducedPorts,
    operationOutputs, Option.toList_none, List.append_nil]
  case duplicate => exact ⟨by simp, distinct.1 _ _ _ _ member, True.intro⟩
  case synchronize => exact ⟨distinct.2 _ _ _ _ member, by simp, True.intro⟩
  all_goals simp

private theorem port_census (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (operation : SemanticOperation) (member : operation ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (input : place.id ∈ bodyConsumedPorts operation) :
    program.operations.filterMap (fun op => if (bodyConsumedPorts op).contains place.id
      then some op.id else none) = [operation.id] := by
  have single := (ParallelScopeStart.analyzeProgram_place_incidence program analysis admitted place declared).2
  obtain ⟨id, census⟩ := List.length_eq_one_iff.mp single
  have present : operation.id ∈ program.operations.filterMap (fun op =>
      if (bodyConsumedPorts op).contains place.id then some op.id else none) := by
    exact List.mem_filterMap.mpr ⟨operation, member, by simp [input]⟩
  change program.operations.filterMap (fun op => if (bodyConsumedPorts op).contains place.id
    then some op.id else none) = [id] at census
  rw [census] at present
  have same : operation.id = id := List.mem_singleton.mp present
  simpa [same] using census

private theorem exact_port_charges (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner : ScopeOccurrenceId) (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (body : ∀ transition ∈ records, bodyTransition transition)
    (consumer : SemanticOperation) (member : consumer ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (input : place.id ∈ bodyConsumedPorts consumer) :
    ∃ producerId, producers program.operations place.id = [producerId] ∧
      (records.map (transitionPortCharge program bodyConsumedPorts owner place.id)).sum =
        declarationFiringCount records owner consumer.id ∧
      (records.map (transitionPortCharge program bodyProducedPorts owner place.id)).sum =
        declarationFiringCount records owner producerId := by
  have selected := parallelScopeStart_selected_of_admitted program analysis admitted
  have consumers := port_census program analysis admitted consumer member place declared input
  obtain ⟨producerId, producerCensus⟩ := List.length_eq_one_iff.mp
    (ParallelScopeStart.analyzeProgram_place_incidence program analysis admitted place declared).1
  have charges (record : InternalTransitionRecord) (present : .internalOperation record ∈ records) :
      transitionPortCharge program bodyConsumedPorts owner place.id (.internalOperation record) =
        declarationFiringCharge owner consumer.id (.internalOperation record) ∧
      transitionPortCharge program bodyProducedPorts owner place.id (.internalOperation record) =
        declarationFiringCharge owner producerId (.internalOperation record) := by
    obtain ⟨operation, lookup, key, kind, population⟩ := history.record_declaration_scope
      program owner selected initial final records record present
    have member := (List.mem_filter.mp population).1
    have bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
        .duplicate, .synchronize, .reachNoneEnd] := by
      simpa only [bodyTransition, ← kind] using body _ present
    obtain ⟨inputsUnique, outputsUnique, outputsEq⟩ := body_ports program analysis admitted operation member bodyKind
    have inputIff : place.id ∈ bodyConsumedPorts operation ↔ operation.id = consumer.id := by
      constructor
      · intro input
        have included : operation.id ∈ program.operations.filterMap (fun op =>
            if (bodyConsumedPorts op).contains place.id then some op.id else none) :=
          List.mem_filterMap.mpr ⟨operation, member, by simp [input]⟩
        rw [consumers] at included
        exact List.mem_singleton.mp included
      · intro same
        have equal := same_declaration program analysis admitted operation consumer member
          (by assumption) same
        simpa [equal] using input
    have outputIff : place.id ∈ bodyProducedPorts operation ↔ operation.id = producerId := by
      constructor
      · intro output
        have included := declared_output_producer program operation member place.id (outputsEq ▸ output)
        rw [producerCensus] at included
        exact List.mem_singleton.mp included
      · intro same
        have included : operation.id ∈ producers program.operations place.id := by simp [producerCensus, same]
        unfold producers at included
        obtain ⟨producer, producerMember, produces⟩ := List.mem_filterMap.mp included
        have chosen {guard : Bool} {id : OperationId}
            (eq : (if guard then some id else none) = some operation.id) :
            id = operation.id ∧ guard = true := by
          cases guard with
          | false => simp at eq
          | true => exact ⟨Option.some.inj eq, rfl⟩
        obtain ⟨equalKey, output⟩ := chosen produces
        have equal := same_declaration program analysis admitted producer operation producerMember member equalKey
        subst producer
        rw [outputsEq]
        cases operation <;> simp only [SemanticOperation.kind, List.mem_cons, List.not_mem_nil] at bodyKind <;> try contradiction
        all_goals exact List.contains_iff_mem.mp output
    by_cases owned : record.owner = owner
    · simp only [transitionPortCharge, lookup, ownedPortCount, owned, BEq.rfl,
        Bool.true_and, declarationFiringCharge]
      rw [filtered_count _ inputsUnique, filtered_count _ outputsUnique]
      simp [inputIff, outputIff, key, owned]
    · simp [transitionPortCharge, lookup, ownedPortCount, declarationFiringCharge, owned]
  refine ⟨producerId, producerCensus, ?_, ?_⟩
  all_goals
    unfold declarationFiringCount
    congr 1
    apply List.map_congr_left
    intro transition present
    cases transition with
    | externalStimulus stimulus => simp [transitionPortCharge, declarationFiringCharge]
    | internalOperation record => first | exact (charges record present).1 | exact (charges record present).2

def taskWaitCount (state : RuntimeState) (owner : ScopeOccurrenceId) : Nat :=
  (state.waits.filter (fun wait => wait.owner == owner)).length +
    (state.effectWaits.filter (fun wait => wait.owner == owner)).length

def taskArmCharge (owner : ScopeOccurrenceId) : CommittedTransition → Nat
  | .externalStimulus _ => 0
  | .internalOperation record => if record.owner == owner &&
      (record.operationKind == .awaitUserTask || record.operationKind == .awaitEffect) then 1 else 0

private theorem body_step_waits (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (body : bodyTransition (.internalOperation record))
    (replayed : replayInternalOperationOccurrence? program before record = some after)
    (owner : ScopeOccurrenceId) :
    after.scopeOccurrences = before.scopeOccurrences ∧
      taskWaitCount after owner = taskWaitCount before owner + taskArmCharge owner (.internalOperation record) := by
  obtain ⟨operation, resolved, kind, originEq, mergeEq, applied⟩ :=
    replayInternalOperationOccurrence_sound program before after record replayed
  clear originEq mergeEq
  have ordinary : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd] := by simpa only [bodyTransition, ← kind] using body
  have scopes := (applyInternalOperationOccurrence_body_retirement_frame program before after
    ⟨record.operationId, record.owner⟩ operation resolved ordinary applied).2.1
  refine ⟨scopes, ?_⟩
  cases control : before.control <;> simp only [applyInternalOperationOccurrence?, control] at applied <;> try contradiction
  rename_i instanceId
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons, List.not_mem_nil] at ordinary <;> try contradiction
  all_goals simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    split at applied <;> try contradiction
    have activated : after = activateUserTask before record.owner.processInstanceId record.owner input output task := by
      cases parallel : hasParallelScopeDefinition program record.owner <;>
        simp only [parallel, Bool.false_eq_true, ↓reduceIte, pure, Option.bind_some] at applied
      · exact (Option.some.inj applied).symm
      · obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
        exact (Option.some.inj applied).symm
    rw [activated]
    have inserted := length_filter_insertUserTaskWait (fun wait => wait.owner == owner)
      { processInstanceId := record.owner.processInstanceId, owner := record.owner, task, activation := activationCount before task.id + 1,
        output, metadata := task.metadata } before.waits
    simp only [taskWaitCount, activateUserTask, taskArmCharge, ← kind]
    cases owned : (record.owner == owner) <;> simp [owned, SemanticOperation.kind] at inserted ⊢ <;> omega
  case awaitEffect id origin input output effect route =>
    split at applied <;> try contradiction
    cases parallel : hasParallelScopeDefinition program record.owner <;>
      simp only [parallel, Bool.false_eq_true, ↓reduceIte] at applied
    all_goals
      obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      have inserted := length_filter_canonicalInsertBy effectWaitBefore (fun wait : EffectWait => wait.owner == owner)
        { processInstanceId := record.owner.processInstanceId, owner := record.owner, elementId := effect.elementId,
          activation := effectActivationCount before effect.elementId + 1, descriptor := effect.descriptor,
          arguments, outputMappings := effect.outputMappings, output, bpmnErrorRoute := route } before.effectWaits
      simp only [taskWaitCount, activateEffect, insertEffectWait, taskArmCharge, ← kind]
      cases owned : (record.owner == owner) <;> simp [owned, SemanticOperation.kind] at inserted ⊢ <;> omega
  case duplicate | synchronize | reachNoneEnd =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    simp [taskWaitCount, taskArmCharge, ← kind, SemanticOperation.kind,
      duplicateToken, synchronizeTokens, reachNoneEndToken]

theorem initialEntry_body_history_waits (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (replayed : internalTransitions? program initial records = some final)
    (body : ∀ transition ∈ records, bodyTransition transition) (owner : ScopeOccurrenceId) :
    final.scopeOccurrences = initial.scopeOccurrences ∧
      taskWaitCount final owner = taskWaitCount initial owner + (records.map (taskArmCharge owner)).sum := by
  induction records generalizing initial with
  | nil =>
    have same : initial = final := by simpa [internalTransitions?] using replayed
    subst final
    simp
  | cons transition rest ih =>
    cases transition with
    | externalStimulus stimulus => simp [internalTransitions?] at replayed
    | internalOperation record =>
      simp only [internalTransitions?] at replayed
      obtain ⟨next, step, replayed⟩ := Option.bind_eq_some_iff.mp replayed
      have first := body_step_waits program initial next record (body _ (by simp))
        (by simpa [internalTransition?, selected] using step) owner
      have tail := ih next replayed (fun transition member => body transition (by simp [member]))
      refine ⟨tail.1.trans first.1, ?_⟩
      simp only [List.map_cons, List.sum_cons]
      omega

private theorem quiet_marking (state : RuntimeState) (owner : ScopeOccurrenceId)
    (quiet : scopeQuiescent state owner = true) :
    taskWaitCount state owner = 0 ∧ ∀ port, continuationMarking state owner port = 0 := by
  have tokenAbsent : ∀ token ∈ state.tokens, token.owner ≠ owner := quiescent_scope_has_no_token state owner quiet
  have humanAbsent : ∀ wait ∈ state.waits, wait.owner ≠ owner := by
    intro wait member same
    have present : state.waits.any (fun wait => wait.owner == owner) = true :=
      List.any_eq_true.mpr ⟨wait, member, by simp [same]⟩
    simp [scopeQuiescent, present] at quiet
  have effectAbsent : ∀ wait ∈ state.effectWaits, wait.owner ≠ owner := by
    intro wait member same
    have present : state.effectWaits.any (fun wait => wait.owner == owner) = true :=
      List.any_eq_true.mpr ⟨wait, member, by simp [same]⟩
    simp [scopeQuiescent, present] at quiet
  have empty {α : Type} (values : List α) (key : α → ScopeOccurrenceId)
      (absent : ∀ value ∈ values, key value ≠ owner) (predicate : α → Bool)
      (requires : ∀ value, predicate value = true → key value = owner) : values.filter predicate = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro value member selected
    exact absent value member (requires value selected)
  refine ⟨?_, ?_⟩
  · simp only [taskWaitCount, empty state.waits (·.owner) humanAbsent _ (by intro value selected; exact eq_of_beq selected),
      empty state.effectWaits (·.owner) effectAbsent _ (by intro value selected; exact eq_of_beq selected), List.length_nil, Nat.zero_add]
  · intro port
    simp only [continuationMarking,
      empty state.tokens (·.owner) tokenAbsent (fun token => token.owner == owner && token.placeId == port) (by intro value selected; exact eq_of_beq (Bool.and_eq_true_iff.mp selected).1),
      empty state.waits (·.owner) humanAbsent (fun wait => wait.owner == owner && wait.output == port) (by intro value selected; exact eq_of_beq (Bool.and_eq_true_iff.mp selected).1),
      empty state.effectWaits (·.owner) effectAbsent (fun wait => wait.owner == owner && wait.output == port) (by intro value selected; exact eq_of_beq (Bool.and_eq_true_iff.mp selected).1),
      List.length_nil, Nat.zero_add]

private theorem predecessor_rank (ordered : List String) (unique : ordered.Nodup)
    (producer consumer : String) (earlier middle suffix : List String)
    (shape : ordered = earlier ++ producer :: middle ++ consumer :: suffix) :
    ordered.idxOf producer < ordered.idxOf consumer := by
  rw [shape] at unique ⊢
  simp only [List.append_assoc, List.cons_append] at unique ⊢
  obtain ⟨_, tailUnique, disjoint⟩ := List.nodup_append.mp unique
  have producerAbsent : producer ∉ earlier := fun member => disjoint _ member _ (by simp) rfl
  have consumerAbsent : consumer ∉ earlier := fun member => disjoint _ member _ (by simp) rfl
  obtain ⟨absent, restUnique⟩ := List.nodup_cons.mp tailUnique
  have different : producer ≠ consumer := fun same => absent (by simp [same])
  obtain ⟨_, _, middleDisjoint⟩ := List.nodup_append.mp restUnique
  have middleAbsent : consumer ∉ middle := fun member => middleDisjoint _ member _ (by simp) rfl
  simp only [List.idxOf_append, producerAbsent, consumerAbsent, ite_false, List.idxOf_cons_self,
    Nat.zero_add, List.idxOf_cons, cond_eq_ite, beq_iff_eq, different, ite_false, middleAbsent]
  omega

private theorem entered_live_credit (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (before issued : RuntimeState)
    (parents : ParallelScopeParentHistory program entry parent before)
    (entered : enterParallelScope? entry before parent = some issued)
    (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ issued.scopeOccurrences)
    (child : occurrence.id.definitionScopeId = entry.childScopeId) :
    continuationMarking issued occurrence.id entry.childEntry = 1 ∧
      ∀ port, port ≠ entry.childEntry → continuationMarking issued occurrence.id port = 0 := by
  obtain ⟨tokens, humans, effects⟩ := parents.live_owners program entry parent before
  obtain ⟨bound, empty⟩ := enterParallelScope_initial_credit entry parent occurrence.id before issued child
    tokens humans effects entered
  refine ⟨?_, empty⟩
  have clean := (parents.clean_and_foreign_marking program entry parent before).1
  have different : occurrence.id ≠ parent := by
    intro same
    exact clean.2.1 (child.symm.trans (congrArg ScopeOccurrenceId.definitionScopeId same))
  have raw := entered
  unfold enterParallelScope? at raw
  iterate 4 (split at raw <;> try contradiction)
  split at raw
  · cases Option.some.inj raw
    have old : occurrence ∈ before.scopeOccurrences := member
    rw [clean.1] at old
    have same : occurrence = ⟨parent, none⟩ := List.mem_singleton.mp old
    exact False.elim (different (congrArg RuntimeScopeOccurrence.id same))
  · obtain ⟨⟨generated, iterations⟩, issuing, installed⟩ := Option.bind_eq_some_iff.mp raw
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
      cases Option.some.inj installed
      have population := (issueParallelBodies_scope_population issuing).mem_iff.mp member
      rcases List.mem_append.mp population with added | old
      · obtain ⟨iteration, present, same⟩ := List.mem_map.mp added
        have identity : iteration.scope = occurrence.id := congrArg RuntimeScopeOccurrence.id same
        have balance := issueParallelBodies_continuation_balance entry parent _ _ _ generated
          (first :: rest) issuing occurrence.id entry.childEntry
        have charges : ∀ values : List ParallelScopeIteration,
            (values.map (fun iteration => ownedPortCount [entry.childEntry] iteration.scope occurrence.id entry.childEntry)).sum =
              (values.map (·.scope)).count occurrence.id := by
          intro values
          induction values with
          | nil => rfl
          | cons head tail ih =>
            simp only [List.map_cons, List.sum_cons, List.count_cons, ih]
            by_cases same : head.scope = occurrence.id
            · simp [ownedPortCount, same, Nat.add_comm]
            · simp [ownedPortCount, same, Ne.symm same]
        have positive : 0 < ((first :: rest).map (·.scope)).count occurrence.id :=
          List.count_pos_iff.mpr (List.mem_map.mpr ⟨iteration, present, identity⟩)
        rw [charges] at balance
        change continuationMarking generated occurrence.id entry.childEntry ≤ 1 at bound
        change continuationMarking generated occurrence.id entry.childEntry = 1
        omega
      · change occurrence ∈ before.scopeOccurrences at old
        rw [clean.1] at old
        have same : occurrence = ⟨parent, none⟩ := List.mem_singleton.mp old
        exact False.elim (different (congrArg RuntimeScopeOccurrence.id same))

private theorem admitted_task (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (child body : List SemanticOperation) (completion : SemanticOperation)
    (childEq : child = program.operations.filter (fun operation => program.operationScopes.any
      (fun binding => binding.operationId == operation.id && binding.scopeId == analysis.entry.childScopeId)))
    (completionEq : child.filter (fun operation => match operation with
      | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion])
    (bodyEq : body = child.filter (·.id != completion.id)) :
    ∃ operation ∈ body, operation.kind = .awaitUserTask := by
  have human : child.any (fun operation => match operation with | .awaitUserTask .. => true | _ => false) = true := by
    obtain ⟨_, _, _, _, _, _, _, entryCensus, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
    have raw := admitted
    unfold ParallelScopeStart.analyzeProgram at raw
    split at raw <;> try contradiction
    split at raw <;> try contradiction
    rename_i entries entry entryEq
    have sameEntry : entry = analysis.entry := by
      have present : entry ∈ program.operations.filterMap parallelScopeEntry? := by rw [entryEq]; simp
      rw [entryCensus] at present
      exact List.mem_singleton.mp present
    split at raw <;> try contradiction
    split at raw <;> try contradiction
    split at raw <;> try contradiction
    split at raw <;> try contradiction
    try dsimp only at raw
    split at raw <;> try contradiction
    split at raw <;> try contradiction
    split at raw <;> try contradiction
    rename_i pairedGuard
    simp only [Bool.or_eq_true, bne_iff_ne, not_or] at pairedGuard
    rw [sameEntry] at pairedGuard
    have taskGuard := pairedGuard.1.2
    rw [← childEq] at taskGuard
    have checked := congrArg Bool.not (Bool.eq_false_iff.mpr taskGuard)
    simp only [Bool.not_not, Bool.not_false] at checked
    refine Eq.trans ?_ checked
    apply congrArg (fun predicate : SemanticOperation → Bool => child.any predicate)
    funext operation
    cases operation <;> rfl
  obtain ⟨operation, member, kind⟩ := List.any_eq_true.mp human
  have taskKind : operation.kind = .awaitUserTask := by
    cases operation <;> simp only at kind <;> (first | contradiction | rfl)
  have completionMember : completion ∈ child :=
    (List.mem_filter.mp (completionEq.symm ▸ List.mem_singleton_self completion)).1
  have completionKind : completion.kind = .completeParallelMultiInstanceScope := by
    have selected := (List.mem_filter.mp (completionEq.symm ▸ List.mem_singleton_self completion)).2
    cases completion <;> simp only at selected <;> (first | contradiction | rfl)
  have different : operation.id ≠ completion.id := by
    intro same
    have equal := same_declaration program analysis (by assumption) operation completion
      ((List.mem_filter.mp (childEq ▸ member)).1) ((List.mem_filter.mp (childEq ▸ completionMember)).1) same
    rw [equal, completionKind] at taskKind
    contradiction
  exact ⟨operation, by rw [bodyEq]; simp [member, different], taskKind⟩

/-- Actual ingress-free body replay cannot drain an issued child. The lower bound
uses admitted predecessor chains, including Fork branches that end before siblings wait. -/
theorem initial_entry_body_replay_nonquiescent (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (parent : ScopeOccurrenceId) (before issued current : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ issued.scopeOccurrences)
    (childScope : occurrence.id.definitionScopeId = analysis.entry.childScopeId)
    (records : List CommittedTransition)
    (replayed : internalTransitions? program issued records = some current)
    (body : ∀ transition ∈ records, bodyTransition transition) :
    scopeQuiescent current occurrence.id = false := by
  apply Bool.eq_false_iff.mpr
  intro quiet
  have selected := parallelScopeStart_selected_of_admitted program analysis admitted
  have history := body_replay_history program selected issued current records replayed body occurrence.id
  obtain ⟨seed, empty⟩ := entered_live_credit program analysis.entry parent before issued parents entered occurrence member childScope
  obtain ⟨waitsZero, markingZero⟩ := quiet_marking current occurrence.id quiet
  obtain ⟨child, completion, bodyOperations, first, converted, ordered, childEq, completionEq,
    bodyEq, convertedEq, orderEq, predecessors⟩ :=
    ParallelScopeStart.analyzeProgram_chosen_input_predecessor program analysis admitted
  have population : ∀ operation ∈ bodyOperations, operation ∈ program.operations := by
    intro operation member
    rw [bodyEq] at member
    rw [childEq] at member
    exact (List.mem_filter.mp (List.mem_filter.mp member).1).1
  have unique := (StructuredParallelBody.structureOrder_certificate _ _ orderEq).2.1
  have positive : ∀ rank, ∀ consumer ∈ bodyOperations,
      (ordered.map (·.id)).idxOf consumer.id.value = rank →
      0 < declarationFiringCount records occurrence.id consumer.id := by
    intro rank
    induction rank using Nat.strongRecOn with
    | ind rank ih =>
      intro consumer consumerMember rankEq
      obtain ⟨port, input, predecessor⟩ := predecessors consumer consumerMember
      obtain ⟨vertex, _, vertexEq⟩ := ParallelScopeStart.mapped_member _ _ _ convertedEq consumer consumerMember
      obtain ⟨place, declared, portEq⟩ := admitted_body_input_declared program analysis admitted bodyOperations consumer
        (population consumer consumerMember) vertex vertexEq port input
      obtain ⟨producerId, producerCensus, consumed, produced⟩ := exact_port_charges program analysis admitted occurrence.id
        issued current records history body consumer (population consumer consumerMember) place declared (by simpa only [SequentialScopeControl.inputs, bodyConsumedPorts, portEq] using input)
      have balance := internalTransitions_body_balance program selected issued current records replayed body occurrence.id place.id
      rw [markingZero, consumed, produced, Nat.zero_add] at balance
      rcases predecessor with same | ⟨producer, producerMember, output, earlier, middle, suffix, shape⟩
      · rw [portEq, same, seed] at balance
        omega
      · have precedes := predecessor_rank (ordered.map (·.id)) unique producer.id.value consumer.id.value
          earlier middle suffix shape
        have prior := ih ((ordered.map (·.id)).idxOf producer.id.value) (by omega) producer producerMember rfl
        have produces := declared_output_producer program producer (population producer producerMember) place.id (by simpa only [portEq] using output)
        rw [producerCensus] at produces
        have producerIdentity := List.mem_singleton.mp produces
        have nonentry : producer.kind ≠ .enterParallelMultiInstanceScope := by
          obtain ⟨producerVertex, _, producerEq⟩ := ParallelScopeStart.mapped_member _ _ _ convertedEq producer producerMember
          cases producer <;> simp only [SemanticOperation.kind, ne_eq, reduceCtorEq, not_false_eq_true]
          simp only [SequentialScopeControl.bodyVertex?] at producerEq
          contradiction
        have notEntry := nonentry_output_not_entry program analysis admitted producer (population producer producerMember)
          nonentry place declared (by simpa only [portEq] using output)
        rw [empty place.id notEntry, ← producerIdentity] at balance
        omega
  obtain ⟨task, taskMember, taskKind⟩ := admitted_task program analysis admitted child bodyOperations completion childEq completionEq bodyEq
  have taskFired := positive _ task taskMember rfl
  have waitBalance := (initialEntry_body_history_waits program selected issued current records replayed body occurrence.id).2
  have armsZero : (records.map (taskArmCharge occurrence.id)).sum = 0 := by omega
  have chargesZero : ∀ transition ∈ records, declarationFiringCharge occurrence.id task.id transition = 0 := by
    intro transition member
    cases transition with
    | externalStimulus stimulus => rfl
    | internalOperation record =>
      have zero : taskArmCharge occurrence.id (.internalOperation record) = 0 :=
        List.sum_eq_zero_iff_forall_eq_nat.mp armsZero _ (List.mem_map.mpr ⟨_, member, rfl⟩)
      by_cases same : record.owner = occurrence.id ∧ record.operationId = task.id
      · obtain ⟨operation, _, key, kind, declared⟩ := history.record_declaration_scope
          program occurrence.id selected issued current records record member
        have equal := same_declaration program analysis admitted operation task (List.mem_filter.mp declared).1
          (population task taskMember) (key.trans same.2)
        have recordKind : record.operationKind = .awaitUserTask := kind.symm.trans (equal ▸ taskKind)
        simp [taskArmCharge, same.1, recordKind] at zero
      · simp [declarationFiringCharge, same]
  have countZero : declarationFiringCount records occurrence.id task.id = 0 := by
    unfold declarationFiringCount
    exact List.sum_eq_zero_iff_forall_eq_nat.mpr (by intro charge member; obtain ⟨transition, present, rfl⟩ := List.mem_map.mp member; exact chargesZero transition present)
  omega

/-- An issued child's refusal is derived from entry and ingress-free actual replay,
without assuming stable discovery or successful retirement preparation. -/
theorem initial_entry_retirement_refused (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (parent : ScopeOccurrenceId) (before issued current : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ issued.scopeOccurrences)
    (childScope : occurrence.id.definitionScopeId = analysis.entry.childScopeId)
    (records : List CommittedTransition) (replayed : internalTransitions? program issued records = some current)
    (body : ∀ transition ∈ records, bodyTransition transition) :
    completeParallelScope? analysis.entry current occurrence.id = none :=
  completeParallelScope_refuses_nonquiescent analysis.entry current occurrence.id
    (initial_entry_body_replay_nonquiescent program analysis admitted parent before issued current
      parents entered occurrence member childScope records replayed body)

private theorem entered_parents (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before issued : RuntimeState) (clean : ParallelScopeCleanEntry entry parent before)
    (entered : enterParallelScope? entry before parent = some issued) :
    ∀ occurrence ∈ issued.scopeOccurrences,
      occurrence = ⟨parent, none⟩ ∨ occurrence.parent = some parent := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    intro occurrence member
    exact Or.inl (by simpa [clean.1] using member)
  · obtain ⟨⟨generated, iterations⟩, issuing, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
      cases Option.some.inj installed
      intro occurrence member
      have included := (issueParallelBodies_scope_population issuing).mem_iff.mp member
      rcases List.mem_append.mp included with added | old
      · obtain ⟨iteration, _, rfl⟩ := List.mem_map.mp added
        exact Or.inr rfl
      · exact Or.inl (by simpa [clean.1] using old)

theorem initialEntry_root_completion_refused (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (parent : ScopeOccurrenceId) (before issued current after : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (child : RuntimeScopeOccurrence) (member : child ∈ issued.scopeOccurrences)
    (childScope : child.id.definitionScopeId = analysis.entry.childScopeId)
    (scopes : current.scopeOccurrences = issued.scopeOccurrences)
    (record : InternalTransitionRecord) (kind : record.operationKind = .completeScope)
    (replayed : replayInternalOperationOccurrence? program current record = some after) : False := by
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have ownership := entered_parents analysis.entry parent before issued clean entered
  have childParent : child.parent = some parent := by
    rcases ownership child member with same | owned
    · rw [same] at childScope
      exact False.elim (clean.2.1 childScope.symm)
    · exact owned
  obtain ⟨scopeId, output, root, declared, unique, owner, completed⟩ :=
    replayed_scope_completion_execution program current after record kind replayed (ParallelScopeStart.analyzed_not_nested program analysis admitted)
        (ParallelScopeStart.analyzed_not_embedded_completion program analysis admitted)
  obtain ⟨terminalRoot, _, rootOwned, rootParent, rootMember, _, _⟩ :=
    replayed_final_root_completion program analysis admitted current after record kind replayed
  have rootIdentity : terminalRoot.id = parent := by
    rcases ownership terminalRoot (scopes ▸ rootMember) with same | owned
    · exact congrArg RuntimeScopeOccurrence.id same
    · rw [rootParent] at owned
      contradiction
  have sameRoot : root = terminalRoot := by
    have included : terminalRoot ∈ current.scopeOccurrences.filter (·.id.definitionScopeId == scopeId) := by
      have rootScope : root.id.definitionScopeId = scopeId := by
        have included : root ∈ current.scopeOccurrences.filter (·.id.definitionScopeId == scopeId) := by rw [unique]; simp
        exact eq_of_beq (List.mem_filter.mp included).2
      exact List.mem_filter.mpr ⟨rootMember, by simp [rootOwned, ← owner, rootScope]⟩
    rw [unique] at included
    exact (List.mem_singleton.mp included).symm
  obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
  rw [completeSelectedScope?, unmonitored,
    completeBoundedScope_eq_completeScope_of_unbounded program current scopeId output unbounded] at completed
  have quiet := (completeScopeState_selected_update current after scopeId output root
    (by simpa only [Bool.beq_eq_decide_eq] using unique) completed).1
  exact quiescent_scope_has_no_child current root.id quiet child (scopes.symm ▸ member)
    (by simpa [sameRoot, rootIdentity] using childParent)

end BpmnSemantics.SemanticProcess
