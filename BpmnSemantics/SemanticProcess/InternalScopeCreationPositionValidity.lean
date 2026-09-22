import BpmnSemantics.SemanticProcess.InternalScopeCreationAdmissionFacts
import BpmnSemantics.SemanticProcess.ScopeInsertionValidity

/-! Runtime-position preservation for complete scope-creation preparations under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private def Hosting (program : Program) (instanceId : SemanticId)
    (scope : DefinitionScope) (occurrence : RuntimeScopeOccurrence) : Prop :=
  occurrence.parent.isNone = true ∧ occurrence.id.processInstanceId = instanceId ∧
    scope.parentScopeId.isNone = true ∧ scope.originElementId.value = program.processId.value

private def Called (state : RuntimeState) (scope : DefinitionScope)
    (occurrence : RuntimeScopeOccurrence) : Prop :=
  ∃ record, state.calledProcessOccurrences.filter (fun record =>
    decide (record.calledRoot = occurrence.id)) = [record] ∧
      record.calledProcessId.value = scope.originElementId.value

private def ScopeFacts (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (occurrence : RuntimeScopeOccurrence) : Prop :=
  ∃ scope, uniqueDefinitionScope? program occurrence.id.definitionScopeId = some scope ∧
    occurrence.id.processInstanceId.value ≠ "" ∧ occurrence.id.activation > 0 ∧
    match scope.parentScopeId, occurrence.parent with
    | none, none => (Hosting program instanceId scope occurrence ∧ ¬ Called state scope occurrence) ∨
        (¬ Hosting program instanceId scope occurrence ∧ Called state scope occurrence)
    | some staticParent, some parent =>
        parent.processInstanceId = occurrence.id.processInstanceId ∧
        parent.definitionScopeId = staticParent ∧ exactLiveOccurrence state parent = true
    | _, _ => False

private def TokenFacts (program : Program) (state : RuntimeState) (token : ControlToken) : Prop :=
  (match uniqueControlPlace? program token.placeId,
      (match program.controlPlaceScopes.filter (fun ownership =>
        decide (ownership.controlPlaceId = token.placeId)) with
      | [ownership] => some ownership.scopeId
      | _ => none) with
    | some _, some staticOwner =>
        staticOwner = token.owner.definitionScopeId && exactLiveOccurrence state token.owner
    | _, _ => false) = true

private def PositionFacts (program : Program) (expected hosting : SemanticId)
    (state : RuntimeState) : Prop :=
  programWellFormed program = true ∧
  ((program.controlPlaces.all fun place => (program.controlPlaces.filter fun candidate =>
    decide (candidate.origin = place.origin)).length = 1) &&
    program.definitionScopes.all fun scope => (program.definitionScopes.filter fun candidate =>
      decide (candidate.originElementId = scope.originElementId)).length = 1) = true ∧
  hosting = expected ∧
  (state.scopeOccurrences.filter fun occurrence =>
    match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
    | none => false
    | some scope => occurrence.parent.isNone && occurrence.id.processInstanceId = hosting &&
        scope.parentScopeId.isNone && scope.originElementId.value = program.processId.value).length = 1 ∧
  calledProcessAssociationsValid state = true ∧
  (∀ occurrence ∈ state.scopeOccurrences, exactLiveOccurrence state occurrence.id = true ∧
    ScopeFacts program hosting state occurrence) ∧
  ∀ token ∈ state.tokens, TokenFacts program state token

private theorem position_iff (program : Program) (expected hosting : SemanticId)
    (state : RuntimeState) (running : state.control = .running hosting) :
    runtimePositionValid program expected state = true ↔ PositionFacts program expected hosting state := by
  change (programWellFormed program &&
    ((program.controlPlaces.all fun place => (program.controlPlaces.filter fun candidate =>
      decide (candidate.origin = place.origin)).length = 1) &&
      program.definitionScopes.all fun scope => (program.definitionScopes.filter fun candidate =>
        decide (candidate.originElementId = scope.originElementId)).length = 1) && (match state.control with
    | .notStarted => state.scopeOccurrences.isEmpty && state.tokens.isEmpty
    | .running instanceId => instanceId = expected &&
        (state.scopeOccurrences.filter fun occurrence =>
          match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
          | none => false
          | some scope => occurrence.parent.isNone && occurrence.id.processInstanceId = instanceId &&
              scope.parentScopeId.isNone && scope.originElementId.value = program.processId.value).length = 1 &&
        calledProcessAssociationsValid state &&
        (state.scopeOccurrences.all fun occurrence => exactLiveOccurrence state occurrence.id &&
          match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
          | none => false
          | some scope => decide (occurrence.id.processInstanceId.value ≠ "") &&
              occurrence.id.activation > 0 &&
              match scope.parentScopeId, occurrence.parent with
              | none, none =>
                  let hosting := occurrence.parent.isNone && occurrence.id.processInstanceId = instanceId &&
                    scope.parentScopeId.isNone && scope.originElementId.value = program.processId.value
                  let called := match state.calledProcessOccurrences.filter (fun record =>
                    decide (record.calledRoot = occurrence.id)) with
                    | [record] => decide (record.calledProcessId.value = scope.originElementId.value)
                    | _ => false
                  (hosting && !called) || (!hosting && called)
              | some staticParent, some parent =>
                  parent.processInstanceId = occurrence.id.processInstanceId &&
                  parent.definitionScopeId = staticParent && exactLiveOccurrence state parent
              | _, _ => false) &&
        state.tokens.all (fun token => match uniqueControlPlace? program token.placeId,
          (match program.controlPlaceScopes.filter (fun ownership =>
            decide (ownership.controlPlaceId = token.placeId)) with
          | [ownership] => some ownership.scopeId
          | _ => none) with
        | some _, some staticOwner => staticOwner = token.owner.definitionScopeId &&
            exactLiveOccurrence state token.owner
        | _, _ => false)
    | .completed instanceId | .cancelled instanceId =>
        instanceId = expected && state.scopeOccurrences.isEmpty && state.tokens.isEmpty
    | .failed instanceId _ =>
        instanceId = expected && state.scopeOccurrences.isEmpty && state.tokens.isEmpty)) = true ↔ _
  rw [running]
  unfold PositionFacts
  simp only [Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq, and_assoc]
  apply and_congr_right; intro _
  apply and_congr_right; intro _
  apply and_congr_right; intro _
  apply and_congr_right; intro _
  apply and_congr_right; intro _
  apply and_congr_right; intro _
  apply and_congr
  · apply forall_congr'; intro occurrence
    apply forall_congr'; intro _
    apply and_congr_right; intro _
    unfold ScopeFacts
    cases definition : uniqueDefinitionScope? program occurrence.id.definitionScopeId with
    | none => simp
    | some scope =>
        simp only [Option.some.injEq, exists_eq_left', Bool.and_eq_true, decide_eq_true_eq, and_assoc]
        apply and_congr_right; intro _
        apply and_congr_right; intro _
        cases staticParent : scope.parentScopeId <;> cases parent : occurrence.parent
        all_goals simp only [Bool.false_eq_true, Bool.and_eq_true, decide_eq_true_eq, and_assoc]
        unfold Hosting Called
        cases records : state.calledProcessOccurrences.filter (fun record =>
          decide (record.calledRoot = occurrence.id)) with
        | nil => simp [parent, staticParent]
        | cons record rest => cases rest <;> simp [parent, staticParent, Bool.or_eq_true,
            Bool.and_eq_true, and_assoc] <;> grind
  · rfl

private theorem definition_unique (program : Program) (id : DefinitionScopeId)
    (scope : DefinitionScope) (found : definitionScope? program id = some scope)
    (origins : (program.definitionScopes.filter fun candidate =>
      decide (candidate.originElementId = scope.originElementId)).length = 1) :
    uniqueDefinitionScope? program id = some scope := by
  unfold definitionScope? at found
  split at found
  · cases found
    obtain ⟨origin, singleton⟩ := List.length_eq_one_iff.mp origins
    simp_all [uniqueDefinitionScope?]
  · contradiction

private theorem called_perm (before after : RuntimeState) (scope : DefinitionScope)
    (occurrence : RuntimeScopeOccurrence)
    (permutation : (after.calledProcessOccurrences.filter fun record =>
      decide (record.calledRoot = occurrence.id)).Perm
        (before.calledProcessOccurrences.filter fun record =>
          decide (record.calledRoot = occurrence.id))) :
    Called after scope occurrence ↔ Called before scope occurrence := by
  constructor
  · rintro ⟨record, singleton, payload⟩
    exact ⟨record, (singleton ▸ permutation.symm).eq_singleton, payload⟩
  · rintro ⟨record, singleton, payload⟩
    exact ⟨record, (singleton ▸ permutation).eq_singleton, payload⟩

private theorem scope_facts_frame (program : Program) (hosting : SemanticId)
    (before after : RuntimeState) (occurrence : RuntimeScopeOccurrence)
    (live : ∀ owner, exactLiveOccurrence before owner = true →
      exactLiveOccurrence after owner = true)
    (calls : ∀ scope, Called after scope occurrence ↔ Called before scope occurrence)
    (valid : ScopeFacts program hosting before occurrence) :
    ScopeFacts program hosting after occurrence := by
  obtain ⟨scope, definition, nonempty, positive, parent⟩ := valid
  refine ⟨scope, definition, nonempty, positive, ?_⟩
  cases static : scope.parentScopeId <;> cases runtime : occurrence.parent
  · simpa only [static, runtime, calls] using parent
  · simp [static, runtime] at parent
  · simp [static, runtime] at parent
  · simp only [static, runtime] at parent ⊢
    exact ⟨parent.1, parent.2.1, live _ parent.2.2⟩

private theorem token_facts_frame (program : Program) (before after : RuntimeState)
    (token : ControlToken)
    (live : ∀ owner, exactLiveOccurrence before owner = true →
      exactLiveOccurrence after owner = true)
    (valid : TokenFacts program before token) : TokenFacts program after token := by
  unfold TokenFacts at valid ⊢
  split at valid
  · next declaration owner place binding =>
      simp only [Bool.and_eq_true, decide_eq_true_eq] at valid ⊢
      exact ⟨valid.1, live _ valid.2⟩
  · contradiction

private theorem position_insert (program : Program) (expected hosting : SemanticId)
    (before after : RuntimeState) (inserted : RuntimeScopeOccurrence)
    (valid : PositionFacts program expected hosting before)
    (scopes : after.scopeOccurrences = insertScopeOccurrence inserted before.scopeOccurrences)
    (tokens : after.tokens = before.tokens)
    (fresh : ∀ occurrence ∈ before.scopeOccurrences, occurrence.id ≠ inserted.id)
    (newValid : ScopeFacts program hosting after inserted)
    (notHosting : ∀ scope, uniqueDefinitionScope? program inserted.id.definitionScopeId = some scope →
      ¬ Hosting program hosting scope inserted)
    (calls : ∀ occurrence ∈ before.scopeOccurrences, ∀ scope,
      Called after scope occurrence ↔ Called before scope occurrence)
    (associations : calledProcessAssociationsValid after = true) :
    PositionFacts program expected hosting after := by
  have live (owner : ScopeOccurrenceId) (old : exactLiveOccurrence before owner = true) :
      exactLiveOccurrence after owner = true := by
    have preserved := exactLiveOccurrence_insertScopeOccurrence_preserves before inserted owner fresh old
    simpa only [exactLiveOccurrence, scopes] using preserved
  obtain ⟨wf, bindings, expectedEq, count, _, oldScopes, oldTokens⟩ := valid
  refine ⟨wf, bindings, expectedEq, ?_, associations, ?_, ?_⟩
  · rw [scopes]
    simp only [insertScopeOccurrence, length_filter_canonicalInsertBy]
    have excluded : (match uniqueDefinitionScope? program inserted.id.definitionScopeId with
      | none => false
      | some scope => inserted.parent.isNone && inserted.id.processInstanceId = hosting &&
          scope.parentScopeId.isNone && scope.originElementId.value = program.processId.value) = false := by
      split
      · rfl
      · next scope definition =>
          apply Bool.eq_false_iff.mpr
          intro accepted
          apply notHosting scope definition
          simpa only [Hosting, Bool.and_eq_true, decide_eq_true_eq, and_assoc] using accepted
    simpa only [excluded, Bool.false_eq_true, ↓reduceIte, Nat.zero_add] using count
  · intro occurrence member
    rw [scopes, mem_insertScopeOccurrence] at member
    rcases member with equal | member
    · subst occurrence
      refine ⟨?_, newValid⟩
      simpa only [exactLiveOccurrence, scopes] using
        exactLiveOccurrence_insertScopeOccurrence_created before inserted fresh
    · exact ⟨live _ (oldScopes occurrence member).1,
        scope_facts_frame program hosting before after occurrence live (calls occurrence member)
          (oldScopes occurrence member).2⟩
  · intro token member
    rw [tokens] at member
    exact token_facts_frame program before after token live (oldTokens token member)

private theorem selection_calls_frame (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected)
    (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ state.scopeOccurrences)
    (scope : DefinitionScope) :
    Called (selected.apply state) scope occurrence ↔ Called state scope occurrence := by
  have fresh := selectInternalScopeCreation_fresh state operation selected found occurrence member
  have recordRoot (record : CalledProcessOccurrence) (called : selected.kind = .called record) :
      record.calledRoot = selected.created.id := by
    unfold selectInternalScopeCreation? at found
    obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
    cases operation
    all_goals first
      | contradiction
      | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
        dsimp only at found
        repeat first | contradiction | split at found
        all_goals cases found
        all_goals cases called
        all_goals rfl
  cases kind : selected.kind with
  | child => simp only [Called, InternalScopeCreationSelection.apply, kind]
  | called record =>
      apply called_perm
      dsimp only [InternalScopeCreationSelection.apply]
      rw [kind]
      have permutation := (sortCallRecords_perm (record :: state.calledProcessOccurrences)).filter
        (fun record => decide (record.calledRoot = occurrence.id))
      simpa only [List.filter_cons, recordRoot record kind, Ne.symm fresh, decide_false,
        Bool.false_eq_true, ↓reduceIte] using permutation

private theorem called_instance_nonempty (caller : SemanticId) (activity : NodeId) (activation : Nat) :
    (deriveCalledProcessInstanceId caller activity activation).value ≠ "" := by
  change "call:" ++ toString caller.value.utf8ByteSize ++ ":" ++ caller.value ++
    ":" ++ toString activity.value.utf8ByteSize ++ ":" ++ activity.value ++ ":" ++
      toString activation ≠ ""
  intro equal
  have size := congrArg String.utf8ByteSize equal
  simp only [String.utf8ByteSize_append] at size
  change 5 + _ + 1 + _ + 1 + _ + 1 + _ + 1 + _ = 0 at size
  omega

private theorem selection_created_facts (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (hosting : SemanticId) (scope : DefinitionScope)
    (running : state.control = .running hosting)
    (found : selectInternalScopeCreation? state operation = some selected)
    (definition : uniqueDefinitionScope? program selected.created.id.definitionScopeId = some scope)
    (matching : internalScopeCreationDefinitionMatches operation selected.owner scope = true)
    (nonempty : selected.owner.processInstanceId.value ≠ "")
    (live : exactLiveOccurrence state selected.owner = true) :
    ScopeFacts program hosting (selected.apply state) selected.created ∧
      (∀ scope, uniqueDefinitionScope? program selected.created.id.definitionScopeId = some scope →
        ¬ Hosting program hosting scope selected.created) := by
  have retainedLive := selectInternalScopeCreation_preserves_live state operation selected
    selected.owner found live
  unfold selectInternalScopeCreation? at found
  simp only [running, bind, Option.bind] at found
  cases operation with
  | enterScope id origin input entry scopeId =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · next selectedGuard =>
          cases found
          have ownerHosting : owner.processInstanceId = hosting := by
            by_cases equal : owner.processInstanceId = hosting
            · exact equal
            · exact False.elim (selectedGuard (by simp [equal]))
          simp only [internalScopeCreationDefinitionMatches, Bool.and_eq_true,
            decide_eq_true_eq] at matching
          refine ⟨⟨scope, definition, ?_, Nat.zero_lt_succ _, ?_⟩, ?_⟩
          · simpa only [ownerHosting] using nonempty
          · simp only [matching.1.2]
            exact ⟨ownerHosting, trivial, retainedLive⟩
          · intro _ _
            simp [Hosting]
  | invokeProcess id origin input process scopeId entry returnOperation =>
      obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals
        simp only [internalScopeCreationDefinitionMatches, Bool.and_eq_true,
          decide_eq_true_eq] at matching
        have ownerHosting : owner.processInstanceId = hosting := by assumption
        have different : deriveCalledProcessInstanceId owner.processInstanceId origin.elementId
            (callActivationCount state origin.elementId + 1) ≠ hosting := by
          rw [← ownerHosting]
          exact calledProcessIdentity_differs_from_caller _ _ _
        let rootId : ScopeOccurrenceId :=
          { processInstanceId := deriveCalledProcessInstanceId owner.processInstanceId
              origin.elementId (callActivationCount state origin.elementId + 1)
            definitionScopeId := scopeId, activation := 1 }
        have notHosting (definition : DefinitionScope) :
            ¬ Hosting program hosting definition { id := rootId, parent := none } := by
          intro accepted
          exact different accepted.2.1
        refine ⟨⟨scope, definition, called_instance_nonempty _ _ _, Nat.zero_lt_succ 0, ?_⟩,
          fun definition _ => notHosting definition⟩
        simp only [matching.1.2]
        refine Or.inr ⟨notHosting scope, ?_⟩
        unfold Called
        let record : CalledProcessOccurrence :=
          { id :=
              { processInstanceId := owner.processInstanceId
                elementId := ⟨origin.elementId.value⟩
                activation := callActivationCount state origin.elementId + 1 }
            caller := owner, calledProcessId := process, calledRoot := rootId,
            returnOperationId := returnOperation }
        refine ⟨record, ?_, matching.2.symm⟩
        change (sortCallRecords (record :: state.calledProcessOccurrences)).filter
          (fun candidate => decide (candidate.calledRoot = rootId)) = [record]
        apply List.Perm.eq_singleton
        have permutation := (sortCallRecords_perm (record :: state.calledProcessOccurrences)).filter
          (fun candidate => decide (candidate.calledRoot = rootId))
        have absent : state.calledProcessOccurrences.filter (fun record =>
            decide (record.calledRoot =
              { processInstanceId := deriveCalledProcessInstanceId owner.processInstanceId
                  origin.elementId (callActivationCount state origin.elementId + 1)
                definitionScopeId := scopeId, activation := 1 })) = [] := by
          apply List.filter_eq_nil_iff.mpr
          intro old member
          simp only [decide_eq_true_eq]
          intro equal
          have excluded : (state.calledProcessOccurrences.filter fun candidate =>
            decide (candidate.id =
                { processInstanceId := owner.processInstanceId, elementId := ⟨origin.elementId.value⟩,
                  activation := callActivationCount state origin.elementId + 1 } ||
              candidate.calledRoot.processInstanceId = deriveCalledProcessInstanceId
                owner.processInstanceId origin.elementId
                  (callActivationCount state origin.elementId + 1))).length = 0 := by assumption
          have denied := List.filter_eq_nil_iff.mp (List.length_eq_zero_iff.mp excluded) old member
          exact denied (by simp [equal])
        simpa only [List.filter_cons, show record.calledRoot = rootId from rfl,
          decide_true, ↓reduceIte, show state.calledProcessOccurrences.filter
            (fun candidate => decide (candidate.calledRoot = rootId)) = [] from absent] using permutation
  | _ => simp at found

/-- Child insertion is shared by ordinary and bounded entry. Its facts describe the selected
patch and predecessor checks, without requiring an extra operation in the Program. -/
theorem selectedScopeCreation_preserves_runtimePositionValid
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection) (instanceId hosting : SemanticId)
    (ownerRecord : RuntimeScopeOccurrence) (origin : BpmnElementOrigin)
    (scope : DefinitionScope) (delta : PublicControlPositionDelta)
    (valid : runtimePositionValid program instanceId state = true)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (running : state.control = .running hosting)
    (ownerExact : state.scopeOccurrences.filter (fun candidate => decide (candidate.id = selected.owner)) =
      [ownerRecord])
    (definition : definitionScope? program selected.created.id.definitionScopeId = some scope)
    (checks : internalScopeCreationPredecessorChecks program state operation selected origin scope = true)
    (position : internalScopeCreationPositionDelta? program selected = some delta)
    (callSeparated : ∀ record, selected.kind = .called record →
      selected.created.id.definitionScopeId ≠ selected.owner.definitionScopeId) :
    runtimePositionValid program instanceId (selected.apply state) = true := by
  have facts := (position_iff program instanceId hosting state running).mp valid
  have calls := selectInternalScopeCreation_preserves_callAssociations state operation selected
    selection facts.2.2.2.2.1 callSeparated
  obtain ⟨_, matching, _, _, nonempty, _⟩ :=
    internalScopeCreationPredecessorChecks_facts program state operation selected origin scope checks
  obtain ⟨_, produced, declared, _, outputFound, declaredFound, _, origins, _⟩ :=
    internalScopeCreationPositionDelta_facts program selected delta position
  have same : declared = scope := Option.some.inj (declaredFound.symm.trans definition)
  subst declared
  have unique := definition_unique program selected.created.id.definitionScopeId scope definition origins
  have live : exactLiveOccurrence state selected.owner = true := by
    simp [exactLiveOccurrence, ownerExact]
  have created := selection_created_facts program state operation selected hosting scope
    running selection unique matching nonempty live
  let inserted : RuntimeState := { selected.apply state with tokens := state.tokens }
  have scopes : inserted.scopeOccurrences = insertScopeOccurrence selected.created state.scopeOccurrences := by
    cases kind : selected.kind <;> simp [inserted, InternalScopeCreationSelection.apply, kind]
  have afterRunning : inserted.control = .running hosting := by
    cases kind : selected.kind <;> simpa [inserted, InternalScopeCreationSelection.apply, kind] using running
  have insertedValid : runtimePositionValid program instanceId inserted = true := by
    apply (position_iff program instanceId hosting inserted afterRunning).mpr
    apply position_insert program instanceId hosting state inserted selected.created facts scopes rfl
      (selectInternalScopeCreation_fresh state operation selected selection)
    · exact created.1
    · exact created.2
    · exact selection_calls_frame state operation selected selection
    · exact calls
  let removed : RuntimeState := { inserted with tokens := removeToken state.tokens selected.input selected.owner }
  have removedValid : runtimePositionValid program instanceId removed = true :=
    runtimePositionValid_tokens_sublist_frame program instanceId inserted removed insertedValid
      rfl rfl rfl (removeToken_sublist state.tokens selected.input selected.owner)
  have newLive : exactLiveOccurrence removed selected.created.id = true := by
    exact selectInternalScopeCreation_created_live state operation selected selection
  have bindings := selectedInputOrigin?_exact_bindings program selected.entry selected.created.id
    produced (internalLocalControlPlaceOrigin?_selectedInputOrigin _ _ _ _ outputFound)
  have result := runtimePositionValid_addToken program instanceId removed selected.entry selected.created.id
    removedValid newLive bindings.1 bindings.2
  cases kind : selected.kind <;>
    simpa only [removed, inserted, InternalScopeCreationSelection.apply, kind] using result

/-- Complete predecessor preparation preserves the unchanged runtime position predicate, including
the called Process payload and the exclusive hosting/called root association. -/
theorem prepareInternalScopeCreation_preserves_runtimePositionValid
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (prepared : PreparedInternalScopeCreation) (instanceId : SemanticId)
    (programWF : programWellFormed program = true)
    (valid : runtimePositionValid program instanceId state = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    runtimePositionValid program instanceId (prepared.selection.apply state) = true := by
  have callSeparated := prepareInternalScopeCreation_called_definition_ne_owner
    program state operation prepared
  obtain ⟨selected, hosting, ownerRecord, origin, scope, start, delta, selection, running,
    _, _, ownerExact, _, definition, checks, _, position, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation prepared found
  exact selectedScopeCreation_preserves_runtimePositionValid program state operation selected
    instanceId hosting ownerRecord origin scope delta valid selection running ownerExact definition checks
    position (fun record kind => callSeparated record programWF found kind)

end BpmnSemantics.SemanticProcess.InternalCommutation
