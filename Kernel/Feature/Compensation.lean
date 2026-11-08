module

public import Kernel.Hooks

/-! # Compensation and Transaction cancellation

Owns `FeatureSlots.compensation`. An Activity or Scope with a compensation handler that completes is retained in the
scope occurrence it completed in (`Signal.completed`), together with the context its handler restores: for a
Sub-Process, the variables visible inside it when it completed ("snapshot data",
[BPMN 2.0.2 §13.5.5](../../docs/reference/bpmn-2.0.2/README.md)); a boundary handler restores none.

A trigger (`Signal.compensate`) takes every record retained in its scope occurrence and runs their handlers, each in
a scope occurrence of its own inside that one, holding the restored context and marked `compensating`. A
Compensation Activity begins as `Signal.startActivity`, a Compensation Event Sub-Process as
`Signal.startEventSubProcess`. Order (§13.5.5): a Sequence Flow from A to B makes B's handler complete before A's
starts, and handlers without such a dependency run concurrently, so every pending handler none of whose successors
is still pending or running starts at once, in program order. Once the last handler has completed, the trigger
continues as its thrower asked.

A handler that an Error leaves uncaught fails the process instance: every token, item and occurrence is removed and
the failure is published. BPMN 2.0.2 §13.3.2 leaves this open; it is the interpretation COMPH-FAIL-01 of the
[trigger account](../../docs/capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md).
-/

public section

namespace Kernel.Feature.Compensation

def store (state : State) (compensation : Compensations) : State :=
  { state with slots := { state.slots with compensation } }

/-- `Signal.completed`. -/
def retain (ctx : Ctx) (element : ElementId) (scope : ScopeOccurrenceId) (snapshot : List (String × Value))
    (state : State) : Outcome :=
  match ((ctx.program.element? element).bind (·.envelope?)).bind (·.compensationHandler) with
  | none => .error (.semanticFailure "retain-without-compensation-handler")
  | some handler =>
    let compensation := state.slots.compensation
    .ok (store state { compensation with
      retained := compensation.retained ++ [{ subject := element, handler, scope, snapshot }] })

/-- A Sequence Flow leads from `record`'s subject to `other`'s. -/
def precedes (ctx : Ctx) (record other : Compensable) : Bool :=
  ctx.program.flows.any fun flow => flow.source == record.subject && flow.target == other.subject

def position (ctx : Ctx) (element : ElementId) : Nat :=
  (ctx.program.elements.map (·.header.id)).idxOf element

/-- Begin `record`'s handler in a new occurrence inside `scope`; the handler's own start activates it. -/
def begin (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State) (record : Compensable) :
    Except Failure (State × ScopeOccurrenceId) := do
  let element ← match ctx.program.element? record.handler with
    | some element => .ok element
    | none => .error (.semanticFailure "compensation-handler-missing")
  let (state, issued) := state.issue
  let occurrence : ScopeOccurrenceId := ⟨issued⟩
  let handler : ScopeOccurrence :=
    { id := occurrence, element := some record.handler, parent := some scope, compensating := true }
  let state : State := { state with
    scopes := state.scopes ++ [handler]
    variables := state.variables ++ [{ scope := occurrence, entries := record.snapshot }] }
  let start ← match element.activity?, element.scope? with
    | some _, _ => .ok (Signal.startActivity record.handler occurrence)
    | none, some _ => .ok (Signal.startEventSubProcess record.handler occurrence [])
    | none, none => .error (.semanticFailure "compensation-handler-not-activity")
  .ok (state.signal start, occurrence)

