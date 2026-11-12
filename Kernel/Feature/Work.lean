module

public import Kernel.Hooks
public import Kernel.Feature.Work.Call
public import Kernel.Feature.Work.Submission

/-! # Work: what an Activity does

Owns matching on `Work`. An Activity's input mappings are evaluated once, when its occurrence begins, against the
variables visible from its scope occurrence; they become the Activity's local values (a User Task's published inputs,
an effect's arguments). A task without work completes at once; a User Task, a Service or Script Task's effect and a
Receive Task's Message open one item each, and the input that closes the item completes the Activity through the
pipeline. The boundaries of a Multi-Instance Activity belong to its body, so an instance arms none.

A BPMN error an effect reports leaves the Activity `raised`, then raises from it, so the catcher, which may be a
boundary of this Activity, finds nothing of the Activity left to interrupt. A technical failure turns the effect's item
into an incident with the same identity and attachments, which a retry turns back.
-/

public section

namespace Kernel.Feature.Work

/-- The sub-features Work joins through its own hooks record, since features never import each other
(ARCHITECTURE-SPEC "Modules and build shape"); `Kernel.Registry` fills it. `runDecision` is `Kernel.Feature.Decision.runDecision`:
the writes a decision task makes against the variables visible from its scope occurrence. `criteriaHold` is
`Kernel.Feature.Correlation.criteriaHold`: whether a delivery's API criteria hold for a Receive Task waiting in a scope
occurrence (CIB-EXT-0025). -/
structure WorkHooks where
  runDecision : Program → RuleWork → List (String × Value) → Except Failure (List (String × Value)) :=
    fun _ _ _ => .error (.unsupported "work-rule")
  criteriaHold : State → ScopeOccurrenceId → List CorrelationMatch → Except Failure Bool :=
    fun _ _ _ => .error (.unsupported "work-criteria") -- dynamic-only: a registry without the hook

/-- The neutral descriptor of a Script Task's effect
([script semantics](../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md), item 3). -/
def scriptProtocol : String := "urn:bpmn-lean:effect-protocol:script-v1"

/-- A Script Task's arguments: every variable visible from `scope`, one entry per name, its nearest owner's, nearest
owner first ([script semantics](../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md), item 3). The kernel cannot know
which names a script reads, so it commits them all when the effect opens. -/
def scriptSnapshot (state : State) (scope : ScopeOccurrenceId) : List (String × Value) :=
  (state.visible scope).foldl (fun kept entry => if kept.any (·.1 == entry.1) then kept else kept ++ [entry]) []

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
(CIB-EXT-0015). The mappings also read `scope` behind the submitted values (`activityScope`), and `installed`, the
values the completion set through the Activity's frame before its outputs run, where that write left them
(`Ctx.outputReads`); no name is installed twice either. -/
def completionOutputs (ctx : Ctx) (nowMs : Nat) (unconsumed : ResultValues) (mappings : List Mapping)
    (scope : List (String × Value) × List (String × Value)) (installed values : List (String × Value)) :
    Except Failure (List (String × Value)) :=
  let evaluated (variables : List (String × Value)) :=
    ctx.evaluateMappingsWith (ctx.outputReads nowMs (variables ++ scope.1) installed scope.2) mappings
  let fills (variables : List (String × Value)) : Bool :=
    match evaluated variables with
    | .ok (some _) => true
    | .ok none => false
    | .error _ => false
  let names := values.map (·.1)
  let given := names ++ installed.map (·.1)
  if given.eraseDups.length != given.length then .error (.rejected "duplicate-output")
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

/-- The frame the outputs of the Activity occurrence `occurrence` in `scope` read besides the submitted values: nothing
under the standards reading; under `OutputContext.activityScope` (CIB-EXT-0031) its own locals, the captured inputs,
and the chain from `scope`, into which the outputs are written, which `Ctx.outputReads` orders. -/
def activityScope (ctx : Ctx) (state : State) (occurrence : Nat) (scope : ScopeOccurrenceId) :
    List (String × Value) × List (String × Value) :=
  match ctx.program.options.outputContext with
  | .submission => ([], [])
  | .activityScope => (((state.localScope? occurrence).map state.ownVariables).getD [], state.visible scope)

