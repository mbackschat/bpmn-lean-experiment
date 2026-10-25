module

public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeParentProgress
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws

/-! # Actual parallel-body lifetime firing accounting

PMIS-ENTER-01 supplies the body credit boundary. Actual lifetime port accounting
and admitted dependency order bound each declaration's exact-owner firing count;
these laws do not require the independent frontier-locality proof closure.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace ParallelScopeReplay

private theorem predecessor_rank (ordered : List String) (unique : ordered.Nodup)
    (producer consumer : String) (earlier middle suffix : List String)
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

theorem nonentry_output_not_entry (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (producer : SemanticOperation) (member : producer ∈ program.operations)
    (nonentry : producer.kind ≠ .enterParallelMultiInstanceScope)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (output : place.id ∈ operationOutputs producer) : place.id ≠ analysis.entry.childEntry := by
  intro samePort
  obtain ⟨entry, entryMember, entryId, entryKind, entryOutput⟩ := admitted_entry_declaration program analysis admitted
  have incidence := (ParallelScopeStart.analyzeProgram_place_incidence program analysis admitted place declared).1
  have entryProduces := declared_output_producer program entry entryMember place.id (by simpa only [samePort] using entryOutput)
  have bodyProduces := declared_output_producer program producer member place.id output
  obtain ⟨single, singleton⟩ := List.length_eq_one_iff.mp incidence
  rw [singleton] at entryProduces bodyProduces
  have sameId := (List.mem_singleton.mp bodyProduces).trans (List.mem_singleton.mp entryProduces).symm
  have same := same_declaration program analysis admitted producer entry member entryMember sameId
  exact nonentry (same ▸ entryKind)

private theorem body_output_not_entry (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (body : List SemanticOperation) (producer : SemanticOperation) (member : producer ∈ program.operations)
    (vertex : StructuredParallelBody.Vertex)
    (converted : SequentialScopeControl.bodyVertex? body producer = some vertex)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (output : place.id ∈ operationOutputs producer) : place.id ≠ analysis.entry.childEntry := by
  apply nonentry_output_not_entry program analysis admitted producer member _ place declared output
  cases producer <;> simp_all [SemanticOperation.kind, SequentialScopeControl.bodyVertex?]

/-- Actual admitted lifetime histories fire each body declaration at most once
when issuance supplies at most one entry credit and no other initial credit. -/
theorem ContinuationCommandHistory.body_firing_le_one
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (seed : continuationMarking initial owner analysis.entry.childEntry ≤ 1)
    (empty : ∀ port, port ≠ analysis.entry.childEntry → continuationMarking initial owner port = 0) :
    ∃ child completion body,
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun binding => binding.operationId == operation.id && binding.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      body = child.filter (·.id != completion.id) ∧
      ∀ consumer ∈ body, declarationFiringCount records owner consumer.id ≤ 1 := by
  obtain ⟨child, completion, body, first, converted, ordered, childEq, completionEq, bodyEq,
    convertedEq, orderEq, budgets⟩ := history.admitted_predecessor_budget program analysis admitted owner selected initial final records
  have unique := (StructuredParallelBody.structureOrder_certificate _ _ orderEq).2.1
  have entryZero := history.entry_firing_count_zero program analysis admitted owner selected initial final records
  have population : ∀ operation ∈ body, operation ∈ program.operations := by
    intro operation member
    rw [bodyEq] at member
    have childMember := (List.mem_filter.mp member).1
    rw [childEq] at childMember
    exact (List.mem_filter.mp childMember).1
  have bounded : ∀ rank, ∀ consumer ∈ body,
      (ordered.map (·.id)).idxOf consumer.id.value = rank → declarationFiringCount records owner consumer.id ≤ 1 := by
    intro rank
    induction rank using Nat.strongRecOn with
    | ind rank ih =>
      intro consumer member rankEq
      rcases budgets consumer member with entryBound | ⟨producer, producerMember, port, input, output, budget, earlier, middle, suffix, shape⟩
      · omega
      · have precedes := predecessor_rank (ordered.map (·.id)) unique producer.id.value consumer.id.value earlier middle suffix shape
        have producerBound := ih ((ordered.map (·.id)).idxOf producer.id.value) (by omega) producer producerMember rfl
        obtain ⟨vertex, _, vertexEq⟩ := ParallelScopeStart.mapped_member _ _ _ convertedEq producer producerMember
        obtain ⟨consumerVertex, _, consumerEq⟩ := ParallelScopeStart.mapped_member _ _ _ convertedEq consumer member
        obtain ⟨place, declared, placeId⟩ := admitted_body_input_declared program analysis admitted body consumer
          (population consumer member) consumerVertex consumerEq port input
        have different := body_output_not_entry program analysis admitted body producer
          (population producer producerMember) vertex vertexEq place declared (by simpa only [placeId] using output)
        have noCredit := empty port (by simpa only [placeId] using different)
        omega
  exact ⟨child, completion, body, childEq, completionEq, bodyEq, fun consumer member => bounded _ consumer member rfl⟩

/-- Actual issuance establishes the credit premise of the body firing bound;
pre-issuance freshness remains an explicit reachable-state obligation. -/
theorem ContinuationCommandHistory.body_firing_le_one_from_issuance
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (parent : ScopeOccurrenceId) (items : List String) (index : Nat)
    (before initial final : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? analysis.entry parent items index before = some (initial, iterations))
    (fresh : ∀ port, continuationMarking before owner port = 0)
    (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    ∃ child completion body,
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun binding => binding.operationId == operation.id && binding.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      body = child.filter (·.id != completion.id) ∧
      ∀ consumer ∈ body, declarationFiringCount records owner consumer.id ≤ 1 := by
  apply history.body_firing_le_one program analysis admitted owner selected initial final records
  · have bounded := issueParallelBodies_continuation_credit_le_one analysis.entry parent items index
      before initial iterations issued owner analysis.entry.childEntry
    simpa only [fresh, Nat.zero_add] using bounded
  · intro port different
    rw [issueParallelBodies_continuation_balance analysis.entry parent items index before initial iterations issued owner port,
      fresh]
    simp only [ownedPortCount, List.filter_cons, Bool.and_eq_true, beq_iff_eq, Ne.symm different,
      and_false, ite_false, List.filter_nil, List.length_nil, Nat.zero_add]
    clear issued
    induction iterations with
    | nil => rfl
    | cons head tail ih => simpa only [List.map_cons, List.sum_cons, Nat.zero_add] using ih


private theorem marking_zero_of_foreign_work (state : RuntimeState) (owner : ScopeOccurrenceId)
    (tokens : ∀ token ∈ state.tokens, token.owner ≠ owner)
    (humans : ∀ wait ∈ state.waits, wait.owner ≠ owner)
    (effects : ∀ wait ∈ state.effectWaits, wait.owner ≠ owner) :
    ∀ port, continuationMarking state owner port = 0 := by
  intro port
  have tokenEmpty : state.tokens.filter (fun token => token.owner == owner && token.placeId == port) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro token member matching
    exact tokens token member (by simpa using (Bool.and_eq_true_iff.mp matching).1)
  have humanEmpty : state.waits.filter (fun wait => wait.owner == owner && wait.output == port) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro wait member matching
    exact humans wait member (by simpa using (Bool.and_eq_true_iff.mp matching).1)
  have effectEmpty : state.effectWaits.filter (fun wait => wait.owner == owner && wait.output == port) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro wait member matching
    exact effects wait member (by simpa using (Bool.and_eq_true_iff.mp matching).1)
  simp only [continuationMarking, tokenEmpty, humanEmpty, effectEmpty, List.length_nil, Nat.zero_add]

/-- Actual entry's absent-child guard supplies issuance freshness when every token
and Human/Service continuation still has a live scope owner. -/
theorem enterParallelScope_initial_credit (entry : ParallelScopeEntry) (parent owner : ScopeOccurrenceId)
    (before after : RuntimeState) (child : owner.definitionScopeId = entry.childScopeId)
    (tokensLive : ∀ token ∈ before.tokens, ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = token.owner)
    (humansLive : ∀ wait ∈ before.waits, ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = wait.owner)
    (effectsLive : ∀ wait ∈ before.effectWaits, ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = wait.owner)
    (entered : enterParallelScope? entry before parent = some after) :
    continuationMarking after owner entry.childEntry ≤ 1 ∧
      ∀ port, port ≠ entry.childEntry → continuationMarking after owner port = 0 := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  rename_i admitted
  have absent : ∀ occurrence ∈ before.scopeOccurrences, occurrence.id ≠ owner := by
    intro occurrence member same
    have presentChild : before.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = true := by
      apply List.any_eq_true.mpr
      exact ⟨occurrence, member, by simp [same, child]⟩
    simp [presentChild] at admitted
  have foreignTokens : ∀ token ∈ before.tokens, token.owner ≠ owner := by
    intro token member same
    obtain ⟨occurrence, present, owns⟩ := tokensLive token member
    exact absent occurrence present (owns.trans same)
  have foreignHumans : ∀ wait ∈ before.waits, wait.owner ≠ owner := by
    intro wait member same
    obtain ⟨occurrence, present, owns⟩ := humansLive wait member
    exact absent occurrence present (owns.trans same)
  have foreignEffects : ∀ wait ∈ before.effectWaits, wait.owner ≠ owner := by
    intro wait member same
    obtain ⟨occurrence, present, owns⟩ := effectsLive wait member
    exact absent occurrence present (owns.trans same)
  have consumedFresh : ∀ port, continuationMarking { before with tokens := removeToken before.tokens entry.input parent } owner port = 0 := by
    apply marking_zero_of_foreign_work
    · intro token member
      exact foreignTokens token (removeToken_sublist before.tokens entry.input parent |>.subset member)
    · exact foreignHumans
    · exact foreignEffects
  have parentDifferent : parent ≠ owner := by
    intro same
    have empty : before.scopeOccurrences.filter (fun occurrence => occurrence.id == parent) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro occurrence member selected
      exact absent occurrence member (by simpa [same] using selected)
    simp [empty] at admitted
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  rename_i items valueEq bounded
  cases items with
  | nil =>
    cases Option.some.inj entered
    have added := addToken_filter_length (removeToken before.tokens entry.input parent)
      entry.normalOutput parent (fun token => token.owner == owner && token.placeId == entry.childEntry)
    constructor
    · simp only [continuationMarking] at consumedFresh ⊢
      simp [parentDifferent] at added
      have old := consumedFresh entry.childEntry
      omega
    · intro port different
      have added := addToken_filter_length (removeToken before.tokens entry.input parent)
        entry.normalOutput parent (fun token => token.owner == owner && token.placeId == port)
      simp [parentDifferent] at added
      simp only [continuationMarking] at consumedFresh ⊢
      have old := consumedFresh port
      omega
  | cons item rest =>
    obtain ⟨⟨issued, iterations⟩, issuedEq, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at entered
    | cons first iterations =>
      cases Option.some.inj entered
      constructor
      · have bounded := issueParallelBodies_continuation_credit_le_one entry parent (item :: rest) 0
          _ issued (first :: iterations) issuedEq owner entry.childEntry
        rw [consumedFresh, Nat.zero_add] at bounded
        simpa only [continuationMarking] using bounded
      · intro port different
        have balance := issueParallelBodies_continuation_balance entry parent (item :: rest) 0
          _ issued (first :: iterations) issuedEq owner port
        rw [consumedFresh] at balance
        have charges : ∀ values : List ParallelScopeIteration,
            (values.map (fun iteration => ownedPortCount [entry.childEntry] iteration.scope owner port)).sum = 0 := by
          intro values
          induction values with
          | nil => rfl
          | cons head tail ih =>
            simpa [ownedPortCount, Ne.symm different] using ih
        rw [charges, Nat.zero_add] at balance
        simpa only [continuationMarking] using balance

/-- Actual entry and live-owner facts establish the credit boundary of the admitted
lifetime firing theorem without assuming an initially empty marking. -/
theorem ContinuationCommandHistory.body_firing_le_one_from_entry
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before initial final : RuntimeState) (child : owner.definitionScopeId = analysis.entry.childScopeId)
    (tokensLive : ∀ token ∈ before.tokens, ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = token.owner)
    (humansLive : ∀ wait ∈ before.waits, ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = wait.owner)
    (effectsLive : ∀ wait ∈ before.effectWaits, ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = wait.owner)
    (entered : enterParallelScope? analysis.entry before parent = some initial)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial final records) :
    ∃ child completion body,
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun binding => binding.operationId == operation.id && binding.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      body = child.filter (·.id != completion.id) ∧
      ∀ consumer ∈ body, declarationFiringCount records owner consumer.id ≤ 1 := by
  obtain ⟨seed, empty⟩ := enterParallelScope_initial_credit analysis.entry parent owner before initial child
    tokensLive humansLive effectsLive entered
  exact history.body_firing_le_one program analysis admitted owner selected initial final records seed empty

/-- Actual parent execution and entry establish the lifetime firing boundary without additional freshness or live-owner premises. -/
theorem ContinuationCommandHistory.body_firing_le_one_from_parent_history
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before initial final : RuntimeState) (child : owner.definitionScopeId = analysis.entry.childScopeId)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some initial)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial final records) :
    ∃ child completion body,
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun binding => binding.operationId == operation.id && binding.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      body = child.filter (·.id != completion.id) ∧
      ∀ consumer ∈ body, declarationFiringCount records owner consumer.id ≤ 1 := by
  obtain ⟨tokens, humans, effects⟩ := parents.live_owners program analysis.entry parent before
  exact history.body_firing_le_one_from_entry program analysis admitted owner parent selected before initial final
    child tokens humans effects entered records


