import BpmnSemantics.SemanticProcess.InternalDataArmingCommutation

/-! # Data-arming preparation preservation

The predecessor-selected copy and both independent issuers survive the other task's six-field
update. Complete preparation, including association freshness, is reconstructed from those reads.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem tokenFilter_remove_other (tokens : List ControlToken)
    (removed queried : ControlPlaceId) (owner : ScopeOccurrenceId)
    (different : removed ≠ queried) :
    (removeToken tokens removed owner).filter (fun token => decide (token.placeId = queried)) =
      tokens.filter (fun token => decide (token.placeId = queried)) := by
  induction tokens with
  | nil => rfl
  | cons token rest ih =>
      by_cases removedHere : token.placeId = removed ∧ token.owner = owner
      · have notQueried : token.placeId ≠ queried :=
          fun same => different (removedHere.1.symm.trans same)
        have removeTrue : (decide (token.placeId = removed) &&
            decide (token.owner = owner)) = true := by simp [removedHere]
        simp [removeToken, removeTrue, notQueried]
      · have removeFalse : (decide (token.placeId = removed) &&
            decide (token.owner = owner)) = false := by
          simpa [Bool.and_eq_true] using removedHere
        simp [removeToken, removeFalse, List.filter_cons, ih]

private theorem any_insertActivityVariableScope (predicate : ActivityVariableScope → Bool)
    (inserted : ActivityVariableScope) (values : List ActivityVariableScope) :
    (insertActivityVariableScope inserted values).any predicate =
      (predicate inserted || values.any predicate) := by
  induction values with
  | nil => simp [insertActivityVariableScope]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      split <;> simp_all [Bool.or_left_comm]

private theorem any_insertActivityOccurrence (predicate : ActivityOccurrence → Bool)
    (inserted : ActivityOccurrence) (values : List ActivityOccurrence) :
    (insertActivityOccurrence inserted values).any predicate =
      (predicate inserted || values.any predicate) := by
  induction values with
  | nil => simp [insertActivityOccurrence]
  | cons current rest ih =>
      simp only [insertActivityOccurrence]
      split <;> simp_all [Bool.or_left_comm]

private theorem taskCounter_set_other (state : RuntimeState) (values : List TaskActivation)
    (target query : TaskDefinitionId) (count : Nat) (different : target ≠ query) :
    taskActivationCount (setActivationCount values target count) query =
      taskActivationCount values query := by
  exact activationCount_setActivationCount_other { state with activations := values }
    target query count different.symm

/-- ADIO-SCOPE-01 permits unequal task and Activity counters; each issuer frames by its own key. -/
theorem makeInternalDataArmingPatch_frame
    (program : Program) (state : RuntimeState) (left right : InternalDataArmingContract)
    (leftOwner rightOwner : ScopeOccurrenceId)
    (leftOrigin rightOrigin : BpmnSequenceFlowOrigin)
    (leftSource rightSource : List VariableBinding) (different : left.taskId ≠ right.taskId) :
    makeInternalDataArmingPatch program
        (applyInternalDataArmingPatch state
          (makeInternalDataArmingPatch program state left leftOwner leftOrigin leftSource))
        right rightOwner rightOrigin rightSource =
      makeInternalDataArmingPatch program state right rightOwner rightOrigin rightSource := by
  simp only [makeInternalDataArmingPatch, applyInternalDataArmingPatch,
    applyInternalArmingPatch, dataInputOutputActivityRecord, activationCount,
    activityActivationCount]
  rw [taskCounter_set_other state _ _ _ _ different,
    taskCounter_set_other state _ _ _ _ different]

private theorem anchorAbsent_insert_other (state : RuntimeState)
    (inserted : UserTaskWait) (occurrence : OccurrenceId)
    (absent : openWaitAnchorAbsent state occurrence = true)
    (different : userTaskWaitOccurrence inserted ≠ occurrence) :
    openWaitAnchorAbsent { state with waits := insertUserTaskWait inserted state.waits }
      occurrence = true := by
  have missing : occurrence ∉ openWaitAnchors state := by
    simpa [openWaitAnchorAbsent, List.contains_eq_mem] using absent
  have missingAfter : occurrence ∉ openWaitAnchors
      { state with waits := insertUserTaskWait inserted state.waits } := by
    simp only [openWaitAnchors, List.mem_append, List.mem_map] at missing ⊢
    intro found
    apply missing
    rcases found with (((task | message) | timer) | effect) | incident
    · obtain ⟨wait, member, same⟩ := task
      rcases (mem_insertUserTaskWait inserted wait _).mp member with equal | old
      · exact False.elim (different (equal ▸ same))
      · exact Or.inl (Or.inl (Or.inl (Or.inl ⟨wait, old, same⟩)))
    · exact Or.inl (Or.inl (Or.inl (Or.inr message)))
    · exact Or.inl (Or.inl (Or.inr timer))
    · exact Or.inl (Or.inr effect)
    · exact Or.inr incident
  simpa [openWaitAnchorAbsent, List.contains_eq_mem] using missingAfter

