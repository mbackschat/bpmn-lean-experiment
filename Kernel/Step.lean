module

public import Kernel.Hooks
public import Kernel.Step.Commit
public import Kernel.Step.Order
public import Kernel.Step.Jobs
public import Kernel.Step.Stale
public import Kernel.Step.Inputs

/-! # Step

The single step function. It owns dispatch on element kind, event role, input kind, signal and continuation, the one
completion pipeline, and the order in which hooks run. An input's own transition comes first, then the closure: hand
the next signal to its hook; else route the next token to the element at the end of its flow, or dispatch the
deferred begin it is as its `begin` signal; else complete one idle scope occurrence; until none is left. A closure
that does not settle within `closureBound` steps, or whose steps together run over more than `closureWorkBound` state
entries, is `unsupported`, never silently truncated. Each of those is one micro-step and appends one `Transition` to
the journal; a completion that is the only signal a micro-step enqueued runs inside that micro-step, so a pass-through
element begins and completes in one transition.

A scope occurrence is idle when it holds no token, no blocking open item, no begun occurrence and no child
occurrence, and no slot keeps it alive. An idle Scope element is completed by its hook, an idle called instance's root
by its Call Activity's, an idle Multi-Instance body by its feature; an idle process root completes the instance,
removing the passive items left in it. An Activity's local-variable scope occurrence has no completion of its own: the
completion pipeline disposes of it with its Activity.

How a micro-step's draft becomes a journalled transition is `Kernel.Step.Commit`; how a closure's failure becomes its
input's outcome where CIB runs the work in a job is `Kernel.Step.Jobs`; what becomes of a queued signal whose target an
interruption removed is `Kernel.Step.Stale`; what an input states besides its payload, and the transitions of a command
and an effect result, are `Kernel.Step.Inputs`.
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
      if occurrence.incoming.isSome then .error (.semanticFailure .invariant "flow-into-start-event")
      else hooks.arriveStart ctx header payload trigger occurrence state
    | .event header payload =>
      match payload.role with
      | .catch subscription => hooks.arriveCatch ctx header payload subscription occurrence state
      | .throw thrown => hooks.arriveThrow ctx header payload thrown occurrence state
      | .linkCatch _ => hooks.arriveLink ctx header payload occurrence state
      | .linkThrow _ => hooks.arriveLink ctx header payload occurrence state
  match ctx.program.element? occurrence.element with
  | none => .error (.semanticFailure .invariant "begin-without-element")
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

/-- An Event Sub-Process start's values (`BeginRequest.writes`), written outward from the scope occurrence its begun
occurrence `occurrence` entered, never from the parent, so a name the Event Sub-Process declares an item for lands in
that item (BPMN 2.0.2 §10.4.2), any other at its nearest owner, as CIB's `setVariables` on the parent's execution does
(CIB-EXT-0025). They are written in the begin's own micro-step, after an interrupting start's clearing and the entry,
before any arming or begin the entry queued runs; a queued write would run after a removal an earlier firing queued and
fail as `gone` where the arming fails as `stale` (`Kernel.Step.Stale`). The entered scope occurrence exists because
admission refuses a looping Event Sub-Process (`scope.multiInstance`), whose begin would enter a Multi-Instance body
instead; admitting one makes `start-writes-without-scope` reachable. -/
def writeStart (hooks : Hooks) (ctx : Ctx) (occurrence : OccurrenceId) (writes : List (String × Value)) (state : State) : Outcome :=
  if writes.isEmpty then .ok state
  else match state.localScope? occurrence with
    | some scope => hooks.writeOutputs ctx scope writes .outward state
    | none => .error (.semanticFailure .invariant "start-writes-without-scope")

/-- Begin the occurrence `request` names, hand it to its feature (`requireScope`) and write its start's values
(`writeStart`). -/
def begin (hooks : Hooks) (ctx : Ctx) (request : BeginRequest) (state : State) : Outcome := do
  let some sourceType := ctx.program.sourceType? request.element | .error (.semanticFailure .invariant "begin-without-element")
  requireScope state request.scope
  let (state, occurrence) := state.beginOccurrence request (roleOf ctx.program request) sourceType
  deferred ctx.program state do
    let entered ← dispatch hooks ctx occurrence { inner := request.inner } request.trigger state
    writeStart hooks ctx occurrence.id request.writes entered

