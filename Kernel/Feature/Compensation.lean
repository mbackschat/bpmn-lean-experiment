module

public import Kernel.Hooks

/-! # Compensation and Transaction cancellation

Owns `FeatureSlots.compensation`. An Activity or Scope with a compensation handler that completes is retained in the
scope occurrence it completed in, together with the context its handler restores: for a Sub-Process whose handler is a
Compensation Event Sub-Process, its own variables as they were when it completed ("snapshot data … associated with the
parent Activity", [BPMN 2.0.2 §13.5.5](../../docs/reference/bpmn-2.0.2/README.md); CIB copies only them,
`CompensationUtil.java:118-124`); every other name the handler reads live through its context's chain (D9). A boundary
handler restores none.

A trigger (`Signal.compensate`) takes every record retained in its scope occurrence and runs their handlers, each
begun in a context scope occurrence of its own inside that one, holding the restored context, with continuation
`.compensation`. Order (§13.5.5): a Sequence Flow from A to B makes B's handler complete before A's starts, and
handlers without such a dependency run concurrently, so every pending handler none of whose successors is still
pending or running starts at once, in program order. Once the last handler has completed, the trigger continues as its
thrower asked.

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

/-- `Hooks.completed`, before the pipeline disposes of the owned scope: a completed Scope's inner records stay
compensable (BPMN 2.0.2 §13.5.5). A Scope with a handler keeps them as the children its handler may trigger, the others
move to the parent. A Compensation Event Sub-Process, the handler inside its subject, restores the completed Scope's own
variables ("snapshot data"); a boundary handler restores none (§13.5.5: it "can only perform black-box compensation"). -/
def completed (ctx : Ctx) (occurrence : Occurrence) (state : State) : Outcome :=
  -- Admission admits at most one handler (`compensation.handlerCount`).
  let handler := ((ctx.program.element? occurrence.element).bind (·.envelope?)).bind (·.compensationHandlers.head?)
  let owned := ownedScope? ctx occurrence state
  let compensation := state.slots.compensation
  let (inner, outer) := compensation.retained.partition fun record => owned.any (·.id == record.scope)
  match handler with
  | none =>
    .ok (store state { compensation with
      retained := outer ++ inner.map fun record => { record with scope := occurrence.scope } })
  | some handler =>
    let (state, completion) := state.issue
    let inside := ((ctx.program.element? handler).bind (·.header.parent)) == some occurrence.element
    let own := (owned.map fun scope => ((state.variables.find? (·.scope == scope.id)).map (·.entries)).getD []).getD []
    let snapshot := if inside then own else []
    let reference : OccurrenceRef :=
      { processInstanceId := state.instanceOf occurrence.scope, element := occurrence.element
        activation := occurrence.activation }
    let record : Compensable :=
      { subject := occurrence.element, handler := some handler, scope := occurrence.scope, occurrence := some reference,
        completion, snapshot, children := inner }
    .ok (store state { compensation with retained := outer ++ [record] })

/-- A Sequence Flow leads from `record`'s subject to `other`'s. -/
def precedes (ctx : Ctx) (record other : Compensable) : Bool :=
  ctx.program.flows.any fun flow => flow.source == record.subject && flow.target == other.subject

def position (ctx : Ctx) (element : ElementId) : Nat :=
  (ctx.program.elements.map (·.header.id)).idxOf element

/-- Begin `record`'s handler in a new context scope occurrence inside `scope`, where the records of its children become
the ones a throw inside the handler compensates. -/
def beginHandler (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State) (record : Compensable) :
    Except Failure (State × ScopeOccurrenceId) := do
  -- Only a group lacks a handler, and no feature retains a group: an invariant failure.
  let handler ← match record.handler with
    | some handler => .ok handler
    | none => .error (.semanticFailure "compensation-group-unretained")
  let element ← match ctx.program.element? handler with
    | some element => .ok element
    | none => .error (.semanticFailure "compensation-handler-missing")
  if element.activity?.isNone && element.scope?.isNone then .error (.semanticFailure "compensation-handler-not-activity")
  else
    let (state, context) := state.enterScope handler scope record.snapshot none
    let compensation := state.slots.compensation
    let children := record.children.map fun child => { child with scope := context }
    let state := store state { compensation with retained := compensation.retained ++ children }
    .ok (state.signal (.begin { element := handler, scope := context, continuation := .compensation scope }), context)

