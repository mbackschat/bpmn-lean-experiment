import BpmnSemantics.SemanticProcess.ParallelMultiInstanceProgramBindingTerminal

/-! # Parallel Multi-Instance terminal runtime-state preservation

Final completion, early completion, and deadline interruption all withdraw the same admitted
Parallel Multi-Instance region. This module proves that exact terminal rewrite preserves the
complete production runtime-state invariant. Route-shaped completion and Timer theorems belong to
the downstream closing-route owner.

Scope boundary: terminal closure only. Progress, evaluator lifting, command traces, host behavior,
and any change to the semantic account remain downstream.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def terminalTaskId (wait : UserTaskWait) : UserTaskInstanceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.task.id.value⟩
    activation := wait.activation }

private theorem parallelBodyClaims_eq {record : ActivityOccurrence}
    {tasks : List UserTaskInstanceId}
    (body : activityBodyParallelTasks? record = some tasks) :
    activityBodyTaskClaims record.body = tasks := by
  cases shape : record.body <;>
    simp_all [activityBodyParallelTasks?, activityBodyTaskClaims]

private theorem all_occursOnce_filter (same : α → α → Bool)
    (self : ∀ value, same value value = true) (values : List α) (keep : α → Bool)
    (unique : values.all (occursOnce same values) = true) :
    (values.filter keep).all (occursOnce same (values.filter keep)) = true := by
  simp only [List.all_eq_true] at unique ⊢
  intro value member
  have originalMember : value ∈ values := (List.mem_filter.mp member).1
  have original := unique value originalMember
  simp only [occursOnce, decide_eq_true_eq] at original ⊢
  have sublist : List.Sublist
      ((values.filter keep).filter (same value))
      (values.filter (same value)) := by
    apply List.Sublist.trans (l₂ := (values.filter (same value)).filter keep)
    · simp [List.filter_filter, Bool.and_comm]
    · exact List.filter_sublist
  have positive : 0 < ((values.filter keep).filter (same value)).length := by
    apply List.length_pos_of_mem
    exact List.mem_filter.mpr ⟨member, self value⟩
  have upper := sublist.length_le
  rw [original] at upper
  exact Nat.le_antisymm upper positive

private theorem removeParallelChildWaits_lookup_of_not_mem (waits : List UserTaskWait)
    (targets : List UserTaskInstanceId) (task : UserTaskInstanceId)
    (absent : task ∉ targets) :
    (removeParallelChildWaits waits targets).filter (taskIdNamesWait task) =
      waits.filter (taskIdNamesWait task) := by
  simp only [removeParallelChildWaits, List.filter_filter]
  apply List.filter_congr
  intro wait _
  by_cases names : taskIdNamesWait task wait = true
  · have waitId : terminalTaskId wait = task := by
      simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq] at names
      rcases task with ⟨process, ⟨element⟩, activation⟩
      rcases wait with ⟨waitProcess, owner, waitTask, waitActivation, output, metadata⟩
      simp only [terminalTaskId] at names ⊢
      cases names.1.1
      cases names.1.2
      cases names.2
      rfl
    have notMember : terminalTaskId wait ∉ targets := by
      intro member
      exact absent (waitId ▸ member)
    rw [names]
    simp only [Bool.true_and]
    have rejected : targets.contains
        { processInstanceId := wait.processInstanceId
          elementId := ⟨wait.task.id.value⟩
          activation := wait.activation } = false := by
      apply Bool.eq_false_iff.mpr
      simpa [List.contains_eq_mem, terminalTaskId] using notMember
    rw [rejected]
    rfl
  · simp only [Bool.not_eq_true] at names
    simp [names]

private theorem activityBodyWaitFilter_eq (waits : List UserTaskWait)
    (task : UserTaskInstanceId) :
    waits.filter (taskIdNamesWait task) =
      waits.filter (fun wait =>
        decide (wait.processInstanceId = task.processInstanceId) &&
          decide (wait.task.id.value = task.elementId.value) &&
          decide (wait.activation = task.activation)) := by
  apply List.filter_congr
  intro wait _
  apply Bool.eq_iff_iff.mpr
  simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]
  constructor
  · rintro ⟨⟨process, element⟩, activation⟩
    exact ⟨⟨process.symm, element.symm⟩, activation.symm⟩
  · rintro ⟨⟨process, element⟩, activation⟩
    exact ⟨⟨process.symm, element.symm⟩, activation.symm⟩

private def terminalLexStep [DecidableEq α] (less : α → α → Bool)
    (left right : α) (rest : Bool) : Bool :=
  if left ≠ right then less left right else rest

private theorem terminalLexStep_false_iff [DecidableEq α] (less : α → α → Bool)
    (left right : α) (rest : Bool) :
    terminalLexStep less left right rest = false ↔
      (if left = right then rest = false else less left right = false) := by
  unfold terminalLexStep
  by_cases same : left = right <;> simp [same]

private theorem terminalLexStep_true_iff [DecidableEq α] (less : α → α → Bool)
    (left right : α) (rest : Bool) :
    terminalLexStep less left right rest = true ↔
      (if left = right then rest = true else less left right = true) := by
  unfold terminalLexStep
  by_cases same : left = right <;> simp [same]

