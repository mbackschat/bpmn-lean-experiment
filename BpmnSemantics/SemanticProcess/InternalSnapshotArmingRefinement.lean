import BpmnSemantics.SemanticProcess.InternalCommutationRuntimePreservation

/-! Full running-state validity makes ordinary arming agree with the snapshot-aware attempt, including retention purge. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

private theorem live_scope_any_of_exact (state : RuntimeState) (owner : ScopeOccurrenceId)
    (live : exactLiveOccurrence state owner = true) :
    (state.scopeOccurrences.any fun occurrence => occurrence.id == owner) = true := by
  simp only [exactLiveOccurrence, decide_eq_true_eq] at live
  obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp live
  have member : occurrence ∈ state.scopeOccurrences.filter fun candidate =>
      decide (candidate.id = owner) := by rw [singleton]; simp
  obtain ⟨member, selected⟩ := List.mem_filter.mp member
  exact List.any_eq_true.mpr ⟨occurrence, member, by simpa using selected⟩

/-- Running lifecycle and positional parent binding keep every retained context rooted in live work.
Completed promoted roots do not satisfy this law: completion may remove their live scope. -/
theorem running_valid_snapshot_purge_identity (program : Program)
    (expectedInstanceId instanceId : SemanticId) (state : RuntimeState)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (running : state.control = .running instanceId) :
    purgeCompensationParentContextsAfterUnsuccessfulScopeRemoval state = state := by
  have position : runtimePositionValid program expectedInstanceId state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid
    simp_all only
  have snapshots : compensationEventSubProcessSnapshotStateValid program state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true] at valid
    exact valid.2.1.2
  have kept : state.compensationParentContextRetentions.filter (fun retention =>
      match retention with
      | .provisional parent _ =>
          (state.scopeOccurrences.any fun occurrence => occurrence.id == parent.id) &&
            match parent.parent with
            | none => true
            | some root => state.scopeOccurrences.any fun occurrence => occurrence.id == root
      | .promoted parent _ _ =>
          match parent.parent with
          | none => state.scopeOccurrences.any fun occurrence => occurrence.id == parent.id
          | some root => state.scopeOccurrences.any fun occurrence => occurrence.id == root) =
      state.compensationParentContextRetentions := by
    apply List.filter_eq_self.mpr
    intro retention member
    cases declarationEq : program.compensationEventSubProcessSnapshots with
    | none =>
        have empty : state.compensationParentContextRetentions = [] := by
          simp only [compensationEventSubProcessSnapshotStateValid, declarationEq,
            Bool.and_eq_true] at snapshots
          simpa using snapshots.2
        simp [empty] at member
    | some declaration =>
        have lifecycle :=
          (compensationEventSubProcessSnapshotStateValid_implies_bounds_and_lifecycle
            program state declaration declarationEq snapshots).2.2
        simp only [retentionLifecycleValid, running] at lifecycle
        change (match programEntryRootScopeId? program with
          | none => false
          | some rootScopeId =>
              match state.scopeOccurrences.filter (fun occurrence =>
                occurrence.parent.isNone && occurrence.id.definitionScopeId == rootScopeId &&
                  occurrence.id.processInstanceId == instanceId) with
              | [root] => _
              | _ => false) = true at lifecycle
        cases rootScopeEq : programEntryRootScopeId? program with
        | none => simp only [rootScopeEq] at lifecycle; contradiction
        | some rootScopeId =>
          rw [rootScopeEq] at lifecycle
          dsimp only at lifecycle
          split at lifecycle
          · rename_i root rootEq
            have rootMember : root ∈ state.scopeOccurrences := by
              have found : root ∈ state.scopeOccurrences.filter (fun occurrence =>
                  occurrence.parent.isNone && occurrence.id.definitionScopeId == rootScopeId &&
                    occurrence.id.processInstanceId == instanceId) := by
                rw [rootEq]
                simp
              exact (List.mem_filter.mp found).1
            have rootLive : (state.scopeOccurrences.any fun occurrence =>
                occurrence.id == root.id) = true :=
              List.any_eq_true.mpr ⟨root, rootMember, by simp⟩
            simp only [Bool.and_eq_true] at lifecycle
            have retained := List.all_eq_true.mp lifecycle.2 retention member
            cases retention with
            | provisional parent handler =>
                change decide ((state.scopeOccurrences.filter fun occurrence =>
                  occurrence == parent).length = 1) = true at retained
                obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp
                  (of_decide_eq_true retained)
                have found : only ∈ state.scopeOccurrences.filter fun occurrence =>
                    occurrence == parent := by rw [singleton]; simp
                obtain ⟨parentMember, same⟩ := List.mem_filter.mp found
                have sameParent : only = parent := by simpa using same
                subst only
                obtain ⟨parentLive, definition, definitionMember, definitionId, binding⟩ :=
                  runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId
                    state position running parent parentMember
                have parentAny := live_scope_any_of_exact state parent.id parentLive
                rcases binding with ⟨_, noParent⟩ | ⟨owner, ownerEq, _, _, ownerLive⟩
                · simp [parentAny, noParent]
                · simp [parentAny, ownerEq, live_scope_any_of_exact state owner ownerLive]
            | promoted parent handler snapshot =>
                cases parentEq : parent.parent with
                | none =>
                    change (match parent.parent with
                      | none => false
                      | some _ => _) = true at retained
                    simp [parentEq] at retained
                | some owner =>
                    change (match parent.parent with
                      | none => false
                      | some parentRoot => _ && parentRoot == root.id && _) = true at retained
                    rw [parentEq] at retained
                    have sameRoot : owner = root.id := by
                      simp only [Bool.and_eq_true] at retained
                      simpa using retained.1.2
                    simpa [parentEq, sameRoot] using rootLive
          · contradiction
  exact congrArg (fun records => { state with compensationParentContextRetentions := records }) kept