/-- What follows an occurrence that left: its continuation, or, for one raised away, only a compensation run, which
learns that its handler ended without completing (`Hooks.handlerEnded`). -/
def continueAfter (hooks : Hooks) (ctx : Ctx) (occurrence : Occurrence) (leave : Leave) (writes : List (String × Value))
    (state : State) : Outcome :=
  let raised := match leave with
    | .raised => true
    | .outgoing | .flows _ => false
  match occurrence.continuation with
  | .flow => if raised then .ok state else hooks.outflow ctx occurrence leave state
  | .multiInstance body => if raised then .ok state else hooks.instanceCompleted ctx body occurrence writes state
  | .compensation _ =>
    if raised then hooks.handlerEnded ctx occurrence state else hooks.handlerCompleted ctx occurrence state

/-- The one completion pipeline: disarm, write, retain, continue, remove and journal, in that order. The occurrence's
record and owned scope go before its continuation runs, so that a continuation leaving its instance or handler scope
does not cancel the occurrence that just completed. An occurrence raised away gets no retention, outflow or
continuation, only a compensation run's notice (`continueAfter`). A completion naming an occurrence that is gone is an
invariant failure (`queued-work-occurrence-gone`, as `Step.gone` refuses it first), never dropped, and no admitted
schedule reaches it (a 2026-11-11 probe catching one throw at interrupting Signal boundaries on a Sub-Process and on a
task inside it did not): signals run first in, first out, and an interrupting firing withdraws the items inside at once,
so a thrower's completion runs before any cancellation its receivers queue. The kernel thus completes a thrower its receiver then
removes, where CIB leaves it only after its receivers ran (`ThrowSignalEventActivityBehavior#execute`); the order
matters only once a per-activity end state is observed. -/
def complete (hooks : Hooks) (ctx : Ctx) (id : OccurrenceId) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule)
    (state : State) : Outcome := do
  let some occurrence := state.occurrence? id | .error (.semanticFailure .invariant "queued-work-occurrence-gone")
  let some sourceType := ctx.program.sourceType? occurrence.element | .error (.semanticFailure .invariant "complete-without-element")
  let (state, occurrence) := state.startReserved occurrence sourceType
  let state ← hooks.leave ctx occurrence (state.closeOwnItems id)
  let leave ← hooks.select ctx occurrence leave state
  let state ← hooks.writeOutputs ctx occurrence.scope writes rule state
  let key := state.keyOf occurrence
  match leave with
  | .raised => continueAfter hooks ctx occurrence leave writes ((state.removeOccurrence id).recordEnd key .cancelled)
  | .outgoing | .flows _ =>
    let state ← hooks.completed ctx occurrence state
    let state := state.removeOccurrence id
    -- An `asyncAfter` boundary lies before the continuation, though the completion's fact is journalled after it.
    let state ← deferred ctx.program (state.recordEnd key .completed) <| continueAfter hooks ctx occurrence leave writes state
    .ok (state.recordEnd key .completed)

/-- A subscription an Activity opened goes back to its Activity; every other one to `Hooks.trigger`. -/
def fireItem (hooks : Hooks) (ctx : Ctx) (item : OpenItem) (fired : Fired) (state : State) : Outcome :=
  match (ctx.program.element? item.element).bind (·.activity?) with
  | some (header, payload) => hooks.triggerActivity ctx header payload item fired state
  | none => hooks.trigger ctx item fired state

/-- The one writer of `State.status`: everything left in the instance goes first. -/
def endInstance (status : InstanceStatus) (failure : Option InstanceFailure) (state : State) : State :=
  { state.clearInside State.root with status, failure }

