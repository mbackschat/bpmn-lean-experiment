module

public import Kernel.Hooks

/-! # Step

The single step function. It owns dispatch on element kind, event role, input kind, signal and continuation, the one
completion pipeline, and the order in which hooks run. An input's own transition comes first, then the closure: hand
the next signal to its hook; else route the next token to the element at the end of its flow; else complete one idle
scope occurrence; until none is left. A closure that does not settle within `closureBound` steps is `unsupported`,
never silently truncated. Each of those is one micro-step and appends one `Transition` to the journal; a completion
that is the only signal a micro-step enqueued runs inside that micro-step, so a pass-through element begins and
completes in one transition.

A scope occurrence is idle when it holds no token, no blocking open item, no begun occurrence and no child
occurrence, and no slot keeps it alive. An idle Scope element is completed by its hook, an idle called instance's root
by its Call Activity's, an idle Multi-Instance body by its feature; an idle process root completes the instance,
removing the passive items left in it. An Activity's local-variable scope occurrence has no completion of its own: the
completion pipeline disposes of it with its Activity.
-/

public section

namespace Kernel.Step

/-- The name a transition records for a signal. -/
def signalName : Signal → String
  | .arm _ _ _ => "arm"
  | .armScope _ => "armScope"
  | .armGateway _ _ _ => "armGateway"
  | .raise _ _ => "raise"
  | .begin _ => "begin"
  | .complete _ _ _ _ => "complete"
  | .write _ _ _ => "write"
  | .remove _ _ => "remove"
  | .occur _ _ _ _ _ => "occur"
  | .cancel _ => "cancel"
  | .fire _ _ => "fire"
  | .endInstance _ _ => "endInstance"
  | .compensate _ _ _ _ _ => "compensate"
  | .compensationFailed _ _ _ _ => "compensationFailed"

/-- Advance the clock to an input's logical time, `none` leaving it where it is; a time before the clock is rejected,
since logical time never runs backward. -/
def advanceClock (at? : Option Nat) (state : State) : Outcome :=
  match at? with
  | none => .ok state
  | some atMs =>
    if atMs < state.logicalTimeMs then .error (.rejected "logical-time-backward")
    else .ok { state with logicalTimeMs := atMs }

/-- What every input states besides its payload: its tag and its logical time. A Timer firing without its own time
happens at the deadline it names; a host that wakes later states the later time. -/
def inputHead : Input → InputTag × Option Nat
  | .start payload => (.start, payload.atMs)
  | .command payload => (.command, payload.atMs)
  | .deliver payload => (.deliver, payload.atMs)
  | .timerFire payload => (.timerFire, some (payload.atMs.getD payload.logicalTimeMs))
  | .effectResult payload => (.effectResult, payload.atMs)

/-- The loop characteristics of a body occurrence, read from any element's envelope. -/
def bodyLoop? (element : Element) (occurrence : Occurrence) : Option (Envelope × MultiInstance) :=
  if occurrence.role == .multiInstanceBody then
    element.envelope?.bind fun envelope => envelope.multiInstance.map (envelope, ·)
  else none

/-- Dispatch a begun occurrence to its element's feature. The body of a Multi-Instance element goes to the
Multi-Instance hook; each of its instances runs as an ordinary occurrence of the element. -/
def dispatch (hooks : Hooks) (ctx : Ctx) (occurrence : Occurrence) (entry : ScopeEntry) (trigger : StartTrigger)
    (state : State) : Outcome :=
  let toElement (element : Element) : Outcome :=
    match element with
    | .activity header payload => hooks.arriveActivity ctx header payload occurrence state
    | .scope header payload => hooks.arriveScope ctx header payload occurrence entry state
    | .gateway header payload => hooks.arriveGateway ctx header payload occurrence state
    | .start header payload =>
      if occurrence.incoming.isSome then .error (.semanticFailure "flow-into-start-event")
      else hooks.arriveStart ctx header payload trigger occurrence state
    | .event header payload =>
      match payload.role with
      | .catch subscription => hooks.arriveCatch ctx header payload subscription occurrence state
      | .throw thrown => hooks.arriveThrow ctx header payload thrown occurrence state
      | .linkCatch _ => hooks.arriveLink ctx header payload occurrence state
      | .linkThrow _ => hooks.arriveLink ctx header payload occurrence state
  match ctx.program.element? occurrence.element with
  | none => .error (.semanticFailure "begin-without-element")
  | some element =>
    match bodyLoop? element occurrence with
    | some (envelope, loop) => hooks.arriveMultiInstance ctx element.header envelope loop occurrence state
    | none => toElement element

