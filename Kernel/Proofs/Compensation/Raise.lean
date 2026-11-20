module

public import Kernel.Proofs.Compensation
public import Kernel.Laws.Propagation
public import Kernel.Laws.Compensation
public import Kernel.Laws.Scopes
public import Kernel.Laws.Step.Signals

/-! # Proofs of the Compensation lane: the Cancel and failure statements

`CancelCompensatesFirst` and `HandlerFailure` for any hooks record that registers Propagation's arrival, raise and
Compensation's failure, over search hooks whose Call output pass and catcher writes change only variables, whose
Error-path leave queues only completions and whose drop queues nothing (`RaiseRegistered`). The registry's record is one
such; which of its fields the record reads is `Kernel.Laws.Registry`'s to state, so the module that reads that registry
discharges `RaiseRegistered` and nothing here imports it. Nothing executable imports this module.
-/

public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (Queues)

/-- A committed Cancel raise from a thrower with no host, where no Event Sub-Process start catches a Cancel
(`Laws.Propagation.NoCancelStart`): its search passes the Call outputs on its way, leaving `passed`, of which `motive`
holds when it holds of the raise's state and which is `Steady` from it, and a boundary catches it there, rolling back its
scope occurrence and queueing its compensation (`Laws.Propagation.CancelTaken`). -/
theorem raise_cancel {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks} {origin : Origin}
    {motive : State → Prop} {state after : State} (facts : Laws.Propagation.RaiseFacts)
    (passes : Laws.Propagation.PassesKeep ctx hooks motive) (unstarted : Laws.Propagation.NoCancelStart ctx)
    (holds : motive state) (hostless : origin.host = none)
    (ran : Feature.Propagation.raise hooks ctx .cancel origin state = .ok after) :
    ∃ passed, Laws.State.Steady state passed ∧ motive passed ∧ Laws.Propagation.CancelTaken ctx origin passed after := by
  rcases Laws.Propagation.raise_spec ran with ⟨_, _, _, rest⟩ | searched
  · exact absurd rest.1.1 (by simp [hostless])
  · exact Laws.Propagation.searchScopes_cancel passes unstarted facts.cancel _ _ _ _ _ holds searched

