import BpmnSemantics.SemanticProcess.ParallelScopeWaitArmingPublicationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeTokenPositionProofs
import BpmnSemantics.SemanticProcess.InternalLocalControlTokenValidity
import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalPositionValidity

/-! Actual PMIS reachability must establish token/place bindings before command
publication can consume runtime position validity. Occurrence publication alone
does not constrain the control-token population. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem start_position (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (root : DefinitionScope)
    (selected : rootDefinitionScope? program = some root) (hosting : SemanticId)
    (named : hosting.value ≠ "") (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program hosting values = some state) :
    runtimePositionValid program hosting state = true := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  obtain ⟨rootDefinition, rootParent, rootOrigin, _⟩ := root_census program root wellFormed selected
  have scopesUnique := admitted_definition_origins_unique program analysis admitted root selected
  have placesUnique : (program.controlPlaces.map (·.origin)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) BpmnSequenceFlowOrigin.elementId
      (fun _ _ different equal => different (congrArg BpmnSequenceFlowOrigin.elementId equal))
    rw [List.map_map]
    exact analyzeProgram_control_place_origins_unique program analysis admitted
  have rootMember : root ∈ program.definitionScopes :=
    (List.mem_filter.mp (rootDefinition.symm ▸ List.mem_singleton_self root)).1
  have rootSource := filter_key_eq_singleton_of_nodup program.definitionScopes
    (·.originElementId) root scopesUnique rootMember
  have rootLookup : uniqueDefinitionScope? program root.id = some root := by
    simp only [uniqueDefinitionScope?, rootDefinition, rootSource]
  have projection : ((program.controlPlaces.all fun place =>
      (program.controlPlaces.filter fun candidate => decide (candidate.origin = place.origin)).length = 1) &&
      program.definitionScopes.all fun scope =>
        (program.definitionScopes.filter fun candidate => decide (candidate.originElementId = scope.originElementId)).length = 1) = true := by
    apply Bool.and_eq_true_iff.mpr
    constructor
    · apply List.all_eq_true.mpr
      intro place member
      simp [filter_key_eq_singleton_of_nodup program.controlPlaces (·.origin) place placesUnique member]
    · apply List.all_eq_true.mpr
      intro scope member
      simp [filter_key_eq_singleton_of_nodup program.definitionScopes (·.originElementId) scope scopesUnique member]
  simp only [runningProgramStartState?, selected, bind, Option.bind_some, pure, Option.some.injEq] at started
  subst state
  apply (position_iff program hosting hosting _ rfl).mpr
  refine ⟨wellFormed, projection, rfl, ?_, ?_, ?_, ?_⟩
  · simp [rootLookup, rootParent, rootOrigin]
  · simp [calledProcessAssociationsValid, rootInstanceId?, runningStartState, initialState]
  · intro occurrence member
    have same : occurrence = ⟨⟨hosting, root.id, 1⟩, none⟩ := by
      simpa [runningStartState, initialState] using member
    subst occurrence
    refine ⟨by simp [exactLiveOccurrence], root, rootLookup,
      named, Nat.zero_lt_succ 0, ?_⟩
    simp [rootParent, Hosting, Called, rootOrigin, runningStartState, initialState]
  · simp [runningStartState, initialState]

private theorem issue_bodies_position (program : Program) (hosting : SemanticId)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (definition : DefinitionScope)
    (items : List String) (index : Nat) (before after : RuntimeState)
    (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations))
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting) (named : hosting.value ≠ "")
    (parentHosting : parent.processInstanceId = hosting)
    (parentLive : exactLiveOccurrence before parent = true)
    (definitionFound : uniqueDefinitionScope? program entry.childScopeId = some definition)
    (staticParent : definition.parentScopeId = some parent.definitionScopeId)
    (declared : ∃ declaration, program.controlPlaces.filter (fun place =>
      decide (place.id = entry.childEntry)) = [declaration])
    (owned : program.controlPlaceScopes.filter (fun binding => decide
      (binding.controlPlaceId = entry.childEntry)) =
        [{ controlPlaceId := entry.childEntry, scopeId := entry.childScopeId }])
    (bounded : ∀ occurrence ∈ before.scopeOccurrences,
      occurrence.id.definitionScopeId = entry.childScopeId →
        occurrence.id.activation ≤ scopeActivationCount before entry.childScopeId) :
    runtimePositionValid program hosting after = true := by
  induction items generalizing before after index iterations with
  | nil =>
      simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
      rw [← issued.1]
      exact position
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, issuedRest, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      let child : RuntimeScopeOccurrence :=
        ⟨⟨parent.processInstanceId, entry.childScopeId,
          scopeActivationCount before entry.childScopeId + 1⟩, some parent⟩
      let inserted : RuntimeState := { before with
        variables := variables,
        scopeOccurrences := insertScopeOccurrence child before.scopeOccurrences,
        scopeActivations := setScopeActivationCount before.scopeActivations entry.childScopeId child.id.activation }
      let next : RuntimeState := { inserted with tokens := addToken before.tokens entry.childEntry child.id }
      have fresh : ∀ occurrence ∈ before.scopeOccurrences, occurrence.id ≠ child.id := by
        intro occurrence member equal
        have scope : occurrence.id.definitionScopeId = entry.childScopeId :=
          congrArg ScopeOccurrenceId.definitionScopeId equal
        have prior := bounded occurrence member scope
        have ordinal := congrArg ScopeOccurrenceId.activation equal
        change occurrence.id.activation = scopeActivationCount before entry.childScopeId + 1 at ordinal
        omega
      have insertedPosition := runtimePositionValid_insert_child_frame program hosting hosting before inserted
        child parent definition position running rfl rfl rfl rfl fresh definitionFound rfl staticParent
        rfl (by simpa only [child, parentHosting] using named) (Nat.zero_lt_succ _) parentLive
      have childLive : exactLiveOccurrence inserted child.id = true := by
        exact exactLiveOccurrence_insertScopeOccurrence_created before child fresh
      have nextPosition : runtimePositionValid program hosting next = true :=
        runtimePositionValid_addToken program hosting inserted entry.childEntry child.id
          insertedPosition childLive declared owned
      have nextParent : exactLiveOccurrence next parent = true := by
        exact exactLiveOccurrence_insertScopeOccurrence_preserves before child parent fresh parentLive
      have counter : scopeActivationCount next entry.childScopeId =
          scopeActivationCount before entry.childScopeId + 1 := by
        have single : issueParallelBodies? entry parent [item] index before =
            some (next, [⟨child.id, index, item⟩]) := by
          simp only [issueParallelBodies?, initialized, bind, Option.bind_some]
          rfl
        simpa using (issueParallelBodies_scope_ordinals single).2
      have nextBound : ∀ occurrence ∈ next.scopeOccurrences,
          occurrence.id.definitionScopeId = entry.childScopeId →
            occurrence.id.activation ≤ scopeActivationCount next entry.childScopeId := by
        intro occurrence member scope
        change occurrence ∈ insertScopeOccurrence child before.scopeOccurrences at member
        rw [mem_insertScopeOccurrence] at member
        rcases member with same | member
        · subst occurrence
          rw [counter]
          exact Nat.le_refl _
        · rw [counter]
          exact Nat.le_trans (bounded occurrence member scope) (Nat.le_succ _)
      exact ih (before := next) (after := after) (index := index + 1) (iterations := rest)
        issuedRest nextPosition running nextParent nextBound

