module

public import Kernel.Laws.Compensation
public import Kernel.Laws.State.Transitions
public import Kernel.IL.Paths
public import Kernel.Laws.Population
public import Kernel.Proofs.Compensation.Relation
public import Kernel.Laws.Propagation

/-! # Proofs: Compensation and Transaction (P5)

The statements of the proof wave's Compensation and Transaction lane ([PLAN, P5](../../docs/PLAN.md#proof-wave)):
`Laws.Compensation` and the Cancel rules of `Laws.Propagation` under `Step`, from a `Laws.State.WellFormed`
before-state that keeps the lane relation `Formed`, for retention, single take-out, handler order, completion, failure
and Cancel propagation. Each is stated over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of
`Registry.hooks`; a statement about one hook is about the micro-step in which `Step` calls it (`Laws.Step`), and one
that reads the state the hook runs on takes `Formed` of that state, as `Step` calls the hook only on a closure state that
keeps it (P4 D6 precedent).

Model premises: the profile option `compensationHandlerFailure`; the read and write name lists that `Depends` takes for
§13.5.5's dependency, which the lane binds to the kernel's footprint `NameSet`s (`NameSet.meets_iff_listed`); and
`CancelCatchers`, from the refusal codes `start.cancel`, `boundary.cancel.host` and `boundary.cancel.nonInterrupting`.
`StepQueries` is no model premise: it says a hook's context answers the queries as `Step`'s does (`Step.context`).
That admission refuses the compensation shapes the kernel does not run (`compensation.*`, `throw.compensation.*`,
`throw.cancel.*`) stays scenario evidence.

Four P0 statements were false of the kernel and are corrected (root decisions D1 and D2, 2026-11-15), each docstring
naming what P0 said, why it was false (P5 design probe `R1`–`R3`, design report on `HandlersInOrder`) and its citation:
`CancelCompensatesFirst`, `TakesOutOnce`, `HandlerFailure` and `HandlersInOrder`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Queues Counted)
open Kernel.Laws.Compensation (ClaimsApart TakesOut Advances Ready)

/-! ## Handler order -/

/-- The boundary Events attached to `subject`, read from the IL. -/
def attachedBoundaries (program : Program) (subject : ElementId) : List ElementId :=
  (((program.element? subject).bind (·.envelope?)).map fun envelope => envelope.boundaries.map (·.id)).getD []

/-- §13.5.5's dependency between two records of one trigger, `Laws.Compensation.Precedes` over the program's Sequence
Flow paths (`flowReaches`), the subjects' attached boundary Events and the variable names each subject's run reads
and writes, `reads` and `writes`. -/
def Depends (program : Program) (reads writes : ElementId → List String) : Compensable → Compensable → Prop :=
  Laws.Compensation.Precedes (flowReaches program) (attachedBoundaries program) reads writes

/-- `Depends` under the read and write name lists of `Step`'s context for `hooks` and `program`
(`Step.context`), what the lane relation of an instance of `program` is settled by. -/
def DependsIn (hooks : Hooks) (reads writes : Ctx → ElementId → List String) (program : Program) :
    Compensable → Compensable → Prop :=
  Depends program (reads (Step.context hooks program)) (writes (Step.context hooks program))

/-! ## The lane relation across inputs -/

