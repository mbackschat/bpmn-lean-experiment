module

public import Kernel.Hooks
public import Kernel.Feature.Work.Call
public import Kernel.Feature.Work.Submission

/-! # Work: what an Activity does

Owns matching on `Work`. An Activity's input mappings are evaluated once, when its occurrence begins, against the
variables visible from its scope occurrence; they become the Activity's local values (a User Task's published inputs,
an effect's arguments). A task without work completes at once; a User Task, a Service Task's effect and a Receive
Task's Message open one item each, and the input that closes the item completes the Activity through the pipeline.
The boundaries of a Multi-Instance Activity belong to its body, so an instance arms none.

A BPMN error an effect reports leaves the Activity `raised`, then raises from it, so the catcher, which may be a
boundary of this Activity, finds nothing of the Activity left to interrupt. A technical failure turns the effect's item
into an incident with the same identity and attachments, which a retry turns back.
-/

public section

namespace Kernel.Feature.Work

/-- Open `kind` for the Activity and arm its boundaries on the occurrence. -/
def openWork (kind : OpenKind) (header : Header) (payload : ActivityPayload) (occurrence : Occurrence)
    (state : State) : State :=
  let state := state.openItem kind occurrence
  if payload.envelope.boundaries.isEmpty || payload.envelope.multiInstance.isSome then state
  else state.signal (.arm occurrence.id header.id occurrence.scope)

/-- The outputs a completion writes, from the values it submits. The submission must be exactly the Activity's
OutputSet ([BPMN 2.0.2 §10.4.1](../../docs/reference/bpmn-2.0.2/README.md)): every output mapping evaluates against
the submitted values alone, no name is submitted twice, and no submitted value is superfluous (dropping it leaves
the outputs evaluable). Anything else is rejected, so a completion never commits a partial or unmediated write. Under
`ResultValues.activityLocals` a superfluous value is an Activity local that ends with the Activity, never written
(CIB-EXT-0015). -/
def outputs (ctx : Ctx) (nowMs : Nat) (unconsumed : ResultValues) (mappings : List Mapping)
    (values : List (String × Value)) : Except Failure (List (String × Value)) :=
  let evaluated (variables : List (String × Value)) := ctx.evaluateMappings { variables, nowMs } mappings
  let fills (variables : List (String × Value)) : Bool :=
    match evaluated variables with
    | .ok (some _) => true
    | .ok none => false
    | .error _ => false
  let names := values.map (·.1)
  if names.eraseDups.length != names.length then .error (.rejected "duplicate-output")
  else
    match evaluated values with
    | .error failure => .error failure
    | .ok none => .error (.rejected "output-unavailable")
    | .ok (some written) =>
      match unconsumed with
      | .activityLocals => .ok written
      | .outputSet =>
        if names.any (fun name => fills (values.filter (·.1 != name))) then .error (.rejected "undeclared-output")
        else .ok written

/-- What an open User Task publishes, with the inputs it was given. -/
def userTaskDetail (task : UserWork) (inputs : List (String × Value)) : UserTaskDetail :=
  let groups := task.candidateGroups.filterMap fun
    | .literal group => some group
    | .expression _ => none
  { name := task.name, candidateGroups := groups, formFields := task.formFields, inputs }

/-- Enter the Activity's local-variable scope when it has inputs (CIB-EXT-0015): the completion pipeline disposes of it
with the Activity. -/
def enterLocal (header : Header) (inputs : List (String × Value)) (occurrence : Occurrence) (state : State) : State :=
  if inputs.isEmpty then state else (state.enterScope header.id occurrence.scope inputs (some occurrence.id)).1

