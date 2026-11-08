module

public import Kernel.Hooks
public import Kernel.Feature.Work.Call
public import Kernel.Feature.Work.Submission

/-! # Work: what an Activity does

Owns matching on `Work`. An Activity's input mappings are evaluated once, on arrival, against the variables visible
from its scope occurrence; they become the Activity's local values (a User Task's published inputs, an effect's
arguments). A task without work passes its token through; a User Task, a Service Task's effect and a Receive Task's
Message open one item each, and the input that closes the item completes the Activity: its output mappings write
outward, its attached items are disarmed and its outgoing flows receive tokens.

An Activity with boundaries signals `arm` for the item it opened; a BPMN error an effect reports is raised from the
Activity after its outputs are written and its item and attached items are removed, so the catcher, which may be a
boundary of this Activity, finds nothing of the Activity left to interrupt. A technical failure turns the effect's
item into an incident with the same identity and attachments, which a retry turns back.
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

/-- An Activity with a compensation handler stays compensable once it completes
([BPMN 2.0.2 §13.5.5](../../docs/reference/bpmn-2.0.2/README.md)); a boundary handler restores no context. -/
def retain (payload : ActivityPayload) (item : OpenItem) (state : State) : State :=
  if payload.envelope.compensationHandler.isSome then state.signal (.completed item.element item.scope [])
  else state

/-- Close the Activity's item, write `written` outward from its scope and take its outgoing flows. -/
def finish (payload : ActivityPayload) (item : OpenItem) (written : List (String × Value)) (state : State) :
    State :=
  let closed := (state.closeItem item.id).disarm item.id
  retain payload item ((written.foldl (·.writeOutward item.scope ·) closed).emit payload.envelope.outgoing item.scope)

/-- What an open User Task publishes, with the inputs it was given. -/
def userTaskDetail (task : UserWork) (inputs : List (String × Value)) : UserTaskDetail :=
  let groups := task.candidateGroups.filterMap fun
    | .literal group => some group
    | .expression _ => none
  { name := task.name, candidateGroups := groups, formFields := task.formFields, inputs }

/-- `Ctx.bodyWait`: one instance of a Multi-Instance User Task opens a User Task that publishes no inputs, its item
being published with the Multi-Instance Activity instead; other work does not run as an instance. -/
def bodyWait (payload : ActivityPayload) : Option OpenKind :=
  match payload.work with
  | .user task => some (.userTask (userTaskDetail task []))
  | .none => none
  | .manual => none
  | .receive _ => none
  | .service _ => none
  | .send _ => none
  | .script _ => none
  | .rule _ => none
  | .call _ => none

/-- An input mapping whose source is unavailable makes the InputSet unavailable, and the Activity waits for it
([BPMN 2.0.2 §10.4.2](../../docs/reference/bpmn-2.0.2/README.md)): the token is held at the Activity
(`FeatureSlots.held`), keeping its scope occurrence alive. Nothing re-evaluates a held InputSet yet, so the token
waits until its scope occurrence is cleared. -/
def arriveActivity (ctx : Ctx) (header : Header) (payload : ActivityPayload) (arrival : Arrival) (state : State) :
    Outcome := do
  let available ← match ctx.evaluateMappings (state.visible arrival.scope) payload.envelope.inputs with
    | .ok inputs => .ok (some inputs)
    | .error (.semanticFailure _) => .ok none
    | .error (.rejected code) => .error (.rejected code)
    | .error (.unsupported code) => .error (.unsupported code)
    | .error (.rolledBack code) => .error (.rolledBack code)
  let some inputs := available
    | .ok (state.hold { flow := arrival.flow, scope := arrival.scope })
  match payload.work with
  | .none => .ok (state.emit payload.envelope.outgoing arrival.scope)
  | .manual => .ok (state.emit payload.envelope.outgoing arrival.scope)
  | .user task => .ok (openWork (.userTask (userTaskDetail task inputs)) header payload arrival.scope state)
  | .receive work => do
    let channel ← channel work.message
    .ok (openWork (.message { channel }) header payload arrival.scope state)
  | .service work =>
    .ok (openWork (.effect { protocol := work.protocol, operation := work.operation, arguments := inputs })
      header payload arrival.scope state)
  | .send _ => .error (.unsupported "send-task")
  | .script _ => .error (.unsupported "script-task")
  | .rule _ => .error (.unsupported "business-rule-task")
  | .call work => Call.invoke ctx header payload work arrival state

