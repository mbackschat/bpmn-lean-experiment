import BpmnSemantics.SemanticProcess.InternalMessageTaskRegionalPublication
import BpmnSemantics.SemanticProcess.InternalArmingRegionalCompletion

/-! Completion preserves the jointly inserted Task, Message and Activity record.
Canonical filter and erase laws retain exact list order, not only collection membership. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem messageTask_addToken_commutes (state : RuntimeState) (patch : InternalMessageTaskPatch)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (ordered : orderedBy controlTokenBefore state.tokens = true)
    (different : ({ placeId := output, owner } : ControlToken) ≠
      { placeId := patch.arm.input, owner := patch.arm.owner }) :
    { applyInternalMessageTaskPatch state patch with
        tokens := addToken (applyInternalMessageTaskPatch state patch).tokens output owner } =
      applyInternalMessageTaskPatch { state with tokens := addToken state.tokens output owner } patch := by
  have tokens := congrArg RuntimeState.tokens
    (arming_addToken_commutes state (.ordinary patch.arm.operation patch.arm) owner output ordered different)
  cases write : patch.arm.write <;>
    simp only [PreparedInternalArming.apply, applyInternalMessageTaskPatch, applyInternalArmingPatch, write]
      at tokens ⊢ <;> rw [tokens]

theorem messageTask_ordinary_completion_commutes (before : RuntimeState) (patch : InternalMessageTaskPatch)
    (hosting : SemanticId) (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (root : RuntimeScopeOccurrence) (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (quiet : scopeQuiescent (applyInternalMessageTaskPatch before patch) root.id = scopeQuiescent before root.id)
    (continuation : ∀ owner place, root.parent = some owner → output = some place →
      addToken (removeToken before.tokens patch.arm.input patch.arm.owner) place owner =
        removeToken (addToken before.tokens place owner) patch.arm.input patch.arm.owner) :
    completeScopeState? (applyInternalMessageTaskPatch before patch) definition output =
      (completeScopeState? before definition output).map (applyInternalMessageTaskPatch · patch) := by
  cases write : patch.arm.write
  all_goals
    simp only [applyInternalMessageTaskPatch, applyInternalArmingPatch, write] at quiet continuation ⊢
    simp only [completeScopeState?, census, quiet]
    split
    · rfl
    · simp only [completeQuiescentScope?, running]
      cases parent : root.parent <;> cases produced : output <;> simp only [Option.map_none]
      all_goals first | rfl | (split <;> first | rfl | (simp only [Option.map_some]; rw [continuation _ _ parent produced]))

theorem messageTask_bounded_withdrawal_commutes (program : Program) (before completed : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (child : ScopeOccurrenceId) (deadline : TimerWait)
    (prepared : prepareInternalMessageTaskContract? program before contract = some patch)
    (canonical : canonicalCollectionOrder before = true)
    (activities : completed.activityOccurrences = before.activityOccurrences) :
    { applyInternalMessageTaskPatch completed patch with
      timerWaits := (applyInternalMessageTaskPatch completed patch).timerWaits.erase deadline
      activityOccurrences := (applyInternalMessageTaskPatch completed patch).activityOccurrences.filter
        (fun record => !decide (record.body = .childScope child)) } =
    applyInternalMessageTaskPatch { completed with
      timerWaits := completed.timerWaits.erase deadline
      activityOccurrences := completed.activityOccurrences.filter
        (fun record => !decide (record.body = .childScope child)) } patch := by
  have activityOrder : orderedBy activityOccurrenceBefore before.activityOccurrences = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have retained : (!decide (patch.record.body = .childScope child)) = true := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalMessageTaskContract_facts program before contract patch prepared
    rfl
  have recordFilter := filter_canonicalInsertBy_retained activityOccurrenceBefore
    regional_activityOccurrenceBefore_compose (fun record => !decide (record.body = .childScope child))
    patch.record completed.activityOccurrences (activities ▸ activityOrder) retained
  obtain ⟨wait, write⟩ : ∃ wait, patch.arm.write = .userTask wait := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalMessageTaskContract_facts program before contract patch prepared
    exact ⟨_, rfl⟩
  simp only [applyInternalMessageTaskPatch, applyInternalArmingPatch, write,
    insertActivityOccurrence_eq_canonicalInsertBy]
  rw [recordFilter]

private theorem messageTask_monitored_withdrawal_commutes (program : Program) (before completed : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (record : ActivityOccurrence) (child : ScopeOccurrenceId) (deadline : Option TimerWait)
    (prepared : prepareInternalMessageTaskContract? program before contract = some patch)
    (canonical : canonicalCollectionOrder before = true)
    (body : record.body = .childScope child)
    (activities : completed.activityOccurrences = before.activityOccurrences) :
    { applyInternalMessageTaskPatch completed patch with
      timerWaits := removeMonitoredScopeTimer (applyInternalMessageTaskPatch completed patch).timerWaits deadline
      activityOccurrences := (applyInternalMessageTaskPatch completed patch).activityOccurrences.erase record } =
    applyInternalMessageTaskPatch { completed with
      timerWaits := removeMonitoredScopeTimer completed.timerWaits deadline
      activityOccurrences := completed.activityOccurrences.erase record } patch := by
  have activityOrder : orderedBy activityOccurrenceBefore before.activityOccurrences = true := by
    simp_all only [canonicalCollectionOrder, Bool.and_eq_true]
  have different : patch.record ≠ record := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalMessageTaskContract_facts program before contract patch prepared
    intro same
    have bodies := congrArg ActivityOccurrence.body same
    rw [body] at bodies
    contradiction
  have recordErase := canonicalInsertBy_erase activityOccurrenceBefore regional_activityOccurrenceBefore_compose
    _ _ different completed.activityOccurrences (activities ▸ activityOrder)
  obtain ⟨wait, write⟩ : ∃ wait, patch.arm.write = .userTask wait := by
    obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
      prepareInternalMessageTaskContract_facts program before contract patch prepared
    exact ⟨_, rfl⟩
  simp only [applyInternalMessageTaskPatch, applyInternalArmingPatch, write,
    insertActivityOccurrence_eq_canonicalInsertBy]
  rw [recordErase]

theorem messageTask_selected_completion_successors_equal (program : Program) (before after afterTask : RuntimeState)
    (contract : InternalMessageTaskContract) (patch : InternalMessageTaskPatch)
    (hosting : SemanticId) (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (root : RuntimeScopeOccurrence) (withdrawal : InternalCompletionWithdrawal)
    (prepared : prepareInternalMessageTaskContract? program before contract = some patch)
    (canonical : canonicalCollectionOrder before = true)
    (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (withdrawn : selectSubscribedCompletionWithdrawal? program before definition output = some withdrawal)
    (quiet : scopeQuiescent (applyInternalMessageTaskPatch before patch) root.id = scopeQuiescent before root.id)
    (continuation : ∀ owner place, root.parent = some owner → output = some place →
      addToken (removeToken before.tokens patch.arm.input patch.arm.owner) place owner =
        removeToken (addToken before.tokens place owner) patch.arm.input patch.arm.owner)
    (result : completeSelectedScope? program before definition output = some after)
    (taskResult : completeSelectedScope? program (applyInternalMessageTaskPatch before patch)
      definition output = some afterTask) :
    afterTask = applyInternalMessageTaskPatch after patch := by
  obtain ⟨completed, ordinary, _⟩ := completeSelectedScope_position_fields program before after definition output result
  have ordinaryFrame := messageTask_ordinary_completion_commutes before patch hosting definition output root
    running census quiet continuation
  rw [ordinary, Option.map_some] at ordinaryFrame
  have withdrawalFrame := messageTask_subscribed_completion_withdrawal program before contract patch prepared definition output withdrawal withdrawn
  obtain ⟨actual, actualResult, update⟩ := subscribedWithdrawal_refines program before completed
    definition output withdrawal withdrawn ordinary
  have same : actual = after := Option.some.inj (actualResult.symm.trans result)
  subst actual
  obtain ⟨taskActual, taskResultFound, taskUpdate⟩ := subscribedWithdrawal_refines program
    (applyInternalMessageTaskPatch before patch) (applyInternalMessageTaskPatch completed patch)
    definition output withdrawal withdrawalFrame ordinaryFrame
  have taskSame : taskActual = afterTask := Option.some.inj (taskResultFound.symm.trans taskResult)
  subst taskActual
  cases withdrawal with
  | monitored record deadline =>
      obtain ⟨pair, _, _, _, _, recordEq, timerEq⟩ :=
        subscribedWithdrawal_monitored_facts program before definition output record deadline withdrawn
      have body : record.body = .childScope pair.val.child.id := by
        simpa only [recordEq] using pair.property.2.1.2.2.2.2.2.2.1
      have fields := completeScopeState_reference_fields before completed definition output root census ordinary
      simp only at update taskUpdate
      rw [update, taskUpdate]
      exact messageTask_monitored_withdrawal_commutes program before completed contract patch record pair.val.child.id deadline
        prepared canonical body fields.2.1
  | unbounded => simp only at update taskUpdate; rw [update, taskUpdate]
  | bounded record deadline =>
      have withdrawn := subscribedWithdrawal_bounded_selection program before definition output record deadline withdrawn
      obtain ⟨declaration, child, parent, _, _, _, body⟩ :=
        completionWithdrawal_raw_selection program before definition record deadline withdrawn
      have fields := completeScopeState_reference_fields before completed definition output root census ordinary
      simp only at update taskUpdate
      rw [update, taskUpdate, body]
      exact messageTask_bounded_withdrawal_commutes program before completed contract patch child deadline
        prepared canonical fields.2.1

end BpmnSemantics.SemanticProcess.InternalCommutation