end ParallelScopeReplay

namespace ParallelScopeReplay

private theorem declaration_sum_le_length (records : List CommittedTransition)
    (owner : ScopeOccurrenceId) (body : List SemanticOperation)
    (bounded : ∀ operation ∈ body, declarationFiringCount records owner operation.id ≤ 1) :
    (body.map (fun operation => declarationFiringCount records owner operation.id)).sum ≤ body.length := by
  induction body with
  | nil => simp
  | cons head tail ih =>
    have first := bounded head (by simp)
    have rest := ih (fun operation member => bounded operation (by simp [member]))
    simp only [List.map_cons, List.sum_cons, List.length_cons]
    omega

/-- Actual parent execution, entry and lifetime replay bound the aggregate body-declaration count for one exact child owner by the admitted body population. -/
theorem ContinuationCommandHistory.body_firing_sum_le_body_length_from_parent_history
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before initial final : RuntimeState) (child : owner.definitionScopeId = analysis.entry.childScopeId)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some initial)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial final records) :
    ∃ child completion body,
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun binding => binding.operationId == operation.id && binding.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      body = child.filter (·.id != completion.id) ∧
      (∀ consumer ∈ body, declarationFiringCount records owner consumer.id ≤ 1) ∧
      (body.map (fun operation => declarationFiringCount records owner operation.id)).sum ≤ body.length ∧
      analysis.childCount = body.length + 1 ∧
      (body.map (fun operation => declarationFiringCount records owner operation.id)).sum + 1 ≤ analysis.childCount := by
  obtain ⟨child, completion, body, childEq, completionEq, bodyEq, bounded⟩ :=
    history.body_firing_le_one_from_parent_history program analysis admitted owner parent selected before initial final
      child parents entered records
  have sumBound := declaration_sum_le_length records owner body bounded
  have counted := ParallelScopeStart.analyzeProgram_child_count program analysis admitted child completion body childEq completionEq bodyEq
  exact ⟨child, completion, body, childEq, completionEq, bodyEq, bounded, sumBound, counted, by omega⟩

