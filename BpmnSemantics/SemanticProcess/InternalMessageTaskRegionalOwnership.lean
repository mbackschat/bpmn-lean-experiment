import BpmnSemantics.SemanticProcess.InternalMessageTaskRegionalRetention
import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalOwnership

/-! The new Activity references its jointly inserted task and Message, which the regional mask retains.
Existing retained locals keep their exact record census because preparation forbids Activity aliases.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem messageTask_new_references (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (keep : RegionalReferenceRetention)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch) :
    regionalActivityReferencesClosed state keep patch.record = true := by
  have messageFresh := prepared_message_task_message_keys_fresh program state contract patch prepared
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, taskAbsent, _, _, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  let patch := makeInternalMessageTaskPatch program state contract owner instanceId processId origin
  have taskFresh := armingPatch_key_fresh_of_anchor_absent state patch.arm taskAbsent
  change regionalActivityReferencesClosed state keep patch.record = true
  simp only [patch, makeInternalMessageTaskPatch, regionalActivityReferencesClosed,
    List.all_cons, List.all_nil, Bool.and_true, Bool.and_eq_true, allMatchingRetained, List.all_eq_true]
  constructor
  · intro wait member
    have absent := (taskFresh wait member).1
    have unmatched : taskIdNamesWait
        { processInstanceId := instanceId, elementId := ⟨contract.task.id.value⟩,
          activation := activationCount state contract.task.id + 1 } wait = false := by
      simp [userTaskWaitKeyMatches, taskIdNamesWait,
        beq_iff_eq] at absent ⊢
      exact fun process element => absent process (taskDefinitionId_eq_of_value_eq _ _ element)
    simp [unmatched]
  · intro wait member
    have absent := (messageFresh wait member).1
    have unmatched : messageIdNamesWait
        { processInstanceId := instanceId, elementId := ⟨contract.message.elementId.value⟩,
          activation := messageActivationCount state contract.message.elementId + 1 } wait = false := by
      simp [makeInternalMessageTaskPatch, messageWaitKeyMatches, messageIdNamesWait,
        beq_iff_eq] at absent ⊢
      exact fun process element => absent process (congrArg NodeId.mk element)
    simp [unmatched]

theorem messageTask_regional_ownership_frame (state : RuntimeState) (patch : InternalMessageTaskPatch)
    (keep : RegionalReferenceRetention)
    (taskKept : match patch.arm.write with | .userTask wait => keep.task wait = true | _ => False)
    (messageKept : keep.message patch.message = true)
    (newReferences : regionalActivityReferencesClosed state keep patch.record = true) :
    regionalOwnershipClosed (applyInternalMessageTaskPatch state patch) keep =
      regionalOwnershipClosed state keep := by
  cases write : patch.arm.write <;> simp only [write] at taskKept
  all_goals try contradiction
  have references (record : ActivityOccurrence) :
      regionalActivityReferencesClosed (applyInternalMessageTaskPatch state patch) keep record =
        regionalActivityReferencesClosed state keep record := by
    simp [regionalActivityReferencesClosed, applyInternalMessageTaskPatch, applyInternalArmingPatch,
      write, insertMessageWait, allMatchingRetained_insertTask_kept _ _ _ _ taskKept,
      allMatchingRetained_insert_kept _ _ _ _ _ messageKept]
  simp only [regionalOwnershipClosed, references]
  simp [applyInternalMessageTaskPatch, applyInternalArmingPatch, write,
    insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy, newReferences,
    insertMessageWait, allMatchingRetained_insert_kept _ _ _ _ _ messageKept]

theorem messageTask_regional_activity_owners_frame (state : RuntimeState)
    (patch : InternalMessageTaskPatch) (keep : RegionalReferenceRetention)
    (newOwner : allMatchingRetained state.scopeOccurrences keep.scope
      (fun scope => decide (scope.id = patch.record.owner)) = true) :
    regionalActivityOwnersClosed (applyInternalMessageTaskPatch state patch) keep =
      regionalActivityOwnersClosed state keep := by
  cases write : patch.arm.write <;>
    simp [regionalActivityOwnersClosed, applyInternalMessageTaskPatch, applyInternalArmingPatch,
      write, insertActivityOccurrence_eq_canonicalInsertBy, all_canonicalInsertBy, newOwner]

