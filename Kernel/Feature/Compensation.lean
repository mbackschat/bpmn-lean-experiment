module

public import Kernel.Hooks
public import Kernel.IL.Footprint

/-! # Compensation and Transaction cancellation

Owns `FeatureSlots.compensation`. An Activity or Scope with a compensation handler that completes is retained in the
scope occurrence it completed in, together with the context its handler restores: for a Sub-Process whose handler is a
Compensation Event Sub-Process, its own variables as they were when it completed ("snapshot data … associated with the
parent Activity", [BPMN 2.0.2 §13.5.5](../../docs/reference/bpmn-2.0.2/README.md); CIB copies only them,
`CompensationUtil.java:118-124`); every other name the handler reads live through its context's chain (D9). A boundary
handler restores none.

A trigger (`Signal.compensate`) takes every record visible from its scope occurrence (`visibleScopes`), or its target's,
and runs their handlers, each begun in a context scope occurrence of its own inside that one, holding the restored
context, with continuation `.compensation`. Order (§13.5.5): when A's record completed before B's, a Sequence Flow from
A or from a boundary Event of A to B, a name B reads that A can write, or A and B being records of one subject makes B's
handler complete before A's starts (`precedes`); handlers without such a dependency run concurrently, so every pending
handler none of whose successors is still pending or running starts at once, in program order. Once the last handler has
completed, the trigger continues as its thrower asked.

Under `ImplicitCompensation.everySubProcess` (I5) a completed Sub-Process without a handler that holds records is
retained as one group record without a handler: compensating it runs its children as a nested run in a context holding
the Sub-Process's own variables, which resumes the outer run once they all completed (`Resume.group`).

A handler that an Error leaves uncaught fails the process instance: every token, item and occurrence is removed and
the failure is published. BPMN 2.0.2 §13.3.2 leaves this open; it is the interpretation COMPH-FAIL-01 of the
[trigger account](../../docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md).
-/

public section

namespace Kernel.Feature.Compensation

def store (state : State) (compensation : Compensations) : State :=
  { state with slots := { state.slots with compensation } }

/-- The scope occurrence of the Scope element `occurrence` is; a Call's or Activity's owned scope holds no records
that outlive it. -/
def ownedScope? (ctx : Ctx) (occurrence : Occurrence) (state : State) : Option ScopeOccurrence :=
  if ((ctx.program.element? occurrence.element).bind (·.scope?)).isSome then
    state.scopes.find? (·.occurrence == some occurrence.id)
  else none

/-- Where a completion retains its record, and with which handler (D6, I9): an instance of a Multi-Instance Activity
completes in its own scope occurrence, which `MultiInstance.instanceCompleted` leaves, so a Sub-Process instance's
record goes to that occurrence's parent, the body's instance-holding `MultiInstanceRun.scope`, and a Task or Call
instance retains none (`none`), since §13.5.5 compensates a Multi-Instance Activity "only once", by its body's record;
a completed Multi-Instance Sub-Process body retains the group of its instance records without the handler, which they
carry (§10.7.2: compensation "individually triggers compensation for all instances"). -/
def placement (ctx : Ctx) (occurrence : Occurrence) (state : State) : Option (Option ElementId × ScopeOccurrenceId) :=
  let element := ctx.program.element? occurrence.element
  -- Admission admits at most one handler (`compensation.handlerCount`).
  let handler := (element.bind (·.envelope?)).bind (·.compensationHandlers.head?)
  let looping := ((element.bind (·.envelope?)).bind (·.multiInstance)).isSome
  let isScope := (element.bind (·.scope?)).isSome
  if looping && ctx.scopeRole state occurrence.scope == .multiInstanceInstance then
    if isScope then some (handler, ((state.scopes.find? (·.id == occurrence.scope)).bind (·.parent)).getD occurrence.scope)
    else none
  else if looping && isScope then some (none, occurrence.scope)
  else some (handler, occurrence.scope)

