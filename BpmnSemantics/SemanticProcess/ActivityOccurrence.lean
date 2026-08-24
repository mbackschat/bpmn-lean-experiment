import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Activity occurrence ownership

This module owns the lookups that replace the activation-ordinal joins and the laws about what a
record's removal withdraws.

The representation lives with `RuntimeState`, because it names `ScopeOccurrenceId` and a separate
module holding the structure would close an import cycle. That split follows `EventRace`, whose
structure is declared there and whose runtime account lives elsewhere. `activityOccurrenceBefore` and
`insertActivityOccurrence` live there for the same reason and are not restated here: the arming
transitions that must insert canonically are themselves in that module, so a copy of the order here
would be the second disagreeing fact.

Scope boundary: identity, ownership, and withdrawal completeness. It adds no BPMN capability, no
operation kind, and no public observation, and it states nothing about preservation of the
well-formedness conjuncts across transition arms, which remains the runtime-state invariant's
deliberately open lane.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Identity equality for the Activity occurrence triple. -/
def sameActivityOccurrence (left right : ActivityOccurrence) : Bool :=
  left.processInstanceId == right.processInstanceId &&
    left.activityElementId == right.activityElementId &&
    left.activation == right.activation

/-- Whether one successor Activity identity either already existed in the predecessor or was issued
strictly above that Activity element's predecessor high-water mark. -/
def activityIdentityAdmittedAfter (before : RuntimeState) (record : ActivityOccurrence) : Bool :=
  before.activityOccurrences.any (sameActivityOccurrence · record) ||
    decide (activityActivationCount before { value := record.activityElementId.value } <
      record.activation)

/-- `RSI-ISSUE-01`. Every Activity identity newly present in a committed successor is strictly above
the predecessor high-water mark for its Activity element.

The antecedent is identity equality over the committed pair. Body turnover therefore preserves an
identity, removal issues nothing, and a future operation kind belongs without being enumerated here. -/
def activityIdentityIssuingDiscipline (before after : RuntimeState) : Bool :=
  after.activityOccurrences.all (activityIdentityAdmittedAfter before)

theorem activityIdentityAdmittedAfter_of_mem {before : RuntimeState}
    {record : ActivityOccurrence} (present : record ∈ before.activityOccurrences) :
    activityIdentityAdmittedAfter before record = true := by
  simp only [activityIdentityAdmittedAfter, Bool.or_eq_true, List.any_eq_true]
  exact Or.inl ⟨record, present, by simp [sameActivityOccurrence]⟩

/-- Exact predecessor identity witnesses discharge the issuing discipline independently of record
contents. This is the preservation half used by body turnover. -/
theorem activityIdentityIssuingDiscipline_of_identity_witness
    (before after : RuntimeState)
    (preserved : ∀ record ∈ after.activityOccurrences,
      ∃ predecessor ∈ before.activityOccurrences,
        sameActivityOccurrence predecessor record = true) :
    activityIdentityIssuingDiscipline before after = true := by
  simp only [activityIdentityIssuingDiscipline, List.all_eq_true]
  intro record present
  obtain ⟨predecessor, predecessorPresent, same⟩ := preserved record present
  simp only [activityIdentityAdmittedAfter, Bool.or_eq_true, List.any_eq_true]
  exact Or.inl ⟨predecessor, predecessorPresent, same⟩

/-- Pure removal satisfies the issuing discipline because every successor record is itself an exact
predecessor witness. -/
theorem activityIdentityIssuingDiscipline_of_subset (before after : RuntimeState)
    (subset : ∀ record ∈ after.activityOccurrences, record ∈ before.activityOccurrences) :
    activityIdentityIssuingDiscipline before after = true := by
  apply activityIdentityIssuingDiscipline_of_identity_witness
  intro record present
  exact ⟨record, subset record present, by simp [sameActivityOccurrence]⟩

theorem all_insertActivityOccurrence (p : ActivityOccurrence → Bool)
    (record : ActivityOccurrence) : ∀ records : List ActivityOccurrence,
    (insertActivityOccurrence record records).all p = (p record && records.all p) := by
  intro records
  induction records with
  | nil => simp [insertActivityOccurrence]
  | cons current rest ih =>
      unfold insertActivityOccurrence
      by_cases h : activityOccurrenceBefore record current = true
      · simp [h]
      · simp only [Bool.not_eq_true] at h
        simp [h, ih, Bool.and_left_comm]

