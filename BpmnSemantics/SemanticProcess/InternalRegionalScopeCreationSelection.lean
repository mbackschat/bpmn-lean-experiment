import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationGraph
import BpmnSemantics.SemanticProcess.InternalRegionalArmingSelectionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairSelectionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalScopeCreationCalls
import BpmnSemantics.SemanticProcess.InternalRegionalControlFields

/-! Scope creation preserves regional selectors through their exact queried populations. Fresh identity alone is insufficient: independence also protects the inserted parent and Call edges, token censuses, and quiescence. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem selection_query_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (found : selectInternalRegional? program before operation = some selected)
    (control : after.control = before.control)
    (scopes : ∀ owner, 0 < (before.scopeOccurrences.filter (fun scope => decide (scope.id = owner))).length →
      after.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) =
        before.scopeOccurrences.filter (fun scope => decide (scope.id = owner)))
    (live : ∀ owner, before.scopeOccurrences.any (fun scope => scope.id == owner) = true →
      after.scopeOccurrences.any (fun scope => scope.id == owner) = true)
    (associations : calledProcessAssociationsValid after = true)
    (pending : after.initiationPending = before.initiationPending)
    (quiet : scopeQuiescent after selected.root.id = scopeQuiescent before selected.root.id)
    (withdrawal : ∀ definition choice, selectInternalCompletionWithdrawal? program before definition = some choice →
      selectInternalCompletionWithdrawal? program after definition = some choice)
    (populations : match (generalizing := false) operation with
      | .returnProcess id origin _ _ _ =>
          after.calledProcessOccurrences.filter (fun record => decide
            (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value)) =
          before.calledProcessOccurrences.filter (fun record => decide
            (record.returnOperationId = id && record.id.elementId.value = origin.elementId.value)) ∧
          ∀ record, selected.kind = .returning record →
            after.scopeOccurrences.filter (fun scope => decide
              (scope.id.processInstanceId = record.calledRoot.processInstanceId && scope.parent.isNone)) =
            before.scopeOccurrences.filter (fun scope => decide
              (scope.id.processInstanceId = record.calledRoot.processInstanceId && scope.parent.isNone))
      | .completeScope _ _ definition _ =>
          after.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) =
            before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition))
      | _ => True)
    (inputs : match (generalizing := false) operation with
      | .throwError _ _ input _ _ =>
          onlyTokenOwner? after input = onlyTokenOwner? before input ∧
          after.tokens.filter (fun token => decide (token.placeId = input && token.owner = selected.root.id)) =
            before.tokens.filter (fun token => decide (token.placeId = input && token.owner = selected.root.id))
      | .terminateScope id origin input definition => ∀ owner,
          selectedTerminateOwner? program before id origin input definition = some owner →
          selectedTerminateOwner? program after id origin input definition = some owner
      | _ => True) :
    selectInternalRegional? program after operation = some selected := by
  have running : runningInstance? after = runningInstance? before := by simp only [runningInstance?, control]
  unfold selectInternalRegional? at found ⊢
  obtain ⟨hosting, hosted, found⟩ := Option.bind_eq_some_iff.mp found
  rw [running, hosted]
  dsimp only [Option.bind_some]
  cases operation with
  | returnProcess id origin process definition output =>
      dsimp only at found ⊢
      rw [populations.1]
      repeat' first | (solve | simp at found) | split at found
      all_goals
        rename_i valid _ record returnCensus processEq definitionEq _ root rootCensus parentless callerCount processCount quiescent
        cases found
        have rootAfter := scopes record.calledRoot (by simp [rootCensus])
        have callerAfter := scopes record.caller (by omega)
        have processAfter := populations.2 record rfl
        simp_all only [↓reduceIte]
  | completeScope id origin definition output =>
      dsimp only at found ⊢
      rw [populations]
      split at found
      · split at found
        · contradiction
        · obtain ⟨choice, chosen, found⟩ := Option.bind_eq_some_iff.mp found
          have afterChoice := withdrawal definition choice chosen
          repeat' first | (solve | simp at found) | split at found
          all_goals cases found
          all_goals first
            | (rename_i parent output parentEq outputEq present
               have parentAfter := live parent (by simpa using present)
               simp_all only [Bool.false_eq_true, ↓reduceIte, Option.bind_eq_bind, Option.bind_some])
            | simp_all only [Bool.false_eq_true, ↓reduceIte, Option.bind_eq_bind, Option.bind_some]
      · contradiction
  | throwError id origin input error handler =>
      dsimp only at found ⊢
      rw [inputs.1]
      obtain ⟨owner, offered, found⟩ := Option.bind_eq_some_iff.mp found
      rw [offered]
      split at found
      · contradiction
      · split at found
        · contradiction
        · split at found
          · rename_i root census
            obtain ⟨parent, parentFound, found⟩ := Option.bind_eq_some_iff.mp found
            split at found
            · rename_i parentCount
              cases found
              have identity := scope_identity_of_census before owner root census
              rw [identity] at inputs
              have rootAfter := scopes owner (by simp [census])
              have parentAfter := scopes parent (by omega)
              simp_all only [Option.bind_eq_bind, Option.bind_some, ↓reduceIte]
            · contradiction
          · contradiction
  | terminateScope id origin input definition =>
      dsimp only at found ⊢
      obtain ⟨owner, chosen, found⟩ := Option.bind_eq_some_iff.mp found
      rw [inputs owner chosen]
      split at found
      · rename_i root census
        cases found
        simp only [Option.bind_eq_bind, Option.bind_some, scopes owner (by simp [census]), census]
      · contradiction
  | _ => contradiction

