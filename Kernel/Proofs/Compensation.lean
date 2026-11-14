module

public import Kernel.Proofs.Cancellation
public import Kernel.Laws.Scopes
public import Kernel.Laws.Compensation
public import Kernel.Laws.Propagation
public import Kernel.IL.Paths
public import Kernel.Laws.Population

/-! # Proofs: Compensation and Transaction (P5)

The statements of the proof wave's Compensation and Transaction lane ([PLAN, P5](../../docs/PLAN.md#proof-wave)):
`Laws.Compensation` and the Cancel rules of `Laws.Propagation` under `Step`, from a `Laws.State.WellFormed`
before-state that keeps the lane's slot invariant `CompensationsFormed`, for retention, single take-out, handler order,
completion, failure and Cancel propagation. Each is stated over a hooks parameter and closes when `Kernel.Proofs.Step`
proves it of `Registry.hooks`; a statement about one hook is about the micro-step in which `Step` calls it
(`Laws.Step`).

Model premises: the profile option `compensationHandlerFailure` and the read and write name lists that
`HandlersInOrder` takes for §13.5.5's dependency (`Depends`). That admission refuses the compensation shapes the kernel
does not run (`compensation.*`, `throw.compensation.*`, `throw.cancel.*`) stays scenario evidence. Nothing executable
imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Queues)
open Kernel.Laws.Compensation (ClaimsApart TakesOut Advances Failed)

/-- Every retained record lies in a present scope occurrence. -/
def RetainedPresent (s : State) : Prop :=
  ∀ record ∈ s.slots.compensation.retained, record.scope ∈ scopeIds s

/-- Every run has a handler pending or running. -/
def RunsUnfinished (s : State) : Prop :=
  ∀ run ∈ s.slots.compensation.runs, run.pending ≠ [] ∨ run.running ≠ []

/-- The lane's slot invariant: no record is claimed twice (`ClaimsApart`), every retained record lies in a present scope
occurrence and no finished run is left. It is a lane premise beside `WellFormed`, not a clause of it, since feature
slot entries are each feature's own laws; the lane proves it preserved, as P2 does `WellFormed`: by a committed input
(`ClaimsStayApart`, `RetainedInPresentScopes` and `NoFinishedRunLeft` are its parts of the after-state), at a start
(`CompensationsFormedAtStart`) and in every instance of a population run (`CompensationsFormedInPopulation`). -/
def CompensationsFormed (s : State) : Prop :=
  ClaimsApart s.slots.compensation ∧ RetainedPresent s ∧ RunsUnfinished s

/-- A committed start keeps the lane's slot invariant. -/
def CompensationsFormedAtStart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (after : State), Step.step hooks program none input = .ok after →
    CompensationsFormed after

/-- Every instance a committed population run holds keeps the lane's slot invariant. -/
def CompensationsFormedInPopulation (hooks : Hooks) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result →
    ∀ instance_ ∈ result.instances, CompensationsFormed instance_.state

/-- A committed input from `before` to `after`, from a well-formed before-state that keeps the lane's slot invariant. -/
def Commits (hooks : Hooks) (program : Program) (before after : State) : Prop :=
  WellFormed before ∧ CompensationsFormed before ∧ ∃ input, Step.step hooks program (some before) input = .ok after