private theorem resolved_port_binding (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (sameScope : operationControlPlacesShareOwner operation = true)
    (place : ControlPlaceId) (port : place ∈ operationControlPlaces operation) :
    (∃ declaration, program.controlPlaces.filter (fun value => decide (value.id = place)) = [declaration]) ∧
      program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := candidate.owner.definitionScopeId }] := by
  obtain ⟨origin, found⟩ := resolved_selectedInputOrigin program state candidate operation place
    (analyzeProgram_incidence_admission program analysis admitted).1 resolved sameScope port
  exact selectedInputOrigin?_exact_bindings program place candidate.owner origin found

private theorem body_position (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (hosting : SemanticId)
    (before after : RuntimeState) (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    runtimePositionValid program hosting after = true := by
  have live := resolved_exactLiveOccurrence program before candidate operation resolved
  have removal (input : ControlPlaceId) (result : RuntimeState) (control : result.control = before.control)
      (scopes : result.scopeOccurrences = before.scopeOccurrences)
      (calls : result.calledProcessOccurrences = before.calledProcessOccurrences)
      (tokens : result.tokens = removeToken before.tokens input candidate.owner) :
      runtimePositionValid program hosting result = true :=
    runtimePositionValid_tokens_sublist_frame program hosting before result position control scopes calls
      (tokens ▸ removeToken_sublist before.tokens input candidate.owner)
  cases operation <;> simp [SemanticOperation.kind] at body
  all_goals simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    have applied := (Option.ite_none_left_eq_some.mp applied).2
    cases parallel : hasParallelScopeDefinition program candidate.owner with
    | false =>
        simp only [parallel] at applied
        cases Option.some.inj applied
        exact removal input _ rfl rfl rfl rfl
    | true =>
        simp only [parallel, ↓reduceIte] at applied
        obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
        cases Option.some.inj applied
        exact removal input _ rfl rfl rfl rfl
  case awaitEffect id origin input output effect route =>
    have applied := (Option.ite_none_left_eq_some.mp applied).2
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, ↓reduceIte] at applied
    all_goals
      obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact removal input _ rfl rfl rfl rfl
  case duplicate id origin input outputs =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    let patch : TokenPatch := { owner := candidate.owner, consumed := [input], produced := outputs }
    have bindings (place : ControlPlaceId) (member : place ∈ outputs) :=
      resolved_port_binding program analysis admitted before candidate
        (.duplicate id origin input outputs) resolved rfl place (List.mem_append_right _ member)
    exact patch.preserves_position program hosting before position live
      (fun place member => (bindings place member).1) (fun place member => (bindings place member).2)
  case synchronize id origin inputs output =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    let patch : TokenPatch := { owner := candidate.owner, consumed := inputs, produced := [output] }
    have binding := resolved_port_binding program analysis admitted before candidate
      (.synchronize id origin inputs output) resolved rfl output
      (List.mem_append_right _ (List.mem_singleton_self output))
    exact patch.preserves_position program hosting before position live
      (fun place member => by simpa only [List.mem_singleton.mp member] using binding.1)
      (fun place member => by simpa only [List.mem_singleton.mp member] using binding.2)
  case reachNoneEnd id origin input =>
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact removal input _ rfl rfl rfl rfl

private theorem batch_position (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (hosting : SemanticId)
    (before : RuntimeState) (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors) :
    ∀ after ∈ successors, runtimePositionValid program hosting after = true := by
  have invariant := applyInternalOccurrenceBatch_prefix_induction program before batch successors
    (fun state => state.control = .running hosting ∧ runtimePositionValid program hosting state = true)
    ⟨running, position⟩ (by
      intro state patch _ prepared prior
      cases patch with
      | token token =>
          have actual := prepareOccurrenceTokenPatch_application program state
            ⟨token.operation.id, token.tokens.owner⟩ token prepared
          refine ⟨prior.1, ?_⟩
          exact body_position program analysis admitted hosting state _
            ⟨token.operation.id, token.tokens.owner⟩ token.operation actual.2.1
            (by
              have kind := actual.2.2
              simp only [List.mem_cons] at kind ⊢
              exact Or.inr (Or.inr kind)) prior.2 prior.1 actual.1
      | arm arm =>
          cases write : arm.write <;>
            simp only [InternalOccurrencePatch.apply, applyInternalArmingPatch, write]
          all_goals exact ⟨prior.1, runtimePositionValid_tokens_sublist_frame program hosting state _
            prior.2 rfl rfl rfl (removeToken_sublist state.tokens arm.input arm.owner)⟩) applied
  intro after member
  exact (invariant after member).2

private theorem resolved_scope_lookup (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    (program.operationScopes.find? (fun binding => decide (binding.operationId = operation.id))).map
      (·.scopeId) = some candidate.owner.definitionScopeId := by
  have owner := resolved_definition_owner program state candidate operation resolved
  unfold operationOwningScope? at owner
  split at owner <;> try contradiction
  rename_i bindings binding census
  rw [← List.head?_filter, census]
  exact owner

private theorem parsed_entry_unique (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (operation : SemanticOperation)
    (entry : ParallelScopeEntry) (member : operation ∈ program.operations)
    (parsed : parallelScopeEntry? operation = some entry) : entry = analysis.entry := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
  simpa only [entries, List.mem_singleton] using (List.mem_filterMap.mpr ⟨operation, member, parsed⟩ :
    entry ∈ program.operations.filterMap parallelScopeEntry?)

private theorem entry_bindings (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (root : DefinitionScope)
    (rootSelected : rootDefinitionScope? program = some root) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation) (entry : ParallelScopeEntry)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (parsed : parallelScopeEntry? operation = some entry) :
    (∃ child, uniqueDefinitionScope? program entry.childScopeId = some child ∧
      child.parentScopeId = some candidate.owner.definitionScopeId) ∧
      ((∃ declared, program.controlPlaces.filter (fun place => decide (place.id = entry.childEntry)) = [declared]) ∧
        program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = entry.childEntry)) =
          [{ controlPlaceId := entry.childEntry, scopeId := entry.childScopeId }]) ∧
      ((∃ declared, program.controlPlaces.filter (fun place => decide (place.id = entry.normalOutput)) = [declared]) ∧
        program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = entry.normalOutput)) =
          [{ controlPlaceId := entry.normalOutput, scopeId := candidate.owner.definitionScopeId }]) := by
  have member := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
  have bindings := admitted_entry_position_bindings program analysis admitted root rootSelected operation entry member parsed
  have sameEntry := parsed_entry_unique program analysis admitted operation entry member parsed
  have operationId : operation.id = analysis.entry.id := by
    cases operation <;> simp only [parallelScopeEntry?] at parsed <;> try contradiction
    exact (congrArg ParallelScopeEntry.id (Option.some.inj parsed)).trans (congrArg ParallelScopeEntry.id sameEntry)
  have ownerFound := resolved_scope_lookup program state candidate operation resolved
  have census := admitted_entry_owner_census program analysis admitted root rootSelected
  rw [operationId, ← List.head?_filter, census] at ownerFound
  have owner : root.id = candidate.owner.definitionScopeId := Option.some.inj ownerFound
  rw [owner] at bindings
  exact bindings