/-- The counter an occurrence numbers under: a Multi-Instance Activity's body apart from its instances. -/
def roleOf (program : Program) (request : BeginRequest) : ActivationRole :=
  let loops := (((program.element? request.element).bind (·.envelope?)).bind (·.multiInstance)).isSome
  match request.continuation with
  | .multiInstance _ => .element
  | .flow => if loops then .multiInstanceBody else .element
  | .compensation _ => if loops then .multiInstanceBody else .element

/-- The `asyncBefore` and `asyncAfter` marks of the occurrence `key`: a Multi-Instance Activity's envelope marks its
body, and its loop characteristics mark each instance (CIB-EXT-0027, `BpmnParse#parseMultiInstanceLoopCharacteristics`). -/
def marks (program : Program) (key : OccurrenceKey) : Bool × Bool :=
  match (program.element? key.element).bind (·.envelope?) with
  | none => (false, false)
  | some envelope =>
    match key.role, envelope.multiInstance with
    | .multiInstanceBody, _ => (envelope.asyncBefore, envelope.asyncAfter)
    -- CIB skips loop marks on a compensation handler (`BpmnParse.java:2416`); admission refuses a Multi-Instance
    -- handler (`compensation.handlerMultiInstance`).
    | .element, some loop => (loop.asyncBefore, loop.asyncAfter)
    | .element, none => (envelope.asyncBefore, envelope.asyncAfter)

/-- Whether the input in progress has crossed a transaction boundary: begun an occurrence marked `asyncBefore`, or
completed one marked `asyncAfter`, in the journal or the micro-step's draft. The kernel's one reader of the marks. -/
def crossed (program : Program) (state : State) : Bool :=
  let facts := state.journal.map (fun transition => (transition.started, transition.ended)) ++
    [(state.draft.started, state.draft.ended)]
  facts.any fun (started, ended) =>
    started.any (fun fact => (marks program fact.occurrence).1) ||
      ended.any fun (key, terminal) => terminal == .completed && (marks program key).2

/-- `outcome`, unless it rolls back or fails after `state` crossed a transaction boundary: CIB commits an input at the
boundary and runs the rest in a job, which alone fails (`ExecutionEntity#performOperation`, CIB-EXT-0027). Rolling the
whole input back would be wrong and the kernel does not split it, so the outcome is `unsupported`. -/
def deferred (program : Program) (state : State) (outcome : Outcome) : Outcome :=
  match outcome with
  | .error (.rolledBack _) | .error (.semanticFailure _) =>
    -- dynamic-only: whether a closure fails after it crossed a boundary depends on the run's data and order
    if crossed program state then .error (.unsupported "async-boundary-failure") else outcome
  | .error (.rejected _) | .error (.unsupported _) | .ok _ => outcome

/-- `outcome` of a timer firing, unless it rolls back: CIB fires a timer in a job, whose failure is a retry and then an
incident, never the rollback of a command (EXPRESSION-SEMANTICS-SPEC, failure outcomes per stimulus), and no track models
a failed timer job yet, so such a firing is `unsupported`. -/
def timerJob (outcome : Outcome) : Outcome :=
  match outcome with
  | .error (.rolledBack _) =>
    -- dynamic-only: whether a firing's closure rolls back depends on the run's data
    .error (.unsupported "timer-job-failure")
  | .error (.rejected _) | .error (.semanticFailure _) | .error (.unsupported _) | .ok _ => outcome

