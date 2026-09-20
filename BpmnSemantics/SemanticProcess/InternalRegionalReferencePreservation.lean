import BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure
import BpmnSemantics.SemanticProcess.InternalRegionalIdentityValidity

/-! REG-OWN-CLOSE-01 preserves live references by retaining their complete predecessor census.
Actual operation masks supply field agreement; successor validity is derived rather than assumed. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- REG-OWN-CLOSE-01 retains the entire census even when the consumer additionally checks owner. -/
theorem allMatchingRetained_preserves_refined_census {α : Type} (values : List α)
    (keep names refined : α → Bool)
    (closed : allMatchingRetained values keep names = true)
    (implies : ∀ value, refined value = true → names value = true) :
    (values.filter keep).filter refined = values.filter refined := by
  apply allMatchingRetained_preserves_census
  apply List.all_eq_true.mpr
  intro value member
  have retained := List.all_eq_true.mp closed value member
  by_cases selected : refined value = true
  · have named := implies value selected
    simpa [named, selected] using retained
  · simp [Bool.eq_false_iff.mpr selected]

private theorem task_names_agree (task : OccurrenceId) (wait : UserTaskWait) :
    (decide (wait.processInstanceId = task.processInstanceId) &&
      decide (wait.task.id.value = task.elementId.value) &&
      decide (wait.activation = task.activation)) = taskIdNamesWait task wait := by
  apply Bool.eq_iff_iff.mpr
  simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]
  simp only [eq_comm]

private theorem retained_activity_body_equal (before after : RuntimeState)
    (keep : RegionalReferenceRetention) (record : ActivityOccurrence)
    (fields : regionalReferenceFieldsMatch before after keep)
    (closed : regionalActivityReferencesClosed before keep record = true) :
    activityBodyLive after record = activityBodyLive before record ∧
      activityTaskBodyOwnersAgree after record = activityTaskBodyOwnersAgree before record := by
  have bodyClosed := (Bool.and_eq_true_iff.mp closed).1
  cases body : record.body with
  | userTask task =>
    simp only [body] at bodyClosed
    have census := allMatchingRetained_preserves_census before.waits keep.task
      (taskIdNamesWait task) bodyClosed
    simp only [activityBodyLive, activityTaskBodyOwnersAgree, body, task_names_agree,
      fields.2.2.1, census, and_self]
  | parallelUserTasks first rest =>
    simp only [body] at bodyClosed
    have census (task : OccurrenceId) (member : task ∈ first :: rest) :=
      allMatchingRetained_preserves_census before.waits keep.task (taskIdNamesWait task)
        (List.all_eq_true.mp bodyClosed task member)
    constructor
    · simp only [activityBodyLive, body, task_names_agree, fields.2.2.1]
      apply Bool.eq_iff_iff.mpr
      simp only [List.all_eq_true]
      constructor <;> intro valid task member
      · simpa only [census task member] using valid task member
      · simpa only [census task member] using valid task member
    · simp only [activityTaskBodyOwnersAgree, body, fields.2.2.1]
      apply Bool.eq_iff_iff.mpr
      simp only [List.all_eq_true]
      constructor <;> intro valid task member
      · simpa only [census task member] using valid task member
      · simpa only [census task member] using valid task member
  | childScope scope =>
    simp only [body] at bodyClosed
    have census := allMatchingRetained_preserves_census before.scopeOccurrences keep.scope
      (fun occurrence => decide (occurrence.id = scope)) bodyClosed
    simp only [activityBodyLive, activityTaskBodyOwnersAgree, body, exactLiveOccurrence,
      fields.1, census, and_self]

private theorem retained_timer_census (before after : RuntimeState)
    (keep : RegionalReferenceRetention) (record : ActivityOccurrence) (timer : OccurrenceId)
    (fields : regionalReferenceFieldsMatch before after keep)
    (closed : regionalActivityReferencesClosed before keep record = true)
    (attached : timer ∈ record.timerHandlerOccurrences) :
    after.timerWaits.filter (timerIdNamesWait timer) =
      before.timerWaits.filter (timerIdNamesWait timer) := by
  obtain ⟨handler, member, projected⟩ := List.mem_filterMap.mp attached
  have handlerClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp closed).2 handler member
  cases handler with
  | timer occurrence =>
    simp only [Option.some.injEq] at projected
    subst occurrence
    rw [fields.2.2.2.2.1]
    exact allMatchingRetained_preserves_census _ _ _ handlerClosed
  | message occurrence => contradiction

private theorem retained_message_census (before after : RuntimeState)
    (keep : RegionalReferenceRetention) (record : ActivityOccurrence) (message : OccurrenceId)
    (fields : regionalReferenceFieldsMatch before after keep)
    (closed : regionalActivityReferencesClosed before keep record = true)
    (attached : message ∈ record.messageHandlerOccurrences) :
    after.messageWaits.filter (messageIdNamesWait message) =
      before.messageWaits.filter (messageIdNamesWait message) := by
  obtain ⟨handler, member, projected⟩ := List.mem_filterMap.mp attached
  have handlerClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp closed).2 handler member
  cases handler with
  | timer occurrence => contradiction
  | message occurrence =>
    simp only [Option.some.injEq] at projected
    subst occurrence
    rw [fields.2.2.2.1]
    exact allMatchingRetained_preserves_census _ _ _ handlerClosed

