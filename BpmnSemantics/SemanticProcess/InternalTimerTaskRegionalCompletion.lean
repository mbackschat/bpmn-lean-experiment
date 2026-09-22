import BpmnSemantics.SemanticProcess.InternalTimerTaskRegionalPublication
import BpmnSemantics.SemanticProcess.InternalArmingRegionalCompletion

/-! Return and completion preserve the jointly inserted task, Timer, and Activity record.
Canonical filter and erase laws retain exact list order, not only collection membership. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem timerTask_addToken_commutes (state : RuntimeState) (patch : InternalTimerTaskPatch)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (ordered : orderedBy controlTokenBefore state.tokens = true)
    (different : ({ placeId := output, owner } : ControlToken) ≠
      { placeId := patch.arm.input, owner := patch.arm.owner }) :
    { applyInternalTimerTaskPatch state patch with
        tokens := addToken (applyInternalTimerTaskPatch state patch).tokens output owner } =
      applyInternalTimerTaskPatch { state with tokens := addToken state.tokens output owner } patch := by
  have tokens := congrArg RuntimeState.tokens
    (arming_addToken_commutes state (.ordinary patch.arm.operation patch.arm) owner output ordered different)
  cases write : patch.arm.write <;>
    simp only [PreparedInternalArming.apply, applyInternalTimerTaskPatch, applyInternalArmingPatch, write]
      at tokens ⊢ <;> rw [tokens]