/-- What a queued signal does and the targets it names (`Kernel.Step.Stale`). -/
def signalWork (hooks : Hooks) (ctx : Ctx) : Signal → SignalWork
  | .arm host element scope => { scopes := [scope], occurrences := [host], run := hooks.arm ctx host element scope }
  | .armScope scope => { scopes := [scope], run := hooks.armScope ctx scope }
  | .armGateway occurrence gateway scope =>
    { scopes := [scope], occurrences := [occurrence], run := hooks.armGateway ctx occurrence gateway scope }
  | .raise event origin => { holds := fun _ => [origin.scope], run := hooks.raise ctx event origin }
  | .begin request => { scopes := [request.scope], run := begin hooks ctx request }
  | .complete occurrence leave writes rule =>
    { completion := true, acts := [occurrence], run := complete hooks ctx occurrence leave writes rule }
  | .write scope writes rule => { requires := [scope], run := hooks.writeOutputs ctx scope writes rule }
  | .remove scope names => { requires := [scope], run := hooks.removeVariables ctx scope names }
  | .occur element scope leave writes rule => { scopes := [scope], run := fun state => do
    requireScope state scope
    let (state, occurrence) := state.reserve element scope
    complete hooks ctx occurrence.id leave writes rule state }
  | .cancel occurrence => { acts := [occurrence], run := fun state => .ok (state.cancelOccurrence occurrence) }
  | .fire item fired =>
    { holds := fun state => [((state.openItems[item]?).map (·.scope)).getD item.occurrence.scope]
      run := fun state =>
        match state.openItems[item]? with
        | some open_ => fireItem hooks ctx open_ fired state
        | none => .ok state }
  | .endInstance status failure =>
    { holds := fun state => state.scopes.map (·.id), run := fun state => .ok (endInstance status failure state) }
  | .compensate scope activity trigger leave resume =>
    { requires := [scope], run := hooks.compensate ctx scope activity trigger leave resume }
  | .compensationFailed handler code message origin =>
    { requires := [handler], run := hooks.failCompensation ctx handler code message origin }

/-- Run a queued signal, refused when what it names is gone (`SignalWork.perform`). -/
def dispatchSignal (hooks : Hooks) (ctx : Ctx) (signal : Signal) (state : State) : Outcome :=
  (signalWork hooks ctx signal).perform state

/-- Run a completion when it is the only signal the micro-step enqueued, inside the micro-step, as `dispatchSignal` runs
it (`SignalWork.perform`). -/
def absorb (hooks : Hooks) (ctx : Ctx) (before : Nat) (state : State) : Outcome :=
  match state.signals.drop before with
  | [sole] =>
    let work := signalWork hooks ctx sole
    if work.completion then work.perform { state with signals := state.signals.take before } else .ok state
  | _ => .ok state

/-- Turn the draft into the transition of the unit `unit` (`journalDraft`), tell the features what the micro-step
removed and wrote, and queue the micro-step's batches under `unit` (`State.queueBatch`). A unit key the closure already
ran is an invariant failure, never a second transition under one key: no admitted closure runs a unit twice (DC4). -/
def conclude (hooks : Hooks) (ctx : Ctx) (unit : UnitKey) (cause : Cause) (element : Option ElementId)
    (owner : ScopeOccurrenceId) (state : State) : Outcome := do
  if state.transitions.contains unit then .error (.semanticFailure .invariant "unit-key-reused") else
  let journalled := journalDraft unit cause element owner state
  let journalled ← state.draft.cancelled.foldlM (fun state occurrence => hooks.cancelled ctx occurrence state) journalled
  let written ← hooks.written ctx state.writes journalled
  .ok (written.queueBatch unit)

/-- One micro-step: run `body`, absorb its sole completion and record the transition. Each stage's failure is
`deferred` against the state it started from, so a boundary an earlier micro-step or stage crossed counts. -/
def microStep (hooks : Hooks) (ctx : Ctx) (unit : UnitKey) (cause : Cause) (element : Option ElementId)
    (owner : ScopeOccurrenceId) (body : State → Outcome) (state : State) : Outcome := do
  let before := state.signals.length
  let next ← deferred ctx.program state (body state)
  let absorbed ← deferred ctx.program next (absorb hooks ctx before next)
  deferred ctx.program absorbed (conclude hooks ctx unit cause element owner absorbed)

/-- Route a token on `flow` to the element at the end of it. -/
def arrive (hooks : Hooks) (ctx : Ctx) (flow : FlowId) (scope : ScopeOccurrenceId) (state : State) : Outcome :=
  match ctx.program.target? flow with
  | none => .error (.semanticFailure .invariant "flow-without-target")
  | some element => begin hooks ctx { element, scope, incoming := some flow } state

