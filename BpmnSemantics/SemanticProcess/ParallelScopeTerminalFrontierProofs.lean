import BpmnSemantics.SemanticProcess.ParallelScopeParentFrontierProofs

/-! # Root completion in an actual parallel frontier

PMIS-SELECT-01 derives terminal exclusivity from the actual entry census and
lifetime scope sublist. Native root completion supplies quiescence and completed
initiation; admission identifies the sole parent completion. No empty-population
or successful-preparation premise substitutes for those execution facts.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem entered_scope_parents (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before issued : RuntimeState) (clean : ParallelScopeCleanEntry entry parent before)
    (entered : enterParallelScope? entry before parent = some issued) :
    ∀ scope ∈ issued.scopeOccurrences, scope = ⟨parent, none⟩ ∨ scope.parent = some parent := by
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
      · obtain ⟨iteration, _, same⟩ := List.mem_map.mp body
        subst scope
        exact Or.inr rfl
      · exact Or.inl (by simpa [clean.1] using root)

private theorem native_root_completion_facts (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (state after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind = .completeScope)
    (applied : applyInternalOperationOccurrence? program state candidate = some after) :
    ∃ root ∈ state.scopeOccurrences, root.id = candidate.owner ∧ root.parent = none ∧
      scopeQuiescent state root.id = true ∧ state.initiationPending = false := by
  obtain ⟨actual, record, actualResolved, _, _, metadata, replayed, _⟩ :=
    applyInternalOperationOccurrence_admitted_phases program analysis admitted state after candidate applied
  rw [resolved] at actualResolved
  cases Option.some.inj actualResolved
  have recordKind : record.operationKind = .completeScope := by
    simpa only [metadata] using kind
  obtain ⟨scopeId, output, root, member, unique, owner, completed⟩ :=
    replayed_scope_completion_execution program state after record recordKind replayed (ParallelScopeStart.analyzed_not_nested program analysis admitted)
  have allowed := analyzeProgram_operation_allowed program analysis admitted _ member
  have noOutput : output = none := by
    cases output <;> simp [SequentialScopeProgram.operationAllowed] at allowed ⊢
  subst output
  obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
  rw [completeSelectedScope?, unmonitored,
    completeBoundedScope_eq_completeScope_of_unbounded program state scopeId none unbounded] at completed
  have unique' : state.scopeOccurrences.filter
      (fun current => decide (current.id.definitionScopeId = scopeId)) = [root] := by
    simpa only [Bool.beq_eq_decide_eq] using unique
  obtain ⟨quiet, updated⟩ := completeScopeState_selected_update state after scopeId none root unique' completed
  have parentless : root.parent = none := by
    cases parentShape : root.parent with
    | none => rfl
    | some parentOwner =>
      cases control : state.control <;> simp only [parentShape, control] at updated <;> contradiction
  have pending : state.initiationPending = false := by
    rw [parentless] at updated
    cases control : state.control <;> simp only [control] at updated <;> try contradiction
    cases pending : state.initiationPending with
    | false => rfl
    | true => simp [pending] at updated
  have included : root ∈ state.scopeOccurrences.filter (·.id.definitionScopeId == scopeId) := by
    rw [unique]
    simp
  refine ⟨root, (List.mem_filter.mp included).1, ?_, parentless, quiet, pending⟩
  simpa only [metadata] using owner

private theorem resolved_owner_at_root (program : Program) (state : RuntimeState)
    (parent : ScopeOccurrenceId)
    (population : ∀ scope ∈ state.scopeOccurrences, scope = ⟨parent, none⟩)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    candidate.owner = parent := by
  have count : (state.scopeOccurrences.filter (fun scope => decide (scope.id = candidate.owner))).length = 1 :=
    of_decide_eq_true (resolved_exactLiveOccurrence program state candidate operation resolved)
  obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp count
  have included : scope ∈ state.scopeOccurrences.filter (fun scope => decide (scope.id = candidate.owner)) :=
    census.symm ▸ List.mem_singleton_self scope
  obtain ⟨member, selected⟩ := List.mem_filter.mp included
  have identity : scope.id = candidate.owner := of_decide_eq_true selected
  exact identity.symm.trans (congrArg RuntimeScopeOccurrence.id (population scope member))

private theorem root_quiescence_refuses_entry (entry : ParallelScopeEntry)
    (state after : RuntimeState) (parent : ScopeOccurrenceId)
    (quiet : scopeQuiescent state parent = true)
    (entered : enterParallelScope? entry state parent = some after) : False := by
  have unit : (state.tokens.filter fun token => token.placeId == entry.input && token.owner == parent).length = 1 := by
    unfold enterParallelScope? at entered
    split at entered <;> try contradiction
    rename_i valid
    simp only [Bool.or_eq_true, bne_iff_ne, not_or] at valid
    exact Classical.byContradiction valid.1.1.1.2
  have reordered : state.tokens.filter (fun token => token.owner == parent && token.placeId == entry.input) =
      state.tokens.filter (fun token => token.placeId == entry.input && token.owner == parent) := by
    simp only [Bool.and_comm]
  have positive : 0 < continuationMarking state parent entry.input := by
    simp only [continuationMarking, reordered, unit]
    omega
  have blocked := continuationMarking_positive_nonquiescent state parent entry.input positive
  rw [quiet] at blocked
  contradiction

private theorem root_only_native_completion (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (state after : RuntimeState)
    (parent : ScopeOccurrenceId) (frame : ParallelScopeStructuralFrame parent state)
    (population : ∀ scope ∈ state.scopeOccurrences, scope = ⟨parent, none⟩)
    (quiet : scopeQuiescent state parent = true) (pending : state.initiationPending = false)
    (candidate : InternalOperationOccurrence)
    (applied : applyInternalOperationOccurrence? program state candidate = some after) :
    ∃ operation, resolveInternalOperationOccurrence? program state candidate = some operation ∧
      operation ∈ program.operations ∧ operation.id = candidate.operationId ∧
      candidate.owner = parent ∧ operation.kind = .completeScope := by
  obtain ⟨operation, record, resolved, member, identity, metadata, replayed, phases⟩ :=
    applyInternalOperationOccurrence_admitted_phases program analysis admitted state after candidate applied
  have owned := resolved_owner_at_root program state parent population candidate operation resolved
  have recordOwned : record.owner = parent := by simpa only [metadata] using owned
  refine ⟨operation, resolved, member, identity, owned, ?_⟩
  rcases phases with ⟨_, output, _, _, _, _, _, initiated⟩ | ⟨_, entered⟩ | kinds | ⟨kind, _⟩
  · simp [initiateState?, pending] at initiated
  · rw [recordOwned] at entered
    exact False.elim (root_quiescence_refuses_entry analysis.entry state after parent quiet entered)
  · rcases kinds with ordinary | retirement
    · have operationKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] := by
        simpa only [metadata] using ordinary
      obtain ⟨⟨input, consumed⟩, positive⟩ :=
        body_step_inputs_positive program state after candidate operation resolved operationKind applied
      have credit : 0 < continuationMarking state parent input := by
        simpa only [owned] using positive input consumed
      have blocked := continuationMarking_positive_nonquiescent state parent input credit
      rw [quiet] at blocked
      contradiction
    · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program state after record retirement replayed
      rw [recordOwned] at completed
      unfold completeParallelScope? at completed
      obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp completed
      obtain ⟨iteration, included, same⟩ := parallelScopeBinding_member entry state parent binding bound
      have childParent := parallelScopeBinding_body_parent entry state parent binding bound iteration included
      rw [same] at childParent
      have rootParent : occurrenceParent? state.scopeOccurrences parent = none := by
        unfold occurrenceParent?
        rw [← List.head?_filter, frame.root]
        rfl
      rw [rootParent] at childParent
      contradiction
  · simpa only [metadata] using kind

private theorem parent_completions_eq (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (root : DefinitionScope)
    (selectedRoot : rootDefinitionScope? program = some root)
    (state : RuntimeState) (parent : ScopeOccurrenceId) (parentDefinition : parent.definitionScopeId = root.id)
    (left right : InternalOperationOccurrence) (leftOperation rightOperation : SemanticOperation)
    (leftResolved : resolveInternalOperationOccurrence? program state left = some leftOperation)
    (rightResolved : resolveInternalOperationOccurrence? program state right = some rightOperation)
    (leftOwned : left.owner = parent) (rightOwned : right.owner = parent)
    (leftKind : leftOperation.kind = .completeScope) (rightKind : rightOperation.kind = .completeScope) :
    leftOperation = rightOperation := by
  obtain ⟨admittedRoot, operations, _, _, completion, _, _, roots, parentEq, _, _, completions, _⟩ :=
    analyzeProgram_parent_spine program analysis admitted
  have rootEq : root = admittedRoot := by
    unfold rootDefinitionScope? at selectedRoot
    split at selectedRoot <;> try contradiction
    rename_i scopes chosen census
    have sameRoot : chosen = root := Option.some.inj selectedRoot
    subst chosen
    have included : root ∈ program.definitionScopes.filter (fun scope =>
        scope.parentScopeId.isNone && decide (scope.originElementId.value = program.processId.value)) := by
      rw [census]
      simp
    obtain ⟨member, checks⟩ := List.mem_filter.mp included
    have rootMember : root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
      List.mem_filter.mpr ⟨member, (Bool.and_eq_true_iff.mp checks).1⟩
    simpa [roots] using rootMember
  have completionEq (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
      (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
      (owned : candidate.owner = parent) (kind : operation.kind = .completeScope) : operation = completion := by
    have declaration := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
    have ownership := resolved_definition_owner program state candidate operation resolved
    rw [owned, parentDefinition, rootEq] at ownership
    have population : operation ∈ operations :=
      parentEq.symm ▸ operation_owner_population program operation admittedRoot.id declaration ownership
    have included : operation ∈ [completion] := by
      rw [← completions]
      apply List.mem_filter.mpr
      refine ⟨population, ?_⟩
      cases operation <;> simp [SemanticOperation.kind] at kind ⊢
    exact List.mem_singleton.mp included
  exact (completionEq left leftOperation leftResolved leftOwned leftKind).trans
    (completionEq right rightOperation rightResolved rightOwned rightKind).symm

/-- A reachable running frontier containing actual root completion contains at most that one occurrence. -/
theorem ParallelScopeInternalPrefixReachable.root_completion_frontier_length_le_one (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (terminal : InternalOperationOccurrence × RuntimeState) (present : terminal ∈ pairs)
    (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state terminal.1 = some operation)
    (kind : operation.kind = .completeScope) : pairs.length ≤ 1 := by
  by_cases single : pairs.length ≤ 1
  · exact single
  have multiple : 2 ≤ pairs.length := by omega
  obtain ⟨seed, histories⟩ := reachable.multiple_frontier_post_entry program analysis admitted state instanceId
    running pairs discovered multiple
  let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  obtain ⟨before, issued, records, parents, entered, history⟩ := histories observer rfl
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  have clean := (parents.clean_and_foreign_marking program analysis.entry seed.parent before).1
  have initialFrame := enterParallelScope_structural_parallel_frame analysis.entry seed.parent before issued clean
    (parents.structural_frame program analysis.entry seed.parent before) entered
  have frame := history.structural_frame program observer seed.parent selected issued state records initialFrame
  have retained := history.scopeOccurrences_sublist program observer selected issued state records
  have ancestry (scope : RuntimeScopeOccurrence) (member : scope ∈ state.scopeOccurrences) :
      scope = ⟨seed.parent, none⟩ ∨ scope.parent = some seed.parent :=
    entered_scope_parents analysis.entry seed.parent before issued clean entered scope (retained.subset member)
  have terminalApplied := deriveInternalOccurrenceFrontier_member_applied program state pairs discovered terminal present
  obtain ⟨root, member, _, parentless, rootQuiet, pending⟩ :=
    native_root_completion_facts program analysis admitted state terminal.2 terminal.1 operation resolved kind terminalApplied
  have rootEq : root = ⟨seed.parent, none⟩ := by
    rcases ancestry root member with same | child
    · exact same
    · rw [parentless] at child
      contradiction
  have quiet : scopeQuiescent state seed.parent = true := by simpa only [rootEq] using rootQuiet
  have population : ∀ scope ∈ state.scopeOccurrences, scope = ⟨seed.parent, none⟩ := by
    intro scope included
    rcases ancestry scope included with same | child
    · exact same
    · exact False.elim (quiescent_scope_has_no_child state seed.parent quiet scope included child)
  have equal (left right : InternalOperationOccurrence × RuntimeState)
      (leftMember : left ∈ pairs) (rightMember : right ∈ pairs) : left.1 = right.1 := by
    have leftApplied := deriveInternalOccurrenceFrontier_member_applied program state pairs discovered left leftMember
    have rightApplied := deriveInternalOccurrenceFrontier_member_applied program state pairs discovered right rightMember
    obtain ⟨leftOperation, leftResolved, _, leftIdentity, leftOwned, leftKind⟩ :=
      root_only_native_completion program analysis admitted state left.2 seed.parent frame population quiet pending left.1 leftApplied
    obtain ⟨rightOperation, rightResolved, _, rightIdentity, rightOwned, rightKind⟩ :=
      root_only_native_completion program analysis admitted state right.2 seed.parent frame population quiet pending right.1 rightApplied
    have same := parent_completions_eq program analysis admitted seed.root seed.rootSelected state seed.parent rfl
      left.1 right.1 leftOperation rightOperation leftResolved rightResolved leftOwned rightOwned leftKind rightKind
    have identities : left.1.operationId = right.1.operationId :=
      leftIdentity.symm.trans ((congrArg SemanticOperation.id same).trans rightIdentity)
    have owners : left.1.owner = right.1.owner := leftOwned.trans rightOwned.symm
    cases left with
    | mk leftCandidate leftAfter =>
      cases right with
      | mk rightCandidate rightAfter =>
        cases leftCandidate
        cases rightCandidate
        cases identities
        cases owners
        rfl
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have declarations := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have ordered := deriveInternalOccurrenceFrontier_ordered program state pairs declarations discovered
  cases pairs with
  | nil => simp at multiple
  | cons first rest =>
    cases rest with
    | nil => simp at multiple
    | cons second tail =>
      have same := equal first second (by simp) (by simp)
      have before : internalAlternativeBefore (.operationOccurrence first.1.operationId first.1.owner)
          (.operationOccurrence second.1.operationId second.1.owner) = true :=
        (List.pairwise_cons.mp ordered).1 _ (by simp)
      rw [same] at before
      exact False.elim (Bool.noConfusion ((internalAlternativeBefore_asymm _ _ before).symm.trans before))

end BpmnSemantics.SemanticProcess
