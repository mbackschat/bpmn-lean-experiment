import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionValidity
import BpmnSemantics.SemanticProcess.InternalLocalControlTokenValidity
import BpmnSemantics.SemanticProcess.CallStorageOrder
import BpmnSemantics.SemanticProcess.ScopeCreationCompensationValidity
import BpmnSemantics.SemanticProcess.ScopeCreationLifecycleStructuralValidity
import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeLaws

/-! Aggregate validity of actual scope creation under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem incidents_insert (state : RuntimeState) (inserted : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (valid : effectIncidentAssociationsValid state = true) :
    effectIncidentAssociationsValid
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } =
      true := by
  unfold effectIncidentAssociationsValid at valid ⊢
  cases incidents : state.effectIncidents with
  | nil => simp
  | cons incident rest =>
      cases rest with
      | cons other rest => simp [incidents] at valid
      | nil =>
          simp only [incidents] at valid ⊢
          simp only [effectIncidentAssociationValid, Bool.and_eq_true] at valid ⊢
          refine ⟨⟨⟨⟨⟨valid.1.1.1.1.1, valid.1.1.1.1.2⟩, valid.1.1.1.2⟩, ?_⟩,
            valid.1.2⟩, valid.2⟩
          have owner := valid.1.1.2
          unfold effectWaitOwnerAssociationValid at owner ⊢
          cases control : state.control <;> simp only [control] at owner ⊢
          all_goals try contradiction
          simp only [Bool.and_eq_true] at owner ⊢
          refine ⟨owner.1, ?_⟩
          have compare (left right : ScopeOccurrenceId) : (left == right) = decide (left = right) := by
            by_cases same : left = right <;> simp [same]
          have live : exactLiveOccurrence state incident.wait.owner = true := by
            simpa only [exactLiveOccurrence, compare, decide_eq_true_eq] using owner.2
          have preserved := exactLiveOccurrence_insertScopeOccurrence_preserves state inserted
            incident.wait.owner fresh live
          simpa only [exactLiveOccurrence, compare, decide_eq_true_eq] using preserved

theorem scopeCreation_preserves_canonicalCollectionOrder (state : RuntimeState) (selected : InternalScopeCreationSelection)
    (ordered : canonicalCollectionOrder state = true) :
    canonicalCollectionOrder (selected.apply state) = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at ordered
  obtain ⟨tokens, activityCounters, tasks, taskCounters, messages, timers, effects, messageCounters,
    timerCounters, effectCounters, variables, selections, races, calls, activities, sequential,
    parallel, scopes, scopeCounters, callCounters, raceCounters⟩ := ordered
  have newTokens := orderedBy_addToken _ selected.entry selected.created.id
    (orderedBy_removeToken state.tokens selected.input selected.owner tokens)
  have newScopes := orderedBy_insertScopeOccurrence selected.created state.scopeOccurrences scopes
  cases kind : selected.kind with
  | child =>
      have newCounter := orderedBy_setScopeActivationCount state.scopeActivations
        selected.created.id.definitionScopeId selected.created.id.activation scopeCounters
      simpa only [InternalScopeCreationSelection.apply, kind, canonicalCollectionOrder,
        Bool.and_eq_true, and_assoc] using
        ⟨newTokens, activityCounters, tasks, taskCounters, messages, timers, effects, messageCounters,
          timerCounters, effectCounters, variables, selections, races, calls, activities, sequential,
          parallel, newScopes, newCounter, callCounters, raceCounters⟩
  | called record =>
      have newCounter := orderedBy_setCallActivationCount state
        ⟨record.id.elementId.value⟩ record.id.activation callCounters
      have newCalls := orderedBy_sortCallRecords (record :: state.calledProcessOccurrences)
      simpa only [InternalScopeCreationSelection.apply, kind, canonicalCollectionOrder,
        Bool.and_eq_true, and_assoc] using
        ⟨newTokens, activityCounters, tasks, taskCounters, messages, timers, effects, messageCounters,
          timerCounters, effectCounters, variables, selections, races, newCalls, activities, sequential,
          parallel, newScopes, scopeCounters, newCounter, raceCounters⟩

