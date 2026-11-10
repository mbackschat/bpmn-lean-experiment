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
process instance, CIB ends only the throwing path, which the thrower's own completion already did, and is refused inside
a Multi-Instance or called instance. An Escalation or a Cancel that finds no catcher has no selected meaning.
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

def boundariesOf (ctx : Ctx) (element : ElementId) : List Boundary :=
  (((ctx.program.element? element).bind (·.envelope?)).map (·.boundaries)).getD []

/-- The Event Sub-Processes declared directly in the element of `occurrence`, the process included. -/
def eventSubProcesses (ctx : Ctx) (occurrence : ScopeOccurrence) : List (ElementId × Subscription) :=
  (ctx.program.children occurrence.element).filterMap fun child =>
    child.scope?.bind fun (header, payload) => (ctx.eventStart payload).map fun (start, _) => (header.id, start)

/-- The public identity of a trigger: the thrower's occurrence, as `origin` names it. -/
def throwerRef (state : State) (origin : Origin) : OccurrenceRef :=
  { processInstanceId := state.instanceOf origin.scope, element := origin.element, activation := origin.activation }

/-- Whether the thrower's output mappings would run as its instance ends: it ran directly in its instance's root and
nothing else remains there. CIB then rolls the command back (CIB-LIM-0006). -/
def endsInstanceWithOutputs (ctx : Ctx) (origin : Origin) (state : State) : Bool :=
  let outputs := (((ctx.program.element? origin.element).bind (·.envelope?)).map (·.outputs)).getD []
  !outputs.isEmpty && state.instanceRoot origin.scope == origin.scope && state.idle origin.scope

/-- Refuse an uncaught Error whose path lies inside a Multi-Instance instance or a called instance, walking out from
`current` to the root. What CIB's `execution.end(true)` does to either enclosing instance is PC-ERROR-03's to settle
(CIB-INT-0013's boundary). -/
def enclosingInstances (ctx : Ctx) (state : State) : Nat → ScopeOccurrenceId → Outcome
  | 0, _ => .ok state
  | fuel + 1, current =>
    if ctx.scopeRole state current == .multiInstanceInstance then
      .error (.unsupported "unhandled-error-leaves-multi-instance-instance") -- dynamic-only: where its thrower runs
    else if state.calledRoot current then
      .error (.unsupported "unhandled-error-leaves-called-instance") -- dynamic-only: where its thrower runs
    else match (state.scopes.find? (·.id == current)).bind (·.parent) with
      | some parent => enclosingInstances ctx state fuel parent
      | none => .ok state

/-- An Error no catcher takes. BPMN 2.0.2 Table 10.88 leaves the outcome unspecified, "a common one being termination of
the Process instance": `failsInstance` ends the instance failed, naming the thrower. `endsThrowingPath` is CIB's
`execution.end(true)` (`BpmnExceptionHandler#propagateError`, CIB-INT-0013): the thrower's completion already ended its
path, and the instance goes on or completes as what remains says. -/
def unhandledError (ctx : Ctx) (code : String) (message : Option String) (origin : Origin) (state : State) : Outcome :=
  match ctx.program.options.unhandledError with
  | .failsInstance => .ok (state.signal (.endInstance .failed (some { code, message, occurrence := throwerRef state origin })))
  | .endsThrowingPath => do
    let state ← enclosingInstances ctx state (state.scopes.length + 1) origin.scope
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
variables `caught`: CIB sets those on the Scope's execution and then runs the mappings as it destroys the Scope
(`BpmnExceptionHandler.java:146-153`, `ExecutionEntity.java:521-525`, `OutputParameter.execute`, CIB-EXT-0016). The
mappings are evaluated before the queued write of `caught` applies, so they read `caught` as installed: `setVariable`
on the Scope's execution, the boundary's event scope (`BpmnParse.java:3298,3301`), leaves a caught value in a local of
its name or else at its nearest owner or the root (`Ctx.outputReads`). `destroy` runs the same parameter list as a
normal completion (`IoMapping.java:44-48`), so the outputs read as `Scopes.completeScope`'s do: under
`OutputContext.activityScope` a later one reads an earlier one's write, ahead of a caught value no local holds. -/
def interruptedOutputs (ctx : Ctx) (occurrence : ScopeOccurrence) (parent : ScopeOccurrenceId)
    (caught : List (String × Value)) (state : State) : Outcome :=
  let mappings := (((occurrence.element.bind ctx.program.element?).bind (·.scope?)).map (·.2.envelope.outputs)).getD []
  match ctx.program.options.errorPathOutputs with
  | .mapped =>
    if mappings.isEmpty then .ok state
    else
      let outer := (occurrence.parent.map state.visible).getD []
      let reads := ctx.outputReads state.logicalTimeMs (state.ownVariables occurrence.id) caught outer
      (ctx.requireMappingsWith reads mappings).map fun outputs =>
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
  | .error _ _ =>
    (interruptedOutputs ctx occurrence parent writes caught).map (boundary.fire occurrence.occurrence none parent [])
  | .escalation _ => .ok (boundary.fire occurrence.occurrence none parent [] caught)
  | .cancel =>
    let thrown := throwerRef state origin
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
          let attached := if role == .multiInstanceInstance then [] else boundariesOf ctx element
          let (boundary, writes) ← best? ctx raised (·.subscription.trigger) attached
          pure (leaveOccurrence ctx raised origin occurrence parent boundary writes state)
        match caught with
        | some next => next
        | none => searchScopes ctx raised origin state fuel occurrence.parent

/-- What Propagation asks of the Work feature it may not import (ARCHITECTURE-SPEC "Modules and build shape");
`Kernel.Registry` fills it with `Kernel.Feature.Work.mappedErrorOutputs`: how the Activity `origin.host`, still running
after its business Error, leaves once the values its catcher installs through its frame are known. -/
structure PropagationHooks where
  mappedErrorOutputs : Ctx → Origin → List (String × Value) → State → Outcome := fun _ _ _ state => .ok state

/-- `Signal.raise`. An Activity that raised the event (`origin.host`) is still running: its own boundaries are searched
first, and a catching one installs its variables through the Activity's frame before the Activity leaves with its
mapped Error-path outputs, as CIB sets them on the task's execution before destroying it
(`BpmnExceptionHandler.java:146-154`, CIB-EXT-0028). Otherwise the Activity leaves first, installing nothing, and the
event is raised again without a host, so every other catcher sees it gone (CIB-EXT-0028's boundary). -/
def raise (hooks : PropagationHooks) (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) : Outcome :=
  let hostBoundaries := if ctx.scopeRole state origin.scope == .multiInstanceInstance then [] else boundariesOf ctx origin.element
  match origin.host, best? ctx raised (·.subscription.trigger) hostBoundaries with
  | some _, some (boundary, writes) =>
    (hooks.mappedErrorOutputs ctx origin (lastWrites writes) state).map (boundary.fire none none origin.scope [])
  | some _, none =>
    (hooks.mappedErrorOutputs ctx origin [] state).map (·.signal (.raise raised { origin with host := none, patch := [] }))
  | none, _ => searchScopes ctx raised origin state (state.scopes.length + 1) (some origin.scope)

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
    let triggered := throwerRef state { element := header.id, scope := occurrence.scope, activation := occurrence.activation }
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