/-- A decision task (PC-AUTO-07, PC-AUTO-08) reads its inputs, which CIB holds as locals of the task's scope
(`BpmnParse.java:2357-2360`), and writes the mapped result outward from that scope, as `setVariable` on the task's
execution does (`DecisionEvaluationUtil.java:86`), so a task-local of the result's name holds it. The write is its
own signal ahead of the completion, so the outgoing conditions read it whatever the condition order; the outputs read
the result where that write left it, behind an earlier output's write of its name unless a task-local holds it
(`Ctx.outputReads`), and a result no output reads is no error. -/
def evaluateDecision (hooks : WorkHooks) (ctx : Ctx) (payload : ActivityPayload) (work : RuleWork) (occurrence : Occurrence)
    (state : State) : Outcome := do
  let scope := state.ownScope occurrence.id occurrence.scope
  let writes ← hooks.runDecision ctx.program work (state.evalContext scope).variables
  let written ← completionOutputs ctx state.logicalTimeMs .activityLocals payload.envelope.outputs
    (activityScope ctx state occurrence.id occurrence.scope) writes []
  let result := if writes.isEmpty then state else state.signal (.write scope writes .outward)
  .ok (result.signal (.complete occurrence.id .outgoing written .outward))

/-- An Activity's occurrence began. An input mapping whose source is unavailable makes the InputSet unavailable, and
an occurrence a token began waits for it ([BPMN 2.0.2 §10.4.2](../../docs/reference/bpmn-2.0.2/README.md)), held in
`FeatureSlots.held` until its scope occurrence is cleared. An occurrence no token began has no flow to hold on, which
is refused: a compensation handler, which its run begins in its context (`ScopeRole.compensationHandler`), as the
dynamic-only `compensation.handlerInputUnavailable` (I10), any other as `started-activity-input-unavailable`. A handler
and a Multi-Instance instance count as begun by a token, so they may receive a Message or call a process; another
occurrence no token began may do a task without work, a User Task or a Service Task (`scope.implicitStart` at
admission). A `camunda:inputParameter`, whose unresolved expression is no unavailable Data Input, rolls the command back
instead of holding (`Ctx.evaluateMappings`). -/
def arriveActivity (hooks : WorkHooks) (ctx : Ctx) (header : Header) (payload : ActivityPayload) (occurrence : Occurrence)
    (state : State) : Outcome := do
  let handler := ctx.scopeRole state occurrence.scope == .compensationHandler
  let some inputs ← ctx.evaluateMappings (state.evalContext occurrence.scope) payload.envelope.inputs
    | match occurrence.incoming with
      | some flow => .ok (state.hold { occurrence := occurrence.id, flow, scope := occurrence.scope })
      -- Dynamic-only: whether the source is set depends on the run.
      | none => .error (.unsupported
        (if handler then "compensation.handlerInputUnavailable" else "started-activity-input-unavailable"))
  let state := enterLocal header inputs occurrence state
  -- An instance of a Multi-Instance body, the only occurrence of a looping Activity this hook sees, follows the token
  -- its body began on; admission refuses a looping compensation handler (`compensation.handlerMultiInstance`).
  let begunByToken := occurrence.incoming.isSome || payload.envelope.multiInstance.isSome || handler
  let complete (state : State) : State := state.signal (.complete occurrence.id .outgoing [] .outward)
  match payload.work with
  | .none => do
    -- A plain Task completes with the empty submission; its output parameters, which admission admits only where they
    -- read the Task's own scope (`activity.outputMappings`), are written as it leaves (CIB-EXT-0031).
    let written ← completionOutputs ctx state.logicalTimeMs .outputSet payload.envelope.outputs
      (activityScope ctx state occurrence.id occurrence.scope) [] []
    .ok (state.signal (.complete occurrence.id .outgoing written .outward))
  | .manual => .ok (complete state)
  | .user task => .ok (openWork (.userTask (userTaskDetail task inputs)) header payload occurrence state)
  | .receive work => do
    if !begunByToken then .error (.unsupported "scope-implicit-start") else
    .ok (openWork (.message { channel := work.message.channel }) header payload occurrence state)
  | .service work =>
    .ok (openWork (.effect { protocol := work.protocol, operation := work.operation, arguments := inputs })
      header payload occurrence state)
  -- Admission refuses it (`work.send`).
  | .send _ => .error (.unsupported "work-send")
  | .script _ =>
    let detail : EffectDetail :=
      { protocol := scriptProtocol, operation := "javascript", arguments := scriptSnapshot state occurrence.scope }
    .ok (openWork (.effect detail) header payload occurrence state)
  | .rule work => evaluateDecision hooks ctx payload work occurrence state
  | .call work =>
    if !begunByToken then .error (.unsupported "scope-implicit-start")
    else Call.invoke ctx header payload work occurrence state

