module

public import Kernel.Laws.Compensation
public import Kernel.Laws.State.Transitions
public import Kernel.IL.Paths
public import Kernel.Laws.Population
public import Kernel.Laws.State.Sample
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

Three P0 statements were false of the kernel and are corrected (root decision D1, 2026-11-15), each docstring naming
what P0 said, why it was false (P5 design probe `R1`–`R3`) and its citation: `CancelCompensatesFirst`, `TakesOutOnce`
and `HandlerFailure`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Queues Counted)
open Kernel.Laws.Compensation (ClaimsApart TakesOut Advances Ready)

/-! ## The lane relation -/

/-- Every retained record lies in a present scope occurrence. -/
def RetainedPresent (s : State) : Prop :=
  ∀ record ∈ s.slots.compensation.retained, record.scope ∈ scopeIds s

/-- Every run has a handler pending or running. -/
def RunsUnfinished (s : State) : Prop :=
  ∀ run ∈ s.slots.compensation.runs, run.pending ≠ [] ∨ run.running ≠ []

mutual

/-- The completion numbers of `record` and of the records it keeps as children, at every depth. -/
def completionsOf : Compensable → List Nat
  | { completion, children, .. } => completion :: completionsIn children

/-- The completion numbers of `records`, each with the records it keeps as children at every depth. -/
def completionsIn : List Compensable → List Nat
  | [] => []
  | record :: rest => completionsOf record ++ completionsIn rest

end

/-- The completion numbers a compensation slot holds, each record once: the retained records and every pending one,
each with the children it keeps at every depth, and each running one by its own number only, since its children were
retained in its context when it began, or became its group's nested run's pending records
(`Compensation.beginHandler`). -/
def completions (compensation : Compensations) : List Nat :=
  completionsIn compensation.retained ++ compensation.runs.flatMap fun run =>
    completionsIn run.pending ++ run.running.map (·.2.completion)

/-- No completion number is held twice: `Compensation.completed` issues each record's afresh, and a record moved into
its Scope's children, its parent or a run keeps its own. `ClaimsApart` rests on it, since a completion moves records
outward. -/
def CompletionsApart (compensation : Compensations) : Prop :=
  (completions compensation).Nodup

/-- Every completion number held was issued, so the next completion's is held by no record. -/
def CompletionsIssued (s : State) : Prop :=
  ∀ completion ∈ completions s.slots.compensation, completion < s.nextIssue

/-- No run holds a pending record that may start under `precedes` (`Laws.Compensation.Ready`): every advance starts the
ones that may (`Laws.Compensation.Advances`), and every other change to a run leaves it settled or drops it. -/
def RunsSettled (precedes : Compensable → Compensable → Prop) (s : State) : Prop :=
  ∀ run ∈ s.slots.compensation.runs, ∀ record, ¬ Ready precedes run record

/-- No two runs share a scope occurrence and a trigger, the key `Compensation.advance` and `release` find a run by
(`isRun`). -/
def RunsKeyed (s : State) : Prop :=
  (s.slots.compensation.runs.map fun run => (run.scope, run.trigger)).Nodup

/-- Every run's scope occurrence was issued, so a context entered later is no run's and a group's nested run takes a
key no run has. -/
def RunsIssued (s : State) : Prop :=
  ∀ run ∈ s.slots.compensation.runs, run.scope.value < s.nextIssue

/-- Whether a compensation resumes a group's nested run (`Resume.group`), which only `Compensation.beginHandler`
makes. -/
def resumesGroup : Option Resume → Bool
  | some (.group _ _) => true
  | some (.complete _ _) => false
  | some (.occur _ _ _) => false
  | none => false

/-- The trigger a queued compensation or Cancel raise (`Laws.Step.triggersOf`) names in `s`: a compensation's own, and
for a Cancel raise its thrower while the raise's scope occurrence stands, the trigger of the compensation its catch
queues (`Feature.Propagation.leaveOccurrence`). -/
def queuedTrigger (s : State) : OccurrenceRef ⊕ Origin → Option OccurrenceRef
  | .inl trigger => some trigger
  | .inr origin =>
    if origin.scope ∈ scopeIds s then
      some { processInstanceId := s.instanceOf origin.scope, element := origin.element, activation := origin.activation }
    else none

