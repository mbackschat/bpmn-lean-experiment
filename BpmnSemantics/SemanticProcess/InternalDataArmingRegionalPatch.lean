import BpmnSemantics.SemanticProcess.InternalArmingRegionalPatch

/-! Data arming commutes with cancellation outside its owner. Actual preparation supplies
the fresh Activity identity, so cancellation cannot discard the newly copied local binding.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem dataArming_cancellation_commutes (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (prepared : prepareInternalDataArmingContract? program state contract = some patch)
    (canonical : canonicalCollectionOrder state = true)
    (outside : (occurrenceInSubtree state.scopeOccurrences root patch.arm.owner ||
      (calledInstanceClosure state root).contains patch.arm.owner.processInstanceId) = false) :
    cancelScopeSubtree (applyInternalDataArmingPatch state patch) root disposition =
      applyInternalDataArmingPatch (cancelScopeSubtree state root disposition) patch := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  have populations := preparedArming_cancellation_populations program state (.data contract patch)
    cancelled prepared outside (retainedCancellationRoot root disposition)
  obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, recordsFresh, patchEq⟩ :=
    prepareInternalDataArmingContract_facts program state contract patch prepared
  subst patch
  change cancelled owner = false at outside
  let record := dataInputOutputActivityRecord state owner.processInstanceId owner contract.taskId
  let wait : UserTaskWait :=
    { processInstanceId := owner.processInstanceId, owner,
      task := { id := contract.taskId, name := contract.taskName },
      activation := activationCount state contract.taskId + 1, output := contract.output }
  let scope : ActivityVariableScope :=
    { owner := .activityOccurrence (activityOwnerForRecord record),
      bindings := source }
  have keptWait : (!cancelled wait.owner) = true := by simp [wait, outside]
  have keptRecord : (!recordInRegion cancelled record (retainedCancellationRoot root disposition)) = true := by
    simp [record, dataInputOutputActivityRecord, recordInRegion, outside]
  have oldRecordAbsent (old : ActivityOccurrence) (member : old ∈ state.activityOccurrences) :
      activityOccurrenceScopeMatches (activityOwnerForRecord old) scope = false := by
    have absent := List.any_eq_false.mp recordsFresh old member
    apply Bool.eq_false_iff.mpr
    intro same
    apply absent
    have equal : old.processInstanceId = record.processInstanceId ∧
        old.activityElementId.value = record.activityElementId.value ∧
        old.activation = record.activation := by
      simpa [scope, activityOccurrenceScopeMatches, localDataOwnerMatches,
        activityOwnerForRecord, ActivityOccurrenceId.mk.injEq] using same
    have element : old.activityElementId = record.activityElementId :=
      congrArg NodeId.mk equal.2.1
    simp [makeInternalDataArmingPatch, sameActivityOccurrence, ← show
      dataInputOutputActivityRecord state owner.processInstanceId owner contract.taskId = record from rfl,
      equal.1, element, equal.2.2]
  have recordsAbsent : ((withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)).any
      fun old => activityOccurrenceScopeMatches (activityOwnerForRecord old) scope) = false := by
    apply List.any_eq_false.mpr
    intro old member
    simpa using oldRecordAbsent old (List.mem_filter.mp member).1
  have calledOutside : (calledInstanceClosure state root).contains owner.processInstanceId = false :=
    (Bool.or_eq_false_iff.mp outside).2
  have localResult : (cancelScopeSubtree
      { state with variables := { state.variables with activities := [scope] } }
      root disposition).variables.activities = [scope] := by
    change [scope].filter (fun activity =>
      !(calledInstanceClosure state root).contains activity.owner.processInstanceId &&
        !((withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)).any fun old =>
          activityOccurrenceScopeMatches (activityOwnerForRecord old) activity) &&
        !((state.effectWaits.filter fun old => cancelled old.owner).any fun old =>
          activityScopeMatches (effectWaitOccurrenceId old) activity) &&
        !((state.effectIncidents.filter fun incident => cancelled incident.wait.owner).any fun incident =>
          activityScopeMatches incident.id.effectId activity)) = [scope]
    simp only [List.filter_cons, recordsAbsent, Bool.not_false, List.filter_nil]
    simpa [scope, record, dataInputOutputActivityRecord, activityOwnerForRecord,
      LocalDataOwner.processInstanceId, activityScopeMatches, localDataOwnerMatches] using calledOutside
  simp only [cancelScopeSubtree, calledInstanceClosure] at localResult
  have localKept := (List.filter_eq_self.mp localResult) scope (by simp)
  have tokenFrame : (removeToken state.tokens contract.input owner).filter (fun token => !cancelled token.owner) =
      removeToken (state.tokens.filter fun token => !cancelled token.owner) contract.input owner := by
    rw [removeToken_eq_erase, ← List.erase_filter, removeToken_eq_erase]
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at canonical
  have waitFrame := filter_canonicalInsertBy_retained userTaskWaitBefore userTaskWaitBefore_compose
    (fun wait => !cancelled wait.owner) wait state.waits canonical.2.2.1 keptWait
  have recordFrame := filter_canonicalInsertBy_retained activityOccurrenceBefore
    regional_activityOccurrenceBefore_compose (fun record => !recordInRegion cancelled record (retainedCancellationRoot root disposition))
    record state.activityOccurrences canonical.2.2.2.2.2.2.2.2.2.2.2.2.2.2.1 keptRecord
  dsimp only [cancelled] at populations waitFrame recordFrame tokenFrame
  simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch,
    makeInternalDataArmingPatch, applyInternalArmingPatch,
    insertActivityOccurrence_eq_canonicalInsertBy] at populations
  simp only [applyInternalDataArmingPatch, makeInternalDataArmingPatch,
    applyInternalArmingPatch, cancelScopeSubtree, insertUserTaskWait_eq_canonicalInsertBy,
    insertActivityOccurrence_eq_canonicalInsertBy, addActivityOccurrenceVariableScope,
    insertActivityVariableScope_eq_canonicalInsertBy, retainedByRegion]
  simp only [calledInstanceClosure] at populations waitFrame recordFrame tokenFrame ⊢
  rw [waitFrame, recordFrame, tokenFrame, populations.1]
  congr 1 <;> try rfl
  congr 1
  exact filter_canonicalInsertBy_retained activityVariableScopeBefore
    regional_activityVariableScopeBefore_compose _ scope state.variables.activities
    canonical.2.2.2.2.2.2.2.2.2.2.1 localKept

end BpmnSemantics.SemanticProcess.InternalCommutation
