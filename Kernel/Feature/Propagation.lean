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

An Error that finds no catcher does what the profile selects (`UnhandledError`): the standards reading fails the
process instance, CIB ends only the throwing path, which the thrower's own completion already did. An Escalation or a
Cancel that finds no catcher has no selected meaning.
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

/-- The public identity of a trigger: the thrower's occurrence, as `origin` names it. -/
def trigger (state : State) (origin : Origin) : OccurrenceRef :=
  { processInstanceId := state.instanceOf origin.scope, element := origin.element, activation := origin.activation }

/-- Whether the thrower's output mappings would run as its instance ends: it ran directly in its instance's root and
nothing else remains there. CIB then rolls the command back (CIB-LIM-0006). -/
def endsInstanceWithOutputs (ctx : Ctx) (origin : Origin) (state : State) : Bool :=
  let outputs := (((ctx.program.element? origin.element).bind (·.envelope?)).map (·.outputs)).getD []
  !outputs.isEmpty && state.instanceRoot origin.scope == origin.scope && state.idle origin.scope

/-- An Error no catcher takes. BPMN 2.0.2 Table 10.88 leaves the outcome unspecified, "a common one being termination of
the Process instance": `failsInstance` ends the instance failed, naming the thrower. `endsThrowingPath` is CIB's
`execution.end(true)` (`BpmnExceptionHandler#propagateError`, CIB-INT-0013): the thrower's completion already ended its
path, and the instance goes on or completes as what remains says. -/
def unhandledError (ctx : Ctx) (code : String) (message : Option String) (origin : Origin) (state : State) : Outcome :=
  match ctx.program.options.unhandledError with
  | .failsInstance => .ok (state.signal (.endInstance .failed (some { code, message, occurrence := trigger state origin })))
  | .endsThrowingPath =>
    if !endsInstanceWithOutputs ctx origin state then .ok state
    else .error (.unsupported "unhandled-error-ends-instance-with-outputs") -- dynamic-only: whether its path is the last

/-- The search found no catcher: it ended at `handler`, the scope occurrence of a compensation handler, which an Error
fails, or it passed its instance's root. What an Escalation or a Cancel means at either is not selected. Dynamic-only:
whether a raised event finds a catcher depends on where its thrower runs. -/
def exhausted (ctx : Ctx) (raised : Raised) (origin : Origin) (handler : Option ScopeOccurrenceId) (state : State) :
    Outcome :=
  match raised, handler with
  | .error code message, some context => .ok (state.signal (.compensationFailed context code message origin))
  | .error code message, none => unhandledError ctx code message origin state
  | .escalation _, some _ => .error (.unsupported "compensation-handler-escalation") -- dynamic-only: what a handler raises
  | .escalation _, none => .error (.unsupported "unhandled-escalation") -- dynamic-only: where its thrower runs
  | .cancel, some _ => .error (.unsupported "compensation-handler-cancel") -- dynamic-only: what a handler raises
  | .cancel, none => .error (.unsupported "raise-cancel") -- dynamic-only: where its thrower runs

/-- Write a catch's code and message variables from the catcher's event scope outward: CIB sets them on the execution of
the boundary's host or of the Event Sub-Process's enclosing scope (`BpmnExceptionHandler#propagateError`,
CIB-EXT-0028). Admission refuses them unless the profile selects them. -/
def writeCaught (scope : ScopeOccurrenceId) (writes : List (String × Value)) (state : State) : State :=
  if writes.isEmpty then state else state.signal (.write scope writes .outward)

/-- Under `ErrorPathOutputs.mapped` a Scope an Error boundary interrupts writes its output mappings, after the catch
variables: CIB runs them as it destroys the Scope (`ExecutionEntity.destroy`, `OutputParameter.execute`,
CIB-EXT-0016). -/
def interruptedOutputs (ctx : Ctx) (occurrence : ScopeOccurrence) (parent : ScopeOccurrenceId) (state : State) :
    Outcome :=
  let mappings := (((occurrence.element.bind ctx.program.element?).bind (·.scope?)).map (·.2.envelope.outputs)).getD []
  match ctx.program.options.errorPathOutputs with
  | .mapped =>
    if mappings.isEmpty then .ok state
    else (ctx.requireMappings (state.evalContext occurrence.id) mappings).map fun outputs =>
      state.signal (.write parent outputs .outward)
  | .none => .ok state

/-- Leave `occurrence`, held in `parent`, through its caught boundary. A Cancel boundary on a Transaction first
cancels the Transaction's interior and runs the compensation handlers retained in it, and only then takes the
boundary's flows ([BPMN 2.0.2 §10.3.5](../../docs/reference/bpmn-2.0.2/README.md) Transaction: the boundary "will
direct the flow after the Transaction has been rolled back and all compensation has been completed"). -/
def leaveOccurrence (ctx : Ctx) (raised : Raised) (origin : Origin) (occurrence : ScopeOccurrence)
    (parent : ScopeOccurrenceId) (boundary : Boundary) (writes : List (String × Value)) (state : State) : Outcome :=
  let caught := writeCaught occurrence.id writes state
  match raised with
  | .error _ _ => (interruptedOutputs ctx occurrence parent caught).map (boundary.fire occurrence.occurrence none parent [])
  | .escalation _ => .ok (boundary.fire occurrence.occurrence none parent [] caught)
  | .cancel =>
    let thrown := trigger state origin
    .ok ((state.clearInside occurrence.id).signal (.compensate occurrence.id none thrown occurrence.occurrence
      (some (.occur boundary.id parent (.flows boundary.outgoing)))))

/-- Search outward from `current`; `fuel` bounds the walk by the number of scope occurrences. The search ends at the
scope occurrence of a compensation handler, and a Multi-Instance instance contributes no boundaries. -/
def searchScopes (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) :
    Nat → Option ScopeOccurrenceId → Outcome
  | 0, _ => exhausted ctx raised origin none state
  | _, none => exhausted ctx raised origin none state
  | fuel + 1, some current =>
    match state.scopes.find? (·.id == current) with
    | none => .error (.semanticFailure "raise-from-missing-scope")
    | some occurrence =>
      let role := ctx.scopeRole state occurrence.id
      if role == .compensationHandler then exhausted ctx raised origin (some occurrence.id) state else
      match best? ctx raised (·.2.trigger) (eventSubProcesses ctx occurrence) with
      | some ((element, _), writes) =>
        .ok ((writeCaught occurrence.id writes state).signal (.begin { element, scope := occurrence.id }))
      | none =>
        let caught := do
          let element ← occurrence.element
          let parent ← occurrence.parent
          let attached := if role == .multiInstanceInstance then [] else boundaries ctx element
          let (boundary, writes) ← best? ctx raised (·.subscription.trigger) attached
          pure (leaveOccurrence ctx raised origin occurrence parent boundary writes state)
        match caught with
        | some next => next
        | none => searchScopes ctx raised origin state fuel occurrence.parent

/-- `Signal.raise`. -/
def raise (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) : Outcome :=
  let hostBoundaries := if ctx.scopeRole state origin.scope == .multiInstanceInstance then [] else boundaries ctx origin.element
  let atHost := origin.host.bind fun _ =>
    (best? ctx raised (·.subscription.trigger) hostBoundaries).map fun (boundary, writes) =>
      boundary.fire none none origin.scope [] (writeCaught origin.scope writes state)
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