/-- Raw ordinary preparation refines the actual attempt while preserving hidden Compensation state. -/
theorem prepareInternalArm_attempt_applies (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (expectedInstanceId : SemanticId)
    (valid : runtimeStateWellFormed program expectedInstanceId state = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    attemptInternalOperation program operation state =
      .applied { operation, successor := applyInternalArmingPatch state patch } := by
  let erased : Program := { program with compensationEventSubProcessSnapshots := none }
  have erasedPrepared : prepareInternalArm? erased state operation = some patch := prepared
  have fired := prepareInternalArm_applies erased state operation patch rfl erasedPrepared
  obtain ⟨_, instanceId, running⟩ := prepared_arm_live_running program state operation patch prepared
  have afterRunning : (applyInternalArmingPatch state patch).control = .running instanceId := by
    cases patch with | mk _ _ _ _ _ _ _ _ _ write =>
      cases write <;> simpa [applyInternalArmingPatch] using running
  have purge := running_valid_snapshot_purge_identity program expectedInstanceId instanceId
    (applyInternalArmingPatch state patch)
    (prepared_arm_preserves_runtime program state operation patch expectedInstanceId valid prepared)
    afterRunning
  have reduceAttempt (selected : SemanticOperation)
      (equation : attemptInternalOperation program selected state =
        match fire? erased selected state with
        | none => .disabled selected
        | some successor => .applied { operation := selected, successor :=
            if program.compensationEventSubProcessSnapshots.isSome then
              purgeCompensationParentContextsAfterUnsuccessfulScopeRemoval successor
            else successor })
      (selectedFire : fire? erased selected state = some (applyInternalArmingPatch state patch)) :
      attemptInternalOperation program selected state =
        .applied { operation := selected, successor := applyInternalArmingPatch state patch } := by
    rw [equation, selectedFire]
    simp only [purge, ite_self]
  cases operation <;>
    try { solve | simp [prepareInternalArm?, internalArmInput?] at prepared }
  all_goals
    apply reduceAttempt _ _ fired
    cases executionEq : program.compensationExecution <;>
      cases snapshotsEq : program.compensationEventSubProcessSnapshots <;>
      simp only [attemptInternalOperation, executionEq, snapshotsEq,
        Option.isSome_none, Option.isSome_some, Bool.false_eq_true, if_false, if_true] <;> rfl

end InternalCommutation

end BpmnSemantics.SemanticProcess