private theorem terminalLexStep_compose [DecidableEq α] (less : α → α → Bool)
    (asymm : ∀ left right, less left right = true → less right left = false)
    (total : ∀ left right, left ≠ right → less left right = true ∨ less right left = true)
    (trans : ∀ left middle right,
      less left middle = true → less middle right = true → less left right = true)
    (a b c : α) (ba cb ca : Bool)
    (fall : ba = false → cb = false → ca = false) :
    terminalLexStep less b a ba = false →
      terminalLexStep less c b cb = false →
      terminalLexStep less c a ca = false := by
  rw [terminalLexStep_false_iff, terminalLexStep_false_iff,
    terminalLexStep_false_iff]
  intro first second
  by_cases baEq : b = a
  · subst b
    by_cases caEq : c = a
    · subst c
      simp_all
    · simp only [caEq, if_false] at second ⊢
      exact second
  · simp only [baEq, if_false] at first
    by_cases cbEq : c = b
    · subst c
      simp_all
    · simp only [cbEq, if_false] at second
      by_cases caEq : c = a
      · subst c
        exfalso
        rcases total a b (fun same => baEq same.symm) with forward | backward
        · rw [second] at forward
          contradiction
        · rw [first] at backward
          contradiction
      · simp only [caEq, if_false]
        have ab : less a b = true := by
          rcases total a b (fun same => baEq same.symm) with forward | backward
          · exact forward
          · rw [first] at backward
            contradiction
        have bc : less b c = true := by
          rcases total b c (fun same => cbEq same.symm) with forward | backward
          · exact forward
          · rw [second] at backward
            contradiction
        exact asymm a c (trans a b c ab bc)

private theorem terminalLexStep_asymm [DecidableEq α] (less : α → α → Bool)
    (asymm : ∀ left right, less left right = true → less right left = false)
    (left right : α) (forward backward : Bool)
    (fall : forward = true → backward = false) :
    terminalLexStep less left right forward = true →
      terminalLexStep less right left backward = false := by
  rw [terminalLexStep_true_iff, terminalLexStep_false_iff]
  by_cases same : left = right
  · subst left
    simpa using fall
  · have reverse : right ≠ left := fun equal => same equal.symm
    simp only [same, reverse]
    exact asymm left right

private theorem terminalLexStep_total [DecidableEq α] (less : α → α → Bool)
    (total : ∀ left right, left ≠ right → less left right = true ∨ less right left = true)
    (left right : α) (forward backward : Bool)
    (fall : forward = true ∨ backward = true) :
    terminalLexStep less left right forward = true ∨
      terminalLexStep less right left backward = true := by
  by_cases same : left = right
  · subst left
    simpa [terminalLexStep] using fall
  · simpa [terminalLexStep, same, Ne.symm same] using total left right same

private theorem terminalLexStep_trans [DecidableEq α] (less : α → α → Bool)
    (asymm : ∀ left right, less left right = true → less right left = false)
    (trans : ∀ left middle right,
      less left middle = true → less middle right = true → less left right = true)
    (left middle right : α) (lm mr lr : Bool)
    (fall : lm = true → mr = true → lr = true) :
    terminalLexStep less left middle lm = true →
      terminalLexStep less middle right mr = true →
      terminalLexStep less left right lr = true := by
  rw [terminalLexStep_true_iff, terminalLexStep_true_iff,
    terminalLexStep_true_iff]
  by_cases lmEq : left = middle
  · subst middle
    intro leftMiddle
    have leftMiddle' : lm = true := by simpa using leftMiddle
    by_cases lrEq : left = right
    · subst right
      intro middleRight
      have middleRight' : mr = true := by simpa using middleRight
      have result := fall leftMiddle' middleRight'
      simpa using result
    · simp only [lrEq, if_false]
      intro middleRight
      exact middleRight
  · simp only [lmEq, if_false]
    intro leftMiddle
    by_cases mrEq : middle = right
    · subst right
      simp_all
    · simp only [mrEq, if_false]
      intro middleRight
      by_cases lrEq : left = right
      · subst right
        have reverse := asymm left middle leftMiddle
        rw [reverse] at middleRight
        contradiction
      · simp only [lrEq, if_false]
        exact trans left middle right leftMiddle middleRight

private def terminalStringBefore (left right : String) : Bool := decide (left < right)

private def terminalNatBefore (left right : Nat) : Bool := decide (left < right)

private theorem terminalString_asymm (left right : String) :
    terminalStringBefore left right = true → terminalStringBefore right left = false := by
  simp only [terminalStringBefore, decide_eq_true_eq, decide_eq_false_iff_not]
  exact String.lt_asymm

private theorem terminalString_total (left right : String) (different : left ≠ right) :
    terminalStringBefore left right = true ∨ terminalStringBefore right left = true := by
  simp only [terminalStringBefore, decide_eq_true_eq]
  by_cases before : left < right
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

private theorem terminalString_trans (left middle right : String) :
    terminalStringBefore left middle = true → terminalStringBefore middle right = true →
      terminalStringBefore left right = true := by
  simp only [terminalStringBefore, decide_eq_true_eq]
  exact String.lt_trans

private theorem terminalNat_asymm (left right : Nat) :
    terminalNatBefore left right = true → terminalNatBefore right left = false := by
  simp only [terminalNatBefore, decide_eq_true_eq, decide_eq_false_iff_not]
  exact Nat.lt_asymm

private theorem terminalNat_total (left right : Nat) (different : left ≠ right) :
    terminalNatBefore left right = true ∨ terminalNatBefore right left = true := by
  simp only [terminalNatBefore, decide_eq_true_eq]
  omega

private theorem terminalNat_trans (left middle right : Nat) :
    terminalNatBefore left middle = true → terminalNatBefore middle right = true →
      terminalNatBefore left right = true := by
  simp only [terminalNatBefore, decide_eq_true_eq]
  exact Nat.lt_trans