/-- Move one token in its own micro-step: route a flow token to the element at the end of its flow; dispatch a deferred
begin as the `begin` signal it was, with that signal's journal cause. -/
def moveToken (hooks : Hooks) (ctx : Ctx) (unit : UnitKey) (token : Token) (state : State) : Outcome :=
  match token with
  | .flow flow scope =>
    microStep hooks ctx unit (.arrive flow) (ctx.program.target? flow) scope (arrive hooks ctx flow scope) state
  | .begin request =>
    let next := Signal.begin request
    microStep hooks ctx unit (.signal (signalName next)) none State.root (dispatchSignal hooks ctx next) state

/-- An Activity's local-variable scope occurrence: owned by an Activity that is no Multi-Instance body and calls no
instance. -/
def activityLocal (ctx : Ctx) (state : State) (scope : ScopeOccurrence) : Bool :=
  scope.calledInstance.isNone && (scope.occurrence.bind state.occurrence?).any fun occurrence =>
    (ctx.program.element? occurrence.element).any (·.activity?.isSome) && occurrence.role == .element

/-- Complete an idle scope occurrence through the occurrence that owns it: a Scope's by its hook, a called instance's
root by its Call Activity's, a Multi-Instance body by its feature. -/
def completeIdleScope (hooks : Hooks) (ctx : Ctx) (scope : ScopeOccurrence) (state : State) : Outcome :=
  let notScope : Outcome := .error (.semanticFailure .invariant "scope-occurrence-without-scope")
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

/-- The most state entries (`State.entryCount`) a closure's micro-steps may run over together. A micro-step scans the
state's lists, and a closure can grow them at every micro-step (a split whose one branch loops back while the other
waits), so `closureBound` alone lets a closure cost time quadratic in its length: 100000 such steps took 77 s to 200 s
in the TypeScript kernel (measured 2026-11-10). The longest closure of the retained scenarios runs over 12008 entries
(`automatic-loop-long-burst`); a closure of constant small size still meets `closureBound` first. -/
def closureWorkBound : Nat := 10000000

/-- Whether a queued signal names `scope` or a scope occurrence inside it (`SignalWork.names`), which keeps `scope` busy
(DC5): an idle check never completes a scope occurrence that queued work still names. -/
def signalsHold (hooks : Hooks) (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) : Bool :=
  state.queuedSignals.any fun _ signal => ((signalWork hooks ctx signal).names state).any fun named =>
    named.segments.drop (named.segments.length - scope.segments.length) == scope.segments

/-- The next scope occurrence other than the root that is idle, which the closure completes through its owner: no queued
work names it or a scope occurrence inside it (DC5). The busy scope occurrences are computed once per search
(`State.busyScopes`). -/
def idleScope? (hooks : Hooks) (ctx : Ctx) (state : State) : Option ScopeOccurrence :=
  if !state.scopes.any (·.id != State.root) then none
  else
    let busy := state.busyScopes
    state.scopes.find? fun scope => scope.id != State.root && !busy.contains scope.id && !activityLocal ctx state scope &&
      !signalsHold hooks ctx state scope.id

/-- The token the closure moves next, and the rest: the oldest under `BranchSchedule.orderInvariant`, whose admitted
models no order changes (`flow.concurrentWrite`); the newest under `declarationDepthFirst` (CIB-OP-0016), where `Flow`
queues a split's flows reversed and `Feature.MultiInstance` a parallel body's instances, so each branch and each
instance runs to its next wait, join or end before the next one starts. Under `declarationDepthFirst` an idle scope
occurrence completes before any token moves, as CIB ends a Sub-Process in the operation that ends its last execution,
before its LIFO queue reaches a sibling branch (`PvmAtomicOperationActivityEnd:105`). -/
def nextToken (hooks : Hooks) (ctx : Ctx) (log : RunLog) (state : State) : Option (UnitKey × Token) :=
  match ctx.program.options.branchSchedule with
  | .orderInvariant => earliest log state.queuedTokens
  | .declarationDepthFirst => if (idleScope? hooks ctx state).isSome then none else latest log state.queuedTokens

