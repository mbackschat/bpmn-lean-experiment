module

public import Kernel.Hooks

/-! # Propagation: throw Events and the search for a catcher

Owns matching on `Throw`. A none End Event consumes its token; a none intermediate throw passes it on. A Terminate
End Event clears the scope occurrence it ends in, which `Step` then completes: inside a Sub-Process the Sub-Process
completes normally and its parent continues, at the process level the instance completes
([BPMN 2.0.2 §13.5.6](../../docs/reference/bpmn-2.0.2/README.md); `terminate-end-event-*` baselines).

An Error, Escalation or Cancel End Event consumes its token and raises its event from the scope occurrence it ran
in. The
search for a catcher ([BPMN 2.0.2 §13.5.3, §13.5.4](../../docs/reference/bpmn-2.0.2/README.md)) visits, in order:
the boundaries of the Activity that raised it, if any; then, for each scope occurrence from the raising one
outward, the Event Sub-Processes the occurrence's element declares, then the boundaries on that element. At each
of those candidate sets the catch trigger with the lowest `Ctx.catches` precedence wins, document order breaking
ties, so an exact code is preferred over a catch-all at the same level but never over a nearer catcher. The search
never passes the occurrence of a compensation handler: what reaches it uncaught is the handler's outcome.

A Compensation throw and a caught Cancel hand their scope occurrence to `Kernel.Feature.Compensation` through
`Signal.compensate`, with what follows once its handlers have completed.
-/

public section

namespace Kernel.Feature.Propagation

/-- The catcher with the lowest precedence among `candidates`, the first in document order on a tie. -/
def best? {α : Type} (ctx : Ctx) (raised : Raised) (trigger : α → Trigger) (candidates : List α) : Option α :=
  (candidates.foldl (fun chosen candidate =>
    match ctx.catches raised (trigger candidate), chosen with
    | none, _ => chosen
    | some rank, none => some (rank, candidate)
    | some rank, some (best, _) => if rank < best then some (rank, candidate) else chosen) none).map (·.2)

def boundaries (ctx : Ctx) (element : ElementId) : List Boundary :=
  (((ctx.program.element? element).bind (·.envelope?)).map (·.boundaries)).getD []

/-- Leave through `boundary`: an interrupting boundary first runs `interrupt`, then the boundary's outgoing flows
start in `scope`, the occurrence that holds the host. -/
def leaveThrough (boundary : Boundary) (scope : ScopeOccurrenceId) (interrupt : State → State) (state : State) :
    State :=
  (if boundary.interrupting then interrupt state else state).emit boundary.outgoing scope

/-- The Event Sub-Processes declared directly in the element of `occurrence`, the process included. -/
def eventSubProcesses (ctx : Ctx) (occurrence : ScopeOccurrence) : List (ElementId × Subscription) :=
  (ctx.program.children occurrence.element).filterMap fun child =>
    child.scope?.bind fun (header, payload) => (ctx.eventStart payload).map fun (start, _) => (header.id, start)

/-- Unhandled events have no meaning selected yet: an uncaught Error or Escalation is refused, never treated as a
none End Event. -/
def unhandled : Raised → Outcome
  | .error _ _ => .error (.unsupported "unhandled-error")
  | .escalation _ => .error (.unsupported "unhandled-escalation")
  | .signal _ => .error (.unsupported "raise-signal")
  | .compensation _ _ => .error (.unsupported "raise-compensation")
  | .cancel => .error (.unsupported "raise-cancel")

/-- Whether a raised event is a Cancel. -/
def isCancel : Raised → Bool
  | .cancel => true
  | .error _ _ => false
  | .escalation _ => false
  | .signal _ => false
  | .compensation _ _ => false

/-- The public identity of the trigger `element` throws in `scope`: a fresh activation of the thrower. -/
def trigger (state : State) (element : ElementId) (scope : ScopeOccurrenceId) : State × OccurrenceRef :=
  let (state, activation) := state.activate element
  (state, { processInstanceId := state.instanceOf scope, element, activation })

/-- An event left a compensation handler's occurrence uncaught: an Error fails the handler; what any other event
means there is not selected. -/
def leaveHandler (raised : Raised) (handler : ScopeOccurrenceId) (origin : Origin) (state : State) : Outcome :=
  match raised with
  | .error code message => .ok (state.signal (.compensationFailed handler code message origin))
  | .escalation _ => .error (.unsupported "compensation-handler-escalation")
  | .signal _ => .error (.unsupported "compensation-handler-signal")
  | .compensation _ _ => .error (.unsupported "compensation-handler-compensation")
  | .cancel => .error (.unsupported "compensation-handler-cancel")

