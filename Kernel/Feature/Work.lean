module

public import Kernel.Hooks

/-! # Work: what an Activity does

Owns matching on `Work`. A task without work passes its token through; a User Task opens a wait that a
`completeUserTask` command closes, writing the submitted values from the task's scope outward.
-/

public section

namespace Kernel.Feature.Work

def arriveActivity (_ : Ctx) (header : Header) (payload : ActivityPayload) (arrival : Arrival) (state : State) :
    Outcome :=
  match payload.work with
  | .none => .ok (state.emit payload.envelope.outgoing arrival.scope)
  | .manual => .ok (state.emit payload.envelope.outgoing arrival.scope)
  | .user task =>
    let groups := task.candidateGroups.filterMap fun
      | .literal group => some group
      | .expression _ => none
    .ok (state.openItem (.userTask { name := task.name, candidateGroups := groups, formFields := task.formFields })
      header.id arrival.scope)
  | .receive _ => .error (.unsupported "receive-task")
  | .service _ => .error (.unsupported "service-task")
  | .send _ => .error (.unsupported "send-task")
  | .script _ => .error (.unsupported "script-task")
  | .rule _ => .error (.unsupported "business-rule-task")
  | .call _ => .error (.unsupported "call-activity")

def completeUserTask (_ : Ctx) (_ : Header) (payload : ActivityPayload) (item : OpenItem)
    (values : List (String × Value)) (state : State) : Outcome :=
  let written := values.foldl (fun state (name, value) => state.write item.scope name value) state
  .ok ((written.closeItem item.id).emit payload.envelope.outgoing item.scope)

end Kernel.Feature.Work