/-- Begin the occurrence `request` names and hand it to its feature. -/
def begin (hooks : Hooks) (ctx : Ctx) (request : BeginRequest) (state : State) : Outcome := do
  let some sourceType := ctx.program.sourceType? request.element | .error (.semanticFailure "begin-without-element")
  let (state, occurrence) := state.beginOccurrence request (roleOf ctx.program request) sourceType
  deferred ctx.program state (dispatch hooks ctx occurrence { locals := request.locals, inner := request.inner } request.trigger state)

/-- The one completion pipeline: disarm, write, retain, continue, remove and journal, in that order. The occurrence's
record and owned scope go before its continuation runs, so that a continuation leaving its instance or handler scope
does not cancel the occurrence that just completed. An occurrence raised away gets no retention, outflow or
continuation. A completion naming an occurrence an earlier signal removed is dropped: CIB leaves a Signal thrower only
after its receivers ran (`ThrowSignalEventActivityBehavior#execute`), and one of them may have ended it. -/
def complete (hooks : Hooks) (ctx : Ctx) (id : Nat) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule)
    (state : State) : Outcome := do
  let some occurrence := state.occurrence? id | .ok state
  let some sourceType := ctx.program.sourceType? occurrence.element | .error (.semanticFailure "complete-without-element")
  let (state, occurrence) := state.startReserved occurrence sourceType
  let state ← hooks.leave ctx occurrence (state.closeOwnItems id)
  let leave ← hooks.select ctx occurrence leave state
  let state ← hooks.writeOutputs ctx occurrence.scope writes rule state
  let key := state.keyOf occurrence
  match leave with
  | .raised => .ok ((state.removeOccurrence id).recordEnd key .cancelled)
  | .outgoing | .flows _ =>
    let state ← hooks.completed ctx occurrence state
    let state := state.removeOccurrence id
    -- An `asyncAfter` boundary lies before the continuation, though the completion's fact is journalled after it.
    let state ← deferred ctx.program (state.recordEnd key .completed) <| match occurrence.continuation with
      | .flow => hooks.outflow ctx occurrence leave state
      | .multiInstance body => hooks.instanceCompleted ctx body occurrence writes state
      | .compensation run => hooks.handlerCompleted ctx run occurrence state
    .ok (state.recordEnd key .completed)

/-- A subscription an Activity opened goes back to its Activity; every other one to `Hooks.trigger`. -/
def fireItem (hooks : Hooks) (ctx : Ctx) (item : OpenItem) (fired : Fired) (state : State) : Outcome :=
  match (ctx.program.element? item.element).bind (·.activity?) with
  | some (header, payload) => hooks.triggerActivity ctx header payload item fired state
  | none => hooks.trigger ctx item fired state

/-- The one writer of `State.status`: everything left in the instance goes first. -/
def endInstance (status : InstanceStatus) (failure : Option InstanceFailure) (state : State) : State :=
  { state.clearInside State.root with status, failure }

def dispatchSignal (hooks : Hooks) (ctx : Ctx) : Signal → State → Outcome
  | .arm host element scope => hooks.arm ctx host element scope
  | .armScope scope => hooks.armScope ctx scope
  | .armGateway occurrence gateway scope => hooks.armGateway ctx occurrence gateway scope
  | .raise event origin => hooks.raise ctx event origin
  | .begin request => begin hooks ctx request
  | .complete occurrence leave writes rule => complete hooks ctx occurrence leave writes rule
  | .write scope writes rule => hooks.writeOutputs ctx scope writes rule
  | .remove scope names => hooks.removeVariables ctx scope names
  | .occur element scope leave writes rule => fun state =>
    let (state, occurrence) := state.reserve element scope
    complete hooks ctx occurrence.id leave writes rule state
  | .cancel occurrence => fun state => .ok (state.cancelOccurrence occurrence)
  | .fire item fired => fun state =>
    match state.openItems.find? (·.id == item) with
    | some open_ => fireItem hooks ctx open_ fired state
    | none => .ok state
  | .endInstance status failure => fun state => .ok (endInstance status failure state)
  | .compensate scope activity trigger leave resume => hooks.compensate ctx scope activity trigger leave resume
  | .compensationFailed handler code message origin => hooks.failCompensation ctx handler code message origin