private theorem selected_call_caller (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection) (record : CalledProcessOccurrence)
    (found : selectInternalScopeCreation? state operation = some selected)
    (kind : selected.kind = .called record) : record.caller = selected.owner := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals try (split at found)
  all_goals first
    | contradiction
    | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat first | contradiction | split at found
      all_goals cases found
      all_goals cases kind
      all_goals rfl

private theorem creation_waitOwners (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected)
    (live : exactLiveOccurrence state selected.owner = true)
    (valid : waitOwnersLive state = true) : waitOwnersLive (selected.apply state) = true := by
  have fresh := selectInternalScopeCreation_fresh state operation selected found
  have previous := waitOwnersLive_insertScopeOccurrence state selected.created fresh valid
  cases kind : selected.kind with
  | child => simpa only [InternalScopeCreationSelection.apply, kind, waitOwnersLive,
      exactLiveOccurrence] using previous
  | called record =>
      have caller := selected_call_caller state operation selected record found kind
      have callerLive := exactLiveOccurrence_insertScopeOccurrence_preserves state selected.created
        selected.owner fresh live
      simp only [waitOwnersLive, Bool.and_eq_true] at previous
      simp only [InternalScopeCreationSelection.apply, kind, waitOwnersLive, Bool.and_eq_true]
      refine ⟨⟨⟨⟨⟨⟨⟨⟨previous.1.1.1.1.1.1.1.1, previous.1.1.1.1.1.1.1.2⟩,
        previous.1.1.1.1.1.1.2⟩, previous.1.1.1.1.1.2⟩, previous.1.1.1.1.2⟩,
        previous.1.1.1.2⟩, previous.1.1.2⟩, ?_⟩, previous.2⟩
      apply List.all_eq_true.mpr
      intro candidate member
      have member := (sortCallRecords_perm (record :: state.calledProcessOccurrences)).subset member
      rcases List.mem_cons.mp member with rfl | old
      · simpa only [caller, exactLiveOccurrence] using callerLive
      · exact List.all_eq_true.mp previous.1.2 candidate old

theorem scope_entry_limit (program : Program) (definition : DefinitionScope)
    (admitted : programWellFormed program = true) (member : definition ∈ program.definitionScopes) :
    (program.operations.filter fun operation =>
      decide (enteredChildScopeId? operation = some definition.id)).length ≤
      (if definition.parentScopeId.isNone then 0 else 1) := by
  have graph := programWellFormed_graph program admitted
  unfold programGraphWellFormedForProgram at graph
  change (match (_ : List OperationId) with
    | [start] => match programEntryRootScopeId? program with
      | some root => _
      | none => false
    | _ => false) = true at graph
  split at graph <;> try contradiction
  split at graph <;> try contradiction
  rename_i root rootFound
  simp only [Bool.and_eq_true] at graph
  have lifecycle : compensationEventSubProcessSnapshotScopeLifecycleWellFormed program root = true := by grind
  simp only [compensationEventSubProcessSnapshotScopeLifecycleWellFormed, Bool.and_eq_true] at lifecycle
  have scopeValid := List.all_eq_true.mp lifecycle.2 definition member
  change (if (_ : Bool) then _ else _) = true at scopeValid
  split at scopeValid
  · simp only [Bool.and_eq_true, List.isEmpty_iff] at scopeValid
    rw [scopeValid.1.2]
    simp
  · change ((_ : Bool) && match definition.parentScopeId with
      | none => program.operations.all (fun operation => enteredChildScopeId? operation ≠ some definition.id)
      | some _ => (program.operations.filter fun operation =>
          decide (enteredChildScopeId? operation = some definition.id)).length = 1) = true at scopeValid
    cases parent : definition.parentScopeId with
    | none =>
      simp only [parent, Bool.and_eq_true] at scopeValid
      have empty : (program.operations.filter fun operation =>
          decide (enteredChildScopeId? operation = some definition.id)) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro operation held
        simpa using List.all_eq_true.mp scopeValid.2 operation held
      simp [empty]
    | some parent =>
      simp only [parent, Bool.and_eq_true, decide_eq_true_eq] at scopeValid
      simp [scopeValid.2]

