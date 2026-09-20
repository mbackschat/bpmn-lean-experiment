import BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure
import BpmnSemantics.SemanticProcess.InternalRegionalIdentityValidity
import BpmnSemantics.SemanticProcess.BoundedScope

/-! REG-OWN-CLOSE-01 uses completion's selected root/child mask and bounded deadline withdrawal.
The bounded evaluator erases one complete Timer record; predecessor identity uniqueness is needed
before expressing that erase as a per-record retention filter. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem filter_keep_all {α : Type} (values : List α) :
    values.filter (fun _ => true) = values := List.filter_eq_self.mpr (by simp)

private theorem filter_keep_none {α : Type} (values : List α) :
    values.filter (fun _ => false) = [] := List.filter_eq_nil_iff.mpr (by simp)

def ordinaryCompletionReferenceRetention (occurrence : RuntimeScopeOccurrence) :
    RegionalReferenceRetention :=
  { scope := fun candidate => match occurrence.parent with
      | none => false
      | some _ => decide (candidate.id ≠ occurrence.id)
    activity := fun _ => true
    task := fun _ => true
    message := fun _ => true
    timer := fun _ => true
    race := fun _ => true }

def boundedCompletionReferenceRetention (occurrence : RuntimeScopeOccurrence)
    (child : ScopeOccurrenceId) (deadline : TimerWait) : RegionalReferenceRetention :=
  { ordinaryCompletionReferenceRetention occurrence with
    activity := fun record => !decide (record.body = .childScope child)
    timer := fun wait => wait != deadline }