/-- Run a completion when it is the only signal the micro-step enqueued, inside the micro-step. -/
def absorb (hooks : Hooks) (ctx : Ctx) (before : Nat) (state : State) : Outcome :=
  match state.signals.drop before with
  | [.complete occurrence leave writes rule] =>
    complete hooks ctx occurrence leave writes rule { state with signals := state.signals.take before }
  | _ => .ok state

/-- Turn the draft into one `Transition` and tell the features what the micro-step removed and wrote. -/
def conclude (hooks : Hooks) (ctx : Ctx) (cause : Cause) (element : Option ElementId) (owner : ScopeOccurrenceId)
    (state : State) : Outcome := do
  let draft := state.draft
  let writes := state.writes
  let transition : Transition := { cause, element, owner, started := draft.started, ended := draft.ended }
  -- Newest first while the input runs, reversed once by `orderJournal`: appending copied the journal on every micro-step,
  -- which made a closure quadratic in its length (measured 2026-11-10 on `automatic-loop-beyond-bound`).
  let state := { state with journal := transition :: state.journal, draft := {}, writes := [] }
  let state ← draft.cancelled.foldlM (fun state occurrence => hooks.cancelled ctx occurrence state) state
  hooks.written ctx writes state

/-- One micro-step: run `body`, absorb its sole completion and record the transition. Each stage's failure is
`deferred` against the state it started from, so a boundary an earlier micro-step or stage crossed counts. -/
def microStep (hooks : Hooks) (ctx : Ctx) (cause : Cause) (element : Option ElementId) (owner : ScopeOccurrenceId)
    (body : State → Outcome) (state : State) : Outcome := do
  let before := state.signals.length
  let next ← deferred ctx.program state (body state)
  let absorbed ← deferred ctx.program next (absorb hooks ctx before next)
  deferred ctx.program absorbed (conclude hooks ctx cause element owner absorbed)

/-- Route one token to the element at the end of its flow. -/
def arrive (hooks : Hooks) (ctx : Ctx) (token : Token) (state : State) : Outcome :=
  match ctx.program.target? token.flow with
  | none => .error (.semanticFailure "flow-without-target")
  | some element => begin hooks ctx { element, scope := token.scope, incoming := some token.flow } state

/-- An Activity's local-variable scope occurrence: owned by an Activity that is no Multi-Instance body and calls no
instance. -/
def activityLocal (ctx : Ctx) (state : State) (scope : ScopeOccurrence) : Bool :=
  scope.calledInstance.isNone && (scope.occurrence.bind state.occurrence?).any fun occurrence =>
    (ctx.program.element? occurrence.element).any (·.activity?.isSome) && occurrence.role == .element

/-- Complete an idle scope occurrence through the occurrence that owns it: a Scope's by its hook, a called instance's
root by its Call Activity's, a Multi-Instance body by its feature. -/
def completeIdleScope (hooks : Hooks) (ctx : Ctx) (scope : ScopeOccurrence) (state : State) : Outcome :=
  let notScope : Outcome := .error (.semanticFailure "scope-occurrence-without-scope")
  let toElement (element : Element) (occurrence : Occurrence) : Outcome :=
    match element with
    | .scope header payload => hooks.completeScope ctx header payload scope occurrence state
    | .activity header payload =>
      if scope.calledInstance.isSome then hooks.completeCall ctx header payload scope occurrence state else notScope
    | .event _ _ => notScope
    | .gateway _ _ => notScope
    | .start _ _ => notScope
  match scope.occurrence.bind state.occurrence? with
  | none => notScope
  | some occurrence =>
    match ctx.program.element? occurrence.element with
    | none => notScope
    | some element =>
      match bodyLoop? element occurrence with
      | some (envelope, loop) => hooks.completeBody ctx element.header envelope loop occurrence state
      | none => toElement element occurrence

