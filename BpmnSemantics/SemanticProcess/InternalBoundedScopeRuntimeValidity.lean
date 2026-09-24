import BpmnSemantics.SemanticProcess.InternalBoundedScopePreparation
import BpmnSemantics.SemanticProcess.InternalScopeCreationRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalCommutationActivityOwnership
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStatePreservation
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateEntryOrder
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputMultiInstanceFrames

/-! Bounded entry's child insertion uses the ordinary scope-position law. The joined Timer and
Activity preserve that position while retaining their separate validity obligations.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_bounded_scope_timer_keys_fresh
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    ∀ old ∈ state.timerWaits,
      timerWaitKeyMatches prepared.selection.timer old = false ∧
        timerWaitKeyMatches old prepared.selection.timer = false := by
  obtain ⟨selected, _, _, _, _, _, _, _, _, _, _, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have absent : openWaitAnchorAbsent state (timerWaitOccurrence selected.timer) = true := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    exact joint.1.2
  exact armingWrite_key_fresh_of_anchor_absent state (.timer selected.timer) absent

theorem prepared_bounded_scope_preserves_timer_attachments
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (records : activityRecordsOwnLiveWork state = true)
    (attachments : attachedTimersUnambiguous state = true) :
    attachedTimersUnambiguous (prepared.selection.apply state) = true := by
  have fresh := prepared_bounded_scope_timer_keys_fresh program state contract prepared found
  have joined := attachedTimers_insertFreshTimerAndRecord state prepared.selection.timer
    prepared.selection.record
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, _, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  exact joined rfl (fun old member => (fresh old member).1) records attachments

theorem prepared_bounded_scope_preserves_wait_identities
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (identities : waitIdentitiesUnique state = true) :
    waitIdentitiesUnique (prepared.selection.apply state) = true := by
  have fresh := prepared_bounded_scope_timer_keys_fresh program state contract prepared found
  have timerIds : (insertTimerWait prepared.selection.timer state.timerWaits).all
      (occursOnce timerWaitKeyMatches (insertTimerWait prepared.selection.timer state.timerWaits)) = true := by
    rw [insertTimerWait]
    have old := identities
    simp only [waitIdentitiesUnique, Bool.and_eq_true] at old
    exact occurrenceKeysUnique_canonicalInsertBy _ _ _ _ old.1.2 fresh
      (by simp [timerWaitKeyMatches])
  simp only [waitIdentitiesUnique, Bool.and_eq_true] at identities
  cases kind : prepared.selection.creation.kind <;>
    simp only [InternalBoundedScopeSelection.apply, InternalScopeCreationSelection.apply, kind,
      waitIdentitiesUnique, Bool.and_eq_true]
  all_goals exact ⟨⟨⟨identities.1.1.1, identities.1.1.2⟩, timerIds⟩, identities.2⟩

theorem prepared_bounded_scope_preserves_activity_work
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (records : activityRecordsOwnLiveWork state = true)
    (attachments : attachedTimersUnambiguous state = true) :
    activityRecordsOwnLiveWork (prepared.selection.apply state) = true := by
  have timerFresh := prepared_bounded_scope_timer_keys_fresh program state contract prepared found
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have fresh := selectInternalScopeCreation_fresh state contract.entryOperation entry entryFound
  have childRecords := activityRecordsOwnLiveWork_insertScopeOccurrence state entry.created fresh records
  let childState : RuntimeState :=
    { state with scopeOccurrences := insertScopeOccurrence entry.created state.scopeOccurrences }
  let selected := makeInternalBoundedScopeSelection state contract entry
  let after := selected.apply state
  have timerRecords := (activityRecords_insertFreshTimerWait childState selected.timer
    timerFresh childRecords attachments).1
  have live := selectInternalScopeCreation_created_live state contract.entryOperation entry entryFound
  change activityRecordsOwnLiveWork after = true
  simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true]
  intro candidate member
  change candidate ∈ insertActivityOccurrence selected.record state.activityOccurrences at member
  rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
  rcases member with same | old
  · subst candidate
    refine ⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩
    · simpa only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
        InternalScopeCreationSelection.apply, child, activityBodyLive, exactLiveOccurrence] using live
    · simp [selected, makeInternalBoundedScopeSelection, activityTaskBodyOwnersAgree]
    · simp only [selected, makeInternalBoundedScopeSelection, ActivityOccurrence.timerHandlerOccurrences,
        List.filterMap_cons, List.filterMap_nil, List.mem_singleton]
      intro timer same
      subst timer
      apply List.any_eq_true.mpr
      refine ⟨selected.timer, ?_, ?_⟩
      · change selected.timer ∈ insertTimerWait selected.timer state.timerWaits
        exact (mem_canonicalInsertBy _ _ _ _).mpr (Or.inl rfl)
      · simp [selected, makeInternalBoundedScopeSelection, timerIdNamesWait]
    · simp [selected, makeInternalBoundedScopeSelection, ActivityOccurrence.messageHandlerOccurrences]
  · have prior := List.all_eq_true.mp timerRecords candidate old
    simpa [after, selected, childState, InternalBoundedScopeSelection.apply,
      makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child,
      activityBodyLive, activityTaskBodyOwnersAgree, exactLiveOccurrence] using prior