/-- `Hooks.completed`, before the pipeline disposes of the owned scope: a completed Scope's inner records stay
compensable (BPMN 2.0.2 §13.5.5). A Scope with a handler keeps them as the children its handler may trigger; one
without keeps them as a group under `ImplicitCompensation.everySubProcess` (I5) or as a Multi-Instance body (I9), else
they move to the parent. A Compensation Event Sub-Process, the handler inside its subject, and a group restore the
completed Scope's own variables ("snapshot data"); a boundary handler restores none (§13.5.5: it "can only perform
black-box compensation"). -/
def completed (ctx : Ctx) (occurrence : Occurrence) (state : State) : Outcome :=
  match placement ctx occurrence state with
  | none => .ok state
  | some (handler, target) =>
    let owned := ownedScope? ctx occurrence state
    let compensation := state.slots.compensation
    let (inner, outer) := compensation.retained.partition fun record => owned.any (·.id == record.scope)
    let body := ((ctx.program.element? occurrence.element).bind (·.envelope?)).any (·.multiInstance.isSome)
    let grouped := (ctx.program.options.implicitCompensation == .everySubProcess || body) && !inner.isEmpty
    if handler.isNone && !grouped then
      .ok (store state { compensation with retained := outer ++ inner.map fun record => { record with scope := target } })
    else
      let (state, completion) := state.issue
      let inside := handler.all fun handler =>
        ((ctx.program.element? handler).bind (·.header.parent)) == some occurrence.element
      let own := (owned.map fun scope => ((state.variables.find? (·.scope == scope.id)).map (·.entries)).getD []).getD []
      let snapshot := if inside then own else []
      let reference : OccurrenceRef :=
        { processInstanceId := state.instanceOf occurrence.scope, element := occurrence.element
          activation := occurrence.activation }
      let record : Compensable :=
        { subject := occurrence.element, handler, scope := target, occurrence := some reference, completion, snapshot,
          children := inner }
      .ok (store state { compensation with retained := outer ++ [record] })

/-- Every element declared inside `element`, at any depth. -/
def interior (ctx : Ctx) (element : Element) : List Element :=
  let rec go : Nat → List ElementId → List Element
    | 0, _ => []
    | fuel + 1, ids => ids.flatMap fun id =>
      match ctx.program.element? id with
      | some inner => inner :: go fuel ((inner.scope?.map (·.2.children)).getD [])
      | none => []
  go ctx.program.elements.length ((element.scope?.map (·.2.children)).getD [])

/-- What `element` itself reads and writes over its whole run, over-approximated: its envelope and outgoing conditions
(`footprint`), the outputs of the subscriptions it catches with, a Multi-Instance element's output collection and data
item, every name a User Task installs under
`SubmissionRule.installsVariables`, and every name for a task kind this feature cannot inspect (none of User, Service,
Call or Receive work). -/
def ownData (ctx : Ctx) (element : Element) : Footprint :=
  let subscriptions := ((element.envelope?.map (·.boundaries)).getD []).map (·.subscription) ++
    ((element.event?.bind (·.2.catch?)).toList) ++ ((element.start?.bind (·.2.subscription)).toList) ++
    ((element.scope?.bind fun (_, payload) => (ctx.eventStart payload).map (·.1)).toList)
  -- `footprint` leaves out a Multi-Instance element's output collection and data item (issue #99).
  let looped := ((element.envelope?.bind (·.multiInstance)).map fun loop =>
    loop.outputCollection.toList ++ loop.outputDataItem.toList).getD []
  let caught : Footprint :=
    { writes := { names := subscriptions.flatMap (fun subscription => subscription.outputs.map (·.target)) ++ looped } }
  let work : Footprint := match element.activity? with
    | some (_, payload) =>
      let uninspected := !(payload.work.isUser || payload.work.isService || payload.work.call?.isSome ||
        payload.work.receive?.isSome)
      let installs := payload.work.isUser && ctx.program.options.submission == .installsVariables
      { reads := { all := uninspected }, writes := { all := uninspected || installs } }
    | none => {}
  ((footprint ctx.program element).union caught).union work

/-- What a run of `subject` reads and writes: its own and, for a Scope, its interior's. -/
def data (ctx : Ctx) (subject : ElementId) : Footprint :=
  match ctx.program.element? subject with
  | some element => (element :: interior ctx element).foldl (fun found inner => found.union (ownData ctx inner)) {}
  | none => {}

