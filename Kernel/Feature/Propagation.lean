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
process instance, CIB ends only the throwing path, which the thrower's leave ends, and is refused inside a
Multi-Instance instance. An Escalation that finds no catcher lets its thrower leave and changes nothing else; a Cancel
that finds none has no selected meaning.
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

/-- The Event Sub-Processes declared directly in `occurrence`, the process included, each with its start and whether it
interrupts; a called root's are its called process's (`State.childrenOf`). -/
def eventSubProcesses (ctx : Ctx) (state : State) (occurrence : ScopeOccurrence) : List (ElementId × Subscription × Bool) :=
  (state.childrenOf ctx.program occurrence.id).filterMap fun child =>
    child.scope?.bind fun (header, payload) => (ctx.eventStart payload).map fun (start, interrupting) =>
      (header.id, start, interrupting)

/-- How a throw Event leaves once it has done its work. -/
def throwLeave (payload : EventPayload) : Leave :=
  match payload.placement with
  | .finish => .flows []
  | .intermediate => .outgoing

/-- An Escalation's thrower leaves once the search has decided, unless its catcher interrupts and so cancels it with
the scope that holds it: CIB starts the catcher's handler and only then leaves the throw, and only when the catcher
does not interrupt (`ThrowEscalationEventActivityBehavior.java:44-48`). Only an Escalation's search calls this;
`arriveThrow` leaves an Error or a Cancel throw before raising it. -/
def throwerLeaves (ctx : Ctx) (origin : Origin) (state : State) : State :=
  let standing := state.occurrences.find? fun occurrence =>
    occurrence.element == origin.element && occurrence.scope == origin.scope && occurrence.activation == origin.activation
  match standing, (ctx.program.element? origin.element).bind (·.event?) with
  | some occurrence, some (_, payload) => state.signal (.complete occurrence.id (throwLeave payload) [] .outward)
  | _, _ => state

/-- Whether the search passes the Event Sub-Process a raise originates in however deep inside it the raise runs, or
only when it runs directly in it. CIB's Error finder skips an ancestor flow scope at any depth
(`bpmn/helper/ErrorDeclarationForProcessInstanceFinder.java:41-58`, `pvm/process/ScopeImpl.java:170-182`), its
Escalation finder only the thrower's direct flow scope (`bpmn/helper/EscalationEventDefinitionFinder.java:58-61`). No
Event Sub-Process catches a Cancel (`start.cancel`), so its answer is never read. -/
def passesHandlerAtAnyDepth : Raised → Bool
  | .error _ _ => true
  | .escalation _ => false
  | .cancel => true

/-- The scope occurrence held directly in `visited` that the chain from `current` outward passes through, if any;
`fuel` bounds the walk by the number of scope occurrences. -/
def heldOnChain (state : State) (visited : ScopeOccurrenceId) : Nat → ScopeOccurrenceId → Option ScopeOccurrence
  | 0, _ => none
  | fuel + 1, current =>
    (state.scopes.find? (·.id == current)).bind fun occurrence =>
      if occurrence.parent == some visited then some occurrence
      else occurrence.parent.bind (heldOnChain state visited fuel)

/-- The Event Sub-Processes of `occurrence` that may catch a raise from `origin` (PC-ERROR-02). One the raise
originates inside is no candidate, so a rethrow passes the handler that runs it, or that an interrupting handler's
completion is disposing of, to the host's boundaries and outward (BPMN 2.0.2 §13.5.4: "control passes to the boundary
Event"; CIB-INT-0022). Refused, dynamic-only because they rest on what a running handler raises: an Escalation from
deeper inside a handler that matches it, which CIB catches with that handler again (`escalation-rethrow-reenters-handler`);
and a raise from an interrupting handler that another Event Sub-Process of the same scope would catch, which §13.5.4
rules out ("new Event Handlers MUST NOT be started" while the parent is Failing or Terminating) and CIB starts
(CIB-DEV-0003). -/
def handlerCandidates (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) (occurrence : ScopeOccurrence) :
    Except Failure (List (ElementId × Subscription × Bool)) :=
  let handlers := eventSubProcesses ctx state occurrence
  let held := heldOnChain state occurrence.id (state.scopes.length + 1) origin.scope
  match held.bind fun held => (handlers.find? (some ·.1 == held.element)).map (held, ·) with
  | none => .ok handlers
  | some (held, (element, start, interrupting)) =>
    let others := handlers.filter (·.1 != element)
    if (ctx.catches raised start.trigger).isSome && !passesHandlerAtAnyDepth raised && origin.scope != held.id then
      .error (.unsupported "escalation-rethrow-reenters-handler") -- dynamic-only: how deep in its handler a raise runs
    else if interrupting && (best? ctx raised (·.2.1.trigger) others).isSome then
      .error (.unsupported "rethrow-caught-by-sibling-handler") -- dynamic-only: what a running handler raises
    else .ok others