private theorem scopeOwnerBefore_chain (left right : ScopeOccurrenceId) :
    scopeOwnerBefore left right =
      terminalLexStep terminalStringBefore left.processInstanceId.value
        right.processInstanceId.value
        (terminalLexStep terminalStringBefore left.definitionScopeId.value
          right.definitionScopeId.value
          (terminalNatBefore left.activation right.activation)) := rfl

private theorem terminalScope_asymm (left right : ScopeOccurrenceId) :
    scopeOwnerBefore left right = true → scopeOwnerBefore right left = false := by
  rw [scopeOwnerBefore_chain, scopeOwnerBefore_chain]
  refine terminalLexStep_asymm terminalStringBefore terminalString_asymm _ _ _ _ ?_
  refine terminalLexStep_asymm terminalStringBefore terminalString_asymm _ _ _ _ ?_
  exact terminalNat_asymm _ _

private theorem terminalScope_total (left right : ScopeOccurrenceId) (different : left ≠ right) :
    scopeOwnerBefore left right = true ∨ scopeOwnerBefore right left = true := by
  rw [scopeOwnerBefore_chain, scopeOwnerBefore_chain]
  by_cases processEq : left.processInstanceId.value = right.processInstanceId.value
  · simp [terminalLexStep, processEq]
    by_cases scopeEq : left.definitionScopeId.value = right.definitionScopeId.value
    · simp [scopeEq]
      apply terminalNat_total
      intro activationEq
      apply different
      rcases left with ⟨leftProcess, leftScope, leftActivation⟩
      rcases right with ⟨rightProcess, rightScope, rightActivation⟩
      rcases leftProcess with ⟨leftProcessValue⟩
      rcases rightProcess with ⟨rightProcessValue⟩
      rcases leftScope with ⟨leftScopeValue⟩
      rcases rightScope with ⟨rightScopeValue⟩
      simp only at processEq scopeEq activationEq
      cases processEq
      cases scopeEq
      cases activationEq
      rfl
    · simpa [terminalLexStep, scopeEq, Ne.symm scopeEq] using
        terminalString_total _ _ scopeEq
  · simpa [terminalLexStep, processEq, Ne.symm processEq] using
      terminalString_total _ _ processEq

private theorem terminalScope_trans (left middle right : ScopeOccurrenceId) :
    scopeOwnerBefore left middle = true → scopeOwnerBefore middle right = true →
      scopeOwnerBefore left right = true := by
  rw [scopeOwnerBefore_chain, scopeOwnerBefore_chain, scopeOwnerBefore_chain]
  refine terminalLexStep_trans terminalStringBefore terminalString_asymm terminalString_trans
    _ _ _ _ _ _ ?_
  refine terminalLexStep_trans terminalStringBefore terminalString_asymm terminalString_trans
    _ _ _ _ _ _ ?_
  exact terminalNat_trans _ _ _

private theorem timerWaitBefore_chain (left right : TimerWait) :
    timerWaitBefore left right =
      terminalLexStep terminalStringBefore left.processInstanceId.value
        right.processInstanceId.value
        (terminalLexStep scopeOwnerBefore left.owner right.owner
          (terminalLexStep terminalStringBefore left.elementId.value right.elementId.value
            (terminalNatBefore left.activation right.activation))) := rfl

private theorem terminalTimerWaitBefore_compose (a b c : TimerWait) :
    timerWaitBefore b a = false → timerWaitBefore c b = false →
      timerWaitBefore c a = false := by
  rw [timerWaitBefore_chain, timerWaitBefore_chain, timerWaitBefore_chain]
  refine terminalLexStep_compose terminalStringBefore terminalString_asymm terminalString_total
    terminalString_trans _ _ _ _ _ _ ?_
  refine terminalLexStep_compose scopeOwnerBefore terminalScope_asymm terminalScope_total
    terminalScope_trans _ _ _ _ _ _ ?_
  refine terminalLexStep_compose terminalStringBefore terminalString_asymm terminalString_total
    terminalString_trans _ _ _ _ _ _ ?_
  intro first second
  simp only [terminalNatBefore, decide_eq_false_iff_not] at *
  omega

private theorem activityOccurrenceBefore_chain (left right : ActivityOccurrence) :
    activityOccurrenceBefore left right =
      terminalLexStep terminalStringBefore left.processInstanceId.value
        right.processInstanceId.value
        (terminalLexStep terminalStringBefore left.activityElementId.value
          right.activityElementId.value
          (terminalNatBefore left.activation right.activation)) := rfl

private theorem terminalActivityOccurrenceBefore_compose (a b c : ActivityOccurrence) :
    activityOccurrenceBefore b a = false → activityOccurrenceBefore c b = false →
      activityOccurrenceBefore c a = false := by
  rw [activityOccurrenceBefore_chain, activityOccurrenceBefore_chain,
    activityOccurrenceBefore_chain]
  refine terminalLexStep_compose terminalStringBefore terminalString_asymm terminalString_total
    terminalString_trans _ _ _ _ _ _ ?_
  refine terminalLexStep_compose terminalStringBefore terminalString_asymm terminalString_total
    terminalString_trans _ _ _ _ _ _ ?_
  intro first second
  simp only [terminalNatBefore, decide_eq_false_iff_not] at *
  omega
