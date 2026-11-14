module

public import Kernel.Proofs.Cancellation
public import Kernel.Proofs.Step
public import Kernel.Laws.Registry

/-! # Proofs: cancellation over the registered hooks

The registered hooks keep a property carried beside `Laws.State.WellFormed` when the state operations they apply keep
it (`Alongside`): each feature's operations record of `WellFormed` and the property follows from its record of
`WellFormed` (`Kernel.Proofs.Step`) and `Alongside`, and the registered hooks' contract follows from the feature
records, one field per hook, through each feature's lemma, which is generic in the invariant (`registered_contract`).
The cancellation lane instantiates it at the before-state's scope occurrences (`KeepsScopes`), which closes
`SubtreeRemoved Registry.hooks` up to the hooks whose feature lemmas the state-invariant lane has not stated yet
(`PendingHooks`) and one `Laws.State` request (`PendingRemoval`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Cancellation

open Kernel
open Kernel.Laws.State (WellFormed)
open Kernel.Laws.Step (Operations StateFacts ScopeStands OccurrenceStands PipelineFrame)

/-! ## Each feature's operations record beside `WellFormed` -/

section Alongside

variable {rel : State → Prop}

/-- Holding an occurrence moves nothing `rel` reads. -/
theorem Alongside.hold (side : Alongside rel) {s : State} (kept : rel s) (held : Held) : rel (s.hold held) := by
  rw [Laws.Hooks.hold_eq]
  exact side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ kept

/-- An open item is an issue and an added item. -/
theorem Alongside.openItem (side : Alongside rel) {s : State} (kept : rel s) (kind : OpenKind) (occurrence : Occurrence) :
    rel (s.openItem kind occurrence) := by
  refine side.frame s.issue.1 _ ?_ (side.issue s kept)
  rw [Laws.State.openItem_eq, Laws.State.issue_eq]
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- A subscription is a reservation, an issue and an added item. -/
theorem Alongside.openSubscription (side : Alongside rel) {program : Program} {s : State} (formed : WellFormed program s)
    (kept : rel s) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId) (host : Option Nat)
    (passive : Bool) : rel (s.openSubscription kind element scope host passive).1 := by
  refine side.frame (s.reserve element scope).1.issue.1 _ ?_
    (side.issue _ (side.reserve program s element scope formed kept))
  rw [Laws.State.openSubscription_eq, Laws.State.issue_eq]
  exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

theorem operations_alongside (side : Alongside rel) (ops : Operations WellFormed) :
    Operations fun program s => WellFormed program s ∧ rel s where
  variablesHoused program s holds := ops.variablesHoused program s holds.1
  rootStands program s holds := ops.rootStands program s holds.1
  setVariable program s target name value holds stands :=
    ⟨ops.setVariable program s target name value holds.1 stands, side.setVariable program s target name value holds.1 holds.2⟩
  removeVariable program s target name holds :=
    ⟨ops.removeVariable program s target name holds.1, side.removeVariable program s target name holds.1 holds.2⟩