theorem scopeCreation_regional_quiescent (state : RuntimeState)
    (creation : InternalScopeCreationSelection) (region : InternalOccurrenceRegion)
    (owner : ScopeOccurrenceId) (inside : region.contains owner = true)
    (outside : region.contains creation.owner = false ∧ region.contains creation.created.id = false ∧
      creation.created.parent.any region.contains = false ∧
      ∀ record, creation.kind = .called record → region.ownsCall record = false) :
    scopeQuiescent (creation.apply state) owner = scopeQuiescent state owner := by
  have consumed : creation.owner ≠ owner := by intro same; simp [same, inside] at outside
  have produced : creation.created.id ≠ owner := by intro same; simp [same, inside] at outside
  have parent : creation.created.parent ≠ some owner := by intro same; simp [same, inside] at outside
  have tokenFilter := scopeCreation_apply_token_filter state creation (fun token => token.owner == owner)
    (by simpa using consumed) (by simpa using produced)
  have tokenAny := scopeCreation_any_population_frame _ _ _ tokenFilter
  have scopeFilter := scopeCreation_apply_scope_filter state creation
    (fun scope => scope.parent == some owner) (by simpa using parent)
  have scopeAny := scopeCreation_any_population_frame _ _ _ scopeFilter
  have callAny : (creation.apply state).calledProcessOccurrences.any (fun record => record.caller == owner) =
      state.calledProcessOccurrences.any (fun record => record.caller == owner) := by
    cases kind : creation.kind with
    | child => simp only [InternalScopeCreationSelection.apply, kind]
    | called record =>
        have edge := outside.2.2.2 record kind
        have rejected : (record.caller == owner) = false := by
          have different : record.caller ≠ owner := by
            intro same
            simp [InternalOccurrenceRegion.ownsCall, same, inside] at edge
          simpa using different
        simp only [InternalScopeCreationSelection.apply, kind]
        rw [(sortCallRecords_perm _).any_eq]
        simp [rejected]
  unfold scopeQuiescent
  rw [tokenAny, scopeAny, callAny]
  cases kind : creation.kind <;> simp only [InternalScopeCreationSelection.apply, kind]