/-- The public identity of a trigger: the thrower's occurrence, as `origin` names it. -/
def throwerRef (state : State) (origin : Origin) : OccurrenceRef :=
  { processInstanceId := state.instanceOf origin.scope, element := origin.element, activation := origin.activation }

/-- What Propagation asks of the features it may not import (ARCHITECTURE-SPEC "Modules and build shape"), which
`Kernel.Registry` fills. `mappedErrorOutputs` (`Work.mappedErrorOutputs`): how the Activity `origin.host`, still running
after its business Error, leaves once the search has decided, given the values its own boundary installs through its
frame; its writes apply at once and its removal is queued. `writeCaught`: a catcher's code and message variables,
written at once from its event scope outward (`Data.writeOutputs`), so that the outputs that run next read them.
`callOutputs`: what a raised Error or Escalation that reaches the
root of a called instance writes into the caller, the Call's output mappings under CIB-EXT-0034
(`Work.Call.raisedOutputs`; [scopes semantics](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md), PC-SCOPE-06
item 2), applied before the search goes on so that an outer Call's pass reads it. -/
structure PropagationHooks where
  mappedErrorOutputs : Ctx → Origin → List (String × Value) → State → Outcome := fun _ _ _ state => .ok state
  writeCaught : Ctx → ScopeOccurrenceId → List (String × Value) → State → Outcome := fun _ _ _ state => .ok state
  callOutputs : Ctx → ScopeOccurrence → State → Outcome := fun _ _ state => .ok state

/-- The Activity `origin.host` that raised a business Error leaves, with its Error-path outputs, once the search has
decided: after every Call output pass and the catcher's variables, before the interrupted host's outputs, the
catcher's start, a compensation handler's failure or the unhandled outcome. CIB's search starts at the task's own
execution, which a Service Task with output parameters is (`BpmnParse.java:4803-4814`), and destroys it only when the
catcher starts or the path ends: an interrupting boundary's `deleteCascade` destroys it before its host
(`PvmAtomicOperationCancelActivity.java:60`, `PvmAtomicOperationDeleteCascade.java:37-66`), an interrupting Event
Sub-Process's `clearScope` with its event scope's other children (`PvmAtomicOperationInterruptScope.java:30-48`,
`PvmExecutionImpl.java:345-359`), and an uncaught Error's `end(true)` after the walk
(`BpmnExceptionHandler.java:129-137`); each runs the task's output parameters as it destroys the execution
(`ExecutionEntity.java:521-525`, CIB-EXT-0016). A raise without a host has nothing to leave: a throw Event left
before raising, or leaves through `throwerLeaves`. -/
def hostLeaves (hooks : PropagationHooks) (ctx : Ctx) (origin : Origin) (state : State) : Outcome :=
  match origin.host with
  | some _ => hooks.mappedErrorOutputs ctx origin [] state
  | none => .ok state

/-- Whether the thrower's output mappings would run as its instance ends: it ran directly in its instance's root and
nothing but the thrower, whose leave is queued (`hostLeaves`), remains there. CIB then rolls the command back
(CIB-LIM-0006). -/
def endsInstanceWithOutputs (ctx : Ctx) (origin : Origin) (state : State) : Bool :=
  let outputs := (((ctx.program.element? origin.element).bind (·.envelope?)).map (·.outputs)).getD []
  let left := match origin.host with
    | some host => state.idleWithout origin.scope host
    | none => state.idle origin.scope
  !outputs.isEmpty && state.instanceRoot origin.scope == origin.scope && left

/-- Refuse an uncaught Error whose path lies inside a Multi-Instance instance, walking out from `current` to the root.
What CIB's `execution.end(true)` does to an enclosing instance is PC-ERROR-03's to settle (CIB-INT-0013's boundary).
A called instance is no such boundary: the thrower's path ends there, and with nothing left the called instance ends
and its Call returns normally, unless the thrower's outputs would run as it ends (`endsInstanceWithOutputs`,
`finance-unlisted-code`, CIB-LIM-0006). -/
def enclosingInstances (ctx : Ctx) (state : State) : Nat → ScopeOccurrenceId → Outcome
  | 0, _ => .ok state
  | fuel + 1, current =>
    if ctx.scopeRole state current == .multiInstanceInstance then
      .error (.unsupported "unhandled-error-leaves-multi-instance-instance") -- dynamic-only: where its thrower runs
    else match (state.scopes.find? (·.id == current)).bind (·.parent) with
      | some parent => enclosingInstances ctx state fuel parent
      | none => .ok state