/-- The admitted scope-entry census excludes a repeated entry from an ordinary entry's definition. -/
theorem scope_entry_excludes_repeated (program : Program) (definition : DefinitionScope)
    (operation : SemanticOperation) (admitted : programWellFormed program = true)
    (definitionHeld : definition ∈ program.definitionScopes) (operationHeld : operation ∈ program.operations)
    (enters : enteredChildScopeId? operation = some definition.id)
    (ordinary : sequentialScopeEntry? operation = none) :
    ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?, entry.childScopeId ≠ definition.id := by
  have limit := scope_entry_limit program definition admitted definitionHeld
  have first : operation ∈ program.operations.filter
      (fun candidate => decide (enteredChildScopeId? candidate = some definition.id)) :=
    List.mem_filter.mpr ⟨operationHeld, by simp [enters]⟩
  have positive := List.length_pos_iff.mpr (List.ne_nil_of_mem first)
  have count : (program.operations.filter
      (fun candidate => decide (enteredChildScopeId? candidate = some definition.id))).length = 1 := by
    split at limit <;> omega
  obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp count
  intro entry declared same
  obtain ⟨repeated, member, parsed⟩ := List.mem_filterMap.mp declared
  have repeatedEnters : enteredChildScopeId? repeated = some entry.childScopeId := by
    cases repeated <;> simp only [sequentialScopeEntry?, Option.some.injEq] at parsed <;> try contradiction
    cases parsed
    rfl
  have second : repeated ∈ program.operations.filter
      (fun candidate => decide (enteredChildScopeId? candidate = some definition.id)) :=
    List.mem_filter.mpr ⟨member, by simp [repeatedEnters, same]⟩
  rw [singleton] at first second
  have equal := (List.mem_singleton.mp first).trans (List.mem_singleton.mp second).symm
  rw [← equal, ordinary] at parsed
  contradiction

/-- Repeated entry origins and child definitions come from admitted ownership, not Activity-state inference. -/
theorem admitted_repeated_scope_definition (program : Program) (entry : SequentialScopeEntry)
    (admitted : programWellFormed program = true)
    (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?) :
    ∃ definition ∈ program.definitionScopes, definition.id = entry.childScopeId ∧
      definition.originElementId = entry.elementId := by
  have graph := programWellFormed_graph program admitted
  unfold programGraphWellFormedForProgram at graph
  change (match (_ : List OperationId) with
    | [start] => match programEntryRootScopeId? program with
      | some root => _
      | none => false
    | _ => false) = true at graph
  split at graph <;> try contradiction
  split at graph <;> try contradiction
  rename_i root rootFound
  simp only [Bool.and_eq_true] at graph
  have ownership : scopedOwnershipComplete program root = true := by grind
  simp only [scopedOwnershipComplete, Bool.and_eq_true] at ownership
  obtain ⟨operation, member, parsed⟩ := List.mem_filterMap.mp declared
  have respects := List.all_eq_true.mp ownership.2 operation member
  cases operation <;> simp only [sequentialScopeEntry?, Option.some.injEq] at parsed <;> try contradiction
  rename_i id origin input childEntry childScope output collection item mappings condition
  cases parsed
  unfold operationRespectsScopes at respects
  split at respects <;> try contradiction
  simp only [Bool.and_eq_true] at respects
  have definitionFact := respects.2
  change (program.definitionScopes.find? (fun scope => decide (scope.id = childScope))).any
    (fun scope => scope.parentScopeId == some _ && scope.originElementId == origin.elementId) = true at definitionFact
  cases found : program.definitionScopes.find? (fun scope => decide (scope.id = childScope)) with
  | none => simp [found] at definitionFact
  | some definition =>
    simp only [found, Option.any_some, Bool.and_eq_true, beq_iff_eq] at definitionFact
    have definitionId := List.find?_some found
    exact ⟨definition, List.mem_of_find?_eq_some found, of_decide_eq_true definitionId, definitionFact.2⟩