/-- Start every pending handler of the run in `scope` that no pending or running handler's subject succeeds; once
none is pending or running, end the run: cancel the occurrence it leaves, if any, then complete its `resume`. -/
def advance (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State) : Outcome := do
  let compensation := state.slots.compensation
  let run ← match compensation.runs.find? (·.scope == scope) with
    | some run => .ok run
    | none => .error (.semanticFailure "compensation-run-missing")
  let others := compensation.runs.filter (·.scope != scope)
  let remaining := run.pending ++ run.running.map (·.2)
  let (ready, waiting) := run.pending.partition fun record => !remaining.any (precedes ctx record ·)
  if run.pending.isEmpty && run.running.isEmpty then
    let state := store state { compensation with runs := others }
    let state := match run.leave with
      | some occurrence => state.signal (.cancel occurrence)
      | none => state
    match run.resume with
      | some (.complete occurrence leave) => .ok (state.signal (.complete occurrence leave [] .outward))
      | some (.occur element at_ leave) => .ok (state.signal (.occur element at_ leave [] .outward))
      -- Only a group's nested run resumes `group`, and no feature retains a group: an invariant failure.
      | some (.group _ _) => .error (.semanticFailure "compensation-group-unretained")
      | none => .ok state
  -- Dynamic-only: a dependency cycle needs the retained set, which depends on the run.
  else if ready.isEmpty && run.running.isEmpty then .error (.unsupported "compensation-dependency-cycle")
  else
    let ordered := ready.mergeSort fun left right =>
      position ctx left.subject < position ctx right.subject ||
        (position ctx left.subject == position ctx right.subject && right.completion ≤ left.completion)
    let (state, started) ← ordered.foldlM (fun (state, started) record => do
      let (state, context) ← beginHandler ctx scope state record
      .ok (state, started ++ [(context, record)])) (state, [])
    .ok (store state { state.slots.compensation with
      runs := others ++ [{ run with pending := waiting, running := run.running ++ started }] })

/-- `Signal.compensate`: take the records retained in `scope` into a new run: those of `activity` when one is named,
else all. Dynamic-only refusals: a second
trigger in a scope whose run is in progress, since its relation to the running one is not selected
(COMPH-EXCLUSIVE-01 of the trigger account), and a subject retained twice, whose instances §13.5.5 compensates in
reverse completion order. -/
def compensate (ctx : Ctx) (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef)
    (leave : Option Nat) (resume : Option Resume) (state : State) : Outcome :=
  let compensation := state.slots.compensation
  let (selected, kept) := compensation.retained.partition fun record =>
    record.scope == scope && activity.all (· == record.subject)
  let subjects := selected.map (·.subject)
  if compensation.runs.any (·.scope == scope) then
    .error (.unsupported "compensation-concurrent-trigger") -- dynamic-only: whether a run is in progress
  else if subjects.eraseDups.length != subjects.length then
    .error (.unsupported "compensation-repeated-subject") -- dynamic-only: what was retained
  else
    advance ctx scope (store state
      { retained := kept, runs := compensation.runs ++ [{ trigger, scope, pending := selected, leave, resume }] })

/-- `Hooks.handlerCompleted`: the handler's context is left and the run starts what that releases. -/
def handlerCompleted (ctx : Ctx) (run : ScopeOccurrenceId) (occurrence : Occurrence) (state : State) : Outcome :=
  let left := state.leaveScope occurrence.scope
  let compensation := left.slots.compensation
  let runs := compensation.runs.map fun candidate =>
    if candidate.scope == run then
      { candidate with running := candidate.running.filter (·.1 != occurrence.scope) }
    else candidate
  advance ctx run (store left { compensation with runs })

/-- `Hooks.handlerEnded`: a handler left without completing, raised away by an event. Under `propagatesFromTrigger`
(I11) the run, if a catcher that interrupted its scope occurrence has not dropped it, goes on as `handlerCompleted` does;
under `failsInstance` the failure that follows ends the instance, so nothing changes. -/
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