/-- An Error no catcher takes. BPMN 2.0.2 Table 10.88 leaves the outcome unspecified, "a common one being termination of
the Process instance": `failsInstance` ends the instance failed, naming the thrower. `endsThrowingPath` is CIB's
`execution.end(true)` (`BpmnExceptionHandler#propagateError`, CIB-INT-0013): the thrower's leave, queued ahead, ends its
path, and the instance goes on or completes as what remains says. -/
def unhandledError (ctx : Ctx) (code : String) (message : Option String) (origin : Origin) (state : State) : Outcome :=
  match ctx.program.options.unhandledError with
  | .failsInstance => .ok (state.signal (.endInstance .failed (some { code, message, occurrence := throwerRef state origin })))
  | .endsThrowingPath => do
    let state ← enclosingInstances ctx state (state.scopes.length + 1) origin.scope
    if !endsInstanceWithOutputs ctx origin state then .ok state
    else .error (.unsupported "unhandled-error-ends-instance-with-outputs") -- dynamic-only: whether its path is the last

/-- The search found no catcher: it ended at `handler`, the scope occurrence of a compensation handler, which an Error
fails, or it passed its instance's root. Either way a raising Activity leaves first (`hostLeaves`). An Escalation that
passed the root changes nothing but its thrower's leave (§10.5.1: "execution continues at the location of throwing";
CIB-INT-0021). What an Escalation at a compensation handler or a Cancel at either means is not selected. Dynamic-only:
whether a raised event finds a catcher depends on where its thrower runs. -/
def exhausted (hooks : PropagationHooks) (ctx : Ctx) (raised : Raised) (origin : Origin)
    (handler : Option ScopeOccurrenceId) (state : State) : Outcome := do
  let state ← hostLeaves hooks ctx origin state
  match raised, handler with
  | .error code message, some context => .ok (state.signal (.compensationFailed context code message origin))
  | .error code message, none => unhandledError ctx code message origin state
  | .escalation _, some _ => .error (.unsupported "compensation-handler-escalation") -- dynamic-only: what a handler raises
  | .escalation _, none => .ok (throwerLeaves ctx origin state)
  | .cancel, some _ => .error (.unsupported "compensation-handler-cancel") -- dynamic-only: what a handler raises
  | .cancel, none => .error (.unsupported "raise-cancel") -- dynamic-only: where its thrower runs

/-- The search decided at a catcher whose event scope is `scope`: write its code and message variables from there
outward, at once, then let a raising Activity leave (`hostLeaves`). CIB sets the variables on the execution of the
boundary's host or of the Event Sub-Process's enclosing scope (`BpmnExceptionHandler.java:146-153`, CIB-EXT-0028)
before it destroys anything, so the outputs that run next read them where `setVariable` left them: in a local of their
name on the event scope's chain, else at the nearest owner or the root. A raising Activity's outputs therefore read
them behind its own locals and behind the locals of every scope between it and the event scope, and never when the
event scope lies in another instance, a Call's boundary or a catcher in a caller. Admission refuses the variables
unless the profile selects them. -/
def catchDecided (hooks : PropagationHooks) (ctx : Ctx) (origin : Origin) (scope : ScopeOccurrenceId)
    (writes : List (String × Value)) (state : State) : Outcome := do
  let state ← if writes.isEmpty then .ok state else hooks.writeCaught ctx scope writes state
  hostLeaves hooks ctx origin state