theorem ordinaryCompletionReferenceRetention_matches_completion (state completed : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (occurrence : RuntimeScopeOccurrence)
    (unique : state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (completion : completeScopeState? state scopeId parentOutput = some completed) :
    regionalReferenceFieldsMatch state completed (ordinaryCompletionReferenceRetention occurrence) := by
  have fields := completeScopeState_reference_fields state completed scopeId parentOutput
    occurrence unique completion
  cases parent : occurrence.parent <;>
    simpa [regionalReferenceFieldsMatch, ordinaryCompletionReferenceRetention, parent,
      filter_keep_all, filter_keep_none] using fields

private theorem bounded_withdrawal_matches_retention (before completed : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) (child : ScopeOccurrenceId) (deadline : TimerWait)
    (fields : regionalReferenceFieldsMatch before completed (ordinaryCompletionReferenceRetention occurrence))
    (nodup : before.timerWaits.Nodup) :
    regionalReferenceFieldsMatch before
      { completed with
        timerWaits := completed.timerWaits.erase deadline
        activityOccurrences := completed.activityOccurrences.filter fun record =>
          !decide (record.body = .childScope child) }
      (boundedCompletionReferenceRetention occurrence child deadline) := by
  rcases fields with ⟨scopes, activities, tasks, messages, timers, races⟩
  simp only [ordinaryCompletionReferenceRetention, filter_keep_all] at scopes activities tasks messages timers races
  simp only [regionalReferenceFieldsMatch, boundedCompletionReferenceRetention,
    ordinaryCompletionReferenceRetention, filter_keep_all]
  exact ⟨scopes, by simp only [activities], tasks, messages,
    by simpa only [timers] using nodup.erase_eq_filter deadline, races⟩

theorem boundedCompletionReferenceRetention_matches_completion (program : Program)
    (before after : RuntimeState) (scopeId : DefinitionScopeId)
    (parentOutput : Option ControlPlaceId) (occurrence : RuntimeScopeOccurrence)
    (definition : DefinitionScopeId × BoundaryTimerArm)
    (child parent : ScopeOccurrenceId) (deadline : TimerWait)
    (unique : before.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (definitionFound : boundedScopeDefinitionForChild? program scopeId = some definition)
    (childFound : boundedScopeChildOccurrence? before scopeId = some (child, parent))
    (deadlineFound : parentOwnedDeadline? before child parent definition.2 = some deadline)
    (identities : waitIdentitiesUnique before = true)
    (completion : completeBoundedScope? program before scopeId parentOutput = some after) :
    regionalReferenceFieldsMatch before after
      (boundedCompletionReferenceRetention occurrence child deadline) := by
  unfold completeBoundedScope? at completion
  cases ordinary : completeScopeState? before scopeId parentOutput with
  | none => simp [ordinary] at completion
  | some completed =>
      simp only [ordinary, definitionFound, childFound, deadlineFound, Option.some.injEq] at completion
      subst after
      apply bounded_withdrawal_matches_retention before completed occurrence child deadline
        (ordinaryCompletionReferenceRetention_matches_completion before completed scopeId parentOutput
          occurrence unique ordinary)
      simp only [waitIdentitiesUnique, Bool.and_eq_true, and_assoc] at identities
      exact occurrence_uniqueness_implies_nodup timerWaitKeyMatches
        (by intro wait; simp [timerWaitKeyMatches]) before.timerWaits identities.2.2.1

/-- The exact scope-body selector and AOO-ID-01 make body-based withdrawal agree with
identity-based withdrawal. This settles the mask comparison, not either target's selection domain. -/
theorem bounded_completion_activity_identity_mask (state : RuntimeState)
    (child : ScopeOccurrenceId) (record : ActivityOccurrence)
    (selected : activityOccurrenceForScope? state.activityOccurrences child = some record)
    (unique : activityIdentitiesUnique state = true) :
    state.activityOccurrences.filter (fun candidate => !decide (candidate.body = .childScope child)) =
      state.activityOccurrences.filter (fun candidate => !sameActivityOccurrence candidate record) := by
  have census : (state.activityOccurrences.filter fun candidate =>
      activityBodyScope? candidate == some child) = [record] := by
    unfold activityOccurrenceForScope? at selected
    split at selected <;> simp_all
  have recordFiltered : record ∈ state.activityOccurrences.filter
      (fun candidate => activityBodyScope? candidate == some child) := by rw [census]; simp
  have recordMember := (List.mem_filter.mp recordFiltered).1
  have bodyMatch (candidate : ActivityOccurrence) :
      (activityBodyScope? candidate == some child) = decide (candidate.body = .childScope child) := by
    apply Bool.eq_iff_iff.mpr
    cases shape : candidate.body <;> simp [activityBodyScope?, shape, beq_iff_eq]
  apply List.filter_congr
  intro candidate member
  congr 1
  apply Bool.eq_iff_iff.mpr
  constructor
  · intro body
    have belongs : candidate ∈ state.activityOccurrences.filter
        (fun value => activityBodyScope? value == some child) :=
      List.mem_filter.mpr ⟨member, (bodyMatch candidate).trans body⟩
    have same : candidate = record := by simpa [census] using belongs
    simp [same, sameActivityOccurrence]
  · intro same
    have identical := activityIdentitiesUnique_member_eq state record candidate unique
      recordMember member same
    subst candidate
    exact (bodyMatch record).symm.trans (List.mem_filter.mp recordFiltered).2

/-- RSI-UNIQ-02 makes single-record deadline erasure agree with complete Timer-key withdrawal.
Without it, erasure can leave a second record whose key is equal but whose payload differs. -/
theorem bounded_completion_timer_identity_mask (state : RuntimeState) (deadline : TimerWait)
    (present : deadline ∈ state.timerWaits) (unique : waitIdentitiesUnique state = true) :
    state.timerWaits.erase deadline =
      state.timerWaits.filter (fun wait => !timerWaitKeyMatches deadline wait) := by
  simp only [waitIdentitiesUnique, Bool.and_eq_true, and_assoc] at unique
  have timersUnique := unique.2.2.1
  have nodup := occurrence_uniqueness_implies_nodup timerWaitKeyMatches
    (by intro wait; simp [timerWaitKeyMatches]) state.timerWaits timersUnique
  rw [nodup.erase_eq_filter]
  have once := List.all_eq_true.mp timersUnique deadline present
  obtain ⟨only, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true once)
  have targetFiltered : deadline ∈ state.timerWaits.filter (timerWaitKeyMatches deadline) :=
    List.mem_filter.mpr ⟨present, by simp [timerWaitKeyMatches]⟩
  have targetEq : deadline = only := by simpa [census] using targetFiltered
  apply List.filter_congr
  intro wait member
  have sameKey : timerWaitKeyMatches deadline wait = decide (wait = deadline) := by
    apply Bool.eq_iff_iff.mpr
    constructor
    · intro named
      have waitFiltered := List.mem_filter.mpr ⟨member, named⟩
      have waitEq : wait = only := by simpa [census] using waitFiltered
      exact decide_eq_true (waitEq.trans targetEq.symm)
    · intro equal
      have identical := of_decide_eq_true equal
      subst wait
      simp [timerWaitKeyMatches]
  simp only [bne, sameKey]
  congr 1

end BpmnSemantics.SemanticProcess
