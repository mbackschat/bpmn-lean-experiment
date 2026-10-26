module

import BpmnSemantics.SemanticProcess.ParallelScopeBodyAccounting
import BpmnSemantics.SemanticProcess.ParallelScopeCollectionProvenance
public import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability
import BpmnSemantics.SemanticProcess.ParallelScopeParentAccounting
public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! # Actual lifetime record population

PMIS-SELECT-01 resolves every record at a live owner. Body, retirement and wait
execution only restrict the scope census, so lifetime records remain covered by
the initial owner population and original declarations, without uniqueness
premises on either counting population.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeReplay

open BpmnSemantics InternalCommutation

private theorem replayed_live_owner (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord)
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = record.owner := by
  obtain ⟨operation, resolved, _, _, _, _⟩ := replayInternalOperationOccurrence_sound program before after record replayed
  obtain ⟨candidates, discovered, member⟩ := resolveInternalOperationOccurrence_requires_exact_candidate
    program before ⟨record.operationId, record.owner⟩ operation resolved
  unfold internalOperationOccurrences? at discovered
  split at discovered <;> try contradiction
  split at discovered <;> try contradiction
  dsimp only at discovered
  split at discovered <;> try contradiction
  cases Option.some.inj discovered
  obtain ⟨owner, present, same⟩ := List.mem_map.mp member
  have ownerEq := congrArg InternalOperationOccurrence.owner same
  rw [mem_sortBy] at present
  obtain ⟨occurrence, live, identity⟩ := List.mem_map.mp (List.mem_filter.mp present).1
  exact ⟨occurrence, live, identity.trans ownerEq⟩

