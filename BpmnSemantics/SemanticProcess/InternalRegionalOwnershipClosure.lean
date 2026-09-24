import BpmnSemantics.SemanticProcess.InternalRegionalCallRemoval

/-! REG-OWN-CLOSE-01 separates predecessor liveness from survival under selected removal. The
retention masks describe predecessor records only; no speculative successor supplies the condition.
Exact raw-field agreement remains distinct from cross-target selection-domain agreement. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure RegionalReferenceRetention where
  scope : RuntimeScopeOccurrence → Bool
  activity : ActivityOccurrence → Bool
  task : UserTaskWait → Bool
  message : MessageWait → Bool
  timer : TimerWait → Bool
  race : EventRace → Bool

def allMatchingRetained {α : Type} (values : List α) (keep names : α → Bool) : Bool :=
  values.all fun value => !names value || keep value

def regionalActivityReferencesClosed (state : RuntimeState) (keep : RegionalReferenceRetention)
    (record : ActivityOccurrence) : Bool :=
  let body := match record.body with
    | .userTask task => allMatchingRetained state.waits keep.task (taskIdNamesWait task)
    | .parallelUserTasks first rest => (first :: rest).all fun task =>
        allMatchingRetained state.waits keep.task (taskIdNamesWait task)
    | .childScope scope => allMatchingRetained state.scopeOccurrences keep.scope
        (fun occurrence => decide (occurrence.id = scope))
  body && record.attachedHandlers.all (fun handler => match handler with
    | .timer timer => allMatchingRetained state.timerWaits keep.timer (timerIdNamesWait timer)
    | .message message => allMatchingRetained state.messageWaits keep.message
        (messageIdNamesWait message))

def regionalOwnershipClosed (state : RuntimeState) (keep : RegionalReferenceRetention) : Bool :=
  state.activityOccurrences.all (fun record =>
    !keep.activity record || regionalActivityReferencesClosed state keep record) &&
  state.eventRaces.all (fun race => !keep.race race ||
    (allMatchingRetained state.messageWaits keep.message (messageIdNamesWait race.messageSubscriptionId) &&
      allMatchingRetained state.timerWaits keep.timer (timerIdNamesWait race.timerOccurrenceId)))

/-- All matching records, rather than one chosen witness, preserve the exact reference census. -/
theorem allMatchingRetained_preserves_census {α : Type} (values : List α) (keep names : α → Bool)
    (closed : allMatchingRetained values keep names = true) :
    (values.filter keep).filter names = values.filter names := by
  rw [List.filter_filter]
  apply List.filter_congr
  intro value member
  have retained := List.all_eq_true.mp closed value member
  cases named : names value <;> simp_all

/-- A live singleton target can still be selected for deletion; liveness does not imply closure. -/
theorem live_target_does_not_imply_retention {α : Type} (value : α) (keep names : α → Bool)
    (named : names value = true) (removed : keep value = false) :
    ([value].filter names).length = 1 ∧ allMatchingRetained [value] keep names = false := by
  simp [allMatchingRetained, named, removed]

def callReferenceRetention (state : RuntimeState) (record : CalledProcessOccurrence) :
    RegionalReferenceRetention :=
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [record.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  { scope := fun occurrence => !removed.contains occurrence.id.processInstanceId
    activity := fun activity => !removed.contains activity.owner.processInstanceId
    task := fun wait => !removed.contains wait.owner.processInstanceId
    message := fun wait => !removed.contains wait.owner.processInstanceId
    timer := fun wait => !removed.contains wait.owner.processInstanceId
    race := fun race => !removed.contains race.owner.processInstanceId }

def cancellationReferenceRetention (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) : RegionalReferenceRetention :=
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  let withdrawn := withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)
  { scope := fun occurrence => match disposition with
      | .retain => occurrence.id = root || !cancelled occurrence.id
      | .remove => !cancelled occurrence.id
    activity := fun record => !recordInRegion cancelled record (retainedCancellationRoot root disposition)
    task := fun wait => !cancelled wait.owner
    message := fun wait => !cancelled wait.owner && !activityRecordsAttachMessageWait withdrawn wait
    timer := fun wait => !cancelled wait.owner && !anyTimerIdNamesWait (attachedTimersOf withdrawn) wait
    race := fun race => !cancelled race.owner }

