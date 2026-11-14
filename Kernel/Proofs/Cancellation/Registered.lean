module

public import Kernel.Proofs.Cancellation
public import Kernel.Proofs.Step
public import Kernel.Laws.Registry

/-! # Proofs: cancellation over the registered hooks

The registered hooks keep a property carried beside `Laws.State.WellFormed` when the state operations they apply keep
it (`Alongside`): each feature's operations record of `WellFormed` and the property follows from its record of
`WellFormed` (`Kernel.Proofs.Step`) and `Alongside`, and the registered hooks' contract follows from the feature
records (`Proofs.Step.registered_contract`). The cancellation lane instantiates it at the before-state's scope
occurrences (`KeepsScopes`), which closes `SubtreeRemoved Registry.hooks` up to the `raise` hook, whose feature lemma
the state-invariant lane has not stated yet (`PendingHooks`), and one `Laws.State` request (`PendingRemoval`), and at
an input's end facts from its start (`Laws.Step.EndsKept`), which closes `RemovedEndOnce Registry.hooks` up to the same
hook, the `Laws.State` facts of the operations' bodies (`Laws.Step.PendingStateEnds`) and the walk with the completion
pipeline as a premise (`PendingWalk`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Cancellation

open Kernel
open Kernel.Laws.State (WellFormed)
open Kernel.Laws.Step (Operations)

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

/-- Closing an item moves nothing `rel` reads. -/
theorem Alongside.closeItem (side : Alongside rel) {s : State} (kept : rel s) (id : Nat) : rel (s.closeItem id) := by
  rw [Laws.State.closeItem_eq]
  exact side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ kept

/-- Withdrawing the items inside a scope occurrence moves nothing `rel` reads. -/
theorem Alongside.withdrawInside (side : Alongside rel) {s : State} (kept : rel s) (scope : ScopeOccurrenceId) :
    rel (s.withdrawInside scope) := by
  rw [Laws.State.withdrawInside_eq]
  exact side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ kept

/-- Withdrawing an occurrence's items closes its own, disarms it and withdraws the items inside the scope occurrences
it owns, which only the disarming may move anything `rel` reads of. -/
theorem Alongside.withdrawOccurrence (side : Alongside rel) {program : Program} {s : State} (formed : WellFormed program s)
    (kept : rel s) (id : Nat) : rel (s.withdrawOccurrence id) := by
  obtain ⟨items, frame⟩ := Laws.State.withdrawAll_frame
    (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) ((s.closeOwnItems id).disarm id)
  rw [Laws.State.withdrawOccurrence_eq, frame]
  refine side.frame ((s.closeOwnItems id).disarm id) _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩
    (side.disarm program _ id (Laws.State.closeOwnItems_wellFormed formed id) ?_)
  rw [Laws.State.closeOwnItems_eq]
  exact side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ kept

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
  complete s item leave writes rule holds open_ unstarted :=
    ⟨ops.complete s item leave writes rule holds.1 open_ unstarted, side.signal holds.2 _⟩
  completeOwner s scope occurrence leave writes rule holds member owned link :=
    ⟨ops.completeOwner s scope occurrence leave writes rule holds.1 member owned link, side.signal holds.2 _⟩
  raise s event origin holds := ⟨ops.raise s event origin holds.1, side.signal holds.2 _⟩
  cancel s holds := ⟨ops.cancel s holds.1, side.signal holds.2 _⟩
  rekind s change holds kept keep :=
    ⟨ops.rekind s change holds.1 kept keep, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  workKind s item holds member waits := ops.workKind s item holds.1 member waits
  activity := ops.activity
  distinct s holds := ops.distinct s holds.1
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
  rekind s change holds kept waits :=
    ⟨ops.rekind s change holds.1 kept waits, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  awaits := ops.awaits
  disarm s host holds := ⟨ops.disarm s host holds.1, side.disarm program s host holds.1 holds.2⟩
  openItem s kind occurrence holds member begun unstarted :=
    ⟨ops.openItem s kind occurrence holds.1 member begun unstarted, side.openItem holds.2 kind occurrence⟩
  openSubscription s kind element scope host passive holds stands hangs waits :=
    ⟨ops.openSubscription s kind element scope host passive holds.1 stands hangs waits,
      side.openSubscription holds.1 holds.2 kind element scope host passive⟩
  subscribed s kind element scope host passive holds := ops.subscribed s kind element scope host passive holds.1
  closeComplete s item leave writes holds member :=
    ⟨ops.closeComplete s item leave writes holds.1 member, side.signal (side.closeItem holds.2 item.id) _⟩
  gatewayComplete s item gateway leave writes holds member attached :=
    ⟨ops.gatewayComplete s item gateway leave writes holds.1 member attached, side.signal (side.signal
      (side.disarm program _ gateway (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id)) _) _⟩
  interruptComplete s item host leave writes holds member :=
    ⟨ops.interruptComplete s item host leave writes holds.1 member, side.signal (side.signal
      (side.withdrawOccurrence (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id) host) _) _⟩
  reopenComplete s item detail leave writes holds member :=
    ⟨ops.reopenComplete s item detail leave writes holds.1 member, side.signal (side.openSubscription
      (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id) _ _ _ _ _) _⟩
  occur s item element leave writes holds member := ⟨ops.occur s item element leave writes holds.1 member, side.signal holds.2 _⟩
  insideBegin s item element locals holds member start :=
    ⟨ops.insideBegin s item element locals holds.1 member start,
      side.signal (side.withdrawInside (side.closeItem holds.2 item.id) item.scope) _⟩
  closeBegin s item element locals holds member start :=
    ⟨ops.closeBegin s item element locals holds.1 member start, side.signal (side.closeItem holds.2 item.id) _⟩
  reopenBegin s item detail element locals holds member start :=
    ⟨ops.reopenBegin s item detail element locals holds.1 member start, side.signal (side.openSubscription
      (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id) _ _ _ _ _) _⟩
  bareBegin s item element locals holds member :=
    ⟨ops.bareBegin s item element locals holds.1 member, side.signal holds.2 _⟩

theorem compensationOps_alongside (side : Alongside rel) {program : Program}
    (ops : Laws.Compensation.CompensationOps (WellFormed program)) :
    Laws.Compensation.CompensationOps fun s => WellFormed program s ∧ rel s where
  store s compensation holds runs :=
    ⟨ops.store s compensation holds.1 runs, side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ holds.2⟩
  issue s holds := ⟨ops.issue s holds.1, side.issue s holds.2⟩
  issued := ops.issued
  fail s failure holds := ⟨ops.fail s failure holds.1, side.signal holds.2 _⟩

end Alongside

/-! ## The registered hooks' feature records beside `WellFormed` -/

/-- The feature records of `WellFormed` and a property beside it, from those of `WellFormed`
(`Proofs.Step.registered_contract` turns them into the registered hooks' contract). -/
theorem registeredOps_alongside {rel : State → Prop} (ops : Proofs.Step.RegisteredOps WellFormed) (side : Alongside rel) :
    Proofs.Step.RegisteredOps fun program s => WellFormed program s ∧ rel s where
  operations := operations_alongside side ops.operations
  work _ := workOps_alongside side (ops.work _)
  flow _ := flowOps_alongside side (ops.flow _)
  join _ := joinOps_alongside side (ops.join _)
  multiInstance _ := multiInstanceOps_alongside side (ops.multiInstance _)
  starts _ := startsOps_alongside side (ops.starts _)
  scopes _ := scopesOps_alongside side (ops.scopes _)
  subscriptions _ := subscriptionsOps_alongside side (ops.subscriptions _)
  compensation _ := compensationOps_alongside side (ops.compensation _)
  propagation _ := propagationOps_alongside side (ops.propagation _)
  runs _ := runsOps_alongside side (ops.runs _)

/-- The field of `Laws.Step.HookContract Registry.hooks inv` whose feature lemma the state-invariant lane has not
stated yet: pending until it lands, then it comes from its feature's record as the others do. -/
structure PendingHooks (inv : Program → State → Prop) : Prop where
  raise : ∀ ctx event origin state after, inv ctx.program state →
    Registry.hooks.raise ctx event origin state = .ok after → inv ctx.program after

/-! ## Subtree removal of the registered hooks -/

/-- The registered hooks keep the scope occurrences of any before-state beside `WellFormed`. -/
theorem keepsScopes_contract (removal : PendingRemoval) (pending : ∀ before, PendingHooks (KeepsScopes before))
    (before : State) : Laws.Step.HookContract Registry.hooks (KeepsScopes before) :=
  Proofs.Step.registered_contract (registeredOps_alongside Proofs.Step.registeredOps_wellFormed
    (scopesKept_alongside removal before)) Proofs.State.stateFacts (pending before).raise

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
  Proofs.Step.registered_contract (registeredOps_alongside Proofs.Step.registeredOps_wellFormed
    (endsKept_alongside ends b x)) Proofs.State.stateFacts (pending b x).raise

/-! ## The draft the registered hooks leave -/

section Draft

private theorem signal_draft (s : State) (signal : Signal) : (s.signal signal).draft = s.draft := by
  rw [Laws.State.signal_eq]

private theorem closeItem_draft (s : State) (id : Nat) : (s.closeItem id).draft = s.draft := by
  rw [Laws.State.closeItem_eq]

private theorem disarm_draft (s : State) (host : Nat) : (s.disarm host).draft = s.draft := by
  rw [Laws.State.disarm_eq]

private theorem withdrawInside_draft (s : State) (scope : ScopeOccurrenceId) : (s.withdrawInside scope).draft = s.draft := by
  rw [Laws.State.withdrawInside_eq]

private theorem withdrawOccurrence_draft (s : State) (id : Nat) : (s.withdrawOccurrence id).draft = s.draft := by
  obtain ⟨items, frame⟩ := Laws.State.withdrawAll_frame
    (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) ((s.closeOwnItems id).disarm id)
  rw [Laws.State.withdrawOccurrence_eq, frame, Laws.State.disarm_eq, Laws.State.closeOwnItems_eq]

/-- Opening a subscription keeps the draft's end facts: its reservation journals nothing (`Laws.Step.PendingStateEnds`). -/
private theorem openSubscription_ended (ends : Laws.Step.PendingStateEnds) (s : State) (kind : OpenKind)
    (element : ElementId) (scope : ScopeOccurrenceId) (host : Option Nat) (passive : Bool) :
    (s.openSubscription kind element scope host passive).1.draft.ended = s.draft.ended := by
  rw [Laws.State.openSubscription_eq]
  exact congrArg (·.ended) ((ends.ends_unmoved s).2.2.1 element scope).2.1

/-- Subscriptions' operations keep the draft's end facts: they queue firings and completions, open, close, withdraw
and rekind items and disarm hosts, and a subscription reserves its occurrence, which journals nothing. -/
theorem subscriptionsOps_draft (ends : Laws.Step.PendingStateEnds) (program : Program)
    (ended : List (OccurrenceKey × Terminal)) :
    Laws.Subscriptions.SubscriptionsOps program fun s => s.draft.ended = ended where
  fire s _ _ same := by rw [signal_draft]; exact same
  rekind _ _ same _ _ := same
  awaits := Laws.State.triggers_await
  disarm s host same := by rw [disarm_draft]; exact same
  openItem s kind occurrence same _ _ _ := by
    rw [Laws.State.openItem_eq]
    exact same
  openSubscription s kind element scope host passive same _ _ _ :=
    (openSubscription_ended ends s kind element scope host passive).trans same
  subscribed s kind element scope host passive _ := by
    obtain ⟨_, _, scopes, occurrences⟩ := (ends.ends_unmoved s).2.2.1 element scope
    rw [Laws.State.openSubscription_eq]
    exact ⟨scopes, fun o inside => occurrences ▸ List.mem_append_left _ inside⟩
  closeComplete s _ _ _ same _ := by rw [signal_draft, closeItem_draft]; exact same
  gatewayComplete s _ _ _ _ same _ _ := by rw [signal_draft, signal_draft, disarm_draft, closeItem_draft]; exact same
  interruptComplete s _ _ _ _ same _ := by
    rw [signal_draft, signal_draft, withdrawOccurrence_draft, closeItem_draft]
    exact same
  reopenComplete s _ _ _ _ same _ := by rw [signal_draft, openSubscription_ended ends, closeItem_draft]; exact same
  occur s _ _ _ _ same _ := by rw [signal_draft]; exact same
  insideBegin s _ _ _ same _ _ := by rw [signal_draft, withdrawInside_draft, closeItem_draft]; exact same
  closeBegin s _ _ _ same _ _ := by rw [signal_draft, closeItem_draft]; exact same
  reopenBegin s _ _ _ _ same _ _ := by rw [signal_draft, openSubscription_ended ends, closeItem_draft]; exact same
  bareBegin s _ _ _ same _ := by rw [signal_draft]; exact same

end Draft

/-- The registered hooks journal no end when told of a cancellation, which no feature hears, or of variable writes,
which Subscriptions offers to Conditional items by queueing the firings they decide (`Laws.Subscriptions`), so each
micro-step leaves the draft without end facts (`Laws.Step.microStep_drafts`). -/
theorem registered_quiet (ends : Laws.Step.PendingStateEnds) :
    (∀ ctx occurrence state after, state.draft.ended = [] → Registry.hooks.cancelled ctx occurrence state = .ok after →
      after.draft.ended = []) ∧
    ∀ ctx writes state after, state.draft.ended = [] → Registry.hooks.written ctx writes state = .ok after →
      after.draft.ended = [] :=
  ⟨fun _ _ _ _ empty ran => by
    rw [Laws.Registry.hooks_cancelled] at ran
    cases ran
    exact empty, fun ctx _ _ _ empty ran => by
    rw [Laws.Registry.hooks_written] at ran
    exact Laws.Subscriptions.offerWrites_keeps (subscriptionsOps_draft ends ctx.program []) empty ran⟩

/-- `MicroStepsKeepEnds` of the registered hooks, up to the pending requests: the `Laws.State` facts of the operations'
bodies (`Laws.Step.PendingStateEnds`, R15), the walk with the completion pipeline as a premise (`PendingWalk`, R14) and
the `raise` hook the state-invariant lane has not proved (`PendingHooks`); `removedEndOnce` then gives `RemovedEndOnce`. -/
theorem microStepsKeepEnds_registered (ends : Laws.Step.PendingStateEnds) (walk : PendingWalk)
    (pending : ∀ b x, PendingHooks (Laws.Step.EndsInv b x)) : MicroStepsKeepEnds Registry.hooks := by
  have kept := fun b => walk.walk Registry.hooks (Laws.Step.EndsKept b none) (endsInv_contract ends pending b none)
    Proofs.Step.phases (endsKept_stepAlongside ends b) Proofs.State.stateFacts
    (Laws.Step.complete_ends (endsInv_contract ends pending b) Proofs.Step.phases Proofs.State.stateFacts ends)
  obtain ⟨cancelled, written⟩ := registered_quiet ends
  refine ⟨fun ctx cause transition b state after runs holds ran =>
    ⟨(kept b).1 ctx cause transition state after runs holds ran, Laws.Step.microStep_drafts cancelled written ran⟩,
    fun ctx b state after holds step => ⟨(kept b).2 ctx state after holds step, ?_⟩⟩
  obtain ⟨_, _, _, ⟨_, _, ran⟩⟩ := step.microStep
  exact Laws.Step.microStep_drafts cancelled written ran

/-- `RemovedEndOnce` of the registered hooks, up to the pending requests `microStepsKeepEnds_registered` names. -/
theorem removedEndOnce_registered (ends : Laws.Step.PendingStateEnds) (walk : PendingWalk)
    (pending : ∀ b x, PendingHooks (Laws.Step.EndsInv b x)) : RemovedEndOnce Registry.hooks :=
  removedEndOnce (microStepsKeepEnds_registered ends walk pending)

end Kernel.Proofs.Cancellation