/-- Under `ErrorPathOutputs.mapped` a Scope an Error or Escalation boundary interrupts writes its output mappings, after
the catch variables and after a raising Activity inside it has left: CIB sets the variables on the Scope's execution and
then destroys the executions below it, leaf first, and the Scope's own last, each running its output parameters
(`BpmnExceptionHandler.java:146-153`, `PvmAtomicOperationDeleteCascade.java:37-66`, `ExecutionEntity.java:521-525`,
`OutputParameter.execute`, CIB-EXT-0016). Both writes have applied (`catchDecided`), so the mappings read the state as
they find it. `destroy` runs the same parameter list as a normal completion (`IoMapping.java:44-48`), so the outputs
read as `Scopes.completeScope`'s do: under `OutputContext.activityScope` a later one reads an earlier one's write. -/
def interruptedOutputs (ctx : Ctx) (occurrence : ScopeOccurrence) (parent : ScopeOccurrenceId) (state : State) :
    Outcome :=
  let mappings := (((occurrence.element.bind ctx.program.element?).bind (·.scope?)).map (·.2.envelope.outputs)).getD []
  match ctx.program.options.errorPathOutputs with
  | .mapped =>
    if mappings.isEmpty then .ok state
    else
      let outer := (occurrence.parent.map state.visible).getD []
      let reads := ctx.outputReads state.logicalTimeMs (state.ownVariables occurrence.id) [] outer
      (ctx.requireMappingsWith reads mappings).map fun outputs =>
        state.signal (.write parent outputs .outward)
  | .none => .ok state

/-- Leave `occurrence`, held in `parent`, through its caught boundary. A Cancel boundary on a Transaction first
cancels the Transaction's interior and runs the compensation handlers retained in it, and only then takes the
boundary's flows ([BPMN 2.0.2 §10.3.5](../../docs/reference/bpmn-2.0.2/README.md) Transaction: the boundary "will
direct the flow after the Transaction has been rolled back and all compensation has been completed"); a Cancel raise
has no host. An interrupting Error or Escalation boundary writes its catch variables from the host, lets a raising
Activity leave (`catchDecided`), and writes the host's output mappings (`interruptedOutputs`; CIB-EXT-0016 for both, as
`deleteCascade` destroys the host either way, `PvmAtomicOperationCancelActivity.java:60`). A Call's host is its
occurrence in the caller, the called root's `parent`, not the called instance: CIB sets the variables on the execution
of the boundary's event scope, the Call's (`BpmnExceptionHandler.java:146-153`, CIB-EXT-0028). Only an Escalation
boundary is non-interrupting (`boundary.error.nonInterrupting`): it writes its code variable from the host's parent,
CIB's flow scope of the boundary (`EscalationHandler.java:80-97`), and its thrower then leaves. -/
def leaveOccurrence (hooks : PropagationHooks) (ctx : Ctx) (raised : Raised) (origin : Origin)
    (occurrence : ScopeOccurrence) (parent : ScopeOccurrenceId) (boundary : Boundary) (writes : List (String × Value))
    (state : State) : Outcome := do
  if raised.isCancel then
    let thrown := throwerRef state origin
    .ok ((state.clearInside occurrence.id).signal (.compensate occurrence.id none thrown occurrence.occurrence
      (some (.occur boundary.id parent (.flows boundary.outgoing)))))
  else if boundary.interrupting then
    let host := if state.calledRoot occurrence.id then parent else occurrence.id
    let state ← catchDecided hooks ctx origin host writes state
    (interruptedOutputs ctx occurrence parent state).map (boundary.fire occurrence.occurrence none parent [])
  else
    let state ← catchDecided hooks ctx origin parent writes state
    .ok (throwerLeaves ctx origin (boundary.fire occurrence.occurrence none parent [] state))

/-- Whether the raise runs directly at the called root `occurrence` while another path stands there and the Call maps
outputs. For a thrower that is no CIB scope, an Error or Escalation End Event, CIB's walk then starts at the thrower's
concurrent execution, not the process-instance execution (`tree/ActivityExecutionHierarchyWalker.java:53-55`,
`:76-95`), and stops at a catch at that level before its propagator sees the root, so whether the outputs pass rests on
CIB's execution tree (PC-SCOPE-06 item 4). A raising Service Task that CIB makes a scope, one with output parameters
or a boundary (`BpmnParse.java:3297`, `:4803-4814`), starts the walk at its own execution, which reaches the root's
process-instance execution (`:55-58`), so CIB passes the outputs; the refusal is conservative there. An Error End Event
has left before its raise; an Escalation throw and a raising Activity still stand and are no other path. -/
def busyCalledRoot (ctx : Ctx) (origin : Origin) (occurrence : ScopeOccurrence) (state : State) : Bool :=
  let mapsOutputs := (((occurrence.element.bind ctx.program.element?).bind (·.activity?)).bind (·.2.work.call?)).any
    fun work => !work.outputs.isEmpty || work.propagateAllOutputs
  let thrower (standing : Occurrence) : Bool :=
    standing.element == origin.element && standing.activation == origin.activation
  let otherPath := state.occurrences.any (fun standing => standing.scope == occurrence.id && !thrower standing) ||
    state.tokens.any (·.busyScope == occurrence.id)
  origin.scope == occurrence.id && mapsOutputs && otherPath