/-- An executable body occurrence has not fired earlier in its actual lifetime: appending its real replay would otherwise violate the admitted single-firing bound. -/
theorem ContinuationCommandHistory.enabled_body_firing_count_zero
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before initial current after : RuntimeState) (childScope : owner.definitionScopeId = analysis.entry.childScopeId)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some initial)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial current records)
    (record : InternalTransitionRecord) (owned : record.owner = owner)
    (bodyKind : bodyTransition (.internalOperation record))
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program current record = some after) :
    declarationFiringCount records owner record.operationId = 0 := by
  have notRetirement : record.operationKind ≠ .completeParallelMultiInstanceScope := by
    simp only [bodyTransition, List.mem_cons, List.not_mem_nil, or_false] at bodyKind
    rcases bodyKind with h | h | h | h | h <;> simp [h]
  have extended := ContinuationCommandHistory.internalStep history replayed
    (Or.inl bodyKind) (fun same => False.elim (notRetirement same))
  obtain ⟨child, completion, body, childEq, completionEq, bodyEq, bounded⟩ :=
    extended.body_firing_le_one_from_parent_history program analysis admitted owner parent selected
      before initial after childScope parents entered _
  obtain ⟨operation, _, key, kind, population⟩ := replayed_declaration_scope program current after record replayed
  have member : operation ∈ child := by
    rw [childEq]
    simpa only [owned, childScope] using population
  -- Derived from `completionEq` rather than restated: a module gives a restated `match` its own private
  -- matcher (docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#module-matcher-defect).
  have present := completionEq ▸ List.mem_singleton_self completion
  have completionMember : completion ∈ child := (List.mem_filter.mp present).1
  have completionKind : completion.kind = .completeParallelMultiInstanceScope := by
    have selected := (List.mem_filter.mp present).2
    cases completion <;> simp_all [SemanticOperation.kind]
  have different : operation.id ≠ completion.id := by
    intro same
    have equal := same_declaration program analysis admitted operation completion
      ((List.mem_filter.mp (childEq ▸ member)).1)
      ((List.mem_filter.mp (childEq ▸ completionMember)).1) same
    exact notRetirement (kind.symm.trans (equal ▸ completionKind))
  have bodyMember : operation ∈ body := by rw [bodyEq]; simp [member, different]
  have bound := bounded operation bodyMember
  simp only [declarationFiringCount, List.map_append, List.sum_append, List.map_cons,
    List.map_nil, List.sum_cons, List.sum_nil, Nat.add_zero, declarationFiringCharge,
    owned, key, BEq.rfl, Bool.true_and, ↓reduceIte] at bound
  unfold declarationFiringCount
  omega

/-- An unfired non-entry producer cannot have a token or blocked wait on any of its outputs; admission gives every declared flow one producer, and entry supplies no credit there. -/
theorem ContinuationCommandHistory.unfired_output_empty
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before initial current : RuntimeState) (childScope : owner.definitionScopeId = analysis.entry.childScopeId)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some initial)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial current records)
    (producer : SemanticOperation) (member : producer ∈ program.operations)
    (nonentry : producer.kind ≠ .enterParallelMultiInstanceScope)
    (unfired : declarationFiringCount records owner producer.id = 0)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (output : place.id ∈ operationOutputs producer) : continuationMarking current owner place.id = 0 := by
  have incidence := (ParallelScopeStart.analyzeProgram_place_incidence program analysis admitted place declared).2
  obtain ⟨consumerId, consumers⟩ := List.length_eq_one_iff.mp incidence
  have present : consumerId ∈ program.operations.filterMap (fun operation =>
      if (SequentialScopeControl.inputs operation).contains place.id then some operation.id else none) := by
    rw [consumers]; simp
  obtain ⟨consumer, consumerMember, consumes⟩ := List.mem_filterMap.mp present
  have input : place.id ∈ bodyConsumedPorts consumer := by
    split at consumes <;> try contradiction
    rename_i contains
    exact List.contains_iff_mem.mp contains
  obtain ⟨producerId, unique, _, produced, _⟩ := history.port_firing_budget program analysis admitted owner selected
    initial current records consumer consumerMember place declared input
  have produces := declared_output_producer program producer member place.id output
  rw [unique] at produces
  have same : producer.id = producerId := List.mem_singleton.mp produces
  rw [← same, unfired] at produced
  obtain ⟨tokens, humans, effects⟩ := parents.live_owners program analysis.entry parent before
  have empty := (enterParallelScope_initial_credit analysis.entry parent owner before initial childScope
    tokens humans effects entered).2 place.id
      (nonentry_output_not_entry program analysis admitted producer member nonentry place declared output)
  have balance := history.continuation_budget program owner selected initial current records place.id
  omega

