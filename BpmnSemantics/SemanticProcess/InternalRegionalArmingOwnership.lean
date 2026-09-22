import BpmnSemantics.SemanticProcess.InternalRegionalArmingSelectionFrame

/-! Arming retains its newly allocated owners, so REG-OWN-CLOSE-01 can reuse the
predecessor's regional reference-retention checks without inspecting a successor diff. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem allMatchingRetained_insert_kept {α : Type} (before : α → α → Bool)
    (values : List α) (keep names : α → Bool) (value : α) (kept : keep value = true) :
    allMatchingRetained (canonicalInsertBy before value values) keep names =
      allMatchingRetained values keep names := by
  simp [allMatchingRetained, all_canonicalInsertBy, kept]

theorem allMatchingRetained_insertTask_kept (values : List UserTaskWait)
    (keep names : UserTaskWait → Bool) (value : UserTaskWait) (kept : keep value = true) :
    allMatchingRetained (insertUserTaskWait value values) keep names =
      allMatchingRetained values keep names := by
  simp [allMatchingRetained, all_insertUserTaskWait, kept]

/-- REG-OWN-CLOSE-01 observes only removal of referenced targets. Inserting a retained
target leaves every existing reference check unchanged, including aliases. -/
theorem arming_regional_ownership_frame (state : RuntimeState) (patch : InternalArmingPatch)
    (keep : RegionalReferenceRetention)
    (retained : match patch.write with
      | .userTask wait => keep.task wait = true
      | .message wait => keep.message wait = true
      | .timer wait => keep.timer wait = true
      | .effect _ _ => True) :
    regionalOwnershipClosed (applyInternalArmingPatch state patch) keep =
      regionalOwnershipClosed state keep := by
  cases write : patch.write <;> simp only [write] at retained
  all_goals simp [applyInternalArmingPatch, write, regionalOwnershipClosed,
    regionalActivityReferencesClosed, insertMessageWait, insertTimerWait,
    allMatchingRetained_insert_kept, allMatchingRetained_insertTask_kept, retained]

theorem arming_regional_activity_owners_frame (state : RuntimeState)
    (patch : InternalArmingPatch) (keep : RegionalReferenceRetention) :
    regionalActivityOwnersClosed (applyInternalArmingPatch state patch) keep =
      regionalActivityOwnersClosed state keep := by
  cases write : patch.write <;>
    simp only [applyInternalArmingPatch, write, regionalActivityOwnersClosed]

theorem arming_regional_local_data_frame (state : RuntimeState)
    (patch : InternalArmingPatch) (keepActivity : ActivityOccurrence → Bool)
    (keepLocal : ActivityVariableScope → Bool) :
    regionalRetainedLocalDataClosed (applyInternalArmingPatch state patch) keepActivity keepLocal =
      regionalRetainedLocalDataClosed state keepActivity keepLocal := by
  cases write : patch.write <;>
    simp [applyInternalArmingPatch, write, regionalRetainedLocalDataClosed,
      all_insertActivityVariableScope]

theorem preparedArming_cancelled_outside (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (root : ScopeOccurrenceId) (region : InternalOccurrenceRegion)
    (valid : runtimePositionValid program arm.scopeFramePatch.runtimeInstanceId state = true)
    (prepared : arm.Prepared program state)
    (derived : deriveInternalOccurrenceRegion? state root = some region)
    (outside : region.contains arm.scopeFramePatch.owner = false) :
    (occurrenceInSubtree state.scopeOccurrences root arm.scopeFramePatch.owner ||
      (calledInstanceClosure state root).contains arm.scopeFramePatch.owner.processInstanceId) = false := by
  have facts := preparedArming_owner_facts program state arm prepared
  obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true facts.2.1)
  have member : scope ∈ state.scopeOccurrences.filter
      (fun value => decide (value.id = arm.scopeFramePatch.owner)) := by rw [census]; simp
  obtain ⟨member, same⟩ := List.mem_filter.mp member
  have live := List.mem_map.mpr ⟨scope, member, of_decide_eq_true same⟩
  exact (regional_cancellation_mask program state _ _ valid facts.2.2 root region derived
    arm.scopeFramePatch.owner live).symm.trans outside