/-- Under `RaisedCallOutputs.atCalledRoot` (CIB-EXT-0034) a called root the search visits passes its Call's outputs.
When that level `catches` at a busy root (`busyCalledRoot`) the run is refused, dynamic-only, as what else runs at the
root decides it. -/
def passCallOutputs (hooks : PropagationHooks) (ctx : Ctx) (origin : Origin) (catches : Bool) (occurrence : ScopeOccurrence)
    (state : State) : Outcome :=
  match ctx.program.options.raisedCallOutputs with
  | .atCalledRoot =>
    if !state.calledRoot occurrence.id then .ok state
    else if catches && busyCalledRoot ctx origin occurrence state then
      .error (.unsupported "raise-caught-at-busy-called-root") -- dynamic-only: what else runs at the called root
    else hooks.callOutputs ctx occurrence state
  | .none => .ok state

/-- Search outward from `current`; `fuel` bounds the walk by the number of scope occurrences. The search ends at the
scope occurrence of a compensation handler, and a Multi-Instance instance contributes no boundaries. Each called root
it visits passes the Call's outputs (`passCallOutputs`) before any catcher there or further out begins,
caught or not (CIB registers `tree/OutputVariablesPropagator.java:34-43` as a pre-visitor of both searches). -/
def searchScopes (hooks : PropagationHooks) (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) :
    Nat → Option ScopeOccurrenceId → Outcome
  | 0, _ => exhausted hooks ctx raised origin none state
  | _, none => exhausted hooks ctx raised origin none state
  | fuel + 1, some current =>
    match state.scopes.find? (·.id == current) with
    | none => .error (.semanticFailure "raise-from-missing-scope")
    | some occurrence =>
      let role := ctx.scopeRole state occurrence.id
      if role == .compensationHandler then exhausted hooks ctx raised origin (some occurrence.id) state else do
      let handlers ← handlerCandidates ctx raised origin state occurrence
      let handled := best? ctx raised (·.2.1.trigger) handlers
      let attached := match occurrence.element, occurrence.parent with
        | some element, some _ => if role == .multiInstanceInstance then [] else boundariesOf ctx element
        | _, _ => []
      let bounded := best? ctx raised (·.subscription.trigger) attached
      let state ← passCallOutputs hooks ctx origin (handled.isSome || bounded.isSome) occurrence state
      match handled, bounded, occurrence.parent with
      | some ((element, _, interrupting), writes), _, _ =>
        let begun := (← catchDecided hooks ctx origin occurrence.id writes state).signal (.begin { element, scope := occurrence.id })
        .ok (if interrupting then begun else throwerLeaves ctx origin begun)
      | none, some (boundary, writes), some parent =>
        leaveOccurrence hooks ctx raised origin occurrence parent boundary writes state
      | none, _, _ => searchScopes hooks ctx raised origin state fuel occurrence.parent

/-- `Signal.raise`. An Activity that raised the event (`origin.host`) is still running: its own boundaries are searched
first, and a catching one installs its variables through the Activity's frame before the Activity leaves with its
mapped Error-path outputs, as CIB sets them on the task's execution before destroying it
(`BpmnExceptionHandler.java:146-154`, CIB-EXT-0028). Otherwise the search goes on outward with the Activity still
standing, and it leaves where the search decides (`hostLeaves`). -/
def raise (hooks : PropagationHooks) (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) : Outcome :=
  let hostBoundaries := if ctx.scopeRole state origin.scope == .multiInstanceInstance then [] else boundariesOf ctx origin.element
  match origin.host, best? ctx raised (·.subscription.trigger) hostBoundaries with
  | some _, some (boundary, writes) =>
    (hooks.mappedErrorOutputs ctx origin (lastWrites writes) state).map (boundary.fire none none origin.scope [])
  | _, _ => searchScopes hooks ctx raised origin state (state.scopes.length + 1) (some origin.scope)

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
  -- An Escalation is not critical: its thrower leaves after the search, unless the catcher interrupts it (`throwerLeaves`).
  | .escalation record => .ok (state.signal (.raise (.escalation record.code) origin))
  -- Admission refuses both (`throw.message`, `throw.signal`).
  | .message _ => .error (.unsupported "throw-message")
  | .signal _ => .error (.unsupported "throw-signal")
  | .compensation record => throwCompensation header payload record occurrence state
  | .cancel => .ok ((leave state).signal (.raise .cancel origin))

end Kernel.Feature.Propagation
