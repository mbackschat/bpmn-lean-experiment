import BpmnSemantics.SemanticProcess.InternalRegionalRemovalValidity

/-! # Retained Activity lifetime under regional cancellation

AOO-BODY-01 survives actual cancellation for retained records. AOO-OWN-01 preserves the exact
body census, while AOO-ATTACH-01/02 prevent another withdrawn Activity from taking a retained
record's tagged handler. The selected root's retain/remove disposition changes neither argument.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Without AOO-ATTACH-01, another withdrawn claimant removes a retained Activity's Timer even
when the Timer's scope survives. This symbolic discriminator uses the actual cancellation filter. -/
theorem cancelled_timer_claimant_blocks_survival (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (withdrawn : ActivityOccurrence) (timer : OccurrenceId) (wait : TimerWait)
    (member : withdrawn ∈ state.activityOccurrences)
    (inside : recordInRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) withdrawn = true)
    (attached : timer ∈ withdrawn.timerHandlerOccurrences)
    (names : timerIdNamesWait timer wait = true) :
    wait ∉ (cancelScopeSubtree state root disposition).timerWaits := by
  intro survives
  have absent := cancelScopeSubtree_withdraws_listed_timers state root disposition wait survives
  have present : anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion
      (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
        (calledInstanceClosure state root).contains owner.processInstanceId)
      state.activityOccurrences)) wait = true := by
    apply List.any_eq_true.mpr
    exact ⟨timer, List.mem_flatMap.mpr
      ⟨withdrawn, List.mem_filter.mpr ⟨member, inside⟩, attached⟩, names⟩
  rw [absent] at present
  contradiction

private theorem timer_claimants_equal (state : RuntimeState) (wait : TimerWait)
    (left right : ActivityOccurrence) (valid : attachedTimersUnambiguous state = true)
    (live : wait ∈ state.timerWaits) (leftMem : left ∈ state.activityOccurrences)
    (rightMem : right ∈ state.activityOccurrences)
    (leftNames : anyTimerIdNamesWait left.timerHandlerOccurrences wait = true)
    (rightNames : anyTimerIdNamesWait right.timerHandlerOccurrences wait = true) :
    left = right := by
  have first := activityOccurrenceForTimerWait_unique state wait left valid live leftMem leftNames
  have second := activityOccurrenceForTimerWait_unique state wait right valid live rightMem rightNames
  exact Option.some.inj (first.symm.trans second)

/-- Two distinct live claimants of the same Timer violate the executable uniqueness predicate;
owner survival alone cannot replace that predicate in retained-handler preservation. -/
theorem shared_timer_claimants_violate_unambiguity (state : RuntimeState) (wait : TimerWait)
    (left right : ActivityOccurrence) (live : wait ∈ state.timerWaits)
    (leftMem : left ∈ state.activityOccurrences) (rightMem : right ∈ state.activityOccurrences)
    (leftNames : anyTimerIdNamesWait left.timerHandlerOccurrences wait = true)
    (rightNames : anyTimerIdNamesWait right.timerHandlerOccurrences wait = true)
    (different : left ≠ right) : attachedTimersUnambiguous state = false := by
  cases valid : attachedTimersUnambiguous state with
  | false => rfl
  | true => exact False.elim (different
      (timer_claimants_equal state wait left right valid live leftMem rightMem leftNames rightNames))

private theorem message_names_injective (left right : OccurrenceId) (wait : MessageWait)
    (leftNames : messageIdNamesWait left wait = true)
    (rightNames : messageIdNamesWait right wait = true) : left = right := by
  simp only [messageIdNamesWait, Bool.and_eq_true, beq_iff_eq] at leftNames rightNames
  cases left with
  | mk lp le la =>
    cases right with
    | mk rp re ra =>
      cases le
      cases re
      simp_all