private theorem entry_position (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (hosting : SemanticId)
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation) (entry : ParallelScopeEntry)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (parsed : parallelScopeEntry? operation = some entry)
    (position : runtimePositionValid program hosting before = true) (running : before.control = .running hosting)
    (entered : enterParallelScope? entry before candidate.owner = some after) :
    runtimePositionValid program hosting after = true := by
  obtain ⟨seed, _, _⟩ := reachable.start_certificate program analysis admitted before
  obtain ⟨⟨child, childLookup, parented⟩, childPort, outputPort⟩ :=
    entry_bindings program analysis admitted seed.root seed.rootSelected before candidate operation entry resolved parsed
  have live := resolved_exactLiveOccurrence program before candidate operation resolved
  have owned := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty program before candidate.owner
    (reachable.structural_program_valid program analysis admitted before hosting running) live
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  rename_i checks
  have parentHosting : candidate.owner.processInstanceId = hosting := by
    by_cases same : before.control = .running candidate.owner.processInstanceId
    · exact ProcessControl.running.inj (same.symm.trans running)
    · simp [same] at checks
  have named : hosting.value ≠ "" := by
    intro empty
    rw [parentHosting, empty] at owned
    simp at owned
  have noneBefore : before.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = false := by
    cases any : before.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) <;>
      simp_all only [Bool.or_true, Bool.true_or, not_true_eq_false]
  have bound : ∀ occurrence ∈ before.scopeOccurrences,
      occurrence.id.definitionScopeId = entry.childScopeId →
        occurrence.id.activation ≤ scopeActivationCount before entry.childScopeId := by
    intro occurrence member scope
    have any : before.scopeOccurrences.any
        (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = true :=
      List.any_eq_true.mpr ⟨occurrence, member, by simpa using scope⟩
    rw [noneBefore] at any
    contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  have consumedPosition : runtimePositionValid program hosting
      { before with tokens := removeToken before.tokens entry.input candidate.owner } = true :=
    runtimePositionValid_tokens_sublist_frame program hosting before _ position rfl rfl rfl
      (removeToken_sublist before.tokens entry.input candidate.owner)
  split at entered
  · cases Option.some.inj entered
    exact runtimePositionValid_addToken program hosting
      { before with tokens := removeToken before.tokens entry.input candidate.owner }
      entry.normalOutput candidate.owner consumedPosition live outputPort.1 outputPort.2
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
        cases Option.some.inj entered
        have issuedPosition := issue_bodies_position program hosting entry candidate.owner child _ 0
          { before with tokens := removeToken before.tokens entry.input candidate.owner } issued
          (first :: rest) generated consumedPosition running named parentHosting live childLookup parented
          childPort.1 childPort.2 bound
        exact runtimePositionValid_tokens_sublist_frame program hosting issued _ issuedPosition rfl rfl rfl (List.Sublist.refl _)

private theorem cancel_child_position (program : Program) (hosting : SemanticId)
    (state : RuntimeState) (target : ScopeOccurrenceId)
    (position : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting) (noCalls : state.calledProcessOccurrences = [])
    (child : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id = target → occurrence.parent ≠ none) :
    runtimePositionValid program hosting (cancelScopeSubtree state target .remove) = true := by
  by_cases present : ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = target
  · obtain ⟨occurrence, member, same⟩ := present
    simpa only [same] using cancelScopeSubtree_child_preserves_position program state hosting hosting
      position running occurrence member (child occurrence member same) .remove
  · have parents := runtimePositionValid_scope_parents_live program hosting hosting state position running
    have outside (owner : ScopeOccurrenceId) (live : owner ∈ state.scopeOccurrences.map (·.id)) :
        occurrenceInSubtree state.scopeOccurrences target owner = false := by
      suffices ∀ fuel, occurrenceInSubtreeWithin state.scopeOccurrences target owner fuel = false by
        exact this _
      intro fuel
      induction fuel generalizing owner with
      | zero => rfl
      | succ fuel ih =>
          by_cases same : owner = target
          · obtain ⟨occurrence, member, identity⟩ := List.mem_map.mp live
            exact False.elim (present ⟨occurrence, member, identity.trans same⟩)
          · simp only [occurrenceInSubtreeWithin, same, ↓reduceIte]
            cases found : occurrenceParent? state.scopeOccurrences owner with
            | none => rfl
            | some parent =>
                obtain ⟨occurrence, member, parented, _⟩ :=
                  occurrenceParent_some_edge state.scopeOccurrences owner parent found
                exact ih parent (parents occurrence member parent parented)
    have scopes : (cancelScopeSubtree state target .remove).scopeOccurrences = state.scopeOccurrences := by
      change state.scopeOccurrences.filter _ = _
      apply List.filter_eq_self.mpr
      intro occurrence member
      show (!(occurrenceInSubtree state.scopeOccurrences target occurrence.id ||
        (calledInstanceClosure state target).contains occurrence.id.processInstanceId)) = true
      simp only [calledInstanceClosure_no_calls state target noCalls, List.contains_nil, Bool.or_false,
        outside occurrence.id (List.mem_map.mpr ⟨occurrence, member, rfl⟩), Bool.not_false]
    exact runtimePositionValid_tokens_sublist_frame program hosting state _ position rfl scopes
      (by simp [cancelScopeSubtree, noCalls]) List.filter_sublist

private theorem cancel_bodies_position (program : Program) (hosting : SemanticId)
    (iterations : List ParallelScopeIteration) (state : RuntimeState)
    (position : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting) (noCalls : state.calledProcessOccurrences = [])
    (children : ∀ iteration ∈ iterations, ∀ occurrence ∈ state.scopeOccurrences,
      occurrence.id = iteration.scope → occurrence.parent ≠ none) :
    runtimePositionValid program hosting
      (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state) = true := by
  induction iterations generalizing state with
  | nil => exact position
  | cons first rest ih =>
      apply ih (cancelScopeSubtree state first.scope .remove)
        (cancel_child_position program hosting state first.scope position running noCalls
          (children first (by simp))) running (by simp [cancelScopeSubtree, noCalls])
      intro iteration member occurrence survived same
      exact children iteration (by simp [member]) occurrence (List.mem_filter.mp survived).1 same

private theorem retirement_position (program : Program) (hosting : SemanticId)
    (entry : ParallelScopeEntry) (parent target : ScopeOccurrenceId) (before after : RuntimeState)
    (binding : ParallelScopeBinding) (bound : parallelScopeBinding? entry before target = some binding)
    (frame : ParallelScopeStructuralFrame parent before)
    (position : runtimePositionValid program hosting before = true) (running : before.control = .running hosting)
    (output : (∃ declared, program.controlPlaces.filter (fun place => decide (place.id = entry.normalOutput)) = [declared]) ∧
      program.controlPlaceScopes.filter (fun value => decide (value.controlPlaceId = entry.normalOutput)) =
        [{ controlPlaceId := entry.normalOutput, scopeId := parent.definitionScopeId }])
    (completed : completeParallelScope? entry before target = some after) :
    runtimePositionValid program hosting after = true := by
  have owner := (frame.bound_outer entry parent target before binding bound).2.2
  have finalFrame := completeParallelScope_structural_parallel_frame entry parent target before after binding frame bound completed
  have parentLive : exactLiveOccurrence after parent = true := by
    simp only [exactLiveOccurrence, finalFrame.root, List.length_singleton, decide_true]
  subst owner
  have children : ∀ iteration ∈ binding.iterations, ∀ occurrence ∈ before.scopeOccurrences,
      occurrence.id = iteration.scope → occurrence.parent ≠ none := by
    intro iteration member occurrence present same parentless
    have lookup := parallelScopeBinding_body_parent entry before target binding bound iteration member
    have unique := runtimePositionValid_scope_ids_nodup program hosting hosting before position running
    rw [← same, occurrenceParent_of_mem before.scopeOccurrences unique occurrence present, parentless] at lookup
    contradiction
  obtain ⟨selected, selectedMember, selectedId⟩ := parallelScopeBinding_member entry before target binding bound
  have child (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ before.scopeOccurrences)
      (same : occurrence.id = target) : occurrence.parent ≠ none :=
    children selected selectedMember occurrence member (same.trans selectedId.symm)
  unfold completeParallelScope? at completed
  rw [bound] at completed
  simp only [bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, retired, completed⟩ := Option.bind_eq_some_iff.mp completed
  -- Every cancelled intermediate state shares control, scope occurrences, tokens and calls with `before`;
  -- only Activity, controller and variable bookkeeping differ, none of which position validity reads.
  have framed (detached : RuntimeState) (control : detached.control = before.control)
      (scopes : detached.scopeOccurrences = before.scopeOccurrences)
      (calls : detached.calledProcessOccurrences = before.calledProcessOccurrences)
      (tokens : detached.tokens = before.tokens) :
      runtimePositionValid program hosting (cancelScopeSubtree detached target .remove) = true :=
    cancel_child_position program hosting detached target
      (runtimePositionValid_tokens_sublist_frame program hosting before detached position control scopes calls
        (tokens ▸ List.Sublist.refl _))
      (control.trans running) (calls.trans frame.noCalls)
      (fun occurrence member same => child occurrence (scopes ▸ member) same)
  have relation := retireParallelScopeIteration_dispatch binding.controller binding.iterations target condition retirement retired
  cases relation with
  | remaining leading trailing selected first rest _ _ _ _ =>
      cases Option.some.inj completed
      exact framed _ rfl rfl rfl rfl
  | naturalCompletion selected condition _ _ _ =>
      cases Option.some.inj completed
      exact runtimePositionValid_addToken program hosting _ entry.normalOutput _
        (framed _ rfl rfl rfl rfl) parentLive output.1 output.2
  | earlyCompletion leading trailing selected first rest _ shape _ siblings =>
      cases Option.some.inj completed
      have retained : (first :: rest).Sublist binding.iterations := by
        rw [← siblings, shape]
        exact (List.sublist_cons_self selected trailing).append_left leading
      refine runtimePositionValid_addToken program hosting _ entry.normalOutput _ ?_ parentLive output.1 output.2
      exact cancel_bodies_position program hosting (first :: rest) _ (framed _ rfl rfl rfl rfl) running
        (by simp [cancelScopeSubtree, frame.noCalls]) (by
          intro iteration member occurrence survived same
          exact children iteration (retained.subset member) occurrence (List.mem_filter.mp survived).1 same)

private def PositionInvariant (program : Program) (state : RuntimeState) : Prop :=
  ∀ instanceId, state.control = .running instanceId → runtimePositionValid program instanceId state = true

private theorem owned_port_binding (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (operation : SemanticOperation)
    (member : operation ∈ program.operations) (owner : ScopeOccurrenceId)
    (owned : FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program operation owner = true)
    (sameScope : operationControlPlacesShareOwner operation = true)
    (place : ControlPlaceId) (port : place ∈ operationControlPlaces operation) :
    (∃ declaration, program.controlPlaces.filter (fun value => decide (value.id = place)) = [declaration]) ∧
      program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := owner.definitionScopeId }] := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have operationIds : (program.operations.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have placeIds : (program.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program wellFormed)
  obtain ⟨scope, declaration, operationBinding, placeBinding, declared⟩ :=
    programGraphWellFormed_operationControlPlaceScope program operation place
      (programWellFormed_graph program wellFormed) operationIds placeIds member sameScope port
  have scopeEq : scope = owner.definitionScopeId := by
    simpa only [FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy, operationBinding,
      decide_eq_true_eq] using owned
  exact ⟨⟨declaration, declared⟩, by simpa only [scopeEq] using placeBinding⟩

private theorem human_completion_position (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (hosting : SemanticId)
    (before after : RuntimeState) (position : runtimePositionValid program hosting before = true)
    (valid : flowNodeOccurrenceProgramValidity program before = true)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after) :
    runtimePositionValid program hosting after = true := by
  have userValid : flowNodeOccurrenceUserTaskProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at valid
    exact valid.1.1.2.1.1.1
  have domain : UserTaskDirectContinuationDomain program := by
    intro operation member
    have allowed := analyzeProgram_operation_allowed program analysis admitted operation member
    cases operation <;> simp only <;> try trivial
    simp [SequentialScopeProgram.operationAllowed] at allowed
  have restored (wait : UserTaskWait) (member : wait ∈ before.waits) :
      runtimePositionValid program hosting { before with tokens := addToken before.tokens wait.output wait.owner } = true := by
    obtain ⟨live, operation, declared, owned, sameScope, port⟩ :=
      flowNodeOccurrenceUserTaskProgramValidity_output_binding program before wait userValid member domain
    have binding := owned_port_binding program analysis admitted operation declared wait.owner owned sameScope wait.output port
    exact runtimePositionValid_addToken program hosting before wait.output wait.owner position live binding.1 binding.2
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    rename_i waits wait census
    split at completed <;> try contradiction
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    have member := (List.mem_filter.mp (census.symm ▸ List.mem_singleton_self wait)).1
    exact runtimePositionValid_tokens_sublist_frame program hosting _ _ (restored wait member) rfl rfl rfl (List.Sublist.refl _)
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    rename_i wait found
    have member := List.mem_of_find?_eq_some found
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact runtimePositionValid_tokens_sublist_frame program hosting _ _ (restored wait member) rfl rfl rfl (List.Sublist.refl _)

private theorem effect_completion_position (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (hosting : SemanticId)
    (before after : RuntimeState) (position : runtimePositionValid program hosting before = true)
    (valid : flowNodeOccurrenceProgramValidity program before = true)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after) :
    runtimePositionValid program hosting after = true := by
  have effectValid : flowNodeOccurrenceEffectProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at valid
    exact valid.1.1.2.2
  have restored (wait : EffectWait) (member : wait ∈ before.effectWaits) :
      runtimePositionValid program hosting { before with tokens := addToken before.tokens wait.output wait.owner } = true := by
    obtain ⟨live, operation, declared, owned, sameScope, port⟩ :=
      flowNodeOccurrenceEffectProgramValidity_output_binding program before wait effectValid member
    have binding := owned_port_binding program analysis admitted operation declared wait.owner owned sameScope wait.output port
    exact runtimePositionValid_addToken program hosting before wait.output wait.owner position live binding.1 binding.2
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait census
  have member := (List.mem_filter.mp (census.symm ▸ List.mem_singleton_self wait)).1
  split at completed
  · unfold completeParallelScopeEffect? at completed
    simp only [census] at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact runtimePositionValid_tokens_sublist_frame program hosting _ _ (restored wait member) rfl rfl rfl (List.Sublist.refl _)
  · simp only [completeSerialEffect?, census] at completed
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact runtimePositionValid_tokens_sublist_frame program hosting _ _ (restored wait member) rfl rfl rfl (List.Sublist.refl _)

private theorem singleton_position_invariant (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (candidate : InternalOperationOccurrence) (prior : PositionInvariant program before)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) : PositionInvariant program after := by
  obtain ⟨operation, resolved, -, replayed⟩ := applyInternalOperationOccurrence_replay_record program before after candidate profile applied
  let record : InternalTransitionRecord := {
    operationId := candidate.operationId, operationKind := operation.kind,
    origin := operation.origin, owner := candidate.owner, mergeInput := none }
  have replay : replayInternalOperationOccurrence? program before record = some after := replayed
  have active : ∃ instanceId, before.control = .running instanceId := by
    cases control : before.control <;> simp only [applyInternalOperationOccurrence?, control] at applied <;> try contradiction
    exact ⟨_, rfl⟩
  obtain ⟨instanceId, running⟩ := active
  have position := prior instanceId running
  have declared := (resolveInternalOperationOccurrence_declaration program before candidate operation resolved).1
  have parsedEntry (entry : ParallelScopeEntry) (parsed : parallelScopeEntry? operation = some entry) :
      entry = analysis.entry := parsed_entry_unique program analysis admitted operation entry declared parsed
  by_cases body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]
  · have control := (applyInternalOperationOccurrence_body_retirement_frame program before after candidate operation resolved body applied).1
    intro hosting afterRunning
    have same := ProcessControl.running.inj ((control.trans running).symm.trans afterRunning)
    subst hosting
    exact body_position program analysis admitted instanceId before after candidate operation resolved body position running applied
  · cases operation <;> simp [SemanticOperation.kind] at body
    case initiate id origin output =>
      obtain ⟨declaredOutput, _, replayDeclaration, _, _, rootFound, initiated⟩ := replayed_initiation_execution program before after record rfl replay
      have outputEq : declaredOutput = output := by
        have unique := resolved_operation_unique program before candidate (.initiate id origin output) resolved
        have sole : SemanticOperation.initiate record.operationId record.origin declaredOutput =
            SemanticOperation.initiate id origin output := by
          have member : SemanticOperation.initiate record.operationId record.origin declaredOutput ∈
              program.operations.filter (fun op => op.id == candidate.operationId) :=
            List.mem_filter.mpr ⟨replayDeclaration, by simp [record, SemanticOperation.id]⟩
          rw [unique] at member
          exact List.mem_singleton.mp member
        exact SemanticOperation.initiate.inj sole |>.2.2
      subst declaredOutput
      have binding := resolved_port_binding program analysis admitted before candidate (.initiate id origin output) resolved rfl output (by simp [operationControlPlaces, operationOutputs])
      have live := resolved_exactLiveOccurrence program before candidate (.initiate id origin output) resolved
      unfold initiateState? at initiated
      rw [rootFound] at initiated
      simp only [bind, Option.bind_some] at initiated
      split at initiated <;> try contradiction
      cases Option.some.inj initiated
      intro hosting afterRunning
      have same := ProcessControl.running.inj (running.symm.trans afterRunning)
      subst hosting
      exact runtimePositionValid_tokens_sublist_frame program instanceId _ _
        (runtimePositionValid_addToken program instanceId before output candidate.owner position live binding.1 binding.2)
        rfl rfl rfl (List.Sublist.refl _)
    case enterParallelMultiInstanceScope =>
      have entered := replayed_parallel_entry_execution program analysis admitted before after record rfl replay
      have control := enterParallelScope_control_frame analysis.entry candidate.owner before after entered
      intro hosting afterRunning
      have same := ProcessControl.running.inj ((control.trans running).symm.trans afterRunning)
      subst hosting
      exact entry_position program analysis admitted instanceId before after reachable candidate _ analysis.entry resolved
        (congrArg some (parsedEntry _ rfl)) position running entered
    case completeParallelMultiInstanceScope =>
      obtain ⟨entry, entryMember, completed⟩ := replayed_retirement_execution program before after record rfl replay
      obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
      have sameEntry : entry = analysis.entry := by simpa only [entries, List.mem_singleton] using entryMember
      subst entry
      obtain ⟨seed, _, _⟩ := reachable.start_certificate program analysis admitted before
      obtain ⟨parent, _, frame, _⟩ := prefix_scope_projection_census program analysis admitted before reachable instanceId running
      have rootMember : (⟨parent, none⟩ : RuntimeScopeOccurrence) ∈ before.scopeOccurrences :=
        (List.mem_filter.mp (frame.root.symm ▸ List.mem_singleton_self _)).1
      obtain ⟨_, definition, definitionMember, definitionId, parented⟩ :=
        runtimePositionValid_scope_parent_binding program instanceId instanceId before position running ⟨parent, none⟩ rootMember
      have parentless : definition.parentScopeId = none := by
        rcases parented with root | ⟨_, impossible, _⟩
        · exact root.1
        · contradiction
      obtain ⟨staticRoot, _, _, _, _, _, _, rootCensus, _⟩ := analyzeProgram_parent_spine program analysis admitted
      have definitionRoot : definition = staticRoot := by
        have member : definition ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
          List.mem_filter.mpr ⟨definitionMember, by simp [parentless]⟩
        simpa only [rootCensus, List.mem_singleton] using member
      obtain ⟨sourceCensus, sourceParent, _, _⟩ := root_census program seed.root (analyzeProgram_incidence_admission program analysis admitted).1 seed.rootSelected
      have sourceMember := (List.mem_filter.mp (sourceCensus.symm ▸ List.mem_singleton_self seed.root)).1
      have sourceRoot : seed.root = staticRoot := by
        have member : seed.root ∈ program.definitionScopes.filter (·.parentScopeId.isNone) :=
          List.mem_filter.mpr ⟨sourceMember, by simp [sourceParent]⟩
        simpa only [rootCensus, List.mem_singleton] using member
      have parentScope : seed.root.id = parent.definitionScopeId := by rw [sourceRoot, ← definitionRoot]; exact definitionId
      obtain ⟨entryOperation, declared, parsed⟩ := List.mem_filterMap.mp (entries.symm ▸ List.mem_singleton_self analysis.entry)
      have ports := (admitted_entry_position_bindings program analysis admitted seed.root seed.rootSelected entryOperation analysis.entry declared parsed).2.2
      rw [parentScope] at ports
      have bound : ∃ binding, parallelScopeBinding? analysis.entry before candidate.owner = some binding := by
        unfold completeParallelScope? at completed
        obtain ⟨binding, found, _⟩ := Option.bind_eq_some_iff.mp completed
        exact ⟨binding, found⟩
      obtain ⟨binding, bound⟩ := bound
      intro hosting afterRunning
      have control := completeParallelScope_control_frame analysis.entry candidate.owner before after completed
      have same := ProcessControl.running.inj ((control.trans running).symm.trans afterRunning)
      subst hosting
      exact retirement_position program instanceId analysis.entry parent candidate.owner before after binding bound frame position running ports completed
    case completeScope =>
      obtain ⟨_, _, _, _, _, completed, _⟩ := replayed_final_root_completion program analysis admitted before after record rfl replay
      intro _ active
      rw [completed] at active; contradiction
    all_goals cases control : before.control <;>
      simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some] at applied <;> contradiction