private theorem parallelProfile_eventRaces_empty (program : Program) (state : RuntimeState)
    (accountProfile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId)
    (capabilities : programProfileCapabilitiesValid program = true)
    (hidden : hiddenRecordDeclarationsValid program state = true) :
    state.eventRaces = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro race raceMember
  simp only [hiddenRecordDeclarationsValid, Bool.and_eq_true] at hidden
  have declaration := List.all_eq_true.mp hidden.2 race raceMember
  obtain ⟨operation, singleton⟩ :=
    List.length_eq_one_iff.mp (of_decide_eq_true declaration)
  have filteredMember : operation ∈ program.operations.filter (fun
      | .awaitEventRace _ origin _ _ _ => decide (origin.elementId.value = race.id.elementId.value)
      | _ => false) := by
    exact singleton.symm ▸ (by simp)
  have operationMember := (List.mem_filter.mp filteredMember).1
  have excluded := parallelMultiInstanceProfile_has_no_event_race_operation program
    accountProfile capabilities operation operationMember
  cases operation <;> simp_all

private theorem selectedRecord_ownerScope (program : Program) (arm : ParallelMultiInstanceArm)
    (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (state : RuntimeState) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence)
    (selection : ParallelClosingSelectionFacts arm state controller record)
    (bindings : parallelMultiInstanceProgramBindingsValid program state = true) :
    record.owner.definitionScopeId = ownerScope := by
  have facts := parallelMultiInstanceProgramBindingsValid_controller_facts program state controller
    bindings selection.controllerMember
  obtain ⟨entry, boundArm, boundRecord, _timer, _timerWait, _childWaits, _pendingTask,
    _pendingWait, recordExact, operationExact, projects, ownerScopeExact, _rest⟩ :=
    facts.witnesses
  have armMember : boundArm ∈
      program.operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
    List.mem_filterMap.mpr ⟨entry, (List.mem_filter.mp (by
      have : entry ∈ [entry] := by simp
      rw [← operationExact] at this
      exact this)).1, projects⟩
  rw [account.uniqueEntry] at armMember
  have armEq : boundArm = arm := by simpa using armMember
  subst boundArm
  have selectedRecordFiltered : record ∈ state.activityOccurrences.filter (fun candidate =>
      parallelControllerNamesIdentity controller candidate.processInstanceId
        ⟨candidate.activityElementId.value⟩ candidate.activation) :=
    List.mem_filter.mpr ⟨selection.recordMember, selection.recordIdentity⟩
  rw [recordExact] at selectedRecordFiltered
  have recordEq : record = boundRecord := by simpa using selectedRecordFiltered
  subst boundRecord
  have entryId : entry.id = arm.id := by
    cases entry <;> simp_all [ParallelMultiInstanceArm.ofOperation?] <;> subst arm <;> rfl
  rw [entryId] at ownerScopeExact
  exact Option.some.inj (ownerScopeExact.symm.trans account.entryOwner)

