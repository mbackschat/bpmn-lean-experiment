module

public import Kernel.Hooks
public import Kernel.Feature.Work.Call
public import Kernel.Feature.Work.Submission
public import Kernel.Feature.Work.Decision

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
(CIB-EXT-0015). The mappings also read `scope` behind the submitted values (`outputScope`). -/
def outputs (ctx : Ctx) (nowMs : Nat) (unconsumed : ResultValues) (mappings : List Mapping)
    (scope values : List (String × Value)) : Except Failure (List (String × Value)) :=
  let evaluated (variables : List (String × Value)) := ctx.evaluateMappings { variables := variables ++ scope, nowMs } mappings
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

/-- A field's literal value; admission refuses the expression-valued fields until the Task fields JUEL level. -/
def literalOf : Option ValueSource → Option String
  | none => none
  | some (.literal value) => some value
  | some (.expression _) => none

/-- What an open User Task publishes, with the inputs it was given: its literal metadata as the model states it, the
priority as the `int` CIB parses it into (`TaskDecorator#initializeTaskPriority`), whose decimal form admission
checks. -/
def userTaskDetail (task : UserWork) (inputs : List (String × Value)) : UserTaskDetail :=
  let literals (sources : List ValueSource) : List String := sources.filterMap (literalOf ∘ some)
  { name := task.name, assignee := literalOf task.assignee, candidateUsers := literals task.candidateUsers
    candidateGroups := literals task.candidateGroups, formKey := task.formKey, formFields := task.formFields
    dueDate := literalOf task.dueDate, followUpDate := literalOf task.followUpDate
    priority := (literalOf task.priority).bind String.toInt?, inputs }

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
  -- An instance of a Multi-Instance body, the only occurrence of a looping Activity this hook sees, follows the token
  -- its body began on; admission refuses a looping compensation handler (`activity.compensationHandler`).
  let begunByToken := occurrence.incoming.isSome || payload.envelope.multiInstance.isSome
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
  -- Admission refuses the two (`work.send`, `work.script`).
  | .send _ => .error (.unsupported "work-send")
  | .script _ => .error (.unsupported "work-script")
  | .rule work => do
    -- The decision's result is written before the task leaves, so its outgoing conditions read it (PC-AUTO-07).
    let writes ← Decision.run ctx.program work (state.evalContext occurrence.scope).variables
    .ok (complete (if writes.isEmpty then state else state.signal (.write occurrence.scope writes .outward)))
  | .call work =>
    if !begunByToken then .error (.unsupported "scope-implicit-start")
    else Call.invoke ctx header payload work occurrence state

/-- One Multi-Instance instance submits exactly its output data item, written locally to the instance. -/
def instanceOutput (loop : MultiInstance) (values : List (String × Value)) : Except Failure Unit :=
  match loop.outputDataItem, values with
  | some name, [(submittedName, _)] => if submittedName != name then .error (.rejected "undeclared-output") else .ok ()
  | some _, [] => .error (.rejected "output-unavailable")
  | _, _ => .error (.rejected "undeclared-output")

/-- The local-variable scope occurrence an Activity's occurrence owns, when its inputs gave it one (`enterLocal`). -/
def localScope (state : State) (occurrence : Nat) : Option ScopeOccurrenceId :=
  (state.scopes.find? fun scope => scope.occurrence == some occurrence && scope.calledInstance.isNone).map (·.id)

/-- What an Activity's outputs read behind the submitted values: nothing under the standards reading; under
`OutputContext.activityScope` (CIB-EXT-0031) the variables visible from the Activity's own scope, its captured inputs
first, since CIB evaluates an output parameter in the Activity's execution (`OutputParameter.java:47`). -/
def outputScope (ctx : Ctx) (state : State) (item : OpenItem) : List (String × Value) :=
  match ctx.program.options.outputContext with
  | .submission => []
  | .activityScope => state.visible ((localScope state item.occurrence).getD item.scope)