/-- Successful exact-owner body replay has empty output flows at its predecessor, including blocked Human/Service continuation credit. This is derived from lifetime history, not assumed by batch preparation. -/
theorem ContinuationCommandHistory.enabled_body_outputs_empty
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before initial current after : RuntimeState) (childScope : owner.definitionScopeId = analysis.entry.childScopeId)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some initial)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial current records)
    (record : InternalTransitionRecord) (owned : record.owner = owner)
    (bodyKind : bodyTransition (.internalOperation record))
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program current record = some after) :
    ∃ operation, program.operations.find? (·.id == record.operationId) = some operation ∧
      ∀ place ∈ program.controlPlaces, place.id ∈ operationOutputs operation →
        continuationMarking current owner place.id = 0 := by
  have zero := history.enabled_body_firing_count_zero program analysis admitted owner parent selected
    before initial current after childScope parents entered records record owned bodyKind replayed
  obtain ⟨operation, lookup, key, kind, population⟩ := replayed_declaration_scope program current after record replayed
  have nonentry : operation.kind ≠ .enterParallelMultiInstanceScope := by
    rw [kind]
    simp only [bodyTransition, List.mem_cons, List.not_mem_nil, or_false] at bodyKind
    rcases bodyKind with h | h | h | h | h <;> simp [h]
  refine ⟨operation, lookup, ?_⟩
  intro place declared output
  exact history.unfired_output_empty program analysis admitted owner parent selected before initial current childScope
    parents entered records operation (List.mem_filter.mp population).1 nonentry (key ▸ zero) place declared output