theorem preparedArming_cancellation_populations (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (cancelled : ScopeOccurrenceId → Bool)
    (prepared : arm.Prepared program state) (outside : cancelled arm.scopeFramePatch.owner = false) :
    withdrawnByRegion cancelled (arm.apply state).activityOccurrences =
        withdrawnByRegion cancelled state.activityOccurrences ∧
      (arm.apply state).effectWaits.filter (fun wait => cancelled wait.owner) =
        state.effectWaits.filter (fun wait => cancelled wait.owner) := by
  have assigned := preparedArming_write_owner program state arm prepared
  cases arm with
  | ordinary operation patch =>
      change cancelled patch.owner = false at outside
      cases write : patch.write <;>
        simp only [PreparedInternalArming.scopeFramePatch, write, InternalArmingWrite.owner] at assigned
      all_goals simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write, true_and]
      rw [insertEffectWait, filter_canonicalInsertBy_rejected _ _ _ _ (by simpa [assigned] using outside)]
  | data contract patch =>
      obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
        prepareInternalDataArmingContract_facts program state contract patch prepared
      subst patch
      change cancelled owner = false at outside
      constructor
      · change withdrawnByRegion cancelled (insertActivityOccurrence _ _) = _
        rw [withdrawnByRegion, insertActivityOccurrence_eq_canonicalInsertBy,
          filter_canonicalInsertBy_rejected _ _ _ _ (by
            simp [makeInternalDataArmingPatch, dataInputOutputActivityRecord, recordInRegion, outside])]
        rfl
      · rfl