private theorem message_claimants_equal (state : RuntimeState) (wait : MessageWait)
    (left right : ActivityOccurrence) (valid : attachedMessagesUnambiguous state = true)
    (leftMem : left ∈ state.activityOccurrences) (rightMem : right ∈ state.activityOccurrences)
    (leftNames : anyMessageIdNamesWait left.messageHandlerOccurrences wait = true)
    (rightNames : anyMessageIdNamesWait right.messageHandlerOccurrences wait = true) :
    left = right := by
  obtain ⟨subscription, attached, names⟩ := List.any_eq_true.mp leftNames
  obtain ⟨other, otherAttached, otherNames⟩ := List.any_eq_true.mp rightNames
  have same := message_names_injective subscription other wait names otherNames
  subst other
  have bound := List.all_eq_true.mp (List.all_eq_true.mp valid left leftMem) subscription attached
  have leftSelected : left ∈ state.activityOccurrences.filter
      (fun record => record.messageHandlerOccurrences.contains subscription) :=
    List.mem_filter.mpr ⟨leftMem, List.contains_iff_mem.mpr attached⟩
  have rightSelected : right ∈ state.activityOccurrences.filter
      (fun record => record.messageHandlerOccurrences.contains subscription) :=
    List.mem_filter.mpr ⟨rightMem, List.contains_iff_mem.mpr otherAttached⟩
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp
    (Nat.le_antisymm (of_decide_eq_true bound) (List.length_pos_of_mem leftSelected))
  have leftEq : left = only := by rw [singleton] at leftSelected; simpa using leftSelected
  have rightEq : right = only := by rw [singleton] at rightSelected; simpa using rightSelected
  exact leftEq.trans rightEq.symm

private theorem task_census_preserved (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (record : ActivityOccurrence) (task : OccurrenceId)
    (outside : (occurrenceInSubtree state.scopeOccurrences root record.owner ||
      (calledInstanceClosure state root).contains record.owner.processInstanceId) = false)
    (owners : (state.waits.filter (taskIdNamesWait task)).all
      (fun wait => decide (wait.owner = record.owner)) = true) :
    (cancelScopeSubtree state root disposition).waits.filter (taskIdNamesWait task) =
      state.waits.filter (taskIdNamesWait task) := by
  change (state.waits.filter _).filter _ = _
  rw [List.filter_filter]
  apply List.filter_congr
  intro wait member
  by_cases names : taskIdNamesWait task wait = true
  · have owner := of_decide_eq_true (List.all_eq_true.mp owners wait
      (List.mem_filter.mpr ⟨member, names⟩))
    simp only [names, owner, outside, Bool.not_false, Bool.true_and]
  · simp only [Bool.eq_false_iff.mpr names, Bool.false_and]

private theorem retained_body_live (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (record : ActivityOccurrence)
    (outside : recordInRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) record = false)
    (live : activityBodyLive state record = true)
    (owners : activityTaskBodyOwnersAgree state record = true) :
    activityBodyLive (cancelScopeSubtree state root disposition) record = true := by
  have ownerOutside := (Bool.or_eq_false_iff.mp outside).1
  have census := task_census_preserved state root disposition record
  have taskNames (task : OccurrenceId) (wait : UserTaskWait) :
      (decide (wait.processInstanceId = task.processInstanceId) &&
        decide (wait.task.id.value = task.elementId.value) &&
        decide (wait.activation = task.activation)) = taskIdNamesWait task wait := by
    apply Bool.eq_iff_iff.mpr
    simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]
    simp only [eq_comm]
  cases body : record.body with
  | userTask task =>
    simp only [activityBodyLive, body] at live ⊢
    simp only [activityTaskBodyOwnersAgree, body] at owners
    simp only [taskNames] at live ⊢
    rw [census task ownerOutside owners]
    exact live
  | parallelUserTasks first rest =>
    simp only [activityBodyLive, body] at live ⊢
    simp only [activityTaskBodyOwnersAgree, body] at owners
    apply List.all_eq_true.mpr
    intro task member
    have taskLive := List.all_eq_true.mp live task member
    simp only [taskNames] at taskLive ⊢
    rw [census task ownerOutside (List.all_eq_true.mp owners task member)]
    exact taskLive
  | childScope scope =>
    simp only [recordInRegion, body, Bool.or_eq_false_iff] at outside
    simp only [activityBodyLive, body] at live ⊢
    exact cancelScopeSubtree_preserves_uncancelled_owner state root disposition scope
      live (Bool.or_eq_false_iff.mpr outside.2)