/-- A transition that inserts one occurrence above its predecessor counter satisfies the complete
pair rule, independent of where canonical insertion places the new record. -/
theorem activityIdentityIssuingDiscipline_insertActivityOccurrence
    (state : RuntimeState) (record : ActivityOccurrence)
    (fresh : activityActivationCount state { value := record.activityElementId.value } <
      record.activation) :
    activityIdentityIssuingDiscipline state
      { state with
        activityOccurrences := insertActivityOccurrence record state.activityOccurrences } = true := by
  simp only [activityIdentityIssuingDiscipline, all_insertActivityOccurrence, Bool.and_eq_true,
    List.all_eq_true]
  constructor
  · simp [activityIdentityAdmittedAfter, fresh]
  · intro candidate present
    exact activityIdentityAdmittedAfter_of_mem present

/-- The task occurrence a record's body names, when its body is a task. -/
def activityBodyTask? (record : ActivityOccurrence) : Option OccurrenceId :=
  match record.body with
  | .userTask task => some task
  | .childScope _ => none

/-- The child scope occurrence a record's body names, when its body is a child scope. -/
def activityBodyScope? (record : ActivityOccurrence) : Option ScopeOccurrenceId :=
  match record.body with
  | .userTask _ => none
  | .childScope scope => some scope

/-- Whether a record lists one exact Timer occurrence among the handlers attached to it. -/
def recordAttaches (record : ActivityOccurrence) (timer : OccurrenceId) : Bool :=
  record.attachedTimers.contains timer

/-- The unique record listing one Timer occurrence, or `none`.

`none` is returned for an ambiguous state rather than the first match. Two records naming one attached
wait is invalid before evaluation, so answering with either one would hide exactly the defect the
uniqueness conjunct exists to reject. -/
def activityOccurrenceForTimer? (records : List ActivityOccurrence) (timer : OccurrenceId) :
    Option ActivityOccurrence :=
  match records.filter (recordAttaches · timer) with
  | [record] => some record
  | _ => none

/-- The unique record whose body is one exact task occurrence, or `none`. -/
def activityOccurrenceForTask? (records : List ActivityOccurrence) (task : OccurrenceId) :
    Option ActivityOccurrence :=
  match records.filter fun record => activityBodyTask? record == some task with
  | [record] => some record
  | _ => none

/-- The unique record whose body is one exact child scope occurrence, or `none`. -/
def activityOccurrenceForScope? (records : List ActivityOccurrence) (scope : ScopeOccurrenceId) :
    Option ActivityOccurrence :=
  match records.filter fun record => activityBodyScope? record == some scope with
  | [record] => some record
  | _ => none

/-- Every Timer occurrence the given records list, in record and list order. -/
def attachedTimersOf (records : List ActivityOccurrence) : List OccurrenceId :=
  records.flatMap (·.attachedTimers)

/-- Whether one Timer occurrence identity names one live Timer wait.

`TimerWait.elementId` is a `NodeId` while `OccurrenceId.elementId` is a `SemanticId`, so the two are
compared through `.value`, which is the idiom the event-race account already uses. Stating it once here
keeps every consumer from re-deriving which wrapper each side carries. -/
def timerIdNamesWait (timer : OccurrenceId) (wait : TimerWait) : Bool :=
  timer.processInstanceId == wait.processInstanceId &&
    timer.elementId.value == wait.elementId.value &&
    timer.activation == wait.activation

/-- Whether one task occurrence identity names one live User Task wait.

The wrapper asymmetry is the same one `timerIdNamesWait` documents: a wait carries a
`UserTaskDefinition` while a body carries a `SemanticId`, so the element is compared through `.value`. -/
def taskIdNamesWait (task : OccurrenceId) (wait : UserTaskWait) : Bool :=
  task.processInstanceId == wait.processInstanceId &&
    task.elementId.value == wait.task.id.value &&
    task.activation == wait.activation

/-- Whether a record's body is the task one live wait holds.

Named rather than inlined into the lookup, for the same reason `recordAttaches` is: a law about the
lookup has to speak about the same predicate the lookup filters by, and an anonymous `match` inside a
filter is not that term. -/
def recordBodyNamesWait (wait : UserTaskWait) (record : ActivityOccurrence) : Bool :=
  match activityBodyTask? record with
  | some task => taskIdNamesWait task wait
  | none => false

/-- The unique record whose body is the task one live wait holds, or `none`.

Wait-keyed rather than identity-keyed, because a family recovering its pair starts from a wait and
would otherwise rebuild the body identity itself, which is the derivation the record replaces.
Ambiguity answers `none` for the reason `activityOccurrenceForTimer?` gives. -/
def activityOccurrenceForTaskWait? (records : List ActivityOccurrence) (wait : UserTaskWait) :
    Option ActivityOccurrence :=
  match records.filter (recordBodyNamesWait wait) with
  | [record] => some record
  | _ => none