/-- Leave `occurrence`, held in `parent`, through its caught boundary. A Cancel boundary on a Transaction first
cancels the Transaction's interior and runs the compensation handlers retained in it, and only then takes the
boundary's flows ([BPMN 2.0.2 §10.3.5](../../docs/reference/bpmn-2.0.2/README.md) Transaction: the boundary "will
direct the flow after the Transaction has been rolled back and all compensation has been completed"). -/
def leaveOccurrence (raised : Raised) (origin : Origin) (occurrence : ScopeOccurrence) (parent : ScopeOccurrenceId)
    (boundary : Boundary) (state : State) : State :=
  if isCancel raised then
    let (state, thrown) := trigger state origin.element origin.scope
    (state.clearInside occurrence.id).signal
      (.compensate occurrence.id thrown true (boundary.outgoing.map ({ flow := ·, scope := parent })))
  else leaveThrough boundary parent (fun state => (state.leaveScope occurrence.id).disarm occurrence.id.value) state

/-- Search outward from `current`; `fuel` bounds the walk by the number of scope occurrences. The search ends at the
occurrence of a compensation handler. -/
def searchScopes (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) :
    Nat → Option ScopeOccurrenceId → Outcome
  | 0, _ => unhandled raised
  | _, none => unhandled raised
  | fuel + 1, some current =>
    match state.scopes.find? (·.id == current) with
    | none => .error (.semanticFailure "raise-from-missing-scope")
    | some occurrence =>
      if occurrence.compensating then leaveHandler raised occurrence.id origin state else
      match best? ctx raised (·.2.trigger) (eventSubProcesses ctx occurrence) with
      | some (element, _) => .ok (state.signal (.startEventSubProcess element occurrence.id []))
      | none =>
        let caught := do
          let element ← occurrence.element
          let parent ← occurrence.parent
          let boundary ← best? ctx raised (·.subscription.trigger) (boundaries ctx element)
          pure (leaveOccurrence raised origin occurrence parent boundary state)
        match caught with
        | some next => .ok next
        | none => searchScopes ctx raised origin state fuel occurrence.parent

/-- `Signal.raise`. -/
def raise (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) : Outcome :=
  let atHost := origin.host.bind fun host =>
    (best? ctx raised (·.subscription.trigger) (boundaries ctx origin.element)).map fun boundary =>
      leaveThrough boundary origin.scope (fun state => (state.closeItem host).disarm host) state
  match atHost with
  | some next => .ok next
  | none => searchScopes ctx raised origin state (state.scopes.length + 1) (some origin.scope)

/-- A Compensation throw compensates the Activities retained in its scope occurrence and continues once all
handlers have completed; only the global, synchronous form is implemented. -/
def throwCompensation (header : Header) (payload : EventPayload) (thrown : CompensationThrow) (arrival : Arrival)
    (state : State) : Outcome :=
  if thrown.activity.isSome then .error (.unsupported "compensation-throw-activity")
  else if !thrown.waitForCompletion then .error (.unsupported "compensation-throw-asynchronous")
  else
    let resume := match payload.placement with
      | .finish => []
      | .intermediate => payload.outgoing.map ({ flow := ·, scope := arrival.scope })
    let (state, triggered) := trigger state header.id arrival.scope
    .ok (state.signal (.compensate arrival.scope triggered false resume))

def arriveThrow (_ : Ctx) (header : Header) (payload : EventPayload) (thrown : Throw) (arrival : Arrival)
    (state : State) : Outcome :=
  let origin : Origin := { element := header.id, scope := arrival.scope }
  let passOn (state : State) : State :=
    match payload.placement with
    | .finish => state
    | .intermediate => state.emit payload.outgoing arrival.scope
  match thrown with
  | .none => .ok (passOn state)
  | .terminate => .ok (state.clearInside arrival.scope)
  | .error record => .ok ((passOn state).signal (.raise (.error record.code record.message) origin))
  | .escalation record => .ok ((passOn state).signal (.raise (.escalation record.code) origin))
  | .message _ => .error (.unsupported "message-throw")
  | .signal _ => .error (.unsupported "signal-throw")
  | .compensation record => throwCompensation header payload record arrival state
  | .cancel => .ok ((passOn state).signal (.raise .cancel origin))

end Kernel.Feature.Propagation
