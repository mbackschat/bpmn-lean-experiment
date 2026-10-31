module

public import BpmnSemantics.SemanticProcess.RuntimeState
import all BpmnSemantics.SemanticProcess.RuntimeState
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Parallel Multi-Instance entry order fact

This module isolates the Activity-occurrence comparator fact used by nonempty shared entry preservation so that the preservation owner retains reviewable growth headroom.
-/
run_meta privateEquations `BpmnSemantics.SemanticProcess #[`activityOccurrenceBefore]

public section

namespace BpmnSemantics.SemanticProcess

theorem activityOccurrenceBefore_asymm (left right : ActivityOccurrence) :
    activityOccurrenceBefore left right = true →
      activityOccurrenceBefore right left = false := by
  by_cases processEq : left.processInstanceId.value = right.processInstanceId.value
  · by_cases activityEq : left.activityElementId.value = right.activityElementId.value
    · simp [activityOccurrenceBefore, processEq, activityEq]
      exact Nat.le_of_lt
    · simp [activityOccurrenceBefore, processEq, activityEq, Ne.symm activityEq]
      exact Std.le_of_lt
  · simp [activityOccurrenceBefore, processEq, Ne.symm processEq]
    exact Std.le_of_lt

end BpmnSemantics.SemanticProcess
