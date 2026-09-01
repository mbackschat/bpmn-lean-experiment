import BpmnSemantics.SemanticProcess.ActivityBodyTurnover

/-! # Activity body turnover preservation

Whole-state preservation laws for the Activity body turnover operation. The transition and its
conjunct-specific laws remain in `ActivityBodyTurnover`; this owner composes them without forcing that
mechanism owner past the reviewability ceiling.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Body turnover frames Message handlers, so it cannot add another claimant for a subscription. -/
private theorem attachedMessagesUnambiguous_replacedState (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId) :
    attachedMessagesUnambiguous (replacedState state record wait body) =
      attachedMessagesUnambiguous state := by
  simp only [attachedMessagesUnambiguous, replacedState]
  apply attachedMessagesUnambiguous_of_handler_map_eq
  exact replaceBodyIn_map_of_frame
    (fun candidate => candidate.messageHandlerOccurrences) (fun _ _ => rfl)
    state.activityOccurrences record (turnoverBodyId state wait body)

/-- `AOO-TURNOVER-02`: the whole-state replacement carries a well-formed state to a well-formed state.

The state invariant now supplies the sole-body fact for the outgoing wait. Freshness needs no premise
here: the identity-bound conjunct and the definition of the next task activation derive it.

The two controller-binding premises are deliberately profile-owned. Generic body turnover cannot
infer which operation a controller means. Making those cross-family facts explicit avoids weakening
either program-aware runtime invariant into a body-blind one merely to preserve this theorem.