theorem workOps_alongside (side : Alongside rel) {program : Program} (ops : Laws.Work.WorkOps program (WellFormed program)) :
    Laws.Work.WorkOps program fun s => WellFormed program s ∧ rel s where
  write s scope writes rule holds := ⟨ops.write s scope writes rule holds.1, side.signal holds.2 _⟩
  complete s item leave writes rule holds open_ := ⟨ops.complete s item leave writes rule holds.1 open_, side.signal holds.2 _⟩
  completeOwner s scope occurrence leave writes rule holds member owned link :=
    ⟨ops.completeOwner s scope occurrence leave writes rule holds.1 member owned link, side.signal holds.2 _⟩
  raise s event origin holds := ⟨ops.raise s event origin holds.1, side.signal holds.2 _⟩
  cancel s holds := ⟨ops.cancel s holds.1, side.signal holds.2 _⟩
  rekind s change holds kept :=
    ⟨ops.rekind s change holds.1 kept, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  queued := ops.queued
  kept := ops.kept
  completeBegun s occurrence leave writes rule holds member begun :=
    ⟨ops.completeBegun s occurrence leave writes rule holds.1 member begun, side.signal holds.2 _⟩
  housed s occurrence holds member := ops.housed s occurrence holds.1 member
  hold s held holds := ⟨ops.hold s held holds.1, side.hold holds.2 held⟩
  enter s element locals occurrence holds member begun :=
    have entered := ops.enter s element locals occurrence holds.1 member begun
    ⟨⟨entered.1, side.enterScope program s _ _ _ _ holds.1 holds.2⟩, entered.2⟩
  openItem s kind occurrence holds member begun unstarted :=
    have opened := ops.openItem s kind occurrence holds.1 member begun unstarted
    ⟨⟨opened.1, side.openItem holds.2 kind occurrence⟩, opened.2⟩
  arm s occurrence element holds member begun := ⟨ops.arm s occurrence element holds.1 member begun, side.signal holds.2 _⟩
  enterCalled s called call variables definition holds member begun :=
    have entered := ops.enterCalled s called call variables definition holds.1 member begun
    ⟨⟨entered.1, side.enterCalled program s called call variables definition holds.1 holds.2⟩, entered.2⟩
  armScope s scope holds stands := ⟨ops.armScope s scope holds.1 stands, side.signal holds.2 _⟩
  begin s element scope holds stands := ⟨ops.begin s element scope holds.1 stands, side.signal holds.2 _⟩

theorem flowOps_alongside (side : Alongside rel) {program : Program} (ops : Laws.Flow.FlowOps (WellFormed program)) :
    Laws.Flow.FlowOps fun s => WellFormed program s ∧ rel s where
  emit s flows scope holds stands := ⟨ops.emit s flows scope holds.1 stands, by
    rw [Laws.State.emit_eq]
    exact side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  complete s occurrence leave writes rule holds member begun :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun, side.signal holds.2 _⟩

theorem joinOps_alongside (side : Alongside rel) {program : Program}
    (ops : Laws.Flow.JoinOps (WellFormed program) Laws.State.Settled) :
    Laws.Flow.JoinOps (fun s => WellFormed program s ∧ rel s) Laws.State.Settled where
  park s waiting holds waits := ⟨ops.park s waiting holds.1 waits, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  unpark s keep holds := ⟨ops.unpark s keep holds.1, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  parked s waiting holds member := ops.parked s waiting holds.1 member
  begun s occurrence holds member begun := ops.begun s occurrence holds.1 member begun
  reparked := ops.reparked
  complete s id leave writes rule holds settled := ⟨ops.complete s id leave writes rule holds.1 settled, side.signal holds.2 _⟩
  completed := ops.completed
  armGateway s occurrence gateway holds member begun :=
    ⟨ops.armGateway s occurrence gateway holds.1 member begun, side.signal holds.2 _⟩

theorem multiInstanceOps_alongside (side : Alongside rel) {program : Program}
    (ops : Laws.MultiInstance.MultiInstanceOps (WellFormed program) Laws.State.Settled) :
    Laws.MultiInstance.MultiInstanceOps (fun s => WellFormed program s ∧ rel s) Laws.State.Settled where
  bodies s run holds member := ops.bodies s run holds.1 member
  placed s run holds member := ops.placed s run holds.1 member
  complete s id leave writes rule holds settled := ⟨ops.complete s id leave writes rule holds.1 settled, side.signal holds.2 _⟩
  begun s occurrence holds member begun := ops.begun s occurrence holds.1 member begun
  housed s occurrence holds member := ops.housed s occurrence holds.1 member
  hold s held holds := ⟨ops.hold s held holds.1, side.hold holds.2 held⟩
  enter s element parent locals owner holds stands owned :=
    have entered := ops.enter s element parent locals owner holds.1 stands owned
    ⟨⟨entered.1, side.enterScope program s element parent locals owner holds.1 holds.2⟩, entered.2⟩
  arm s occurrence element holds member begun :=
    have armed := ops.arm s occurrence element holds.1 member begun
    ⟨⟨armed.1, side.signal holds.2 _⟩, armed.2⟩
  begin s request holds bare stands :=
    have begun := ops.begin s request holds.1 bare stands
    ⟨⟨begun.1, side.signal holds.2 _⟩, begun.2⟩
  defer s requests holds bare :=
    have deferred := ops.defer s requests holds.1 bare
    ⟨⟨deferred.1, by
      rw [Laws.State.deferBegins_eq]
      exact side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩, deferred.2⟩
  runs s runs holds kept :=
    have ran := ops.runs s runs holds.1 kept
    ⟨⟨ran.1, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩, ran.2⟩
  leave s run scope holds member active stands :=
    have left := ops.leave s run scope holds.1 member active stands
    ⟨⟨left.1, side.leaveScope program s scope holds.1 stands holds.2⟩, left.2⟩
  write s scope writes rule holds :=
    have written := ops.write s scope writes rule holds.1
    ⟨⟨written.1, side.signal holds.2 _⟩, written.2⟩