/-- The triggers `s`'s queued compensations and Cancel raises name (`queuedTrigger`). -/
def queuedTriggers (s : State) : List OccurrenceRef :=
  (Laws.Step.triggersOf s.signals).filterMap (queuedTrigger s)

/-- The triggers `s` keeps apart: its runs' but a group's nested runs', which share their outer run's, and the queued
ones. -/
def heldTriggers (s : State) : List OccurrenceRef :=
  (s.slots.compensation.runs.filter (!resumesGroup ·.resume)).map (·.trigger) ++ queuedTriggers s

/-- The key of the occurrence a trigger names, which numbers under its element's own counter. -/
def triggerKey (trigger : OccurrenceRef) : OccurrenceKey :=
  { processInstanceId := trigger.processInstanceId, element := trigger.element, activation := trigger.activation }

/-- Every compensation trigger the state holds is held once and was counted, so a compensation `Step` performs takes a
key no run has (`CompensationsFresh`): the held triggers are distinct (`heldTriggers`); a group's nested run, which
takes the trigger of the run whose handler began it, shares none of the queued ones; every run's and every queued
trigger's activation was issued by its counter (`Laws.State.Counted`), so an occurrence begun afresh later is no thrower
of one; and a queued Cancel raise's scope occurrence was issued, so no scope occurrence entered later makes it name a
trigger (`queuedTrigger`). A group's nested run is tied to no outer run: a drop by scope occurrence
(`Compensation.dropWithin`) may take its outer run and leave it. -/
structure TriggersApart (s : State) : Prop where
  apart : (heldTriggers s).Nodup
  grouped : ∀ run ∈ s.slots.compensation.runs, resumesGroup run.resume = true → run.trigger ∉ queuedTriggers s
  counted : ∀ trigger ∈ s.slots.compensation.runs.map (·.trigger) ++ queuedTriggers s, Counted s (triggerKey trigger)
  issued : ∀ origin, .inr origin ∈ Laws.Step.triggersOf s.signals → origin.scope.value < s.nextIssue

/-- No queued compensation resumes a group: `Propagation` queues those that complete or occur an occurrence, and a
group's nested run resumes its outer run directly (`Compensation.advance`). -/
def QueuedUngrouped (s : State) : Prop :=
  ∀ scope activity trigger leave resume, Signal.compensate scope activity trigger leave resume ∈ s.signals →
    resumesGroup resume = false