/-- What a raise queues (`Feature.Propagation.raise`): signals `quiet` admits, and a compensation handler's failure only
under a profile that does not select `propagatesFromHandler` and only at a scope occurrence `ctx.scopeRole` calls a
compensation handler's context in a state the Call output passes on its way left, of which `motive` holds when it holds
of the raise's state (COMPH-FAIL-01). Under `propagatesFromHandler` it queues no such failure: the search goes on
(`Laws.Propagation.searchScopes_context`). -/
theorem raise_queues {quiet : Signal → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (facts : Laws.Propagation.RaiseFacts) (steps : Laws.Propagation.QuietSteps quiet)
    (calm : Laws.Propagation.QuietHooks ctx quiet hooks) {motive : State → Prop} {raised : Raised} {origin : Origin}
    {state after : State} (passes : Laws.Propagation.PassesKeep ctx hooks motive) (holds : motive state)
    (ran : Feature.Propagation.raise hooks ctx raised origin state = .ok after) :
    Laws.Propagation.Appends (fun signal => quiet signal ∨ Laws.Propagation.HandlerFailed ctx motive origin signal)
      state after := by
  rcases Laws.Propagation.raise_spec ran with ⟨_, _, _, rest⟩ | searched
  · obtain ⟨-, leaves, rfl⟩ := rest
    exact ((calm.mappedErrorOutputs _ _ _ _ leaves).trans (Laws.Propagation.fire_quiet facts steps _ _ _ _ _)).mono
      fun _ => Or.inl
  · exact Laws.Propagation.searchScopes_queues facts steps calm passes _ _ _ _ _ holds searched

/-- What `hooks` registers for a raise: Propagation's arrival at a throw and search over `propagation`, Compensation's
handler failure, Scopes' Event Sub-Process start, a Cancel caught only by a Cancel trigger, and search hooks that keep
what a Cancel raise's statement reads. -/
structure RaiseRegistered (hooks : Hooks) (propagation : Feature.Propagation.PropagationHooks) : Prop where
  arriveThrow : hooks.arriveThrow = Feature.Propagation.arriveThrow
  raise : hooks.raise = Feature.Propagation.raise propagation
  failCompensation : hooks.failCompensation = Feature.Compensation.failCompensation
  /-- A start the hooks read off a Scope is its Event Sub-Process's start. -/
  eventStart : ∀ payload start interrupting, hooks.eventStart payload = some (start, interrupting) →
    ∃ declared, payload.kind = .eventSubProcess start declared
  cancelCatches : ∀ trigger, (hooks.catches .cancel trigger).isSome = true → trigger = .cancel
  /-- A Call output pass is `Steady` and writes only variables. -/
  callOutputs : ∀ ctx root state after, propagation.callOutputs ctx root state = .ok after →
    Laws.State.Steady state after ∧ Laws.State.allQueuedTokens after = Laws.State.allQueuedTokens state ∧ Laws.State.allSignals after = Laws.State.allSignals state ∧
      after.slots = state.slots
  writeCaught : ∀ ctx scope writes state after, propagation.writeCaught ctx scope writes state = .ok after →
    Laws.State.allSignals after = Laws.State.allSignals state
  mappedErrorOutputs : ∀ ctx origin installed state after,
    propagation.mappedErrorOutputs ctx origin installed state = .ok after →
      Laws.Propagation.Appends (fun signal => ∃ id leave writes rule, signal = .complete id leave writes rule) state after
  dropRuns : ∀ ctx scope state, Laws.State.allSignals (propagation.dropRuns ctx scope state) = Laws.State.allSignals state

/-- The state operations' facts a raise's search reads. -/
theorem raiseFacts : Laws.Propagation.RaiseFacts where
  signal state signal := by rw [Laws.State.signal_eq]; exact Laws.State.allSignals_append _ _
  cleared state scope := Laws.State.allSignals_clearInside state scope _
  disarmed state host := by rw [Laws.State.disarm_eq]; rfl
  cancel := Laws.State.isCancel_cancel

/-- A signal other than a compensation handler's failure. -/
def NotHandlerFailure (signal : Signal) : Prop :=
  ∀ handler code message origin, signal ≠ .compensationFailed handler code message origin

/-- A raise's own steps queue no compensation handler's failure. -/
theorem notHandlerFailure_steps : Laws.Propagation.QuietSteps NotHandlerFailure where
  complete _ _ _ _ _ _ _ _ := Laws.Step.compensationFailed_apart.1 _ _ _ _
  begin _ _ _ _ _ := Laws.Step.compensationFailed_apart.2.1 _
  cancel _ _ _ _ _ := Laws.Step.compensationFailed_apart.2.2.1 _
  occur _ _ _ _ _ _ _ _ _ := Laws.Step.compensationFailed_apart.2.2.2.1 _ _ _ _ _
  write _ _ _ _ _ _ _ := Laws.Step.compensationFailed_apart.2.2.2.2.1 _ _ _
  fail _ _ _ _ _ := Laws.Step.compensationFailed_apart.2.2.2.2.2.1 _ _
  compensate _ _ _ _ _ _ _ _ _ := Laws.Step.compensationFailed_apart.2.2.2.2.2.2 _ _ _ _ _

/-- The registered search hooks queue no compensation handler's failure. -/
theorem notHandlerFailure_hooks {hooks : Hooks} {propagation : Feature.Propagation.PropagationHooks}
    (registered : RaiseRegistered hooks propagation) (ctx : Ctx) :
    Laws.Propagation.QuietHooks ctx NotHandlerFailure propagation where
  mappedErrorOutputs origin installed state after ran :=
    (registered.mappedErrorOutputs ctx origin installed state after ran).mono fun _ completes => by
      obtain ⟨id, leave, writes, completion⟩ := completes
      obtain ⟨rule, named⟩ := completion
      exact named ▸ notHandlerFailure_steps.complete id leave writes rule
  writeCaught scope writes state after ran := .same (registered.writeCaught ctx scope writes state after ran)
  callOutputs root state after ran := .same (registered.callOutputs ctx root state after ran).2.2.1
  dropRuns := registered.dropRuns ctx

/-- Under `CancelCatchers` and the Step context, no Event Sub-Process a scope occurrence declares starts on a trigger
that catches a Cancel. -/
theorem noCancelStart_of {hooks : Hooks} {propagation : Feature.Propagation.PropagationHooks} {ctx : Ctx}
    (registered : RaiseRegistered hooks propagation) (queries : StepQueries hooks ctx)
    (catchers : CancelCatchers ctx.program) : Laws.Propagation.NoCancelStart ctx := by
  intro state scope child member header payload start interrupting shaped started
  rw [queries.2.1] at started
  rw [queries.1]
  cases caught : hooks.catches .cancel start.trigger with
  | none => rfl
  | some _ =>
    have cancel := registered.cancelCatches start.trigger (by simp [caught])
    have declared : child ∈ ctx.program.elements := by
      rcases Laws.State.childrenOf_mem member with ⟨_, _, inside⟩ | ⟨_, inside⟩
      · exact Laws.IL.mem_processChildren inside
      · exact Laws.IL.mem_children inside
    obtain ⟨_, kind⟩ := registered.eventStart _ _ _ started
    refine absurd cancel (catchers.1 child declared header payload start shaped ?_)
    rw [kind]
    exact Laws.IL.start?_eventSubProcess _ _

/-- Under `CancelCatchers` and the Step context, a boundary that catches a Cancel is an interrupting Cancel boundary of
a Transaction. -/
theorem cancelBoundary_of {hooks : Hooks} {propagation : Feature.Propagation.PropagationHooks} {ctx : Ctx}
    {occurrence : ScopeOccurrence} {boundary : Boundary} (registered : RaiseRegistered hooks propagation)
    (queries : StepQueries hooks ctx) (catchers : CancelCatchers ctx.program)
    (caught : Laws.Propagation.CancelCatch ctx occurrence boundary) :
    CancelBoundary ctx.program boundary.id (.flows boundary.outgoing) := by
  obtain ⟨element, -, envelope, held⟩ := caught
  obtain ⟨found, inside, catching⟩ := held
  obtain ⟨host, located, enveloped⟩ := Option.bind_eq_some_iff.mp found
  have declared := Laws.IL.element?_mem located
  rw [queries.1] at catching
  have cancel := registered.cancelCatches _ catching
  obtain ⟨interrupting, transaction⟩ := catchers.2 host declared envelope enveloped boundary inside cancel
  exact ⟨host, declared, transaction, envelope, enveloped, boundary, inside, rfl, cancel, interrupting, rfl⟩

/-- Cancel propagation holds of every hooks record that registers a raise (`RaiseRegistered`). -/
theorem cancelCompensatesFirst_of {hooks : Hooks} {propagation : Feature.Propagation.PropagationHooks}
    (registered : RaiseRegistered hooks propagation) : CancelCompensatesFirst hooks := by
  refine ⟨fun ctx header payload occurrence state after ran => ?_, fun ctx origin state after queries catchers hostless
    ran => ?_⟩
  · rw [registered.arriveThrow, Laws.Propagation.arriveThrow_cancel] at ran
    cases ran
    refine ⟨by simp only [Laws.State.signal_eq, Laws.State.allQueuedTokens], Feature.Propagation.throwLeave payload,
      { element := header.id, scope := occurrence.scope, activation := occurrence.activation, thrower := occurrence.id }, ?_,
      rfl, rfl, rfl, rfl⟩
    simp only [Queues, Laws.State.signal_eq, Laws.State.allSignals_append, List.append_assoc]
  · rw [registered.raise] at ran
    obtain ⟨passed, steady, kept, taken⟩ := raise_cancel
      (motive := fun s => Laws.State.allQueuedTokens s = Laws.State.allQueuedTokens state ∧ Laws.State.allSignals s = Laws.State.allSignals state) raiseFacts
      (fun root s next pass => have frame := registered.callOutputs ctx root s next pass
        ⟨frame.1, fun held => ⟨frame.2.1.trans held.1, frame.2.2.1.trans held.2⟩⟩)
      (noCancelStart_of registered queries catchers) ⟨rfl, rfl⟩ hostless ran
    obtain ⟨occurrence, -, parent, rest⟩ := taken
    obtain ⟨boundary, -, caught, rest⟩ := rest
    obtain ⟨rolledBack, terminating, -, rest⟩ := rest
    obtain ⟨terminated, made⟩ := rest
    subst made
    have frame : Laws.State.allQueuedTokens terminating = Laws.State.allQueuedTokens passed ∧ Laws.State.allSignals terminating = Laws.State.allSignals passed := by
      rcases terminated with same | ⟨_, _, disarmed⟩
      · exact same ▸ ⟨rfl, rfl⟩
      · rw [disarmed, Laws.State.disarm_eq]
        exact ⟨rfl, rfl⟩
    refine ⟨fun token member => ?_, rolledBack, occurrence.occurrence, boundary.id, parent, .flows boundary.outgoing, ?_,
      cancelBoundary_of registered queries catchers caught⟩
    · rw [Laws.State.signal_eq] at member
      have cleared := (Laws.State.allQueuedTokens_clearInside terminating rolledBack _).subset member
      rwa [frame.1, kept.1] at cleared
    · simp only [Queues, Laws.State.signal_eq, Laws.State.allSignals_append, Laws.State.allSignals_clearInside, frame.2,
        kept.2, steady.instances]

/-- Failure holds of every hooks record that registers a raise (`RaiseRegistered`). -/
theorem handlerFailure_of {hooks : Hooks} {propagation : Feature.Propagation.PropagationHooks}
    (registered : RaiseRegistered hooks propagation) : HandlerFailure hooks := by
  refine ⟨fun ctx handler code message origin state after ran => ?_, fun ctx raised origin state selected => ?_,
    fun ctx raised origin state after queries _ ran => ?_, fun _ _ _ fails _ _ _ _ _ _ _ found role =>
      Laws.Propagation.searchScopes_stops found role (by rw [fails]; nofun)⟩
  · rw [registered.failCompensation] at ran
    obtain ⟨owner, _, _, rest⟩ := Laws.Compensation.failCompensation_spec ran
    obtain ⟨_, first, -, rest⟩ := rest
    obtain ⟨-, -, made⟩ := rest
    subst made
    rw [Laws.State.signal_eq]
    exact ⟨_, owner, Laws.State.allSignals_append _ _, rfl, rfl, first.mem, first.1, by simp, _,
      List.mem_cons_of_mem _ (List.mem_singleton.mpr rfl)⟩
  · refine ⟨fun _ _ _ _ _ _ _ _ found role read unhandled =>
      Laws.Propagation.searchScopes_context found role (Laws.Propagation.propagatesFromHandler_selected selected) read
        unhandled, fun after ran => ?_⟩
    rw [registered.raise] at ran
    obtain ⟨new, made, queued⟩ := raise_queues (motive := fun _ => True) raiseFacts
      notHandlerFailure_steps (notHandlerFailure_hooks registered ctx)
      (fun root s next pass => ⟨(registered.callOutputs ctx root s next pass).1, fun _ => trivial⟩) trivial ran
    refine ⟨new, made, fun handler code message raisedFrom member => ?_⟩
    rcases queued _ member with quiet | ⟨stopping, -⟩
    · exact quiet handler code message raisedFrom rfl
    · rw [Laws.Propagation.propagatesFromHandler_selected selected] at stopping
      cases stopping
  · rw [registered.raise] at ran
    obtain ⟨new, made, queued⟩ := raise_queues (motive := fun s => s.slots = state.slots) raiseFacts
      notHandlerFailure_steps (notHandlerFailure_hooks registered ctx)
      (fun root s next pass => have frame := registered.callOutputs ctx root s next pass
        ⟨frame.1, fun held => frame.2.2.2.trans held⟩) rfl ran
    refine ⟨new, made, fun handler code message raisedFrom member => ?_⟩
    rcases queued _ member with quiet | ⟨-, stoppedAt⟩
    · exact (quiet handler code message raisedFrom rfl).elim
    · obtain ⟨named, ⟨code', message', same⟩, stopped, rest⟩ := stoppedAt
      obtain ⟨slots, role⟩ := rest
      obtain rfl := Laws.Step.compensationFailed_handler same
      rw [queries.2.2, Laws.Step.scopeRole_handler] at role ⊢
      rwa [slots] at role

end Kernel.Proofs.Compensation