private theorem ordinary_body_input_declared (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (operation : SemanticOperation) (member : operation ∈ program.operations)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (port : ControlPlaceId) (input : port ∈ bodyConsumedPorts operation) :
    ∃ place ∈ program.controlPlaces, place.id = port := by
  have valid := List.all_eq_true.mp (programWellFormed_operations program
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1) operation member
  have declared : program.controlPlaces.any (fun place => place.id == port) = true := by
    cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
    all_goals simp only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton] at input
    all_goals simp only [operationWellFormed, Bool.and_eq_true] at valid
    all_goals first
      | (subst port; first | exact valid.2 | exact valid.1.2 | exact valid.1.1.2 | exact valid.1.1.1.2 | exact valid.1.1.1.1.2)
      | exact List.all_eq_true.mp valid.1.2 port input
  simpa only [beq_iff_eq] using List.any_eq_true.mp declared

/-- Simultaneously executable body operations at one owner cannot consume one another's outputs. The contradiction uses actual input readiness and derived output freshness, so it does not assume successful reservation. -/
theorem ContinuationCommandHistory.enabled_body_output_input_disjoint
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before initial current leftAfter rightAfter : RuntimeState) (childScope : owner.definitionScopeId = analysis.entry.childScopeId)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some initial)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial current records)
    (left right : InternalTransitionRecord) (leftOwned : left.owner = owner) (rightOwned : right.owner = owner)
    (leftBody : bodyTransition (.internalOperation left)) (rightBody : bodyTransition (.internalOperation right))
    (leftReplayed : InternalCommutation.replayInternalOperationOccurrence? program current left = some leftAfter)
    (rightReplayed : InternalCommutation.replayInternalOperationOccurrence? program current right = some rightAfter) :
    ∃ leftOperation rightOperation,
      program.operations.find? (·.id == left.operationId) = some leftOperation ∧
      program.operations.find? (·.id == right.operationId) = some rightOperation ∧
      ∀ port ∈ operationOutputs leftOperation, port ∉ bodyConsumedPorts rightOperation := by
  obtain ⟨leftOperation, leftLookup, empty⟩ := history.enabled_body_outputs_empty program analysis admitted owner parent selected
    before initial current leftAfter childScope parents entered records left leftOwned leftBody leftReplayed
  obtain ⟨rightOperation, rightLookup, rightKey, rightKind, population⟩ := replayed_declaration_scope program current rightAfter right rightReplayed
  obtain ⟨operation, resolved, kind, _, _, applied⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program current rightAfter right rightReplayed
  have resolvedDeclaration := InternalCommutation.resolveInternalOperationOccurrence_declaration program current
    ⟨right.operationId, right.owner⟩ operation resolved
  have same := same_declaration program analysis admitted operation rightOperation resolvedDeclaration.1
    (List.mem_filter.mp population).1 (resolvedDeclaration.2.trans rightKey.symm)
  subst operation
  have bodyKind : rightOperation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] := by
    simpa only [bodyTransition, ← rightKind] using rightBody
  have positive := (body_step_inputs_positive program current rightAfter ⟨right.operationId, right.owner⟩
    rightOperation resolved bodyKind applied).2
  refine ⟨leftOperation, rightOperation, leftLookup, rightLookup, ?_⟩
  intro port output input
  obtain ⟨place, declared, identity⟩ := ordinary_body_input_declared program analysis admitted
    rightOperation (List.mem_filter.mp population).1 bodyKind port input
  have zero := empty place declared (identity ▸ output)
  have nonzero := positive port input
  simp only [rightOwned] at nonzero
  rw [identity] at zero
  omega

end ParallelScopeReplay

end BpmnSemantics.SemanticProcess