private theorem ordered_owner_population (program : Program) (before : RuntimeState)
    (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length)
    (aligned : ∀ pair ∈ records.zip ((before :: successors).zip successors), ∃ record,
      pair.1 = .internalOperation record ∧ replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ transition ∈ records, bodyOrRetirementTransition transition) :
    ∀ transition ∈ records, ∃ record occurrence,
      transition = .internalOperation record ∧ occurrence ∈ before.scopeOccurrences ∧ occurrence.id = record.owner := by
  induction records generalizing before successors with
  | nil => simp
  | cons head rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      obtain ⟨record, identity, replayed⟩ := aligned (head, before, next) (by simp)
      have shrink := replayed_scope_sublist program before next record (identity ▸ kinds head (by simp)) replayed
      intro transition member
      rcases List.mem_cons.mp member with same | later
      · subst transition
        obtain ⟨occurrence, live, owned⟩ := replayed_live_owner program before next record replayed
        exact ⟨record, occurrence, identity, live, owned⟩
      · obtain ⟨record, occurrence, identity, live, owned⟩ := ih next tail (by simpa using length)
          (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
          (fun record member => kinds record (by simp [member])) transition later
        exact ⟨record, occurrence, identity, shrink.subset live, owned⟩

/-- Every actual lifetime record is internal and its exact owner belongs to the initial scope census. -/
theorem ContinuationCommandHistory.record_owner_population (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    ∀ transition ∈ records, ∃ record occurrence,
      transition = .internalOperation record ∧ occurrence ∈ initial.scopeOccurrences ∧ occurrence.id = record.owner := by
  induction history with
  | initial => simp
  | @internalStep before after earlier record history replayed kind outside ih =>
    intro transition member
    rcases List.mem_append.mp member with earlierMember | added
    · exact ih transition earlierMember
    · have same : transition = .internalOperation record := by simpa using added
      obtain ⟨occurrence, live, owned⟩ := replayed_live_owner program before after record replayed
      exact ⟨record, occurrence, same, (history.scopeOccurrences_sublist program owner selected initial before earlier).subset live, owned⟩
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    intro transition member
    rcases List.mem_append.mp member with earlierMember | added
    · exact ih transition earlierMember
    · obtain ⟨actualStimulus, actualRest, admitted, successors, shape, _, stateEq, length, _, aligned⟩ :=
        committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
      cases shape
      obtain ⟨record, occurrence, identity, live, owned⟩ := ordered_owner_population program admitted rest successors length aligned kinds transition added
      have scopes := admission_scope_frame program before stimulus selected completion
      rw [stateEq] at scopes
      rw [scopes] at live
      exact ⟨record, occurrence, identity, (history.scopeOccurrences_sublist program owner selected initial before earlier).subset live, owned⟩

/-- Actual retained records have complete initial-owner and original-declaration coverage, including their body-or-retirement classification. -/
theorem ContinuationCommandHistory.record_population_coverage (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    ∀ transition ∈ records, ∃ record occurrence operation,
      transition = .internalOperation record ∧ occurrence ∈ initial.scopeOccurrences ∧ occurrence.id = record.owner ∧
      program.operations.find? (·.id == record.operationId) = some operation ∧
      operation ∈ program.operations ∧ operation.id = record.operationId ∧ operation.kind = record.operationKind ∧
      bodyOrRetirementTransition transition := by
  intro transition member
  obtain ⟨record, occurrence, identity, live, owned⟩ := history.record_owner_population program owner selected initial final records transition member
  have internalMember : .internalOperation record ∈ records := identity ▸ member
  obtain ⟨operation, lookup, key, kind, population⟩ := history.record_declaration_scope program owner selected initial final records record internalMember
  exact ⟨record, occurrence, operation, identity, live, owned, lookup, (List.mem_filter.mp population).1, key, kind,
    identity ▸ history.record_body_or_retirement program owner initial final records record internalMember⟩

private theorem sum_map_add {α : Type} (values : List α) (left right : α → Nat) :
    (values.map (fun value => left value + right value)).sum =
      (values.map left).sum + (values.map right).sum := by
  induction values with
  | nil => simp
  | cons head tail ih => simp only [List.map_cons, List.sum_cons, ih]; omega

private theorem member_le_sum {α : Type} (values : List α) (charge : α → Nat)
    (value : α) (member : value ∈ values) : charge value ≤ (values.map charge).sum := by
  induction values with
  | nil => simp at member
  | cons head tail ih =>
    rcases List.mem_cons.mp member with same | later
    · subst value; simp only [List.map_cons, List.sum_cons]; omega
    · have bound := ih later
      simp only [List.map_cons, List.sum_cons]; omega

private theorem credited_records_count (population : List RuntimeScopeOccurrence)
    (declarations : RuntimeScopeOccurrence → List SemanticOperation) (records : List CommittedTransition)
    (credit : CommittedTransition → Nat)
    (covered : ∀ transition ∈ records, 1 ≤ credit transition ∨ ∃ record occurrence operation,
      transition = .internalOperation record ∧ occurrence ∈ population ∧ occurrence.id = record.owner ∧
      operation ∈ declarations occurrence ∧ operation.id = record.operationId) :
    records.length ≤ (population.map (fun occurrence => ((declarations occurrence).map
      (fun operation => declarationFiringCount records occurrence.id operation.id)).sum)).sum +
      (records.map credit).sum := by
  induction records with
  | nil => simp [declarationFiringCount]
  | cons head tail ih =>
    have rest := ih (fun transition member => covered transition (by simp [member]))
    have first : 1 ≤ (population.map (fun occurrence => ((declarations occurrence).map
        (fun operation => declarationFiringCharge occurrence.id operation.id head)).sum)).sum + credit head := by
      rcases covered head (by simp) with direct | ⟨record, occurrence, operation, identity, live, owned, declared, key⟩
      · omega
      · have inner := member_le_sum (declarations occurrence)
          (fun operation => declarationFiringCharge occurrence.id operation.id head) operation declared
        have outer := member_le_sum population (fun occurrence => ((declarations occurrence).map
          (fun operation => declarationFiringCharge occurrence.id operation.id head)).sum) occurrence live
        have unit : declarationFiringCharge occurrence.id operation.id head = 1 := by
          simp only [identity, declarationFiringCharge, owned, key, BEq.rfl, Bool.true_and, ite_true]
        omega
    simp only [List.length_cons, List.map_cons, List.sum_cons]
    simp only [declarationFiringCount, List.map_cons, List.sum_cons] at rest ⊢
    simp only [sum_map_add]
    omega

private theorem sum_map_zero {α : Type} (values : List α) (charge : α → Nat)
    (zero : ∀ value ∈ values, charge value = 0) : (values.map charge).sum = 0 := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
    simp only [List.map_cons, List.sum_cons, zero head (by simp), Nat.zero_add]
    exact ih (fun value member => zero value (by simp [member]))


private theorem covered_records_count (population : List RuntimeScopeOccurrence)
    (declarations : RuntimeScopeOccurrence → List SemanticOperation) (records : List CommittedTransition)
    (covered : ∀ transition ∈ records, ∃ record occurrence operation,
      transition = .internalOperation record ∧ occurrence ∈ population ∧
      occurrence.id = record.owner ∧ operation ∈ declarations occurrence ∧ operation.id = record.operationId) :
    records.length ≤ (population.map (fun occurrence =>
      ((declarations occurrence).map (fun operation => declarationFiringCount records occurrence.id operation.id)).sum)).sum := by
  have counted := credited_records_count population declarations records (fun _ => 0)
    (fun transition member => Or.inr (covered transition member))
  have zero : (records.map (fun _ => (0 : Nat))).sum = 0 :=
    sum_map_zero records (fun _ => 0) (fun _ _ => rfl)
  simpa only [zero, Nat.add_zero] using counted

/-- Exact declaration-scope attribution supplies the tighter owner-indexed counting population without an assumed partition. -/
theorem ContinuationCommandHistory.record_count_le_scoped_population_firings (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    records.length ≤ (initial.scopeOccurrences.map (fun occurrence =>
      ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
        binding.operationId == operation.id && binding.scopeId == occurrence.id.definitionScopeId))).map
        (fun operation => declarationFiringCount records occurrence.id operation.id)).sum)).sum := by
  apply covered_records_count initial.scopeOccurrences _ records
  intro transition member
  obtain ⟨record, occurrence, identity, live, owned⟩ :=
    history.record_owner_population program owner selected initial final records transition member
  obtain ⟨operation, _, key, _, declared⟩ := history.record_declaration_scope program owner selected
    initial final records record (identity ▸ member)
  exact ⟨record, occurrence, operation, identity, live, owned, by simpa only [owned] using declared, key⟩