/-- The shared child insertion has a derived intermediate invariant. This is a conclusion from
bounded-entry predecessor facts, not an extra hypothesis of the complete operation. -/
theorem prepareInternalBoundedScope_preserves_child_runtime
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId : SemanticId)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    runtimeStateWellFormed program instanceId (prepared.selection.creation.apply state) = true := by
  obtain ⟨selected, hosting, ownerRecord, definition, start, delta, selection, running,
    snapshots, _, ownerExact, definitionFound, checks, _, _, position, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have control : state.control = .running hosting := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have result := selectedScopeCreation_preserves_runtimeStateWellFormed program instanceId state
    contract.entryOperation entry hosting ownerRecord contract.origin definition delta
    valid entryFound control snapshots ownerExact definitionFound checks position
    (by intro record called; simp [child] at called)
  simpa only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
    InternalScopeCreationSelection.apply, child] using result

theorem prepareInternalBoundedScope_preserves_runtimePositionValid
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId : SemanticId)
    (valid : runtimePositionValid program instanceId state = true)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    runtimePositionValid program instanceId (prepared.selection.apply state) = true := by
  obtain ⟨selected, hosting, ownerRecord, definition, start, delta, selection, running,
    _, _, ownerExact, definitionFound, checks, _, _, position, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have control : state.control = .running hosting := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have childPosition := selectedScopeCreation_preserves_runtimePositionValid program state
    contract.entryOperation entry instanceId hosting ownerRecord contract.origin definition delta
    valid entryFound control ownerExact definitionFound checks position
    (by intro record called; simp [child] at called)
  exact runtimePositionValid_tokens_sublist_frame program instanceId (entry.apply state)
    ((makeInternalBoundedScopeSelection state contract entry).apply state) childPosition
    (by simp only [InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child])
    (by simp only [InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child])
    (by simp only [InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child])
    (by simp only [InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child]; exact List.Sublist.refl _)

theorem prepared_bounded_scope_preserves_identity_bounds
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (bounds : runtimeStateIdentityBound state = true) :
    runtimeStateIdentityBound (prepared.selection.apply state) = true := by
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let selected := makeInternalBoundedScopeSelection state contract entry
  let after := selected.apply state
  have timerBounds := insertNextTimer_preserves_identityBound state selected.timer rfl bounds
  have activities (query : TaskDefinitionId) :
      activityActivationCount state query ≤ activityActivationCount after query := by
    change activityActivationCount state query ≤ activityActivationCount
      { state with activityActivations := (setActivationCount state.activityActivations
          ⟨contract.origin.elementId.value⟩ (activityActivationCount state ⟨contract.origin.elementId.value⟩ + 1)) } query
    by_cases same : query = ⟨contract.origin.elementId.value⟩
    · subst query; rw [activityActivationCount_set_self]; omega
    · rw [activityActivationCount_set_other _ _ _ _ same]
      exact Nat.le_refl _
  have tasks : after.waits = state.waits := by
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child]
  have taskCounts (task : TaskDefinitionId) : activationCount after task = activationCount state task := by
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child, activationCount]
  change runtimeStateIdentityBound after = true
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at timerBounds ⊢
  refine ⟨⟨?_, timerBounds.1.2⟩, ?_⟩
  · change (after.waits.all (fun wait => decide (wait.activation ≤ activationCount after wait.task.id))) = true
    rw [tasks]
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds
    apply List.all_eq_true.mpr
    intro wait member
    rw [taskCounts]
    exact List.all_eq_true.mp bounds.1.1 wait member
  · simp only [List.all_eq_true, decide_eq_true_eq] at timerBounds ⊢
    intro record member
    change record ∈ insertActivityOccurrence _ state.activityOccurrences at member
    rw [insertActivityOccurrence_eq_canonicalInsertBy, mem_canonicalInsertBy] at member
    rcases member with rfl | old
    · exact Nat.le_of_eq (activityActivationCount_set_self state ⟨contract.origin.elementId.value⟩
        (activityActivationCount state ⟨contract.origin.elementId.value⟩ + 1)).symm
    · exact Nat.le_trans (timerBounds.2 record old) (activities ⟨record.activityElementId.value⟩)