/-- With its output and Activity-variable frames declared explicitly, terminal region withdrawal
preserves the complete production runtime-state invariant. -/
theorem sharedParallelTerminal_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId instanceId : SemanticId)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope)
    (before : RuntimeState) (controller : ParallelMultiInstanceController)
    (record : ActivityOccurrence) (output : ControlPlaceId) (variables : ScopedVariables)
    (running : before.control = .running instanceId)
    (selection : ParallelClosingSelectionFacts arm before controller record)
    (variableActivitiesFrame : variables.activities = before.variables.activities)
    (outputDeclared : ∃ place, program.controlPlaces.filter (fun candidate =>
      decide (candidate.id = output)) = [place])
    (outputOwner : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = output)) =
        [{ controlPlaceId := output, scopeId := ownerScope }])
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true) :
    runtimeStateWellFormed program expectedInstanceId
      (closeSharedParallelRegion before controller record output variables) = true := by
  let after := closeSharedParallelRegion before controller record output variables
  change runtimeStateWellFormed program expectedInstanceId after = true
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
  obtain ⟨existing, claimsAndRetention, snapshots⟩ := wellFormed
  obtain ⟨claims, retention⟩ := claimsAndRetention
  obtain ⟨h17, _lifecycle⟩ := existing
  obtain ⟨h16, _notExhausted⟩ := h17
  obtain ⟨h15, _controllerIds⟩ := h16
  obtain ⟨h14, parallelBindings⟩ := h15
  obtain ⟨h13, sequentialBindings⟩ := h14
  obtain ⟨h12, _controllers⟩ := h13
  obtain ⟨h11, activityIds⟩ := h12
  obtain ⟨h10, messagesUnambiguous⟩ := h11
  obtain ⟨h9, timersUnambiguous⟩ := h10
  obtain ⟨h8, bodies⟩ := h9
  obtain ⟨h7, order⟩ := h8
  obtain ⟨h6, hidden⟩ := h7
  obtain ⟨h5, declarations⟩ := h6
  obtain ⟨h4, bounds⟩ := h5
  obtain ⟨h3, identities⟩ := h4
  obtain ⟨h2, owners⟩ := h3
  obtain ⟨h1, incidents⟩ := h2
  obtain ⟨position, races⟩ := h1
  have bindingFacts := parallelMultiInstanceProgramBindingsValid_controller_facts program before
    controller parallelBindings selection.controllerMember
  obtain ⟨entry, boundArm, boundRecord, timer, timerWait, _childWaits, _pendingTask,
    _pendingWait, recordExact, operationExact, projects, _ownerScopeExact, _familyWellFormed,
    body, _childWaitsExact, _childWaitLength, _childWaitIdsUnique, _childWaitBindings,
    attachedTimer, matchingTimerWait, _timerOwner, _timerElement, _timerOutput, _rest⟩ :=
    bindingFacts.witnesses
  have entryMember : entry ∈ program.operations := by
    have filtered : entry ∈ program.operations.filter (fun operation =>
        match ParallelMultiInstanceArm.ofOperation? operation with
        | some candidate => candidate.taskId.value == controller.id.activityElementId.value
        | none => false) := operationExact.symm ▸ (by simp)
    exact (List.mem_filter.mp filtered).1
  have armMember : boundArm ∈ program.operations.filterMap ParallelMultiInstanceArm.ofOperation? :=
    List.mem_filterMap.mpr ⟨entry, entryMember, projects⟩
  rw [account.uniqueEntry] at armMember
  have armEq : boundArm = arm := by simpa using armMember
  subst boundArm
  have selectedRecordFiltered : record ∈ before.activityOccurrences.filter (fun candidate =>
      parallelControllerNamesIdentity controller candidate.processInstanceId
        ⟨candidate.activityElementId.value⟩ candidate.activation) :=
    List.mem_filter.mpr ⟨selection.recordMember, selection.recordIdentity⟩
  rw [recordExact] at selectedRecordFiltered
  have recordEq : record = boundRecord := by simpa using selectedRecordFiltered
  subst boundRecord
  have timerWaitMember : timerWait ∈ before.timerWaits := by
    have : timerWait ∈ before.timerWaits.filter (timerIdNamesWait timer) := by
      rw [matchingTimerWait]
      simp
    exact (List.mem_filter.mp this).1
  have timerNamesWait : timerIdNamesWait timer timerWait = true := by
    have : timerWait ∈ before.timerWaits.filter (timerIdNamesWait timer) := by
      rw [matchingTimerWait]
      simp
    exact (List.mem_filter.mp this).2
  have oldClaims : activityBodyTaskClaims record.body =
      pendingParallelTaskIds controller.slots := parallelBodyClaims_eq body
  have ownerLive : exactLiveOccurrence before record.owner = true := by
    simp only [waitOwnersLive, Bool.and_eq_true] at owners
    exact List.all_eq_true.mp owners.2 record selection.recordMember
  have ownerScopeEq := selectedRecord_ownerScope program arm ownerScope account before controller
    record selection parallelBindings
  have positionAdded := runtimePositionValid_addToken program expectedInstanceId before output
    record.owner position ownerLive outputDeclared (by simpa [ownerScopeEq] using outputOwner)
  have positionAfter : runtimePositionValid program expectedInstanceId after = true := by
    exact positionAdded
  have noRaces := parallelProfile_eventRaces_empty program before account.profile
    account.capabilities hidden
  have racesAfter : eventRaceAssociationsValid after = true := by
    simp [eventRaceAssociationsValid, after, closeSharedParallelRegion, attachedTimer, noRaces]
  have incidentsAfter : effectIncidentAssociationsValid after = true := by
    simpa [after, closeSharedParallelRegion, attachedTimer,
      effectIncidentAssociationsValid, effectIncidentAssociationValid,
      effectWaitOwnerAssociationValid, variableActivitiesFrame] using incidents
  have ownersAfter : waitOwnersLive after = true := by
    have liveFrame (id : ScopeOccurrenceId) :
        exactLiveOccurrence after id = exactLiveOccurrence before id := by
      simp [after, closeSharedParallelRegion, exactLiveOccurrence]
    simp only [waitOwnersLive, Bool.and_eq_true] at owners ⊢
    obtain ⟨⟨⟨⟨⟨⟨⟨⟨taskOwners, messageOwners⟩, timerOwners⟩, effectOwners⟩,
      incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩,
      activityOwners⟩ := owners
    refine ⟨⟨⟨⟨⟨⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩
    · change (removeParallelChildWaits before.waits
        (pendingParallelTaskIds controller.slots)).all
          (fun wait => exactLiveOccurrence before wait.owner) = true
      exact all_filter _ _ _ taskOwners
    · change before.messageWaits.all
        (fun wait => exactLiveOccurrence after wait.owner) = true
      simpa only [liveFrame] using messageOwners
    · simp only [after, closeSharedParallelRegion, attachedTimer]
      change (removeParallelTimer before.timerWaits timer).all
        (fun wait => exactLiveOccurrence before wait.owner) = true
      exact all_filter _ _ _ timerOwners
    · change before.effectWaits.all
        (fun wait => exactLiveOccurrence after wait.owner) = true
      simpa only [liveFrame] using effectOwners
    · change before.effectIncidents.all
        (fun incident => exactLiveOccurrence after incident.wait.owner) = true
      simpa only [liveFrame] using incidentOwners
    · change before.selectedBranchSets.all
        (fun selected => exactLiveOccurrence after selected.owner) = true
      simpa only [liveFrame] using selectionOwners
    · simp [after, closeSharedParallelRegion, noRaces]
    · change before.calledProcessOccurrences.all
        (fun called => exactLiveOccurrence after called.caller) = true
      simpa only [liveFrame] using callOwners
    · change (removeParallelRecord before.activityOccurrences record).all
        (fun candidate => exactLiveOccurrence before candidate.owner) = true
      exact all_filter _ _ _ activityOwners
  have identitiesAfter : waitIdentitiesUnique after = true := by
    simp only [waitIdentitiesUnique, Bool.and_eq_true] at identities ⊢
    obtain ⟨⟨⟨taskIdentities, messageIdentities⟩, timerIdentities⟩,
      effectIdentities⟩ := identities
    refine ⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩
    · change (removeParallelChildWaits before.waits
        (pendingParallelTaskIds controller.slots)).all
          (occursOnce userTaskWaitKeyMatches
            (removeParallelChildWaits before.waits
              (pendingParallelTaskIds controller.slots))) = true
      unfold removeParallelChildWaits
      exact all_occursOnce_filter userTaskWaitKeyMatches
        (fun wait => by simp [userTaskWaitKeyMatches]) before.waits _ taskIdentities
    · simpa [after, closeSharedParallelRegion] using messageIdentities
    · simp only [after, closeSharedParallelRegion, attachedTimer]
      change (removeParallelTimer before.timerWaits timer).all
        (occursOnce timerWaitKeyMatches (removeParallelTimer before.timerWaits timer)) = true
      unfold removeParallelTimer
      exact all_occursOnce_filter timerWaitKeyMatches
        (fun wait => by simp [timerWaitKeyMatches]) before.timerWaits _ timerIdentities
    · simpa [after, closeSharedParallelRegion] using effectIdentities
  have boundsAfter : runtimeStateIdentityBound after = true := by
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds ⊢
    obtain ⟨⟨taskBounds, timerBounds⟩, activityBounds⟩ := bounds
    refine ⟨⟨?_, ?_⟩, ?_⟩
    · change (removeParallelChildWaits before.waits
        (pendingParallelTaskIds controller.slots)).all
          (fun wait => decide (wait.activation ≤ activationCount before wait.task.id)) = true
      exact all_filter _ _ _ taskBounds
    · simp only [after, closeSharedParallelRegion, attachedTimer]
      change (removeParallelTimer before.timerWaits timer).all (fun wait =>
        decide (wait.activation ≤ timerActivationCount before wait.elementId)) = true
      exact all_filter _ _ _ timerBounds
    · change (removeParallelRecord before.activityOccurrences record).all (fun candidate =>
        decide (candidate.activation ≤ activityActivationCount before
          { value := candidate.activityElementId.value })) = true
      exact all_filter _ _ _ activityBounds
  have declarationsAfter : waitDeclarationsValid program expectedInstanceId after = true := by
    simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations ⊢
    obtain ⟨⟨⟨⟨taskDeclarations, messageDeclarations⟩, timerDeclarations⟩,
      effectDeclarations⟩, incidentDeclarations⟩ := declarations
    refine ⟨⟨⟨⟨?_, by simpa [after, closeSharedParallelRegion] using messageDeclarations⟩,
      ?_⟩, by simpa [after, closeSharedParallelRegion] using effectDeclarations⟩,
      by simpa [after, closeSharedParallelRegion] using incidentDeclarations⟩
    · simp only [List.all_eq_true] at taskDeclarations ⊢
      intro wait member
      obtain ⟨afterMember, expected⟩ := List.mem_filter.mp member
      have beforeMember : wait ∈ before.waits := by
        have retained : wait ∈ removeParallelChildWaits before.waits
            (pendingParallelTaskIds controller.slots) := by
          simpa [after, closeSharedParallelRegion] using afterMember
        exact (List.mem_filter.mp retained).1
      exact taskDeclarations wait (List.mem_filter.mpr ⟨beforeMember, expected⟩)
    · simp only [List.all_eq_true] at timerDeclarations ⊢
      intro wait member
      obtain ⟨afterMember, expected⟩ := List.mem_filter.mp member
      have beforeMember : wait ∈ before.timerWaits := by
        have retained : wait ∈ removeParallelTimer before.timerWaits timer := by
          simpa [after, closeSharedParallelRegion, attachedTimer] using afterMember
        exact (List.mem_filter.mp retained).1
      exact timerDeclarations wait (List.mem_filter.mpr ⟨beforeMember, expected⟩)
  have hiddenAfter : hiddenRecordDeclarationsValid program after = true := by
    simp only [hiddenRecordDeclarationsValid, Bool.and_eq_true] at hidden ⊢
    refine ⟨by simpa [after, closeSharedParallelRegion] using hidden.1, ?_⟩
    simp [after, closeSharedParallelRegion, noRaces]
  simp only [canonicalCollectionOrder, Bool.and_eq_true] at order
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨taskOrder, activationOrder⟩, messageWaitOrder⟩,
    timerWaitOrder⟩, effectWaitOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
    effectActivationOrder⟩, activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
    callOrder⟩, activityOrder⟩, sequentialControllerOrder⟩, _parallelControllerOrder⟩ := order
  have orderAfter : canonicalCollectionOrder after = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true]
    refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨?_, activationOrder⟩, messageWaitOrder⟩,
      ?_⟩, effectWaitOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
      effectActivationOrder⟩, by simpa [after, closeSharedParallelRegion,
        variableActivitiesFrame] using activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
      callOrder⟩, ?_⟩, sequentialControllerOrder⟩, ?_⟩
    · change orderedBy userTaskWaitBefore (removeParallelChildWaits before.waits
        (pendingParallelTaskIds controller.slots)) = true
      exact orderedBy_filter userTaskWaitBefore_compose _ before.waits taskOrder
    · simp only [after, closeSharedParallelRegion, attachedTimer]
      change orderedBy timerWaitBefore (removeParallelTimer before.timerWaits timer) = true
      exact orderedBy_filter terminalTimerWaitBefore_compose _ before.timerWaits timerWaitOrder
    · change orderedBy activityOccurrenceBefore
        (removeParallelRecord before.activityOccurrences record) = true
      exact orderedBy_filter terminalActivityOccurrenceBefore_compose _
        before.activityOccurrences activityOrder
    · simp [after, closeSharedParallelRegion, selection.controllersSingleton,
        removeParallelController, parallelMultiInstanceControllersOrdered]
  have bodiesAfter : activityRecordsOwnLiveWork after = true := by
    simp only [activityRecordsOwnLiveWork, List.all_eq_true]
    intro candidate candidateAfter
    have retained : candidate ∈ removeParallelRecord before.activityOccurrences record := by
      simpa [after, closeSharedParallelRegion] using candidateAfter
    have candidateMember : candidate ∈ before.activityOccurrences :=
      (List.mem_filter.mp retained).1
    have notSelected : sameActivityOccurrence candidate record = false := by
      simpa [removeParallelRecord] using (List.mem_filter.mp retained).2
    have different : candidate ≠ record := by
      intro equal
      subst candidate
      simp [sameActivityOccurrence] at notSelected
    have prior := List.all_eq_true.mp bodies candidate candidateMember
    simp only [Bool.and_eq_true] at prior ⊢
    have disjoint := activityBodyClaimsUnique_pair claims candidateMember selection.recordMember
      different
    have claimNotRemoved : ∀ task ∈ activityBodyTaskClaims candidate.body,
        task ∉ pendingParallelTaskIds controller.slots := by
      intro task taskMember removed
      exact activityBodyClaimsDisjoint_no_shared_task disjoint taskMember
        (by rw [oldClaims]; exact removed)
    constructor
    · constructor
      · cases shape : candidate.body with
        | childScope scope =>
            simpa [activityBodyLive, shape, after, closeSharedParallelRegion,
              exactLiveOccurrence] using prior.1.1
        | userTask task =>
            simp only [activityBodyTaskClaims, shape, List.mem_singleton] at claimNotRemoved
            simp only [activityBodyLive, shape, decide_eq_true_eq] at prior ⊢
            change ((removeParallelChildWaits before.waits
              (pendingParallelTaskIds controller.slots)).filter
                (fun wait => decide (wait.processInstanceId = task.processInstanceId) &&
                  decide (wait.task.id.value = task.elementId.value) &&
                  decide (wait.activation = task.activation))).length = 1
            rw [← activityBodyWaitFilter_eq
              (removeParallelChildWaits before.waits
                (pendingParallelTaskIds controller.slots)) task]
            rw [removeParallelChildWaits_lookup_of_not_mem before.waits _ task
              (claimNotRemoved task (by simp))]
            rw [activityBodyWaitFilter_eq before.waits task]
            exact prior.1.1
        | parallelUserTasks first rest =>
            simp only [activityBodyLive, shape, List.all_eq_true,
              decide_eq_true_eq] at prior ⊢
            intro task taskMember
            simp only [after, closeSharedParallelRegion, attachedTimer]
            rw [← activityBodyWaitFilter_eq
              (removeParallelChildWaits before.waits
                (pendingParallelTaskIds controller.slots)) task]
            rw [removeParallelChildWaits_lookup_of_not_mem before.waits _ task
              (claimNotRemoved task (by simpa [activityBodyTaskClaims, shape] using taskMember))]
            rw [activityBodyWaitFilter_eq before.waits task]
            exact prior.1.1 task taskMember
      · simp only [List.all_eq_true] at prior ⊢
        intro candidateTimer candidateTimerMember
        obtain ⟨wait, waitMember, candidateBinding⟩ :=
          List.any_eq_true.mp (prior.1.2 candidateTimer candidateTimerMember)
        simp only [Bool.and_eq_true] at candidateBinding
        obtain ⟨candidateNames, sameOwner⟩ := candidateBinding
        have selectedRejected : timerIdNamesWait timer wait = false := by
          apply Bool.eq_false_iff.mpr
          intro selectedNames
          have selectedClaim : anyTimerIdNamesWait record.timerHandlerOccurrences wait = true := by
            simp [attachedTimer, anyTimerIdNamesWait, selectedNames]
          have candidateClaim : anyTimerIdNamesWait candidate.timerHandlerOccurrences wait = true := by
            simp only [anyTimerIdNamesWait, List.any_eq_true]
            exact ⟨candidateTimer, candidateTimerMember, candidateNames⟩
          have bound := of_decide_eq_true
            (List.all_eq_true.mp timersUnambiguous wait waitMember)
          have selectedIn : record ∈ before.activityOccurrences.filter (fun current =>
              anyTimerIdNamesWait current.timerHandlerOccurrences wait) :=
            List.mem_filter.mpr ⟨selection.recordMember, selectedClaim⟩
          have candidateIn : candidate ∈ before.activityOccurrences.filter (fun current =>
              anyTimerIdNamesWait current.timerHandlerOccurrences wait) :=
            List.mem_filter.mpr ⟨candidateMember, candidateClaim⟩
          obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp
            (Nat.le_antisymm bound (List.length_pos_of_mem selectedIn))
          have selectedEq : record = only := by simpa [singleton] using selectedIn
          have candidateEq : candidate = only := by simpa [singleton] using candidateIn
          exact different (candidateEq.trans selectedEq.symm)
        apply List.any_eq_true.mpr
        have retainedWait : wait ∈ removeParallelTimer before.timerWaits timer :=
          List.mem_filter.mpr ⟨waitMember, by simp [selectedRejected]⟩
        exact ⟨wait, by simpa [after, closeSharedParallelRegion, attachedTimer] using retainedWait,
          by simp [candidateNames, sameOwner]⟩
    · simpa [after, closeSharedParallelRegion] using prior.2
  have attachedAfter : attachedTimersUnambiguous after = true := by
    simp only [attachedTimersUnambiguous, List.all_eq_true] at timersUnambiguous ⊢
    intro wait waitAfter
    have retained : wait ∈ removeParallelTimer before.timerWaits timer := by
      simpa [after, closeSharedParallelRegion, attachedTimer] using waitAfter
    have waitMember : wait ∈ before.timerWaits := (List.mem_filter.mp retained).1
    have prior := timersUnambiguous wait waitMember
    have filteredFrame :
        (removeParallelRecord before.activityOccurrences record).filter (fun candidate =>
          anyTimerIdNamesWait candidate.timerHandlerOccurrences wait) =
        (before.activityOccurrences.filter (fun candidate =>
          anyTimerIdNamesWait candidate.timerHandlerOccurrences wait)).filter (fun candidate =>
            !sameActivityOccurrence candidate record) := by
      simp [removeParallelRecord, List.filter_filter, Bool.and_comm]
    simp only [decide_eq_true_eq]
    change ((removeParallelRecord before.activityOccurrences record).filter (fun candidate =>
      anyTimerIdNamesWait candidate.timerHandlerOccurrences wait)).length ≤ 1
    rw [filteredFrame]
    exact Nat.le_trans List.filter_sublist.length_le (of_decide_eq_true prior)
  have messagesUnambiguousAfter : attachedMessagesUnambiguous after = true := by
    simp only [attachedMessagesUnambiguous, List.all_eq_true,
      decide_eq_true_eq] at messagesUnambiguous ⊢
    intro candidate candidateAfter subscription subscriptionMember
    have retained : candidate ∈ removeParallelRecord before.activityOccurrences record := by
      simpa [after, closeSharedParallelRegion] using candidateAfter
    have candidateMember : candidate ∈ before.activityOccurrences :=
      (List.mem_filter.mp retained).1
    have prior := messagesUnambiguous candidate candidateMember subscription subscriptionMember
    have filteredFrame :
        (removeParallelRecord before.activityOccurrences record).filter (fun current =>
          current.messageHandlerOccurrences.contains subscription) =
        (before.activityOccurrences.filter (fun current =>
          current.messageHandlerOccurrences.contains subscription)).filter (fun current =>
            !sameActivityOccurrence current record) := by
      simp [removeParallelRecord, List.filter_filter, Bool.and_comm]
    change ((removeParallelRecord before.activityOccurrences record).filter (fun current =>
      current.messageHandlerOccurrences.contains subscription)).length ≤ 1
    rw [filteredFrame]
    exact Nat.le_trans List.filter_sublist.length_le prior
  have activityIdsAfter : activityIdentitiesUnique after = true := by
    simp only [activityIdentitiesUnique, after, closeSharedParallelRegion]
    change (removeParallelRecord before.activityOccurrences record).all
      (occursOnce sameActivityOccurrence
        (removeParallelRecord before.activityOccurrences record)) = true
    unfold removeParallelRecord
    exact all_occursOnce_filter sameActivityOccurrence
      (fun candidate => by simp [sameActivityOccurrence]) before.activityOccurrences _ activityIds
  have noSequentialOperation := admitted_parallel_has_no_sequential_operation program arm
    ownerScope account
  have noSequentialControllers := sequential_controllers_absent program before
    noSequentialOperation sequentialBindings
  have controllersAfter : controllersOwnLiveActivity after = true := by
    simp [controllersOwnLiveActivity, after, closeSharedParallelRegion,
      noSequentialControllers]
  have sequentialBindingsAfter : sequentialMultiInstanceProgramBindingsValid program after = true := by
    apply sequential_bindings_of_no_sequential_operation program after noSequentialOperation
    simp [after, closeSharedParallelRegion, noSequentialControllers]
  have parallelBindingsAfter : parallelMultiInstanceProgramBindingsValid program after = true := by
    exact parallelMultiInstanceProgramBindingsValid_terminal program arm ownerScope account before
      controller record output variables selection parallelBindings
  have controllerIdsAfter : controllerIdentitiesUnique after = true := by
    simp [controllerIdentitiesUnique, after, closeSharedParallelRegion, noSequentialControllers,
      selection.controllersSingleton, removeParallelController]
  have notExhaustedAfter : controllersNotExhausted after = true := by
    simp [controllersNotExhausted, after, closeSharedParallelRegion, noSequentialControllers]
  have lifecycleAfter : (match after.control with
      | .notStarted => notStartedStateEmpty after
      | _ => true) = true := by
    simp [after, closeSharedParallelRegion, running]
  have claimsAfter : activityBodyClaimsUnique after.activityOccurrences = true := by
    simpa [after, closeSharedParallelRegion, removeParallelRecord] using
      activityBodyClaimsUnique_filter before.activityOccurrences
        (fun candidate => !sameActivityOccurrence candidate record) claims
  have retentionAfter : compensationActivityRetentionStateValid program after = true := by
    change compensationActivityRetentionStateValid program before = true
    exact retention
  have snapshotsAfter : compensationEventSubProcessSnapshotStateValid program after = true := by
    change compensationEventSubProcessSnapshotStateValid program before = true
    exact snapshots
  simp only [runtimeStateWellFormed, Bool.and_eq_true]
  exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨positionAfter, racesAfter⟩, incidentsAfter⟩,
    ownersAfter⟩, identitiesAfter⟩, boundsAfter⟩, declarationsAfter⟩, hiddenAfter⟩,
    orderAfter⟩, bodiesAfter⟩, attachedAfter⟩, messagesUnambiguousAfter⟩,
    activityIdsAfter⟩, controllersAfter⟩,
    sequentialBindingsAfter⟩, parallelBindingsAfter⟩, controllerIdsAfter⟩,
    notExhaustedAfter⟩, lifecycleAfter⟩,
    ⟨⟨claimsAfter, retentionAfter⟩, snapshotsAfter⟩⟩

end BpmnSemantics.SemanticProcess
