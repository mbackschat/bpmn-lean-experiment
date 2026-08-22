import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Activity occurrence ownership

This module owns the canonical order over Activity occurrence records, the lookups that replace the
activation-ordinal joins, and the laws about what a record's removal withdraws.

The representation itself lives with `RuntimeState`, because it names `ScopeOccurrenceId` and a
separate module holding the structure would close an import cycle. That split follows `EventRace`,
whose structure is declared there and whose runtime account lives elsewhere.

Scope boundary: identity, ownership, and withdrawal completeness. It adds no BPMN capability, no
operation kind, and no public observation, and it states nothing about preservation of the
well-formedness conjuncts across transition arms, which remains the runtime-state invariant's
deliberately open lane.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Canonical order: Process instance, then Activity element, then activation. -/
def activityOccurrenceBefore (left right : ActivityOccurrence) : Bool :=
  if left.processInstanceId.value ≠ right.processInstanceId.value then
    left.processInstanceId.value < right.processInstanceId.value
  else if left.activityElementId.value ≠ right.activityElementId.value then
    left.activityElementId.value < right.activityElementId.value
  else
    left.activation < right.activation

/-- Identity equality for the Activity occurrence triple. -/
def sameActivityOccurrence (left right : ActivityOccurrence) : Bool :=
  left.processInstanceId == right.processInstanceId &&
    left.activityElementId == right.activityElementId &&
    left.activation == right.activation

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

/-- Whether any of the given Timer occurrence identities names one live Timer wait. -/
def anyTimerIdNamesWait (timers : List OccurrenceId) (wait : TimerWait) : Bool :=
  timers.any (timerIdNamesWait · wait)

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