theorem timerTask_return_removal_commutes (program : Program) (state : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch) (record : CalledProcessOccurrence)
    (prepared : prepareInternalTimerTaskContract? program state contract = some patch)
    (canonical : canonicalCollectionOrder state = true)
    (outside : (processInstanceClosureWithin state.calledProcessOccurrences
      [record.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)).contains
        patch.arm.owner.processInstanceId = false) :
    removeCalledProcessTree (applyInternalTimerTaskPatch state patch) record =
      applyInternalTimerTaskPatch (removeCalledProcessTree state record) patch := by
  obtain ⟨_, owner, instanceId, origin, processId, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalTimerTaskContract_facts program state contract patch prepared
  let patch := makeInternalTimerTaskPatch program state contract owner instanceId processId origin
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [record.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  have tokenFrame : (removeToken state.tokens contract.input owner).filter
        (fun token => !removed.contains token.owner.processInstanceId) =
      removeToken (state.tokens.filter (fun token => !removed.contains token.owner.processInstanceId))
        contract.input owner := by
    rw [removeToken_eq_erase, ← List.erase_filter, removeToken_eq_erase]
  have kept : (!removed.contains owner.processInstanceId) = true := by
    simpa only [makeInternalTimerTaskPatch, Bool.not_eq_true'] using outside
  have taskOrder : orderedBy userTaskWaitBefore state.waits = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have timerOrder : orderedBy timerWaitBefore state.timerWaits = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have activityOrder : orderedBy activityOccurrenceBefore state.activityOccurrences = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have taskFilter := filter_canonicalInsertBy_retained userTaskWaitBefore userTaskWaitBefore_compose
    (fun wait => !removed.contains wait.owner.processInstanceId)
    { processInstanceId := owner.processInstanceId, owner,
      task := { id := contract.task.id, name := contract.task.name },
      activation := activationCount state contract.task.id + 1, output := contract.task.output }
    state.waits taskOrder kept
  have timerFilter := filter_canonicalInsertBy_retained timerWaitBefore regional_timerWaitBefore_compose
    (fun wait => !removed.contains wait.owner.processInstanceId) patch.timer state.timerWaits timerOrder kept
  have activityFilter := filter_canonicalInsertBy_retained activityOccurrenceBefore regional_activityOccurrenceBefore_compose
    (fun activity => !removed.contains activity.owner.processInstanceId)
    patch.record state.activityOccurrences activityOrder kept
  dsimp only [patch, makeInternalTimerTaskPatch] at timerFilter activityFilter
  simp only [applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch,
    removeCalledProcessTree, insertUserTaskWait_eq_canonicalInsertBy, insertTimerWait,
    insertActivityOccurrence_eq_canonicalInsertBy]
  rw [taskFilter, tokenFrame, timerFilter, activityFilter]

theorem timerTask_ordinary_completion_commutes (before : RuntimeState) (patch : InternalTimerTaskPatch)
    (hosting : SemanticId) (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (root : RuntimeScopeOccurrence) (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (quiet : scopeQuiescent (applyInternalTimerTaskPatch before patch) root.id = scopeQuiescent before root.id)
    (continuation : ∀ owner place, root.parent = some owner → output = some place →
      addToken (removeToken before.tokens patch.arm.input patch.arm.owner) place owner =
        removeToken (addToken before.tokens place owner) patch.arm.input patch.arm.owner) :
    completeScopeState? (applyInternalTimerTaskPatch before patch) definition output =
      (completeScopeState? before definition output).map (applyInternalTimerTaskPatch · patch) := by
  cases write : patch.arm.write
  all_goals
    simp only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write] at quiet continuation ⊢
    simp only [completeScopeState?, census, quiet]
    split
    · rfl
    · simp only [completeQuiescentScope?, running]
      cases parent : root.parent <;> cases produced : output <;> simp only [Option.map_none]
      all_goals first | rfl | (split <;> first | rfl | (simp only [Option.map_some]; rw [continuation _ _ parent produced]))

theorem timerTask_bounded_withdrawal_commutes (program : Program) (before completed : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (child : ScopeOccurrenceId) (deadline : TimerWait)
    (prepared : prepareInternalTimerTaskContract? program before contract = some patch)
    (canonical : canonicalCollectionOrder before = true)
    (member : deadline ∈ before.timerWaits)
    (timers : completed.timerWaits = before.timerWaits)
    (activities : completed.activityOccurrences = before.activityOccurrences) :
    { applyInternalTimerTaskPatch completed patch with
      timerWaits := (applyInternalTimerTaskPatch completed patch).timerWaits.erase deadline
      activityOccurrences := (applyInternalTimerTaskPatch completed patch).activityOccurrences.filter
        (fun record => !decide (record.body = .childScope child)) } =
    applyInternalTimerTaskPatch { completed with
      timerWaits := completed.timerWaits.erase deadline
      activityOccurrences := completed.activityOccurrences.filter
        (fun record => !decide (record.body = .childScope child)) } patch := by
  have fresh := (prepared_timer_task_timer_keys_fresh program before contract patch prepared deadline member).1
  have different : patch.timer ≠ deadline := by
    intro same
    simp [same, timerWaitKeyMatches] at fresh
  have timerOrder : orderedBy timerWaitBefore before.timerWaits = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have activityOrder : orderedBy activityOccurrenceBefore before.activityOccurrences = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have retained : (!decide (patch.record.body = .childScope child)) = true := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalTimerTaskContract_facts program before contract patch prepared
    rfl
  have recordFilter := filter_canonicalInsertBy_retained activityOccurrenceBefore
    regional_activityOccurrenceBefore_compose (fun record => !decide (record.body = .childScope child))
    patch.record completed.activityOccurrences (activities ▸ activityOrder) retained
  cases write : patch.arm.write <;>
    simp only [applyInternalTimerTaskPatch, applyInternalArmingPatch, write, insertTimerWait,
      insertActivityOccurrence_eq_canonicalInsertBy] <;>
    rw [canonicalInsertBy_erase timerWaitBefore regional_timerWaitBefore_compose _ _ different
      completed.timerWaits (timers ▸ timerOrder), recordFilter]

theorem timerTask_completion_successors_equal (program : Program) (before after afterTask : RuntimeState)
    (contract : InternalTimerTaskContract) (patch : InternalTimerTaskPatch)
    (hosting : SemanticId) (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (root : RuntimeScopeOccurrence) (withdrawal : InternalCompletionWithdrawal)
    (prepared : prepareInternalTimerTaskContract? program before contract = some patch)
    (canonical : canonicalCollectionOrder before = true)
    (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (withdrawn : selectInternalCompletionWithdrawal? program before definition = some withdrawal)
    (quiet : scopeQuiescent (applyInternalTimerTaskPatch before patch) root.id = scopeQuiescent before root.id)
    (continuation : ∀ owner place, root.parent = some owner → output = some place →
      addToken (removeToken before.tokens patch.arm.input patch.arm.owner) place owner =
        removeToken (addToken before.tokens place owner) patch.arm.input patch.arm.owner)
    (result : completeBoundedScope? program before definition output = some after)
    (taskResult : completeBoundedScope? program (applyInternalTimerTaskPatch before patch)
      definition output = some afterTask) :
    afterTask = applyInternalTimerTaskPatch after patch := by
  obtain ⟨completed, ordinary, _⟩ := completeBoundedScope_position_fields program before after definition output result
  have ordinaryFrame := timerTask_ordinary_completion_commutes before patch hosting definition output root
    running census quiet continuation
  rw [ordinary, Option.map_some] at ordinaryFrame
  have withdrawalFrame := timerTask_completion_withdrawal program before contract patch prepared definition withdrawal withdrawn
  obtain ⟨actual, actualResult, update⟩ := completionWithdrawal_refines program before completed
    definition output withdrawal withdrawn ordinary
  have same : actual = after := Option.some.inj (actualResult.symm.trans result)
  subst actual
  obtain ⟨taskActual, taskResultFound, taskUpdate⟩ := completionWithdrawal_refines program
    (applyInternalTimerTaskPatch before patch) (applyInternalTimerTaskPatch completed patch)
    definition output withdrawal withdrawalFrame ordinaryFrame
  have taskSame : taskActual = afterTask := Option.some.inj (taskResultFound.symm.trans taskResult)
  subst taskActual
  cases withdrawal with
  | unbounded => simp only at update taskUpdate; rw [update, taskUpdate]
  | bounded record deadline =>
      obtain ⟨declaration, child, parent, _, _, _, body⟩ :=
        completionWithdrawal_raw_selection program before definition record deadline withdrawn
      obtain ⟨_, _, _, attached, _, _, _, _, _, _, _, deadlineCensus, _⟩ :=
        completionWithdrawal_bounded_facts program before definition record deadline withdrawn
      have member : deadline ∈ before.timerWaits := by
        have present : deadline ∈ before.timerWaits.filter (timerIdNamesWait attached) := by rw [deadlineCensus]; simp
        exact (List.mem_filter.mp present).1
      have fields := completeScopeState_reference_fields before completed definition output root census ordinary
      simp only at update taskUpdate
      rw [update, taskUpdate, body]
      exact timerTask_bounded_withdrawal_commutes program before completed contract patch child deadline
        prepared canonical member fields.2.2.2.2.1 fields.2.1

end BpmnSemantics.SemanticProcess.InternalCommutation