/-- The new wait and any new data Activity are outside cancellation. Consequently the
predecessor-derived cleanup masks themselves remain unchanged, not just their current members. -/
theorem preparedArming_regional_retention_frame (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (selected : InternalRegionalSelection)
    (prepared : arm.Prepared program state)
    (outside : (occurrenceInSubtree state.scopeOccurrences selected.root.id arm.scopeFramePatch.owner ||
      (calledInstanceClosure state selected.root.id).contains arm.scopeFramePatch.owner.processInstanceId) = false) :
    regionalSelectionReferenceRetention (arm.apply state) selected =
        regionalSelectionReferenceRetention state selected ∧
      regionalSelectionLocalDataRetention (arm.apply state) selected =
        regionalSelectionLocalDataRetention state selected := by
  have populations := preparedArming_cancellation_populations program state arm
    (fun owner => occurrenceInSubtree state.scopeOccurrences selected.root.id owner ||
      (calledInstanceClosure state selected.root.id).contains owner.processInstanceId) prepared outside
  have fields := scopeArming_scope_read_projections state arm
  have scopes := fields.2.2.1
  have calls := fields.2.2.2.1
  have incidents : (arm.apply state).effectIncidents = state.effectIncidents := by
    cases arm with
    | ordinary operation patch => cases write : patch.write <;> simp [PreparedInternalArming.apply, applyInternalArmingPatch, write]
    | data contract patch => cases write : patch.arm.write <;> simp [PreparedInternalArming.apply, applyInternalDataArmingPatch, applyInternalArmingPatch, write]
  have called : calledInstanceClosure (arm.apply state) selected.root.id =
      calledInstanceClosure state selected.root.id := by simp only [calledInstanceClosure, scopes, calls]
  cases kind : selected.kind <;>
    simp only [regionalSelectionReferenceRetention, regionalSelectionLocalDataRetention, kind,
      callReferenceRetention, cancellationReferenceRetention, scopes, calls, called,
      populations.1, populations.2, incidents, and_self]

/-- ADIO-SCOPE-01 adds one fresh owner and its local scope together. Neither freshness check
can be dropped: an old local could otherwise start naming the new Activity. -/
theorem regionalLocalData_insert_activity (state : RuntimeState) (record : ActivityOccurrence)
    (bindings : List VariableBinding) (keepActivity : ActivityOccurrence → Bool)
    (keepLocal : ActivityVariableScope → Bool)
    (localsFresh : ∀ scope ∈ state.variables.activities, regionalLocalScopeNamesActivity scope record = false)
    (recordsFresh : state.activityOccurrences.filter
      (regionalLocalScopeNamesActivity { owner := .activityOccurrence (activityOwnerForRecord record), bindings }) = [])
    (kept : keepActivity record = true) :
    regionalRetainedLocalDataClosed
      { state with
        activityOccurrences := insertActivityOccurrence record state.activityOccurrences
        variables := addActivityOccurrenceVariableScope state.variables (activityOwnerForRecord record) bindings }
      keepActivity keepLocal = regionalRetainedLocalDataClosed state keepActivity keepLocal := by
  let inserted : ActivityVariableScope :=
    { owner := .activityOccurrence (activityOwnerForRecord record), bindings }
  have named : regionalLocalScopeNamesActivity inserted record = true := by
    simp [inserted, regionalLocalScopeNamesActivity, activityOwnerForRecord,
      activityOccurrenceScopeMatches, localDataOwnerMatches]
  have census : (insertActivityOccurrence record state.activityOccurrences).filter
      (regionalLocalScopeNamesActivity inserted) = [record] := by
    rw [insertActivityOccurrence_eq_canonicalInsertBy]
    have perm := filter_canonicalInsertBy_perm activityOccurrenceBefore
      (regionalLocalScopeNamesActivity inserted) record state.activityOccurrences named
    rw [recordsFresh] at perm
    exact perm.eq_singleton
  have oldCensus (scope : ActivityVariableScope) (member : scope ∈ state.variables.activities) :
      (insertActivityOccurrence record state.activityOccurrences).filter
        (regionalLocalScopeNamesActivity scope) = state.activityOccurrences.filter
          (regionalLocalScopeNamesActivity scope) := by
    rw [insertActivityOccurrence_eq_canonicalInsertBy,
      filter_canonicalInsertBy_rejected _ _ _ _ (localsFresh scope member)]
  simp only [regionalRetainedLocalDataClosed, addActivityOccurrenceVariableScope,
    all_insertActivityVariableScope]
  change ((if !keepLocal inserted then true else
    match inserted.owner with
    | .effectOccurrence _ => true
    | .activityOccurrence _ => match (insertActivityOccurrence record state.activityOccurrences).filter
        (regionalLocalScopeNamesActivity inserted) with
      | [record] => keepActivity record | _ => false) && _) = _
  simp only [inserted, census, kept, ite_self, Bool.true_and]
  apply Bool.eq_iff_iff.mpr
  simp only [List.all_eq_true]
  constructor <;> intro checked scope member <;>
    simpa only [oldCensus scope member] using checked scope member

theorem preparedDataArming_regional_local_data_frame (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (keepActivity : ActivityOccurrence → Bool) (keepLocal : ActivityVariableScope → Bool)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch)
    (kept : keepActivity patch.record = true) :
    regionalRetainedLocalDataClosed (applyInternalDataArmingPatch state patch) keepActivity keepLocal =
      regionalRetainedLocalDataClosed state keepActivity keepLocal := by
  obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, localsFresh, recordsFresh, _⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  have frame := regionalLocalData_insert_activity state patch.record patch.bindings
    keepActivity keepLocal (by
      intro scope member
      exact Bool.eq_false_iff.mpr (List.any_eq_false.mp localsFresh scope member)) (by
      apply List.filter_eq_nil_iff.mpr
      intro record member
      have absent := List.any_eq_false.mp recordsFresh record member
      intro named
      apply absent
      have equal : record.processInstanceId = patch.record.processInstanceId ∧
          record.activityElementId.value = patch.record.activityElementId.value ∧
          record.activation = patch.record.activation := by
        simpa [regionalLocalScopeNamesActivity, activityOccurrenceScopeMatches,
          localDataOwnerMatches, activityOwnerForRecord, ActivityOccurrenceId.mk.injEq] using named
      have element : record.activityElementId = patch.record.activityElementId :=
        congrArg NodeId.mk equal.2.1
      simp [sameActivityOccurrence, equal.1, element, equal.2.2]) kept
  exact frame

theorem preparedDataArming_new_references (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (keep : RegionalReferenceRetention)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch) :
    regionalActivityReferencesClosed state keep patch.record = true := by
  obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, absent, _, _, patchEq⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  subst patch
  have missing : (makeInternalDataArmingPatch program state contract owner inputOrigin source).arm.write.occurrence
      ∉ openWaitAnchors state := by simpa [openWaitAnchorAbsent, List.contains_eq_mem] using absent
  simp only [makeInternalDataArmingPatch, dataInputOutputActivityRecord,
    regionalActivityReferencesClosed, List.all_nil, Bool.and_true]
  apply List.all_eq_true.mpr
  intro wait member
  have unmatched : taskIdNamesWait
      { processInstanceId := owner.processInstanceId, elementId := ⟨contract.taskId.value⟩,
        activation := activationCount state contract.taskId + 1 } wait = false := by
    apply Bool.eq_false_iff.mpr
    intro named
    simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at named
    apply missing
    have same : userTaskWaitOccurrence wait =
        (makeInternalDataArmingPatch program state contract owner inputOrigin source).arm.write.occurrence := by
      simp [userTaskWaitOccurrence, makeInternalDataArmingPatch, InternalArmingWrite.occurrence,
        named.1.1, named.1.2, named.2]
    simp only [openWaitAnchors, List.mem_append, List.mem_map]
    exact Or.inl (Or.inl (Or.inl (Or.inl ⟨wait, member, same⟩)))
  simp [unmatched]

theorem dataArming_regional_ownership_frame (state : RuntimeState)
    (patch : InternalDataArmingPatch) (keep : RegionalReferenceRetention)
    (taskKept : match patch.arm.write with | .userTask wait => keep.task wait = true | _ => False)
    (newReferences : regionalActivityReferencesClosed state keep patch.record = true) :
    regionalOwnershipClosed (applyInternalDataArmingPatch state patch) keep =
      regionalOwnershipClosed state keep := by
  cases write : patch.arm.write <;> simp only [write] at taskKept
  all_goals try contradiction
  have references (record : ActivityOccurrence) :
      regionalActivityReferencesClosed (applyInternalDataArmingPatch state patch) keep record =
        regionalActivityReferencesClosed state keep record := by
    simp [regionalActivityReferencesClosed, applyInternalDataArmingPatch, applyInternalArmingPatch,
      write, allMatchingRetained_insertTask_kept _ _ _ _ taskKept]
  simp only [regionalOwnershipClosed, references]
  simp only [applyInternalDataArmingPatch, applyInternalArmingPatch, write]
  simp [insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy, newReferences]

theorem dataArming_regional_activity_owners_frame (state : RuntimeState)
    (patch : InternalDataArmingPatch) (keep : RegionalReferenceRetention)
    (newOwner : allMatchingRetained state.scopeOccurrences keep.scope
      (fun scope => decide (scope.id = patch.record.owner)) = true) :
    regionalActivityOwnersClosed (applyInternalDataArmingPatch state patch) keep =
      regionalActivityOwnersClosed state keep := by
  cases write : patch.arm.write <;>
    simp [regionalActivityOwnersClosed, applyInternalDataArmingPatch, applyInternalArmingPatch,
      write, insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy, newOwner]

end BpmnSemantics.SemanticProcess.InternalCommutation