/-- Single take-out across triggers: no record a run claimed is retained again, so no second trigger compensates it
(§13.5.5, Figure 13.2, #103). -/
def ClaimsStayApart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks program before after →
    ClaimsApart after.slots.compensation

/-- Retention: every record still retained after a committed input lies in a present scope occurrence, so a scope
occurrence left without completing keeps none (§13.5.5, "presumed abort"; `Laws.Compensation.LeaveDrops`). -/
def RetainedInPresentScopes (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks program before after → RetainedPresent after

/-- A trigger takes into one new run exactly the retained records it selects, the named Activity's only when it
names one, and leaves every other record retained (`Laws.Compensation.TakesOut`). Stated of `Hooks.compensate`,
which `Step` calls for a queued `Signal.compensate`. -/
def TakesOutOnce (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef)
    (leave : Option Nat) (resume : Option Resume) (state after : State),
    hooks.compensate ctx scope activity trigger leave resume state = .ok after →
    ∃ covered, ∃ run ∈ after.slots.compensation.runs, run.trigger = trigger ∧
      TakesOut covered activity state.slots.compensation after.slots.compensation run

/-- The boundary Events attached to `subject`, read from the IL. -/
def attachedBoundaries (program : Program) (subject : ElementId) : List ElementId :=
  (((program.element? subject).bind (·.envelope?)).map fun envelope => envelope.boundaries.map (·.id)).getD []

/-- §13.5.5's dependency between two records of one trigger, `Laws.Compensation.Precedes` over the program's Sequence
Flow paths (`flowReaches`), the subjects' attached boundary Events and the variable names each subject's run reads
and writes, `reads` and `writes`. -/
def Depends (program : Program) (reads writes : ElementId → List String) : Compensable → Compensable → Prop :=
  Laws.Compensation.Precedes (flowReaches program) (attachedBoundaries program) reads writes

/-- Handler order: every change a hook makes to a run in progress is one `Advances` of it under `Depends`
(`Laws.Compensation.Advances`), so no handler starts while one that must complete before it is pending or running.
Stated of `Hooks.compensate` and `Hooks.handlerCompleted`, the hooks that start handlers. `reads` and `writes` name
what each subject's run reads and writes. `Laws.Compensation.Precedes` takes them as `List String`, while the kernel's
dependency reads a `NameSet` that may hold every name (`NameSet.all`, `Feature.Compensation.precedes`): a mismatch of
the law's type, not a kernel defect, handed explicitly to P5's lane review, which decides the law's type and with it
their binding. -/
def HandlersInOrder (hooks : Hooks) (reads writes : Ctx → ElementId → List String) : Prop :=
  ∀ (ctx : Ctx) (state after : State) (run next : CompensationRun),
    ((∃ scope activity trigger leave resume, hooks.compensate ctx scope activity trigger leave resume state = .ok after) ∨
      ∃ context occurrence, hooks.handlerCompleted ctx context occurrence state = .ok after) →
    run ∈ state.slots.compensation.runs → next ∈ after.slots.compensation.runs → next.trigger = run.trigger →
    next.scope = run.scope → ∃ released started, Advances (Depends ctx.program (reads ctx) (writes ctx)) released next started ∧
      released.pending = run.pending ∧ released.trigger = run.trigger

/-- Completion: a run whose handlers have all completed continues and goes within the input, so no finished run is
left after a committed input (`Laws.Compensation.EndsOnce`). -/
def NoFinishedRunLeft (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks program before after → RunsUnfinished after

/-- Failure: an Error that leaves a handler's context uncaught fails the instance under
`CompensationHandlerFailure.failsInstance` (COMPH-FAIL-01) and is searched for from the run's scope occurrence under
`propagatesFromTrigger` (CIB-INT-0038), without failing the instance there. Stated of `Hooks.failCompensation`, which
`Step` calls for a queued `Signal.compensationFailed`, of the signals it newly queues (`Laws.State.Queues`). -/
def HandlerFailure (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (handler : ScopeOccurrenceId) (code : String) (message : Option String) (origin : Origin)
    (state after : State),
    hooks.failCompensation ctx handler code message origin state = .ok after →
    ∃ new, Queues state after new ∧
      (ctx.program.options.compensationHandlerFailure = .failsInstance →
        ∃ failure, Signal.endInstance .failed failure ∈ new) ∧
      (ctx.program.options.compensationHandlerFailure = .propagatesFromTrigger →
        (∀ failure, Signal.endInstance .failed failure ∉ new) ∧
        ∃ run ∈ state.slots.compensation.runs, ∃ event raisedFrom, Signal.raise event raisedFrom ∈ new ∧
          run.running.any (·.1 == handler))

/-- Cancel propagation: a Cancel End Event inside a Transaction compensates the Transaction's completed work before its
Cancel boundary is taken, and is never caught by anything else (§10.5.4 Cancel, §13.5.6; `Laws.Propagation.CancelAdmission`
admits it only with exactly one Cancel boundary). Stated of `Hooks.arriveThrow`: the Cancel End queues one compensation of
its Transaction, whose run resumes at the boundary, among the signals it newly queues (`Laws.State.Queues`), and no
flow token. -/
def CancelCompensatesFirst (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (payload : EventPayload) (occurrence : Occurrence) (state after : State),
    hooks.arriveThrow ctx header payload .cancel occurrence state = .ok after →
    after.tokens = state.tokens ∧ ∃ new, Queues state after new ∧
      ∃ scope trigger leave resume, Signal.compensate scope none trigger leave resume ∈ new ∧ resume.isSome

end Kernel.Proofs.Compensation