/-- Start every pending handler of the run in `scope` that no pending or running handler's subject succeeds; once
none is pending or running, end the run: leave `scope` and disarm its boundaries if the run says so, then add its
`resume` tokens. -/
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
    let state := if run.leave then (state.leaveScope scope).disarm scope.value else state
    .ok { state with tokens := state.tokens ++ run.resume }
  else if ready.isEmpty && run.running.isEmpty then .error (.unsupported "compensation-dependency-cycle")
  else
    let ordered := ready.mergeSort fun left right => position ctx left.subject ≤ position ctx right.subject
    let (state, started) ← ordered.foldlM (fun (state, started) record => do
      let (state, occurrence) ← begin ctx scope state record
      .ok (state, started ++ [(occurrence, record)])) (state, [])
    .ok (store state { state.slots.compensation with
      runs := others ++ [{ run with pending := waiting, running := run.running ++ started }] })

/-- `Signal.compensate`: take every record retained in `scope` into a new run. A second trigger in a scope whose run
is in progress is refused, since its relation to the running one is not selected (COMPH-EXCLUSIVE-01 of the trigger
account), and so is a subject retained twice, whose instances §13.5.5 compensates in reverse completion order. -/
def compensate (ctx : Ctx) (scope : ScopeOccurrenceId) (trigger : OccurrenceRef) (leave : Bool)
    (resume : List Token) (state : State) : Outcome :=
  let compensation := state.slots.compensation
  let (selected, kept) := compensation.retained.partition (·.scope == scope)
  let subjects := selected.map (·.subject)
  if compensation.runs.any (·.scope == scope) then .error (.unsupported "compensation-concurrent-trigger")
  else if subjects.eraseDups.length != subjects.length then .error (.unsupported "compensation-repeated-subject")
  else
    advance ctx scope (store state
      { retained := kept, runs := compensation.runs ++ [{ trigger, scope, pending := selected, leave, resume }] })

/-- A handler's occurrence is idle: the handler completed. Leave the occurrence and start what it releases. -/
def completeCompensation (ctx : Ctx) (occurrence : ScopeOccurrence) (state : State) : Outcome :=
  let left := state.leaveScope occurrence.id
  let compensation := left.slots.compensation
  match compensation.runs.find? (·.running.any (·.1 == occurrence.id)) with
  | none => .error (.semanticFailure "compensation-handler-without-run")
  | some run =>
    let runs := compensation.runs.map fun candidate =>
      if candidate.scope == run.scope then
        { candidate with running := candidate.running.filter (·.1 != occurrence.id) }
      else candidate
    advance ctx run.scope (store left { compensation with runs })

/-- `Signal.compensationFailed`: an Error the effect at `origin` reported left the handler occurrence `handler`
uncaught. -/
def failCompensation (_ : Ctx) (handler : ScopeOccurrenceId) (code : String) (message : Option String)
    (origin : Origin) (state : State) : Outcome := do
  let occurrence ← match state.scopes.find? (·.id == handler) with
    | some occurrence => .ok occurrence
    | none => .error (.semanticFailure "compensation-handler-gone")
  let run ← match state.slots.compensation.runs.find? (·.running.any (·.1 == handler)) with
    | some run => .ok run
    | none => .error (.semanticFailure "compensation-handler-without-run")
  let element ← match occurrence.element with
    | some element => .ok element
    | none => .error (.semanticFailure "compensation-handler-without-element")
  let activation ← match origin.activation with
    | some activation => .ok activation
    | none => .error (.unsupported "compensation-handler-error-without-effect")
  -- The handler's public occurrence is the activation its own start recorded: the raising Activity itself, or the
  -- Event Sub-Process occurrence entered inside the handler occurrence.
  let handlerActivation ←
    if origin.element == element then .ok activation
    else match state.scopes.find? (fun inner => inner.parent == some occurrence.id && inner.element == some element) with
      | some inner => .ok inner.activation
      | none => .error (.semanticFailure "compensation-handler-not-started")
  let failure : CompensationFailure :=
    { trigger := run.trigger
      handler := { processInstanceId := state.instanceOf handler, element, activation := handlerActivation }
      effect := { processInstanceId := state.instanceOf origin.scope, element := origin.element, activation }
      code, message }
  .ok { state.clearInside State.root with status := .failed, failure := some failure }

end Kernel.Feature.Compensation