/-- Retirement records consume the global deletion budget once; the scoped firing matrix contains only the other declarations. -/
theorem ContinuationCommandHistory.record_count_le_scoped_firings_add_retirements
    (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    records.length ≤ (initial.scopeOccurrences.map (fun occurrence =>
      ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
        binding.operationId == operation.id && binding.scopeId == occurrence.id.definitionScopeId) &&
        operation.kind != .completeParallelMultiInstanceScope)).map
        (fun operation => declarationFiringCount records occurrence.id operation.id)).sum)).sum +
      (records.map retirementCharge).sum := by
  apply credited_records_count initial.scopeOccurrences _ records retirementCharge
  intro transition member
  obtain ⟨record, occurrence, operation, identity, live, owned, originalLookup, declared, key, kind, allowed⟩ :=
    history.record_population_coverage program owner selected initial final records transition member
  have internalMember : .internalOperation record ∈ records := identity ▸ member
  obtain ⟨actual, actualLookup, _, _, population⟩ := history.record_declaration_scope program owner selected
    initial final records record internalMember
  have same : actual = operation := Option.some.inj (actualLookup.symm.trans originalLookup)
  subst actual
  rcases allowed with body | retirement
  · right
    have different : operation.kind ≠ .completeParallelMultiInstanceScope := by
      simp [identity, bodyTransition] at body
      rcases body with same | same | same | same | same <;> simp [kind, same]
    refine ⟨record, occurrence, operation, identity, live, owned, ?_, key⟩
    obtain ⟨declared, scopeMember⟩ := List.mem_filter.mp population
    exact List.mem_filter.mpr ⟨declared, by simp [owned, scopeMember, different]⟩
  · left
    have retirementKind : record.operationKind = .completeParallelMultiInstanceScope := by
      simpa only [identity] using retirement
    simp [identity, retirementCharge, retirementKind]

/-- Actual parent execution and entry charge all retirement records to the captured collection, without multiplying that charge by the owner population. -/
theorem ContinuationCommandHistory.record_count_le_scoped_firings_add_captured_items
    (program : Program) (entry : ParallelScopeEntry) (owner parent : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (before initial final : RuntimeState) (records : List CommittedTransition)
    (parents : ParallelScopeParentHistory program entry parent before)
    (entered : enterParallelScope? entry before parent = some initial)
    (history : ContinuationCommandHistory program owner initial final records) :
    ∃ (items : List String) (binding : VariableBinding),
      before.variables.process.bindings.filter (·.name == entry.collectionName) = [binding] ∧
      binding.value = .stringList items ∧ items.length ≤ 16 ∧
      records.length ≤ (initial.scopeOccurrences.map (fun occurrence =>
        ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
          binding.operationId == operation.id && binding.scopeId == occurrence.id.definitionScopeId) &&
          operation.kind != .completeParallelMultiInstanceScope)).map
          (fun operation => declarationFiringCount records occurrence.id operation.id)).sum)).sum + items.length := by
  obtain ⟨items, binding, captured, typed, limit, retired⟩ :=
    history.retirement_budget_from_parent_entry program entry owner parent selected before initial final records parents entered
  have counted := history.record_count_le_scoped_firings_add_retirements program owner selected initial final records
  exact ⟨items, binding, captured, typed, limit, by omega⟩

private theorem admitted_nonretirement_body (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (child : List SemanticOperation) (completion : SemanticOperation) (body : List SemanticOperation)
    (childEq : child = program.operations.filter (fun operation => program.operationScopes.any
      (fun binding => binding.operationId == operation.id && binding.scopeId == analysis.entry.childScopeId)))
    (completionEq : child.filter (fun operation => match operation with
      | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion])
    (bodyEq : body = child.filter (·.id != completion.id)) :
    child.filter (fun operation => operation.kind != .completeParallelMultiInstanceScope) = body := by
  have kindFilter : child.filter (fun operation => operation.kind == .completeParallelMultiInstanceScope) = [completion] := by
    rw [← completionEq]
    apply List.filter_congr
    intro operation member
    cases operation <;> rfl
  have completionSelected : completion ∈ child.filter
      (fun operation => operation.kind == .completeParallelMultiInstanceScope) :=
    kindFilter.symm ▸ (show completion ∈ [completion] from by simp)
  have completionMember : completion ∈ child := (List.mem_filter.mp completionSelected).1
  have completionBool : (completion.kind == .completeParallelMultiInstanceScope) = true :=
    (List.mem_filter.mp completionSelected).2
  have completionKind : completion.kind = .completeParallelMultiInstanceScope := beq_iff_eq.mp completionBool
  rw [bodyEq]
  apply List.filter_congr
  intro operation member
  by_cases same : operation.id = completion.id
  · have equal := same_declaration program analysis admitted operation completion
      (List.mem_filter.mp (childEq ▸ member)).1 (List.mem_filter.mp (childEq ▸ completionMember)).1 same
    simp [equal, completionKind]
  · have different : operation.kind ≠ .completeParallelMultiInstanceScope := by
      intro kind
      have selected : operation ∈ child.filter (fun operation => operation.kind == .completeParallelMultiInstanceScope) :=
        List.mem_filter.mpr ⟨member, by simp [kind]⟩
      rw [kindFilter] at selected
      have equal := List.mem_singleton.mp selected
      exact same (congrArg SemanticOperation.id equal)
    apply Bool.eq_iff_iff.mpr
    simp [same, different]

/-- Actual parent execution and entry bound an exact child's scoped non-retirement matrix term by the admitted body population, leaving the retirement slot to the global deletion budget. -/
theorem ContinuationCommandHistory.child_scoped_nonretirement_firing_sum_le
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before initial final : RuntimeState) (childScope : owner.definitionScopeId = analysis.entry.childScopeId)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some initial)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial final records) :
    ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
      binding.operationId == operation.id && binding.scopeId == owner.definitionScopeId) &&
      operation.kind != .completeParallelMultiInstanceScope)).map
      (fun operation => declarationFiringCount records owner operation.id)).sum ≤ analysis.childCount - 1 := by
  obtain ⟨child, completion, body, childEq, completionEq, bodyEq, _, bounded, counted, _⟩ :=
    history.body_firing_sum_le_body_length_from_parent_history program analysis admitted owner parent selected
      before initial final childScope parents entered records
  have bodyPopulation := admitted_nonretirement_body program analysis admitted child completion body childEq completionEq bodyEq
  have population : program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
      binding.operationId == operation.id && binding.scopeId == owner.definitionScopeId) &&
      operation.kind != .completeParallelMultiInstanceScope) = body := by
    rw [childScope]
    simpa only [childEq, List.filter_filter, Bool.and_comm] using bodyPopulation
  rw [population]
  omega