theorem startsOps_alongside (side : Alongside rel) {program : Program} (ops : Laws.Starts.StartsOps (WellFormed program)) :
    Laws.Starts.StartsOps fun s => WellFormed program s ∧ rel s where
  clock s atMs holds := ⟨ops.clock s atMs holds.1, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  complete s occurrence leave writes rule holds member begun :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun, side.signal holds.2 _⟩

theorem scopesOps_alongside (side : Alongside rel) {program : Program} (ops : Laws.Scopes.ScopesOps (WellFormed program)) :
    Laws.Scopes.ScopesOps fun s => WellFormed program s ∧ rel s where
  owner s scope occurrence holds member owned link := ops.owner s scope occurrence holds.1 member owned link
  complete s occurrence leave writes rule holds member begun :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun, side.signal holds.2 _⟩
  clear s occurrence inner holds member begun ready :=
    have cleared := ops.clear s occurrence inner holds.1 member begun ready
    have kept : ∀ o ∈ s.occurrences, o.id ∈ occurrence.id :: inner.toList →
        ¬ Laws.State.StrictlyWithin s o.scope occurrence.scope := fun o inside keeps strictly => by
      rcases List.mem_cons.mp keeps with same | reserved
      · exact strictly.2 (congrArg Occurrence.scope (Laws.State.nodup_map_eq holds.1.distinct.occurrences inside member same))
      · exact strictly.2 ((ready o.id reserved).2.2 o inside rfl)
    ⟨⟨cleared.1, side.clearInside program s _ _ holds.1 (holds.1.owned.occurrenceScopes occurrence member) kept holds.2⟩,
      cleared.2⟩
  enter s element locals occurrence inner holds member begun ready :=
    have entered := ops.enter s element locals occurrence inner holds.1 member begun ready
    ⟨⟨entered.1, side.enterScope program s _ _ _ _ holds.1 holds.2⟩, entered.2⟩
  arm s occurrence element holds member begun := ⟨ops.arm s occurrence element holds.1 member begun, side.signal holds.2 _⟩
  armScope s scope holds stands := ⟨ops.armScope s scope holds.1 stands, side.signal holds.2 _⟩
  begin s request holds stands inner nodup admitted :=
    ⟨ops.begin s request holds.1 stands inner nodup admitted, side.signal holds.2 _⟩
  armed := ops.armed
  scopeArmed := ops.scopeArmed
  signalScopes := ops.signalScopes