/-- One Multi-Instance instance submits exactly its output data item, written locally to the instance. -/
def instanceOutput (loop : MultiInstance) (values : List (String × Value)) : Except Failure Unit :=
  match loop.outputDataItem, values with
  | some name, [(submittedName, _)] => if submittedName != name then .error (.rejected "undeclared-output") else .ok ()
  | some _, [] => .error (.rejected "output-unavailable")
  | _, _ => .error (.rejected "undeclared-output")

/-- The loop whose instance submits exactly its output data item: a Multi-Instance Activity's, unless the loop declares
none and the submission installs variables (CIB-EXT-0005), where CIB's `TaskService.complete` sets the instance's
submission through its task execution as for any task. -/
def submittedItem (submission : SubmissionRule) (envelope : Envelope) : Option MultiInstance :=
  envelope.multiInstance.filter fun loop => loop.outputDataItem.isSome || submission == .outputSet

/-- The frame an open item's outputs read (`activityScope`): CIB evaluates an output parameter in the Activity's
execution (`OutputParameter.java:47`). -/
def outputScope (ctx : Ctx) (state : State) (item : OpenItem) : List (String × Value) × List (String × Value) :=
  activityScope ctx state item.occurrence item.scope

/-- Under CIB's counters (`MultiInstanceCounters.cibLocals`, CIB-INT-0018) an instance's installed submission naming a
counter would rewrite CIB's loop state, which the kernel computes rather than holds: the body execution's `loopCounter`
and `nrOfInstances` that the next sequential instance reads (`SequentialMultiInstanceActivityBehavior.java:48-59`), or
the parallel body's `nrOfActiveInstances` and `nrOfCompletedInstances` that end it
(`ParallelMultiInstanceActivityBehavior.java:84-87,123`). The input data item is the instance's own local, which no
later step reads, so it is no such name. `Kernel.Feature.MultiInstance` refuses a result so named with the same code. -/
def shadowsCounter (ctx : Ctx) (envelope : Envelope) (values : List (String × Value)) : Bool :=
  envelope.multiInstance.isSome && ctx.program.options.multiInstanceCounters == .cibLocals &&
    values.any fun (name, _) => multiInstanceCounterNames.contains name

/-- Under a profile whose submission installs variables (CIB-EXT-0005) the completion first writes every submitted
value from the task's own local scope occurrence, as `TaskService.complete` sets it through the task's execution
(`AbstractVariableScope#setVariable`): a name the task holds as a local stays there and ends with the task, any other
reaches its nearest owner or the root. The write is its own signal ahead of the completion, so the outgoing conditions
read it even when they precede the outputs (CIB-INT-0011). The outputs then read the submitted values where that write
left them (`Ctx.outputReads`), a value no mapping reads being no error. Otherwise the submission is the task's OutputSet (`completionOutputs`), which for a task without
outputs admits only the empty submission. A Multi-Instance instance submits its output data item instead
(`submittedItem`); a name its loop's counters own is `unsupported` (`shadowsCounter`). The scope-chain rule, when the profile selects it, applies first, from the task's own frame, so
the task's own locals are names it may submit (UTL-TASK-01; `Submission`). -/
def completeUserTask (ctx : Ctx) (_ : Header) (payload : ActivityPayload) (item : OpenItem)
    (values : List (String × Value)) (state : State) : Outcome := do
  admitValues (values.map (·.2))
  if let some limit := ctx.program.options.scopeChainSubmissionBytes then
    Submission.check ctx state (state.ownScope item.occurrence item.scope) limit values
  match submittedItem ctx.program.options.submission payload.envelope with
  | some loop =>
    instanceOutput loop values
    -- CIB reads no `outputDataItem` (CIB-LIM-0001) and sets the submission through the instance's task execution
    -- (CIB-EXT-0005), so it also reaches its nearest owner or the root; the slot keeps BPMN 2.0.2 §13.3.7.
    let installed := if ctx.program.options.submission == .installsVariables then
        state.signal (.write item.scope values .outward) else state
    .ok (installed.signal (.complete item.occurrence .outgoing values .own))
  | none =>
    match ctx.program.options.submission with
    | .installsVariables =>
      -- Dynamic-only: a submission's names are the run's data.
      if shadowsCounter ctx payload.envelope values then .error (.unsupported "multiInstance.resultShadowsInstance")
      let written ← completionOutputs ctx state.logicalTimeMs .activityLocals payload.envelope.outputs (outputScope ctx state item) values []
      let installed := state.signal (.write (state.ownScope item.occurrence item.scope) values .outward)
      .ok (installed.signal (.complete item.occurrence .outgoing written .outward))
    | .outputSet =>
      let written ← completionOutputs ctx state.logicalTimeMs .outputSet payload.envelope.outputs (outputScope ctx state item) [] values
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

