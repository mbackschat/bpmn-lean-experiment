module

public import Kernel.Hooks
public import Kernel.Feature.Propagation.Candidates
public import Kernel.Feature.Propagation.Throws

/-! # Propagation: throw Events and the search for a catcher

Owns matching on `Throw` and `Raised`. What a throw Event does when it arrives (`arriveThrow`) is
`Kernel.Feature.Propagation.Throws`'s; an Error, Escalation or Cancel throw there queues a raise of its event from the
scope occurrence it ran in, which this module takes (`raise`). Which catchers each level of the search offers, and the
refusals that rest on where the raise runs, are `Kernel.Feature.Propagation.Candidates`'s.

The search for a catcher ([BPMN 2.0.2 §13.5.3, §13.5.4](../../docs/reference/bpmn-2.0.2/README.md)) visits, in order:
the boundaries of the Activity that raised it, if any; then, for each scope occurrence from the raising one outward,
the Event Sub-Processes the occurrence's element declares, then the boundaries on that element. At each of those
candidate sets the catch trigger with the lowest `Ctx.catches` precedence wins, document order breaking ties, so an
exact code is preferred over a catch-all at the same level (CIB `ErrorEventDefinition#getPrecedence`) but never over a
nearer catcher. Under `CompensationHandlerFailure.failsInstance` the search never passes the scope occurrence of a
compensation handler: what reaches it uncaught is the handler's outcome; under `propagatesFromTrigger` it goes on through
the handler's model scopes, not the trigger's (`searchScopes`, CIB-INT-0038).
A Multi-Instance instance's scope occurrence offers no boundaries of its own: they belong to the
body, whose scope occurrence is the next one out (`BpmnParse:3291-3295`, BPMN 2.0.2 §13.5.3). A Sub-Process's Event
Sub-Processes are offered once, in its instance's scope occurrence, never again in a Multi-Instance instance's or body's
or a compensation context that wraps it (`wrapsOwnScope`).

A boundary that catches begins its occurrence and leaves on its flows. A caught Cancel hands its scope occurrence to
`Kernel.Feature.Compensation` through `Signal.compensate`, with what follows once its handlers have completed.

An Error that finds no catcher does what the profile selects (`UnhandledError`): the standards reading fails the
process instance, CIB ends only the throwing path, which the thrower's leave ends, and is refused inside a
Multi-Instance instance. An Escalation that finds no catcher lets its thrower leave and changes nothing else; a Cancel
that finds none has no selected meaning.
-/

public section

namespace Kernel.Feature.Propagation

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

/-- What Propagation asks of the features it may not import (ARCHITECTURE-SPEC "Modules and build shape"), which
`Kernel.Registry` fills. `mappedErrorOutputs` (`Work.mappedErrorOutputs`): how the Activity `origin.host`, still running
after its business Error, leaves once the search has decided, given the values its own boundary installs through its
frame; its writes apply at once and its removal is queued. `writeCaught`: a catcher's code and message variables,
written at once from its event scope outward (`Data.writeOutputs`), so that the outputs that run next read them.
`callOutputs`: what a raised Error or Escalation that reaches the
root of a called instance writes into the caller, the Call's output mappings under CIB-EXT-0034
(`Work.Call.raisedOutputs`; [scopes semantics](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md), PC-SCOPE-06
item 2), applied before the search goes on so that an outer Call's pass reads it. `dropRuns`
(`Compensation.dropWithin`): the compensation runs inside a scope occurrence an interrupting catcher has decided to
interrupt go at once, as its items do (`State.withdrawOccurrence`), so that the leave a raising handler queued before
the interruption advances no run the interruption removes. `handlerRecord` (`Compensation.runningRecord`): the record
whose handler or group runs in a compensation handler's context, which the search reads there under
`propagatesFromTrigger`. -/
structure PropagationHooks where
  mappedErrorOutputs : Ctx → Origin → List (String × Value) → State → Outcome := fun _ _ _ state => .ok state
  writeCaught : Ctx → ScopeOccurrenceId → List (String × Value) → State → Outcome := fun _ _ _ state => .ok state
  callOutputs : Ctx → ScopeOccurrence → State → Outcome := fun _ _ state => .ok state
  dropRuns : Ctx → ScopeOccurrenceId → State → State := fun _ _ state => state
  handlerRecord : Ctx → ScopeOccurrenceId → State → Option Compensable := fun _ _ _ => none

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