def closureBound : Nat := 100000

/-- The next scope occurrence other than the root that is idle, which the closure completes through its owner. -/
def idleScope? (ctx : Ctx) (state : State) : Option ScopeOccurrence :=
  state.scopes.find? fun scope => scope.id != State.root && state.idle scope.id && !activityLocal ctx state scope

/-- The token the closure moves next, and the rest: the oldest under `BranchSchedule.orderInvariant`, whose admitted
models no order changes (`flow.concurrentWrite`); the newest under `declarationDepthFirst` (CIB-OP-0016), where `Flow`
queues a split's flows reversed, so each branch runs to its next wait, join or end before the next one starts. Under
`declarationDepthFirst` an idle scope occurrence completes before any token moves, as CIB ends a Sub-Process in the
operation that ends its last execution, before its LIFO queue reaches a sibling branch
(`PvmAtomicOperationActivityEnd:105`). -/
def nextToken (ctx : Ctx) (state : State) : Option (Token × List Token) :=
  let queue := state.tokens
  match ctx.program.options.branchSchedule with
  | .orderInvariant => match queue with
    | [] => none
    | token :: rest => some (token, rest)
  | .declarationDepthFirst =>
    if (idleScope? ctx state).isSome then none else queue.getLast?.map (·, queue.dropLast)

/-- The first parked join that fires when it is offered again, as the gateway, its scope occurrence and the state it
leaves. Table 13.3 activates an Inclusive join by the state, not by an arrival, and `settle` offers the parked joins
only once no signal, token or idle scope occurrence is left, so `Feature.Flow.positions` sees every position: a
completion still queued is no position it can see. Each join is offered its latest parked occurrence, in parking
order; a Parallel join is ready only on an arrival, so offering it never fires it. -/
def reoffer? (hooks : Hooks) (ctx : Ctx) (state : State) : Except Failure (Option (ElementId × ScopeOccurrenceId × State)) :=
  state.slots.parked.foldlM (init := none) fun found waiting =>
    match found, (ctx.program.target? waiting.flow).bind ctx.program.element? with
    | some _, _ => .ok found
    | none, none => .error (.semanticFailure "parked-without-gateway")
    | none, some element =>
      match element.gateway?, ((state.slots.parked.filter fun other => other.scope == waiting.scope &&
          ctx.program.target? other.flow == ctx.program.target? waiting.flow).getLast?).bind (state.occurrence? ·.occurrence) with
      | some (header, payload), some occurrence => do
        let offered ← hooks.arriveGateway ctx header payload occurrence state
        .ok (if offered.signals.isEmpty then none else some (header.id, waiting.scope, offered))
      | _, _ => .error (.semanticFailure "parked-without-gateway")

/-- The journal in the order the micro-steps ran (`conclude` keeps it newest first). -/
def orderJournal (outcome : Outcome) : Outcome :=
  outcome.map fun state => { state with journal := state.journal.reverse }