/-- An Activity's occurrence began. An input mapping whose source is unavailable makes the InputSet unavailable, and
an occurrence a token began waits for it ([BPMN 2.0.2 §10.4.2](../../docs/reference/bpmn-2.0.2/README.md)), held in
`FeatureSlots.held` until its scope occurrence is cleared. An occurrence no token began has no flow to hold on, which
is refused; it may do a task without work, a User Task or a Service Task (`scope.implicitStart` and
`compensation.handlerWork` at admission). A `camunda:inputParameter`, whose unresolved expression is no unavailable
Data Input, rolls the command back instead of holding (`Ctx.evaluateMappings`). -/
def arriveActivity (ctx : Ctx) (header : Header) (payload : ActivityPayload) (occurrence : Occurrence) (state : State) :
    Outcome := do
  let some inputs ← ctx.evaluateMappings (state.evalContext occurrence.scope) payload.envelope.inputs
    | match occurrence.incoming with
      | some flow => .ok (state.hold { occurrence := occurrence.id, flow, scope := occurrence.scope })
      -- Dynamic-only: whether the source is set depends on the run.
      | none => .error (.unsupported "started-activity-input-unavailable")
  let state := enterLocal header inputs occurrence state
  let begunByToken := occurrence.incoming.isSome
  let complete (state : State) : State := state.signal (.complete occurrence.id .outgoing [] .outward)
  match payload.work with
  | .none => .ok (complete state)
  | .manual => .ok (complete state)
  | .user task => .ok (openWork (.userTask (userTaskDetail task inputs)) header payload occurrence state)
  | .receive work => do
    if !begunByToken then .error (.unsupported "scope-implicit-start") else
    -- Admission refuses it (`work.receive.messageExpression`).
    let some channel := work.message.channel? | .error (.unsupported "work-receive-message-expression")
    .ok (openWork (.message { channel }) header payload occurrence state)
  | .service work =>
    .ok (openWork (.effect { protocol := work.protocol, operation := work.operation, arguments := inputs })
      header payload occurrence state)
  -- Admission refuses the three (`work.send`, `work.script`, `work.rule`).
  | .send _ => .error (.unsupported "work-send")
  | .script _ => .error (.unsupported "work-script")
  | .rule _ => .error (.unsupported "work-rule")
  | .call work =>
    if !begunByToken then .error (.unsupported "scope-implicit-start")
    else Call.invoke ctx header payload work occurrence state

/-- One Multi-Instance instance submits exactly its output data item, written locally to the instance. -/
def instanceOutput (loop : MultiInstance) (values : List (String × Value)) : Except Failure Unit :=
  match loop.outputDataItem, values with
  | some name, [(submittedName, _)] => if submittedName != name then .error (.rejected "undeclared-output") else .ok ()
  | some _, [] => .error (.rejected "output-unavailable")
  | _, _ => .error (.rejected "undeclared-output")

/-- A User Task without output mappings, under a profile whose submission installs variables (CIB-EXT-0005), writes
the submitted values from its scope; otherwise the submission is the task's OutputSet (`outputs`), which for a task
without outputs admits only the empty submission. The scope-chain rule, when the profile selects it, applies first
(`Submission`). -/
def completeUserTask (ctx : Ctx) (_ : Header) (payload : ActivityPayload) (item : OpenItem)
    (values : List (String × Value)) (state : State) : Outcome := do
  if let some limit := ctx.program.options.scopeChainSubmissionBytes then
    Submission.check ctx state item.scope limit values
  match payload.envelope.multiInstance with
  | some loop =>
    instanceOutput loop values
    .ok (state.signal (.complete item.occurrence .outgoing values .own))
  | none =>
    match ctx.program.options.submission, payload.envelope.outputs with
    | .installsVariables, [] => .ok (state.signal (.complete item.occurrence .outgoing values .outward))
    | .installsVariables, _ :: _ | .outputSet, _ =>
      let written ← outputs ctx state.logicalTimeMs .outputSet payload.envelope.outputs values
      .ok (state.signal (.complete item.occurrence .outgoing written .outward))

/-- Replace the kind of the open item `id`, keeping its identity and attachments. -/
def reopen (state : State) (id : Nat) (kind : OpenKind) : State :=
  { state with openItems := state.openItems.map fun item => if item.id == id then { item with kind } else item }

/-- What an effect result value no output mapping consumes becomes: the profile's rule for an instance of a
Multi-Instance Activity, whose CIB execution is the instance's own and ends with it; the OutputSet otherwise, since CIB
makes a task without mappings no scope and its delegate's local reaches the flow execution that continues past it
(CIB-EXT-0015, `BpmnParse.java:4797-4814`). -/
def unconsumed (ctx : Ctx) (envelope : Option Envelope) : ResultValues :=
  if (envelope.bind (·.multiInstance)).isSome then ctx.program.options.effectResultValues else .outputSet

