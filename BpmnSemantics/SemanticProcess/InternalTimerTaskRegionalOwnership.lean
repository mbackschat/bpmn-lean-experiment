import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalRetention

/-! The new Activity references its jointly inserted task and Timer, which the regional mask retains.
Existing retained locals keep their exact record census because preparation forbids Activity aliases.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTask_new_references (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (keep : RegionalReferenceRetention)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch) :
    regionalActivityReferencesClosed state keep patch.record = true := by
  have timerFresh := prepared_timer_task_timer_keys_fresh program state contract patch prepared
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, taskAbsent, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId processId origin
  have taskFresh := armingPatch_key_fresh_of_anchor_absent state patch.arm taskAbsent
  change regionalActivityReferencesClosed state keep patch.record = true
  simp only [patch, makeInternalTimerTaskPatch, regionalActivityReferencesClosed,
    List.all_cons, List.all_nil, Bool.and_true, Bool.and_eq_true, allMatchingRetained, List.all_eq_true]
  constructor
  · intro wait member
    have absent := (taskFresh wait member).1
    have unmatched : taskIdNamesWait
        { processInstanceId := owner.processInstanceId, elementId := ⟨contract.task.id.value⟩,
          activation := activationCount state contract.task.id + 1 } wait = false := by
      simp [userTaskWaitKeyMatches, taskIdNamesWait,
        beq_iff_eq] at absent ⊢
      exact fun process element => absent process (taskDefinitionId_eq_of_value_eq _ _ element)
    simp [unmatched]
  · intro wait member
    have absent := (timerFresh wait member).1
    have unmatched : timerIdNamesWait
        { processInstanceId := owner.processInstanceId, elementId := ⟨contract.timer.elementId.value⟩,
          activation := timerActivationCount state contract.timer.elementId + 1 } wait = false := by
      simp [makeInternalTimerTaskPatch, timerWaitKeyMatches, timerIdNamesWait,
        beq_iff_eq] at absent ⊢
      exact fun process element => absent process (congrArg NodeId.mk element)
    simp [unmatched]

theorem timerTask_regional_ownership_frame (state : RuntimeState) (patch : InternalTimerTaskPatch)
    (keep : RegionalReferenceRetention)
    (taskKept : match patch.arm.write with | .userTask wait => keep.task wait = true | _ => False)
    (timerKept : keep.timer patch.timer = true)
    (newReferences : regionalActivityReferencesClosed state keep patch.record = true) :
    regionalOwnershipClosed (applyInternalTimerTaskPatch state patch) keep =
      regionalOwnershipClosed state keep := by
  cases write : patch.arm.write <;> simp only [write] at taskKept
  all_goals try contradiction
  have references (record : ActivityOccurrence) :
      regionalActivityReferencesClosed (applyInternalTimerTaskPatch state patch) keep record =
        regionalActivityReferencesClosed state keep record := by
    simp [regionalActivityReferencesClosed, applyInternalTimerTaskPatch, applyInternalArmingPatch,
      write, insertTimerWait, allMatchingRetained_insertTask_kept _ _ _ _ taskKept,
      allMatchingRetained_insert_kept _ _ _ _ _ timerKept]
  simp only [regionalOwnershipClosed, references]
  simp [applyInternalTimerTaskPatch, applyInternalArmingPatch, write,
    insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy, newReferences,
    insertTimerWait, allMatchingRetained_insert_kept _ _ _ _ _ timerKept]

theorem timerTask_regional_activity_owners_frame (state : RuntimeState)
    (patch : InternalTimerTaskPatch) (keep : RegionalReferenceRetention)
    (newOwner : allMatchingRetained state.scopeOccurrences keep.scope
      (fun scope => decide (scope.id = patch.record.owner)) = true) :
    regionalActivityOwnersClosed (applyInternalTimerTaskPatch state patch) keep =
      regionalActivityOwnersClosed state keep := by
  cases write : patch.arm.write <;>
    simp [regionalActivityOwnersClosed, applyInternalTimerTaskPatch, applyInternalArmingPatch,
      write, insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy, newOwner]

private theorem same_local_names_identity (scope : ActivityVariableScope) (left right : ActivityOccurrence)
    (leftNamed : regionalLocalScopeNamesActivity scope left = true)
    (rightNamed : regionalLocalScopeNamesActivity scope right = true) :
    sameActivityOccurrence left right = true := by
  have leftEq : LocalDataOwner.activityOccurrence (activityOwnerForRecord left) = scope.owner := by
    simpa [regionalLocalScopeNamesActivity, activityOccurrenceScopeMatches, localDataOwnerMatches,
      activityOwnerForRecord] using leftNamed
  have rightEq : LocalDataOwner.activityOccurrence (activityOwnerForRecord right) = scope.owner := by
    simpa [regionalLocalScopeNamesActivity, activityOccurrenceScopeMatches, localDataOwnerMatches,
      activityOwnerForRecord] using rightNamed
  have same := LocalDataOwner.activityOccurrence.inj (leftEq.trans rightEq.symm)
  have fields := ActivityOccurrenceId.mk.inj same
  simp [sameActivityOccurrence] at fields ⊢
  exact ⟨⟨fields.1, congrArg NodeId.mk fields.2.1⟩, fields.2.2⟩