private theorem prepared_repeated_scope_separate (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (admitted : programWellFormed program = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      entry.childScopeId ≠ prepared.selection.created.id.definitionScopeId := by
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta, selection, running,
    snapshots, operations, _, _, definitionFound, checks, _, _, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation prepared found
  dsimp only [makeInternalScopeCreationPreparation]
  have definitions := definition_singleton program selected.created.id.definitionScopeId definition definitionFound
  have definitionHeld : definition ∈ program.definitionScopes :=
    (List.mem_filter.mp (show definition ∈ program.definitionScopes.filter
      (fun candidate => decide (candidate.id = selected.created.id.definitionScopeId)) by rw [definitions]; simp)).1
  have definitionId : definition.id = selected.created.id.definitionScopeId := by
    have held : definition ∈ program.definitionScopes.filter
        (fun candidate => decide (candidate.id = selected.created.id.definitionScopeId)) := by rw [definitions]; simp
    simpa using (List.mem_filter.mp held).2
  have operationHeld : operation ∈ program.operations :=
    (List.mem_filter.mp (show operation ∈ program.operations.filter
      (fun candidate => decide (candidate.id = operation.id)) by rw [operations]; simp)).1
  have limit := scope_entry_limit program definition admitted definitionHeld
  have matching := (internalScopeCreationPredecessorChecks_facts program state operation selected origin definition checks).2.1
  intro entry declared same
  obtain ⟨repeated, repeatedHeld, repeatedEntry⟩ := List.mem_filterMap.mp declared
  have enters : enteredChildScopeId? repeated = some entry.childScopeId := by
    cases repeated <;> simp only [sequentialScopeEntry?, Option.some.injEq] at repeatedEntry <;> try contradiction
    cases repeatedEntry
    rfl
  have repeatedMember : repeated ∈ program.operations.filter
      (fun candidate => decide (enteredChildScopeId? candidate = some definition.id)) :=
    List.mem_filter.mpr ⟨repeatedHeld, by simp [enters, same, definitionId]⟩
  unfold selectInternalScopeCreation? at selection
  obtain ⟨hosting, _, selection⟩ := Option.bind_eq_some_iff.mp selection
  cases operation with
  | enterScope id origin input childEntry scope =>
    obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
    split at selection <;> try contradiction
    cases selection
    simp only [internalScopeCreationDefinitionMatches, Bool.and_eq_true, decide_eq_true_eq] at matching
    have ordinaryMember : .enterScope id origin input childEntry scope ∈ program.operations.filter
        (fun candidate => decide (enteredChildScopeId? candidate = some definition.id)) :=
      List.mem_filter.mpr ⟨operationHeld, by simp [enteredChildScopeId?, matching.1.1]⟩
    have count : (program.operations.filter fun candidate =>
        decide (enteredChildScopeId? candidate = some definition.id)).length = 1 := by
      have positive := List.length_pos_iff.mpr (List.ne_nil_of_mem ordinaryMember)
      simp only [matching.1.2, Option.isNone_some, Bool.false_eq_true, ↓reduceIte] at limit
      omega
    obtain ⟨sole, singleton⟩ := List.length_eq_one_iff.mp count
    rw [singleton] at ordinaryMember repeatedMember
    simp only [List.mem_singleton] at ordinaryMember repeatedMember
    have equal := ordinaryMember.trans repeatedMember.symm
    rw [← equal] at repeatedEntry
    simp [sequentialScopeEntry?] at repeatedEntry
  | invokeProcess id origin input process scope childEntry returned data =>
    cases data with
    | scalar => simp at selection
    | empty =>
      obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      dsimp only at selection
      repeat first | contradiction | split at selection
      all_goals cases selection
      all_goals
        simp only [internalScopeCreationDefinitionMatches, Bool.and_eq_true, decide_eq_true_eq] at matching
        have empty : (program.operations.filter fun candidate =>
            decide (enteredChildScopeId? candidate = some definition.id)) = [] := by
          apply List.length_eq_zero_iff.mp
          simpa [matching.1.2] using limit
        rw [empty] at repeatedMember
        contradiction
  | _ => contradiction

theorem sequentialScopeStateValid_insert_scope (program : Program) (state : RuntimeState)
    (created : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ created.id)
    (separate : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      entry.childScopeId ≠ created.id.definitionScopeId)
    (valid : sequentialScopeStateValid program state = true) :
    sequentialScopeStateValid program
      { state with scopeOccurrences := insertScopeOccurrence created state.scopeOccurrences } = true := by
  simp only [sequentialScopeStateValid, Bool.and_eq_true] at valid ⊢
  constructor
  · apply List.all_eq_true.mpr
    intro controller held
    have before := List.all_eq_true.mp valid.1 controller held
    split at before
    · rename_i entry selected
      cases bound : sequentialScopeBindingForEntry? entry state with
      | none => simp [bound] at before
      | some binding =>
        simpa only [selected, bound, sequentialScopeBindingForEntry_insert_scope entry state created binding fresh bound] using before
    · contradiction
  · apply List.all_eq_true.mpr
    intro entry declared
    have scopeFrame : (insertScopeOccurrence created state.scopeOccurrences).filter
        (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) =
        state.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) :=
      filter_canonicalInsertBy_rejected _ _ _ _ (by simp [Ne.symm (separate entry declared)])
    have before := List.all_eq_true.mp valid.2 entry declared
    rw [scopeFrame]
    split at before
    · rfl
    · rename_i activity body activities bodies
      cases bound : sequentialScopeBindingForEntry? entry state with
      | none => simp [bound] at before
      | some binding =>
        simpa only [bound, sequentialScopeBindingForEntry_insert_scope entry state created binding fresh bound, sequentialScopeCollection?] using before
    · contradiction

/-- Document-unique source identity separates every admitted Task declarer from repeated Sub-Processes. -/
theorem sequentialScopeEntry_task_separate (program : Program) (operation : SemanticOperation)
    (taskId : TaskDefinitionId) (admitted : programWellFormed program = true)
    (member : operation ∈ program.operations)
    (declares : operationDeclaresWaitKey operation (userTaskWaitDeclarationKey taskId) = true) :
    ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      (⟨taskId.value⟩ : NodeId) ≠ entry.elementId := by
  have graph := programWellFormed_graph program admitted
  unfold programGraphWellFormedForProgram at graph
  change (match (_ : List OperationId) with
    | [start] => match programEntryRootScopeId? program with
      | some root => _
      | none => false
    | _ => false) = true at graph
  split at graph <;> try contradiction
  split at graph <;> try contradiction
  simp only [Bool.and_eq_true] at graph
  have paired : sequentialScopeOperationsPaired program = true := by grind
  simp only [sequentialScopeOperationsPaired, Bool.and_eq_true] at paired
  intro entry selected same
  obtain ⟨repeated, repeatedHeld, parsed⟩ := List.mem_filterMap.mp selected
  cases repeated <;> simp only [sequentialScopeEntry?, Option.some.injEq] at parsed <;> try contradiction
  rename_i id origin input childEntry childScope output collection item mappings condition
  cases parsed
  have unique := List.all_eq_true.mp paired.2 _ (List.mem_filter.mpr ⟨repeatedHeld, rfl⟩)
  simp only [Bool.and_eq_true] at unique
  have separate := List.all_eq_true.mp unique.1 operation member
  have checked := List.all_eq_true.mp (programWellFormed_operations program admitted) operation member
  have sameValue := congrArg NodeId.value same
  clear graph paired unique admitted member repeatedHeld
  cases operation <;> simp only [operationDeclaresWaitKey, operationWaitDeclarationKeys] at declares
  all_goals try contradiction
  all_goals simp_all [userTaskWaitDeclarationKey, timerWaitDeclarationKey, messageWaitDeclarationKey,
    operationWellFormed, SemanticOperation.origin,
    parallelMultiInstanceOperationWellFormed, parallelMultiInstanceExactEntry]
  all_goals exact separate (congrArg NodeId.mk (by grind))

/-- Inserting another Activity element leaves every repeated-scope binding and collection association unchanged. -/
theorem sequentialScopeStateValid_insert_activity (program : Program) (state : RuntimeState)
    (record : ActivityOccurrence)
    (separate : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?, record.activityElementId ≠ entry.elementId)
    (valid : sequentialScopeStateValid program state = true) :
    sequentialScopeStateValid program
      { state with activityOccurrences := insertActivityOccurrence record state.activityOccurrences } = true := by
  have frame (entry : SequentialScopeEntry) (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?) :
      (insertActivityOccurrence record state.activityOccurrences).filter
        (fun candidate => candidate.activityElementId == entry.elementId) =
        state.activityOccurrences.filter (fun candidate => candidate.activityElementId == entry.elementId) := by
    rw [insertActivityOccurrence_eq_canonicalInsertBy]
    exact filter_canonicalInsertBy_rejected _ _ _ _ (by simp [separate entry declared])
  have binding (entry : SequentialScopeEntry) (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?) :
      sequentialScopeBindingForEntry? entry
        { state with activityOccurrences := insertActivityOccurrence record state.activityOccurrences } =
      sequentialScopeBindingForEntry? entry state := by
    unfold sequentialScopeBindingForEntry?
    rw [frame entry declared]
  simp only [sequentialScopeStateValid, Bool.and_eq_true] at valid ⊢
  constructor
  · apply List.all_eq_true.mpr
    intro controller held
    have before := List.all_eq_true.mp valid.1 controller held
    split at before
    · rename_i entry selected
      have declared : entry ∈ program.operations.filterMap sequentialScopeEntry? := by
        have held : entry ∈ (program.operations.filterMap sequentialScopeEntry?).filter
            (fun entry => entry.elementId.value == controller.id.activityElementId.value) := by rw [selected]; simp
        exact (List.mem_filter.mp held).1
      simpa only [selected, binding entry declared] using before
    · contradiction
  · apply List.all_eq_true.mpr
    intro entry declared
    rw [frame entry declared, binding entry declared]
    exact List.all_eq_true.mp valid.2 entry declared

theorem selectedScopeCreation_preserves_runtimeStateWellFormed
    (program : Program) (domain : RootCompensationExecutionDomain program)
    (instanceId : SemanticId) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (hosting : SemanticId) (ownerRecord : RuntimeScopeOccurrence)
    (origin : BpmnElementOrigin) (definition : DefinitionScope) (delta : PublicControlPositionDelta)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (running : state.control = .running hosting)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (ownerExact : state.scopeOccurrences.filter (fun candidate => decide (candidate.id = selected.owner)) =
      [ownerRecord])
    (definitionFound : definitionScope? program selected.created.id.definitionScopeId = some definition)
    (checks : internalScopeCreationPredecessorChecks program state operation selected origin definition = true)
    (deltaFound : internalScopeCreationPositionDelta? program selected = some delta)
    (repeatedSeparated : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?,
      entry.childScopeId ≠ selected.created.id.definitionScopeId)
    (callSeparated : ∀ record, selected.kind = .called record →
      selected.created.id.definitionScopeId ≠ selected.owner.definitionScopeId) :
    runtimeStateWellFormed program instanceId (selected.apply state) = true := by
  have position := selectedScopeCreation_preserves_runtimePositionValid program state operation
    selected instanceId hosting ownerRecord origin definition delta (by
      have parts := valid
      simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at parts
      exact parts.1) selection running ownerExact definitionFound checks deltaFound callSeparated
  have ordered := scopeCreation_preserves_canonicalCollectionOrder state selected
    (runtimeStateWellFormed_canonicalCollectionOrder program instanceId state valid)
  have fresh := selectInternalScopeCreation_fresh state operation selected selection
  have live : exactLiveOccurrence state selected.owner = true := by
    simp [exactLiveOccurrence, ownerExact]
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨_, races⟩, incidents⟩, waitOwners⟩,
    waitIds⟩, identity⟩, waits⟩, hidden⟩, _order⟩, activities⟩, timers⟩, messages⟩,
    activityIds⟩, controllers⟩, sequential⟩, parallel⟩, controllerIds⟩, exhausted⟩,
    _notStarted⟩, ⟨compensation, scopeValid⟩⟩ := valid
  have newIncidents := incidents_insert state selected.created fresh incidents
  have newOwners := creation_waitOwners state operation selected selection live waitOwners
  have newActivities := activityRecordsOwnLiveWork_insertScopeOccurrence state selected.created
    fresh activities
  have retention := compensationActivityRetentionStateValid_insertScopeOccurrence program domain state
    selected.created fresh compensation.1.1.2
  have execution := compensationExecutionStateValid_insertScopeOccurrence program domain state
    selected.created hosting running fresh compensation.2
  have executionFrame := compensationExecutionStateValid_running_frame program domain
    { state with scopeOccurrences := insertScopeOccurrence selected.created state.scopeOccurrences }
    (selected.apply state) hosting running
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
    (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
  have newExecution : compensationExecutionStateValid program (selected.apply state) = true := by
    rw [executionFrame]
    exact execution
  have newRepeated := sequentialScopeStateValid_insert_scope program state selected.created fresh repeatedSeparated scopeValid
  cases kind : selected.kind <;>
    simp only [InternalScopeCreationSelection.apply, kind] at position ordered newOwners newExecution ⊢
  all_goals
    refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, newIncidents⟩, newOwners⟩,
      waitIds⟩, identity⟩, waits⟩, hidden⟩, ordered⟩, newActivities⟩, timers⟩, messages⟩,
      activityIds⟩, controllers⟩, sequential⟩, parallel⟩, controllerIds⟩, exhausted⟩, ?_⟩,
      ⟨⟨⟨⟨compensation.1.1.1, retention⟩, ?_⟩, newExecution⟩, newRepeated⟩⟩
  all_goals first
    | (solve | simp only [running])
    | simpa only [compensationEventSubProcessSnapshotStateValid, snapshots] using compensation.1.2

theorem prepareInternalScopeCreation_preserves_runtimeStateWellFormed
    (program : Program) (instanceId : SemanticId) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (admitted : programWellFormed program = true)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    runtimeStateWellFormed program instanceId (prepared.selection.apply state) = true := by
  have repeatedSeparated := prepared_repeated_scope_separate program state operation prepared admitted found
  have callSeparated := prepareInternalScopeCreation_called_definition_ne_owner
    program state operation prepared
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta, selection, running,
    snapshots, operationExact, ownerExact, _, definitionFound, checks, _, deltaFound, rfl⟩ :=
    prepareInternalScopeCreation_facts program state operation prepared found
  have domain := scopeCreation_runtime_rootCompensationDomain program instanceId state operation selected
    origin definition valid checks definitionFound (by
      intro id callOrigin input process scope entry returnOperation same
      have member : operation ∈ program.operations.filter (fun candidate => decide (candidate.id = operation.id)) := by
        rw [operationExact]; simp
      exact (List.mem_filter.mp member).1)
  exact selectedScopeCreation_preserves_runtimeStateWellFormed program domain instanceId state operation selected
    hosting ownerRecord origin definition delta valid selection running snapshots ownerExact
    definitionFound checks deltaFound repeatedSeparated (fun record kind => callSeparated record admitted found kind)

end BpmnSemantics.SemanticProcess.InternalCommutation