/-- An effect's result patch is its OutputSet. A BPMN error raises from the Activity with the occurrence as host: it
writes no outputs (BPMN 2.0.2 §13.3.2) unless the profile maps them on the error path (CIB-EXT-0004, -0009, -0016). A
technical failure has no BPMN meaning (§13.3.3 defines only a fault) and refuses unless the profile opens an incident
(CIB-EXT-0013, CIB-CFG-0008). -/
def effectResult (ctx : Ctx) (item : OpenItem) (outcome : EffectOutcome) (state : State) : Outcome :=
  -- A throw Event's effect has no envelope and so no output mappings (PC-MESSAGE-09).
  let envelope := (ctx.program.element? item.element).bind (·.envelope?)
  let mappings := (envelope.map (·.outputs)).getD []
  match outcome with
  | .success patch => do
    let written ← outputs ctx state.logicalTimeMs (unconsumed ctx envelope) mappings patch
    .ok (state.signal (.complete item.occurrence .outgoing written .outward))
  | .businessFailure code message patch => do
    let written ← match ctx.program.options.errorPathOutputs with
      | .mapped => outputs ctx state.logicalTimeMs (unconsumed ctx envelope) mappings patch
      | .none => if patch.isEmpty then .ok [] else .error (.rejected "error-path-outputs-not-accepted")
    let activation := ((state.occurrence? item.occurrence).map (·.activation)).getD 0
    .ok ((state.signal (.complete item.occurrence .raised written .outward)).signal (.raise (.error code message)
      { element := item.element, scope := item.scope, activation, host := some item.occurrence }))
  | .technicalFailure =>
    match ctx.program.options.technicalFailure, item.kind.view.effect with
    -- Dynamic-only: a host failure is an input; no admission can tell whether it will arrive.
    | .hostFailure, _ => .error (.unsupported "effect-technical-failure")
    | .incident, none => .error (.semanticFailure "effect-result-without-effect")
    | .incident, some detail =>
      -- Dynamic-only: a retried effect's second failure is a run outcome; PC-AUTO retries own it.
      if detail.failures > 0 then .error (.unsupported "repeated-effect-incident")
      else
        let effect := { detail with failures := detail.failures + 1 }
        .ok (reopen state item.id (.incident { effect, cancellable := ctx.program.options.incidentProcessCancellation }))

/-- A retry reopens the failed effect with the same occurrence (CIB-EXT-0013); cancelling the incident's process
ends the instance as cancelled, keeping its Process variables (CIB-EXT-0014, CIB-OP-0009), and is offered only for
an incident of the root process instance under a profile that selects it. A command naming another generation than
the open incident's is stale and rejected, so it never resolves an incident its issuer did not observe. -/
def resolveIncident (_ : Ctx) (item : OpenItem) (action : CommandAction) (state : State) : Outcome :=
  let stale : Outcome := .error (.rejected "incident-generation-stale")
  match item.kind.view.incident, action with
  | none, _ => .error (.semanticFailure "incident-command-without-incident")
  | some incident, .retryIncident generation =>
    if generation != incident.generation then stale else .ok (reopen state item.id (.effect incident.effect))
  | some incident, .cancelIncidentProcess generation =>
    if generation != incident.generation then stale
    else if !incident.cancellable then .error (.rejected "incident-process-cancellation-unavailable")
    -- Dynamic-only: whether the incident is in a called instance depends on the run.
    else if state.instanceRoot item.scope != State.root then .error (.unsupported "called-incident-cancellation")
    else .ok (state.signal (.endInstance .cancelled none))
  | some _, .completeUserTask _ => .error (.semanticFailure "incident-user-task-completion")
  | some _, .setVariables _ => .error (.semanticFailure "incident-variable-command")
  | some _, .removeVariables _ => .error (.semanticFailure "incident-variable-command")

/-- A delivery completes a Receive Task only on the channel it waits on; the Message carries no payload here. -/
def triggerActivity (_ : Ctx) (_ : Header) (_ : ActivityPayload) (item : OpenItem) (fired : Fired)
    (state : State) : Outcome :=
  match fired with
  | .timer _ => .error (.semanticFailure "activity-timer-without-timer")
  | .signal _ => .error (.semanticFailure "activity-signal-without-signal")
  | .condition _ => .error (.semanticFailure "activity-condition-without-condition")
  | .message delivery =>
    match item.kind.view.channel with
    | none => .error (.semanticFailure "activity-message-without-message")
    | some channel =>
      if delivery.trigger.channel? != some channel then .error (.rejected "message-channel-mismatch")
      else if delivery.payload.isSome then .error (.rejected "unexpected-message-payload")
      else .ok (state.signal (.complete item.occurrence .outgoing [] .outward))

/-- `Hooks.completeCall`: only a Call Activity starts a called instance. -/
def completeCall (ctx : Ctx) (header : Header) (payload : ActivityPayload) (root : ScopeOccurrence)
    (owner : Occurrence) (state : State) : Outcome :=
  let notCall : Outcome := .error (.semanticFailure "called-instance-without-call")
  match payload.work with
  | .call work => Call.complete ctx header payload work root owner state
  | .none => notCall
  | .manual => notCall
  | .user _ => notCall
  | .receive _ => notCall
  | .service _ => notCall
  | .send _ => notCall
  | .script _ => notCall
  | .rule _ => notCall

end Kernel.Feature.Work