theorem messageTask_regional_local_data_preserved (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (keepActivity : ActivityOccurrence → Bool) (keepLocal : ActivityVariableScope → Bool)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (prior : regionalRetainedLocalDataClosed state keepActivity keepLocal = true) :
    regionalRetainedLocalDataClosed (applyInternalMessageTaskPatch state patch) keepActivity keepLocal = true := by
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, absent, _, rfl⟩ :=
    prepareInternalMessageTaskContract_facts program state contract patch prepared
  exact regionalLocalDataClosed_insertActivity state _ _ keepActivity keepLocal rfl rfl absent prior

theorem regionalOwnershipSelection_after_independent_message_task
    (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (regional : PreparedInternalRegional) (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch)
    (valid : runtimePositionValid program patch.arm.runtimeInstanceId state = true)
    (live : activityRecordsOwnLiveWork state = true)
    (regionalFound : prepareInternalRegional? program state operation = some regional)
    (prepared : prepareInternalMessageTaskContract? program state contract = some patch)
    (independent : regionalStateFootprintsIndependent regional.footprint (messageTaskStateFootprint patch) = true) :
    selectInternalOwnershipClosedRegional? program (applyInternalMessageTaskPatch state patch)
      operation = some regional.selection := by
  obtain ⟨_, _, _, closed, derived, footprint, _⟩ :=
    prepareInternalRegional_facts program state operation regional regionalFound
  obtain ⟨selected, references⟩ := ownershipClosedSelection_facts program state operation regional.selection closed
  have owners := ownershipClosedSelection_activity_owners program state operation regional.selection closed
  have locals := ownershipClosedSelection_local_data program state operation regional.selection closed
  have selectionFrame := regionalSelection_after_independent_message_task program state operation
    regional.selection regional.region regional.footprint contract patch selected derived footprint prepared independent
  have outside := messageTask_regional_scope_outside state regional.selection regional.region
    regional.footprint patch footprint independent
  have cancelled := messageTask_cancelled_outside program state contract patch regional.selection.root.id
    regional.region valid prepared derived outside
  have masks := messageTask_regional_retention_frame program state contract patch regional.selection prepared cancelled
  have kept := messageTask_regional_insertions_retained program state operation regional.selection
    regional.region regional.footprint contract patch valid live selected prepared derived footprint independent
  have scopeKept := messageTask_regional_scope_retained program state operation regional.selection
    regional.region regional.footprint contract patch valid selected prepared derived footprint independent
  have ownerEq : patch.record.owner = patch.arm.owner := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalMessageTaskContract_facts program state contract patch prepared
    rfl
  have newOwner : allMatchingRetained state.scopeOccurrences
      (regionalSelectionReferenceRetention state regional.selection).scope
      (fun scope => decide (scope.id = patch.record.owner)) = true := by
    apply List.all_eq_true.mpr
    intro scope _
    by_cases same : scope.id = patch.record.owner
    · simp [same, scopeKept scope (same.trans ownerEq)]
    · simp [same]
  have referencesAfter := (messageTask_regional_ownership_frame state patch _ kept.1 kept.2.1
    (messageTask_new_references program state contract patch _ prepared)).trans references
  have ownersAfter := (messageTask_regional_activity_owners_frame state patch _ newOwner).trans owners
  have localsAfter := messageTask_regional_local_data_preserved program state contract patch _ _ prepared locals
  simp only [selectInternalOwnershipClosedRegional?, selectionFrame, Option.bind_eq_bind,
    Option.bind_some, masks.1, masks.2, referencesAfter, ownersAfter, localsAfter,
    Bool.true_and, ↓reduceIte]

end BpmnSemantics.SemanticProcess.InternalCommutation