/-- Under a profile whose submission installs variables (CIB-EXT-0005) the completion first writes every submitted
value from the task's own local scope occurrence, as `TaskService.complete` sets it through the task's execution
(`AbstractVariableScope#setVariable`): a name the task holds as a local stays there and ends with the task, any other
reaches its nearest owner or the root. The write is its own signal ahead of the completion, so the outgoing conditions
read it even when they precede the outputs (CIB-INT-0011). The outputs then map from the submitted values, a value no
mapping reads being no error. Otherwise the submission is the task's OutputSet (`outputs`), which for a task without
outputs admits only the empty submission. The scope-chain rule, when the profile selects it, applies first
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
    match ctx.program.options.submission with
    | .installsVariables =>
      let written ← outputs ctx state.logicalTimeMs .activityLocals payload.envelope.outputs (outputScope ctx state item) values
      let installed := state.signal (.write ((localScope state item.occurrence).getD item.scope) values .outward)
      .ok (installed.signal (.complete item.occurrence .outgoing written .outward))
    | .outputSet =>
      let written ← outputs ctx state.logicalTimeMs .outputSet payload.envelope.outputs (outputScope ctx state item) values
      .ok (state.signal (.complete item.occurrence .outgoing written .outward))

/-- Replace the kind of the open item `id`, keeping its identity and attachments. -/
def reopen (state : State) (id : Nat) (kind : OpenKind) : State :=
  { state with openItems := state.openItems.map fun item => if item.id == id then { item with kind } else item }

/-- What an effect result value no output mapping consumes becomes: the profile's rule where CIB gives the delegate an
execution of its own, which ends with the task: an instance of a Multi-Instance Activity, or a task with
`camunda:inputOutput`, which CIB makes a scope (`BpmnParse.java:4797-4814`); the OutputSet otherwise, since on a task
CIB makes no scope the delegate's local reaches the flow execution that continues past it (CIB-EXT-0015). A
non-compensation boundary also makes a CIB task a scope (`BpmnParse.java:3297`); such a task without mappings keeps the
OutputSet reading, which no witness separates. -/
def unconsumed (ctx : Ctx) : Option Envelope → ResultValues
  | none => .outputSet
  | some envelope =>
    let ioParameters := (envelope.inputs ++ envelope.outputs).any (·.dialect == .ioParameter)
    if envelope.multiInstance.isSome || ioParameters then ctx.program.options.effectResultValues else .outputSet

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
    let written ← outputs ctx state.logicalTimeMs (unconsumed ctx envelope) mappings (outputScope ctx state item) patch
    .ok (state.signal (.complete item.occurrence .outgoing written .outward))
  | .businessFailure code message patch => do
    let written ← match ctx.program.options.errorPathOutputs with
      | .mapped => outputs ctx state.logicalTimeMs (unconsumed ctx envelope) mappings (outputScope ctx state item) patch
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
      -- Each failure is the next incident generation of the occurrence, so a command its issuer took from an earlier
      -- incident is stale (CIB-EXT-0013; `fulfilment-repeated-incident` publishes generation 2 after one retry).
      let effect := { detail with failures := detail.failures + 1 }
      .ok (reopen state item.id
        (.incident { effect, generation := effect.failures, cancellable := ctx.program.options.incidentProcessCancellation }))

/-- A retry reopens the failed effect with the same occurrence (CIB-EXT-0013); cancelling the incident's process
ends the whole instance as cancelled, keeping its root's Process variables, under a profile that selects it
(CIB-EXT-0014, CIB-OP-0009). An incident inside a called instance cancels the root too: the operator deletes the root
Process instance, which deletes its called instances with it (`CibSevenCommandExecutor`, `deleteProcessInstance(root)`).
A command naming another generation than the open incident's is stale and rejected, so it never resolves an incident its
issuer did not observe. -/
def resolveIncident (_ : Ctx) (item : OpenItem) (action : CommandAction) (state : State) : Outcome :=
  let stale : Outcome := .error (.rejected "incident-generation-stale")
  match item.kind.view.incident, action with
  | none, _ => .error (.semanticFailure "incident-command-without-incident")
  | some incident, .retryIncident generation =>
    if generation != incident.generation then stale else .ok (reopen state item.id (.effect incident.effect))
  | some incident, .cancelIncidentProcess generation =>
    if generation != incident.generation then stale
    else if !incident.cancellable then .error (.rejected "incident-process-cancellation-unavailable")
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