/-- An effect's successful completion. A Multi-Instance instance under `ResultValues.activityLocals` writes its result
values as locals of its own scope occurrence, which stays until its completion condition has run, so the condition
reads them (CIB-EXT-0015; EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", result locals); every other completion
writes its outputs outward. -/
def effectCompletion (envelope : Option Envelope) (rule : ResultValues) (occurrence : Nat)
    (written patch : List (String × Value)) : Signal :=
  if (envelope.bind (·.multiInstance)).isSome && rule == .activityLocals then .complete occurrence .outgoing patch .own
  else .complete occurrence .outgoing written .outward

/-- How an Activity that raised a business Error leaves, once the search for its catcher has decided:
`Kernel.Feature.Propagation` calls it through `PropagationHooks` with the values `installed` through the Activity's
frame, its own boundary's catch variables, or none when the search went on outward and any catch variables are already
written. Under `ErrorPathOutputs.mapped` CIB sets those on the task's execution before `deleteCascade` destroys it and
runs its output parameters (`BpmnExceptionHandler.java:146-154`, `PvmAtomicOperationCancelActivity.java:60`,
`PvmExecutionImpl.java:613-626`, `ExecutionEntity.java:521-525`). An installed value of a name the frame holds, an input
local or a result value the delegate set with `setVariableLocal`, is that local and ends with the Activity; any other
is written outward from the frame first, so an output of its name is written after it. The outputs read the result
`origin.patch` as a completion's do (`completionOutputs`). Both writes apply at once through `write` (`Data.writeOutputs`),
so that the interrupted host's outputs the search evaluates next read them; the Activity's removal is queued as raised. -/
def mappedErrorOutputs (write : Ctx → ScopeOccurrenceId → List (String × Value) → WriteRule → State → Outcome)
    (ctx : Ctx) (origin : Origin) (installed : List (String × Value)) (state : State) : Outcome := do
  let some host := origin.host | .error (.semanticFailure "error-exit-without-host")
  let envelope := (ctx.program.element? origin.element).bind (·.envelope?)
  let frame := state.localScope? host
  let held := (origin.patch ++ (frame.map state.ownVariables).getD []).map (·.1)
  let outward := installed.filter fun (name, _) => !held.contains name
  let mappings := (envelope.map (·.outputs)).getD []
  let frameReads := activityScope ctx state host origin.scope
  let written ← match ctx.program.options.errorPathOutputs with
    | .mapped => completionOutputs ctx state.logicalTimeMs (unconsumed ctx envelope) mappings frameReads installed origin.patch
    | .none => .ok []
  let state ← if outward.isEmpty then .ok state else write ctx (frame.getD origin.scope) outward .outward state
  let state ← write ctx origin.scope written .outward state
  .ok (state.signal (.complete host .raised [] .outward))

/-- An effect's result patch is the work's own result, the names `Work.results` gives (a Script Task's result variable),
which is written to the nearest scope holding each name before the Activity leaves, as `execution.setVariable` does
(`ScriptTaskActivityBehavior.java:56-59`), and its OutputSet, the rest. A BPMN error raises from the Activity with the
occurrence as host, which leaves only once its catcher is known (`mappedErrorOutputs`): it writes no outputs (BPMN 2.0.2
§13.3.2) unless the profile maps them on the error path (CIB-EXT-0004, -0009, -0016). A technical failure has no BPMN
meaning (§13.3.3 defines only a fault) and refuses unless the profile opens an incident (CIB-EXT-0013, CIB-CFG-0008). An
unsupported result ends the input as `unsupported` with the host's code. -/
def effectResult (ctx : Ctx) (item : OpenItem) (outcome : EffectOutcome) (state : State) : Outcome :=
  -- A throw Event's effect has no envelope and so no output mappings (PC-MESSAGE-09).
  let envelope := (ctx.program.element? item.element).bind (·.envelope?)
  let mappings := (envelope.map (·.outputs)).getD []
  match outcome with
  | .success patch => do
    admitValues (patch.map (·.2))
    let results := (((ctx.program.element? item.element).bind (·.activity?)).map (·.2.work.results)).getD []
    let (own, rest) := patch.partition fun (name, _) => results.contains name
    let written ←
      completionOutputs ctx state.logicalTimeMs (unconsumed ctx envelope) mappings (outputScope ctx state item) own rest
    let installed := if own.isEmpty then state
      else state.signal (.write (state.ownScope item.occurrence item.scope) own .outward)
    .ok (installed.signal (effectCompletion envelope (unconsumed ctx envelope) item.occurrence written rest))
  | .businessFailure code message patch => do
    admitValues (patch.map (·.2))
    match ctx.program.options.errorPathOutputs with
    | .mapped => .ok ()
    | .none => if !patch.isEmpty then .error (.rejected "error-path-outputs-not-accepted")
    let activation := ((state.occurrence? item.occurrence).map (·.activation)).getD 0
    .ok (state.signal (.raise (.error code message)
      { element := item.element, scope := item.scope, activation, host := some item.occurrence, patch }))
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
  -- Dynamic-only: what a host could not represent is known only once the effect ran.
  | .unsupported code => .error (.unsupported code)

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

/-- A delivery completes a Receive Task only on the channel it waits on; the Message carries no payload here. The wait
models no key, since admission refuses a Receive Task correlation (`work.receive.correlation`), so a criterion is an API
criterion: `unsupported` under `modeledKey`, which does not select one, and checked in the task's own scope under
`apiCriteria` (`WorkHooks.criteriaHold`), as a Message subscription checks it. The delivery's own variables are the
completion's writes; `Hooks.delivered` admits them only under `DeliveryVariables.installs`. -/
def triggerActivity (hooks : WorkHooks) (ctx : Ctx) (_ : Header) (_ : ActivityPayload) (item : OpenItem) (fired : Fired)
    (state : State) : Outcome :=
  match fired with
  | .timer _ => .error (.semanticFailure "activity-timer-without-timer")
  | .signal _ => .error (.semanticFailure "activity-signal-without-signal")
  | .condition _ => .error (.semanticFailure "activity-condition-without-condition")
  | .message delivery =>
    match item.kind.view.channel with
    | none => .error (.semanticFailure "activity-message-without-message")
    | some channel =>
      if delivery.payload.any (!inValueDomain ·) then .error (.rejected "value-outside-domain")
      else if delivery.trigger.channel? != some channel then .error (.rejected "message-channel-mismatch")
      else do
        let accepted ← match ctx.program.options.messageCorrelation with
          -- dynamic-only: a delivery's criteria are its caller's.
          | .modeledKey => if delivery.correlation.isEmpty then .ok true else .error (.unsupported "profile-message-correlation-api-criteria")
          | .apiCriteria => hooks.criteriaHold state (state.ownScope item.occurrence item.scope) delivery.correlation
        if !accepted then .error (.rejected "message-correlation-mismatch")
        else if delivery.payload.isSome then .error (.rejected "unexpected-message-payload")
        else do
          admitValues (delivery.variables.map (·.2))
          .ok (state.signal (.complete item.occurrence .outgoing delivery.variables .outward))

/-- `Hooks.completeCall`: only a Call Activity starts a called instance. -/
def completeCall (ctx : Ctx) (header : Header) (payload : ActivityPayload) (root : ScopeOccurrence)
    (owner : Occurrence) (state : State) : Outcome :=
  let notCall : Outcome := .error (.semanticFailure "called-instance-without-call")
  match payload.work with
  | .call work => Call.returnFromCall ctx header payload work root owner state
  | .none => notCall
  | .manual => notCall
  | .user _ => notCall
  | .receive _ => notCall
  | .service _ => notCall
  | .send _ => notCall
  | .script _ => notCall
  | .rule _ => notCall

end Kernel.Feature.Work