/-- The retained root frame makes the same actual lifetime history available to every non-parent observer. -/
theorem ContinuationCommandHistory.reindex_nonparent
    (program : Program) (owner target parent : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (frame : ParallelScopeStructuralFrame parent initial) (different : target ≠ parent) :
    ContinuationCommandHistory program target initial final records := by
  induction history with
  | initial => exact .initial _
  | @internalStep before after earlier record history replayed kind outside ih =>
    have currentFrame := history.structural_frame program owner parent selected initial before earlier frame
    apply ContinuationCommandHistory.internalStep ih replayed kind
    intro _ entry binding bound
    have same := (currentFrame.bound_outer entry parent record.owner before binding bound).2.2
    exact fun equal => different (equal.trans same)
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    have currentFrame := history.structural_frame program owner parent selected initial before earlier frame
    exact ih.extend_wait_command program target parent selected initial before after earlier rest stimulus
      replayed completion kinds currentFrame different

private theorem filter_partition_length {α : Type} (values : List α) (predicate : α → Bool) :
    (values.filter predicate).length + (values.filter (fun value => !predicate value)).length = values.length := by
  induction values with
  | nil => simp
  | cons head tail ih =>
    cases selected : predicate head <;>
      simp only [List.filter_cons, selected, Bool.not_true, Bool.not_false, Bool.false_eq_true, ite_true, ite_false, List.length_cons] <;> omega

private theorem sum_map_le_population_mul {α : Type} (values : List α) (charge : α → Nat)
    (bound : Nat) (bounded : ∀ value ∈ values, charge value ≤ bound) :
    (values.map charge).sum ≤ values.length * bound := by
  induction values with
  | nil => simp
  | cons head tail ih =>
    have first := bounded head (by simp)
    have rest := ih (fun value member => bounded value (by simp [member]))
    simp only [List.map_cons, List.sum_cons, List.length_cons, Nat.add_mul, Nat.one_mul]
    omega

/-- Actual entry supplies the whole child counting population; reindexing its actual lifetime history bounds every issued owner's body charges and charges retirement once globally. -/
theorem ContinuationCommandHistory.issued_child_firings_and_retirements_le
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (before initial final : RuntimeState) (records : List CommittedTransition)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some initial)
    (history : ContinuationCommandHistory program owner initial final records) :
    ∃ (items : List String) (binding : VariableBinding),
      before.variables.process.bindings.filter (·.name == analysis.entry.collectionName) = [binding] ∧
      binding.value = .stringList items ∧ items.length ≤ 16 ∧
      let childFirings := ((initial.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ parent))).map
        (fun occurrence => ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
          binding.operationId == operation.id && binding.scopeId == occurrence.id.definitionScopeId) &&
          operation.kind != .completeParallelMultiInstanceScope)).map
          (fun operation => declarationFiringCount records occurrence.id operation.id)).sum)).sum
      childFirings ≤ items.length * (analysis.childCount - 1) ∧
      childFirings + (records.map retirementCharge).sum ≤ items.length * analysis.childCount := by
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have frame := enterParallelScope_structural_parallel_frame analysis.entry parent before initial clean
    (parents.structural_frame program analysis.entry parent before) entered
  obtain ⟨items, binding, captured, typed, limit, population⟩ :=
    entry_scope_count analysis.entry parent before initial clean entered
  have partition := filter_partition_length initial.scopeOccurrences (fun occurrence => decide (occurrence.id = parent))
  have complement : initial.scopeOccurrences.filter (fun occurrence => !decide (occurrence.id = parent)) =
      initial.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ parent)) := by
    apply List.filter_congr
    intro occurrence member
    apply Bool.eq_iff_iff.mpr
    simp
  rw [frame.root, complement] at partition
  simp only [List.length_cons, List.length_nil] at partition
  have childCount : (initial.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ parent))).length = items.length := by omega
  have domain := enterParallelScope_clean_scope_domain analysis.entry parent before initial clean entered
  have bounded := sum_map_le_population_mul
    (initial.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ parent)))
    (fun occurrence => ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
      binding.operationId == operation.id && binding.scopeId == occurrence.id.definitionScopeId) &&
      operation.kind != .completeParallelMultiInstanceScope)).map
      (fun operation => declarationFiringCount records occurrence.id operation.id)).sum)
    (analysis.childCount - 1) (by
      intro occurrence present
      obtain ⟨live, different⟩ := List.mem_filter.mp present
      have nonparent : occurrence.id ≠ parent := of_decide_eq_true different
      have childScope : occurrence.id.definitionScopeId = analysis.entry.childScopeId :=
        (domain occurrence live).resolve_left nonparent
      have reindexed := history.reindex_nonparent program owner occurrence.id parent selected initial final records frame nonparent
      exact reindexed.child_scoped_nonretirement_firing_sum_le program analysis admitted occurrence.id parent selected
        before initial final childScope parents entered records)
  rw [childCount] at bounded
  have retired := history.retirement_budget_with_root program owner parent selected initial final records frame
  have positive : 1 ≤ analysis.childCount := by
    obtain ⟨child, completion, origin, body, first, converted, ordered, _, childEq, completionEq, _, _, bodyEq, _⟩ :=
      ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
    have counted := ParallelScopeStart.analyzeProgram_child_count program analysis admitted child completion body childEq completionEq bodyEq
    omega
  refine ⟨items, binding, captured, typed, limit, bounded, ?_⟩
  have multiplication : items.length * (analysis.childCount - 1) + items.length = items.length * analysis.childCount := by
    calc
      items.length * (analysis.childCount - 1) + items.length =
          items.length * ((analysis.childCount - 1) + 1) := by rw [Nat.mul_add, Nat.mul_one]
      _ = items.length * analysis.childCount := by congr 1; omega
  omega