theorem propagationOps_alongside (side : Alongside rel) {program : Program}
    (ops : Laws.Propagation.PropagationOps program (WellFormed program)) :
    Laws.Propagation.PropagationOps program fun s => WellFormed program s ∧ rel s where
  complete s occurrence leave writes rule holds member begun :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun, side.signal holds.2 _⟩
  raise s raised origin holds := ⟨ops.raise s raised origin holds.1, side.signal holds.2 _⟩
  fire s item fired holds := ⟨ops.fire s item fired holds.1, side.signal holds.2 _⟩
  outbox s outbox holds := ⟨ops.outbox s outbox holds.1, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  compensate s occurrence scope activity trigger leave holds member begun :=
    ⟨ops.compensate s occurrence scope activity trigger leave holds.1 member begun, side.signal holds.2 _⟩
  terminate s occurrence holds member begun :=
    have cleared := ops.terminate s occurrence holds.1 member begun
    ⟨⟨cleared.1, side.clearInside program s _ _ holds.1 (holds.1.owned.occurrenceScopes occurrence member)
      (fun _ inside keeps strictly => strictly.2 (congrArg Occurrence.scope (Laws.State.nodup_map_eq
        holds.1.distinct.occurrences inside member (List.mem_singleton.mp keeps)))) holds.2⟩, cleared.2⟩
  openItem s kind occurrence holds member begun unstarted :=
    ⟨ops.openItem s kind occurrence holds.1 member begun unstarted, side.openItem holds.2 kind occurrence⟩
  signalOccurrences := ops.signalOccurrences

theorem runsOps_alongside (side : Alongside rel) {program : Program}
    (ops : Laws.Compensation.RunsOps (WellFormed program) Laws.State.Settled) :
    Laws.Compensation.RunsOps (fun s => WellFormed program s ∧ rel s) Laws.State.Settled where
  fits s run holds member := ops.fits s run holds.1 member
  issued s holds := ops.issued s holds.1
  store s compensation holds kept :=
    have stored := ops.store s compensation holds.1 kept
    ⟨⟨stored.1, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩, stored.2⟩
  enter s element parent locals holds stands :=
    have entered := ops.enter s element parent locals holds.1 stands
    ⟨⟨entered.1, side.enterScope program s element parent locals none holds.1 holds.2⟩, entered.2⟩
  entered := ops.entered
  signalled := ops.signalled
  cancel s id holds := have queued := ops.cancel s id holds.1; ⟨⟨queued.1, side.signal holds.2 _⟩, queued.2⟩
  complete s id leave writes rule holds settled :=
    have queued := ops.complete s id leave writes rule holds.1 settled
    ⟨⟨queued.1, side.signal holds.2 _⟩, queued.2⟩
  occur s element scope leave writes rule holds :=
    have queued := ops.occur s element scope leave writes rule holds.1
    ⟨⟨queued.1, side.signal holds.2 _⟩, queued.2⟩
  begin s handler context scope holds stands :=
    have queued := ops.begin s handler context scope holds.1 stands
    ⟨⟨queued.1, side.signal holds.2 _⟩, queued.2⟩
  leave s entry parent holds member link :=
    have left := ops.leave s entry parent holds.1 member link
    ⟨⟨left.1, side.leaveScope program s entry.id holds.1 (List.mem_map.mpr ⟨entry, member, rfl⟩) holds.2⟩, left.2⟩

theorem subscriptionsOps_alongside (side : Alongside rel) {program : Program}
    (ops : Laws.Subscriptions.SubscriptionsOps program (WellFormed program)) :
    Laws.Subscriptions.SubscriptionsOps program fun s => WellFormed program s ∧ rel s where
  fire s item fired holds := ⟨ops.fire s item fired holds.1, side.signal holds.2 _⟩
  rekind s change holds kept :=
    ⟨ops.rekind s change holds.1 kept, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  disarm s host holds := ⟨ops.disarm s host holds.1, side.disarm program s host holds.1 holds.2⟩
  openItem s kind occurrence holds member begun unstarted :=
    ⟨ops.openItem s kind occurrence holds.1 member begun unstarted, side.openItem holds.2 kind occurrence⟩
  openSubscription s kind element scope host passive holds stands hangs :=
    ⟨ops.openSubscription s kind element scope host passive holds.1 stands hangs,
      side.openSubscription holds.1 holds.2 kind element scope host passive⟩
  subscribed s kind element scope host passive holds := ops.subscribed s kind element scope host passive holds.1

