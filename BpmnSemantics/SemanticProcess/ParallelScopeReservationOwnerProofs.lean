module

import BpmnSemantics.SemanticProcess.ParallelScopeReservationAncestryProofs
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.ParallelScopeData
public import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability
import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs
import BpmnSemantics.SemanticProcess.ParallelScopeRuntimeLaws

/-! # Actual parallel reservation owner bounds

PMIS-ENTER-01 starts the child counter at zero and admits at most sixteen items.
Its issued scope ordinal census therefore supplies reservation's owner bounds;
actual continuation history retains those identities without allocating scopes.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

private theorem resolved_owner_member (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    ∃ scope ∈ state.scopeOccurrences, scope.id = candidate.owner := by
  have live := resolved_exactLiveOccurrence program state candidate operation resolved
  have count : (state.scopeOccurrences.filter (fun scope => decide (scope.id = candidate.owner))).length = 1 :=
    of_decide_eq_true live
  obtain ⟨scope, selected⟩ := List.length_eq_one_iff.mp count
  have filtered : scope ∈ state.scopeOccurrences.filter (fun scope => decide (scope.id = candidate.owner)) := by
    rw [selected]
    simp
  obtain ⟨member, same⟩ := List.mem_filter.mp filtered
  exact ⟨scope, member, of_decide_eq_true same⟩

/-- Actual entry from the clean zero-counter census keeps every scope in the parent instance with ordinal between one and sixteen. -/
theorem enterParallelScope_clean_owner_bounds (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before issued : RuntimeState) (clean : ParallelScopeCleanEntry entry parent before)
    (parentOrdinal : parent.activation = 1)
    (entered : enterParallelScope? entry before parent = some issued) :
    ∀ scope ∈ issued.scopeOccurrences, scope.id.processInstanceId = parent.processInstanceId ∧
      0 < scope.id.activation ∧ scope.id.activation ≤ 16 := by
  obtain ⟨rootCensus, _, _, _, _, zeroCounter⟩ := clean
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
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
      intro scope member
      have root : scope = ⟨parent, none⟩ := by simpa [rootCensus] using member
      simp [root, parentOrdinal]
  | cons item items =>
      obtain ⟨⟨generated, iterations⟩, issuedBodies, entered⟩ := Option.bind_eq_some_iff.mp entered
      cases iterations with
      | nil => simp at entered
      | cons first rest =>
          cases Option.some.inj entered
          intro scope member
          have population := issueParallelBodies_scope_population issuedBodies
          rcases List.mem_append.mp (population.mem_iff.mp member) with body | root
          · obtain ⟨iteration, iterationMember, same⟩ := List.mem_map.mp body
            subst scope
            have domain := issueParallelBodies_scope_domain issuedBodies iteration iterationMember
            have ordinals := (issueParallelBodies_scope_ordinals issuedBodies).1
            change (first :: rest).map (·.scope.activation) =
              List.range' (scopeActivationCount before entry.childScopeId + 1) (item :: items).length at ordinals
            rw [zeroCounter] at ordinals
            have present : iteration.scope.activation ∈ List.range' 1 (item :: items).length := by
              rw [← ordinals]
              exact List.mem_map.mpr ⟨iteration, iterationMember, rfl⟩
            obtain ⟨index, lower, identity⟩ := List.mem_range'.mp present
            simp only [Nat.one_mul] at identity
            refine ⟨domain.1, ?_, ?_⟩
            · change 0 < iteration.scope.activation
              omega
            · change iteration.scope.activation ≤ 16
              omega
          · have rootScope : scope = ⟨parent, none⟩ := by simpa [rootCensus] using root
            simp [rootScope, parentOrdinal]

/-- Actual pre-entry history fixes every resolved owner to the hosting root's first ordinal. -/
theorem ParallelScopeParentHistory.reservation_owner_bounds (program : Program)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program entry parent state)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    candidate.owner.processInstanceId = parent.processInstanceId ∧
      0 < candidate.owner.activation ∧ candidate.owner.activation ≤ 16 := by
  obtain ⟨_, _, _, parentOrdinal⟩ := history.root_identity program entry parent state
  have clean := (history.clean_and_foreign_marking program entry parent state).1
  obtain ⟨scope, member, identity⟩ := resolved_owner_member program state candidate operation resolved
  have root : scope = ⟨parent, none⟩ := by simpa [clean.1] using member
  have owned : candidate.owner = parent := identity.symm.trans (congrArg RuntimeScopeOccurrence.id root)
  simp [owned, parentOrdinal]

