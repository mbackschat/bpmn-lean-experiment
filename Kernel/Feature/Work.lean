module

public import Kernel.Hooks

/-! # Work: what an Activity does

Owns matching on `Work`. An Activity's input mappings are evaluated once, on arrival, against the variables visible
from its scope occurrence; they become the Activity's local values (a User Task's published inputs, an effect's
arguments). A task without work passes its token through; a User Task, a Service Task's effect and a Receive Task's
Message open one item each, and the input that closes the item completes the Activity: its output mappings write
outward, its attached items are disarmed and its outgoing flows receive tokens.

An Activity with boundaries signals `arm` for the item it opened; a BPMN error an effect reports is raised from the
Activity after its outputs are written and its item and attached items are removed, so the catcher, which may be a
boundary of this Activity, finds nothing of the Activity left to interrupt.
-/

public section

namespace Kernel.Feature.Work

/-- Open `kind` for the Activity and arm its boundaries on the new item. -/
def openWork (kind : OpenKind) (header : Header) (payload : ActivityPayload) (scope : ScopeOccurrenceId)
    (state : State) : State :=
  let (state, id) := state.openAttached kind header.id scope none
  if payload.envelope.boundaries.isEmpty then state else state.signal (.arm id header.id scope)

/-- The Message a Receive Task waits for. An expression-named Message needs the host evaluator. -/
def channel (trigger : MessageTrigger) : Except Failure MessageChannel :=
  let address (messageId : Option String) : MessageChannel :=
    { messageId, interfaceRef := trigger.interfaceRef, operationRef := trigger.operationRef }
  match trigger.name with
  | none => .ok (address none)
  | some (.literal name) => .ok (address (some name))
  | some (.expression _) => .error (.unsupported "receive-message-expression")

/-- The outputs a completion writes, from the values it submits. The submission must be exactly the Activity's
OutputSet ([BPMN 2.0.2 §10.4.1](../../docs/reference/bpmn-2.0.2/README.md)): every output mapping evaluates against
the submitted values alone, no name is submitted twice, and no submitted value is superfluous (dropping it leaves
the outputs evaluable). Anything else is rejected, so a completion never commits a partial or unmediated write; the
retained baselines observe it for User Task data outputs (`activity-data-output-omitted`,
`structured-composition-serial-null`) and effect result patches alike. -/
def outputs (ctx : Ctx) (mappings : List Mapping) (values : List (String × Value)) :
    Except Failure (List (String × Value)) :=
  let fills (values : List (String × Value)) : Bool :=
    match ctx.evaluateMappings values mappings with
    | .ok _ => true
    | .error _ => false
  let names := values.map (·.1)
  if names.eraseDups.length != names.length then .error (.rejected "duplicate-output")
  else
    match ctx.evaluateMappings values mappings with
    | .error (.unsupported code) => .error (.unsupported code)
    | .error (.rejected _) => .error (.rejected "output-unavailable")
    | .error (.semanticFailure _) => .error (.rejected "output-unavailable")
    | .error (.rolledBack code) => .error (.rolledBack code)
    | .ok written =>
      if names.any (fun name => fills (values.filter (·.1 != name))) then .error (.rejected "undeclared-output")
      else .ok written

/-- Close the Activity's item, write `written` outward from its scope and take its outgoing flows. -/
def finish (payload : ActivityPayload) (item : OpenItem) (written : List (String × Value)) (state : State) :
    State :=
  let closed := (state.closeItem item.id).disarm item.id
  (written.foldl (·.writeOutward item.scope ·) closed).emit payload.envelope.outgoing item.scope

/-- An input mapping whose source is unavailable makes the InputSet unavailable, and the Activity must wait for it
([BPMN 2.0.2 §10.4.2](../../docs/reference/bpmn-2.0.2/README.md)); the state has no place for a token held at an
Activity, so the step is refused as `unsupported` and the token is never dropped. -/
def arriveActivity (ctx : Ctx) (header : Header) (payload : ActivityPayload) (arrival : Arrival) (state : State) :
    Outcome := do
  let inputs ← match ctx.evaluateMappings (state.visible arrival.scope) payload.envelope.inputs with
    | .ok inputs => .ok inputs
    | .error (.semanticFailure _) => .error (.unsupported "activity-input-unavailable")
    | .error (.rejected code) => .error (.rejected code)
    | .error (.unsupported code) => .error (.unsupported code)
    | .error (.rolledBack code) => .error (.rolledBack code)
  match payload.work with
  | .none => .ok (state.emit payload.envelope.outgoing arrival.scope)
  | .manual => .ok (state.emit payload.envelope.outgoing arrival.scope)
  | .user task =>
    let groups := task.candidateGroups.filterMap fun
      | .literal group => some group
      | .expression _ => none
    .ok (openWork (.userTask { name := task.name, candidateGroups := groups, formFields := task.formFields, inputs })
      header payload arrival.scope state)
  | .receive work => do
    let channel ← channel work.message
    .ok (openWork (.message { channel }) header payload arrival.scope state)
  | .service work =>
    .ok (openWork (.effect { protocol := work.protocol, operation := work.operation, arguments := inputs })
      header payload arrival.scope state)
  | .send _ => .error (.unsupported "send-task")
  | .script _ => .error (.unsupported "script-task")
  | .rule _ => .error (.unsupported "business-rule-task")
  | .call _ => .error (.unsupported "call-activity")

/-- A User Task without output mappings writes the submitted values from its scope outward; one with output
mappings takes them as its OutputSet (`outputs`). -/
def completeUserTask (ctx : Ctx) (_ : Header) (payload : ActivityPayload) (item : OpenItem)
    (values : List (String × Value)) (state : State) : Outcome :=
  if payload.envelope.outputs.isEmpty then
    let written := values.foldl (fun state (name, value) => state.write item.scope name value) state
    .ok ((written.closeItem item.id).disarm item.id |>.emit payload.envelope.outgoing item.scope)
  else do
    let written ← outputs ctx payload.envelope.outputs values
    .ok (finish payload item written state)

/-- An effect's result patch is its OutputSet. A BPMN error writes its outputs too, then raises from the Activity
with the closed item as host, as the mapped-boundary-error baseline observes. -/
def effectResult (ctx : Ctx) (header : Header) (payload : ActivityPayload) (item : OpenItem)
    (outcome : EffectOutcome) (state : State) : Outcome :=
  match outcome with
  | .success patch => do
    let written ← outputs ctx payload.envelope.outputs patch
    .ok (finish payload item written state)
  | .businessFailure code message patch => do
    let written ← outputs ctx payload.envelope.outputs patch
    let closed := (state.closeItem item.id).disarm item.id
    .ok ((written.foldl (·.writeOutward item.scope ·) closed).signal
      (.raise (.error code message) { element := header.id, scope := item.scope, host := some item.id }))
  | .technicalFailure => .error (.unsupported "effect-incident")

/-- A delivery completes a Receive Task only on the channel it waits on; the Message carries no payload here. -/
def triggerActivity (_ : Ctx) (_ : Header) (payload : ActivityPayload) (item : OpenItem) (fired : Fired)
    (state : State) : Outcome :=
  match fired with
  | .timer _ => .error (.semanticFailure "activity-timer-without-timer")
  | .message delivery =>
    match item.kind.message? with
    | none => .error (.semanticFailure "activity-message-without-message")
    | some detail =>
      if delivery.channel != detail.channel then .error (.rejected "message-channel-mismatch")
      else if delivery.payload.isSome then .error (.rejected "unexpected-message-payload")
      else .ok (finish payload item [] state)

end Kernel.Feature.Work