theorem compensationOps_alongside (side : Alongside rel) {program : Program}
    (ops : Laws.Compensation.CompensationOps (WellFormed program)) :
    Laws.Compensation.CompensationOps fun s => WellFormed program s ∧ rel s where
  store s compensation holds runs :=
    ⟨ops.store s compensation holds.1 runs, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  issue s holds := ⟨ops.issue s holds.1, side.issue s holds.2⟩
  issued := ops.issued
  fail s failure holds := ⟨ops.fail s failure holds.1, side.signal holds.2 _⟩

end Alongside

/-! ## The registered hooks' contract from the feature records -/

/-- The operations records of every feature the registered hooks run, of one invariant. -/
structure RegisteredOps (inv : Program → State → Prop) : Prop where
  operations : Operations inv
  work : ∀ program, Laws.Work.WorkOps program (inv program)
  flow : ∀ program, Laws.Flow.FlowOps (inv program)
  join : ∀ program, Laws.Flow.JoinOps (inv program) Laws.State.Settled
  multiInstance : ∀ program, Laws.MultiInstance.MultiInstanceOps (inv program) Laws.State.Settled
  starts : ∀ program, Laws.Starts.StartsOps (inv program)
  scopes : ∀ program, Laws.Scopes.ScopesOps (inv program)
  subscriptions : ∀ program, Laws.Subscriptions.SubscriptionsOps program (inv program)
  compensation : ∀ program, Laws.Compensation.CompensationOps (inv program)
  propagation : ∀ program, Laws.Propagation.PropagationOps program (inv program)
  runs : ∀ program, Laws.Compensation.RunsOps (inv program) Laws.State.Settled

/-- The state-invariant lane's records (`Kernel.Proofs.Step`, `Kernel.Proofs.State`). -/
theorem registeredOps_wellFormed : RegisteredOps WellFormed :=
  ⟨Proofs.State.operations, fun _ => Proofs.Step.workOps, fun _ => Proofs.Step.flowOps, fun _ => Proofs.Step.joinOps,
    fun _ => Proofs.Step.multiInstanceOps, fun _ => Proofs.Step.startsOps, fun _ => Proofs.Step.scopesOps,
    fun _ => Proofs.Step.subscriptionsOps, fun _ => Proofs.Step.compensationOps, fun _ => Proofs.Step.propagationOps,
    fun _ => Proofs.Step.runsOps⟩

/-- The feature records of `WellFormed` and a property beside it. -/
theorem RegisteredOps.alongside {rel : State → Prop} (ops : RegisteredOps WellFormed) (side : Alongside rel) :
    RegisteredOps fun program s => WellFormed program s ∧ rel s :=
  ⟨operations_alongside side ops.operations, fun _ => workOps_alongside side (ops.work _),
    fun _ => flowOps_alongside side (ops.flow _), fun _ => joinOps_alongside side (ops.join _),
    fun _ => multiInstanceOps_alongside side (ops.multiInstance _), fun _ => startsOps_alongside side (ops.starts _),
    fun _ => scopesOps_alongside side (ops.scopes _), fun _ => subscriptionsOps_alongside side (ops.subscriptions _),
    fun _ => compensationOps_alongside side (ops.compensation _), fun _ => propagationOps_alongside side (ops.propagation _),
    fun _ => runsOps_alongside side (ops.runs _)⟩

/-- The fields of `Laws.Step.HookContract Registry.hooks inv` whose feature lemmas the state-invariant lane has not
stated yet: pending until they land, then each comes from its feature's record as the others do. -/
structure PendingHooks (inv : Program → State → Prop) : Prop where
  trigger : ∀ ctx item fired state after, inv ctx.program state → item ∈ state.openItems →
    Registry.hooks.trigger ctx item fired state = .ok after → inv ctx.program after
  raise : ∀ ctx event origin state after, inv ctx.program state →
    Registry.hooks.raise ctx event origin state = .ok after → inv ctx.program after