/-- Actual lifetime records exclude initiation, entry and final scope declarations for every counted owner, independently of the history observer. -/
theorem ContinuationCommandHistory.phase_declaration_firing_zero
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (observer counted : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program observer initial final records)
    (phase : SemanticOperation) (declared : phase ∈ program.operations)
    (excluded : phase.kind = .initiate ∨ phase.kind = .enterParallelMultiInstanceScope ∨ phase.kind = .completeScope) :
    declarationFiringCount records counted phase.id = 0 := by
  apply sum_map_zero
  intro transition member
  obtain ⟨record, occurrence, operation, identity, _, _, _, population, key, kind, allowed⟩ :=
    history.record_population_coverage program observer selected initial final records transition member
  by_cases same : record.operationId = phase.id
  · have equal := same_declaration program analysis admitted operation phase population declared (key.trans same)
    have phaseKind : record.operationKind = phase.kind := kind.symm.trans (congrArg SemanticOperation.kind equal)
    rcases excluded with excluded | excluded | excluded <;>
      simp [identity, bodyOrRetirementTransition, bodyTransition, phaseKind, excluded] at allowed
  · simp [identity, declarationFiringCharge, same]

theorem spine_entry_member (entryId : OperationId) (operations : List SemanticOperation)
    (next : ControlPlaceId) (entered : Bool) (path : List SemanticOperation)
    (trace : ParallelScopeStart.ParentSpineTrace entryId operations next entered path) :
    entered = false → ∃ operation ∈ path, operation.id = entryId := by
  induction trace with
  | finish => simp
  | step operations next output entered nextEntered operation tail selected edge rest ih =>
    intro pending
    by_cases same : operation.id = entryId
    · exact ⟨operation, by simp, same⟩
    · have flags : nextEntered = entered := by
        cases operation <;> simp only [ParallelScopeStart.ParentSpineStep] at edge <;> try contradiction
        case awaitUserTask => exact edge.2
        case awaitEffect id origin input output effect route =>
          cases route <;> simp only at edge <;> try contradiction
          exact edge.2
        case enterParallelMultiInstanceScope => exact False.elim (same edge.2.1)
      obtain ⟨operation, member, identity⟩ := ih (flags.trans pending)
      exact ⟨operation, by simp [member], identity⟩

theorem sum_map_reserved_zero_slot {α : Type} (values : List α) (charge : α → Nat)
    (bounded : ∀ value ∈ values, charge value ≤ 1)
    (reserved : ∃ value ∈ values, charge value = 0) : (values.map charge).sum + 1 ≤ values.length := by
  induction values with
  | nil => simp at reserved
  | cons head tail ih =>
    have first := bounded head (by simp)
    have remaining : ∀ value ∈ tail, charge value ≤ 1 := fun value member => bounded value (by simp [member])
    by_cases zero : charge head = 0
    · have rest := sum_map_le_population_mul tail charge 1 remaining
      simp only [List.map_cons, List.sum_cons, List.length_cons, zero, Nat.zero_add]
      omega
    · obtain ⟨value, member, valueZero⟩ := reserved
      have tailMember : value ∈ tail := (List.mem_cons.mp member).resolve_left (fun same => zero (same ▸ valueZero))
      have rest := ih remaining ⟨value, tailMember, valueZero⟩
      simp only [List.map_cons, List.sum_cons, List.length_cons]
      omega

