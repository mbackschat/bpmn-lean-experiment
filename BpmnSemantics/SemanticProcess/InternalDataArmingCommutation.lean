import BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeStateEntryOrder
import BpmnSemantics.SemanticProcess.InternalArmingOrder

/-! # Exact composed data-arming patch commutation

Fixed patches share one predecessor while task and Activity issuers retain independent counters.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem activityOccurrenceBefore_chain (left right : ActivityOccurrence) :
    activityOccurrenceBefore left right =
      armingLexStep left.processInstanceId.value right.processInstanceId.value
        (armingLexStep left.activityElementId.value right.activityElementId.value
          (decide (left.activation < right.activation))) := rfl

private theorem activityOccurrenceBefore_trans (a b c : ActivityOccurrence) :
    activityOccurrenceBefore a b = true → activityOccurrenceBefore b c = true →
      activityOccurrenceBefore a c = true := by
  rw [activityOccurrenceBefore_chain, activityOccurrenceBefore_chain,
    activityOccurrenceBefore_chain]
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  simp only [decide_eq_true_eq]
  exact Nat.lt_trans

private theorem string_total (left right : String) :
    left ≠ right → left < right ∨ right < left := by
  intro different
  by_cases before : left < right
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

private theorem activityOccurrenceBefore_comparable (left right : ActivityOccurrence)
    (different : left.activityElementId.value ≠ right.activityElementId.value) :
    activityOccurrenceBefore left right = true ∨
      activityOccurrenceBefore right left = true := by
  rw [activityOccurrenceBefore_chain, activityOccurrenceBefore_chain]
  apply armingLexStep_comparable string_total
  simpa [armingLexStep, different, Ne.symm different] using
    string_total left.activityElementId.value right.activityElementId.value different

/-- Distinct Activity elements prevent equal-key insertion from retaining an order-dependent body. -/
theorem insertActivityOccurrence_commutes_of_distinct_element (left right : ActivityOccurrence)
    (different : left.activityElementId.value ≠ right.activityElementId.value)
    (records : List ActivityOccurrence) :
    insertActivityOccurrence left (insertActivityOccurrence right records) =
      insertActivityOccurrence right (insertActivityOccurrence left records) := by
  simp only [insertActivityOccurrence_eq_canonicalInsertBy]
  exact canonicalInsertBy_commutes_of_strict_order activityOccurrenceBefore
    activityOccurrenceBefore_asymm activityOccurrenceBefore_trans left right
    (activityOccurrenceBefore_comparable left right different) records

theorem makeInternalDataArmingPatch_commutes
    (program : Program) (state : RuntimeState)
    (left right : InternalDataArmingContract) (leftOwner rightOwner : ScopeOccurrenceId)
    (leftOrigin rightOrigin : BpmnSequenceFlowOrigin) (leftSource rightSource : VariableBinding)
    (different : left.taskId ≠ right.taskId)
    (taskOrdered : orderedBy activationBefore state.activations = true)
    (activityOrdered : orderedBy activationBefore state.activityActivations = true) :
    let leftPatch := makeInternalDataArmingPatch program state left leftOwner leftOrigin leftSource
    let rightPatch := makeInternalDataArmingPatch program state right rightOwner rightOrigin rightSource
    applyInternalDataArmingPatch (applyInternalDataArmingPatch state leftPatch) rightPatch =
      applyInternalDataArmingPatch (applyInternalDataArmingPatch state rightPatch) leftPatch := by
  have valuesDifferent : left.taskId.value ≠ right.taskId.value :=
    fun same => different (taskDefinitionId_eq_of_value_eq _ _ same)
  dsimp only
  simp only [applyInternalDataArmingPatch, makeInternalDataArmingPatch,
    applyInternalArmingPatch, addActivityOccurrenceVariableScope]
  congr 1
  · exact removeToken_commutes state.tokens left.input right.input leftOwner rightOwner
  · exact insertUserTaskWait_commutes _ _ (Ne.symm different) state.waits
  · exact insertActivityOccurrence_commutes_of_distinct_element _ _
      (Ne.symm valuesDifferent) state.activityOccurrences
  · congr 1
    apply insertActivityVariableScope_commutes
    intro same
    have owners := LocalDataOwner.activityOccurrence.inj same
    exact valuesDifferent (congrArg (fun owner => owner.activityElementId.value) owners).symm
  · exact setActivationCount_commutes_of_ordered _ _ _ _ different _ taskOrdered
  · exact setActivationCount_commutes_of_ordered _ _ _ _ different _ activityOrdered

end BpmnSemantics.SemanticProcess.InternalCommutation
