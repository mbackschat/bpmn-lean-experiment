module

public import Kernel.Hooks

/-! # Propagation: throw Events and the search for a catcher

Owns matching on `Throw` and `Raised`. A none End Event consumes its token; a none intermediate throw passes it on. A
Terminate End Event clears the scope occurrence it ends in, which `Step` then completes: inside a Sub-Process the
Sub-Process completes normally and its parent continues, at the process level the instance completes
([BPMN 2.0.2 §13.5.6](../../docs/reference/bpmn-2.0.2/README.md)).

An Error, Escalation or Cancel End Event consumes its token and raises its event from the scope occurrence it ran in.
The search for a catcher ([BPMN 2.0.2 §13.5.3, §13.5.4](../../docs/reference/bpmn-2.0.2/README.md)) visits, in order:
the boundaries of the Activity that raised it, if any; then, for each scope occurrence from the raising one outward,
the Event Sub-Processes the occurrence's element declares, then the boundaries on that element. At each of those
candidate sets the catch trigger with the lowest `Ctx.catches` precedence wins, document order breaking ties, so an
exact code is preferred over a catch-all at the same level (CIB `ErrorEventDefinition#getPrecedence`) but never over a
nearer catcher. The search never passes the scope occurrence of a compensation handler: what reaches it uncaught is
the handler's outcome. A Multi-Instance instance's scope occurrence offers no boundaries of its own: they belong to the
body, whose scope occurrence is the next one out (`BpmnParse:3291-3295`, BPMN 2.0.2 §13.5.3).

A boundary that catches begins its occurrence and leaves on its flows. A Compensation throw and a caught Cancel hand
their scope occurrence to `Kernel.Feature.Compensation` through `Signal.compensate`, with what follows once its
handlers have completed.
-/

public section

namespace Kernel.Feature.Propagation

/-- The catcher with the lowest precedence among `candidates`, the first in document order on a tie, with what it
writes. -/
def best? {α : Type} (ctx : Ctx) (raised : Raised) (trigger : α → Trigger) (candidates : List α) :
    Option (α × List (String × Value)) :=
  (candidates.foldl (fun chosen candidate =>
    match ctx.catches raised (trigger candidate), chosen with
    | none, _ => chosen
    | some caught, none => some (caught, candidate)
    | some caught, some (best, _) => if caught.rank < best.rank then some (caught, candidate) else chosen) none).map
    fun (caught, candidate) => (candidate, caught.writes)

def boundaries (ctx : Ctx) (element : ElementId) : List Boundary :=
  (((ctx.program.element? element).bind (·.envelope?)).map (·.boundaries)).getD []

/-- The Event Sub-Processes declared directly in the element of `occurrence`, the process included. -/
def eventSubProcesses (ctx : Ctx) (occurrence : ScopeOccurrence) : List (ElementId × Subscription) :=
  (ctx.program.children occurrence.element).filterMap fun child =>
    child.scope?.bind fun (header, payload) => (ctx.eventStart payload).map fun (start, _) => (header.id, start)

/-- Unhandled events have no meaning selected yet: an uncaught Error or Escalation is refused, never treated as a
none End Event. Dynamic-only: whether a raised event finds a catcher depends on where its thrower runs. -/
def unhandled : Raised → Outcome
  | .error _ _ => .error (.unsupported "unhandled-error") -- dynamic-only: where its thrower runs
  | .escalation _ => .error (.unsupported "unhandled-escalation") -- dynamic-only: where its thrower runs
  | .cancel => .error (.unsupported "raise-cancel") -- dynamic-only: where its thrower runs

/-- The public identity of a trigger: the thrower's occurrence, as `origin` names it. -/
def trigger (state : State) (origin : Origin) : OccurrenceRef :=
  { processInstanceId := state.instanceOf origin.scope, element := origin.element, activation := origin.activation }

/-- An event left a compensation handler's context uncaught: an Error fails the handler; what any other event means
there is not selected. Dynamic-only: admission restricts handlers, but what they raise depends on the run. -/
def leaveHandler (raised : Raised) (handler : ScopeOccurrenceId) (origin : Origin) (state : State) : Outcome :=
  match raised with
  | .error code message => .ok (state.signal (.compensationFailed handler code message origin))
  | .escalation _ => .error (.unsupported "compensation-handler-escalation") -- dynamic-only: what a handler raises
  | .cancel => .error (.unsupported "compensation-handler-cancel") -- dynamic-only: what a handler raises