theorem prepared_bounded_scope_preserves_wait_declarations
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId : SemanticId)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (declarations : waitDeclarationsValid program instanceId state = true) :
    waitDeclarationsValid program instanceId (prepared.selection.apply state) = true := by
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have exactSelection := boundedScopeJointResourcesAvailable_selected program state contract selected joint
  have timerDeclarer : timerWaitDeclarers program contract.timer.elementId = [contract.operation] := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    simpa only [uniqueFamilyDeclarer?, decide_eq_true_eq] using joint.1.1.2
  have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program
    contract.operation selected.creation.owner _ timerDeclarer exactSelection
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations
  simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
    makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child,
    waitDeclarationsValid, Bool.and_eq_true]
  refine ⟨⟨⟨⟨declarations.1.1.1.1, declarations.1.1.1.2⟩, ?_⟩, declarations.1.2⟩, declarations.2⟩
  apply List.all_eq_true.mpr
  intro wait member
  obtain ⟨raw, inInstance⟩ := List.mem_filter.mp member
  rw [insertTimerWait, mem_canonicalInsertBy] at raw
  rcases raw with rfl | old
  · exact declared
  · exact List.all_eq_true.mp declarations.1.1.2 wait (List.mem_filter.mpr ⟨old, inInstance⟩)

theorem prepared_bounded_scope_preserves_wait_owners
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (owners : waitOwnersLive state = true) :
    waitOwnersLive (prepared.selection.apply state) = true := by
  obtain ⟨selected, _, ownerRecord, _, _, _, selection, _, _, _, ownerExact,
    _, _, _, _, _, rfl⟩ := prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  have fresh := selectInternalScopeCreation_fresh state contract.entryOperation entry entryFound
  have live : exactLiveOccurrence state entry.owner = true := by
    change state.scopeOccurrences.filter (fun candidate => decide (candidate.id = entry.owner)) =
      [ownerRecord] at ownerExact
    simp [exactLiveOccurrence, ownerExact]
  have parentLive := exactLiveOccurrence_insertScopeOccurrence_preserves state entry.created
    entry.owner fresh live
  have prior := waitOwnersLive_insertScopeOccurrence state entry.created fresh owners
  simp only [waitOwnersLive, Bool.and_eq_true] at prior
  simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
    makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply, child,
    waitOwnersLive, Bool.and_eq_true]
  refine ⟨⟨⟨⟨⟨⟨⟨⟨prior.1.1.1.1.1.1.1.1, prior.1.1.1.1.1.1.1.2⟩, ?_⟩,
    prior.1.1.1.1.1.2⟩, prior.1.1.1.1.2⟩, prior.1.1.1.2⟩, prior.1.1.2⟩,
    prior.1.2⟩, ?_⟩
  · rw [insertTimerWait, all_canonicalInsertBy]
    exact Bool.and_eq_true_iff.mpr ⟨parentLive, prior.1.1.1.1.1.1.2⟩
  · rw [insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy]
    exact Bool.and_eq_true_iff.mpr ⟨parentLive, prior.2⟩

theorem prepared_bounded_scope_preserves_activity_identities
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (identities : activityIdentitiesUnique state = true) :
    activityIdentitiesUnique (prepared.selection.apply state) = true := by
  obtain ⟨selected, _, _, _, _, _, _, _, _, _, _, _, _, joint, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have disjoint : state.activityOccurrences.any (regionalActivityAssociationsConflict · selected.record) = false := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    simpa using joint.2
  have fresh : ∀ old ∈ state.activityOccurrences,
      sameActivityOccurrence selected.record old = false ∧ sameActivityOccurrence old selected.record = false := by
    intro old member
    have absent := Bool.eq_false_iff.mpr ((List.any_eq_false.mp disjoint) old member)
    simp only [regionalActivityAssociationsConflict, Bool.or_eq_false_iff] at absent
    have reverse := absent.1.1.1
    have symmetry : sameActivityOccurrence selected.record old = sameActivityOccurrence old selected.record := by
      apply Bool.eq_iff_iff.mpr
      simp only [sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq]
      constructor <;> rintro ⟨⟨process, element⟩, activation⟩ <;>
        exact ⟨⟨process.symm, element.symm⟩, activation.symm⟩
    exact ⟨symmetry.trans reverse, reverse⟩
  change (insertActivityOccurrence selected.record state.activityOccurrences).all
    (occursOnce sameActivityOccurrence (insertActivityOccurrence selected.record state.activityOccurrences)) = true
  rw [insertActivityOccurrence_eq_canonicalInsertBy]
  exact occurrenceKeysUnique_canonicalInsertBy _ _ _ _ identities fresh
    (by simp [sameActivityOccurrence])