/-- Refuse an uncaught Error whose path lies inside a Multi-Instance instance, walking out from `current` to its
instance's root and no further. What CIB's `execution.end(true)` does to an enclosing instance is PC-ERROR-03's to settle
(CIB-INT-0013's boundary). A called instance's root ends the walk, even under a Multi-Instance Call: the thrower's path
ends in the called instance, and with nothing left the called instance ends and its Call returns normally, unless the
thrower's outputs would run as it ends (`endsInstanceWithOutputs`, `finance-unlisted-code`, CIB-LIM-0006). -/
def enclosingInstances (ctx : Ctx) (state : State) : Nat → ScopeOccurrenceId → Outcome
  | 0, _ => .ok state
  | fuel + 1, current =>
    -- The path ends at its process instance's root: a called root is the scope of its Call's occurrence, a
    -- Multi-Instance instance's under a Multi-Instance Call, but that instance and all above it lie in the caller.
    if state.calledRoot current then .ok state
    else if ctx.scopeRole state current == .multiInstanceInstance then
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
CIB-INT-0021). What an Escalation at a compensation handler means is not selected; dynamic-only: whether a raised event
finds a catcher depends on where its thrower runs. A Cancel always finds one: admission admits a Cancel End only directly
in a Transaction with a Cancel boundary (`throw.cancel.outsideTransaction`, `throw.cancel.uncaught`), which the search
reaches first. -/
def exhausted (hooks : PropagationHooks) (ctx : Ctx) (raised : Raised) (origin : Origin)
    (handler : Option ScopeOccurrenceId) (state : State) : Outcome := do
  let state ← hostLeaves hooks ctx origin state
  match raised, handler with
  | .error code message, some context => .ok (state.signal (.compensationFailed context code message origin))
  | .error code message, none => unhandledError ctx code message origin state
  | .escalation _, some _ => .error (.unsupported "compensation-handler-escalation") -- dynamic-only: what a handler raises
  | .escalation _, none => .ok (throwerLeaves ctx origin state)
  | .cancel, _ => .error (.semanticFailure .invariant "cancel-uncaught")

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
      let outer := (occurrence.parent.map (state.visible ctx.program)).getD []
      let reads := ctx.outputReads state.logicalTimeMs (state.ownVariables occurrence.id) [] outer
      (ctx.requireMappingsWith reads mappings).map fun outputs =>
        state.signal (.write parent outputs .outward)
  | .none => .ok state

/-- The scope occurrence a Cancel caught at `occurrence` rolls back (I15): the nearest scope occurrence of the
Transaction on the chain from the raise outward, which is `occurrence` itself, or, when `occurrence` is a
Multi-Instance Transaction's body, whose instances offer no boundaries, the cancelling instance's. The other instances
go on until its run completes; leaving the Activity then cancels them with their runs (D12) and drops the records
completed instances retained in the body, never compensated. -/
def cancelledScope (origin : Origin) (occurrence : ScopeOccurrence) (state : State) : ScopeOccurrenceId :=
  let rec nearest : Nat → ScopeOccurrenceId → ScopeOccurrenceId
    | 0, _ => occurrence.id
    | fuel + 1, current =>
      match state.scopes.find? (·.id == current) with
      | none => occurrence.id
      | some entry =>
        if entry.element == occurrence.element then entry.id
        else (entry.parent.map (nearest fuel)).getD occurrence.id
  nearest (state.scopes.length + 1) origin.scope

