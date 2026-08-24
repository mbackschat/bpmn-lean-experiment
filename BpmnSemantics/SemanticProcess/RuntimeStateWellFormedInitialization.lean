import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.MessageStartAdmission
import BpmnSemantics.SemanticProcess.TimerStartAdmission

/-! # Runtime-state well-formedness at initialization

This module owns `RSI-OBL-01` and `RSI-OBL-02`: that the empty state and every admitted start result
satisfy `runtimeStateWellFormed`.

Initialization is proved before preservation and before any gate, and the order is not stylistic. A
predicate installed as a precondition while some reachable state violated it would turn a currently
accepted transition into a refusal, which is a semantic change to admitted models. Establishing that
no admitted start violates it, and then that no transition breaks it, is what makes a later gate able
to reject only states that were never reachable.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- `RSI-OBL-01`. On the empty state, well-formedness reduces exactly to the position predicate the
account already had.

The hypothesis is `runtimePositionValid` rather than the program facts it decides, because those are
private to the projection owner and reproducing them here would be a second copy of a fact with an
existing owner. What this theorem adds is the other direction: every conjunct this slice introduces
holds vacuously on the empty state, so a start that satisfies the old predicate satisfies the new
one and no admitted model becomes unstartable. -/
theorem initialState_wellFormed (program : Program) (instanceId : SemanticId)
    (position : runtimePositionValid program instanceId initialState = true) :
    runtimeStateWellFormed program instanceId initialState = true := by
  unfold runtimeStateWellFormed
  rw [position]
  simp [initialState, notStartedStateEmpty, waitOwnersLive, waitIdentitiesUnique,
    waitDeclarationsValid, hiddenRecordDeclarationsValid, canonicalCollectionOrder, orderedBy,
    eventRaceAssociationsValid, effectIncidentAssociationsValid, runtimeStateIdentityBound,
    activityRecordsOwnLiveWork, attachedTimersUnambiguous, activityIdentitiesUnique,
    controllersOwnLiveActivity, sequentialMultiInstanceControllerProgramBindingsValid,
    controllerIdentitiesUnique, controllersNotExhausted]

/-- `RSI-OBL-02`. Every state the program start constructor admits is well-formed.

One theorem covers all three start kinds because `admitMessageStart?` and `admitTimerStart?` both
produce their state through `runningProgramStartState?` rather than building one of their own; the
corollaries below name that routing instead of repeating this proof. A start kind that ever
constructed its state directly would not be covered by this theorem, and would need its own arm
rather than inheriting this one. -/
theorem runningProgramStartState_wellFormed (program : Program) (instanceId : SemanticId)
    (initialVariables : List VariableBinding) (start : RuntimeState)
    (built : runningProgramStartState? program instanceId initialVariables = some start)
    (position : runtimePositionValid program instanceId start = true) :
    runtimeStateWellFormed program instanceId start = true := by
  unfold runningProgramStartState? at built
  simp only [Option.bind_eq_bind, Option.bind_eq_some_iff, Option.pure_def, Option.some.injEq] at built
  obtain ⟨_, _, rfl⟩ := built
  unfold runtimeStateWellFormed
  rw [position]
  simp [runningStartState, initialState, waitOwnersLive, waitIdentitiesUnique,
    waitDeclarationsValid, hiddenRecordDeclarationsValid, canonicalCollectionOrder, orderedBy,
    eventRaceAssociationsValid, effectIncidentAssociationsValid, runtimeStateIdentityBound,
    activityRecordsOwnLiveWork, attachedTimersUnambiguous, activityIdentitiesUnique,
    controllersOwnLiveActivity, sequentialMultiInstanceControllerProgramBindingsValid,
    controllerIdentitiesUnique, controllersNotExhausted]

/-- `RSI-OBL-02` for the Message start kind. -/
theorem admitMessageStart_wellFormed (program : Program) (state : RuntimeState)
    (processId instanceId startEventId : SemanticId) (channel : MessageChannel)
    (start : RuntimeState)
    (admitted : admitMessageStart? program state processId instanceId startEventId channel
      = some start)
    (position : runtimePositionValid program instanceId start = true) :
    runtimeStateWellFormed program instanceId start = true := by
  unfold admitMessageStart? at admitted
  split at admitted
  · split at admitted
    · exact runningProgramStartState_wellFormed program instanceId [] start admitted position
    · exact absurd admitted (by simp)
  all_goals exact absurd admitted (by simp)


/-- `RSI-OBL-02` for the Timer start kind. -/
theorem admitTimerStart_wellFormed (program : Program) (state : RuntimeState)
    (processId instanceId startEventId : SemanticId) (start : RuntimeState)
    (admitted : admitTimerStart? program state processId instanceId startEventId = some start)
    (position : runtimePositionValid program instanceId start = true) :
    runtimeStateWellFormed program instanceId start = true := by
  unfold admitTimerStart? at admitted
  split at admitted
  · split at admitted
    · exact runningProgramStartState_wellFormed program instanceId [] start admitted position
    · exact absurd admitted (by simp)
  all_goals exact absurd admitted (by simp)

end BpmnSemantics.SemanticProcess