theorem prepared_bounded_scope_preserves_order
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId : SemanticId)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (valid : runtimeStateWellFormed program instanceId state = true) :
    canonicalCollectionOrder (prepared.selection.apply state) = true := by
  have childValid := prepareInternalBoundedScope_preserves_child_runtime program state contract
    prepared instanceId valid found
  have childOrder := runtimeStateWellFormed_canonicalCollectionOrder program instanceId
    (prepared.selection.creation.apply state) childValid
  have prior := runtimeStateWellFormed_canonicalCollectionOrder program instanceId state valid
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at prior childOrder
  obtain ⟨_, activityCounters, _, _, _, timers, _, _, timerCounters, _, _, _, _, _,
    activities, _, _, _, _, _, _⟩ := prior
  obtain ⟨tokens, _, tasks, taskCounters, messages, _, effects, messageCounters, _, effectCounters,
    variables, selections, races, calls, _, sequential, parallel, scopes, scopeCounters,
    callCounters, raceCounters⟩ := childOrder
  simp only [InternalBoundedScopeSelection.apply, canonicalCollectionOrder, Bool.and_eq_true,
    and_assoc]
  refine ⟨tokens, ?_, tasks, taskCounters, messages, ?_, effects, messageCounters, ?_, effectCounters,
    variables, selections, races, calls, ?_, sequential, parallel, scopes, scopeCounters,
    callCounters, raceCounters⟩
  · exact orderedBy_insertTaskActivation _ _
      (orderedBy_filter activationBefore_compose _ _ activityCounters)
  · exact orderedBy_insertTimerWait_preserved prepared.selection.timer state.timerWaits timers
  · have inserted := orderedBy_replaceStringKey
      (fun value : TimerActivation => value.elementId.value) timerActivationBefore
      (fun _ _ => rfl)
      { elementId := prepared.selection.timer.elementId, count := prepared.selection.timer.activation }
      (fun activation => !decide (activation.elementId = prepared.selection.timer.elementId))
      state.timerActivations timerCounters
    simpa only [setTimerActivationCount, decide_not] using inserted
  · rw [insertActivityOccurrence_eq_canonicalInsertBy]
    exact orderedBy_canonicalInsertBy activityOccurrenceBefore activityOccurrenceBefore_asymm
      prepared.selection.record state.activityOccurrences activities

private theorem prepared_bounded_scope_excludes_multiInstance
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope)
    (found : prepareInternalBoundedScope? program state contract = some prepared) :
    ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ timer _ =>
          task.id ≠ ⟨contract.origin.elementId.value⟩ ∧ timer.elementId ≠ contract.timer.elementId
      | .awaitParallelMultiInstanceUserTask _ _ _ taskId _ _ _ timer _ _ =>
          taskId ≠ ⟨contract.origin.elementId.value⟩ ∧ timer.elementId ≠ contract.timer.elementId
      | _ => True := by
  obtain ⟨selected, _, _, _, _, _, _, _, _, _, _, _, _, joint, _, _, _⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  have tasks := boundedScopeJointResourcesAvailable_no_task_declarer program state contract selected joint
  have timers : timerWaitDeclarers program contract.timer.elementId = [contract.operation] := by
    simp only [boundedScopeJointResourcesAvailable, Bool.and_eq_true] at joint
    simpa only [uniqueFamilyDeclarer?, decide_eq_true_eq] using joint.1.1.2
  intro operation member
  cases operation <;> try trivial
  all_goals
    constructor
    · intro same
      have conflict : _ ∈ userTaskWaitDeclarers program ⟨contract.origin.elementId.value⟩ :=
        List.mem_filter.mpr ⟨member, by simp [same]⟩
      rw [tasks] at conflict
      simp at conflict
    · intro same
      have conflict : _ ∈ timerWaitDeclarers program contract.timer.elementId :=
        List.mem_filter.mpr ⟨member, by simp [same]⟩
      rw [timers] at conflict
      cases disposition : contract.disposition <;>
        simp [InternalBoundedScopeContract.operation, disposition] at conflict

