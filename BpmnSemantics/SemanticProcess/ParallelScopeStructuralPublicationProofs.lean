module

public import BpmnSemantics.SemanticProcess.ParallelScopeDiscoveryProofs
public import BpmnSemantics.SemanticProcess.ScopeCreationLifecycleStructuralValidity
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws

/-! Actual Start and PMIS entry determine the complete structural owner census.
Lifetime scope removal retains those Program bindings, so structural publication
validity follows without assuming a successful occurrence projection. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem definition_census (program : Program) (scope : DefinitionScope)
    (wellFormed : programWellFormed program = true) (member : scope ∈ program.definitionScopes) :
    program.definitionScopes.filter (fun candidate => decide (candidate.id = scope.id)) = [scope] ∧
      scope.id.value.isEmpty = false := by
  have sorted : strictlySortedStrings (program.definitionScopes.map (·.id.value)) = true := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    grind
  have valuesUnique := strictlySortedStrings_nodup _ sorted
  have idsUnique : (program.definitionScopes.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) DefinitionScopeId.value
      (fun _ _ different same => different (congrArg DefinitionScopeId.value same))
    rw [List.map_map]
    exact valuesUnique
  have named : program.definitionScopes.all (fun scope =>
      nonempty scope.id.value && nonempty scope.originElementId.value) = true := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    grind
  refine ⟨filter_key_eq_singleton_of_nodup _ (·.id) scope idsUnique member, ?_⟩
  simpa only [nonempty, Bool.not_eq_true'] using
    (Bool.and_eq_true_iff.mp (List.all_eq_true.mp named scope member)).1

theorem root_census (program : Program) (root : DefinitionScope)
    (wellFormed : programWellFormed program = true)
    (selected : rootDefinitionScope? program = some root) :
    program.definitionScopes.filter (fun scope => decide (scope.id = root.id)) = [root] ∧
      root.parentScopeId = none ∧ root.originElementId.value = program.processId.value ∧
        root.id.value.isEmpty = false := by
  unfold rootDefinitionScope? at selected
  split at selected <;> try contradiction
  rename_i scopes chosen census
  cases Option.some.inj selected
  have present : root ∈ program.definitionScopes.filter (fun scope =>
      scope.parentScopeId.isNone && decide (scope.originElementId.value = program.processId.value)) := by
    rw [census]
    simp
  obtain ⟨member, checks⟩ := List.mem_filter.mp present
  obtain ⟨definition, named⟩ := definition_census program root wellFormed member
  simp only [Bool.and_eq_true, Option.isNone_iff_eq_none, decide_eq_true_eq] at checks
  exact ⟨definition, checks.1, checks.2, named⟩

private theorem parallel_entry_binding (program : Program) (occurrence : RuntimeScopeOccurrence)
    (definition : DefinitionScope) (parent : ScopeOccurrenceId) (parented : occurrence.parent = some parent)
    (id : OperationId) (origin : BpmnElementOrigin) (input childEntry : ControlPlaceId)
    (childScope : DefinitionScopeId) (output : ControlPlaceId) (collection item : String)
    (mappings : List VariableMapping) (condition : Option String)
    (member : .enterParallelMultiInstanceScope id origin input childEntry childScope output collection item mappings condition ∈ program.operations)
    (owned : FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program
      (.enterParallelMultiInstanceScope id origin input childEntry childScope output collection item mappings condition) parent = true)
    (scopeEq : childScope = occurrence.id.definitionScopeId)
    (originEq : origin.elementId = definition.originElementId)
    (census : (program.operations.filter fun operation =>
      decide (enteredChildScopeId? operation = some childScope)).length = 1) :
    EntryBinding program occurrence definition = true := by
  obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp census
  have selected : .enterParallelMultiInstanceScope id origin input childEntry childScope output collection item mappings condition ∈
      program.operations.filter (fun operation => decide (enteredChildScopeId? operation = some childScope)) :=
    List.mem_filter.mpr ⟨member, by simp [enteredChildScopeId?]⟩
  rw [singleton] at selected
  rw [← List.mem_singleton.mp selected] at singleton
  unfold EntryBinding scopeOperationBindingValid
  rw [parented]
  apply decide_eq_true
  suffices narrowed : (program.operations.filter _) =
      [.enterParallelMultiInstanceScope id origin input childEntry childScope output collection item mappings condition] by
    rw [narrowed]
    rfl
  apply filter_singleton_of_subpredicate program.operations _ _ _ singleton
  · intro candidate _ accepted
    split at accepted <;> try contradiction
    cases candidate <;> simp only at accepted <;> try contradiction
    all_goals apply decide_eq_true
    all_goals simp only [enteredChildScopeId?, Bool.and_eq_true, decide_eq_true_eq] at accepted ⊢
    all_goals exact congrArg some (accepted.1.trans scopeEq.symm)
  · simp only [owned, Bool.not_true, Bool.false_eq_true, ↓reduceIte]
    simp [scopeEq, originEq]

theorem admitted_child_census (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (root : DefinitionScope)
    (selected : rootDefinitionScope? program = some root) :
    ∃ child, program.definitionScopes.filter (fun scope => decide (scope.id = analysis.entry.childScopeId)) = [child] ∧
      child.parentScopeId = some root.id ∧ child.id = analysis.entry.childScopeId ∧
      child.originElementId = analysis.entry.elementId ∧
      child.id.value.isEmpty = false ∧
      ∀ (occurrence : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId),
        occurrence.parent = some parent → parent.definitionScopeId = root.id →
        occurrence.id.definitionScopeId = analysis.entry.childScopeId → EntryBinding program occurrence child = true := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  obtain ⟨rootDefinition, rootParent, _, _⟩ := root_census program root wellFormed selected
  have rootMember : root ∈ program.definitionScopes :=
    (List.mem_filter.mp (rootDefinition.symm ▸ List.mem_singleton_self root)).1
  obtain ⟨_, _, _, _, _, _, _, admittedEntries, _⟩ := analyzeProgram_body_certificate program analysis admitted
  have analysisEq := admitted
  unfold analyzeProgram at analysisEq
  split at analysisEq <;> try contradiction
  rename_i gate
  split at analysisEq <;> try contradiction
  rename_i entries entry entryEq
  split at analysisEq <;> try contradiction
  rename_i roots staticRoot rootsEq
  split at analysisEq <;> try contradiction
  rename_i children child childEq
  split at analysisEq <;> try contradiction
  rename_i owners entryOwner ownerEq
  split at analysisEq <;> try contradiction
  rename_i link
  have rootIdentity : root = staticRoot := by
    have present : root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
      List.mem_filter.mpr ⟨rootMember, by simp [rootParent]⟩
    simpa [rootsEq] using present
  have entryIdentity : entry = analysis.entry := by simpa using entryEq.symm.trans admittedEntries
  subst entry
  have link : entryOwner.scopeId = root.id ∧ child.parentScopeId = some root.id := by
    simp only [Bool.or_eq_true, bne_iff_ne, not_or, ← rootIdentity] at link
    exact ⟨Classical.byContradiction link.1, Classical.byContradiction link.2⟩
  have noSnapshots : program.compensationEventSubProcessSnapshots = none := by
    cases snapshots : program.compensationEventSubProcessSnapshots with
    | none => rfl
    | some snapshot => simp [snapshots] at gate
  have childSelected : child ∈ program.definitionScopes.filter (·.id == analysis.entry.childScopeId) := by
    rw [childEq]
    simp
  obtain ⟨childMember, childKey⟩ := List.mem_filter.mp childSelected
  have childKey : child.id = analysis.entry.childScopeId := eq_of_beq childKey
  obtain ⟨childDefinition, childNamed⟩ := definition_census program child wellFormed childMember
  have ownerCensus : program.operationScopes.filter
      (fun binding => decide (binding.operationId = analysis.entry.id)) = [entryOwner] := by
    simpa only [Bool.beq_eq_decide_eq] using ownerEq
  have entryMember : analysis.entry ∈ program.operations.filterMap parallelScopeEntry? := by rw [admittedEntries]; simp
  obtain ⟨operation, operationMember, decoded⟩ := List.mem_filterMap.mp entryMember
  obtain ⟨_, _, _, ownership⟩ := programGraphWellFormed_scopeContract program (programWellFormed_graph program wellFormed)
  simp only [scopedOwnershipComplete, Bool.and_eq_true] at ownership
  have respects := List.all_eq_true.mp ownership.2 operation operationMember
  cases operation <;> simp only [parallelScopeEntry?] at decoded <;> try contradiction
  rename_i id origin input childEntry childScope output collection item mappings condition
  have decoded := Option.some.inj decoded
  have idEq : id = analysis.entry.id := congrArg ParallelScopeEntry.id decoded
  have scopeEq : childScope = analysis.entry.childScopeId := congrArg ParallelScopeEntry.childScopeId decoded
  have originEq : origin.elementId = analysis.entry.elementId := congrArg ParallelScopeEntry.elementId decoded
  unfold operationRespectsScopes at respects
  change (match (program.operationScopes.find? (fun binding => decide (binding.operationId = id))).map (·.scopeId) with
    | none => false
    | some owner => _ ) = true at respects
  have ownerFound : program.operationScopes.find? (fun binding => decide (binding.operationId = id)) = some entryOwner := by
    rw [← List.head?_filter, idEq, ownerCensus]
    rfl
  rw [ownerFound] at respects
  simp only [Option.map_some, Bool.and_eq_true] at respects
  have definitionFact := respects.2
  change (program.definitionScopes.find? (fun scope => decide (scope.id = childScope))).any
    (fun scope => scope.parentScopeId == some entryOwner.scopeId && scope.originElementId == origin.elementId) = true at definitionFact
  have childFound : program.definitionScopes.find? (fun scope => decide (scope.id = childScope)) = some child := by
    rw [← List.head?_filter, scopeEq, ← childKey, childDefinition]
    rfl
  rw [childFound] at definitionFact
  simp only [Option.any_some, Bool.and_eq_true, beq_iff_eq] at definitionFact
  refine ⟨child, by simpa only [← childKey] using childDefinition, link.2, childKey,
    definitionFact.2.trans originEq, childNamed, ?_⟩
  intro occurrence parent parented parentKey occurrenceKey
  have owned : FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program
      (.enterParallelMultiInstanceScope id origin input childEntry childScope output collection item mappings condition) parent = true := by
    simp [FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy, SemanticOperation.id, idEq,
      ownerCensus, link.1, parentKey]
  have census := child_entry_census program child root.id wellFormed noSnapshots childMember link.2
    ⟨_, operationMember, by simp [enteredChildScopeId?, scopeEq, childKey]⟩
  exact parallel_entry_binding program occurrence child parent parented id origin input childEntry childScope output collection item
    mappings condition operationMember owned (scopeEq.trans occurrenceKey.symm) definitionFact.2.symm
    (by simpa only [scopeEq, childKey] using census)

/-- PMIS-ADMIT-01 fixes the entry operation at the selected parent definition, even after its input token has disappeared. -/
theorem admitted_entry_owner_census (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (root : DefinitionScope)
    (selected : rootDefinitionScope? program = some root) :
    program.operationScopes.filter (fun binding => decide (binding.operationId = analysis.entry.id)) =
      [{ operationId := analysis.entry.id, scopeId := root.id }] := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  obtain ⟨rootCensus, rootParent, _, _⟩ := root_census program root wellFormed selected
  have rootMember := (List.mem_filter.mp (rootCensus.symm ▸ List.mem_singleton_self root)).1
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
  have admittedCopy := admitted
  unfold analyzeProgram at admittedCopy
  split at admittedCopy <;> try contradiction
  split at admittedCopy <;> try contradiction
  rename_i entriesFound entry entriesEq
  split at admittedCopy <;> try contradiction
  rename_i roots staticRoot rootsEq
  split at admittedCopy <;> try contradiction
  split at admittedCopy <;> try contradiction
  rename_i owners entryOwner ownerEq
  split at admittedCopy <;> try contradiction
  rename_i link
  have rootIdentity : root = staticRoot := by
    have member : root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
      List.mem_filter.mpr ⟨rootMember, by simp [rootParent]⟩
    simpa only [rootsEq, List.mem_singleton] using member
  have entryIdentity : entry = analysis.entry := by simpa using entriesEq.symm.trans entries
  subst entry
  have scope : entryOwner.scopeId = root.id := by
    simp only [Bool.or_eq_true, bne_iff_ne, not_or, ← rootIdentity] at link
    exact Classical.byContradiction link.1
  have key : entryOwner.operationId = analysis.entry.id := by
    have member := List.mem_filter.mp (ownerEq.symm ▸ List.mem_singleton_self entryOwner)
    exact eq_of_beq member.2
  have same : entryOwner = { operationId := analysis.entry.id, scopeId := root.id } := by
    cases entryOwner; simp_all only
  simpa only [Bool.beq_eq_decide_eq, same] using ownerEq

/-- PMIS-ADMIT-01's complete source census distinguishes the two admitted scope
origins, independently of whether the child population is empty. -/
theorem admitted_definition_origins_unique (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (root : DefinitionScope)
    (selected : rootDefinitionScope? program = some root) :
    (program.definitionScopes.map (·.originElementId)).Nodup := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  obtain ⟨rootDefinition, rootParent, rootOrigin, _⟩ := root_census program root wellFormed selected
  obtain ⟨child, childDefinition, childParent, _, childOrigin, _, _⟩ :=
    admitted_child_census program analysis admitted root selected
  have rootMember : root ∈ program.definitionScopes :=
    (List.mem_filter.mp (rootDefinition.symm ▸ List.mem_singleton_self root)).1
  have childMember : child ∈ program.definitionScopes :=
    (List.mem_filter.mp (childDefinition.symm ▸ List.mem_singleton_self child)).1
  have lengthScopes : program.definitionScopes.length = 2 := by
    have checked := admitted
    unfold analyzeProgram at checked
    split at checked <;> try contradiction
    rename_i gate
    apply Classical.byContradiction
    intro different
    simp [different] at gate
  have entries := (analyzeProgram_body_certificate program analysis admitted)
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := entries
  have declared : analysis.entry ∈ program.operations.filterMap parallelScopeEntry? := by
    rw [entries]
    simp
  obtain ⟨operation, operationMember, parsed⟩ := List.mem_filterMap.mp declared
  have entrySource : analysis.entry.elementId.value ∈ program.operations.filterMap
      (fun operation => match operation with
        | .enterParallelMultiInstanceScope _ origin .. => some origin.elementId.value
        | _ => SequentialScopeProgram.sourceNode? operation) := by
    cases operation <;> simp only [parallelScopeEntry?] at parsed <;> try contradiction
    rename_i id origin input entry scope output collection item mappings condition
    have origin := congrArg ParallelScopeEntry.elementId (Option.some.inj parsed)
    exact List.mem_filterMap.mpr ⟨_, operationMember, by simp only [← origin]⟩
  have sources := analyzeProgram_source_origins_unique program analysis admitted
  have separate : child.originElementId ≠ root.originElementId := by
    intro equal
    have values := congrArg NodeId.value equal
    rw [childOrigin, rootOrigin] at values
    apply (List.nodup_cons.mp sources).1
    rw [← values]
    exact List.mem_append_right _ entrySource
  cases definitions : program.definitionScopes with
  | nil => simp [definitions] at rootMember
  | cons first rest =>
      cases rest with
      | nil => simp [definitions] at lengthScopes
      | cons second tail =>
          have empty : tail = [] := by
            apply List.length_eq_zero_iff.mp
            simp only [definitions, List.length_cons] at lengthScopes
            omega
          subst tail
          simp [definitions] at rootMember childMember
          rcases rootMember with same | same <;> subst root
          all_goals rcases childMember with same | same <;> subst child
          all_goals simp_all
          all_goals exact Ne.symm separate

theorem admitted_entry_position_bindings (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (root : DefinitionScope)
    (rootSelected : rootDefinitionScope? program = some root)
    (operation : SemanticOperation) (entry : ParallelScopeEntry) (member : operation ∈ program.operations)
    (parsed : parallelScopeEntry? operation = some entry) :
    (∃ child, uniqueDefinitionScope? program entry.childScopeId = some child ∧
      child.parentScopeId = some root.id) ∧
      ((∃ declared, program.controlPlaces.filter (fun place => decide (place.id = entry.childEntry)) = [declared]) ∧
        program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = entry.childEntry)) =
          [{ controlPlaceId := entry.childEntry, scopeId := entry.childScopeId }]) ∧
      ((∃ declared, program.controlPlaces.filter (fun place => decide (place.id = entry.normalOutput)) = [declared]) ∧
        program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = entry.normalOutput)) =
          [{ controlPlaceId := entry.normalOutput, scopeId := root.id }]) := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have graph := programWellFormed_graph program wellFormed
  have placesUnique : (program.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program wellFormed)
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
  have included : entry ∈ program.operations.filterMap parallelScopeEntry? := List.mem_filterMap.mpr ⟨operation, member, parsed⟩
  have sameEntry : entry = analysis.entry := by simpa only [entries, List.mem_singleton] using included
  obtain ⟨child, childCensus, _, _, _, _, _⟩ := admitted_child_census program analysis admitted root rootSelected
  have childMember : child ∈ program.definitionScopes :=
    (List.mem_filter.mp (childCensus.symm ▸ List.mem_singleton_self child)).1
  have childOrigin := filter_key_eq_singleton_of_nodup program.definitionScopes (·.originElementId) child
    (admitted_definition_origins_unique program analysis admitted root rootSelected) childMember
  have childLookup : uniqueDefinitionScope? program entry.childScopeId = some child := by
    simp only [uniqueDefinitionScope?, sameEntry, childCensus, childOrigin]
  obtain ⟨_, _, _, ownership⟩ := programGraphWellFormed_scopeContract program graph
  simp only [scopedOwnershipComplete, Bool.and_eq_true] at ownership
  have respects := List.all_eq_true.mp ownership.2 operation member
  have ownerCensus := admitted_entry_owner_census program analysis admitted root rootSelected
  have operationId : operation.id = analysis.entry.id := by
    cases operation <;> simp only [parallelScopeEntry?] at parsed <;> try contradiction
    exact (congrArg ParallelScopeEntry.id (Option.some.inj parsed)).trans (congrArg ParallelScopeEntry.id sameEntry)
  have ownerFound : (program.operationScopes.find? (fun binding => decide (binding.operationId = operation.id))).map
      (·.scopeId) = some root.id := by
    rw [operationId, ← List.head?_filter, ownerCensus]; rfl
  have definitionLookup :
      program.definitionScopes.find? (fun scope => decide (scope.id = entry.childScopeId)) = some child := by
    rw [← List.head?_filter]
    simpa only [← Bool.beq_eq_decide_eq, sameEntry, List.head?_cons] using congrArg List.head? childCensus
  unfold operationRespectsScopes at respects
  change (match (program.operationScopes.find? (fun binding => decide (binding.operationId = operation.id))).map
    (·.scopeId) with | none => false | some scope => _) = true at respects
  rw [ownerFound] at respects
  cases operation <;> simp only [parallelScopeEntry?] at parsed <;> try contradiction
  cases Option.some.inj parsed
  simp only [Bool.and_eq_true] at respects
  have parentPorts := respects.1.1
  have childPort := respects.1.2
  have definition := respects.2
  change [_, _].all (fun place =>
    (program.controlPlaceScopes.find? (fun binding => decide (binding.controlPlaceId = place))).map (·.scopeId) ==
      some root.id) = true at parentPorts
  change [_].all (fun place =>
    (program.controlPlaceScopes.find? (fun binding => decide (binding.controlPlaceId = place))).map (·.scopeId) ==
      some _) = true at childPort
  simp only [List.all_cons, List.all_nil, Bool.and_true, Bool.and_eq_true, beq_iff_eq] at parentPorts childPort
  change (program.definitionScopes.find? (fun scope => decide (scope.id = _))).any
    (fun scope => scope.parentScopeId == some root.id && scope.originElementId == _) = true at definition
  dsimp only at definitionLookup
  rw [definitionLookup] at definition
  simp only [Option.any_some, Bool.and_eq_true, beq_iff_eq] at definition
  exact ⟨⟨child, childLookup, definition.1⟩,
    programGraphWellFormed_exactPlaceBinding program _ _ graph placesUnique childPort,
    programGraphWellFormed_exactPlaceBinding program _ _ graph placesUnique parentPorts.2⟩

theorem parallelScope_issued_scope_provenance (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
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
      rcases List.mem_append.mp ((issueParallelBodies_scope_population issuedBodies).mem_iff.mp member) with body | root
      · obtain ⟨iteration, iterationMember, same⟩ := List.mem_map.mp body
        subst scope
        exact Or.inr ⟨rfl, issueParallelBodies_scope_domain issuedBodies iteration iterationMember⟩
      · exact Or.inl (by simpa [clean.1] using root)

private theorem census_structural_valid (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (state : RuntimeState)
    (parent : ScopeOccurrenceId) (root : DefinitionScope)
    (selected : rootDefinitionScope? program = some root) (parentKey : parent.definitionScopeId = root.id)
    (nonemptyId : parent.processInstanceId.value.isEmpty = false)
    (running : state.control = .running parent.processInstanceId)
    (rootCensus : state.scopeOccurrences.filter (fun scope => decide (scope.id = parent)) = [⟨parent, none⟩])
    (unique : (state.scopeOccurrences.map (·.id)).Nodup) (noCalls : state.calledProcessOccurrences = [])
    (provenance : ∀ scope ∈ state.scopeOccurrences, scope = ⟨parent, none⟩ ∨
      scope.parent = some parent ∧ scope.id.processInstanceId = parent.processInstanceId ∧
        scope.id.definitionScopeId = analysis.entry.childScopeId)
    (positive : ∀ scope ∈ state.scopeOccurrences, 0 < scope.id.activation) :
    flowNodeOccurrenceStructuralProgramValidity program state = true := by
  obtain ⟨rootDefinition, rootParent, origin, rootNamed⟩ := root_census program root
    (analyzeProgram_incidence_admission program analysis admitted).1 selected
  obtain ⟨child, childDefinition, childParent, childKey, _childOrigin, childNamed, entryBinding⟩ :=
    admitted_child_census program analysis admitted root selected
  have parentUnique : flowNodeOccurrenceOwnerLiveUnique state parent = true := by
    simp [flowNodeOccurrenceOwnerLiveUnique, rootCensus]
  change (state.scopeOccurrences.all (ScopeBinding program state) &&
    state.calledProcessOccurrences.all (CallBinding program state)) = true
  simp only [noCalls, List.all_nil, Bool.and_true, List.all_eq_true]
  intro scope member
  have scopeCensus := filter_key_eq_singleton_of_nodup state.scopeOccurrences (·.id) scope unique member
  have live : flowNodeOccurrenceOwnerLiveUnique state scope.id = true := by
    simp [flowNodeOccurrenceOwnerLiveUnique, scopeCensus]
  rcases provenance scope member with rootScope | ⟨parentEq, instanceEq, scopeKey⟩
  · subst scope
    simp [ScopeBinding, parentKey, rootDefinition, nonemptyId, rootNamed, positive _ member,
      live, EntryBinding, scopeOperationBindingValid, rootParent, running, origin]
  · have entry := entryBinding scope parent parentEq parentKey scopeKey
    unfold ScopeBinding
    rw [scopeKey, childDefinition]
    have childNonempty : analysis.entry.childScopeId.value.isEmpty = false := by
      simpa only [childKey] using childNamed
    simp [childNonempty, instanceEq, nonemptyId,
      positive scope member, live, entry, parentEq, childParent, running, parentKey, parentUnique]

/-- Actual PMIS prefixes retain the Program binding of every live structural occurrence. -/
theorem ParallelScopeInternalPrefixReachable.structural_program_valid
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId) :
    flowNodeOccurrenceStructuralProgramValidity program state = true := by
  have unique := reachable.scope_identities_unique program analysis admitted state instanceId running
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted state
  have nonemptyId : seed.instanceId.value.isEmpty = false := by
    have accepted : ParallelScopeCommand.stimulusAdmitted program initialState
        (.startProcess seed.commandId seed.processId seed.instanceId seed.values) = true := by
      cases checked : ParallelScopeCommand.stimulusAdmitted program initialState
          (.startProcess seed.commandId seed.processId seed.instanceId seed.values) with
      | false =>
          have committed := seed.committed
          cases snapshot : program.compensationEventSubProcessSnapshots <;>
            simp [admitStimulus, snapshot, checked] at committed
      | true => rfl
    exact ParallelScopeCommand.admitted_start_instance_nonempty program initialState seed.commandId
      seed.processId seed.instanceId seed.values selected accepted
  let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  have rootOnly (census : state.scopeOccurrences = [⟨seed.parent, none⟩])
      (control : state.control = .running seed.instanceId) (calls : state.calledProcessOccurrences = []) :
      flowNodeOccurrenceStructuralProgramValidity program state = true := by
    apply census_structural_valid program analysis admitted state seed.parent seed.root seed.rootSelected
      rfl nonemptyId control (by simp [census]) unique calls
    · intro scope member
      exact Or.inl (by simpa [census] using member)
    · intro scope member
      have same : scope = ⟨seed.parent, none⟩ := by simpa [census] using member
      simp [same, ParallelScopeAcceptedStart.parent]
  rcases phases observer rfl with ready | ⟨_, _, _, _, _, _, _, phase⟩
  · have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    change _ = seed.ready at raw
    exact rootOnly (by rw [ready, ← raw]; rfl) (by rw [ready, ← raw]; rfl) (by rw [ready, ← raw]; rfl)
  rcases phase with ⟨parents, _⟩ |
    ⟨before, issued, _, _, suffix, _, parents, _, _, _, entered, following⟩
  · exact rootOnly (parents.clean_and_foreign_marking program analysis.entry seed.parent state).1.1
      (parents.running_control program analysis.entry seed.parent state)
      (parents.structural_frame program analysis.entry seed.parent state).noCalls
  rcases following with history | ⟨_, _, _, _, _, _, _, ⟨_, completed⟩, _⟩
  · have clean := (parents.clean_and_foreign_marking program analysis.entry seed.parent before).1
    have issuedFrame := enterParallelScope_structural_parallel_frame analysis.entry seed.parent before issued clean
      (parents.structural_frame program analysis.entry seed.parent before) entered
    have frame := history.structural_frame program observer seed.parent selected issued state suffix issuedFrame
    have retained := history.scopeOccurrences_sublist program observer selected issued state suffix
    have provenance := parallelScope_issued_scope_provenance analysis.entry seed.parent before issued clean entered
    have bounds := enterParallelScope_clean_owner_bounds analysis.entry seed.parent before issued clean rfl entered
    have control := (history.control_frame program observer selected issued state suffix).trans
      ((enterParallelScope_control_frame analysis.entry seed.parent before issued entered).trans
        (parents.running_control program analysis.entry seed.parent before))
    exact census_structural_valid program analysis admitted state seed.parent seed.root seed.rootSelected rfl
      nonemptyId control frame.root unique frame.noCalls (fun scope member => provenance scope (retained.subset member))
      (fun scope member => (bounds scope (retained.subset member)).2.1)
  · rw [running] at completed
    contradiction

end BpmnSemantics.SemanticProcess
