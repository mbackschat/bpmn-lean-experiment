import BpmnSemantics.SemanticProcess.ActivityBodyTurnover

/-! # Activity body turnover preservation

Whole-state preservation laws for the Activity body turnover operation. The transition and its
conjunct-specific laws remain in `ActivityBodyTurnover`; this owner composes them without forcing that
mechanism owner past the reviewability ceiling.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- `AOO-TURNOVER-02`: the whole-state replacement carries a well-formed state to a well-formed state.

`soleBody` says no *other* record names the wait being withdrawn. Nothing refuses two records naming
one body, so a well-formed pre-state can hold a second claimant whose body this transition removes.
The parent account carries the same premise explicitly for its body-side lookup determinism, and it
reappears here as a transition obligation. Freshness needs no premise here: the identity-bound
conjunct and the definition of the next task activation derive it.

The intermediate state is never exposed, which is why the law can be stated at all: a decomposition
into withdraw-then-arm would pass through a state that `activityRecordsOwnLiveWork` rejects, and the
law would then be vacuous on its own hypothesis. -/
theorem replacedState_preserves_wellFormed (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (record : ActivityOccurrence) (wait : UserTaskWait)
    (body : OccurrenceId)
    (unique : state.waits.filter (taskIdNamesWait body) = [wait])
    (soleBody : ∀ other ∈ state.activityOccurrences,
      sameActivityOccurrence other record = false → recordBodyNamesWait wait other = false)
    (wellFormed : runtimeStateWellFormed program instanceId state = true) :
    runtimeStateWellFormed program instanceId (replacedState state record wait body) = true := by
  have waitInFilter : wait ∈ state.waits.filter (taskIdNamesWait body) := by
    rw [unique]; simp
  have waitMem : wait ∈ state.waits := (List.mem_filter.mp waitInFilter).1
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨position, races⟩, incidents⟩, owners⟩, identities⟩,
    bounds⟩, declarations⟩, hidden⟩, order⟩, bodies⟩, attached⟩, unique'⟩, owned⟩,
    controllerIds⟩, notExhausted⟩, lifecycle⟩ := wellFormed
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
  refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨?_, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩, ?_⟩
  · rw [runtimePositionValid_replacedState]; exact position
  · rw [eventRaceAssociationsValid_replacedState]; exact races
  · rw [effectIncidentAssociationsValid_replacedState]; exact incidents
  · exact waitOwnersLive_replacedState state record wait body waitMem owners
  · exact waitIdentitiesUnique_replacedState state record wait body fresh identities
  · exact runtimeStateIdentityBound_replacedState state record wait body bounds
  · exact waitDeclarationsValid_replacedState program instanceId state record wait body waitMem
      declarations
  · rw [hiddenRecordDeclarationsValid_replacedState]; exact hidden
  · exact canonicalCollectionOrder_replacedState state record wait body order
  · exact activityRecordsOwnLiveWork_replacedState state record wait body unique
      fresh soleBody bodies
  · rw [attachedTimersUnambiguous_replacedState]; exact attached
  · rw [activityIdentitiesUnique_replacedState]; exact unique'
  · rw [controllersOwnLiveActivity_replacedState]; exact owned
  · rw [controllerIdentitiesUnique_replacedState]; exact controllerIds
  · rw [controllersNotExhausted_replacedState]; exact notExhausted
  · -- The lifecycle clause. A live wait exists, so the pre-state cannot have been `notStarted`, and
    -- the control field itself is untouched.
    have sameControl : (replacedState state record wait body).control = state.control := rfl
    rw [sameControl]
    cases hc : state.control with
    | notStarted =>
      exfalso
      rw [hc] at lifecycle
      simp only [notStartedStateEmpty, Bool.and_eq_true, List.isEmpty_iff] at lifecycle
      exact List.ne_nil_of_mem waitMem lifecycle.1.1.1.1.1.1.1.1.1
    | running _ => rfl
    | completed _ => rfl
    | cancelled _ => rfl

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