def regionalReferenceFieldsMatch (before after : RuntimeState) (keep : RegionalReferenceRetention) : Prop :=
  after.scopeOccurrences = before.scopeOccurrences.filter keep.scope ∧
    after.activityOccurrences = before.activityOccurrences.filter keep.activity ∧
    after.waits = before.waits.filter keep.task ∧
    after.messageWaits = before.messageWaits.filter keep.message ∧
    after.timerWaits = before.timerWaits.filter keep.timer ∧
    after.eventRaces = before.eventRaces.filter keep.race

theorem callReferenceRetention_matches_removal (state : RuntimeState) (record : CalledProcessOccurrence) :
    regionalReferenceFieldsMatch state (removeCalledProcessTree state record)
      (callReferenceRetention state record) := by
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩

theorem cancellationReferenceRetention_matches_removal (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) :
    regionalReferenceFieldsMatch state (cancelScopeSubtree state root disposition)
      (cancellationReferenceRetention state root disposition) := by
  cases disposition <;> exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- REG-OWN-FRAME-01 can restrict a target census without inventing a new forbidden reference.
This law keeps the selected mask fixed; re-derived selection/mask agreement is a separate obligation. -/
theorem allMatchingRetained_filter {α : Type} (values : List α) (keep names other : α → Bool)
    (closed : allMatchingRetained values keep names = true) :
    allMatchingRetained (values.filter other) keep names = true :=
  all_filter _ other values closed

private theorem regionalActivityReferencesClosed_after_filter (before after : RuntimeState)
    (selected other : RegionalReferenceRetention) (record : ActivityOccurrence)
    (fields : regionalReferenceFieldsMatch before after other)
    (closed : regionalActivityReferencesClosed before selected record = true) :
    regionalActivityReferencesClosed after selected record = true := by
  have parts := Bool.and_eq_true_iff.mp closed
  apply Bool.and_eq_true_iff.mpr
  constructor
  · cases body : record.body with
    | userTask task =>
        simp only [body] at parts ⊢
        rw [fields.2.2.1]
        exact allMatchingRetained_filter _ _ _ _ parts.1
    | parallelUserTasks first rest =>
        simp only [body] at parts ⊢
        apply List.all_eq_true.mpr
        intro task member
        rw [fields.2.2.1]
        exact allMatchingRetained_filter _ _ _ _ (List.all_eq_true.mp parts.1 task member)
    | childScope scope =>
        simp only [body] at parts ⊢
        rw [fields.1]
        exact allMatchingRetained_filter _ _ _ _ parts.1
  · apply List.all_eq_true.mpr
    intro handler member
    have prior := List.all_eq_true.mp parts.2 handler member
    cases handler with
    | timer timer =>
        rw [fields.2.2.2.2.1]
        exact allMatchingRetained_filter _ _ _ _ prior
    | message message =>
        rw [fields.2.2.2.1]
        exact allMatchingRetained_filter _ _ _ _ prior

/-- Removing sources and targets preserves closure for unchanged selected masks, even when
the other removal is not itself closed. Liveness still requires its separate predecessor proof. -/
theorem regionalOwnershipClosed_after_filter (before after : RuntimeState)
    (selected other : RegionalReferenceRetention)
    (fields : regionalReferenceFieldsMatch before after other)
    (closed : regionalOwnershipClosed before selected = true) :
    regionalOwnershipClosed after selected = true := by
  have parts := Bool.and_eq_true_iff.mp closed
  apply Bool.and_eq_true_iff.mpr
  constructor
  · apply List.all_eq_true.mpr
    intro record member
    rw [fields.2.1] at member
    have prior := List.all_eq_true.mp parts.1 record (List.mem_filter.mp member).1
    cases retained : selected.activity record with
    | false => simp
    | true =>
        simp only [retained, Bool.not_true, Bool.false_or] at prior ⊢
        exact regionalActivityReferencesClosed_after_filter before after selected other record fields prior
  · apply List.all_eq_true.mpr
    intro race member
    rw [fields.2.2.2.2.2] at member
    have prior := List.all_eq_true.mp parts.2 race (List.mem_filter.mp member).1
    cases retained : selected.race race with
    | false => simp
    | true =>
        simp only [retained, Bool.not_true, Bool.false_or, Bool.and_eq_true] at prior ⊢
        constructor
        · rw [fields.2.2.2.1]
          exact allMatchingRetained_filter _ _ _ _ prior.1
        · rw [fields.2.2.2.2.1]
          exact allMatchingRetained_filter _ _ _ _ prior.2