/-- Whether any of the given Timer occurrence identities names one live Timer wait. -/
def anyTimerIdNamesWait (timers : List OccurrenceId) (wait : TimerWait) : Bool :=
  timers.any (timerIdNamesWait · wait)

/-- The unique record listing one live Timer wait, or `none`. Wait-keyed sibling of `activityOccurrenceForTimer?`. -/
def activityOccurrenceForTimerWait? (records : List ActivityOccurrence) (wait : TimerWait) :
    Option ActivityOccurrence :=
  match records.filter fun record => anyTimerIdNamesWait record.attachedTimers wait with
  | [record] => some record
  | _ => none

/-- The record-carried join between one live task wait and one live Timer wait.

The shared premise of every boundary-handler family: some record's body is this task occurrence and
some wait that record lists is this Timer occurrence. It replaces the retired premise that two
independently keyed activation counters agree, which was a property of a profile's uniqueness
admission rather than a fact the state carried.

Named once because two completed families require exactly this invariant over exactly this result
domain, which is the repository's condition for extracting a shared owner. -/
def RecordJoins (records : List ActivityOccurrence)
    (task : UserTaskWait) (timer : TimerWait) : Prop :=
  ∃ record ∈ records,
    (∃ body, activityBodyTask? record = some body ∧ taskIdNamesWait body task = true) ∧
    ∃ deadline ∈ record.attachedTimers, timerIdNamesWait deadline timer = true

/-! ## Lookup soundness

What a family recovering its pair needs from a lookup: that the record it answered is in the state, and
that it really names the wait the caller started from. Both are proved once here so no family repeats
the `filter`-singleton case analysis.
-/

private theorem mem_of_filter_eq_singleton {α : Type} {p : α → Bool} {l : List α} {a : α}
    (singleton : l.filter p = [a]) : a ∈ l ∧ p a = true :=
  List.mem_filter.mp (by simp [singleton])

/-- A record answered for a task wait is in the state and its body is that wait's occurrence. -/
theorem activityOccurrenceForTaskWait_sound {records : List ActivityOccurrence}
    {wait : UserTaskWait} {record : ActivityOccurrence}
    (found : activityOccurrenceForTaskWait? records wait = some record) :
    record ∈ records ∧
      ∃ body, activityBodyTask? record = some body ∧ taskIdNamesWait body wait = true := by
  unfold activityOccurrenceForTaskWait? at found
  split at found
  · next singleton =>
      cases found
      obtain ⟨mem, holds⟩ := mem_of_filter_eq_singleton singleton
      refine ⟨mem, ?_⟩
      unfold recordBodyNamesWait at holds
      split at holds
      · next body body_eq => exact ⟨body, body_eq, holds⟩
      · exact absurd holds (by simp)
  · exact absurd found (by simp)

/-- A record answered for a child scope occurrence is in the state and its body is that occurrence. -/
theorem activityOccurrenceForScope_sound {records : List ActivityOccurrence}
    {scope : ScopeOccurrenceId} {record : ActivityOccurrence}
    (found : activityOccurrenceForScope? records scope = some record) :
    record ∈ records ∧ activityBodyScope? record = some scope := by
  unfold activityOccurrenceForScope? at found
  split at found
  · next singleton =>
      cases found
      obtain ⟨mem, holds⟩ := mem_of_filter_eq_singleton singleton
      exact ⟨mem, by simpa using holds⟩
  · exact absurd found (by simp)

/-- A record answered for a Timer wait is in the state and lists that wait. -/
theorem activityOccurrenceForTimerWait_sound {records : List ActivityOccurrence}
    {wait : TimerWait} {record : ActivityOccurrence}
    (found : activityOccurrenceForTimerWait? records wait = some record) :
    record ∈ records ∧
      ∃ deadline ∈ record.attachedTimers, timerIdNamesWait deadline wait = true := by
  unfold activityOccurrenceForTimerWait? at found
  split at found
  · next singleton =>
      cases found
      obtain ⟨mem, holds⟩ := mem_of_filter_eq_singleton singleton
      exact ⟨mem, by simpa [anyTimerIdNamesWait, List.any_eq_true] using holds⟩
  · exact absurd found (by simp)

/-! ## Withdrawal completeness

A record is in a cancelled region when either end of it is: its owner, or its body. The two differ
only on the child-scope arm, and that difference is the whole defect this account closes. A boundary
handler is owned by the scope holding the Activity, so an owner-only rule leaves a deadline whose body
has just been removed alive and unreachable, with no state naming the Activity it was guarding.
-/