/-- Signals first, then tokens, then idle scope occurrences, then the parked joins a quiescent closure offers again
(`reoffer?`, journalled with the `idle` cause of the join's scope occurrence), then the instance's completion. -/
def settle (hooks : Hooks) (ctx : Ctx) : Nat → State → Outcome
  | 0, _ => .error (.unsupported "closure-bound") -- dynamic-only: a closure's length depends on the run
  | fuel + 1, state =>
    if state.status != .running then .ok state
    else
      match state.signals, nextToken ctx state with
      | next :: rest, _ => do
        let cause := Cause.signal (signalName next)
        settle hooks ctx fuel (← microStep hooks ctx cause none State.root (dispatchSignal hooks ctx next) { state with signals := rest })
      | [], some (token, rest) => do
        let element := ctx.program.target? token.flow
        settle hooks ctx fuel (← microStep hooks ctx (.arrive token.flow) element token.scope (arrive hooks ctx token)
          { state with tokens := rest })
      | [], none =>
        match idleScope? ctx state with
        | some scope => do
          settle hooks ctx fuel (← microStep hooks ctx (.idle scope.id) scope.element scope.id
            (completeIdleScope hooks ctx scope) state)
        | none => do
          match ← reoffer? hooks ctx state with
          | some (gateway, scope, offered) =>
            settle hooks ctx fuel (← microStep hooks ctx (.idle scope) (some gateway) scope (fun _ => .ok offered) state)
          | none =>
            if state.idle State.root then
              microStep hooks ctx (.idle State.root) none State.root
                (fun state => .ok (endInstance .completed none state)) state
            else .ok state

/-- The open item with the public identity `occurrence` whose view has the detail `detail` reads. -/
def item? {α : Type} (ctx : Ctx) (state : State) (occurrence : OccurrenceRef) (detail : WaitView → Option α) :
    Option OpenItem :=
  state.openItems.find? fun item =>
    ctx.program.publicId item.element == occurrence.element &&
      ((state.occurrence? item.occurrence).map (·.activation)) == some occurrence.activation &&
      (detail item.kind.view).isSome && state.instanceOf item.scope == occurrence.processInstanceId

/-- The begun occurrence with the public identity `ref`, the instance rather than the body of a Multi-Instance element. -/
def occurrenceOf? (ctx : Ctx) (state : State) (ref : OccurrenceRef) : Option Occurrence :=
  state.occurrences.find? fun occurrence =>
    occurrence.begun && occurrence.role == .element && occurrence.activation == ref.activation &&
      ctx.program.publicId occurrence.element == ref.element && state.instanceOf occurrence.scope == ref.processInstanceId

/-- Run `onActivity` on the Activity an open item belongs to. -/
def atActivity (ctx : Ctx) (item : OpenItem) (onActivity : Header → ActivityPayload → Outcome) : Outcome :=
  match (ctx.program.element? item.element).bind (·.activity?) with
  | some (header, payload) => onActivity header payload
  | none => .error (.semanticFailure "activity-item-without-activity")

def command (hooks : Hooks) (ctx : Ctx) (input : CommandInput) (state : State) : Outcome :=
  let incident (action : CommandAction) : Outcome :=
    match item? ctx state input.occurrence (·.incident) with
    | none => .error (.rejected "unknown-incident")
    | some item => hooks.resolveIncident ctx item action state
  let variables (act : Occurrence → Signal) : Outcome :=
    match occurrenceOf? ctx state input.occurrence with
    | none => .error (.rejected "unknown-occurrence")
    | some occurrence => .ok (state.signal (act occurrence))
  match input.action with
  | .completeUserTask values =>
    match item? ctx state input.occurrence (·.userTask) with
    | none => .error (.rejected "unknown-user-task")
    | some item => atActivity ctx item fun header payload =>
      hooks.completeUserTask ctx header payload item values state
  | .retryIncident generation => incident (.retryIncident generation)
  | .cancelIncidentProcess generation => incident (.cancelIncidentProcess generation)
  | .setVariables values =>
    admitValues (values.map (·.2)) *> variables fun occurrence => .write occurrence.scope values .outward
  | .removeVariables names => variables fun occurrence => .remove occurrence.scope names

def deliverEffectResult (hooks : Hooks) (ctx : Ctx) (input : EffectInput) (state : State) : Outcome :=
  match item? ctx state input.occurrence (·.effect) with
  | none => .error (.rejected "unknown-effect")
  | some item => hooks.effectResult ctx item input.outcome state

/-- A continuation an effect result reaches that cannot go on rolls back; under a profile selecting the job-failure
reading (`ContinuationFailure.incident`, CIB-EXT-0026, the boundary of CIB-INT-0003) it instead turns the
effect into a technical failure, the path a real job's retry and incident follow. -/
def effectContinuation (ctx : Ctx) (data : EffectInput) (run : EffectInput → Outcome) : Outcome :=
  match run data, ctx.program.options.continuationFailure, data.outcome with
  | .error (.rolledBack _), .incident, .success _ => run { data with outcome := .technicalFailure }
  | .error (.rolledBack _), .incident, .businessFailure _ _ _ => run { data with outcome := .technicalFailure }
  | result, _, _ => result

/-- Run an input's transition on a running instance, then settle. -/
def onRunning (hooks : Hooks) (ctx : Ctx) (input : Input) (before : Option State) (transition : State → Outcome) : Outcome :=
  match before with
  | none => .error (.rejected "instance-not-started")
  | some state =>
    if state.status != .running then .error (.rejected "instance-not-running")
    else do
      let (tag, at?) := inputHead input
      let start ← advanceClock at? { state with journal := [] }
      orderJournal (settle hooks ctx closureBound (← microStep hooks ctx (.input tag) none State.root transition start))

/-- `Ctx.scopeRole`: read from the slots, since the occurrences that ended there may be gone when an event arrives. -/
def scopeRole (state : State) (scope : ScopeOccurrenceId) : ScopeRole :=
  let holds : Iteration → Bool
    | .active held => held == scope
    | .waiting => false
    | .completed _ => false
  let ownedByInstance := (((state.scopes.find? (·.id == scope)).bind (·.occurrence)).bind state.occurrence?).any fun owner =>
    match owner.continuation with
    | .multiInstance _ => true
    | .flow => false
    | .compensation _ => false
  if state.slots.compensation.runs.any (·.running.any (·.1 == scope)) then .compensationHandler
  else if ownedByInstance || state.slots.multiInstances.any (·.instances.any holds) then .multiInstanceInstance
  else .ordinary

/-- The context every hook of `program` reads, its queries filled from `hooks`. -/
def context (hooks : Hooks) (program : Program) : Ctx :=
  { program, evaluate := hooks.evaluate, catches := hooks.catches, eventStart := hooks.eventStart, scopeRole }

/-- One input. `none` is the state before the instance starts; only a start applies to it. The root's Event
Sub-Process starts are armed before the start Event's tokens move. -/
def step (hooks : Hooks) (program : Program) (before : Option State) (input : Input) : Outcome :=
  let ctx := context hooks program
  match input with
  | .start payload =>
    match before, hooks.selectStart ctx payload.startEvent payload.trigger with
    | some _, _ => .error (.rejected "instance-already-started")
    | none, none => .error (.rejected "no-start-event")
    | none, some start => do
      admitValues (payload.variables.map (·.2))
      let initial ← advanceClock payload.atMs
        ((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root))
      orderJournal <| settle hooks ctx closureBound (← microStep hooks ctx (.input .start) (some start) State.root
        (begin hooks ctx { element := start, scope := State.root, trigger := payload.trigger }) initial)
  | .command data => onRunning hooks ctx input before (command hooks ctx data)
  | .deliver data => onRunning hooks ctx input before fun state =>
    match data.trigger with
    | .message _ =>
      match item? ctx state data.occurrence (·.channel) with
      | none => .error (.rejected "unknown-message-subscription")
      | some item => fireItem hooks ctx item (.message data) state
    | .signal _ =>
      match item? ctx state data.occurrence (·.signal) with
      | none => .error (.rejected "unknown-signal-subscription")
      | some item => fireItem hooks ctx item (.signal data) state
  | .timerFire data => timerJob <| onRunning hooks ctx input before fun state =>
    match item? ctx state data.occurrence (·.deadlineMs) with
    | none => .error (.rejected "unknown-timer")
    | some item => fireItem hooks ctx item (.timer data.logicalTimeMs) state
  | .effectResult data =>
    effectContinuation ctx data fun data =>
      onRunning hooks ctx (.effectResult data) before (deliverEffectResult hooks ctx data)

end Kernel.Step