/-- Leave `occurrence`, held in `parent`, through its caught boundary. A Cancel boundary on a Transaction first
cancels the Transaction's interior and runs the compensation handlers retained in it, and only then takes the
boundary's flows ([BPMN 2.0.2 §10.3.5](../../docs/reference/bpmn-2.0.2/README.md) Transaction: the boundary "will
direct the flow after the Transaction has been rolled back and all compensation has been completed"). -/
def leaveOccurrence (raised : Raised) (origin : Origin) (occurrence : ScopeOccurrence) (parent : ScopeOccurrenceId)
    (boundary : Boundary) (writes : List (String × Value)) (state : State) : State :=
  if raised.isCancel then
    let thrown := trigger state origin
    (state.clearInside occurrence.id).signal (.compensate occurrence.id none thrown occurrence.occurrence
      (some (.occur boundary.id parent (.flows boundary.outgoing))))
  else
    boundary.fire occurrence.occurrence none parent writes state

/-- Search outward from `current`; `fuel` bounds the walk by the number of scope occurrences. The search ends at the
scope occurrence of a compensation handler, and a Multi-Instance instance contributes no boundaries. -/
def searchScopes (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) :
    Nat → Option ScopeOccurrenceId → Outcome
  | 0, _ => unhandled raised
  | _, none => unhandled raised
  | fuel + 1, some current =>
    match state.scopes.find? (·.id == current) with
    | none => .error (.semanticFailure "raise-from-missing-scope")
    | some occurrence =>
      let role := ctx.scopeRole state occurrence.id
      if role == .compensationHandler then leaveHandler raised occurrence.id origin state else
      match best? ctx raised (·.2.trigger) (eventSubProcesses ctx occurrence) with
      | some ((element, _), writes) => .ok (state.signal (.begin { element, scope := occurrence.id, locals := writes }))
      | none =>
        let caught := do
          let element ← occurrence.element
          let parent ← occurrence.parent
          let attached := if role == .multiInstanceInstance then [] else boundaries ctx element
          let (boundary, writes) ← best? ctx raised (·.subscription.trigger) attached
          pure (leaveOccurrence raised origin occurrence parent boundary writes state)
        match caught with
        | some next => .ok next
        | none => searchScopes ctx raised origin state fuel occurrence.parent

/-- `Signal.raise`. -/
def raise (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) : Outcome :=
  let hostBoundaries := if ctx.scopeRole state origin.scope == .multiInstanceInstance then [] else boundaries ctx origin.element
  let atHost := origin.host.bind fun _ =>
    (best? ctx raised (·.subscription.trigger) hostBoundaries).map fun (boundary, writes) =>
      boundary.fire none none origin.scope writes state
  match atHost with
  | some next => .ok next
  | none => searchScopes ctx raised origin state (state.scopes.length + 1) (some origin.scope)

/-- How a throw Event leaves once it has done its work. -/
def throwLeave (payload : EventPayload) : Leave :=
  match payload.placement with
  | .finish => .flows []
  | .intermediate => .outgoing

/-- A Compensation throw compensates the Activities retained in its scope occurrence and continues once all
handlers have completed; only the global, synchronous form is implemented (`throw.compensation.*` at admission). -/
def throwCompensation (header : Header) (payload : EventPayload) (thrown : CompensationThrow) (occurrence : Occurrence)
    (state : State) : Outcome :=
  if thrown.activity.isSome then .error (.unsupported "throw-compensation-activity")
  else if !thrown.waitForCompletion then .error (.unsupported "throw-compensation-asynchronous")
  else
    let triggered := trigger state { element := header.id, scope := occurrence.scope, activation := occurrence.activation }
    .ok (state.signal (.compensate occurrence.scope thrown.activity triggered none
      (some (.complete occurrence.id (throwLeave payload)))))

def arriveThrow (_ : Ctx) (header : Header) (payload : EventPayload) (thrown : Throw) (occurrence : Occurrence)
    (state : State) : Outcome :=
  let origin : Origin := { element := header.id, scope := occurrence.scope, activation := occurrence.activation }
  let leave (state : State) : State := state.signal (.complete occurrence.id (throwLeave payload) [] .outward)
  match thrown with
  | .none => .ok (leave state)
  | .terminate => .ok ((state.clearInside occurrence.scope [occurrence.id]).signal
      (.complete occurrence.id (.flows []) [] .outward))
  | .error record =>
    -- `throw.error.message` at admission refuses an expression, the only message the kernel cannot read.
    .ok ((leave state).signal (.raise (.error record.code (record.message.bind ValueSource.literal?)) origin))
  | .escalation record => .ok ((leave state).signal (.raise (.escalation record.code) origin))
  -- Admission refuses both (`throw.message`, `throw.signal`).
  | .message _ => .error (.unsupported "throw-message")
  | .signal _ => .error (.unsupported "throw-signal")
  | .compensation record => throwCompensation header payload record occurrence state
  | .cancel => .ok ((leave state).signal (.raise .cancel origin))

end Kernel.Feature.Propagation
