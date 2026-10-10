import BpmnSemantics.SemanticProcess.WaitActivation
import BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageLaws

/-! Retained Task and effect counter replacements preserve canonical order and unique name keys.
Serial and structured composition consume these storage facts at actual reached command boundaries. -/

namespace BpmnSemantics.SemanticProcess

theorem task_counter_storage (values : List TaskActivation) (taskId : TaskDefinitionId) (count : Nat)
    (ordered : orderedBy activationBefore values = true) (unique : (values.map (·.taskId)).Nodup) :
    orderedBy activationBefore (setActivationCount values taskId count) = true ∧
      ((setActivationCount values taskId count).map (·.taskId)).Nodup := by
  simpa only [setActivationCount, insertTaskActivation_eq_canonicalInsertBy] using
    orderedBy_uniqueKeys_replace TaskActivation.taskId activationBefore
      (stringKeyBefore_asymm (fun row : TaskActivation => row.taskId.value))
      (stringKeyBefore_compose (fun row : TaskActivation => row.taskId.value))
      { taskId, count } (fun row => decide (row.taskId ≠ taskId)) values ordered unique
      (fun row kept => by simpa only [decide_eq_true_eq] using kept)

theorem effect_counter_storage (values : List EffectActivation) (elementId : NodeId) (count : Nat)
    (ordered : orderedBy effectActivationBefore values = true) (unique : (values.map (·.elementId)).Nodup) :
    orderedBy effectActivationBefore (setEffectActivationCount values elementId count) = true ∧
      ((setEffectActivationCount values elementId count).map (·.elementId)).Nodup := by
  exact orderedBy_uniqueKeys_replace EffectActivation.elementId effectActivationBefore
    (stringKeyBefore_asymm (fun row : EffectActivation => row.elementId.value))
    (stringKeyBefore_compose (fun row : EffectActivation => row.elementId.value))
    { elementId, count } (fun row => decide (row.elementId ≠ elementId)) values ordered unique
    (fun row kept => by simpa only [decide_eq_true_eq] using kept)

end BpmnSemantics.SemanticProcess
