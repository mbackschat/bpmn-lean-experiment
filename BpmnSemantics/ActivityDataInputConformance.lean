import BpmnSemantics.SemanticProcess.Data

/-! # Activity data-input conformance

Kernel-decided boundary cases for the bounded Activity data-input account. The owner-discriminator cases are established before the transition family so an equal-coordinate effect occurrence cannot become an Activity-local owner by structural coincidence.
-/

namespace BpmnSemantics.ActivityDataInputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def processInstanceId : SemanticId := ⟨"Instance_1"⟩

private def effectOccurrenceId : EffectOccurrenceId :=
  { processInstanceId
    elementId := ⟨"UserTask_Review"⟩
    activation := 1 }

private def activityOccurrenceId : ActivityOccurrenceId :=
  { processInstanceId
    activityElementId := ⟨"UserTask_Review"⟩
    activation := 1 }

private def effectOwner : LocalDataOwner :=
  .effectOccurrence effectOccurrenceId

private def activityOwner : LocalDataOwner :=
  .activityOccurrence activityOccurrenceId

theorem equalCoordinateOwnersRemainDistinct : effectOwner ≠ activityOwner := by
  decide +kernel

theorem crossFamilyOwnersDoNotMatch :
    localDataOwnerMatches effectOwner activityOwner = false := by
  decide +kernel

private def activityScope : ActivityVariableScope :=
  { owner := activityOwner, bindings := [] }

private def mixedVariables : ScopedVariables :=
  addActivityVariableScope
    { process := { bindings := [] }
      activities := [activityScope] }
    effectOccurrenceId
    []

theorem effectCompletionPreservesEqualCoordinateActivityScope :
    completeActivityVariableScope mixedVariables effectOccurrenceId [] (.success []) =
      some
        { process := { bindings := [] }
          activities := [activityScope] } := by
  decide +kernel

end BpmnSemantics.ActivityDataInputConformance