private theorem task_owners_preserved (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (record : ActivityOccurrence)
    (valid : activityTaskBodyOwnersAgree state record = true) :
    activityTaskBodyOwnersAgree (cancelScopeSubtree state root disposition) record = true := by
  have keeps (task : OccurrenceId)
      (prior : (state.waits.filter (taskIdNamesWait task)).all
        (fun wait => decide (wait.owner = record.owner)) = true) :
      ((cancelScopeSubtree state root disposition).waits.filter (taskIdNamesWait task)).all
        (fun wait => decide (wait.owner = record.owner)) = true := by
    apply List.all_eq_true.mpr
    intro wait member
    obtain ⟨filtered, names⟩ := List.mem_filter.mp member
    exact List.all_eq_true.mp prior wait
      (List.mem_filter.mpr ⟨(List.mem_filter.mp filtered).1, names⟩)
  cases body : record.body with
  | userTask task =>
    simp only [activityTaskBodyOwnersAgree, body] at valid ⊢
    exact keeps task valid
  | parallelUserTasks first rest =>
    simp only [activityTaskBodyOwnersAgree, body] at valid ⊢
    exact List.all_eq_true.mpr fun task member => keeps task (List.all_eq_true.mp valid task member)
  | childScope scope => simp [activityTaskBodyOwnersAgree, body]

private theorem retained_timer_live (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (record : ActivityOccurrence) (wait : TimerWait)
    (valid : attachedTimersUnambiguous state = true)
    (recordMem : record ∈ state.activityOccurrences)
    (outside : recordInRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) record = false)
    (waitMem : wait ∈ state.timerWaits) (owner : wait.owner = record.owner)
    (names : anyTimerIdNamesWait record.timerHandlerOccurrences wait = true) :
    wait ∈ (cancelScopeSubtree state root disposition).timerWaits := by
  apply List.mem_filter.mpr
  refine ⟨waitMem, ?_⟩
  simp only [Bool.and_eq_true, Bool.not_eq_true']
  constructor
  ·
    rw [owner]
    exact (Bool.or_eq_false_iff.mp outside).1
  · apply Bool.eq_false_iff.mpr
    intro claimed
    obtain ⟨timer, timerMem, timerNames⟩ := List.any_eq_true.mp claimed
    obtain ⟨other, otherMem, attached⟩ := List.mem_flatMap.mp timerMem
    obtain ⟨prior, withdrawn⟩ := List.mem_filter.mp otherMem
    have same := timer_claimants_equal state wait record other valid waitMem recordMem prior names
      (List.any_eq_true.mpr ⟨timer, attached, timerNames⟩)
    subst other
    rw [outside] at withdrawn
    contradiction

theorem retained_message_live (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (record : ActivityOccurrence) (wait : MessageWait)
    (valid : attachedMessagesUnambiguous state = true)
    (recordMem : record ∈ state.activityOccurrences)
    (outside : recordInRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) record = false)
    (waitMem : wait ∈ state.messageWaits) (owner : wait.owner = record.owner)
    (names : anyMessageIdNamesWait record.messageHandlerOccurrences wait = true) :
    wait ∈ (cancelScopeSubtree state root disposition).messageWaits := by
  apply List.mem_filter.mpr
  refine ⟨waitMem, ?_⟩
  simp only [Bool.and_eq_true, Bool.not_eq_true']
  constructor
  ·
    rw [owner]
    exact (Bool.or_eq_false_iff.mp outside).1
  · apply Bool.eq_false_iff.mpr
    intro claimed
    obtain ⟨other, otherMem, otherNames⟩ := List.any_eq_true.mp claimed
    obtain ⟨prior, withdrawn⟩ := List.mem_filter.mp otherMem
    have same := message_claimants_equal state wait record other valid recordMem prior names otherNames
    subst other
    rw [outside] at withdrawn
    contradiction

/-- Actual regional cancellation preserves AOO-BODY-01 and AOO-OWN-01 for every retained
Activity. Exact task-body multiplicity, live child scopes, and both tagged handler families derive
from predecessor ownership and attachment uniqueness, without assuming successor validity. -/
theorem cancelScopeSubtree_preserves_activity_records (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (bodies : activityRecordsOwnLiveWork state = true)
    (timers : attachedTimersUnambiguous state = true)
    (messages : attachedMessagesUnambiguous state = true) :
    activityRecordsOwnLiveWork (cancelScopeSubtree state root disposition) = true := by
  apply List.all_eq_true.mpr
  intro record member
  obtain ⟨prior, kept⟩ := List.mem_filter.mp member
  simp only [Bool.not_eq_true'] at kept
  have outside := kept
  have previous := List.all_eq_true.mp bodies record prior
  simp only [Bool.and_eq_true] at previous ⊢
  refine ⟨⟨⟨retained_body_live state root disposition record outside previous.1.1.1 previous.1.1.2,
    task_owners_preserved state root disposition record previous.1.1.2⟩, ?_⟩, ?_⟩
  · apply List.all_eq_true.mpr
    intro timer attached
    obtain ⟨wait, waitMem, witness⟩ := List.any_eq_true.mp
      (List.all_eq_true.mp previous.1.2 timer attached)
    have facts := witness
    simp only [Bool.and_eq_true] at facts
    obtain ⟨names, owner⟩ := facts
    apply List.any_eq_true.mpr
    exact ⟨wait, retained_timer_live state root disposition record wait timers prior outside waitMem
      (of_decide_eq_true owner) (List.any_eq_true.mpr ⟨timer, attached, names⟩),
      witness⟩
  · apply List.all_eq_true.mpr
    intro message attached
    obtain ⟨wait, waitMem, witness⟩ := List.any_eq_true.mp
      (List.all_eq_true.mp previous.2 message attached)
    have facts := witness
    simp only [Bool.and_eq_true] at facts
    obtain ⟨names, owner⟩ := facts
    apply List.any_eq_true.mpr
    exact ⟨wait, retained_message_live state root disposition record wait messages prior outside
      waitMem (of_decide_eq_true owner) (List.any_eq_true.mpr ⟨message, attached, names⟩),
      witness⟩

/-- Removing records and waits cannot add a Timer claimant. Sublist containment preserves the
at-most-one census even when different retained records have equal payloads. -/
theorem attachedTimersUnambiguous_of_sublist (before after : RuntimeState)
    (records : after.activityOccurrences.Sublist before.activityOccurrences)
    (timers : after.timerWaits.Sublist before.timerWaits)
    (valid : attachedTimersUnambiguous before = true) :
    attachedTimersUnambiguous after = true := by
  apply List.all_eq_true.mpr
  intro wait member
  have bound := List.all_eq_true.mp valid wait (timers.subset member)
  simp only [decide_eq_true_eq] at bound ⊢
  exact Nat.le_trans (records.filter _).length_le bound

/-- Message attachment uniqueness counts record occurrences, so a sublist can only decrease
each retained subscription's claimant census. -/
theorem attachedMessagesUnambiguous_of_sublist (before after : RuntimeState)
    (records : after.activityOccurrences.Sublist before.activityOccurrences)
    (valid : attachedMessagesUnambiguous before = true) :
    attachedMessagesUnambiguous after = true := by
  apply List.all_eq_true.mpr
  intro record member
  apply List.all_eq_true.mpr
  intro subscription attached
  have bound := List.all_eq_true.mp (List.all_eq_true.mp valid record
    (records.subset member)) subscription attached
  simp only [decide_eq_true_eq] at bound ⊢
  exact Nat.le_trans (records.filter _).length_le bound

/-- Both attachment censuses and disjoint body claims survive either cancellation disposition. -/
theorem cancelScopeSubtree_preserves_activity_claim_uniqueness (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (timers : attachedTimersUnambiguous state = true)
    (messages : attachedMessagesUnambiguous state = true)
    (bodies : activityBodyClaimsUnique state.activityOccurrences = true) :
    attachedTimersUnambiguous (cancelScopeSubtree state root disposition) = true ∧
      attachedMessagesUnambiguous (cancelScopeSubtree state root disposition) = true ∧
      activityBodyClaimsUnique (cancelScopeSubtree state root disposition).activityOccurrences =
        true :=
  ⟨attachedTimersUnambiguous_of_sublist state _ List.filter_sublist List.filter_sublist timers,
    attachedMessagesUnambiguous_of_sublist state _ List.filter_sublist messages,
    activityBodyClaimsUnique_filter _ _ bodies⟩

/-- Whole called-instance removal also introduces no new handler or body claimant. -/
theorem removeCalledProcessTree_preserves_activity_claim_uniqueness (state : RuntimeState)
    (record : CalledProcessOccurrence)
    (timers : attachedTimersUnambiguous state = true)
    (messages : attachedMessagesUnambiguous state = true)
    (bodies : activityBodyClaimsUnique state.activityOccurrences = true) :
    attachedTimersUnambiguous (removeCalledProcessTree state record) = true ∧
      attachedMessagesUnambiguous (removeCalledProcessTree state record) = true ∧
      activityBodyClaimsUnique (removeCalledProcessTree state record).activityOccurrences = true :=
  ⟨attachedTimersUnambiguous_of_sublist state _ List.filter_sublist List.filter_sublist timers,
    attachedMessagesUnambiguous_of_sublist state _ List.filter_sublist messages,
    activityBodyClaimsUnique_filter _ _ bodies⟩

end BpmnSemantics.SemanticProcess