private theorem created_parent (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected) :
    selected.created.parent = match selected.kind with | .child => some selected.owner | .called _ => none := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨_, _, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found <;> rfl

theorem scopeCreation_existing_child_definition (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (creation : InternalScopeCreationSelection)
    (programValid : programWellFormed program = true)
    (beforeValid : runtimePositionValid program hosting state = true)
    (afterValid : runtimePositionValid program hosting (creation.apply state) = true)
    (running : state.control = .running hosting)
    (found : selectInternalScopeCreation? state operation = some creation)
    (child : RuntimeScopeOccurrence) (member : child ∈ state.scopeOccurrences)
    (parent : child.parent ≠ none) :
    creation.created.id.definitionScopeId ≠ child.id.definitionScopeId := by
  cases kind : creation.kind with
  | child =>
      have absent := (scopeCreation_selection_child_facts state operation creation hosting running found kind).2.2.2
      intro same
      have present : state.scopeOccurrences.any (fun scope =>
          scope.id.definitionScopeId == creation.created.id.definitionScopeId) = true :=
        List.any_eq_true.mpr ⟨child, member, by simp [same]⟩
      rw [present] at absent
      contradiction
  | called record =>
      have parentless : creation.created.parent = none := by simpa [kind] using created_parent state operation creation found
      have inserted : creation.created ∈ (creation.apply state).scopeOccurrences := by
        simp only [InternalScopeCreationSelection.apply, kind]
        exact (mem_insertScopeOccurrence _ _ _).mpr (.inl rfl)
      obtain ⟨_, oldDef, oldMember, oldId, oldBinding⟩ :=
        runtimePositionValid_scope_parent_binding program hosting hosting state beforeValid running child member
      obtain ⟨_, newDef, newMember, newId, newBinding⟩ :=
        runtimePositionValid_scope_parent_binding program hosting hosting (creation.apply state) afterValid
          ((scopeCreation_apply_control state creation).trans running) creation.created inserted
      have oldParent : oldDef.parentScopeId ≠ none := by
        rcases oldBinding with ⟨_, absent⟩ | ⟨owner, _, owned, _, _⟩
        · exact False.elim (parent absent)
        · simp [owned]
      have newParent : newDef.parentScopeId = none := by
        rcases newBinding with ⟨absent, _⟩ | ⟨owner, present, _, _, _⟩
        · exact absent
        · simp [parentless] at present
      intro same
      have oldLookup := programWellFormed_definition_lookup_of_member program oldDef programValid oldMember
      have newLookup := programWellFormed_definition_lookup_of_member program newDef programValid newMember
      have ids : newDef.id = oldDef.id := newId.trans (same.trans oldId.symm)
      rw [ids, oldLookup] at newLookup
      have equal : oldDef = newDef := Option.some.inj newLookup
      exact oldParent (equal ▸ newParent)

private theorem completion_withdrawal (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (creation : InternalScopeCreationSelection)
    (programValid : programWellFormed program = true)
    (beforeValid : runtimePositionValid program hosting state = true)
    (afterValid : runtimePositionValid program hosting (creation.apply state) = true)
    (running : state.control = .running hosting)
    (found : selectInternalScopeCreation? state operation = some creation)
    (definition : DefinitionScopeId) (choice : InternalCompletionWithdrawal)
    (selected : selectInternalCompletionWithdrawal? program state definition = some choice) :
    selectInternalCompletionWithdrawal? program (creation.apply state) definition = some choice := by
  cases choice with
  | unbounded => exact (completionWithdrawal_unbounded program _ definition
      (completionWithdrawal_unbounded_facts program state definition selected)).1
  | bounded record deadline =>
      obtain ⟨declaration, child, parent, attached, declarations, children, parentEq,
        actual, recordOwner, handlers, element, census, deadlineOwner⟩ :=
        completionWithdrawal_bounded_facts program state definition record deadline selected
      have filtered : child ∈ state.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) := by
        rw [children]; simp
      obtain ⟨member, named⟩ := List.mem_filter.mp filtered
      have different := scopeCreation_existing_child_definition program state hosting operation creation
        programValid beforeValid afterValid running found child member (by simp [parentEq])
      have afterChildren := scopeCreation_apply_scope_filter state creation
        (fun scope => decide (scope.id.definitionScopeId = definition)) (by
          simpa only [of_decide_eq_true named, decide_eq_false_iff_not] using different)
      apply completionWithdrawal_bounded_of_facts program (creation.apply state) definition
        declaration child parent record attached deadline declarations
      · simpa only [afterChildren] using children
      · exact parentEq
      · cases kind : creation.kind <;> simpa only [InternalScopeCreationSelection.apply, kind] using actual
      · exact recordOwner
      · exact handlers
      · exact element
      · cases kind : creation.kind <;> simpa only [InternalScopeCreationSelection.apply, kind] using census
      · exact deadlineOwner

/-- Complete predecessor preparation and dependency independence preserve the raw regional selector, including its singleton censuses and bounded withdrawal. -/
theorem selectInternalRegional_after_independent_scopeCreation
    (program : Program) (state : RuntimeState)
    (operation creationOperation : SemanticOperation)
    (regional : PreparedInternalRegional) (creation : PreparedInternalScopeCreation)
    (programValid : programWellFormed program = true)
    (valid : runtimeStateWellFormed program creation.runtimeInstanceId state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (creationFound : prepareInternalScopeCreation? program state creationOperation = some creation)
    (independent : regionalStateFootprintsIndependent regional.footprint
      (liftRegionalStateFootprint creation.selection.owner creation.footprint) = true) :
    selectInternalRegional? program (creation.selection.apply state) operation = some regional.selection := by
  have afterValid := prepareInternalScopeCreation_preserves_runtimeStateWellFormed
    program creation.runtimeInstanceId state creationOperation creation programValid valid creationFound
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state creationOperation creation creationFound
  dsimp only [makeInternalScopeCreationPreparation] at valid afterValid independent ⊢
  have position : runtimePositionValid program hosting state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have afterPosition : runtimePositionValid program hosting (selected.apply state) = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterValid
    exact afterValid.1
  obtain ⟨_, _, _, closed, derived, footprint, published⟩ :=
    prepareInternalRegional_facts program state operation regional regionalFound
  have found := (ownershipClosedSelection_facts program state operation regional.selection closed).1
  have operationEq := regionalSelection_operation program state operation regional.selection found
  have rootMember := regionalSelection_root_member program state operation regional.selection found
  have outside := scopeCreation_regional_outside state regional.selection regional.region regional.footprint
    selected hosting ownerRecord footprint independent
  have inside : regional.region.contains regional.selection.root.id = true :=
    List.contains_iff_mem.mpr (deriveInternalOccurrenceRegion_spec state _ _ derived).2.1
  have fresh := selectInternalScopeCreation_fresh state creationOperation selected selection
  have scopes (owner : ScopeOccurrenceId)
      (positive : 0 < (state.scopeOccurrences.filter (fun scope => decide (scope.id = owner))).length) :
      (selected.apply state).scopeOccurrences.filter (fun scope => decide (scope.id = owner)) =
        state.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) := by
    apply scopeCreation_apply_scope_filter
    cases census : state.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) with
    | nil => simp [census] at positive
    | cons scope tail =>
        have member : scope ∈ state.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) := by rw [census]; simp
        obtain ⟨member, named⟩ := List.mem_filter.mp member
        have different := fresh scope member
        simp only [of_decide_eq_true named] at different
        simpa [ne_comm] using different
  have inputFilter (input : ControlPlaceId) (read : .ordinary (.tokenOwners input) ∈ regional.footprint.reads) :
      (selected.apply state).tokens.filter (fun token => decide (token.placeId = input)) =
        state.tokens.filter (fun token => decide (token.placeId = input)) := by
    have distinct (place : ControlPlaceId) (member : place ∈ [selected.input, selected.entry]) : place ≠ input := by
      have separate := regional_independent_write_read _ _ independent _ _
        (List.mem_map.mpr ⟨_, scopeCreation_census_write selected hosting ownerRecord place member, rfl⟩) read
      intro same
      simp [liftRegionalStateAtom, regionalStateAtomsConflict, same] at separate
    exact scopeCreation_apply_token_filter state selected _
      (by simpa using distinct selected.input (by simp)) (by simpa using distinct selected.entry (by simp))
  apply selection_query_frame program state (selected.apply state) operation regional.selection found
    (scopeCreation_apply_control state selected) scopes
  · intro owner present
    obtain ⟨scope, member, named⟩ := List.any_eq_true.mp present
    apply List.any_eq_true.mpr
    refine ⟨scope, ?_, named⟩
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
    all_goals exact (mem_insertScopeOccurrence _ _ _).mpr (.inr member)
  · exact runtimePositionValid_called_associations program hosting hosting (selected.apply state)
      afterPosition ((scopeCreation_apply_control state selected).trans running)
  · cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  · exact scopeCreation_regional_quiescent state selected regional.region regional.selection.root.id inside outside
  · exact completion_withdrawal program state hosting creationOperation selected programValid
      position afterPosition running selection
  · cases operation with
    | returnProcess id returnOrigin process rootDefinition output =>
        obtain ⟨record, kind, rootId, census⟩ := regionalSelection_return_record program state
          id returnOrigin process rootDefinition output regional.selection found
        have present : record ∈ state.calledProcessOccurrences.filter (fun record => decide
            (record.returnOperationId = id && record.id.elementId.value = returnOrigin.elementId.value)) := by
          rw [census]; simp
        obtain ⟨member, named⟩ := List.mem_filter.mp present
        have named := of_decide_eq_true named
        simp only [Bool.and_eq_true, decide_eq_true_eq] at named
        refine ⟨?_, ?_⟩
        · cases creationKind : selected.kind with
          | child => simp only [InternalScopeCreationSelection.apply, creationKind]
          | called inserted =>
              obtain ⟨_, _, current, _, _, _, _, _, opened, _, _, _⟩ :=
                regionalPublicationTemplate_facts program state regional.selection regional.region _ published
              have allValidity := (projectOpenFlowNodeOccurrences_validities program state current hosting running opened).1
              have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
                simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true, and_assoc] at allValidity
                exact allValidity.1
              have callers := regionalScopeCreation_call_caller_eq program state hosting record inserted
                creationOperation selected position structural running member selection creationKind
              obtain ⟨_, _, _, _, _, absent, _, _⟩ := scopeCreation_selection_call_facts
                state creationOperation selected inserted hosting running selection creationKind
              have rejected : decide (inserted.returnOperationId = id &&
                  inserted.id.elementId.value = returnOrigin.elementId.value) = false := by
                apply decide_eq_false_iff_not.mpr
                intro matching
                simp only [Bool.and_eq_true, decide_eq_true_eq] at matching
                have old : record ∈ state.calledProcessOccurrences.filter (fun candidate =>
                    candidate.caller = selected.owner && candidate.id.elementId.value = inserted.id.elementId.value) :=
                  List.mem_filter.mpr ⟨member, by simp [callers, named.2, matching.2]⟩
                rw [List.length_eq_zero_iff.mp absent] at old
                contradiction
              simp only [InternalScopeCreationSelection.apply, creationKind]
              have perm := (sortCallRecords_perm (inserted :: state.calledProcessOccurrences)).filter
                (fun record => decide (record.returnOperationId = id && record.id.elementId.value = returnOrigin.elementId.value))
              simp only [List.filter_cons, rejected, Bool.false_eq_true, ↓reduceIte, census] at perm ⊢
              exact List.perm_singleton.mp perm
        · intro actual actualKind
          have same : actual = record := by simpa only [kind, InternalRegionalKind.returning.injEq] using actualKind.symm
          subst actual
          apply scopeCreation_apply_scope_filter
          cases creationKind : selected.kind with
          | child => simp [created_parent state creationOperation selected selection, creationKind]
          | called inserted =>
              obtain ⟨_, _, _, _, _, _, absent, _⟩ := scopeCreation_selection_call_facts
                state creationOperation selected inserted hosting running selection creationKind
              have different : selected.created.id.processInstanceId ≠ record.calledRoot.processInstanceId := by
                intro same
                have old : regional.selection.root ∈ state.scopeOccurrences.filter (fun scope => decide
                    (scope.id.processInstanceId = selected.created.id.processInstanceId)) :=
                  List.mem_filter.mpr ⟨rootMember, by simp [rootId, same]⟩
                rw [List.length_eq_zero_iff.mp absent] at old
                contradiction
              simp [different]
    | completeScope id completeOrigin rootDefinition output =>
        obtain ⟨withdrawal, kind, census⟩ := regionalSelection_complete_census program state id completeOrigin
          rootDefinition output regional.selection found
        have parent : regional.selection.root.parent ≠ none := by
          intro absent
          obtain ⟨base, baseFound, included⟩ := regional_footprint_base state hosting regional.selection
            regional.region regional.footprint running footprint
          simp only [regionalBaseFootprint?, operationEq, kind, absent] at baseFound
          cases output with
          | some place => contradiction
          | none =>
              cases baseFound
              have written := included (.ordinary (.runtimeControl hosting)) (by simp)
              have read : liftRegionalStateAtom selected.owner (.runtimeControl hosting) ∈
                  (liftRegionalStateFootprint selected.owner
                    (internalScopeCreationStateFootprint selected hosting ownerRecord)).reads :=
                List.mem_map.mpr ⟨_, by simp [internalScopeCreationStateFootprint, canonicalStateAtomSet, mem_sortBy], rfl⟩
              have clash := regional_independent_read_write _ _ independent _ _ written read
              simp [liftRegionalStateAtom, regionalStateAtomsConflict] at clash
        have filtered : regional.selection.root ∈ state.scopeOccurrences.filter
            (fun scope => decide (scope.id.definitionScopeId = rootDefinition)) := by rw [census]; simp
        have named := of_decide_eq_true (List.mem_filter.mp filtered).2
        have different := scopeCreation_existing_child_definition program state hosting creationOperation selected
          programValid position afterPosition running selection regional.selection.root rootMember parent
        apply scopeCreation_apply_scope_filter
        simpa only [named, decide_eq_false_iff_not] using different
    | _ => trivial
  · have read := regionalStateFootprint_selector_read state regional.selection regional.region regional.footprint footprint
    rw [operationEq] at read
    cases operation with
    | throwError id errorOrigin input error handler =>
        have filter := inputFilter input read
        refine ⟨?_, ?_⟩
        · simp only [onlyTokenOwner?, tokenOwners, filter]
        · have buckets := congrArg (List.filter (fun token : ControlToken => decide (token.owner = regional.selection.root.id))) filter
          simpa only [List.filter_filter, Bool.and_comm, Bool.decide_and, Bool.decide_eq_true] using buckets
    | terminateScope id terminateOrigin input scopeId =>
        intro owner chosen
        have census : tokenOwners (selected.apply state) input = tokenOwners state input := by
          simp only [tokenOwners, inputFilter input read]
        unfold selectedTerminateOwner? at chosen ⊢
        rw [scopeCreation_apply_control, census]
        repeat' first | (solve | simp at chosen) | split at chosen
        all_goals cases chosen
        all_goals rename_i count
        all_goals have scopeQuery := scopes owner (by omega)
        all_goals simp_all only [↓reduceIte, Bool.false_eq_true, and_self]
    | _ => trivial

end BpmnSemantics.SemanticProcess.InternalCommutation