/-- The first parked join that fires when it is offered again, as the gateway, its scope occurrence and the state it
leaves. Table 13.3 activates an Inclusive join by the state, not by an arrival, and `settle` offers the parked joins
only once no signal, token or idle scope occurrence is left, so `Feature.Flow.positions` sees every position: a
completion still queued is no position it can see. Each join is offered its latest parked occurrence, in parking
order; a Parallel join is ready only on an arrival, so offering it never fires it. -/
def reoffer? (hooks : Hooks) (ctx : Ctx) (state : State) :
    Except Failure (Option (ElementId × ScopeOccurrenceId × OccurrenceId × State)) :=
  state.slots.parked.foldlM (init := none) fun found waiting =>
    match found, (ctx.program.target? waiting.flow).bind ctx.program.element? with
    | some _, _ => .ok found
    | none, none => .error (.semanticFailure .invariant "parked-without-gateway")
    | none, some element =>
      match element.gateway?, ((state.slots.parked.filter fun other => other.scope == waiting.scope &&
          ctx.program.target? other.flow == ctx.program.target? waiting.flow).getLast?).bind (state.occurrence? ·.occurrence) with
      | some (header, payload), some occurrence => do
        let offered ← hooks.arriveGateway ctx header payload occurrence state
        .ok (if offered.signals.isEmpty then none else some (header.id, waiting.scope, occurrence.id, offered))
      | _, _ => .error (.semanticFailure .invariant "parked-without-gateway")

/-- How many times the closure already offered the parked occurrence `occurrence` (`UnitRoot.offer`): the offer units
among its transitions, a count, which reads no order. -/
def offerRound (state : State) (occurrence : OccurrenceId) : Nat :=
  (state.transitions.filter fun unit _ => unit.path.isEmpty && unit.root.offerOf? == some occurrence).size

/-- Signals first, in breadth-first key order (`firstBreadth`), then tokens (`nextToken`), then idle scope occurrences,
then the parked joins a quiescent closure offers again (`reoffer?`, journalled with the `idle` cause of the join's scope
occurrence), then the instance's completion, once no signal is queued (DC5). Each unit runs under its unit key, and the
run log `log` records when it ran; the closure's queued work and transitions are content keyed by unit (DC4). -/
def settle (hooks : Hooks) (ctx : Ctx) : Nat → Nat → RunLog → State → Except Failure (State × RunLog)
  | 0, _, _, _ => .error (.unsupported "closure-bound") -- dynamic-only: a closure's length depends on the run
  | fuel + 1, work, log, state =>
    if work < state.entryCount then .error (.unsupported "closure-bound") -- dynamic-only: so does its size
    else if state.status != .running then .ok (state, log)
    else
      let work := work - state.entryCount
      match firstBreadth state.queuedSignals with
      | some (unit, next) => do
        let cause := Cause.signal (signalName next)
        settle hooks ctx fuel work (log.record unit) (← microStep hooks ctx unit cause none State.root
          (dispatchSignal hooks ctx next) { state with queuedSignals := state.queuedSignals.erase unit })
      | none =>
        match nextToken hooks ctx log state with
        | some (unit, token) => do
          settle hooks ctx fuel work (log.record unit)
            (← moveToken hooks ctx unit token { state with queuedTokens := state.queuedTokens.erase unit })
        | none =>
          match idleScope? hooks ctx state with
          | some scope => do
            let unit := UnitKey.ofRoot (.idle scope.id)
            settle hooks ctx fuel work (log.record unit) (← microStep hooks ctx unit (.idle scope.id) scope.element scope.id
              (completeIdleScope hooks ctx scope) state)
          | none => do
            match ← reoffer? hooks ctx state with
            | some (gateway, scope, occurrence, offered) =>
              let unit := UnitKey.ofRoot (.offer occurrence (offerRound state occurrence))
              settle hooks ctx fuel work (log.record unit) (← microStep hooks ctx unit (.idle scope) (some gateway) scope
                (fun _ => .ok offered) state)
            | none =>
              if state.idle State.root && state.queuedSignals.isEmpty then
                let unit := UnitKey.ofRoot (.idle State.root)
                return (← microStep hooks ctx unit (.idle State.root) none State.root
                  (fun state => .ok (endInstance .completed none state)) state, log.record unit)
              else .ok (state, log)

