import BpmnSemantics.SemanticProcess.RecurringBoundaryTimer

/-! Quantified recurrence laws use exact predecessor censuses and Timer high-water bounds.
The checked mutation changes one attachment and one wait; arbitrary prior handler populations
and unrelated Activity records frame without assuming a successor well-formedness result. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open BpmnSemantics.SemanticProcessJson

private theorem rejected_insert_filter (order : α → α → Bool) (predicate : α → Bool)
    (value : α) (values : List α) (rejected : predicate value = false) :
    (canonicalInsertBy order value values).filter predicate = values.filter predicate := by
  induction values with
  | nil => simp [canonicalInsertBy, rejected]
  | cons head tail ih =>
      simp only [canonicalInsertBy]
      split <;> simp_all [List.filter_cons]

private theorem empty_insert_filter (order : α → α → Bool) (predicate : α → Bool)
    (value : α) (values : List α) (empty : values.filter predicate = []) :
    (canonicalInsertBy order value values).filter predicate = if predicate value then [value] else [] := by
  induction values with
  | nil => cases valueSelected : predicate value <;> simp [canonicalInsertBy, valueSelected]
  | cons head tail ih =>
      cases selected : predicate head <;> simp only [List.filter_cons, selected, Bool.false_eq_true, ↓reduceIte, List.cons_ne_nil] at empty
      simp only [canonicalInsertBy]
      split <;> cases valueSelected : predicate value <;> simp_all

private theorem timer_member_of_binding (state : RuntimeState) (record : ActivityOccurrence)
    (timer : TimerWait) (arm : BoundaryTimerArm)
    (bound : NonInterruptingBoundaryTimerBinding state record timer arm) : timer ∈ state.timerWaits :=
  (List.mem_filter.mp (show timer ∈ state.timerWaits.filter (timerIdNamesWait (boundaryTimerWaitIdentity timer)) by
    rw [bound.1]; simp)).1

/-- Freshness ranges over all old waits of the Timer element, including other owners. -/
theorem recurring_boundary_timer_successor_fresh (state : RuntimeState) (timer : TimerWait)
    (arm : BoundaryTimerArm) (highWater : RecurringBoundaryTimerHighWater state timer) :
    state.timerWaits.filter (timerIdNamesWait (boundaryTimerWaitIdentity (recurringBoundaryTimerSuccessor state timer arm))) = [] := by
  apply List.filter_eq_nil_iff.mpr
  intro candidate member
  intro named
  simp only [timerIdNamesWait, boundaryTimerWaitIdentity, recurringBoundaryTimerSuccessor,
    Bool.and_eq_true, beq_iff_eq] at named
  have element : candidate.elementId = timer.elementId := congrArg NodeId.mk named.1.2.symm
  have bound := highWater candidate member element
  omega

/-- Replacement retains both ownership and output, and advances from the old deadline rather
than host time. Its activation is strictly above the predecessor counter. -/
theorem recurring_boundary_timer_successor_fields (state : RuntimeState) (timer : TimerWait) (arm : BoundaryTimerArm) :
    let next := recurringBoundaryTimerSuccessor state timer arm
    next.processInstanceId = timer.processInstanceId ∧ next.owner = timer.owner ∧
    next.elementId = timer.elementId ∧ next.output = timer.output ∧
    next.deadlineMs = timer.deadlineMs + arm.durationMs ∧
    next.activation = timerActivationCount state timer.elementId + 1 ∧
    timerActivationCount state timer.elementId < next.activation := by
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, Nat.lt_succ_self _⟩