/-- `Hooks.startActivity`: begin, in `scope`, an Activity that no token reaches: one without incoming Sequence Flow
in a Scope without a start Event, or a compensation handler. An unavailable InputSet has no token to hold, so it
is refused, as is work other than a task without work, a User Task or a Service Task. -/
def startActivity (ctx : Ctx) (header : Header) (payload : ActivityPayload) (scope : ScopeOccurrenceId)
    (state : State) : Outcome := do
  let inputs ← match ctx.evaluateMappings (state.visible scope) payload.envelope.inputs with
    | .ok inputs => .ok inputs
    | .error (.semanticFailure _) => .error (.unsupported "started-activity-input-unavailable")
    | .error failure => .error failure
  match payload.work with
  | .none => .ok (state.emit payload.envelope.outgoing scope)
  | .manual => .ok (state.emit payload.envelope.outgoing scope)
  | .user task => .ok (openWork (.userTask (userTaskDetail task inputs)) header payload scope state)
  | .service work =>
    .ok (openWork (.effect { protocol := work.protocol, operation := work.operation, arguments := inputs })
      header payload scope state)
  | .receive _ => .error (.unsupported "started-receive-task")
  | .send _ => .error (.unsupported "send-task")
  | .script _ => .error (.unsupported "script-task")
  | .rule _ => .error (.unsupported "business-rule-task")
  | .call _ => .error (.unsupported "started-call-activity")

/-- A User Task without output mappings, under a profile whose submission installs variables (CIB-EXT-0005), writes
the submitted values from its scope; otherwise the submission is the task's OutputSet (`outputs`), which for a task
without outputs admits only the empty submission. The scope-chain rule, when the profile selects it, applies first
(`Submission`). -/
def completeUserTask (ctx : Ctx) (_ : Header) (payload : ActivityPayload) (item : OpenItem)
    (values : List (String × Value)) (state : State) : Outcome := do
  if let some limit := ctx.program.options.scopeChainSubmissionBytes then
    Submission.check ctx state item.scope limit values
  if payload.envelope.outputs.isEmpty && ctx.program.options.submissionInstallsVariables then
    let written := values.foldl (fun state (name, value) => state.write item.scope name value) state
    .ok (retain payload item ((written.closeItem item.id).disarm item.id |>.emit payload.envelope.outgoing item.scope))
  else
    let written ← outputs ctx payload.envelope.outputs values
    .ok (finish payload item written state)

/-- Replace the kind of the open item `id`, keeping its identity, activation and attachments. -/
def reopen (state : State) (id : Nat) (kind : OpenKind) : State :=
  { state with openItems := state.openItems.map fun item => if item.id == id then { item with kind } else item }

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
    .ok ((written.foldl (·.writeOutward item.scope ·) closed).signal (.raise (.error code message)
      { element := header.id, scope := item.scope, host := some item.id, activation := some item.activation }))
  | .technicalFailure =>
    match item.kind.effect? with
    | none => .error (.semanticFailure "effect-result-without-effect")
    | some detail =>
      if detail.failures > 0 then .error (.unsupported "repeated-effect-incident")
      else
        let effect := { detail with failures := detail.failures + 1 }
        .ok (reopen state item.id (.incident { effect, cancellable := ctx.program.options.incidentProcessCancellation }))

/-- A retry reopens the failed effect with the same occurrence (CIB-EXT-0013); cancelling the incident's process
ends the instance as cancelled, keeping its Process variables (CIB-EXT-0014, CIB-OP-0009), and is offered only for
an incident of the root process instance under a profile that selects it. -/
def resolveIncident (_ : Ctx) (_ : Header) (_ : ActivityPayload) (item : OpenItem) (action : CommandAction)
    (state : State) : Outcome :=
  match item.kind.incident?, action with
  | none, _ => .error (.semanticFailure "incident-command-without-incident")
  | some incident, .retryIncident => .ok (reopen state item.id (.effect incident.effect))
  | some incident, .cancelIncidentProcess =>
    if !incident.cancellable then .error (.rejected "incident-process-cancellation-unavailable")
    else if state.instanceRoot item.scope != State.root then .error (.unsupported "called-incident-cancellation")
    else .ok { state.clearInside State.root with status := .cancelled }
  | some _, .completeUserTask _ => .error (.semanticFailure "incident-user-task-completion")

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

/-- `Hooks.completeCall`: only a Call Activity starts a called instance. -/
def completeCall (ctx : Ctx) (header : Header) (payload : ActivityPayload) (occurrence : ScopeOccurrence)
    (state : State) : Outcome :=
  let notCall : Outcome := .error (.semanticFailure "called-instance-without-call")
  match payload.work with
  | .call work => Call.complete ctx header payload work occurrence state
  | .none => notCall
  | .manual => notCall
  | .user _ => notCall
  | .receive _ => notCall
  | .service _ => notCall
  | .send _ => notCall
  | .script _ => notCall
  | .rule _ => notCall

end Kernel.Feature.Work