/-- Whether a record belongs to the region a cancellation predicate selects. -/
def recordInRegion (cancelled : ScopeOccurrenceId → Bool) (record : ActivityOccurrence) : Bool :=
  cancelled record.owner ||
    match record.body with
    | .userTask _ => false
    | .childScope scope => cancelled scope

/-- The records and attached Timer occurrences a region withdraws. -/
def withdrawnByRegion (cancelled : ScopeOccurrenceId → Bool)
    (records : List ActivityOccurrence) : List ActivityOccurrence :=
  records.filter (recordInRegion cancelled)

/-- The records a region retains. -/
def retainedByRegion (cancelled : ScopeOccurrenceId → Bool)
    (records : List ActivityOccurrence) : List ActivityOccurrence :=
  records.filter fun record => !recordInRegion cancelled record

theorem retained_and_withdrawn_partition_records
    (cancelled : ScopeOccurrenceId → Bool) (records : List ActivityOccurrence) :
    ∀ record ∈ records,
      (record ∈ withdrawnByRegion cancelled records) ≠
        (record ∈ retainedByRegion cancelled records) := by
  intro record _
  simp only [withdrawnByRegion, retainedByRegion, List.mem_filter, ne_eq, eq_iff_iff]
  cases recordInRegion cancelled record <;> simp_all

/-- A retained record is not in the region, so its body was not removed by that region.

This is the direction that matters for the stranded-handler class: a record survives a cancellation
only when its own body survives it, so no surviving record names a body the region took. -/
theorem retained_record_is_outside_region
    (cancelled : ScopeOccurrenceId → Bool) (records : List ActivityOccurrence)
    (record : ActivityOccurrence)
    (retained : record ∈ retainedByRegion cancelled records) :
    recordInRegion cancelled record = false := by
  simp only [retainedByRegion, List.mem_filter, Bool.not_eq_true'] at retained
  exact retained.2

/-- Specialized to the child-scope arm, which is the only arm whose body can differ from its owner. -/
theorem retained_child_scope_body_survives
    (cancelled : ScopeOccurrenceId → Bool) (records : List ActivityOccurrence)
    (record : ActivityOccurrence) (scope : ScopeOccurrenceId)
    (retained : record ∈ retainedByRegion cancelled records)
    (body : record.body = .childScope scope) :
    cancelled scope = false := by
  have outside := retained_record_is_outside_region cancelled records record retained
  simp only [recordInRegion, body, Bool.or_eq_false_iff] at outside
  exact outside.2

/-- No retained record was in the region, quantified over every state and region.

This is the direction a reader should check first, because the region's own filter is what makes it
true and a future rewrite that widened the filter would fail here. -/
theorem retained_records_are_outside_the_region
    (cancelled : ScopeOccurrenceId → Bool) (records : List ActivityOccurrence) :
    ∀ record ∈ retainedByRegion cancelled records, recordInRegion cancelled record = false := by
  intro record retained
  simp only [retainedByRegion, List.mem_filter, Bool.not_eq_true'] at retained
  exact retained.2

/-- Every wait a withdrawn record listed is absent from a list the region filtered by that same set.

The composed fact the capsule needs, quantified rather than decided at one fixture: filtering a Timer
list by "not named by any withdrawn record" leaves no wait any withdrawn record listed. `cancelScopeSubtree`
performs exactly this filter, so its deadline withdrawal follows from this rather than from the
structural `erase` the deadline arm used to carry. -/
theorem filtering_by_withdrawn_timers_leaves_none
    (withdrawn : List OccurrenceId) (timerWaits : List TimerWait)
    (survivor : TimerWait)
    (retained : survivor ∈ timerWaits.filter fun wait => !anyTimerIdNamesWait withdrawn wait) :
    anyTimerIdNamesWait withdrawn survivor = false := by
  simp only [List.mem_filter, Bool.not_eq_true'] at retained
  exact retained.2

/-- Withdrawing a region withdraws every handler wait the withdrawn records listed. -/
theorem withdrawn_records_carry_their_attached_timers
    (cancelled : ScopeOccurrenceId → Bool) (records : List ActivityOccurrence)
    (record : ActivityOccurrence) (timer : OccurrenceId)
    (withdrawn : record ∈ withdrawnByRegion cancelled records)
    (attached : timer ∈ record.attachedTimers) :
    timer ∈ attachedTimersOf (withdrawnByRegion cancelled records) := by
  simp only [attachedTimersOf, List.mem_flatMap]
  exact ⟨record, withdrawn, attached⟩

end BpmnSemantics.SemanticProcess