/-- The registered hooks keep any invariant every feature's record is filled for, one field per hook from its
feature's lemma, as `Kernel.Proofs.Step` proves each field of `WellFormed`. -/
theorem registered_contract {inv : Program → State → Prop} (ops : RegisteredOps inv) (facts : StateFacts)
    (pending : PendingHooks inv) : Laws.Step.HookContract Registry.hooks inv where
  arriveStart _ _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveStart] at ran
    exact Laws.Starts.arriveStart_keeps (ops.starts _) holds member begun ran
  arriveActivity _ _ _ _ _ _ holds member begun unstarted ran := by
    rw [Laws.Registry.hooks_arriveActivity] at ran
    exact Laws.Work.arriveActivity_keeps (ops.work _) holds member begun unstarted ran
  arriveMultiInstance _ _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveMultiInstance] at ran
    exact Laws.MultiInstance.arriveMultiInstance_keeps (ops.multiInstance _) holds member begun ran
  arriveScope _ _ _ _ _ _ _ holds member begun ready ran := by
    rw [Laws.Registry.hooks_arriveScope] at ran
    exact Laws.Scopes.arriveScope_keeps (ops.scopes _) holds member begun ready ran
  arriveGateway _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveGateway] at ran
    exact Laws.Flow.arriveGateway_keeps (ops.join _) holds member begun ran
  arriveCatch _ _ _ _ _ _ _ holds member begun unstarted ran := by
    rw [Laws.Registry.hooks_arriveCatch] at ran
    exact Laws.Subscriptions.arriveCatch_keeps (ops.subscriptions _) holds member begun unstarted ran
  arriveThrow _ _ _ _ _ _ _ holds member begun unstarted ran := by
    rw [Laws.Registry.hooks_arriveThrow] at ran
    exact Laws.Propagation.arriveThrow_keeps (ops.propagation _) holds member begun unstarted ran
  arriveLink _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveLink] at ran
    exact Laws.Flow.arriveLink_keeps (ops.flow _) holds member begun ran
  completeScope _ _ _ _ _ _ _ holds member owned link ran := by
    rw [Laws.Registry.hooks_completeScope] at ran
    exact Laws.Scopes.completeScope_keeps (ops.scopes _) holds member owned link ran
  completeCall _ _ _ _ _ _ _ holds member owned link ran := by
    rw [Laws.Registry.hooks_completeCall] at ran
    exact Laws.Work.completeCall_keeps (ops.work _) holds member owned link ran
  completeBody _ _ _ _ _ _ _ holds _ ran := by
    rw [Laws.Registry.hooks_completeBody] at ran
    exact Laws.MultiInstance.completeBody_keeps (ops.multiInstance _) holds ran
  completeUserTask _ _ _ _ _ _ _ holds member ran := by
    rw [Laws.Registry.hooks_completeUserTask] at ran
    exact Laws.Work.completeUserTask_keeps (ops.work _) holds member ran
  effectResult _ _ _ _ _ holds member ran := by
    rw [Laws.Registry.hooks_effectResult] at ran
    exact Laws.Work.effectResult_keeps (ops.work _) holds member ran
  retryIncident _ _ _ _ _ _ holds _ ran := by
    rw [Laws.Registry.hooks_retryIncident] at ran
    exact Laws.Work.retryIncident_keeps (ops.work _) holds ran
  cancelIncidentProcess _ _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_cancelIncidentProcess] at ran
    exact Laws.Work.cancelIncidentProcess_keeps (ops.work _) holds ran
  triggerActivity _ _ _ _ _ _ _ holds member ran := by
    rw [Laws.Registry.hooks_triggerActivity] at ran
    exact Laws.Work.triggerActivity_keeps (ops.work _) holds member ran
  trigger := pending.trigger
  arm _ _ _ _ _ _ holds stands placed hosted ran := by
    rw [Laws.Registry.hooks_arm] at ran
    exact Laws.Subscriptions.arm_keeps (ops.subscriptions _) holds (Proofs.Step.hosted_of stands placed hosted) ran
  armScope _ _ _ _ holds placed ran := by
    rw [Laws.Registry.hooks_armScope] at ran
    exact Laws.Subscriptions.armScope_keeps (ops.subscriptions _) holds placed ran
  armGateway _ _ _ _ _ _ holds stands placed hosted ran := by
    rw [Laws.Registry.hooks_armGateway] at ran
    exact Laws.Subscriptions.armGateway_keeps (ops.subscriptions _) holds (Proofs.Step.hosted_of stands placed hosted) ran
  raise := pending.raise
  compensate _ _ _ _ _ _ _ _ holds stands resumable ran := by
    rw [Laws.Registry.hooks_compensate] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.Compensation.compensate_keeps (ops.runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) resumable ran
  failCompensation _ _ _ _ _ _ _ holds _ ran := by
    rw [Laws.Registry.hooks_failCompensation] at ran
    exact Laws.Compensation.failCompensation_keeps (ops.compensation _) holds ran
  leave _ occurrence state _ holds _ ran := by
    rw [Laws.Registry.hooks_leave] at ran
    obtain ⟨kept, disarmed⟩ := Laws.Subscriptions.leave_keeps (ops.subscriptions _) holds ran
    subst disarmed
    exact ⟨kept, Proofs.Step.disarm_frame state occurrence.id⟩
  writeOutputs := Proofs.Step.registered_writeOutputs ops.operations facts
  removeVariables := Proofs.Step.registered_removeVariables ops.operations facts
  completed _ _ _ _ holds _ ran := by
    rw [Laws.Registry.hooks_completed] at ran
    obtain ⟨kept, scopes, occurrences, items⟩ := Laws.Compensation.completed_keeps (ops.compensation _) holds ran
    exact ⟨kept, Proofs.Step.retained_frame scopes occurrences items⟩
  outflow _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_outflow] at ran
    exact Laws.Flow.outflow_keeps (ops.flow _) holds stands ran
  instanceCompleted _ _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_instanceCompleted] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.MultiInstance.instanceCompleted_keeps (ops.multiInstance _) holds (List.mem_map.mpr ⟨entry, inside, named⟩)
      ran
  handlerCompleted _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_handlerCompleted] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.Compensation.handlerCompleted_keeps (ops.runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran
  handlerEnded _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_handlerEnded] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.Compensation.handlerEnded_keeps (ops.runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran
  cancelled _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_cancelled] at ran
    cases ran
    exact holds
  written _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_written] at ran
    exact Laws.Subscriptions.offerWrites_keeps (ops.subscriptions _) holds ran
  delivered := Proofs.Step.registered_delivered