/-- REG-OWN-CLOSE-01 derives retained body and tagged-handler liveness from predecessor validity;
the field agreement names the actual operation's masks, not a successor-validity assumption. -/
theorem regional_reference_retention_preserves_activity_records (before after : RuntimeState)
    (keep : RegionalReferenceRetention)
    (fields : regionalReferenceFieldsMatch before after keep)
    (closed : regionalOwnershipClosed before keep = true)
    (valid : activityRecordsOwnLiveWork before = true) :
    activityRecordsOwnLiveWork after = true := by
  apply List.all_eq_true.mpr
  intro record member
  rw [fields.2.1] at member
  obtain ⟨prior, retained⟩ := List.mem_filter.mp member
  have recordClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp closed).1 record prior
  simp only [retained, Bool.not_true, Bool.false_or] at recordClosed
  have original := List.all_eq_true.mp valid record prior
  simp only [Bool.and_eq_true] at original ⊢
  have body := retained_activity_body_equal before after keep record fields recordClosed
  refine ⟨⟨⟨body.1.trans original.1.1.1, body.2.trans original.1.1.2⟩, ?_⟩, ?_⟩
  · apply List.all_eq_true.mpr
    intro timer attached
    obtain ⟨wait, member, witness⟩ := List.any_eq_true.mp
      (List.all_eq_true.mp original.1.2 timer attached)
    have named := (Bool.and_eq_true_iff.mp witness).1
    have survives : wait ∈ after.timerWaits.filter (timerIdNamesWait timer) := by
      rw [retained_timer_census before after keep record timer fields recordClosed attached]
      exact List.mem_filter.mpr ⟨member, named⟩
    exact List.any_eq_true.mpr ⟨wait, (List.mem_filter.mp survives).1, witness⟩
  · apply List.all_eq_true.mpr
    intro message attached
    obtain ⟨wait, member, witness⟩ := List.any_eq_true.mp
      (List.all_eq_true.mp original.2 message attached)
    have named := (Bool.and_eq_true_iff.mp witness).1
    have survives : wait ∈ after.messageWaits.filter (messageIdNamesWait message) := by
      rw [retained_message_census before after keep record message fields recordClosed attached]
      exact List.mem_filter.mpr ⟨member, named⟩
    exact List.any_eq_true.mpr ⟨wait, (List.mem_filter.mp survives).1, witness⟩

/-- Race identity and member-association uniqueness use sublists; retained wait censuses use
REG-OWN-CLOSE-01, so an independently owned wait cannot silently disappear beneath a live race. -/
theorem regional_reference_retention_preserves_event_race_associations
    (before after : RuntimeState) (keep : RegionalReferenceRetention)
    (fields : regionalReferenceFieldsMatch before after keep)
    (closed : regionalOwnershipClosed before keep = true)
    (valid : eventRaceAssociationsValid before = true) :
    eventRaceAssociationsValid after = true := by
  have races : after.eventRaces.Sublist before.eventRaces := by
    rw [fields.2.2.2.2.2]
    exact List.filter_sublist
  have unique (key : EventRace → OccurrenceId)
      (prior : before.eventRaces.all (occursOnce (fun left right =>
        decide (key right = key left)) before.eventRaces) = true) :
      after.eventRaces.all (occursOnce (fun left right =>
        decide (key right = key left)) after.eventRaces) = true :=
    occurrence_uniqueness_of_sublist _ (by intro value; simp) _ _ races prior
  have ids := unique (·.id) (List.all_eq_true.mpr fun race member => by
    have facts := List.all_eq_true.mp valid race member
    simp only [Bool.and_eq_true] at facts
    exact facts.1.1.2)
  have messages := unique (·.messageSubscriptionId) (List.all_eq_true.mpr fun race member => by
    have facts := List.all_eq_true.mp valid race member
    simp only [Bool.and_eq_true] at facts
    exact facts.1.2)
  have timers := unique (·.timerOccurrenceId) (List.all_eq_true.mpr fun race member => by
    have facts := List.all_eq_true.mp valid race member
    simp only [Bool.and_eq_true] at facts
    exact facts.2)
  apply List.all_eq_true.mpr
  intro race member
  have original := List.all_eq_true.mp valid race (races.subset member)
  have sourceClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp closed).2 race
    (races.subset member)
  have retained : keep.race race = true := by
    rw [fields.2.2.2.2.2] at member
    exact (List.mem_filter.mp member).2
  simp only [retained, Bool.not_true, Bool.false_or, Bool.and_eq_true] at sourceClosed
  have messageCensus := allMatchingRetained_preserves_refined_census before.messageWaits
    keep.message (messageIdNamesWait race.messageSubscriptionId) (eventRaceHasMessage race)
    sourceClosed.1 (by
      intro wait names
      simp only [eventRaceHasMessage, decide_eq_true_eq, Bool.and_eq_true] at names
      simp only [messageIdNamesWait, Bool.and_eq_true, beq_iff_eq]
      exact names.1)
  have timerCensus := allMatchingRetained_preserves_refined_census before.timerWaits
    keep.timer (timerIdNamesWait race.timerOccurrenceId) (eventRaceHasTimer race)
    sourceClosed.2 (by
      intro wait names
      simp only [eventRaceHasTimer, decide_eq_true_eq, Bool.and_eq_true] at names
      simp only [timerIdNamesWait, Bool.and_eq_true, beq_iff_eq]
      exact names.1)
  simp only [Bool.and_eq_true] at original ⊢
  refine ⟨⟨⟨⟨?_, ?_⟩, List.all_eq_true.mp ids race member⟩,
    List.all_eq_true.mp messages race member⟩, List.all_eq_true.mp timers race member⟩
  · rw [fields.2.2.2.1, messageCensus]
    exact original.1.1.1.1
  · rw [fields.2.2.2.2.1, timerCensus]
    exact original.1.1.1.2

end BpmnSemantics.SemanticProcess