/-- The admitted parent spine reserves entry's existing zero-charge slot before accounting for initiation, entry and final completion. -/
theorem ContinuationCommandHistory.parent_path_firing_sum_reserves_entry
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
      start.kind = .initiate ∧ completion.kind = .completeScope ∧
      parentOperations.Perm (start :: path ++ [completion]) ∧
      (path.map (fun operation => declarationFiringCount (priorRecords ++ suffix) parent operation.id)).sum + 3 ≤ analysis.parentCount := by
  obtain ⟨admittedRoot, parentOperations, start, completion, path, roots, population, startShape, completionKind, trace, coverage, unique, bounded⟩ :=
    preceding.parent_path_firing_le_one program analysis admitted owner parent selected instanceId values root
      ready initial before issued final startId origin output startDeclared rootSelected parentIdentity started initiated
      priorRecords suffix entered following clean
  obtain ⟨entry, entryMember, entryId, entryKind, _⟩ := admitted_entry_declaration program analysis admitted
  have earlyZero := preceding.phase_declaration_firing_zero program analysis admitted owner parent selected initial before
    priorRecords entry entryMember (Or.inr (Or.inl entryKind))
  have lateZero := following.phase_declaration_firing_zero program analysis admitted owner parent selected issued final
    suffix entry entryMember (Or.inr (Or.inl entryKind))
  have entryZero : declarationFiringCount (priorRecords ++ suffix) parent analysis.entry.id = 0 := by
    simp only [declarationFiringCount, List.map_append, List.sum_append] at earlyZero lateZero ⊢
    rw [← entryId]
    omega
  obtain ⟨selectedEntry, present, identity⟩ := spine_entry_member analysis.entry.id _ output false path trace rfl
  have reserved := sum_map_reserved_zero_slot path
    (fun operation => declarationFiringCount (priorRecords ++ suffix) parent operation.id) bounded
    ⟨selectedEntry, present, by simpa only [identity] using entryZero⟩
  obtain ⟨staticRoot, staticParent, counts, staticStart, staticCompletion, staticOutput, staticPath,
    staticRoots, staticPopulation, _, _, _, _, _, _, _, _, _, counted⟩ :=
    ParallelScopeStart.analyzeProgram_parent_spine program analysis admitted
  have sameRoot : staticRoot = admittedRoot := by simpa using staticRoots.symm.trans roots
  have sameParent : staticParent = parentOperations := staticPopulation.trans (by rw [sameRoot]; exact population.symm)
  rw [sameParent] at counted
  have length := coverage.length_eq
  simp only [List.length_cons, List.length_append, List.length_nil] at length
  exact ⟨admittedRoot, parentOperations, start, completion, path, roots, population, by rw [startShape]; rfl, completionKind, coverage, by omega⟩

theorem sum_map_permutation {α : Type} (left right : List α) (permutation : left.Perm right)
    (charge : α → Nat) : (left.map charge).sum = (right.map charge).sum := by
  induction permutation with
  | nil => rfl
  | cons head permutation ih => simp only [List.map_cons, List.sum_cons, ih]
  | swap first second tail => simp only [List.map_cons, List.sum_cons]; omega
  | trans first second ih₁ ih₂ => exact ih₁.trans ih₂

/-- The actual scoped parent matrix inherits the reserved entry slot from its admitted permutation. -/
theorem ContinuationCommandHistory.parent_scoped_firing_sum_reserves_entry
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
    ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
      binding.operationId == operation.id && binding.scopeId == parent.definitionScopeId))).map
      (fun operation => declarationFiringCount (priorRecords ++ suffix) parent operation.id)).sum + 3 ≤ analysis.parentCount := by
  obtain ⟨admittedRoot, parentOperations, start, completion, path, roots, population,
    startKind, completionKind, coverage, bounded⟩ :=
    preceding.parent_path_firing_sum_reserves_entry program analysis admitted owner parent selected instanceId values root
      ready initial before issued final startId origin output startDeclared rootSelected parentIdentity started initiated
      priorRecords suffix entered following clean
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
  have startEarly := preceding.phase_declaration_firing_zero program analysis admitted owner parent selected initial before
    priorRecords start startMember (Or.inl startKind)
  have startLate := following.phase_declaration_firing_zero program analysis admitted owner parent selected issued final
    suffix start startMember (Or.inl startKind)
  have finishEarly := preceding.phase_declaration_firing_zero program analysis admitted owner parent selected initial before
    priorRecords completion completionMember (Or.inr (Or.inr completionKind))
  have finishLate := following.phase_declaration_firing_zero program analysis admitted owner parent selected issued final
    suffix completion completionMember (Or.inr (Or.inr completionKind))
  have summed := sum_map_permutation _ _ coverage
    (fun operation => declarationFiringCount (priorRecords ++ suffix) parent operation.id)
  simp only [List.map_cons, List.map_append, List.map_nil, List.sum_cons, List.sum_append, List.sum_nil, Nat.add_zero] at summed
  simp only [declarationFiringCount, List.map_append, List.sum_append] at startEarly startLate finishEarly finishLate summed
  rw [parentScope, ← population]
  simp only [declarationFiringCount, List.map_append, List.sum_append] at bounded ⊢
  omega