/-- Retaining additional targets cannot strand an existing reference. The implication is
population-local so a re-derived mask need not agree on hypothetical removed targets. -/
theorem allMatchingRetained_mono {α : Type} (values : List α) (before after names : α → Bool)
    (grows : ∀ value ∈ values, before value = true → after value = true)
    (closed : allMatchingRetained values before names = true) :
    allMatchingRetained values after names = true := by
  apply List.all_eq_true.mpr
  intro value member
  have prior := List.all_eq_true.mp closed value member
  cases named : names value with
  | false => simp
  | true =>
    have kept : before value = true := by simpa [named] using prior
    simpa [named] using grows value member kept

private theorem regionalActivityReferencesClosed_mono (state : RuntimeState)
    (before after : RegionalReferenceRetention) (record : ActivityOccurrence)
    (scopes : ∀ value ∈ state.scopeOccurrences, before.scope value = true → after.scope value = true)
    (tasks : ∀ value ∈ state.waits, before.task value = true → after.task value = true)
    (messages : ∀ value ∈ state.messageWaits, before.message value = true → after.message value = true)
    (timers : ∀ value ∈ state.timerWaits, before.timer value = true → after.timer value = true)
    (closed : regionalActivityReferencesClosed state before record = true) :
    regionalActivityReferencesClosed state after record = true := by
  have parts := Bool.and_eq_true_iff.mp closed
  apply Bool.and_eq_true_iff.mpr
  constructor
  · cases body : record.body with
    | userTask task =>
      simp only [body] at parts ⊢
      exact allMatchingRetained_mono _ _ _ _ tasks parts.1
    | parallelUserTasks first rest =>
      simp only [body] at parts ⊢
      apply List.all_eq_true.mpr
      intro task member
      exact allMatchingRetained_mono _ _ _ _ tasks (List.all_eq_true.mp parts.1 task member)
    | childScope scope =>
      simp only [body] at parts ⊢
      exact allMatchingRetained_mono _ _ _ _ scopes parts.1
  · apply List.all_eq_true.mpr
    intro handler member
    have prior := List.all_eq_true.mp parts.2 handler member
    cases handler with
    | timer timer => exact allMatchingRetained_mono _ _ _ _ timers prior
    | message message => exact allMatchingRetained_mono _ _ _ _ messages prior

/-- REG-OWN-FRAME-01 needs closure, not total mask equality. Fewer retained sources and more
retained targets preserve closure; reversing either implication would permit stranded references. -/
theorem regionalOwnershipClosed_mono (state : RuntimeState)
    (before after : RegionalReferenceRetention)
    (activities : ∀ value ∈ state.activityOccurrences,
      after.activity value = true → before.activity value = true)
    (races : ∀ value ∈ state.eventRaces, after.race value = true → before.race value = true)
    (scopes : ∀ value ∈ state.scopeOccurrences, before.scope value = true → after.scope value = true)
    (tasks : ∀ value ∈ state.waits, before.task value = true → after.task value = true)
    (messages : ∀ value ∈ state.messageWaits, before.message value = true → after.message value = true)
    (timers : ∀ value ∈ state.timerWaits, before.timer value = true → after.timer value = true)
    (closed : regionalOwnershipClosed state before = true) :
    regionalOwnershipClosed state after = true := by
  have parts := Bool.and_eq_true_iff.mp closed
  apply Bool.and_eq_true_iff.mpr
  constructor
  · apply List.all_eq_true.mpr
    intro record member
    cases retained : after.activity record with
    | false => simp
    | true =>
      have prior := List.all_eq_true.mp parts.1 record member
      have old := activities record member retained
      simp only [old, Bool.not_true, Bool.false_or] at prior
      simp only [Bool.not_true, Bool.false_or]
      exact regionalActivityReferencesClosed_mono state before after record scopes tasks messages timers prior
  · apply List.all_eq_true.mpr
    intro race member
    cases retained : after.race race with
    | false => simp
    | true =>
      have prior := List.all_eq_true.mp parts.2 race member
      have old := races race member retained
      simp only [old, Bool.not_true, Bool.false_or, Bool.and_eq_true] at prior
      simp only [Bool.not_true, Bool.false_or, Bool.and_eq_true]
      exact ⟨allMatchingRetained_mono _ _ _ _ messages prior.1,
        allMatchingRetained_mono _ _ _ _ timers prior.2⟩

end BpmnSemantics.SemanticProcess