/-- Whether a Sequence Flow path leads from one of `sources` to `target` through Gateways and intermediate Events only,
nodes that are no Activity and leave no record (§13.5.5 "A Sequence Flow between Activities A and B", issue #96); an
Activity on the path ends it, since its own record, if any, carries the order on. The walk is bounded by the element
count, so a cycle of such nodes ends it. -/
def flowReaches (ctx : Ctx) (sources : List ElementId) (target : ElementId) : Bool :=
  let passes (id : ElementId) : Bool := (ctx.program.element? id).any fun element =>
    element.gateway?.isSome || element.event?.any (·.2.placement == .intermediate)
  let rec go : Nat → List ElementId → Bool
    | 0, _ => false
    | fuel + 1, frontier =>
      let next := (ctx.program.flows.filter (frontier.contains ·.source)).map (·.target)
      next.contains target || go fuel (next.filter passes)
  go ctx.program.elements.length sources

/-- `record`'s subject ran before `other`'s in a way §13.5.5 orders, so `other`'s handler completes before `record`'s
starts: (b) a Sequence Flow path (`flowReaches`) leads from a boundary Event attached to `record`'s subject to
`other`'s, a different one, whose record may complete while the subject still runs; or `record` completed first and
(a) a Sequence Flow path leads from its subject to `other`'s, (c) `other`'s subject reads a name `record`'s can write
(`data`), or (d) both are records of one subject, run in reverse completion order. -/
def precedes (ctx : Ctx) (record other : Compensable) : Bool :=
  let boundaries := (((ctx.program.element? record.subject).bind (·.envelope?)).map fun envelope =>
    envelope.boundaries.map (·.id)).getD []
  (record.subject != other.subject && flowReaches ctx boundaries other.subject) ||
    (record.completion < other.completion &&
      (record.subject == other.subject || flowReaches ctx [record.subject] other.subject ||
        (data ctx other.subject).reads.meets (data ctx record.subject).writes))

def position (ctx : Ctx) (element : ElementId) : Nat :=
  (ctx.program.elements.map (·.header.id)).idxOf element

/-- The recursion bound of `advance`: a nested run starts at most once per element nesting level, and a run's end
resumes at most every run in progress. -/
def runBound (ctx : Ctx) (state : State) : Nat :=
  2 * (ctx.program.elements.length + state.slots.compensation.runs.length) + 2

mutual

/-- Begin `record`'s handler in a new context scope occurrence inside `scope`, where the records of its children become
the ones a throw inside the handler compensates. A group (I5) runs its children instead, as a nested run of that
context, which resumes the run in `scope` once they all completed (`Resume.group`). -/
def beginHandler (ctx : Ctx) (trigger : OccurrenceRef) (scope : ScopeOccurrenceId) (state : State)
    (record : Compensable) : Nat → Except Failure (State × ScopeOccurrenceId)
  | 0 => .error (.semanticFailure "compensation-run-depth")
  | fuel + 1 =>
    match record.handler with
    | none => do
      let (state, context) := state.enterScope record.subject scope record.snapshot none
      let pending := record.children.map fun child => { child with scope := context }
      let compensation := state.slots.compensation
      let nested : CompensationRun :=
        { trigger, scope := context, pending, leave := none, resume := some (.group scope context) }
      let state ← advance ctx context (store state { compensation with runs := compensation.runs ++ [nested] }) fuel
      .ok (state, context)
    | some handler =>
      match ctx.program.element? handler with
      | none => .error (.semanticFailure "compensation-handler-missing")
      | some element =>
        if element.activity?.isNone && element.scope?.isNone then
          .error (.semanticFailure "compensation-handler-not-activity")
        else
          let (state, context) := state.enterScope handler scope record.snapshot none
          let compensation := state.slots.compensation
          let children := record.children.map fun child => { child with scope := context }
          let state := store state { compensation with retained := compensation.retained ++ children }
          .ok (state.signal (.begin { element := handler, scope := context, continuation := .compensation scope }),
            context)

/-- Start every pending handler of the run in `scope` that no pending or running handler's subject succeeds; once
none is pending or running, end the run: cancel the occurrence it leaves, if any, then complete its `resume`. -/
def advance (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State) : Nat → Outcome
  | 0 => .error (.semanticFailure "compensation-run-depth")
  | fuel + 1 => do
    let compensation := state.slots.compensation
    let run ← match compensation.runs.find? (·.scope == scope) with
      | some run => .ok run
      | none => .error (.semanticFailure "compensation-run-missing")
    let remaining := run.pending ++ run.running.map (·.2)
    let (ready, waiting) := run.pending.partition fun record => !remaining.any (precedes ctx record ·)
    if run.pending.isEmpty && run.running.isEmpty then
      let state := store state { compensation with runs := compensation.runs.filter (·.scope != scope) }
      let state := match run.leave with
        | some occurrence => state.signal (.cancel occurrence)
        | none => state
      match run.resume with
        | some (.complete occurrence leave) => .ok (state.signal (.complete occurrence leave [] .outward))
        | some (.occur element at_ leave) => .ok (state.signal (.occur element at_ leave [] .outward))
        | some (.group outer context) => release ctx outer context state fuel
        | none => .ok state
    -- Dynamic-only: a dependency cycle needs the retained set, which depends on the run.
    else if ready.isEmpty && run.running.isEmpty then .error (.unsupported "compensation-dependency-cycle")
    else
      let ordered := ready.mergeSort fun left right =>
        position ctx left.subject < position ctx right.subject ||
          (position ctx left.subject == position ctx right.subject && right.completion ≤ left.completion)
      let (state, started) ← ordered.foldlM (fun (state, started) record => do
        let (state, context) ← beginHandler ctx run.trigger scope state record fuel
        .ok (state, started ++ [(context, record)])) (state, [])
      -- A group's nested run joined the runs while its handlers began.
      let compensation := state.slots.compensation
      .ok (store state { compensation with runs := compensation.runs.filter (·.scope != scope) ++
        [{ run with pending := waiting, running := run.running ++ started }] })

/-- The handler or group that ran in `context` is done: the context is left and the run in `scope` starts what that
releases. -/
def release (ctx : Ctx) (scope context : ScopeOccurrenceId) (state : State) : Nat → Outcome
  | 0 => .error (.semanticFailure "compensation-run-depth")
  | fuel + 1 =>
    let left := state.leaveScope context
    let compensation := left.slots.compensation
    let runs := compensation.runs.map fun candidate =>
      if candidate.scope == scope then { candidate with running := candidate.running.filter (·.1 != context) }
      else candidate
    advance ctx scope (store left { compensation with runs }) fuel

end

/-- The scope occurrences whose records a throw in `scope` sees (I2, D15): the Activities "visible" from it, those at
its own level or, from a Compensation Event Sub-Process, in the Sub-Process containing it (BPMN 2.0.2 Tables 10.88 and
10.89). The walk goes outward from `scope` through Event Sub-Process occurrences up to and including the first scope
occurrence of another kind, as CIB's does (`CompensationUtil.java:184-206`); a compensation handler's context ends it,
included, since `beginHandler` moved the records of the handler's subject there. -/
def visibleScopes (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) : List ScopeOccurrenceId :=
  let rec go : Nat → ScopeOccurrenceId → List ScopeOccurrenceId
    | 0, _ => []
    | fuel + 1, id =>
      let entry := state.scopes.find? (·.id == id)
      let eventSubProcess := ((entry.bind (·.element)).bind ctx.program.element?).bind (·.scope?) |>.any
        fun (_, payload) => (ctx.eventStart payload).isSome
      match entry.bind (·.parent) with
      | some parent =>
        if ctx.scopeRole state id != .compensationHandler && eventSubProcess then id :: go fuel parent else [id]
      | none => [id]
  go (state.scopes.length + 1) scope

/-- `Signal.compensate`: take into a new run in `scope` every record the throw sees (`visibleScopes`), or only
`activity`'s when one is named (I3). Dynamic-only refusal: a trigger while a run is in progress in a scope occurrence it
covers, since its relation to the running one is not selected (COMPH-EXCLUSIVE-01 of the trigger account). -/
def compensate (ctx : Ctx) (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef)
    (leave : Option Nat) (resume : Option Resume) (state : State) : Outcome :=
  let compensation := state.slots.compensation
  let covered := visibleScopes ctx state scope
  let (selected, kept) := compensation.retained.partition fun record =>
    covered.contains record.scope && activity.all (· == record.subject)
  if compensation.runs.any (covered.contains ·.scope) then
    .error (.unsupported "compensation-concurrent-trigger") -- dynamic-only: whether a run is in progress
  else
    advance ctx scope (store state
      { retained := kept, runs := compensation.runs ++ [{ trigger, scope, pending := selected, leave, resume }] })
      (runBound ctx state)

/-- `Hooks.handlerCompleted`: the handler's context is left and the run starts what that releases. -/
def handlerCompleted (ctx : Ctx) (run : ScopeOccurrenceId) (occurrence : Occurrence) (state : State) : Outcome :=
  release ctx run occurrence.scope state (runBound ctx state)

/-- The runs in `scope` and inside it go at once, when a catcher that interrupts `scope` has decided
(`Propagation.PropagationHooks.dropRuns`): its interruption is still queued, and a run it would remove must begin no
handler before then. -/
def dropWithin (_ : Ctx) (scope : ScopeOccurrenceId) (state : State) : State :=
  let inside := state.subtree scope
  let compensation := state.slots.compensation
  store state { compensation with runs := compensation.runs.filter (!inside.contains ·.scope) }

/-- `Hooks.handlerEnded`: a handler left without completing, raised away by an event. Under `propagatesFromTrigger`
(I11) the run goes on as `handlerCompleted` does unless the catcher interrupts a scope occurrence holding it, which drops
the run when the catch is decided (`dropWithin`), before the handler's leave arrives here; with no catcher, or one that
does not interrupt, the run goes on. Under `failsInstance` the failure that follows ends the instance, so nothing
changes. -/
def handlerEnded (ctx : Ctx) (run : ScopeOccurrenceId) (occurrence : Occurrence) (state : State) : Outcome :=
  match ctx.program.options.compensationHandlerFailure with
  | .propagatesFromTrigger =>
    if state.slots.compensation.runs.any (·.scope == run) then handlerCompleted ctx run occurrence state else .ok state
  | .failsInstance | .selected _ => .ok state

/-- `Signal.compensationFailed`: an Error raised at `origin`, an effect's reported Error or an Error End Event inside a
handler Sub-Process, left the handler context `handler` uncaught (COMPH-FAIL-01). The handler's public occurrence is the
raising Activity itself or, for a Sub-Process handler, its occurrence in that context. -/
def failCompensation (_ : Ctx) (handler : ScopeOccurrenceId) (code : String) (message : Option String)
    (origin : Origin) (state : State) : Outcome := do
  let context ← match state.scopes.find? (·.id == handler) with
    | some context => .ok context
    | none => .error (.semanticFailure "compensation-handler-gone")
  let run ← match state.slots.compensation.runs.find? (·.running.any (·.1 == handler)) with
    | some run => .ok run
    | none => .error (.semanticFailure "compensation-handler-without-run")
  let element ← match context.element with
    | some element => .ok element
    | none => .error (.semanticFailure "compensation-handler-without-element")
  let handlerActivation ←
    if origin.element == element then .ok origin.activation
    else match state.occurrences.find? (fun candidate => candidate.scope == handler && candidate.element == element) with
      | some occurrence => .ok occurrence.activation
      | none => .error (.semanticFailure "compensation-handler-not-started")
  let handlerInstance := state.instanceOf handler
  let failure : InstanceFailure :=
    { code, message, occurrence := { processInstanceId := state.instanceOf origin.scope, element := origin.element, activation := origin.activation }
      related := [("trigger", run.trigger), ("handler", { processInstanceId := handlerInstance, element, activation := handlerActivation })] }
  .ok (state.signal (.endInstance .failed (some failure)))

end Kernel.Feature.Compensation