The intermediate state is never exposed, which is why the law can be stated at all: a decomposition
into withdraw-then-arm would pass through a state that `activityRecordsOwnLiveWork` rejects, and the
law would then be vacuous on its own hypothesis. -/
theorem replacedState_preserves_wellFormed (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (record : ActivityOccurrence) (wait : UserTaskWait)
    (body : OccurrenceId)
    (unique : state.waits.filter (taskIdNamesWait body) = [wait])
    (recordMem : record ∈ state.activityOccurrences)
    (recordBody : activityBodyTask? record = some body)
    (controllerBindingPreserved : sequentialMultiInstanceProgramBindingsValid program
      (replacedState state record wait body) = true)
    (parallelBindingPreserved : parallelMultiInstanceProgramBindingsValid program
      (replacedState state record wait body) = true)
    (wellFormed : runtimeStateWellFormed program instanceId state = true) :
    runtimeStateWellFormed program instanceId (replacedState state record wait body) = true := by
  have waitInFilter : wait ∈ state.waits.filter (taskIdNamesWait body) := by
    rw [unique]; simp
  have waitMem : wait ∈ state.waits := (List.mem_filter.mp waitInFilter).1
  have namesWait : taskIdNamesWait body wait = true := (List.mem_filter.mp waitInFilter).2
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed ⊢
  have existing := wellFormed.1
  have claimsUnique := wellFormed.2.1.1
  have retentionValid := wellFormed.2.1.2
  have snapshotValid := wellFormed.2.2
  obtain ⟨h17, lifecycle⟩ := existing
  obtain ⟨h16, notExhausted⟩ := h17
  obtain ⟨h15, controllerIds⟩ := h16
  obtain ⟨h14, parallelBindings⟩ := h15
  obtain ⟨h13, bindings⟩ := h14
  obtain ⟨h12, owned⟩ := h13
  obtain ⟨h11, activityIdentities⟩ := h12
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
  have fresh : ∀ candidate ∈ state.waits,
      userTaskWaitKeyMatches (turnoverWait state wait) candidate = false := by
    intro candidate mem
    have boundParts := bounds
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at boundParts
    have candidateBound := (List.all_eq_true.mp boundParts.1.1) candidate mem
    simp only [decide_eq_true_eq] at candidateBound
    by_cases keyed : userTaskWaitKeyMatches (turnoverWait state wait) candidate = true
    · simp only [userTaskWaitKeyMatches, turnoverWait, Bool.and_eq_true,
        decide_eq_true_eq] at keyed
      rw [← keyed.1.2, ← keyed.2] at candidateBound
      omega
    · simp only [Bool.not_eq_true] at keyed
      exact keyed
  have soleBody : ∀ other ∈ state.activityOccurrences,
      sameActivityOccurrence other record = false → recordBodyExcludesWait wait other = true :=
    recordBodyExcludesWait_of_activityBodyClaimsUnique state record wait body claimsUnique
      recordMem recordBody namesWait
  have claimsAfter : activityBodyClaimsUnique
      (replacedState state record wait body).activityOccurrences = true := by
    apply replaceBodyIn_preserves_activityBodyClaimsUnique state record
      (turnoverBodyId state wait body) claimsUnique activityIdentities recordMem
    intro chosen _ other otherMem _ _
    apply activityBodyClaimsDisjoint_userTask_of_not_mem
    intro incomingMem
    obtain ⟨candidate, candidateMem, hit⟩ :=
      activityBodyTaskClaim_has_live_wait state other (turnoverBodyId state wait body)
        bodies otherMem incomingMem
    have keyed := turnoverBodyId_hit_is_turnover_key state wait body namesWait candidate hit
    rw [fresh candidate candidateMem] at keyed
    exact Bool.noConfusion keyed
  have positionAfter : runtimePositionValid program instanceId
      (replacedState state record wait body) = true := by
    rw [runtimePositionValid_replacedState]
    exact position
  have racesAfter : eventRaceAssociationsValid (replacedState state record wait body) = true := by
    rw [eventRaceAssociationsValid_replacedState]
    exact races
  have incidentsAfter : effectIncidentAssociationsValid
      (replacedState state record wait body) = true := by
    rw [effectIncidentAssociationsValid_replacedState]
    exact incidents
  have ownersAfter := waitOwnersLive_replacedState state record wait body waitMem owners
  have identitiesAfter := waitIdentitiesUnique_replacedState state record wait body fresh identities
  have boundsAfter := runtimeStateIdentityBound_replacedState state record wait body bounds
  have declarationsAfter := waitDeclarationsValid_replacedState program instanceId state record wait
    body waitMem declarations
  have hiddenAfter : hiddenRecordDeclarationsValid program
      (replacedState state record wait body) = true := by
    rw [hiddenRecordDeclarationsValid_replacedState]
    exact hidden
  have orderAfter := canonicalCollectionOrder_replacedState state record wait body order
  have bodiesAfter := activityRecordsOwnLiveWork_replacedState state record wait body unique
    fresh soleBody bodies
  have timersAfter : attachedTimersUnambiguous (replacedState state record wait body) = true := by
    rw [attachedTimersUnambiguous_replacedState]
    exact timersUnambiguous
  have messagesAfter : attachedMessagesUnambiguous (replacedState state record wait body) = true := by
    rw [attachedMessagesUnambiguous_replacedState]
    exact messagesUnambiguous
  have activityIdentitiesAfter : activityIdentitiesUnique
      (replacedState state record wait body) = true := by
    rw [activityIdentitiesUnique_replacedState]
    exact activityIdentities
  have ownedAfter : controllersOwnLiveActivity (replacedState state record wait body) = true := by
    rw [controllersOwnLiveActivity_replacedState]
    exact owned
  have controllerIdsAfter : controllerIdentitiesUnique
      (replacedState state record wait body) = true := by
    rw [controllerIdentitiesUnique_replacedState]
    exact controllerIds
  have notExhaustedAfter : controllersNotExhausted
      (replacedState state record wait body) = true := by
    rw [controllersNotExhausted_replacedState]
    exact notExhausted
  have lifecycleAfter :
      (match (replacedState state record wait body).control with
       | .notStarted => notStartedStateEmpty (replacedState state record wait body)
       | _ => true) = true := by
    -- A live wait excludes `notStarted`; turnover frames the control field.
    have sameControl : (replacedState state record wait body).control = state.control := rfl
    rw [sameControl]
    cases hc : state.control with
    | notStarted =>
      exfalso
      rw [hc] at lifecycle
      simp only [notStartedStateEmpty, Bool.and_eq_true, List.isEmpty_iff] at lifecycle
      obtain ⟨lifecycle, _notPending⟩ := lifecycle
      obtain ⟨lifecycle, _snapshotRetentionsEmpty⟩ := lifecycle
      obtain ⟨lifecycle, _retentionsEmpty⟩ := lifecycle
      obtain ⟨lifecycle, _parallelEmpty⟩ := lifecycle
      obtain ⟨lifecycle, _activitiesEmpty⟩ := lifecycle
      obtain ⟨lifecycle, _callsEmpty⟩ := lifecycle
      obtain ⟨lifecycle, _racesEmpty⟩ := lifecycle
      obtain ⟨lifecycle, _selectionsEmpty⟩ := lifecycle
      obtain ⟨lifecycle, _incidentsEmpty⟩ := lifecycle
      obtain ⟨lifecycle, _effectsEmpty⟩ := lifecycle
      obtain ⟨lifecycle, _timersEmpty⟩ := lifecycle
      obtain ⟨waitsEmpty, _messagesEmpty⟩ := lifecycle
      exact List.ne_nil_of_mem waitMem waitsEmpty
    | running _ => rfl
    | completed _ => rfl
    | cancelled _ => rfl
  have after2 := And.intro positionAfter racesAfter
  have after3 := And.intro after2 incidentsAfter
  have after4 := And.intro after3 ownersAfter
  have after5 := And.intro after4 identitiesAfter
  have after6 := And.intro after5 boundsAfter
  have after7 := And.intro after6 declarationsAfter
  have after8 := And.intro after7 hiddenAfter
  have after9 := And.intro after8 orderAfter
  have after10 := And.intro after9 bodiesAfter
  have after11 := And.intro after10 timersAfter
  have after12 := And.intro after11 messagesAfter
  have after13 := And.intro after12 activityIdentitiesAfter
  have after14 := And.intro after13 ownedAfter
  have after15 := And.intro after14 controllerBindingPreserved
  have after16 := And.intro after15 parallelBindingPreserved
  have after17 := And.intro after16 controllerIdsAfter
  have after18 := And.intro after17 notExhaustedAfter
  have retentionAfter : compensationActivityRetentionStateValid program
      (replacedState state record wait body) = true := by
    change compensationActivityRetentionStateValid program state = true
    exact retentionValid
  have snapshotAfter : compensationEventSubProcessSnapshotStateValid program
      (replacedState state record wait body) = true := by
    change compensationEventSubProcessSnapshotStateValid program state = true
    exact snapshotValid
  exact ⟨⟨after18, lifecycleAfter⟩,
    ⟨⟨claimsAfter, retentionAfter⟩, snapshotAfter⟩⟩

/-- The resolver answers with the state rewrite exactly when the state holds a record naming a unique
live body.

Stated so the preservation law above applies to the operation a caller actually invokes, rather than
to the rewrite it delegates to. The membership hypothesis is the guard's, not the law's: `replacedState`
is well-formedness-preserving without it, and refusing an unheld record keeps the operation's domain
identical to the independently written core's. -/
theorem replaceActivityBodyTask_eq_replacedState (state : RuntimeState)
    (record : ActivityOccurrence) (wait : UserTaskWait) (body : OccurrenceId)
    (bodyOfRecord : activityBodyTask? record = some body)
    (held : state.activityOccurrences.any (fun candidate => sameActivityOccurrence candidate record)
      = true)
    (unique : state.waits.filter (taskIdNamesWait body) = [wait]) :
    replaceActivityBodyTask state record = some (replacedState state record wait body) := by
  simp [replaceActivityBodyTask, bodyOfRecord, held, unique]

end BpmnSemantics.SemanticProcess
