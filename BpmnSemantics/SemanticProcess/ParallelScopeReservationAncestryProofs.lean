module

public import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability
public import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Actual parallel reservation ancestry

PMIS-ENTER-01 issues direct children of the Start root. Actual lifetime history
retains a sublist of that census and preserves the root, so resolution's exact
live occurrence is enough to establish reservation's bounded ancestry check.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

private theorem definition_scope_census (program : Program) (scope : DefinitionScope)
    (wellFormed : programWellFormed program = true) (member : scope ∈ program.definitionScopes) :
    program.definitionScopes.filter (·.id == scope.id) = [scope] := by
  have sorted : strictlySortedStrings (program.definitionScopes.map (·.id.value)) = true := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    grind
  have valuesUnique := strictlySortedStrings_nodup _ sorted
  have idsUnique : (program.definitionScopes.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) DefinitionScopeId.value
      (fun _ _ different same => different (congrArg DefinitionScopeId.value same))
    rw [List.map_map]
    exact valuesUnique
  simpa only [Bool.beq_eq_decide_eq] using
    filter_key_eq_singleton_of_nodup program.definitionScopes (·.id) scope idsUnique member

private theorem selected_root_census (program : Program) (root : DefinitionScope)
    (wellFormed : programWellFormed program = true)
    (selected : rootDefinitionScope? program = some root) :
    program.definitionScopes.filter (·.id == root.id) = [root] ∧
      root.parentScopeId = none ∧ root.originElementId.value = program.processId.value := by
  unfold rootDefinitionScope? at selected
  split at selected <;> try contradiction
  rename_i scopes chosen census
  have same : chosen = root := Option.some.inj selected
  subst chosen
  have present : root ∈ program.definitionScopes.filter (fun scope =>
      scope.parentScopeId.isNone && decide (scope.originElementId.value = program.processId.value)) := by
    rw [census]
    simp
  obtain ⟨member, checks⟩ := List.mem_filter.mp present
  refine ⟨definition_scope_census program root wellFormed member, ?_⟩
  simpa using checks

private theorem admitted_child_census (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) (root : DefinitionScope)
    (selected : rootDefinitionScope? program = some root) :
    ∃ child, program.definitionScopes.filter (·.id == analysis.entry.childScopeId) = [child] ∧
      child.parentScopeId = some root.id := by
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1
  obtain ⟨rootCensus, rootParent, _⟩ := selected_root_census program root wellFormed selected
  have rootMember : root ∈ program.definitionScopes :=
    (List.mem_filter.mp (rootCensus.symm ▸ (show root ∈ [root] from by simp))).1
  obtain ⟨_, _, _, _, _, _, _, admittedEntries, _⟩ :=
    ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
  unfold ParallelScopeStart.analyzeProgram at admitted
  split at admitted
  · contradiction
  · split at admitted
    · rename_i entries entry entryEq
      split at admitted
      · rename_i roots staticRoot rootsEq
        split at admitted
        · rename_i children child childEq
          split at admitted
          · split at admitted
            · contradiction
            · rename_i link
              have sameRoot : root = staticRoot := by
                have present : root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
                  List.mem_filter.mpr ⟨rootMember, by simp [rootParent]⟩
                simpa [rootsEq] using present
              have parentEq : child.parentScopeId = some staticRoot.id := by
                simp only [Bool.or_eq_true, bne_iff_ne, not_or] at link
                exact Classical.byContradiction link.2
              have entryIdentity : entry = analysis.entry := by
                simpa using entryEq.symm.trans admittedEntries
              exact ⟨child, by simpa [entryIdentity] using childEq, by simpa [sameRoot] using parentEq⟩
          · contradiction
        · contradiction
      · contradiction
    · contradiction

/-- The admitted repeated scope has a parent; the selected root does not, so their
identities cannot coincide in the well-formed definition census. -/
theorem ParallelScopeStart.analyzeProgram_child_root_distinct (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (root : DefinitionScope) (selected : rootDefinitionScope? program = some root) :
    analysis.entry.childScopeId ≠ root.id := by
  obtain ⟨rootCensus, parentless, _⟩ := selected_root_census program root
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1 selected
  obtain ⟨child, childCensus, parent⟩ := admitted_child_census program analysis admitted root selected
  intro same
  rw [same, rootCensus] at childCensus
  have equal : root = child := by simpa using childCensus
  subst child
  rw [parentless] at parent
  contradiction

private theorem resolved_scope_census (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    ∃ scope, state.scopeOccurrences.filter (·.id == candidate.owner) = [scope] ∧ scope.id = candidate.owner := by
  have live := resolved_exactLiveOccurrence program state candidate operation resolved
  have count : (state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = candidate.owner))).length = 1 :=
    of_decide_eq_true live
  obtain ⟨scope, selected⟩ := List.length_eq_one_iff.mp count
  have selectedMember : scope ∈ state.scopeOccurrences.filter
      (fun occurrence => decide (occurrence.id = candidate.owner)) :=
    selected.symm ▸ (show scope ∈ [scope] from by simp)
  have selectedId : decide (scope.id = candidate.owner) = true := (List.mem_filter.mp selectedMember).2
  have same : scope.id = candidate.owner := of_decide_eq_true selectedId
  exact ⟨scope, by simpa only [Bool.beq_eq_decide_eq] using selected, same⟩