/-! ## Subtree removal of the registered hooks -/

/-- The registered hooks keep the scope occurrences of any before-state beside `WellFormed`. -/
theorem keepsScopes_contract (removal : PendingRemoval) (pending : ∀ before, PendingHooks (KeepsScopes before))
    (before : State) : Laws.Step.HookContract Registry.hooks (KeepsScopes before) :=
  registered_contract (registeredOps_wellFormed.alongside (scopesKept_alongside removal before))
    Proofs.State.stateFacts (pending before)

/-- `SubtreeRemoved` of the registered hooks, up to the pending hook fields and `Laws.State` request. -/
theorem subtreeRemoved_registered (removal : PendingRemoval) (pending : ∀ before, PendingHooks (KeepsScopes before)) :
    SubtreeRemoved Registry.hooks :=
  subtreeRemoved_of_keeps (keepsScopes_contract removal pending) (keepsScopes_phases Proofs.Step.phases removal)
    Proofs.State.stateFacts

/-! ## End facts of the registered hooks -/

/-- The registered hooks keep an input's end facts from its start beside `WellFormed`, under any exemption
(`Laws.Step.EndsInv`), the hook contract `Laws.Step.complete_ends` and `MicroStepsKeepEnds` rest on. -/
theorem endsInv_contract (ends : Laws.Step.PendingStateEnds)
    (pending : ∀ b x, PendingHooks (Laws.Step.EndsInv b x)) (b : State) (x : Option (Nat × OccurrenceKey)) :
    Laws.Step.HookContract Registry.hooks (Laws.Step.EndsInv b x) :=
  registered_contract (registeredOps_wellFormed.alongside (endsKept_alongside ends b x)) Proofs.State.stateFacts
    (pending b x)

end Kernel.Proofs.Cancellation
