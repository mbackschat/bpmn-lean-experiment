import BpmnSemantics.SemanticProcess.InternalArmingRegionalPatch
import BpmnSemantics.SemanticProcess.InternalRegionalChildTimerFrames

/-! Return and completion retain independent arming writes. Canonical insertion/filter laws
preserve exact collection order, including Activity-local data and bounded deadlines. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem arming_return_removal_commutes (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) (record : CalledProcessOccurrence)
    (prepared : arm.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (outside : (processInstanceClosureWithin state.calledProcessOccurrences
      [record.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)).contains
        arm.scopeFramePatch.owner.processInstanceId = false) :
    removeCalledProcessTree (arm.apply state) record =
      arm.apply (removeCalledProcessTree state record) := by
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [record.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  have tokenFrame (input : ControlPlaceId) (owner : ScopeOccurrenceId) :
      (removeToken state.tokens input owner).filter (fun token => !removed.contains token.owner.processInstanceId) =
        removeToken (state.tokens.filter fun token => !removed.contains token.owner.processInstanceId) input owner := by
    rw [removeToken_eq_erase, ← List.erase_filter, removeToken_eq_erase]
  have assigned := preparedArming_write_owner program state arm prepared
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at canonical
  have activityOrder : orderedBy activityOccurrenceBefore state.activityOccurrences = true := by simp_all only
  cases arm with
  | ordinary operation patch =>
      have shape := (prepared_arm_anchor_shape program state operation patch prepared).1
      cases write : patch.write <;>
        simp only [PreparedInternalArming.scopeFramePatch, write, InternalArmingWrite.owner] at assigned
      case userTask wait =>
        have filtered := filter_canonicalInsertBy_retained userTaskWaitBefore userTaskWaitBefore_compose
          (fun wait => !removed.contains wait.owner.processInstanceId) wait state.waits canonical.2.2.1
          (by simpa only [assigned, PreparedInternalArming.scopeFramePatch, Bool.not_eq_true'] using outside)
        simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write,
          removeCalledProcessTree, insertUserTaskWait_eq_canonicalInsertBy]
        rw [filtered, tokenFrame]
      case message wait =>
        have filtered := filter_canonicalInsertBy_retained messageWaitBefore regional_messageWaitBefore_compose
          (fun wait => !removed.contains wait.owner.processInstanceId) wait state.messageWaits canonical.2.2.2.2.1
          (by simpa only [assigned, PreparedInternalArming.scopeFramePatch, Bool.not_eq_true'] using outside)
        simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write, removeCalledProcessTree, insertMessageWait]
        rw [filtered, tokenFrame]
      case timer wait =>
        have filtered := filter_canonicalInsertBy_retained timerWaitBefore regional_timerWaitBefore_compose
          (fun wait => !removed.contains wait.owner.processInstanceId) wait state.timerWaits canonical.2.2.2.2.2.1
          (by simpa only [assigned, PreparedInternalArming.scopeFramePatch, Bool.not_eq_true'] using outside)
        simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write, removeCalledProcessTree, insertTimerWait]
        rw [filtered, tokenFrame]
      case effect wait bindings =>
        have processEq : wait.processInstanceId = patch.owner.processInstanceId := by
          simpa only [write, InternalArmingWrite.occurrence, effectWaitOccurrence] using
            congrArg OccurrenceId.processInstanceId shape
        have filtered := filter_canonicalInsertBy_retained effectWaitBefore regional_effectWaitBefore_compose
          (fun wait => !removed.contains wait.owner.processInstanceId) wait state.effectWaits canonical.2.2.2.2.2.2.1
          (by simpa only [assigned, PreparedInternalArming.scopeFramePatch, Bool.not_eq_true'] using outside)
        have locals := filter_canonicalInsertBy_retained activityVariableScopeBefore
          regional_activityVariableScopeBefore_compose
          (fun scope : ActivityVariableScope => !removed.contains scope.owner.processInstanceId)
          { owner := .effectOccurrence (effectWaitOccurrence wait), bindings } state.variables.activities
          canonical.2.2.2.2.2.2.2.2.2.2.1 (by
            simpa only [LocalDataOwner.processInstanceId, effectWaitOccurrence, processEq,
              PreparedInternalArming.scopeFramePatch, Bool.not_eq_true'] using outside)
        simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write, removeCalledProcessTree,
          insertEffectWait, insertActivityVariableScope_eq_canonicalInsertBy]
        rw [filtered, tokenFrame, locals]
  | data contract patch =>
      obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
        prepareInternalDataArmingContract_facts program state contract patch prepared
      subst patch
      let data := makeInternalDataArmingPatch program state contract owner inputOrigin source
      let task : UserTaskWait :=
        { processInstanceId := owner.processInstanceId, owner
          task := { id := contract.taskId, name := contract.taskName }
          activation := activationCount state contract.taskId + 1, output := contract.output }
      have taskKept : (!removed.contains owner.processInstanceId) = true := by
        simpa only [PreparedInternalArming.scopeFramePatch, makeInternalDataArmingPatch, Bool.not_eq_true'] using outside
      have taskFilter := filter_canonicalInsertBy_retained userTaskWaitBefore userTaskWaitBefore_compose
        (fun wait => !removed.contains wait.owner.processInstanceId) task state.waits canonical.2.2.1 taskKept
      have activityFilter := filter_canonicalInsertBy_retained activityOccurrenceBefore
        regional_activityOccurrenceBefore_compose (fun activity => !removed.contains activity.owner.processInstanceId)
        data.record state.activityOccurrences activityOrder taskKept
      have localFilter := filter_canonicalInsertBy_retained activityVariableScopeBefore
        regional_activityVariableScopeBefore_compose
        (fun scope : ActivityVariableScope => !removed.contains scope.owner.processInstanceId)
        { owner := .activityOccurrence (activityOwnerForRecord data.record), bindings := data.bindings }
        state.variables.activities canonical.2.2.2.2.2.2.2.2.2.2.1 taskKept
      dsimp only [data, makeInternalDataArmingPatch] at activityFilter localFilter
      simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch, makeInternalDataArmingPatch,
        applyInternalArmingPatch, removeCalledProcessTree, insertUserTaskWait_eq_canonicalInsertBy,
        insertActivityOccurrence_eq_canonicalInsertBy, addActivityOccurrenceVariableScope,
        insertActivityVariableScope_eq_canonicalInsertBy]
      rw [taskFilter, tokenFrame, activityFilter, localFilter]

theorem arming_ordinary_completion_commutes (before : RuntimeState) (arm : PreparedInternalArming)
    (hosting : SemanticId) (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (root : RuntimeScopeOccurrence) (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (quiet : scopeQuiescent (arm.apply before) root.id = scopeQuiescent before root.id)
    (continuation : ∀ owner place, root.parent = some owner → output = some place →
      addToken (removeToken before.tokens arm.scopeFramePatch.input arm.scopeFramePatch.owner) place owner =
        removeToken (addToken before.tokens place owner) arm.scopeFramePatch.input arm.scopeFramePatch.owner) :
    completeScopeState? (arm.apply before) definition output =
      (completeScopeState? before definition output).map arm.apply := by
  cases arm with
  | ordinary operation patch =>
      cases write : patch.write
      all_goals
        simp only [PreparedInternalArming.apply, PreparedInternalArming.scopeFramePatch,
          applyInternalArmingPatch, write] at quiet continuation ⊢
        simp only [completeScopeState?, census, quiet]
        split
        · rfl
        · simp only [completeQuiescentScope?, running]
          cases parent : root.parent <;> cases produced : output <;> simp only [Option.map_none]
          all_goals first | rfl | (split <;> first | rfl | (simp only [Option.map_some]; rw [continuation _ _ parent produced]))
  | data contract patch =>
      cases write : patch.arm.write
      all_goals
        simp only [PreparedInternalArming.apply, PreparedInternalArming.scopeFramePatch,
          applyInternalDataArmingPatch, applyInternalArmingPatch, write] at quiet continuation ⊢
        simp only [completeScopeState?, census, quiet]
        split
        · rfl
        · simp only [completeQuiescentScope?, running]
          cases parent : root.parent <;> cases produced : output <;> simp only [Option.map_none]
          all_goals first | rfl | (split <;> first | rfl | (simp only [Option.map_some]; rw [continuation _ _ parent produced]))

theorem arming_bounded_withdrawal_commutes (program : Program) (before completed : RuntimeState)
    (arm : PreparedInternalArming) (child : ScopeOccurrenceId) (deadline : TimerWait)
    (prepared : arm.Prepared program before)
    (canonical : canonicalCollectionOrder before = true)
    (member : deadline ∈ before.timerWaits)
    (timers : completed.timerWaits = before.timerWaits)
    (activities : completed.activityOccurrences = before.activityOccurrences) :
    { arm.apply completed with
      timerWaits := (arm.apply completed).timerWaits.erase deadline
      activityOccurrences := (arm.apply completed).activityOccurrences.filter
        (fun record => !decide (record.body = .childScope child)) } =
    arm.apply { completed with
      timerWaits := completed.timerWaits.erase deadline
      activityOccurrences := completed.activityOccurrences.filter
        (fun record => !decide (record.body = .childScope child)) } := by
  have timerOrder : orderedBy timerWaitBefore before.timerWaits = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at canonical
    exact canonical.2.2.2.2.2.1
  have activityOrder : orderedBy activityOccurrenceBefore before.activityOccurrences = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at canonical
    simp_all only
  cases arm with
  | ordinary operation patch =>
      have fresh := prepared_arm_key_fresh program before operation patch prepared
      cases write : patch.write with
      | timer wait =>
          rw [write] at fresh
          have different : wait ≠ deadline := by
            intro same
            subst wait
            have absent := (fresh deadline member).1
            simp [timerWaitKeyMatches] at absent
          simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write, insertTimerWait]
          rw [canonicalInsertBy_erase timerWaitBefore regional_timerWaitBefore_compose _ _ different
            completed.timerWaits (timers ▸ timerOrder)]
      | _ => simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write]
  | data contract patch =>
      obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
        prepareInternalDataArmingContract_facts program before contract patch prepared
      subst patch
      have retained := filter_canonicalInsertBy_retained activityOccurrenceBefore
        regional_activityOccurrenceBefore_compose
        (fun record => !decide (record.body = .childScope child))
        (dataInputOutputActivityRecord before owner.processInstanceId owner contract.taskId)
        completed.activityOccurrences (activities ▸ activityOrder) (by rfl)
      simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch, makeInternalDataArmingPatch,
        applyInternalArmingPatch, insertActivityOccurrence_eq_canonicalInsertBy]
      rw [retained]

private theorem arming_monitored_withdrawal_commutes (program : Program) (before completed : RuntimeState)
    (arm : PreparedInternalArming) (record : ActivityOccurrence) (child : ScopeOccurrenceId)
    (deadline : Option TimerWait)
    (prepared : arm.Prepared program before)
    (canonical : canonicalCollectionOrder before = true)
    (body : record.body = .childScope child)
    (member : ∀ timer, deadline = some timer → timer ∈ before.timerWaits)
    (timers : completed.timerWaits = before.timerWaits)
    (activities : completed.activityOccurrences = before.activityOccurrences) :
    { arm.apply completed with
      timerWaits := removeMonitoredScopeTimer (arm.apply completed).timerWaits deadline
      activityOccurrences := (arm.apply completed).activityOccurrences.erase record } =
    arm.apply { completed with
      timerWaits := removeMonitoredScopeTimer completed.timerWaits deadline
      activityOccurrences := completed.activityOccurrences.erase record } := by
  have timerOrder : orderedBy timerWaitBefore before.timerWaits = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have activityOrder : orderedBy activityOccurrenceBefore before.activityOccurrences = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  cases arm with
  | ordinary operation patch =>
      have fresh := prepared_arm_key_fresh program before operation patch prepared
      cases write : patch.write with
      | timer wait =>
          rw [write] at fresh
          cases deadline with
          | none => simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write, removeMonitoredScopeTimer]
          | some timer =>
              have different : wait ≠ timer := by
                intro same
                subst wait
                have absent := (fresh timer (member timer rfl)).1
                simp [timerWaitKeyMatches] at absent
              simp only [PreparedInternalArming.apply, applyInternalArmingPatch, write,
                removeMonitoredScopeTimer, insertTimerWait]
              rw [canonicalInsertBy_erase timerWaitBefore regional_timerWaitBefore_compose _ _ different
                completed.timerWaits (timers ▸ timerOrder)]
      | _ => cases deadline <;> simp only [PreparedInternalArming.apply, applyInternalArmingPatch,
          write, removeMonitoredScopeTimer]
  | data contract patch =>
      obtain ⟨owner, inputOrigin, source, _, _, _, _, _, _, _, _, _, _, patchEq⟩ :=
        prepareInternalDataArmingContract_facts program before contract patch prepared
      subst patch
      have different : dataInputOutputActivityRecord before owner.processInstanceId owner contract.taskId ≠ record := by
        intro same
        have bodies := congrArg ActivityOccurrence.body same
        rw [body] at bodies
        contradiction
      simp only [PreparedInternalArming.apply, applyInternalDataArmingPatch, makeInternalDataArmingPatch,
        applyInternalArmingPatch, insertActivityOccurrence_eq_canonicalInsertBy]
      rw [canonicalInsertBy_erase activityOccurrenceBefore regional_activityOccurrenceBefore_compose _ _ different
        completed.activityOccurrences (activities ▸ activityOrder)]

theorem arming_completion_successors_equal (program : Program) (before after afterArm : RuntimeState)
    (arm : PreparedInternalArming) (hosting : SemanticId) (definition : DefinitionScopeId)
    (output : Option ControlPlaceId) (root : RuntimeScopeOccurrence) (withdrawal : InternalCompletionWithdrawal)
    (prepared : arm.Prepared program before)
    (canonical : canonicalCollectionOrder before = true)
    (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (withdrawn : selectInternalCompletionWithdrawal? program before definition = some withdrawal)
    (quiet : scopeQuiescent (arm.apply before) root.id = scopeQuiescent before root.id)
    (continuation : ∀ owner place, root.parent = some owner → output = some place →
      addToken (removeToken before.tokens arm.scopeFramePatch.input arm.scopeFramePatch.owner) place owner =
        removeToken (addToken before.tokens place owner) arm.scopeFramePatch.input arm.scopeFramePatch.owner)
    (result : completeBoundedScope? program before definition output = some after)
    (armResult : completeBoundedScope? program (arm.apply before) definition output = some afterArm) :
    afterArm = arm.apply after := by
  obtain ⟨completed, ordinary, _⟩ := completeBoundedScope_position_fields program before after definition output result
  have ordinaryFrame := arming_ordinary_completion_commutes before arm hosting definition output root
    running census quiet continuation
  rw [ordinary, Option.map_some] at ordinaryFrame
  have withdrawalFrame := preparedArming_completion_withdrawal program before arm prepared definition withdrawal withdrawn
  obtain ⟨actual, actualResult, update⟩ := completionWithdrawal_refines program before completed
    definition output withdrawal withdrawn ordinary
  have same : actual = after := Option.some.inj (actualResult.symm.trans result)
  subst actual
  obtain ⟨armedActual, armedResult, armedUpdate⟩ := completionWithdrawal_refines program
    (arm.apply before) (arm.apply completed) definition output withdrawal withdrawalFrame ordinaryFrame
  have armedSame : armedActual = afterArm := Option.some.inj (armedResult.symm.trans armResult)
  subst armedActual
  cases withdrawal with
  | monitored record deadline =>
      exact (boundedWithdrawal_not_monitored program before definition record deadline withdrawn).elim
  | unbounded => simp only at update armedUpdate; rw [update, armedUpdate]
  | bounded record deadline =>
      obtain ⟨declaration, child, parent, _, _, _, body⟩ :=
        completionWithdrawal_raw_selection program before definition record deadline withdrawn
      obtain ⟨_, _, _, attached, _, _, _, _, _, _, _, deadlineCensus, _⟩ :=
        completionWithdrawal_bounded_facts program before definition record deadline withdrawn
      have member : deadline ∈ before.timerWaits := by
        have present : deadline ∈ before.timerWaits.filter (timerIdNamesWait attached) := by rw [deadlineCensus]; simp
        exact (List.mem_filter.mp present).1
      have fields := completeScopeState_reference_fields before completed definition output root census ordinary
      simp only at update armedUpdate
      rw [update, armedUpdate, body]
      exact arming_bounded_withdrawal_commutes program before completed arm child deadline prepared canonical
        member fields.2.2.2.2.1 fields.2.1

theorem arming_selected_completion_successors_equal (program : Program) (before after afterArm : RuntimeState)
    (arm : PreparedInternalArming) (hosting : SemanticId) (definition : DefinitionScopeId)
    (output : Option ControlPlaceId) (root : RuntimeScopeOccurrence) (withdrawal : InternalCompletionWithdrawal)
    (prepared : arm.Prepared program before)
    (canonical : canonicalCollectionOrder before = true)
    (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (withdrawn : selectSubscribedCompletionWithdrawal? program before definition output = some withdrawal)
    (quiet : scopeQuiescent (arm.apply before) root.id = scopeQuiescent before root.id)
    (continuation : ∀ owner place, root.parent = some owner → output = some place →
      addToken (removeToken before.tokens arm.scopeFramePatch.input arm.scopeFramePatch.owner) place owner =
        removeToken (addToken before.tokens place owner) arm.scopeFramePatch.input arm.scopeFramePatch.owner)
    (result : completeSelectedScope? program before definition output = some after)
    (armResult : completeSelectedScope? program (arm.apply before) definition output = some afterArm) :
    afterArm = arm.apply after := by
  obtain ⟨completed, ordinary, _⟩ := completeSelectedScope_position_fields program before after definition output result
  have ordinaryFrame := arming_ordinary_completion_commutes before arm hosting definition output root
    running census quiet continuation
  rw [ordinary, Option.map_some] at ordinaryFrame
  have withdrawalFrame := preparedArming_subscribed_completion_withdrawal program before arm prepared definition output withdrawal withdrawn
  obtain ⟨actual, actualResult, update⟩ := subscribedWithdrawal_refines program before completed
    definition output withdrawal withdrawn ordinary
  have same : actual = after := Option.some.inj (actualResult.symm.trans result)
  subst actual
  obtain ⟨armedActual, armedResult, armedUpdate⟩ := subscribedWithdrawal_refines program
    (arm.apply before) (arm.apply completed) definition output withdrawal withdrawalFrame ordinaryFrame
  have armedSame : armedActual = afterArm := Option.some.inj (armedResult.symm.trans armResult)
  subst armedActual
  cases withdrawal with
  | monitored record deadline =>
      obtain ⟨pair, _, _, _, _, recordEq, timerEq⟩ :=
        subscribedWithdrawal_monitored_facts program before definition output record deadline withdrawn
      have body : record.body = .childScope pair.val.child.id := by
        simpa only [recordEq] using pair.property.2.1.2.2.2.2.2.2.1
      have member (timer : TimerWait) (present : deadline = some timer) : timer ∈ before.timerWaits := by
        have binding := pair.property.2.2
        simp only [MonitoredScopeTimerBinding, timerEq, present] at binding
        exact (List.mem_filter.mp (show timer ∈ before.timerWaits.filter (monitoredScopeTimerNames pair.val) by
          rw [binding.2.1]; simp)).1
      have fields := completeScopeState_reference_fields before completed definition output root census ordinary
      simp only at update armedUpdate
      rw [update, armedUpdate]
      exact arming_monitored_withdrawal_commutes program before completed arm record pair.val.child.id deadline
        prepared canonical body member fields.2.2.2.2.1 fields.2.1
  | unbounded => simp only at update armedUpdate; rw [update, armedUpdate]
  | bounded record deadline =>
      have withdrawn := subscribedWithdrawal_bounded_selection program before definition output record deadline withdrawn
      obtain ⟨declaration, child, parent, _, _, _, body⟩ :=
        completionWithdrawal_raw_selection program before definition record deadline withdrawn
      obtain ⟨_, _, _, attached, _, _, _, _, _, _, _, deadlineCensus, _⟩ :=
        completionWithdrawal_bounded_facts program before definition record deadline withdrawn
      have member : deadline ∈ before.timerWaits := by
        have present : deadline ∈ before.timerWaits.filter (timerIdNamesWait attached) := by rw [deadlineCensus]; simp
        exact (List.mem_filter.mp present).1
      have fields := completeScopeState_reference_fields before completed definition output root census ordinary
      simp only at update armedUpdate
      rw [update, armedUpdate, body]
      exact arming_bounded_withdrawal_commutes program before completed arm child deadline prepared canonical
        member fields.2.2.2.2.1 fields.2.1

end BpmnSemantics.SemanticProcess.InternalCommutation