/-- Distinct inputs and task keys preserve the entire prepared patch, even with shared source data. -/
theorem prepareInternalDataArmingContract_preserved
    (program : Program) (state : RuntimeState)
    (left right : InternalDataArmingContract) (leftPatch rightPatch : InternalDataArmingPatch)
    (leftPrepared : prepareInternalDataArmingContract? program state left = some leftPatch)
    (rightPrepared : prepareInternalDataArmingContract? program state right = some rightPatch)
    (inputsDifferent : left.input ≠ right.input) (tasksDifferent : left.taskId ≠ right.taskId) :
    prepareInternalDataArmingContract? program (applyInternalDataArmingPatch state leftPatch)
      right = some rightPatch := by
  obtain ⟨leftOwner, leftOrigin, leftSource, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state left leftPatch leftPrepared
  obtain ⟨rightOwner, rightOrigin, rightSource, owned, running, selected, live,
    originFound, sourceFound, unique, anchorAbsent, scopeAbsent, recordAbsent, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state right rightPatch rightPrepared
  let leftPatch := makeInternalDataArmingPatch program state left leftOwner leftOrigin leftSource
  let rightPatch := makeInternalDataArmingPatch program state right rightOwner rightOrigin rightSource
  let after := applyInternalDataArmingPatch state leftPatch
  have valuesDifferent : left.taskId.value ≠ right.taskId.value :=
    fun same => tasksDifferent (taskDefinitionId_eq_of_value_eq _ _ same)
  have ownerFrame : onlyTokenOwner? after right.input = some rightOwner := by
    dsimp only [after, leftPatch, applyInternalDataArmingPatch, makeInternalDataArmingPatch,
      applyInternalArmingPatch]
    unfold onlyTokenOwner? tokenOwners
    rw [tokenFilter_remove_other _ _ _ _ inputsDifferent]
    exact owned
  have runningFrame : after.control = .running rightOwner.processInstanceId := running
  have liveFrame : exactLiveOccurrence after rightOwner = true := live
  have sourceFrame : dataArmingBindings? after right.data = some rightSource :=
    sourceFound
  have patchFrame : makeInternalDataArmingPatch program after right rightOwner
      rightOrigin rightSource = rightPatch :=
    makeInternalDataArmingPatch_frame program state left right leftOwner rightOwner
      leftOrigin rightOrigin leftSource rightSource tasksDifferent
  have anchorFrame : openWaitAnchorAbsent after rightPatch.arm.write.occurrence = true := by
    apply anchorAbsent_insert_other state _ _ anchorAbsent
    intro same
    exact valuesDifferent (congrArg (fun occurrence => occurrence.elementId.value) same)
  have scopeFrame : after.variables.activities.any
      (activityOccurrenceScopeMatches (activityOwnerForRecord rightPatch.record)) = false := by
    change (insertActivityVariableScope _ state.variables.activities).any _ = false
    rw [any_insertActivityVariableScope, scopeAbsent]
    simp only [Bool.or_false, activityOccurrenceScopeMatches, localDataOwnerMatches,
      decide_eq_false_iff_not]
    intro same
    have owners := LocalDataOwner.activityOccurrence.inj same
    exact valuesDifferent
      (congrArg (fun owner => owner.activityElementId.value) owners).symm
  have bodiesDisjoint : activityBodyClaimsDisjoint leftPatch.record rightPatch.record = true := by
    apply activityBodyClaimsDisjoint_userTask_of_not_mem leftPatch.record rightPatch.record _
    simp only [rightPatch, makeInternalDataArmingPatch, dataInputOutputActivityRecord,
      activityBodyTaskClaims, List.mem_singleton]
    intro same
    exact valuesDifferent (congrArg (fun occurrence => occurrence.elementId.value) same)
  have recordDifferent : sameActivityOccurrence leftPatch.record rightPatch.record = false := by
    simp only [sameActivityOccurrence, Bool.and_eq_false_iff]
    exact Or.inl (Or.inr (by
      apply Bool.eq_false_iff.mpr
      intro same
      exact valuesDifferent (congrArg (fun id => id.value) (eq_of_beq same))))
  have recordFrame : after.activityOccurrences.any (fun record =>
      sameActivityOccurrence record rightPatch.record ||
        !activityBodyClaimsDisjoint record rightPatch.record) = false := by
    change (insertActivityOccurrence leftPatch.record state.activityOccurrences).any _ = false
    rw [any_insertActivityOccurrence, recordAbsent, recordDifferent, bodiesDisjoint]
    rfl
  change prepareInternalDataArmingContract? program after right = some rightPatch
  simp [prepareInternalDataArmingContract?, ownerFrame, runningFrame, selected, liveFrame,
    originFound, sourceFrame, patchFrame, unique, anchorFrame]
  simpa using And.intro scopeFrame recordFrame

theorem prepareInternalDataArmingContract_pair_preserved
    (program : Program) (state : RuntimeState)
    (left right : InternalDataArmingContract) (leftPatch rightPatch : InternalDataArmingPatch)
    (leftPrepared : prepareInternalDataArmingContract? program state left = some leftPatch)
    (rightPrepared : prepareInternalDataArmingContract? program state right = some rightPatch)
    (inputsDifferent : left.input ≠ right.input) (tasksDifferent : left.taskId ≠ right.taskId) :
    prepareInternalDataArmingContract? program (applyInternalDataArmingPatch state leftPatch)
        right = some rightPatch ∧
      prepareInternalDataArmingContract? program (applyInternalDataArmingPatch state rightPatch)
        left = some leftPatch :=
  ⟨prepareInternalDataArmingContract_preserved program state left right leftPatch rightPatch
      leftPrepared rightPrepared inputsDifferent tasksDifferent,
    prepareInternalDataArmingContract_preserved program state right left rightPatch leftPatch
      rightPrepared leftPrepared inputsDifferent.symm tasksDifferent.symm⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
