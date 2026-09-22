import BpmnSemantics.SemanticProcess.InternalTimerTaskPreparation
import BpmnSemantics.SemanticProcess.InternalDataArmingCommutation

/-! Exact Timer-task patch equality reuses the established collection insertion laws. The three
issuers remain independent, so task separation cannot stand in for Timer separation.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem makeInternalTimerTaskPatch_commutes
    (program : Program) (state : RuntimeState)
    (left right : InternalTimerTaskContract) (leftOwner rightOwner : ScopeOccurrenceId)
    (instanceId : SemanticId) (leftProcess rightProcess : ProcessId)
    (leftOrigin rightOrigin : BpmnSequenceFlowOrigin)
    (differentTasks : left.task.id ≠ right.task.id)
    (differentTimers : left.timer.elementId ≠ right.timer.elementId)
    (taskOrdered : orderedBy activationBefore state.activations = true)
    (timerOrdered : orderedBy timerActivationBefore state.timerActivations = true)
    (activityOrdered : orderedBy activationBefore state.activityActivations = true) :
    let leftPatch := makeInternalTimerTaskPatch program state left leftOwner instanceId leftProcess leftOrigin
    let rightPatch := makeInternalTimerTaskPatch program state right rightOwner instanceId rightProcess rightOrigin
    applyInternalTimerTaskPatch (applyInternalTimerTaskPatch state leftPatch) rightPatch =
      applyInternalTimerTaskPatch (applyInternalTimerTaskPatch state rightPatch) leftPatch := by
  have differentValues : left.task.id.value ≠ right.task.id.value :=
    fun same => differentTasks (taskDefinitionId_eq_of_value_eq _ _ same)
  dsimp only
  simp only [applyInternalTimerTaskPatch, makeInternalTimerTaskPatch, applyInternalArmingPatch]
  congr 1
  · exact removeToken_commutes state.tokens left.input right.input leftOwner rightOwner
  · exact insertUserTaskWait_commutes _ _ (Ne.symm differentTasks) state.waits
  · exact insertTimerWait_commutes _ _ (Ne.symm differentTimers) state.timerWaits
  · exact insertActivityOccurrence_commutes_of_distinct_element _ _
      (Ne.symm differentValues) state.activityOccurrences
  · exact setActivationCount_commutes_of_ordered _ _ _ _ differentTasks _ taskOrdered
  · exact setTimerActivationCount_commutes_of_ordered _ _ _ _ differentTimers _ timerOrdered
  · exact setActivationCount_commutes_of_ordered _ _ _ _ differentTasks _ activityOrdered

end BpmnSemantics.SemanticProcess.InternalCommutation