/-- A committed start keeps the lane relation. -/
def CompensationsFormedAtStart (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (program : Program) (input : Input) (after : State), Step.step hooks program none input = .ok after →
    Formed (DependsIn hooks reads writes program) after

/-- Every instance a committed population run holds keeps the lane relation. -/
def CompensationsFormedInPopulation (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result →
    ∀ instance_ ∈ result.instances, Formed (DependsIn hooks reads writes instance_.deployment.program) instance_.state

/-- A committed input from `before` to `after`, from a well-formed before-state that keeps the lane relation. -/
def Commits (hooks : Hooks) (reads writes : Ctx → ElementId → List String) (program : Program) (before after : State) :
    Prop :=
  WellFormed program before ∧ Formed (DependsIn hooks reads writes program) before ∧
    ∃ input, Step.step hooks program (some before) input = .ok after

/-- Single take-out across triggers: no record a run claimed is retained again, so no second trigger compensates it
(§13.5.5, Figure 13.2, #103). -/
def ClaimsStayApart (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks reads writes program before after →
    ClaimsApart after.slots.compensation

/-- Retention: every record still retained after a committed input lies in a present scope occurrence, so a scope
occurrence left without completing keeps none (§13.5.5, "presumed abort"; the drop side of
`Laws.Compensation.LeaveDrops`). That every other record is kept, and what a completion retains
(`Laws.Compensation.Retains`), stay witness-only. -/
def RetainedInPresentScopes (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks reads writes program before after → RetainedPresent after

/-- Completion: a run whose handlers have all completed goes within the input, so no finished run is left after a
committed input. That it continues its thrower or Cancel boundary exactly once (`Laws.Compensation.EndsOnce`) stays
witness-only. -/
def NoFinishedRunLeft (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks reads writes program before after → RunsUnfinished after

/-! ## The trigger -/

/-- What `Step` calls `Hooks.compensate` with on a state that keeps the lane relation (`CompensationsFresh`): no run of
`state` has the key `(scope, trigger)` the new run takes, which `Compensation.advance` finds its run by, and the
compensation resumes no group's nested run, which only `Compensation.beginHandler` makes. -/
def FreshCall (state : State) (scope : ScopeOccurrenceId) (trigger : OccurrenceRef) (resume : Option Resume) : Prop :=
  (∀ run ∈ state.slots.compensation.runs, run.scope = scope → run.trigger ≠ trigger) ∧ resumesGroup resume = false

/-- Every compensation `Step` performs is a `FreshCall`. `Step` runs `Hooks.compensate` only for the signal it takes
off the head of a closure state (`Laws.Step.HookContract.compensate`, whose `Laws.State.Popped` premise names that
state), and from a before-state that keeps `WellFormed` and the lane relation every closure state does; there the
queued compensation's trigger is held apart from every run's and every other queued trigger (`TriggersApart`), and it
resumes no group (`QueuedUngrouped`). -/
def CompensationsFresh : Prop :=
  ∀ (precedes : Compensable → Compensable → Prop) (program : Program) (queue : State) (scope : ScopeOccurrenceId)
    (activity : Option ElementId) (trigger : OccurrenceRef) (leave : Option Nat) (resume : Option Resume)
    (rest : List Signal), WellFormed program queue → Formed precedes queue →
    queue.signals = .compensate scope activity trigger leave resume :: rest →
    FreshCall { queue with signals := rest } scope trigger resume

/-- A trigger takes into one new run exactly the retained records it selects, the named Activity's only when it names
one, and leaves every other record retained (`Laws.Compensation.TakesOut`); the run, as taken, then advances once
(`Laws.Compensation.Advances`), or, holding nothing, ends at once and continues its thrower (COMPH-EXCLUSIVE-01).
Stated of `Hooks.compensate`, which `Step` calls for a queued `Signal.compensate` as a `FreshCall` (`CompensationsFresh`)
on a well-formed state that keeps the lane relation. `WellFormed` is needed (root decision on the P5 TakesOutOnce stop,
2026-11-15): a scope occurrence whose parent was never issued would lie below a handler's fresh context, and a run
holding that context running would release it, removing a kept record (P5 probe `T2`); `IssuedBelow` with `Rooted` and
`RunPlaced` exclude both.

P0 said that some run of the after-state with the trigger takes out exactly the selected records. That was false (P5
design probe `R2`): the after-state holds the run after its first advance, whose started handlers have left `pending`;
an empty selection ends the run at once (`scenarios/transaction-cancellation/empty.scenario.json`), so no run is left;
and a begun handler's children are retained in its context. This statement keeps P0's meaning, the selected records
taken and every other one kept, of the run as taken: every record retained in a scope occurrence issued before the call
stays retained exactly when it was kept (§13.5.5, the #103 account). -/
def TakesOutOnce (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (ctx : Ctx) (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef)
    (leave : Option Nat) (resume : Option Resume) (state after : State), WellFormed ctx.program state →
    Formed (Depends ctx.program (reads ctx) (writes ctx)) state → FreshCall state scope trigger resume →
    hooks.compensate ctx scope activity trigger leave resume state = .ok after →
    ∃ covered taken kept, taken.trigger = trigger ∧ taken.scope = scope ∧ taken.running = [] ∧
      taken.leave = leave ∧ taken.resume = resume ∧
      TakesOut covered activity state.slots.compensation
        { retained := kept, runs := state.slots.compensation.runs ++ [taken] } taken ∧
      (∀ record, record.scope.value < state.nextIssue →
        (record ∈ after.slots.compensation.retained ↔ record ∈ kept)) ∧
      ((taken.pending = [] ∧ ∀ next ∈ after.slots.compensation.runs, next.scope = scope → next.trigger ≠ trigger) ∨
        ∃ next ∈ after.slots.compensation.runs, next.scope = scope ∧ next.trigger = trigger ∧
          ∃ started, Advances (Depends ctx.program (reads ctx) (writes ctx)) taken next started)

/-- Handler order: every change a hook makes to a run in progress is one `Advances` of it under `Depends`
(`Laws.Compensation.Advances`), so no handler starts while one that must complete before it is pending or running.
Stated of `Hooks.compensate` and `Hooks.handlerCompleted`, the hooks that start handlers, on a well-formed state that
keeps the lane relation, as `Step` calls them (root decision D2, 2026-11-15), and for a compensation that is a
`FreshCall`, as every one `Step` performs is (`compensationsFresh`, root decision on the P5 TakesOutOnce stop,
2026-11-15); `WellFormed` is `TakesOutOnce`'s premise for the same reason. The new run's first advance is
`TakesOutOnce`'s.
P0 stated it with no premise on the hook's state. That was false: over an arbitrary state a run untouched by the hook
may hold a ready pending handler, and two runs may share one scope occurrence and trigger, where `release` and
`advance` pick the other run (P5 design report); `FreshCall` is taken for the reason `TakesOutOnce` takes it (P5
report F2). The conclusion is P0's, unchanged.
`reads` and `writes` name what each subject's run reads and writes; the lane binds them to the kernel's footprint
`NameSet`s through `Laws.IL.listed` (`Laws.IL.NameSet.meets_iff_listed`, root decision D3, 2026-11-15). -/
def HandlersInOrder (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (ctx : Ctx) (state after : State) (run next : CompensationRun), WellFormed ctx.program state →
    Formed (Depends ctx.program (reads ctx) (writes ctx)) state →
    ((∃ scope activity trigger leave resume, FreshCall state scope trigger resume ∧
        hooks.compensate ctx scope activity trigger leave resume state = .ok after) ∨
      ∃ context occurrence, hooks.handlerCompleted ctx context occurrence state = .ok after) →
    run ∈ state.slots.compensation.runs → next ∈ after.slots.compensation.runs → next.trigger = run.trigger →
    next.scope = run.scope → ∃ released started, Advances (Depends ctx.program (reads ctx) (writes ctx)) released next started ∧
      released.pending = run.pending ∧ released.trigger = run.trigger

/-! ## Failure -/

/-- How the search `hooks.raise` runs, when it is Propagation's (`Feature.Propagation.raise`) over some `propagation`
hooks, passes a scope occurrence `occurrence` that it calls a compensation handler's context: it reads the record whose
handler or group runs there (`propagation.handlerRecord`), offers what `Feature.Propagation.contextCatcher` offers of
the completed subject, and when nothing there catches goes on from the scope occurrence holding that record,
`record.scope`, through the handler's model scopes, never from `occurrence.parent`, the trigger's scope occurrence
(#159), passing on the handler the raise runs in: the record's own, or for a group the one the search reached it from
(`jumped`). -/
def PassesHandlerContext (hooks : Hooks) (ctx : Ctx) (raised : Raised) (origin : Origin) : Prop :=
  ∀ propagation, hooks.raise = Feature.Propagation.raise propagation →
    ∀ (state : State) (fuel : Nat) (jumped : Option (Option ElementId)) (current : ScopeOccurrenceId)
      (occurrence : ScopeOccurrence) (record : Compensable),
      state.scopes.find? (·.id == current) = some occurrence →
      ctx.scopeRole state occurrence.id = .compensationHandler →
      propagation.handlerRecord ctx occurrence.id state = some record →
      Feature.Propagation.contextCatcher ctx raised state record (record.handler.orElse fun _ => jumped.join) =
        .ok none →
      Feature.Propagation.searchScopes propagation ctx raised origin state (fuel + 1) jumped (some current) =
        Feature.Propagation.searchScopes propagation ctx raised origin state fuel
          (some (record.handler.orElse fun _ => jumped.join)) (some record.scope)

/-- How the search `hooks.raise` runs, when it is Propagation's (`Feature.Propagation.raise`) over some `propagation`
hooks, stops at a scope occurrence `occurrence` that it calls a compensation handler's context: the search is exhausted
there, naming the context (`Feature.Propagation.exhausted`), and never reaches the context's parent. -/
def StopsAtHandlerContext (hooks : Hooks) (ctx : Ctx) (raised : Raised) (origin : Origin) : Prop :=
  ∀ propagation, hooks.raise = Feature.Propagation.raise propagation →
    ∀ (state : State) (fuel : Nat) (jumped : Option (Option ElementId)) (current : ScopeOccurrenceId)
      (occurrence : ScopeOccurrence),
      state.scopes.find? (·.id == current) = some occurrence →
      ctx.scopeRole state occurrence.id = .compensationHandler →
      Feature.Propagation.searchScopes propagation ctx raised origin state (fuel + 1) jumped (some current) =
        Feature.Propagation.exhausted propagation ctx raised origin (some occurrence.id) state

/-- The queries a hook's context answers as `Step`'s for `hooks` does (`Step.context`): how a catch trigger catches a
raised event, an Event Sub-Process's start, and what a scope occurrence is. -/
def StepQueries (hooks : Hooks) (ctx : Ctx) : Prop :=
  ctx.catches = hooks.catches ∧ ctx.eventStart = hooks.eventStart ∧ ctx.scopeRole = Step.scopeRole

/-- Failure: an Error that leaves a compensation handler's context uncaught fails the instance under
`CompensationHandlerFailure.failsInstance` (COMPH-FAIL-01) and is searched for on through the handler's model scopes,
from the scope occurrence holding the handler's record, under `propagatesFromHandler` (CIB-INT-0038, #159). Four
parts:
(a) `Hooks.failCompensation`, which `Step` calls for a queued `Signal.compensationFailed`, queues the failed end of the
instance, naming the run's trigger and the handler, whatever the option;
(b) under `propagatesFromHandler` the search `Hooks.raise` runs passes a compensation handler's context
(`PassesHandlerContext`): it offers what the context offers of the completed subject and, when nothing there catches,
goes on from the scope occurrence holding the handler's record, not from the context's parent, the run's scope
occurrence; and the raise queues no `compensationFailed`;
(c) under `failsInstance` every `compensationFailed` a raise queues names a scope occurrence `Step` calls a compensation
handler's context, a running context of a run;
(d) under `failsInstance` the search stops at a compensation handler's context (`StopsAtHandlerContext`): it is
exhausted there, naming the context, and never searches past it (COMPH-FAIL-01).

P0 said that under `propagatesFromHandler` `Hooks.failCompensation` queues no failed end but a raise, and under
`failsInstance` a failed end. That was false (P5 design probe `R3`): `Compensation.failCompensation` reads no option
and always queues the failed end; it is reached only under `failsInstance`, since the search queues
`compensationFailed` only there (`Propagation.searchScopes`), and under `propagatesFromHandler` the search goes on.
COMPH-FAIL-01 and CIB-INT-0038 are kept. -/
def HandlerFailure (hooks : Hooks) : Prop :=
  (∀ (ctx : Ctx) (handler : ScopeOccurrenceId) (code : String) (message : Option String) (origin : Origin)
      (state after : State),
      hooks.failCompensation ctx handler code message origin state = .ok after →
      ∃ failure run, Queues state after [.endInstance .failed (some failure)] ∧ failure.code = code ∧
        failure.message = message ∧ run ∈ state.slots.compensation.runs ∧ handler ∈ run.running.map (·.1) ∧
        ("trigger", run.trigger) ∈ failure.related ∧ ∃ reference, ("handler", reference) ∈ failure.related) ∧
    (∀ (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State),
      ctx.program.options.compensationHandlerFailure = .propagatesFromHandler →
      PassesHandlerContext hooks ctx raised origin ∧ ∀ after, hooks.raise ctx raised origin state = .ok after → ∃ new, Queues state after new ∧
        ∀ handler code message raisedFrom, Signal.compensationFailed handler code message raisedFrom ∉ new) ∧
    (∀ (ctx : Ctx) (raised : Raised) (origin : Origin) (state after : State), StepQueries hooks ctx →
      ctx.program.options.compensationHandlerFailure = .failsInstance →
      hooks.raise ctx raised origin state = .ok after → ∃ new, Queues state after new ∧
        ∀ handler code message raisedFrom, Signal.compensationFailed handler code message raisedFrom ∈ new →
          ctx.scopeRole state handler = .compensationHandler) ∧
    ∀ (ctx : Ctx) (raised : Raised) (origin : Origin),
      ctx.program.options.compensationHandlerFailure = .failsInstance → StopsAtHandlerContext hooks ctx raised origin

/-! ## Cancel -/

/-- `host` is a Transaction. -/
def TransactionHost (host : Element) : Prop :=
  ∃ header payload transaction, host.scope? = some (header, payload) ∧ payload.kind = .transaction transaction

/-- The model premise of the Cancel statement: in `program` a Cancel trigger starts no Event Sub-Process
(`start.cancel`) and is the trigger only of interrupting (`boundary.cancel.nonInterrupting`) boundaries of a
Transaction (`boundary.cancel.host`), the refusal codes that enforce it. -/
def CancelCatchers (program : Program) : Prop :=
  (∀ element ∈ program.elements, ∀ header payload start, element.scope? = some (header, payload) →
    payload.kind.start? = some start → start.trigger ≠ .cancel) ∧
  ∀ host ∈ program.elements, ∀ envelope, host.envelope? = some envelope → ∀ boundary ∈ envelope.boundaries,
    boundary.subscription.trigger = .cancel → boundary.interrupting = true ∧ TransactionHost host

/-- `element` is an interrupting Cancel boundary of a Transaction in `program`, and `leave` its outgoing flows. -/
def CancelBoundary (program : Program) (element : ElementId) (leave : Leave) : Prop :=
  ∃ host ∈ program.elements, TransactionHost host ∧ ∃ envelope, host.envelope? = some envelope ∧
    ∃ boundary ∈ envelope.boundaries, boundary.id = element ∧ boundary.subscription.trigger = .cancel ∧
      boundary.interrupting = true ∧ leave = .flows boundary.outgoing

/-- Cancel propagation: a Cancel End Event inside a Transaction compensates the Transaction's completed work before its
Cancel boundary is taken (§10.3.5 Transaction: the boundary "will direct the flow after the Transaction has been rolled
back and all compensation has been completed"; §13.5.6). Two parts:
(a) `Hooks.arriveThrow` of a Cancel End adds no token and queues exactly its own leave and a Cancel raise from its
occurrence, with no host: it queues no compensation and begins nothing;
(b) `Hooks.raise` of that raise, when it commits under the Step context (`StepQueries`) and the model premise
(`CancelCatchers`), removes the rolled-back interior's tokens and adds none, and queues exactly one compensation, whose
trigger is the thrower and whose resume occurs a Cancel boundary on its flows (`CancelBoundary`), so the boundary is
taken only once the compensation has ended; it begins nothing.

P0 said that `Hooks.arriveThrow` of a Cancel End queues the compensation. That was false (P5 design probe `R1`):
`Propagation.arriveThrow` queues the End's leave and the Cancel raise only, and the compensation is queued when the raise
takes the Cancel boundary (`Propagation.leaveOccurrence`). The three refusal codes of `CancelCatchers` are kept. -/
def CancelCompensatesFirst (hooks : Hooks) : Prop :=
  (∀ (ctx : Ctx) (header : Header) (payload : EventPayload) (occurrence : Occurrence) (state after : State),
    hooks.arriveThrow ctx header payload .cancel occurrence state = .ok after →
    after.tokens = state.tokens ∧ ∃ leave origin,
      Queues state after ([.complete occurrence.id leave [] .outward] ++ [.raise .cancel origin]) ∧ origin.host = none ∧
      origin.element = header.id ∧ origin.scope = occurrence.scope ∧ origin.activation = occurrence.activation) ∧
  ∀ (ctx : Ctx) (origin : Origin) (state after : State), StepQueries hooks ctx → CancelCatchers ctx.program →
    origin.host = none → hooks.raise ctx .cancel origin state = .ok after →
    (∀ token ∈ after.tokens, token ∈ state.tokens) ∧ ∃ scope leave element at_ flows,
      Queues state after [.compensate scope none
        { processInstanceId := state.instanceOf origin.scope, element := origin.element, activation := origin.activation }
        leave (some (.occur element at_ flows))] ∧ CancelBoundary ctx.program element flows

end Kernel.Proofs.Compensation