/-- Leave `occurrence`, held in `parent`, through its caught boundary. A Cancel boundary on a Transaction first
cancels the interior of the Transaction, or of its cancelling instance (`cancelledScope`), and runs the compensation
handlers retained there, and only then takes the boundary's flows
([BPMN 2.0.2 §10.3.5](../../docs/reference/bpmn-2.0.2/README.md) Transaction: the boundary "will direct the flow after
the Transaction has been rolled back and all compensation has been completed"); a Cancel raise has no host. From the
Cancel on, a Transaction it rolls back as a whole is Terminating, which has no "Activity Interrupted" edge (§13.3.2
Figure 13.2), so the items attached to its occurrence, its Timer, Message, Signal and Conditional boundaries, are
disarmed at once (I18), as CIB's Cancel End interrupt deletes their jobs and subscriptions
(`ExecutionEntity.java:575-588`); a Multi-Instance body's stay armed while one instance rolls back (D12). An
interrupting Error or Escalation boundary writes its catch variables from the host, lets a raising Activity leave
(`catchDecided`), and writes the host's output mappings (`interruptedOutputs`; CIB-EXT-0016 for both, as
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
    let rolledBack := cancelledScope origin occurrence state
    let terminating := match occurrence.occurrence with
      | some activity => if rolledBack == occurrence.id then state.disarm activity else state
      | none => state
    .ok ((terminating.clearInside rolledBack).signal (.compensate rolledBack none thrown occurrence.occurrence
      (some (.occur boundary.id parent (.flows boundary.outgoing)))))
  else if boundary.interrupting then
    let host := if state.calledRoot occurrence.id then parent else occurrence.id
    let state ← catchDecided hooks ctx origin host writes (hooks.dropRuns ctx occurrence.id state)
    (interruptedOutputs ctx occurrence parent state).map (boundary.fire occurrence.occurrence none parent [])
  else
    let state ← catchDecided hooks ctx origin parent writes state
    .ok (throwerLeaves ctx origin (boundary.fire occurrence.occurrence none parent [] state))

/-- Whether the raise runs directly at the called root `occurrence` while another path stands there and the Call maps
outputs. For a thrower that is no CIB scope, an Error or Escalation End Event, CIB's walk then starts at the thrower's
concurrent execution, not the process-instance execution (`tree/ActivityExecutionHierarchyWalker.java:52-54`), and stops
at a catch by the root's own Event Sub-Process before its propagator sees the root, so whether the outputs pass rests on
CIB's execution tree (PC-SCOPE-06 item 4). A catcher further out, the Call's own boundary included, lets the walk reach
the process-instance execution, where the outputs pass (retained `caught-at-busy-called-root`). A raising Service Task
that CIB makes a scope, one with output parameters or a boundary (`BpmnParse.java:3297`, `:4803-4814`), starts the walk
at its own execution, which reaches the root's process-instance execution (`:55-58`), so CIB passes the outputs; the
refusal is conservative there. An Error End Event has left before its raise; an Escalation throw and a raising Activity
still stand and are no other path. -/
def busyCalledRoot (ctx : Ctx) (origin : Origin) (occurrence : ScopeOccurrence) (state : State) : Bool :=
  let mapsOutputs := (((occurrence.element.bind ctx.program.element?).bind (·.activity?)).bind (·.2.work.call?)).any
    fun work => !work.outputs.isEmpty || work.propagateAllOutputs
  let thrower (standing : Occurrence) : Bool :=
    standing.element == origin.element && standing.activation == origin.activation
  let otherPath := state.occurrences.any (fun standing => standing.scope == occurrence.id && !thrower standing) ||
    state.tokens.any (·.busyScope == occurrence.id)
  origin.scope == occurrence.id && mapsOutputs && otherPath

/-- Under `RaisedCallOutputs.atCalledRoot` (CIB-EXT-0034) a called root the search visits passes its Call's outputs.
When the root's own Event Sub-Process `catches` at a busy root (`busyCalledRoot`) the run is refused, dynamic-only, as
what else runs at the root decides it. -/
def passCallOutputs (hooks : PropagationHooks) (ctx : Ctx) (origin : Origin) (catches : Bool) (occurrence : ScopeOccurrence)
    (state : State) : Outcome :=
  match ctx.program.options.raisedCallOutputs with
  | .atCalledRoot =>
    if !state.calledRoot occurrence.id then .ok state
    else if catches && busyCalledRoot ctx origin occurrence state then
      .error (.unsupported "raise-caught-at-busy-called-root") -- dynamic-only: what else runs at the called root
    else hooks.callOutputs ctx occurrence state
  | .none => .ok state

/-- Whether a search passes a compensation handler's context on through the handler's model scopes. -/
def propagatesFromTrigger (ctx : Ctx) : Bool :=
  match ctx.program.options.compensationHandlerFailure with
  | .propagatesFromTrigger => true
  | .failsInstance => false
  | .selected _ => false

/-- A non-interrupting boundary of a compensated subject that caught at its handler's context fires into `scope`, the
scope occurrence holding the subject's record, which declares the subject (`contextCatcher`), and the thrower leaves, as
`leaveOccurrence` lets one leave its host's parent. -/
def contextFires (hooks : PropagationHooks) (ctx : Ctx) (origin : Origin) (scope : ScopeOccurrenceId)
    (boundary : Boundary) (state : State) : Outcome := do
  let state ← catchDecided hooks ctx origin scope [] state
  .ok (throwerLeaves ctx origin (boundary.fire none none scope [] state))

/-- Search outward from `current`; `fuel` bounds the walk by the number of scope occurrences, and `jumped` is
`some raising` when the search reached `current` from a compensation handler's context, with the handler the raise runs
in. The search ends at the scope occurrence of a compensation handler (COMPH-FAIL-01), except under
`propagatesFromTrigger`, where it goes on through the handler's model scopes (CIB-INT-0038): CIB runs the handler in a
compensating execution under the throwing one, which carries its variables (`CompensationUtil.java:62-75`), but walks
the handler's model flow scopes, each mapped onto an execution (`tree/ActivityExecutionHierarchyWalker.java:44-73`).
So the context offers what `contextCatcher` offers of the completed subject, and the search goes on from the scope
occurrence holding the subject's record (`Compensable.scope`), where every Event Sub-Process is a candidate
(`jumpCandidates`), never from the context's parent, the trigger's scope occurrence; a group's context passes on the
handler it was reached from. That scope occurrence is the subject's parent's, a group's context or, for a
Multi-Instance instance's record, the body's, unless `ImplicitCompensation.refused` moved the record outward when a
Sub-Process without a handler completed; no profile selects both. A Multi-Instance instance contributes no
boundaries. Each called root it visits passes the Call's outputs (`passCallOutputs`) before any catcher there or further
out begins, caught or not (CIB registers `tree/OutputVariablesPropagator.java:34-43` as a pre-visitor of both
searches). -/
def searchScopes (hooks : PropagationHooks) (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) :
    Nat → Option (Option ElementId) → Option ScopeOccurrenceId → Outcome
  | 0, _, _ => exhausted hooks ctx raised origin none state
  | _, _, none => exhausted hooks ctx raised origin none state
  | fuel + 1, jumped, some current =>
    match state.scopes.find? (·.id == current) with
    | none => .error (.semanticFailure .invariant "raise-from-missing-scope")
    | some occurrence =>
      let role := ctx.scopeRole state occurrence.id
      if role == .compensationHandler then
        if !propagatesFromTrigger ctx then exhausted hooks ctx raised origin (some occurrence.id) state
        else match hooks.handlerRecord ctx occurrence.id state with
          | none => .error (.semanticFailure .invariant "compensation-context-without-record")
          | some record => do
            let raising := record.handler.orElse fun _ => jumped.join
            match ← contextCatcher ctx raised state record raising with
            | some boundary => contextFires hooks ctx origin record.scope boundary state
            | none => searchScopes hooks ctx raised origin state fuel (some raising) (some record.scope)
      else do
      let handlers ← levelCandidates ctx raised origin state occurrence jumped
      let handled := best? ctx raised (·.2.1.trigger) handlers
      let attached := match occurrence.element, occurrence.parent with
        | some element, some _ => if role == .multiInstanceInstance then [] else boundariesOf ctx element
        | _, _ => []
      let bounded := best? ctx raised (·.subscription.trigger) attached
      let state ← passCallOutputs hooks ctx origin handled.isSome occurrence state
      match handled, bounded, occurrence.parent with
      | some ((element, _, interrupting), writes), _, _ =>
        let state := if interrupting then hooks.dropRuns ctx occurrence.id state else state
        let begun := (← catchDecided hooks ctx origin occurrence.id writes state).signal (.begin { element, scope := occurrence.id })
        .ok (if interrupting then begun else throwerLeaves ctx origin begun)
      | none, some (boundary, writes), some parent =>
        leaveOccurrence hooks ctx raised origin occurrence parent boundary writes state
      | none, _, _ => searchScopes hooks ctx raised origin state fuel none occurrence.parent

/-- `Signal.raise`. An Activity that raised the event (`origin.host`) is still running: its own boundaries are searched
first, and a catching one installs its variables through the Activity's frame before the Activity leaves with its
mapped Error-path outputs, as CIB sets them on the task's execution before destroying it
(`BpmnExceptionHandler.java:146-154`, CIB-EXT-0028). Otherwise the search goes on outward with the Activity still
standing, and it leaves where the search decides (`hostLeaves`). -/
def raise (hooks : PropagationHooks) (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) : Outcome :=
  let hostBoundaries :=
    if ctx.runsAsInstance state origin.element origin.scope then [] else boundariesOf ctx origin.element
  match origin.host, best? ctx raised (·.subscription.trigger) hostBoundaries with
  | some _, some (boundary, writes) =>
    (hooks.mappedErrorOutputs ctx origin (lastWrites writes) state).map (boundary.fire none none origin.scope [])
  | _, _ => searchScopes hooks ctx raised origin state (state.scopes.length + 1) none (some origin.scope)

end Kernel.Feature.Propagation