/-- Exact parentless runtime and definition censuses establish root ancestry at every positive fuel. -/
theorem occurrenceOwnerRootValid_root_census (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (root : DefinitionScope) (fuel : Nat)
    (runtime : state.scopeOccurrences.filter (·.id == owner) = [⟨owner, none⟩])
    (definition : program.definitionScopes.filter (·.id == owner.definitionScopeId) = [root])
    (parentless : root.parentScopeId = none)
    (origin : root.originElementId.value = program.processId.value) :
    occurrenceOwnerRootValid program state (fuel + 1) owner = true := by
  simp [occurrenceOwnerRootValid, runtime, definition, parentless, origin]

/-- A direct child agrees with the admitted definition edge and reaches the retained root in two checks. -/
theorem occurrenceOwnerRootValid_direct_child_census (program : Program) (state : RuntimeState)
    (owner parent : ScopeOccurrenceId) (root child : DefinitionScope) (fuel : Nat)
    (runtimeRoot : state.scopeOccurrences.filter (·.id == parent) = [⟨parent, none⟩])
    (definitionRoot : program.definitionScopes.filter (·.id == parent.definitionScopeId) = [root])
    (rootParentless : root.parentScopeId = none)
    (origin : root.originElementId.value = program.processId.value)
    (runtimeChild : state.scopeOccurrences.filter (·.id == owner) = [⟨owner, some parent⟩])
    (definitionChild : program.definitionScopes.filter (·.id == owner.definitionScopeId) = [child])
    (childParent : child.parentScopeId = some parent.definitionScopeId)
    (instanceEq : parent.processInstanceId = owner.processInstanceId) :
    occurrenceOwnerRootValid program state (fuel + 2) owner = true := by
  simp [occurrenceOwnerRootValid, runtimeChild, definitionChild, childParent, instanceEq,
    runtimeRoot, definitionRoot, rootParentless, origin]

/-- Actual Start fixes the parent's selected root definition and first scope ordinal throughout pre-entry execution. -/
theorem ParallelScopeParentHistory.root_identity (program : Program) (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program entry parent state) :
    ∃ root, rootDefinitionScope? program = some root ∧
      parent.definitionScopeId = root.id ∧ parent.activation = 1 := by
  induction history with
  | start instanceId root values state selected started owner distinct =>
      exact ⟨root, selected, by simp [owner], by simp [owner]⟩
  | initiate _ _ _ _ ih => exact ih
  | body _ _ _ _ _ _ ih => exact ih
  | human _ _ _ _ _ _ _ ih => exact ih
  | service _ _ _ _ _ _ _ ih => exact ih

/-- Actual pre-entry history proves reservation ancestry for every resolved candidate without a preparation premise. -/
theorem ParallelScopeParentHistory.reservation_owner_root_valid (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (history : ParallelScopeParentHistory program analysis.entry parent state)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    occurrenceOwnerRootValid program state (state.scopeOccurrences.length + 1) candidate.owner = true := by
  obtain ⟨root, selected, identity, _⟩ := history.root_identity program analysis.entry parent state
  obtain ⟨definition, parentless, origin⟩ := selected_root_census program root
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1 selected
  have clean := (history.clean_and_foreign_marking program analysis.entry parent state).1
  obtain ⟨scope, census, same⟩ := resolved_scope_census program state candidate operation resolved
  have present : scope ∈ state.scopeOccurrences :=
    (List.mem_filter.mp (census.symm ▸ (show scope ∈ [scope] from by simp))).1
  have owned : candidate.owner = parent := by
    have equal : scope = ⟨parent, none⟩ := by simpa [clean.1] using present
    exact same.symm.trans (congrArg RuntimeScopeOccurrence.id equal)
  rw [owned]
  apply occurrenceOwnerRootValid_root_census program state parent root state.scopeOccurrences.length
  · simp [clean.1]
  · simpa [identity] using definition
  · exact parentless
  · exact origin

private theorem enter_clean_scope_parents (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before issued : RuntimeState) (clean : ParallelScopeCleanEntry entry parent before)
    (entered : enterParallelScope? entry before parent = some issued) :
    ∀ scope ∈ issued.scopeOccurrences, scope = ⟨parent, none⟩ ∨
      scope.parent = some parent ∧ scope.id.processInstanceId = parent.processInstanceId ∧
        scope.id.definitionScopeId = entry.childScopeId := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    intro scope member
    exact Or.inl (by simpa [clean.1] using member)
  · obtain ⟨⟨generated, iterations⟩, issuedBodies, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at entered
    | cons first rest =>
      cases Option.some.inj entered
      intro scope member
      have population := issueParallelBodies_scope_population issuedBodies
      rcases List.mem_append.mp (population.mem_iff.mp member) with body | root
      · obtain ⟨iteration, iterationMember, same⟩ := List.mem_map.mp body
        subst scope
        exact Or.inr ⟨rfl, issueParallelBodies_scope_domain issuedBodies iteration iterationMember⟩
      · exact Or.inl (by simpa [clean.1] using root)

namespace ParallelScopeReplay

/-- Actual entry and lifetime history establish the root or direct-child ancestry of every resolved surviving candidate. -/
theorem ContinuationCommandHistory.reservation_owner_root_valid_post_entry
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (before issued current : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (entered : enterParallelScope? analysis.entry before parent = some issued)
    (records : List CommittedTransition)
    (following : ContinuationCommandHistory program owner issued current records)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program current candidate = some operation) :
    occurrenceOwnerRootValid program current (current.scopeOccurrences.length + 1) candidate.owner = true := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at admitted
    | true => rfl
  obtain ⟨root, rootSelected, rootIdentity, _⟩ := parents.root_identity program analysis.entry parent before
  obtain ⟨rootDefinition, rootParentless, origin⟩ := selected_root_census program root
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1 rootSelected
  have rootDefinition : program.definitionScopes.filter (·.id == parent.definitionScopeId) = [root] := by
    simpa [rootIdentity] using rootDefinition
  obtain ⟨child, childDefinition, childParent⟩ := admitted_child_census program analysis admitted root rootSelected
  have clean := (parents.clean_and_foreign_marking program analysis.entry parent before).1
  have issuedFrame := enterParallelScope_structural_parallel_frame analysis.entry parent before issued clean
    (parents.structural_frame program analysis.entry parent before) entered
  have frame := following.structural_frame program owner parent selected issued current records issuedFrame
  have runtimeRoot : current.scopeOccurrences.filter (·.id == parent) = [⟨parent, none⟩] := by
    simpa only [Bool.beq_eq_decide_eq] using frame.root
  have retained := following.scopeOccurrences_sublist program owner selected issued current records
  obtain ⟨scope, runtimeOwner, identity⟩ := resolved_scope_census program current candidate operation resolved
  have member : scope ∈ current.scopeOccurrences :=
    (List.mem_filter.mp (runtimeOwner.symm ▸ (show scope ∈ [scope] from by simp))).1
  have provenance := enter_clean_scope_parents analysis.entry parent before issued clean entered scope (retained.subset member)
  rcases provenance with rootScope | ⟨scopeParent, instanceEq, definition⟩
  · have owned : candidate.owner = parent := identity.symm.trans (congrArg RuntimeScopeOccurrence.id rootScope)
    rw [owned]
    exact occurrenceOwnerRootValid_root_census program current parent root current.scopeOccurrences.length
      runtimeRoot rootDefinition rootParentless origin
  · have scopeEq : scope = ⟨candidate.owner, some parent⟩ := by
      cases scope
      simp_all
    have filteredRoot : (⟨parent, none⟩ : RuntimeScopeOccurrence) ∈
        current.scopeOccurrences.filter (·.id == parent) := by
      rw [runtimeRoot]
      simp
    have rootPresent : (⟨parent, none⟩ : RuntimeScopeOccurrence) ∈ current.scopeOccurrences :=
      (List.mem_filter.mp filteredRoot).1
    cases count : current.scopeOccurrences.length with
    | zero =>
        have empty := List.length_eq_zero_iff.mp count
        simp [empty] at rootPresent
    | succ fuel =>
        apply occurrenceOwnerRootValid_direct_child_census program current candidate.owner parent root child fuel
          runtimeRoot rootDefinition rootParentless origin
        · simpa [scopeEq] using runtimeOwner
        · simpa [← identity, definition] using childDefinition
        · simpa [rootIdentity] using childParent
        · simpa [identity] using instanceEq.symm

end ParallelScopeReplay
end BpmnSemantics.SemanticProcess