theorem regionalLocalDataClosed_insertActivity (state after : RuntimeState) (inserted : ActivityOccurrence)
    (keepActivity : ActivityOccurrence → Bool) (keepLocal : ActivityVariableScope → Bool)
    (activities : after.activityOccurrences = insertActivityOccurrence inserted state.activityOccurrences)
    (locals : after.variables.activities = state.variables.activities)
    (absent : state.activityOccurrences.any (regionalActivityAssociationsConflict · inserted) = false)
    (prior : regionalRetainedLocalDataClosed state keepActivity keepLocal = true) :
    regionalRetainedLocalDataClosed after keepActivity keepLocal = true := by
  unfold regionalRetainedLocalDataClosed
  rw [locals, activities]
  apply List.all_eq_true.mpr
  intro scope member
  have previous := List.all_eq_true.mp prior scope member
  change (if !keepLocal scope then true else match scope.owner with
    | .effectOccurrence _ => true
    | .activityOccurrence _ => match (insertActivityOccurrence inserted state.activityOccurrences).filter
        (regionalLocalScopeNamesActivity scope) with
      | [record] => keepActivity record | _ => false) = true
  by_cases kept : keepLocal scope = true
  · simp only [kept, Bool.not_true, Bool.false_eq_true, if_false] at previous ⊢
    cases kind : scope.owner with
    | effectOccurrence _ => rfl
    | activityOccurrence id =>
        simp only [kind] at previous ⊢
        have witness : ∃ record, state.activityOccurrences.filter (regionalLocalScopeNamesActivity scope) = [record] := by
          split at previous
          · exact ⟨_, by assumption⟩
          · contradiction
        obtain ⟨record, census⟩ := witness
        have oldMember : record ∈ state.activityOccurrences.filter (regionalLocalScopeNamesActivity scope) := by
          rw [census]; simp
        obtain ⟨oldMember, named⟩ := List.mem_filter.mp oldMember
        have rejected : regionalLocalScopeNamesActivity scope inserted = false := by
          apply Bool.eq_false_iff.mpr
          intro newNamed
          have same := same_local_names_identity scope record inserted named newNamed
          have disjoint := List.any_eq_false.mp absent record oldMember
          apply disjoint
          simp [regionalActivityAssociationsConflict, same]
        rw [insertActivityOccurrence_eq_canonicalInsertBy,
          filter_canonicalInsertBy_rejected _ _ _ _ rejected]
        exact previous
  · simp [kept]

theorem timerTask_regional_local_data_preserved (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (keepActivity : ActivityOccurrence → Bool) (keepLocal : ActivityVariableScope → Bool)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (prior : regionalRetainedLocalDataClosed state keepActivity keepLocal = true) :
    regionalRetainedLocalDataClosed (applyInternalTimerTaskPatch state patch) keepActivity keepLocal = true := by
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, absent, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  exact regionalLocalDataClosed_insertActivity state _ _ keepActivity keepLocal rfl rfl absent prior

theorem regionalOwnershipSelection_after_independent_timer_task
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (regional : PreparedInternalRegional) (contract : InternalTimerTaskContract)
    (patch : InternalTimerTaskPatch)
    (valid : runtimePositionValid program patch.arm.runtimeInstanceId state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (independent : regionalStateFootprintsIndependent regional.footprint (timerTaskStateFootprint patch) = true) :
    selectInternalOwnershipClosedRegional? program (applyInternalTimerTaskPatch state patch)
      operation = some regional.selection := by
  obtain ⟨_, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program state operation regional regionalFound
  obtain ⟨selected, references⟩ := ownershipClosedSelection_facts program state operation regional.selection closed
  have owners := ownershipClosedSelection_activity_owners program state operation regional.selection closed
  have locals := ownershipClosedSelection_local_data program state operation regional.selection closed
  have selectionFrame := regionalSelection_after_independent_timer_task program state operation
    regional.selection regional.region regional.footprint contract patch selected derived footprint prepared independent
  have outside := timerTask_regional_scope_outside state regional.selection regional.region
    regional.footprint patch footprint independent
  have cancelled := timerTask_cancelled_outside program state contract patch regional.selection.root.id
    regional.region valid prepared derived outside
  have masks := timerTask_regional_retention_frame program state contract patch regional.selection prepared cancelled
  have kept := timerTask_regional_insertions_retained program state operation regional.selection
    regional.region regional.footprint contract patch valid live selected prepared derived footprint independent
  have scopeKept := timerTask_regional_scope_retained program state operation regional.selection
    regional.region regional.footprint contract patch valid selected prepared derived footprint independent
  have ownerEq : patch.record.owner = patch.arm.owner := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalTimerTaskContract_facts program state contract patch prepared
    rfl
  have newOwner : allMatchingRetained state.scopeOccurrences
      (regionalSelectionReferenceRetention state regional.selection).scope
      (fun scope => decide (scope.id = patch.record.owner)) = true := by
    apply List.all_eq_true.mpr
    intro scope _
    by_cases same : scope.id = patch.record.owner
    · simp [same, scopeKept scope (same.trans ownerEq)]
    · simp [same]
  have referencesAfter := (timerTask_regional_ownership_frame state patch _ kept.1 kept.2.1
    (timerTask_new_references program state contract patch _ prepared)).trans references
  have ownersAfter := (timerTask_regional_activity_owners_frame state patch _ newOwner).trans owners
  have localsAfter := timerTask_regional_local_data_preserved program state contract patch _ _ prepared locals
  simp only [selectInternalOwnershipClosedRegional?, selectionFrame, Option.bind_eq_bind,
    Option.bind_some, masks.1, masks.2, referencesAfter, ownersAfter, localsAfter,
    Bool.true_and, ↓reduceIte]

end BpmnSemantics.SemanticProcess.InternalCommutation
