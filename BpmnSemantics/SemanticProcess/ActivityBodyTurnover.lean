import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.CollectionOrder

/-! # Activity body turnover

Replacing what an Activity occurrence owns without replacing the occurrence. The contract is
[the approved proposal](../../docs/ACTIVITY-BODY-TURNOVER-PROPOSAL.md), rules `AOO-TURNOVER-02`
through `AOO-TURNOVER-04`.

The operation is whole-state by requirement rather than convenience. Between withdrawing the outgoing
body and arming the incoming one there is a state whose record names a wait that is not live, which
`activityRecordsOwnLiveWork` rejects; exposing that intermediate would make the preservation law below
vacuous on its own hypothesis, since no well-formed pre-state would reach it.

No registered profile admits a construct that drives this. It is the representation a later repetition
capsule defines transitions over, and it is introduced here because approving it is what makes the
ownership record's value checkable: after one replacement a body's activation and its attached
handler's diverge, and that pair is what every join this account retired was keyed on.

The frame result is the one to read first. Replacement is a `List.map` that rewrites one field, so the
canonical order key — Process instance, Activity element, activation — is untouched by construction
rather than restored by a re-sort, and `RSI-ORDER-01` follows from the frame rather than needing its
own argument.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Everything about a record that replacement must leave alone.

Bundled rather than stated field by field so one equation carries the whole `AOO-TURNOVER-03`
obligation, and so the canonical order key is visibly a projection of it. -/
def activityOccurrenceFrame (record : ActivityOccurrence) :
    SemanticId × NodeId × Nat × ScopeOccurrenceId × List OccurrenceId :=
  (record.processInstanceId, record.activityElementId, record.activation,
    record.owner, record.attachedTimers)

/-- Rewrites one record's body, leaving every other record and every framed field alone. -/
def replaceBodyIn (records : List ActivityOccurrence) (target : ActivityOccurrence)
    (incoming : OccurrenceId) : List ActivityOccurrence :=
  records.map fun candidate =>
    if sameActivityOccurrence candidate target then
      { candidate with body := .userTask incoming }
    else candidate

/-- Replaces a task-bodied Activity occurrence's body with a fresh occurrence of the same element.

Answers `none` rather than a repaired state when the record names no unique live task body, which is
the only shape this operation is defined on. A caller that continued would arm a second body against a
record still naming the first.

The incoming wait carries the outgoing wait's definition and output because both describe the same
program element, so nothing here reads the `Program` and the operation stays total over runtime state
alone. A capsule that varies those per iteration supplies them at its own boundary.

The Activity's own counter is deliberately untouched: the occurrence is not re-armed, so advancing it
would mint an identity no record claims. That is `AOO-TURNOVER-04`, and it is the whole source of the
divergence this capsule exists to make checkable. -/
def replaceActivityBodyTask (state : RuntimeState) (record : ActivityOccurrence) :
    Option RuntimeState :=
  match activityBodyTask? record with
  | none => none
  | some body =>
    match state.waits.filter (taskIdNamesWait body) with
    | [wait] =>
      let activation := activationCount state wait.task.id + 1
      let incoming : OccurrenceId :=
        { processInstanceId := body.processInstanceId
          elementId := body.elementId
          activation }
      some
        { state with
          waits := insertUserTaskWait { wait with activation }
            (state.waits.filter fun candidate => !taskIdNamesWait body candidate)
          activations := setActivationCount state.activations wait.task.id activation
          activityOccurrences := replaceBodyIn state.activityOccurrences record incoming }
    | _ => none

/-- `AOO-TURNOVER-03`: replacement preserves every record's identity, owner, and attached handlers.

Quantified over the whole collection rather than the rewritten record alone, which is what makes it
usable: the canonical order key is a projection of the frame, so order preservation is a corollary
instead of a separate induction, and a handler armed before a replacement is the same handler
occurrence after it with its deadline unchanged. -/
theorem replaceBodyIn_preserves_frame (records : List ActivityOccurrence)
    (target : ActivityOccurrence) (incoming : OccurrenceId) :
    (replaceBodyIn records target incoming).map activityOccurrenceFrame =
      records.map activityOccurrenceFrame := by
  induction records with
  | nil => rfl
  | cons current rest ih =>
    simp only [replaceBodyIn, List.map_cons, List.map_map] at *
    by_cases h : sameActivityOccurrence current target = true
    · simp [h, activityOccurrenceFrame, ih]
    · simp [h, ih]

/-- Replacement changes the length of no collection it rewrites. -/
theorem replaceBodyIn_length (records : List ActivityOccurrence)
    (target : ActivityOccurrence) (incoming : OccurrenceId) :
    (replaceBodyIn records target incoming).length = records.length := by
  simp [replaceBodyIn]

end BpmnSemantics.SemanticProcess