private theorem sum_filter_partition {α : Type} (values : List α) (predicate : α → Bool)
    (charge : α → Nat) :
    ((values.filter predicate).map charge).sum +
      ((values.filter (fun value => !predicate value)).map charge).sum = (values.map charge).sum := by
  induction values with
  | nil => simp
  | cons head tail ih =>
    cases selected : predicate head <;>
      simp only [List.filter_cons, selected, Bool.not_true, Bool.not_false, Bool.false_eq_true,
        ite_true, ite_false, List.map_cons, List.sum_cons] <;> omega

theorem start_initiation_scope_and_process (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (root : DefinitionScope) (parent : ScopeOccurrenceId)
    (ready initial : RuntimeState) (output : ControlPlaceId)
    (selected : rootDefinitionScope? program = some root)
    (owner : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial) :
    initial.scopeOccurrences = [⟨parent, none⟩] ∧ initial.variables.process.bindings = values := by
  simp only [runningProgramStartState?, selected, bind, Option.bind_some, pure, Option.some.injEq] at started
  subst ready
  simp [initiateState?, rootScopeOccurrence?, runningStartState, initialState, addToken] at initiated
  subst initial
  simp [owner]

/-- Actual Start, two lifetime phases and canonical entry fit the admitted parent-plus-issued-child record budget, including the three exceptional phase slots. -/
theorem ContinuationCommandHistory.two_phase_record_count_le_admitted_capacity
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
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix) :
    ∃ (items : List String) (binding : VariableBinding),
      before.variables.process.bindings.filter (·.name == analysis.entry.collectionName) = [binding] ∧
      binding.value = .stringList items ∧ items.length ≤ 16 ∧
      priorRecords.length + suffix.length + 3 ≤ analysis.parentCount + items.length * analysis.childCount := by
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have census := (start_initiation_scope_and_process program instanceId values root parent ready initial output
    rootSelected parentIdentity started initiated).1
  have priorCount := preceding.record_count_le_scoped_population_firings program owner selected initial before priorRecords
  rw [census] at priorCount
  simp only [List.map_cons, List.map_nil, List.sum_cons, List.sum_nil, Nat.add_zero] at priorCount
  have parentBudget := preceding.parent_scoped_firing_sum_reserves_entry program analysis admitted owner parent selected
    instanceId values root ready initial before issued final startId origin output startDeclared rootSelected parentIdentity
    started initiated priorRecords suffix entered following clean
  have parentSplit : ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
      binding.operationId == operation.id && binding.scopeId == parent.definitionScopeId))).map
      (fun operation => declarationFiringCount (priorRecords ++ suffix) parent operation.id)).sum =
      ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
        binding.operationId == operation.id && binding.scopeId == parent.definitionScopeId))).map
        (fun operation => declarationFiringCount priorRecords parent operation.id)).sum +
      ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
        binding.operationId == operation.id && binding.scopeId == parent.definitionScopeId))).map
        (fun operation => declarationFiringCount suffix parent operation.id)).sum := by
    simp only [declarationFiringCount, List.map_append, List.sum_append, sum_map_add]
  rw [parentSplit] at parentBudget
  have frame := enterParallelScope_structural_parallel_frame analysis.entry parent before issued clean
    (parents.structural_frame program analysis.entry parent before) entered
  let charge := fun occurrence : RuntimeScopeOccurrence => ((program.operations.filter (fun operation =>
    program.operationScopes.any (fun binding => binding.operationId == operation.id &&
      binding.scopeId == occurrence.id.definitionScopeId) && operation.kind != .completeParallelMultiInstanceScope)).map
      (fun operation => declarationFiringCount suffix occurrence.id operation.id)).sum
  have suffixCount := following.record_count_le_scoped_firings_add_retirements program owner selected issued final suffix
  change suffix.length ≤ (issued.scopeOccurrences.map charge).sum + (suffix.map retirementCharge).sum at suffixCount
  have splitSum := sum_filter_partition issued.scopeOccurrences (fun occurrence => decide (occurrence.id = parent)) charge
  have complement : issued.scopeOccurrences.filter (fun occurrence => !decide (occurrence.id = parent)) =
      issued.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ parent)) := by
    apply List.filter_congr
    intro occurrence member
    apply Bool.eq_iff_iff.mpr
    simp
  rw [frame.root, complement] at splitSum
  simp only [List.map_cons, List.map_nil, List.sum_cons, List.sum_nil, Nat.add_zero] at splitSum
  have parentFiltered := sum_filter_partition
    (program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
      binding.operationId == operation.id && binding.scopeId == parent.definitionScopeId)))
    (fun operation => operation.kind != .completeParallelMultiInstanceScope)
    (fun operation => declarationFiringCount suffix parent operation.id)
  simp only [List.filter_filter] at parentFiltered
  have filteredOrder : program.operations.filter (fun operation =>
      operation.kind != .completeParallelMultiInstanceScope && program.operationScopes.any (fun binding =>
        binding.operationId == operation.id && binding.scopeId == parent.definitionScopeId)) =
      program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
        binding.operationId == operation.id && binding.scopeId == parent.definitionScopeId) &&
        operation.kind != .completeParallelMultiInstanceScope) := by
    apply List.filter_congr
    intro operation member
    exact Bool.and_comm _ _
  rw [filteredOrder] at parentFiltered
  obtain ⟨items, binding, captured, typed, limit, _, childBudget⟩ :=
    following.issued_child_firings_and_retirements_le program analysis admitted owner parent selected before issued final
      suffix parents entered
  change ((issued.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ parent))).map charge).sum +
    (suffix.map retirementCharge).sum ≤ items.length * analysis.childCount at childBudget
  have filteredBound : charge ⟨parent, none⟩ ≤
      ((program.operations.filter (fun operation => program.operationScopes.any (fun binding =>
        binding.operationId == operation.id && binding.scopeId == parent.definitionScopeId))).map
        (fun operation => declarationFiringCount suffix parent operation.id)).sum := by
    dsimp only [charge]
    omega
  exact ⟨items, binding, captured, typed, limit, by omega⟩

