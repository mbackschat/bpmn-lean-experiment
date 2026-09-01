import BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

/-! # Sequential Multi-Instance conformance fixtures

The shared computed lifecycle chain for the bounded Sequential Multi-Instance conformance proof
owners. Its runtime arm is projected from the checked operation, so the chain exercises production
execution identities and the selected profile.
-/

namespace BpmnSemantics.SequentialMultiInstanceConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

/-- One accepted result submitted against whatever inner task the state currently carries.

Resolved from the record's own body rather than from a written identity, so the chain cannot drift away
from the turnover that produced it; the stale-identity refusal below supplies the other direction. -/
private def completeInner (state? : Option RuntimeState) (value : String) : Option RuntimeState := do
  let arm ← arm?
  let state ← state?
  let record ← state.activityOccurrences.head?
  let body ← activityBodyTask? record
  completeSequentialMultiInstanceInnerTask? arm state body
    [{ name := arm.data.taskDataOutputId, value := .string value }]

def afterFirstResult? : Option RuntimeState := completeInner entered? "Reviewed_1"

def afterSecondResult? : Option RuntimeState := completeInner afterFirstResult? "Reviewed_2"

def afterThirdResult? : Option RuntimeState := completeInner afterSecondResult? "Reviewed_3"

/-- The interruption arm, fired at the exact instant the committed deadline carries. -/
def interruptedAfterFirstResult? : Option RuntimeState := do
  let arm ← arm?
  let state ← afterFirstResult?
  let record ← state.activityOccurrences.head?
  let timer ← record.timerHandlerOccurrences.head?
  let deadline ← state.timerWaits.find? (timerIdNamesWait timer)
  interruptSequentialMultiInstance? arm state timer deadline.deadlineMs

end BpmnSemantics.SequentialMultiInstanceConformance