/-- The lane relation: no record is claimed twice (`ClaimsApart`), every retained record lies in a present scope
occurrence and no finished run is left, the P0 slot invariant, and its inductive strengthening, which the kernel keeps
by construction (root decision D2, 2026-11-15): completion numbers apart and issued, runs settled under `precedes` and
keyed apart in issued scope occurrences, the held triggers apart and no queued compensation resuming a group (root
decision on the P5 hook proofs' stop, 2026-11-15). It is a lane premise beside
`WellFormed`, not a clause of it, since feature slot entries are each feature's own laws; the lane proves it kept, as P2
does `WellFormed`: by a committed input, at a start (`CompensationsFormedAtStart`) and in every instance of a population
run (`CompensationsFormedInPopulation`). Without `CompletionsApart` a completion that moves a record outward would make
two claimed records equal; without `RunsSettled` and `RunsKeyed` a run no hook touches could hold a ready handler, and a
second run of one key would be advanced in its place, and without `RunsIssued` a group's context, entered afresh, could
be a run's scope occurrence, whose run its nested run's advance then finds; without `TriggersApart` and
`QueuedUngrouped` a compensation could take a key a run holds, whose advance then finds the old run and loses the new
one, or end by releasing a context. -/
structure Formed (precedes : Compensable → Compensable → Prop) (s : State) : Prop where
  claims : ClaimsApart s.slots.compensation
  retained : RetainedPresent s
  unfinished : RunsUnfinished s
  completions : CompletionsApart s.slots.compensation
  issued : CompletionsIssued s
  settled : RunsSettled precedes s
  keyed : RunsKeyed s
  runsIssued : RunsIssued s
  triggers : TriggersApart s
  ungrouped : QueuedUngrouped s

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
occurrence left without completing keeps none (§13.5.5, "presumed abort"; `Laws.Compensation.LeaveDrops`). -/
def RetainedInPresentScopes (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks reads writes program before after → RetainedPresent after

/-- Completion: a run whose handlers have all completed continues and goes within the input, so no finished run is
left after a committed input (`Laws.Compensation.EndsOnce`). -/
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
on a state that keeps the lane relation.

P0 said that some run of the after-state with the trigger takes out exactly the selected records. That was false (P5
design probe `R2`): the after-state holds the run after its first advance, whose started handlers have left `pending`;
an empty selection ends the run at once (`scenarios/transaction-cancellation/empty.scenario.json`), so no run is left;
and a begun handler's children are retained in its context. This statement keeps P0's meaning, the selected records
taken and every other one kept, of the run as taken: every record retained in a scope occurrence issued before the call
stays retained exactly when it was kept (§13.5.5, the #103 account). -/
def TakesOutOnce (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (ctx : Ctx) (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef)
    (leave : Option Nat) (resume : Option Resume) (state after : State),
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
Stated of `Hooks.compensate` and `Hooks.handlerCompleted`, the hooks that start handlers, on a state that keeps the
lane relation, as `Step` calls them (root decision D2, 2026-11-15); the new run's first advance is `TakesOutOnce`'s.
`reads` and `writes` name what each subject's run reads and writes; the lane binds them to the kernel's footprint
`NameSet`s through `Laws.IL.listed` (`Laws.IL.NameSet.meets_iff_listed`, root decision D3, 2026-11-15). -/
def HandlersInOrder (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (ctx : Ctx) (state after : State) (run next : CompensationRun),
    Formed (Depends ctx.program (reads ctx) (writes ctx)) state →
    ((∃ scope activity trigger leave resume, hooks.compensate ctx scope activity trigger leave resume state = .ok after) ∨
      ∃ context occurrence, hooks.handlerCompleted ctx context occurrence state = .ok after) →
    run ∈ state.slots.compensation.runs → next ∈ after.slots.compensation.runs → next.trigger = run.trigger →
    next.scope = run.scope → ∃ released started, Advances (Depends ctx.program (reads ctx) (writes ctx)) released next started ∧
      released.pending = run.pending ∧ released.trigger = run.trigger

/-! ## Failure -/

/-- How the search `hooks.raise` runs, when it is Propagation's (`Feature.Propagation.raise`) over some `propagation`
hooks, passes a scope occurrence `occurrence` that it calls a compensation handler's context: it offers the context's
own Event Sub-Processes (`Feature.Propagation.handlerCandidates`) and the boundaries on its element, as at an ordinary
scope occurrence, and when none of them catches it passes the context's Call outputs and goes on from
`occurrence.parent`. Which candidates the context offers is open (#159); this says only that they are offered and the
search then goes on. -/
def PassesHandlerContext (hooks : Hooks) (ctx : Ctx) (raised : Raised) (origin : Origin) : Prop :=
  ∀ propagation, hooks.raise = Feature.Propagation.raise propagation →
    ∀ (state passed : State) (fuel : Nat) (current : ScopeOccurrenceId) (occurrence : ScopeOccurrence)
      (handlers : List (ElementId × Subscription × Bool)),
      state.scopes.find? (·.id == current) = some occurrence →
      ctx.scopeRole state occurrence.id = .compensationHandler →
      Feature.Propagation.handlerCandidates ctx raised origin state occurrence = .ok handlers →
      Feature.Propagation.best? ctx raised (·.2.1.trigger) handlers = none →
      (∀ element, occurrence.element = some element →
        Feature.Propagation.best? ctx raised (·.subscription.trigger) (Feature.Propagation.boundariesOf ctx element) =
          none) →
      Feature.Propagation.passCallOutputs propagation ctx origin false occurrence state = .ok passed →
      Feature.Propagation.searchScopes propagation ctx raised origin state (fuel + 1) (some current) =
        Feature.Propagation.searchScopes propagation ctx raised origin passed fuel occurrence.parent

/-- The queries a hook's context answers as `Step`'s for `hooks` does (`Step.context`): how a catch trigger catches a
raised event, an Event Sub-Process's start, and what a scope occurrence is. -/
def StepQueries (hooks : Hooks) (ctx : Ctx) : Prop :=
  ctx.catches = hooks.catches ∧ ctx.eventStart = hooks.eventStart ∧ ctx.scopeRole = Step.scopeRole

/-- Failure: an Error that leaves a compensation handler's context uncaught fails the instance under
`CompensationHandlerFailure.failsInstance` (COMPH-FAIL-01) and is searched for on from the context's parent, the
run's scope occurrence, under `propagatesFromTrigger` (CIB-INT-0038). Three parts:
(a) `Hooks.failCompensation`, which `Step` calls for a queued `Signal.compensationFailed`, queues the failed end of the
instance, naming the run's trigger and the handler, whatever the option;
(b) under `propagatesFromTrigger` the search `Hooks.raise` runs passes a compensation handler's context
(`PassesHandlerContext`): it offers the context's own candidates and, when none catches, goes on from the context's
parent, which for a running context is the run's scope occurrence (`Laws.State.SlotsSettled.runsPlaced`); and the raise
queues no `compensationFailed`;
(c) under `failsInstance` every `compensationFailed` a raise queues names a scope occurrence `Step` calls a compensation
handler's context, a running context of a run.
Which candidates the context's level offers is open (#159), and none of the three says it is skipped.

P0 said that under `propagatesFromTrigger` `Hooks.failCompensation` queues no failed end but a raise, and under
`failsInstance` a failed end. That was false (P5 design probe `R3`): `Compensation.failCompensation` reads no option
and always queues the failed end; it is reached only under `failsInstance`, since the search queues
`compensationFailed` only there (`Propagation.searchScopes`), and under `propagatesFromTrigger` the search goes on.
COMPH-FAIL-01 and CIB-INT-0038 are kept. -/
def HandlerFailure (hooks : Hooks) : Prop :=
  (∀ (ctx : Ctx) (handler : ScopeOccurrenceId) (code : String) (message : Option String) (origin : Origin)
      (state after : State),
      hooks.failCompensation ctx handler code message origin state = .ok after →
      ∃ failure run, Queues state after [.endInstance .failed (some failure)] ∧ failure.code = code ∧
        failure.message = message ∧ run ∈ state.slots.compensation.runs ∧ handler ∈ run.running.map (·.1) ∧
        ("trigger", run.trigger) ∈ failure.related ∧ ∃ reference, ("handler", reference) ∈ failure.related) ∧
    (∀ (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State),
      ctx.program.options.compensationHandlerFailure = .propagatesFromTrigger →
      PassesHandlerContext hooks ctx raised origin ∧ ∀ after, hooks.raise ctx raised origin state = .ok after → ∃ new, Queues state after new ∧
        ∀ handler code message raisedFrom, Signal.compensationFailed handler code message raisedFrom ∉ new) ∧
    ∀ (ctx : Ctx) (raised : Raised) (origin : Origin) (state after : State), StepQueries hooks ctx →
      ctx.program.options.compensationHandlerFailure = .failsInstance →
      hooks.raise ctx raised origin state = .ok after → ∃ new, Queues state after new ∧
        ∀ handler code message raisedFrom, Signal.compensationFailed handler code message raisedFrom ∈ new →
          ctx.scopeRole state handler = .compensationHandler

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

/-! ## Non-vacuity of the lane relation's strengthening

Each clause `Formed` adds to the P0 slot invariant rejects a small state. A record `A` completed in the root scope
occurrence; a trigger thrown by occurrence 7 of `T`. -/

def subjectA : ElementId := ⟨"A"⟩
def thrower : ElementId := ⟨"T"⟩
def rootScope : ScopeOccurrenceId := ⟨0⟩

def recordA : Compensable := { subject := subjectA, handler := some ⟨"UndoA"⟩, scope := rootScope, completion := 1 }
def thrownBy : OccurrenceRef := { processInstanceId := "p", element := thrower, activation := 1 }
def pendingRun : CompensationRun := { trigger := thrownBy, scope := rootScope, pending := [recordA], leave := none, resume := none }

/-- A state holding `compensation` and queuing `signals`, its root scope occurrence and the counter of `T` at 1. -/
def holding (compensation : Compensations) (signals : List Signal) : State :=
  { instanceId := "p", scopes := [{ id := rootScope, element := none, parent := none }], nextIssue := 8, signals,
    activations := [{ processInstance := "p", element := thrower, role := .element, count := 1 }],
    slots := { compensation } }

/-- Two records of one completion number break `CompletionsApart`. -/
theorem shared_completion_rejected :
    ¬ CompletionsApart { retained := [recordA, { recordA with subject := thrower }] } := by
  simp [CompletionsApart, completions, completionsIn, completionsOf, recordA]

/-- A completion number not yet issued breaks `CompletionsIssued`. -/
theorem unissued_completion_rejected :
    ¬ CompletionsIssued { holding { retained := [recordA] } [] with nextIssue := 1 } := by
  simp [CompletionsIssued, completions, completionsIn, completionsOf, holding, recordA]

/-- A run whose pending record may start breaks `RunsSettled`. -/
theorem ready_pending_rejected : ¬ RunsSettled (fun _ _ => False) (holding { runs := [pendingRun] } []) := fun settled =>
  settled pendingRun (by simp [holding]) recordA ⟨by simp [pendingRun], fun _ _ none => none⟩

/-- Two runs of one key break `RunsKeyed`. -/
theorem shared_key_rejected : ¬ RunsKeyed (holding { runs := [pendingRun, pendingRun] } []) := by
  simp [RunsKeyed, holding]

/-- A run in a scope occurrence not yet issued breaks `RunsIssued`. -/
theorem unissued_run_rejected : ¬ RunsIssued (holding { runs := [{ pendingRun with scope := ⟨8⟩ }] } []) := by
  simp [RunsIssued, holding]

/-- A queued compensation with a run's trigger breaks `TriggersApart`. -/
theorem shared_trigger_rejected :
    ¬ TriggersApart (holding { runs := [pendingRun] } [.compensate rootScope none thrownBy none none]) := fun apart => by
  have nodup := apart.apart
  simp [heldTriggers, queuedTriggers, holding, pendingRun, resumesGroup, Laws.Step.triggersOf_compensate,
    queuedTrigger] at nodup

/-- `pendingRun` as a group's nested run. -/
def groupRun : CompensationRun := { pendingRun with resume := some (.group rootScope rootScope) }

/-- A group's nested run with a queued compensation's trigger breaks `TriggersApart`, though no run but a group's holds
the trigger. -/
theorem queued_group_trigger_rejected :
    ¬ TriggersApart (holding { runs := [groupRun] } [.compensate rootScope none thrownBy none none]) := fun apart => by
  refine apart.grouped groupRun (by simp [holding]) (by simp [groupRun, resumesGroup]) ?_
  simp [queuedTriggers, holding, groupRun, pendingRun, Laws.Step.triggersOf_compensate, queuedTrigger]

/-- A trigger whose activation its counter has not issued breaks `TriggersApart`. -/
theorem uncounted_trigger_rejected :
    ¬ TriggersApart (holding { runs := [{ pendingRun with trigger := { thrownBy with activation := 2 } }] } []) :=
  fun apart => by
    obtain ⟨count, member, named⟩ := apart.counted { thrownBy with activation := 2 } (by simp [holding])
    obtain ⟨_, _, _, below⟩ := named
    simp [holding] at member
    simp [member, triggerKey] at below

/-- So does a group's nested run whose trigger's activation was not issued, though no held trigger names it. -/
theorem uncounted_group_rejected :
    ¬ TriggersApart (holding { runs := [{ groupRun with trigger := { thrownBy with activation := 2 } }] } []) :=
  fun apart => by
    obtain ⟨count, member, named⟩ := apart.counted { thrownBy with activation := 2 } (by simp [holding])
    obtain ⟨_, _, _, below⟩ := named
    simp [holding] at member
    simp [member, triggerKey] at below

/-- A queued Cancel raise from a scope occurrence not yet issued breaks `TriggersApart`. -/
theorem unissued_raise_rejected :
    ¬ TriggersApart (holding {} [.raise .cancel { element := thrower, scope := ⟨8⟩, activation := 1 }]) := fun apart => by
  have below := apart.issued { element := thrower, scope := ⟨8⟩, activation := 1 }
    (by simp [holding, Laws.Step.triggersOf_raise, Laws.State.isCancel_cancel])
  simp [holding] at below

/-- A queued compensation that resumes a group breaks `QueuedUngrouped`. -/
theorem queued_group_rejected :
    ¬ QueuedUngrouped (holding {} [.compensate rootScope none thrownBy none (some (.group rootScope rootScope))]) :=
  fun ungrouped => by
    have := ungrouped rootScope none thrownBy none (some (.group rootScope rootScope)) (by simp [holding])
    simp [resumesGroup] at this

end Kernel.Proofs.Compensation