/-- Run an input's transition on a running instance, then settle. The input starts from an empty per-input record
(journal, outbox, draft and write log). A committed state holds no draft or write log, since every micro-step's
`conclude` empties them and the registered `Hooks.cancelled` and `Hooks.written` it then runs refill neither (the
cancellation lane proves it of the draft's end facts, `Proofs.Cancellation.registered_quiet`), so emptying them here
changes no run; it makes the input's journal its own by the step's construction rather than by a property of every
state a step is given. -/
def onRunning (hooks : Hooks) (ctx : Ctx) (input : Input) (before : Option State) (transition : State → Outcome) : Outcome :=
  match before with
  | none => .error (.rejected "instance-not-started")
  | some state =>
    if state.status != .running then .error (.rejected "instance-not-running")
    else do
      let (tag, at?, _) := inputHead input
      let start ← advanceClock at? { state with journal := [], outbox := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] }
      admitChoices hooks ctx
      let unit := UnitKey.ofRoot .input
      orderJournal (settle hooks ctx closureBound closureWorkBound (RunLog.record {} unit)
        (← microStep hooks ctx unit (.input tag) none State.root transition start))

/-- `Ctx.scopeRole`: read from the slots, since the occurrences that ended there may be gone when an event arrives. -/
def scopeRole (state : State) (scope : ScopeOccurrenceId) : ScopeRole :=
  let ownedByInstance := (((state.scopes.find? (·.id == scope)).bind (·.occurrence)).bind state.occurrence?).any fun owner =>
    match owner.continuation with
    | .multiInstance _ => true
    | .flow => false
    | .compensation _ => false
  if state.slots.compensation.runs.any (·.running.any (·.1 == scope)) then .compensationHandler
  else if ownedByInstance || state.slots.multiInstances.any (·.instances.any (·.holds scope)) then .multiInstanceInstance
  else .ordinary

/-- The context every hook of `program` reads, its queries filled from `hooks`. -/
def context (hooks : Hooks) (program : Program) : Ctx :=
  { program, evaluate := hooks.evaluate, catches := hooks.catches, eventStart := hooks.eventStart, scopeRole }

/-- The root starts a start input fires (`Hooks.startsFired`), its submitted values admitted first: values are admitted
before any transition reads them, and a Conditional start's predicate reads the submitted variables
(`Feature.Subscriptions.conditionHolds`), so a value outside the domain rejects the input whole as
`value-outside-domain` (PBV-BOUND-01) before any start's trigger is asked, whatever the start choice would answer. The
start step and a population's Conditional start evaluation (`Population.conditionalStartVerdict`) both fire starts
through it. -/
def admittedStartsFired (hooks : Hooks) (ctx : Ctx) (input : StartInput) : Except Failure (List ElementId) :=
  admitValues ctx.program.options.bounds (input.variables.map (·.2)) *> hooks.startsFired ctx input

/-- One input. `none` is the state before the instance starts; only a start applies to it. The root's Event
Sub-Process starts are armed before the start Event's tokens move. Every hook of the input's closure reads its
ranking of competing Conditional items. -/
def step (hooks : Hooks) (program : Program) (before : Option State) (input : Input) : Outcome :=
  let ctx := { context hooks program with conditionChoices := (inputHead input).2.2 }
  match input with
  | .start payload =>
    match before with
    | some _ => .error (.rejected "instance-already-started")
    | none => do
      let start ← chooseStart payload.startEvent (← admittedStartsFired hooks ctx payload)
      let initial ← advanceClock payload.atMs
        (((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root)).queueBatch
          (.ofRoot .seed))
      admitChoices hooks ctx
      let unit := UnitKey.ofRoot .input
      orderJournal <| settle hooks ctx closureBound closureWorkBound (RunLog.record {} unit) (← microStep hooks ctx unit
        (.input .start) (some start) State.root (begin hooks ctx { element := start, scope := State.root, trigger := payload.trigger })
        initial)
  | .command data => onRunning hooks ctx input before (command hooks ctx data)
  | .deliver data => onRunning hooks ctx input before fun state => do
    let (item, fired) ← hooks.delivered ctx data state
    fireItem hooks ctx item fired state
  | .timerFire data => timerJob ctx.program.options.continuationFailure <| onRunning hooks ctx input before fun state =>
    match item? ctx state data.occurrence (·.deadlineMs) with
    | none => .error (.rejected "unknown-timer")
    | some item => fireItem hooks ctx item (.timer data.logicalTimeMs) state
  | .effectResult data =>
    effectContinuation ctx data fun data =>
      onRunning hooks ctx (.effectResult data) before (deliverEffectResult hooks ctx data)
  -- dynamic-only: an input, which no admission sees; general cancellation is HD4's, refused until its stage fills it
  | .cancelInstance _ => .error (.unsupported "cancel-instance")

end Kernel.Step