private theorem admission_position_invariant (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (selected : programSelected program = true)
    (before : RuntimeState) (boundary : ParallelScopeCommandBoundaryReachable program before)
    (stimulus : Stimulus) (prior : PositionInvariant program before)
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    PositionInvariant program (admitStimulus program before stimulus).state := by
  rcases parallelScope_committed_ingress_kind program selected before stimulus committed with
    ⟨commandId, processId, instanceId, values, rfl, control⟩ | completion
  · rcases boundary.start_certificate program analysis admitted before with rfl | ⟨seed, _, phases⟩
    · obtain ⟨started, _, _⟩ := parallelScope_committed_start_exact program selected commandId processId instanceId values committed
      have builder := started
      unfold runningProgramStartState? at builder
      obtain ⟨root, rootSelected, _⟩ := Option.bind_eq_some_iff.mp builder
      have named : instanceId.value ≠ "" := by
        have accepted : ParallelScopeCommand.stimulusAdmitted program initialState (.startProcess commandId processId instanceId values) = true := by
          cases checked : ParallelScopeCommand.stimulusAdmitted program initialState (.startProcess commandId processId instanceId values) with
          | false => cases snapshot : program.compensationEventSubProcessSnapshots <;> simp [admitStimulus, snapshot, checked] at committed
          | true => rfl
        have nonempty := ParallelScopeCommand.admitted_start_instance_nonempty program initialState commandId processId instanceId values selected accepted
        intro empty; simp [empty] at nonempty
      have stateRunning := runningProgramStartState_control program instanceId values _ started
      intro hosting running
      have same := ProcessControl.running.inj (stateRunning.symm.trans running)
      subst hosting
      exact start_position program analysis admitted root rootSelected instanceId named values _ started
    · rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with ready | ⟨_, _, _, initial, records, _, _, phase⟩
      · have running := runningProgramStartState_control program seed.instanceId seed.values seed.ready seed.started
        rw [ready, running] at control; contradiction
      · exact False.elim (phase.not_notStarted program analysis selected _ seed.parent initial before records control)
  · apply admitStimulus_wait_preserves program before stimulus selected completion (PositionInvariant program) prior
    · intro id values after completed hosting running
      have control := ParallelScopeCommand.completeTask_control_frame program before after id values completed
      have beforeRunning := control.symm.trans running
      exact human_completion_position program analysis admitted hosting before after (prior hosting beforeRunning)
        (boundary.program_valid program analysis admitted before hosting beforeRunning) id values completed
    · intro id values after completed hosting running
      have control := ParallelScopeCommand.completeEffect_success_control_frame program before after id values completed
      have beforeRunning := control.symm.trans running
      exact effect_completion_position program analysis admitted hosting before after (prior hosting beforeRunning)
        (boundary.program_valid program analysis admitted before hosting beforeRunning) id values completed

private theorem batch_position_invariant (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (before after : RuntimeState)
    (_ : ParallelScopeInternalPrefixReachable program before) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState) (prior : PositionInvariant program before)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (endpoint : successors.getLast? = some after) : PositionInvariant program after := by
  have member := List.mem_of_getLast? endpoint
  have control := applyInternalOccurrenceBatch_retirement_frames program before batch successors applied after member
  intro instanceId running
  have beforeRunning := control.1.symm.trans running
  exact batch_position program analysis admitted instanceId before batch successors (prior instanceId beforeRunning) beforeRunning applied after member

/-- Actual internal prefixes preserve every token/place and structural position binding; future publication success is not a premise. -/
theorem ParallelScopeInternalPrefixReachable.runtime_position (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (state : RuntimeState)
    (reachable : ParallelScopeInternalPrefixReachable program state) (instanceId : SemanticId)
    (running : state.control = .running instanceId) : runtimePositionValid program instanceId state = true := by
  have selected : programSelected program = true := by
    cases choice : programSelected program with
    | false => simp [analyzeProgram, choice] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  exact (reachable.invariant_transport program profile (PositionInvariant program)
    (by intro _ running; simp [initialState] at running)
    (fun before boundary stimulus prior committed => admission_position_invariant program analysis admitted selected before boundary stimulus prior committed)
    (fun before after preceding candidate prior applied => singleton_position_invariant program analysis admitted profile before after preceding candidate prior applied)
    (batch_position_invariant program analysis admitted) state) instanceId running

/-- Actual command boundaries retain complete runtime position validity through commit, rejection and atomic rollback. -/
theorem ParallelScopeCommandBoundaryReachable.runtime_position (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (state : RuntimeState)
    (reachable : ParallelScopeCommandBoundaryReachable program state) (instanceId : SemanticId)
    (running : state.control = .running instanceId) : runtimePositionValid program instanceId state = true := by
  have selected : programSelected program = true := by
    cases choice : programSelected program with
    | false => simp [analyzeProgram, choice] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  exact (reachable.invariant_transport program profile (PositionInvariant program)
    (by intro _ running; simp [initialState] at running)
    (fun before boundary stimulus prior committed => admission_position_invariant program analysis admitted selected before boundary stimulus prior committed)
    (fun before after preceding candidate prior applied => singleton_position_invariant program analysis admitted profile before after preceding candidate prior applied)
    (batch_position_invariant program analysis admitted) state) instanceId running

end BpmnSemantics.SemanticProcess