private theorem ancestry_definition_nonempty (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (fuel : Nat) (wellFormed : programWellFormed program = true)
    (ancestry : occurrenceOwnerRootValid program state fuel owner = true) :
    owner.definitionScopeId.value.isEmpty = false := by
  have named : program.definitionScopes.all (fun scope =>
      nonempty scope.id.value && nonempty scope.originElementId.value) = true := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    grind
  cases definitions : program.definitionScopes.filter (·.id == owner.definitionScopeId) with
  | nil => cases fuel <;> simp [occurrenceOwnerRootValid, definitions] at ancestry
  | cons definition rest =>
      cases rest with
      | nil =>
          have filtered : definition ∈ program.definitionScopes.filter (·.id == owner.definitionScopeId) := by
            rw [definitions]
            simp
          obtain ⟨member, selected⟩ := List.mem_filter.mp filtered
          have identity := eq_of_beq selected
          have nonemptyId := (Bool.and_eq_true_iff.mp (List.all_eq_true.mp named definition member)).1
          simpa only [nonempty, Bool.not_eq_true', identity] using nonemptyId
      | cons other rest => cases fuel <;> simp [occurrenceOwnerRootValid, definitions] at ancestry

/-- Admitted definition naming and actual pre-entry ancestry exclude empty resolved owner definition identifiers. -/
theorem ParallelScopeParentHistory.reservation_owner_definition_nonempty (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program analysis.entry parent state)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    candidate.owner.definitionScopeId.value.isEmpty = false :=
  ancestry_definition_nonempty program state candidate.owner (state.scopeOccurrences.length + 1)
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1
    (history.reservation_owner_root_valid program analysis parent state admitted candidate operation resolved)

namespace ParallelScopeReplay

/-- Actual entry and scope-removing lifetime history retain the hosting instance and the issued one-to-sixteen ordinal range. -/
theorem ContinuationCommandHistory.reservation_owner_bounds_post_entry
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (before issued current : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (records : List CommittedTransition)
    (following : ContinuationCommandHistory program owner issued current records)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program current candidate = some operation) :
    candidate.owner.processInstanceId = parent.processInstanceId ∧
      0 < candidate.owner.activation ∧ candidate.owner.activation ≤ 16 := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at admitted
    | true => rfl
  obtain ⟨_, _, _, parentOrdinal⟩ := parents.root_identity program analysis.entry parent before
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have retained := following.scopeOccurrences_sublist program owner selected issued current records
  obtain ⟨scope, member, identity⟩ := resolved_owner_member program current candidate operation resolved
  have bounds := enterParallelScope_clean_owner_bounds analysis.entry parent before issued clean parentOrdinal entered
    scope (retained.subset member)
  simpa only [identity] using bounds

/-- Admitted definition naming and actual lifetime ancestry exclude empty resolved owner definition identifiers. -/
theorem ContinuationCommandHistory.reservation_owner_definition_nonempty_post_entry
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (before issued current : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (records : List CommittedTransition)
    (following : ContinuationCommandHistory program owner issued current records)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program current candidate = some operation) :
    candidate.owner.definitionScopeId.value.isEmpty = false :=
  ancestry_definition_nonempty program current candidate.owner (current.scopeOccurrences.length + 1)
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1
    (following.reservation_owner_root_valid_post_entry program analysis admitted owner parent before issued current
      parents entered records candidate operation resolved)

end ParallelScopeReplay
end BpmnSemantics.SemanticProcess
