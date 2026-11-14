module

public import Kernel.Proofs.Cancellation
public import Kernel.Laws.Scopes
public import Kernel.Laws.Compensation
public import Kernel.Laws.Propagation

/-! # Proofs: Compensation and Transaction (P5)

The statements of the proof wave's Compensation and Transaction lane ([PLAN, P5](../../docs/PLAN.md#proof-wave)):
`Laws.Compensation` and the Cancel rules of `Laws.Propagation` under `Step`, from a `Laws.State.WellFormed`
before-state, for retention, single take-out, handler order, completion, failure and Cancel propagation. Each is stated
over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of `Registry.hooks`; a statement about one hook
is about the micro-step in which `Step` calls it (`Laws.Step`).

Model premises: the profile options `compensationHandlerFailure` and the dependency `precedes` of §13.5.5 that
`HandlersInOrder` takes as a parameter (`Laws.Compensation.Precedes`, whose Sequence Flow, boundary, read and write
arguments the IL determines). That admission refuses the compensation shapes the kernel does not run
(`compensation.*`, `throw.compensation.*`, `throw.cancel.*`) stays scenario evidence. Nothing executable imports this
module.
-/

public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds)
open Kernel.Laws.Compensation (ClaimsApart TakesOut Advances Failed)

/-- A committed input from `before` to `after`. -/
def Commits (hooks : Hooks) (program : Program) (before after : State) : Prop :=
  WellFormed before ∧ ∃ input, Step.step hooks program (some before) input = .ok after

/-- Single take-out across triggers: no record a run claimed is retained again, so no second trigger compensates it
(§13.5.5, Figure 13.2, #103). Its state premise adds `ClaimsApart` of the before-state to `WellFormed`, since feature
slot entries are each feature's own laws. -/
def ClaimsStayApart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks program before after →
    ClaimsApart before.slots.compensation → ClaimsApart after.slots.compensation

/-- Retention: every record still retained after a committed input lies in a present scope occurrence, so a scope
occurrence left without completing keeps none (§13.5.5, "presumed abort"; `Laws.Compensation.LeaveDrops`). -/
def RetainedInPresentScopes (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks program before after →
    (∀ record ∈ before.slots.compensation.retained, record.scope ∈ scopeIds before) →
    ∀ record ∈ after.slots.compensation.retained, record.scope ∈ scopeIds after

/-- A trigger takes into one new run exactly the retained records it selects, the named Activity's only when it
names one, and leaves every other record retained (`Laws.Compensation.TakesOut`). Stated of `Hooks.compensate`,
which `Step` calls for a queued `Signal.compensate`. -/
def TakesOutOnce (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef)
    (leave : Option Nat) (resume : Option Resume) (state after : State),
    hooks.compensate ctx scope activity trigger leave resume state = .ok after →
    ∃ covered, ∃ run ∈ after.slots.compensation.runs, run.trigger = trigger ∧
      TakesOut covered activity state.slots.compensation after.slots.compensation run

/-- Handler order: every change a hook makes to a run in progress is one `Advances` of it under §13.5.5's dependency
`precedes` (`Laws.Compensation.Advances`), so no handler starts while one that must complete before it is pending or
running. Stated of `Hooks.compensate` and `Hooks.handlerCompleted`, the hooks that start handlers. -/
def HandlersInOrder (hooks : Hooks) (precedes : Compensable → Compensable → Prop) : Prop :=
  ∀ (ctx : Ctx) (state after : State) (run next : CompensationRun),
    ((∃ scope activity trigger leave resume, hooks.compensate ctx scope activity trigger leave resume state = .ok after) ∨
      ∃ context occurrence, hooks.handlerCompleted ctx context occurrence state = .ok after) →
    run ∈ state.slots.compensation.runs → next ∈ after.slots.compensation.runs → next.trigger = run.trigger →
    next.scope = run.scope → ∃ released started, Advances precedes released next started ∧
      released.pending = run.pending ∧ released.trigger = run.trigger

/-- Completion: a run whose handlers have all completed continues and goes within the input, so no finished run is
left after a committed input (`Laws.Compensation.EndsOnce`). -/
def NoFinishedRunLeft (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State), Commits hooks program before after →
    ∀ run ∈ after.slots.compensation.runs, run.pending ≠ [] ∨ run.running ≠ []

/-- Failure: an Error that leaves a handler's context uncaught fails the instance under
`CompensationHandlerFailure.failsInstance` (COMPH-FAIL-01) and is searched for from the run's scope occurrence under
`propagatesFromTrigger` (CIB-INT-0038), without failing the instance there. Stated of `Hooks.failCompensation`, which
`Step` calls for a queued `Signal.compensationFailed`. -/
def HandlerFailure (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (handler : ScopeOccurrenceId) (code : String) (message : Option String) (origin : Origin)
    (state after : State),
    hooks.failCompensation ctx handler code message origin state = .ok after →
    (ctx.program.options.compensationHandlerFailure = .failsInstance →
      ∃ failure, Signal.endInstance .failed failure ∈ after.signals) ∧
    (ctx.program.options.compensationHandlerFailure = .propagatesFromTrigger →
      (∀ failure, Signal.endInstance .failed failure ∉ after.signals) ∧
      ∃ run ∈ state.slots.compensation.runs, ∃ event raisedFrom, Signal.raise event raisedFrom ∈ after.signals ∧
        run.running.any (·.1 == handler))

/-- Cancel propagation: a Cancel End Event inside a Transaction compensates the Transaction's completed work before its
Cancel boundary is taken, and is never caught by anything else (§10.5.4 Cancel, §13.5.6; `Laws.Propagation.CancelAdmission`
admits it only with exactly one Cancel boundary). Stated of `Hooks.arriveThrow`: the Cancel End queues one compensation of
its Transaction, whose run resumes at the boundary, and no flow token. -/
def CancelCompensatesFirst (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (payload : EventPayload) (occurrence : Occurrence) (state after : State),
    hooks.arriveThrow ctx header payload .cancel occurrence state = .ok after →
    after.tokens = state.tokens ∧
      ∃ scope trigger leave resume, Signal.compensate scope none trigger leave resume ∈ after.signals ∧ resume.isSome

end Kernel.Proofs.Compensation