/-- The singleton old-key census and high-water bound make old withdrawal final and leave
exactly one fresh wait, independently of where canonical insertion places it. -/
theorem recurring_boundary_timer_exact_replacement (before after : RuntimeState)
    (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
    (step : NonInterruptingBoundaryTimerStep before record timer arm after)
    (recurring : arm.recurrence = some .repeating)
    (highWater : RecurringBoundaryTimerHighWater before timer) :
    let next := recurringBoundaryTimerSuccessor before timer arm
    after.timerWaits.filter (timerIdNamesWait (boundaryTimerWaitIdentity timer)) = [] ∧
    after.timerWaits.filter (timerIdNamesWait (boundaryTimerWaitIdentity next)) = [next] ∧
    after.timerActivations = setTimerActivationCount before.timerActivations timer.elementId
      (timerActivationCount before timer.elementId + 1) := by
  cases step with
  | oneShot bound once => simp [once] at recurring
  | repeating bound _ _ _ =>
      have live := timer_member_of_binding before record timer arm bound
      have oldBound := highWater timer live rfl
      have oldRejected : timerIdNamesWait (boundaryTimerWaitIdentity timer)
          (recurringBoundaryTimerSuccessor before timer arm) = false := by
        simp only [timerIdNamesWait, boundaryTimerWaitIdentity, recurringBoundaryTimerSuccessor,
          beq_self_eq_true, Bool.true_and, beq_eq_false_iff_ne]
        omega
      have fresh := recurring_boundary_timer_successor_fresh before timer arm highWater
      have erasedFresh : (before.timerWaits.erase timer).filter
          (timerIdNamesWait (boundaryTimerWaitIdentity (recurringBoundaryTimerSuccessor before timer arm))) = [] := by
        rw [← List.erase_filter, fresh]; rfl
      refine ⟨?_, ?_, rfl⟩
      · rw [insertTimerWait, rejected_insert_filter _ _ _ _ oldRejected, ← List.erase_filter, bound.1]
        simp
      · rw [insertTimerWait, empty_insert_filter _ _ _ _ erasedFresh]
        simp [timerIdNamesWait, boundaryTimerWaitIdentity]

/-- Every unrelated Timer wait keeps its order and multiplicity, not merely its membership. -/
theorem recurring_boundary_timer_unrelated_waits_frame (before after : RuntimeState)
    (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
    (step : NonInterruptingBoundaryTimerStep before record timer arm after)
    (recurring : arm.recurrence = some .repeating) :
    let unrelated := fun wait => !(timerIdNamesWait (boundaryTimerWaitIdentity timer) wait ||
      timerIdNamesWait (boundaryTimerWaitIdentity (recurringBoundaryTimerSuccessor before timer arm)) wait)
    after.timerWaits.filter unrelated = before.timerWaits.filter unrelated := by
  cases step with
  | oneShot bound once => simp [once] at recurring
  | repeating bound _ _ _ =>
      dsimp only
      rw [insertTimerWait, rejected_insert_filter]
      · rw [← List.erase_filter]
        apply List.erase_of_not_mem
        simp [List.mem_filter, timerIdNamesWait, boundaryTimerWaitIdentity]
      · simp [timerIdNamesWait, boundaryTimerWaitIdentity]

/-- Replacing a tagged handler never changes its Activity identity, body or scope owner. -/
theorem recurring_boundary_timer_record_fields (record : ActivityOccurrence)
    (old : OccurrenceId) (replacement : Option OccurrenceId) :
    let updated := replaceBoundaryTimerAttachment old replacement record
    updated.processInstanceId = record.processInstanceId ∧
    updated.activityElementId = record.activityElementId ∧ updated.activation = record.activation ∧
    updated.body = record.body ∧ updated.owner = record.owner := by
  exact ⟨rfl, rfl, rfl, rfl, rfl⟩

private theorem replacement_same_identity (selected record : ActivityOccurrence)
    (old : OccurrenceId) (replacement : Option OccurrenceId) :
    sameActivityOccurrence selected (replaceBoundaryTimerAttachment old replacement record) =
      sameActivityOccurrence selected record := rfl

theorem recurring_boundary_timer_unrelated_records_frame (selected : ActivityOccurrence)
    (old : OccurrenceId) (replacement : Option OccurrenceId) (records : List ActivityOccurrence) :
    (replaceSelectedBoundaryTimerAttachment selected old replacement records).filter
        (fun record => !sameActivityOccurrence selected record) =
      records.filter (fun record => !sameActivityOccurrence selected record) := by
  induction records with
  | nil => rfl
  | cons record rest ih =>
      cases matched : sameActivityOccurrence selected record <;>
        simp [replaceSelectedBoundaryTimerAttachment, matched, replacement_same_identity] at ih ⊢
      all_goals exact ih

/-- The exact selected Activity remains a singleton, with only its tagged attachment changed. -/
theorem recurring_boundary_timer_selected_record (selected : ActivityOccurrence)
    (old : OccurrenceId) (replacement : Option OccurrenceId) (records : List ActivityOccurrence)
    (census : records.filter (sameActivityOccurrence selected) = [selected]) :
    (replaceSelectedBoundaryTimerAttachment selected old replacement records).filter
        (sameActivityOccurrence selected) = [replaceBoundaryTimerAttachment old replacement selected] := by
  have mapped : (replaceSelectedBoundaryTimerAttachment selected old replacement records).filter
      (sameActivityOccurrence selected) =
      (records.filter (sameActivityOccurrence selected)).map (replaceBoundaryTimerAttachment old replacement) := by
    clear census
    induction records with
    | nil => rfl
    | cons record rest ih =>
        cases matched : sameActivityOccurrence selected record <;>
          simp [replaceSelectedBoundaryTimerAttachment, matched, replacement_same_identity] at ih ⊢
        all_goals exact ih
  rw [mapped, census]
  rfl

/-- The admitted single attachment is replaced in the same record, or consumed for one-shot
firing. This equation is independent of the Task-versus-child body and all prior handler waits. -/
theorem boundary_timer_sole_attachment (record : ActivityOccurrence) (old : OccurrenceId)
    (replacement : Option OccurrenceId) (sole : record.attachedHandlers = [.timer old]) :
    (replaceBoundaryTimerAttachment old replacement record).attachedHandlers =
      replacement.toList.map ActivityHandler.timer := by
  cases replacement <;> simp [replaceBoundaryTimerAttachment, sole]

private theorem timer_counter_set_exact (values : List TimerActivation) (element : NodeId) (count : Nat) :
    (setTimerActivationCount values element count).filter (fun value => decide (value.elementId = element)) =
      [{ elementId := element, count }] := by
  have empty : (values.filter (fun value => decide (value.elementId ≠ element))).filter
      (fun value => decide (value.elementId = element)) = [] := by
    simp [List.filter_filter]
  unfold setTimerActivationCount
  rw [empty_insert_filter _ _ _ _ empty]
  simp

/-- The installed high-water value is exactly the old high-water value plus one; no duplicate
counter declaration or earlier list position can shadow that installation. -/
theorem recurring_boundary_timer_counter_advanced (before after : RuntimeState)
    (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
    (step : NonInterruptingBoundaryTimerStep before record timer arm after)
    (recurring : arm.recurrence = some .repeating) :
    timerActivationCount after timer.elementId = timerActivationCount before timer.elementId + 1 := by
  cases step with
  | oneShot _ once => simp [once] at recurring
  | repeating _ _ _ _ =>
      change elementActivationCount
        ((setTimerActivationCount before.timerActivations timer.elementId
          (timerActivationCount before timer.elementId + 1)).map fun value => (value.elementId, value.count))
        timer.elementId = timerActivationCount before timer.elementId + 1
      have found := congrArg List.head? (timer_counter_set_exact before.timerActivations timer.elementId
        (timerActivationCount before timer.elementId + 1))
      simp only [List.head?_filter, List.head?_cons] at found
      simp only [elementActivationCount, List.find?_map, Function.comp_def, found, Option.map_some, Option.getD_some]

/-- The common host frame covers any number of previous handler occurrences in either body kind. -/
theorem noninterrupting_boundary_timer_host_frames (before after : RuntimeState)
    (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
    (step : NonInterruptingBoundaryTimerStep before record timer arm after) :
    after.waits = before.waits ∧ after.messageWaits = before.messageWaits ∧
    after.scopeOccurrences = before.scopeOccurrences ∧ after.variables = before.variables ∧
    after.activations = before.activations ∧ after.activityActivations = before.activityActivations ∧
    after.messageActivations = before.messageActivations ∧ after.scopeActivations = before.scopeActivations ∧
    after.effectActivations = before.effectActivations ∧ after.callActivations = before.callActivations ∧
    after.eventRaceActivations = before.eventRaceActivations ∧
    after.tokens = addToken before.tokens arm.output record.owner ∧ after.logicalTimeMs = timer.deadlineMs := by
  cases step <;> exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- Without recurrence the old exact Timer is consumed, no counter changes, and no replacement is installed. -/
theorem boundary_timer_one_shot (before after : RuntimeState)
    (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
    (step : NonInterruptingBoundaryTimerStep before record timer arm after) (once : arm.recurrence = none) :
    after.timerWaits = before.timerWaits.erase timer ∧ after.timerActivations = before.timerActivations ∧
    after.timerWaits.filter (timerIdNamesWait (boundaryTimerWaitIdentity timer)) = [] ∧
    after.activityOccurrences = replaceSelectedBoundaryTimerAttachment record
      (boundaryTimerWaitIdentity timer) none before.activityOccurrences := by
  cases step with
  | oneShot bound _ =>
      refine ⟨rfl, rfl, ?_, rfl⟩
      rw [← List.erase_filter, bound.1]
      simp
  | repeating _ recurring _ _ => simp [once] at recurring

/-- Capacity is checked before either mutation, so neither overflow has a successor state. -/
theorem recurring_boundary_timer_capacity_refused (state : RuntimeState)
    (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
    (recurring : arm.recurrence = some .repeating)
    (overflow : isSafeWireNat (timerActivationCount state timer.elementId + 1) = false ∨
      isSafeWireNat (timer.deadlineMs + arm.durationMs) = false) :
    fireNonInterruptingBoundaryTimer state record timer arm = .error .capacity := by
  rcases overflow with overflow | overflow <;>
    simp [fireNonInterruptingBoundaryTimer, recurring, overflow]

theorem noninterrupting_boundary_timer_activity_identity_discipline (before after : RuntimeState)
    (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
    (step : NonInterruptingBoundaryTimerStep before record timer arm after) :
    activityIdentityIssuingDiscipline before after = true := by
  cases step <;> apply activityIdentityIssuingDiscipline_of_identity_witness
  all_goals
    intro candidate present
    obtain ⟨original, member, rfl⟩ := List.mem_map.mp present
    refine ⟨original, member, ?_⟩
    split <;> simp [replaceBoundaryTimerAttachment, sameActivityOccurrence]

private theorem replacement_preserves_body_claims (selected : ActivityOccurrence)
    (old : OccurrenceId) (replacement : Option OccurrenceId) (records : List ActivityOccurrence) :
    activityBodyClaimsUnique (replaceSelectedBoundaryTimerAttachment selected old replacement records) =
      activityBodyClaimsUnique records := by
  let update := fun record => if sameActivityOccurrence selected record then
    replaceBoundaryTimerAttachment old replacement record else record
  have pair (left right : ActivityOccurrence) :
      activityBodyClaimsDisjoint (update left) (update right) = activityBodyClaimsDisjoint left right := by
    unfold update
    split <;> split <;> rfl
  change activityBodyClaimsUnique (records.map update) = _
  induction records with
  | nil => rfl
  | cons record rest ih =>
      have mapped : activityBodyClaimsDisjoint (update record) ∘ update = activityBodyClaimsDisjoint record :=
        funext (pair record)
      simp only [List.map_cons, activityBodyClaimsUnique_cons, List.all_map, mapped, ih]

theorem noninterrupting_boundary_timer_preserves_body_claims (before after : RuntimeState)
    (record : ActivityOccurrence) (timer : TimerWait) (arm : BoundaryTimerArm)
    (step : NonInterruptingBoundaryTimerStep before record timer arm after) :
    activityBodyClaimsUnique after.activityOccurrences = activityBodyClaimsUnique before.activityOccurrences := by
  cases step <;> exact replacement_preserves_body_claims _ _ _ _

end BpmnSemantics.SemanticProcess