theorem prepared_bounded_scope_preserves_multiInstance
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId : SemanticId)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (valid : runtimeStateWellFormed program instanceId state = true) :
    controllersOwnLiveActivity (prepared.selection.apply state) = true ∧
      sequentialMultiInstanceProgramBindingsValid program (prepared.selection.apply state) = true ∧
      parallelMultiInstanceProgramBindingsValid program (prepared.selection.apply state) = true := by
  have disjoint := prepared_bounded_scope_excludes_multiInstance program state contract prepared found
  have childValid := prepareInternalBoundedScope_preserves_child_runtime program state contract
    prepared instanceId valid found
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at childValid
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, controllers, sequential, parallel, _⟩ := childValid
  obtain ⟨selected, _, _, _, _, _, selection, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let selected := makeInternalBoundedScopeSelection state contract entry
  let childState := entry.apply state
  let timerState : RuntimeState :=
    { childState with
      timerWaits := insertTimerWait selected.timer state.timerWaits
      timerActivations := setTimerActivationCount state.timerActivations selected.timer.elementId
        selected.timer.activation }
  have timerDisjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ _ timer _ => timer.elementId ≠ selected.timer.elementId
      | .awaitParallelMultiInstanceUserTask _ _ _ _ _ _ _ timer _ _ => timer.elementId ≠ selected.timer.elementId
      | _ => True := by
    intro operation member
    have separate := disjoint operation member
    cases operation <;> first | trivial | exact separate.2
  have sequentialDisjoint : ∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ =>
          task.id.value ≠ selected.record.activityElementId.value
      | _ => True := by
    intro operation member
    have separate := disjoint operation member
    cases operation <;> try trivial
    intro same
    exact separate.1 (taskDefinitionId_eq_of_value_eq _ _ same)
  have sequentialTimer : sequentialMultiInstanceProgramBindingsValid program timerState = true := by
    have framed := smiBindings_insertTimerWait_frame program childState selected.timer (by
      intro operation member
      have separate := timerDisjoint operation member
      cases operation <;> trivial) sequential
    simp only [timerState, childState, InternalScopeCreationSelection.apply, child] at framed ⊢
    exact framed
  have parallelTimer : parallelMultiInstanceProgramBindingsValid program timerState = true := by
    have framed := parallelMultiInstanceProgramBindingsValid_insertTimerWait_frame program childState
      selected.timer timerDisjoint (by
        intro operation member
        have separate := timerDisjoint operation member
        cases operation <;> try trivial
        simp only [ParallelMultiInstanceArm.ofOperation?]
        exact timerActivationCount_set_other childState _ _ _ separate) parallel
    simpa only [timerState, childState, InternalScopeCreationSelection.apply, child] using framed
  refine ⟨?_, ?_, ?_⟩
  · have framed := controllersOwnLiveActivity_insert_unrelated_activity program childState
      selected.record sequentialDisjoint sequential controllers
    simpa only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
      selected, childState, makeInternalBoundedScopeSelection, InternalScopeCreationSelection.apply,
      child, controllersOwnLiveActivity] using framed
  · have framed := sequentialBindings_insertActivityOccurrence_frame program timerState selected.record
      sequentialDisjoint sequentialTimer
    simp only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
      selected, timerState, childState, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] at framed ⊢
    exact framed
  · have framed := parallelBindings_insertActivityOccurrence_frame program timerState selected.record (by
      intro operation member arm projects
      have separate := disjoint operation member
      cases operation <;> simp [ParallelMultiInstanceArm.ofOperation?] at projects
      cases projects
      intro same
      exact separate.1 (taskDefinitionId_eq_of_value_eq _ _ same)) parallelTimer
    simpa only [makeInternalBoundedScopePreparation, InternalBoundedScopeSelection.apply,
      selected, timerState, childState, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] using framed