/-- Entry's surviving collection traces through actual command history to the unique binding admitted at Start, so the record bound uses the real Start closure capacity. -/
theorem ContinuationCommandHistory.two_phase_record_count_le_start_capacity
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
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (capacity : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program values = some capacity) :
    priorRecords.length + suffix.length + 3 ≤ capacity.closureBound := by
  obtain ⟨items, binding, captured, typed, _, bounded⟩ :=
    preceding.two_phase_record_count_le_admitted_capacity program analysis admitted owner parent selected instanceId values root
      ready initial before issued final startId origin output startDeclared rootSelected parentIdentity started initiated
      priorRecords suffix parents entered following
  obtain ⟨startAnalysis, originalBinding, originalItems, analyzed, _, originalCaptured, originalTyped, boundEq, _, _⟩ :=
    ParallelScopeStart.programStartCapacity_bound_certificate program values capacity startCapacity
  have sameAnalysis : startAnalysis = analysis := Option.some.inj (analyzed.symm.trans admitted)
  subst startAnalysis
  have capturedMember : binding ∈ before.variables.process.bindings.filter (·.name == analysis.entry.collectionName) := by
    rw [captured]
    simp
  obtain ⟨present, named⟩ := List.mem_filter.mp capturedMember
  have key : binding.name = analysis.entry.collectionName := beq_iff_eq.mp named
  have canonical : binding = { name := analysis.entry.collectionName, value := .stringList items } := by
    cases binding with
    | mk bindingName value =>
      change bindingName = analysis.entry.collectionName at key
      change value = .stringList items at typed
      subst bindingName
      subst value
      rfl
  rw [canonical] at present
  have ancestor := preceding.stringList_provenance program owner selected initial before priorRecords
    analysis.entry.collectionName items present
  have initialProcess := (start_initiation_scope_and_process program instanceId values root parent ready initial output
    rootSelected parentIdentity started initiated).2
  rw [initialProcess] at ancestor
  have originalMember : ({ name := analysis.entry.collectionName, value := .stringList items } : VariableBinding) ∈
      values.filter (·.name == analysis.entry.collectionName) := List.mem_filter.mpr ⟨ancestor, by simp⟩
  rw [originalCaptured] at originalMember
  have sameBinding := List.mem_singleton.mp originalMember
  have sameItems : items = originalItems := VariableValue.stringList.inj
    ((congrArg VariableBinding.value sameBinding).trans originalTyped)
  rw [sameItems] at bounded
  rw [boundEq]
  exact bounded

/-- Actual two-phase history fits the capacity accepted at resumption as well as the original Start capacity. -/
theorem ContinuationCommandHistory.two_phase_record_count_le_resumption_capacity
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
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix)
    (capacity : ParallelScopeStart.ProgramCapacity)
    (startCapacity : ParallelScopeStart.programStartCapacity program values = some capacity)
    (resumed : ParallelScopeStart.ProgramCapacity)
    (stateCapacity : ParallelScopeStart.programStateCapacity program final = some resumed) :
    priorRecords.length + suffix.length + 3 ≤ resumed.closureBound := by
  have initialProcess := (start_initiation_scope_and_process program instanceId values root parent ready initial output
    rootSelected parentIdentity started initiated).2
  have initialCapacity : ParallelScopeStart.programStartCapacity program initial.variables.process.bindings = some capacity := by
    rwa [initialProcess]
  have boundEq := ContinuationCommandHistory.resumption_closure_bound_through_entry program owner parent analysis.entry
    selected initial before issued final priorRecords suffix preceding entered following capacity resumed initialCapacity stateCapacity
  rw [boundEq]
  exact preceding.two_phase_record_count_le_start_capacity program analysis admitted owner parent selected instanceId values root
    ready initial before issued final startId origin output startDeclared rootSelected parentIdentity started initiated
    priorRecords suffix parents entered following capacity startCapacity

end BpmnSemantics.SemanticProcess.ParallelScopeReplay