/-- Complete bounded preparation preserves runtime validity from its predecessor. The child
insertion's validity is derived by the existing scope-creation law, not assumed. -/
theorem prepared_bounded_scope_preserves_runtime
    (program : Program) (state : RuntimeState) (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (instanceId : SemanticId)
    (found : prepareInternalBoundedScope? program state contract = some prepared)
    (wellFormed : runtimeStateWellFormed program instanceId state = true) :
    runtimeStateWellFormed program instanceId (prepared.selection.apply state) = true := by
  have childValid := prepareInternalBoundedScope_preserves_child_runtime program state contract
    prepared instanceId wellFormed found
  have orderAfter := prepared_bounded_scope_preserves_order program state contract prepared
    instanceId found wellFormed
  have multiAfter := prepared_bounded_scope_preserves_multiInstance program state contract prepared
    instanceId found wellFormed
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at wellFormed childValid
  obtain ⟨position, races, _, owners, waitIds, bounds, declarations, _, _, records, timers,
    messages, activityIds, _, _, _, _, _, _, claims, _⟩ := wellFormed
  obtain ⟨_, _, incidents, _, _, _, _, hidden, _, _, _, _, _, _, _, _, controllerIds,
    notExhausted, _, _, retention, snapshots, execution⟩ := childValid
  have positionAfter := prepareInternalBoundedScope_preserves_runtimePositionValid program state
    contract prepared instanceId position found
  have ownersAfter := prepared_bounded_scope_preserves_wait_owners program state contract prepared found owners
  have waitIdsAfter := prepared_bounded_scope_preserves_wait_identities program state contract prepared found waitIds
  have boundsAfter := prepared_bounded_scope_preserves_identity_bounds program state contract prepared found bounds
  have declarationsAfter := prepared_bounded_scope_preserves_wait_declarations program state contract
    prepared instanceId found declarations
  have recordsAfter := prepared_bounded_scope_preserves_activity_work program state contract prepared found records timers
  have timersAfter := prepared_bounded_scope_preserves_timer_attachments program state contract prepared found records timers
  have activityIdsAfter := prepared_bounded_scope_preserves_activity_identities program state contract prepared found activityIds
  have claimsAfter := prepareInternalBoundedScope_preserves_bodyClaims program state contract prepared found claims
  have timerFresh := prepared_bounded_scope_timer_keys_fresh program state contract prepared found
  obtain ⟨selected, hosting, _, _, _, _, selection, running, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalBoundedScope_facts program state contract prepared found
  obtain ⟨entry, entryFound, rfl⟩ := selectInternalBoundedScope_facts state contract selected selection
  have child := (boundedScope_entry_selection_input state contract entry entryFound).2.2
  let selected := makeInternalBoundedScopeSelection state contract entry
  let childState := entry.apply state
  let after := selected.apply state
  have control : state.control = .running hosting := by
    cases equation : state.control <;> simp_all [runningInstance?]
  have racesAfter : eventRaceAssociationsValid after = true := by
    have framed := eventRaces_insertTimerWait state selected.timer timerFresh races
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] at framed ⊢
    exact framed
  have messagesAfter : attachedMessagesUnambiguous after = true := by
    have framed := insertActivityOccurrence_preserves_attachedMessagesUnambiguous_of_empty state
      selected.record (by simp [selected, makeInternalBoundedScopeSelection,
        ActivityOccurrence.messageHandlerOccurrences]) messages
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child] at framed ⊢
    exact framed
  have lifecycleAfter : (match after.control with
      | .notStarted => notStartedStateEmpty after
      | _ => true) = true := by
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child, control]
  have executionAfter : compensationExecutionStateValid program after = true := by
    have childControl : childState.control = .running hosting := by
      simp only [childState, InternalScopeCreationSelection.apply, child, control]
    exact (compensationExecutionStateValid_running_frame program childState after hosting childControl
      rfl rfl rfl rfl rfl rfl).trans execution
  change runtimeStateWellFormed program instanceId after = true
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc]
  simp only [makeInternalBoundedScopePreparation, makeInternalBoundedScopeSelection,
    InternalScopeCreationSelection.apply, child] at incidents hidden controllerIds notExhausted retention snapshots
  refine ⟨positionAfter, racesAfter, ?_, ownersAfter, waitIdsAfter, boundsAfter, declarationsAfter,
    ?_, orderAfter, recordsAfter, timersAfter, messagesAfter, activityIdsAfter, multiAfter.1,
    multiAfter.2.1, multiAfter.2.2, ?_, ?_, lifecycleAfter, claimsAfter, ?_, ?_, executionAfter⟩
  all_goals
    simp only [after, selected, InternalBoundedScopeSelection.apply, makeInternalBoundedScopeSelection,
      InternalScopeCreationSelection.apply, child]
  · exact incidents
  · exact hidden
  · exact controllerIds
  · exact notExhausted
  · exact retention
  · exact snapshots

end BpmnSemantics.SemanticProcess.InternalCommutation
