module

public import Kernel.Proofs.Cancellation
public import Kernel.Proofs.Step.Contract
public import Kernel.Proofs.State
public import Kernel.Laws.State.Fire
public import Kernel.Laws.Registry

/-! # Proofs: cancellation over the registered hooks

The registered hooks keep a property carried beside `Laws.State.WellFormed` when the state operations they apply keep
it (`Alongside`): each feature's operations record of `WellFormed` and the property follows from its record of
`WellFormed` and `Alongside`, and the registered hooks' contract follows from the feature records
(`Proofs.Step.registered_contract`). The cancellation lane instantiates it at the before-state's scope occurrences
(`KeepsScopes`), which gives `SubtreeRemoved Registry.hooks`, and at an input's end facts from its start
(`Laws.Step.EndsKept`), which gives `RemovedEndOnce Registry.hooks`. Both take the records and phases of `WellFormed`
as arguments, which `Kernel.Proofs.Step` fills, since that module imports this one. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Proofs.Cancellation

open Kernel
open Kernel.Laws.State (WellFormed)
open Kernel.Laws.Step (Operations)
open Kernel.Proofs.Frame

/-! ## Each feature's operations record beside `WellFormed` -/

section Alongside

variable {rel : State → Prop}

theorem operations_alongside {rel : Program → State → Prop} (side : ∀ program, FrameAlongside (rel program))
    (ops : Operations WellFormed) : Operations fun program s => WellFormed program s ∧ rel program s where
  variablesHoused program s holds := ops.variablesHoused program s holds.1
  rootStands program s holds := ops.rootStands program s holds.1
  setVariable program s target name value holds stands := ⟨ops.setVariable program s target name value holds.1 stands,
    (side program).setVariable program s target name value holds.1 holds.2⟩
  removeVariable program s target name holds :=
    ⟨ops.removeVariable program s target name holds.1, (side program).removeVariable program s target name holds.1 holds.2⟩

theorem workOps_alongside (side : FrameAlongside rel) {program : Program}
    (ops : Laws.Work.WorkOps program (WellFormed program)) :
    Laws.Work.WorkOps program fun s => WellFormed program s ∧ rel s where
  write s scope writes rule holds := ⟨ops.write s scope writes rule holds.1, side.signal holds.2 _⟩
  complete s item leave writes rule holds open_ unstarted :=
    ⟨ops.complete s item leave writes rule holds.1 open_ unstarted, side.signal holds.2 _⟩
  completeOwner s scope occurrence leave writes rule holds member owned link :=
    ⟨ops.completeOwner s scope occurrence leave writes rule holds.1 member owned link, side.signal holds.2 _⟩
  raise s item code message patch holds member effect :=
    ⟨ops.raise s item code message patch holds.1 member effect, side.signal holds.2 _
      ⟨rfl, rfl, by rw [Laws.Step.triggersOf_raise, Laws.State.isCancel_error]; rfl⟩⟩
  cancel s holds := ⟨ops.cancel s holds.1, side.signal holds.2 _⟩
  rekind s change holds kept keep :=
    ⟨ops.rekind s change holds.1 kept keep,
      side.frame s _ .same holds.2⟩
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
  openItem s kind occurrence holds member begun unstarted role :=
    have opened := ops.openItem s kind occurrence holds.1 member begun unstarted role
    ⟨⟨opened.1, side.openItem holds.2 kind occurrence⟩, opened.2⟩
  arm s occurrence element holds member begun := ⟨ops.arm s occurrence element holds.1 member begun, side.signal holds.2 _⟩
  enterCalled s called call variables definition holds member begun :=
    have entered := ops.enterCalled s called call variables definition holds.1 member begun
    ⟨⟨entered.1, side.enterCalled program s called call variables definition holds.1 holds.2⟩, entered.2⟩
  armScope s scope holds stands := ⟨ops.armScope s scope holds.1 stands, side.signal holds.2 _⟩
  begin s element scope holds stands :=
    ⟨ops.begin s element scope holds.1 stands, side.signalBegin _ _ (.fresh rfl rfl) holds.2⟩

theorem flowOps_alongside (side : FrameAlongside rel) {program : Program}
    (ops : Laws.Flow.FlowOps (WellFormed program)) :
    Laws.Flow.FlowOps fun s => WellFormed program s ∧ rel s where
  emit s flows scope holds stands := ⟨ops.emit s flows scope holds.1 stands, by
    rw [Laws.State.emit_eq]
    exact side.frame s _ (.same (deferred := by
      rw [Laws.Step.deferredOf_append, Laws.Step.deferredOf_flows, List.append_nil])) holds.2⟩
  complete s occurrence leave writes rule holds member begun :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun, side.signal holds.2 _⟩

theorem joinOps_alongside (side : FrameAlongside rel) {program : Program}
    (ops : Laws.Flow.JoinOps (WellFormed program) Laws.State.Settled) :
    Laws.Flow.JoinOps (fun s => WellFormed program s ∧ rel s) Laws.State.Settled where
  park s waiting holds waits :=
    ⟨ops.park s waiting holds.1 waits, side.frame s _ .same holds.2⟩
  unpark s keep holds :=
    ⟨ops.unpark s keep holds.1, side.frame s _ .same holds.2⟩
  parked s waiting holds member := ops.parked s waiting holds.1 member
  begun s occurrence holds member begun := ops.begun s occurrence holds.1 member begun
  reparked := ops.reparked
  complete s id leave writes rule holds settled := ⟨ops.complete s id leave writes rule holds.1 settled, side.signal holds.2 _⟩
  completed := ops.completed
  armGateway s occurrence gateway holds member begun :=
    ⟨ops.armGateway s occurrence gateway holds.1 member begun, side.signal holds.2 _⟩

/-- Multi-Instance's record beside `WellFormed`, through `Alongside`'s instance leave and run replacement. -/
theorem multiInstanceOps_alongside (side : Alongside rel) {program : Program}
    (ops : Laws.MultiInstance.MultiInstanceOps program (WellFormed program) Laws.State.Settled) :
    Laws.MultiInstance.MultiInstanceOps program (fun s => WellFormed program s ∧ rel s) Laws.State.Settled where
  issued s holds := ops.issued s holds.1
  contexts s holds := ops.contexts s holds.1
  record s run index scope output results holds member slot stands fits :=
    have recorded := ops.record s run index scope output results holds.1 member slot stands fits
    ⟨⟨recorded.1, by
      rw [Laws.MultiInstance.leftWith, Laws.MultiInstance.setRun_eq]
      exact side.runs _ _ (side.leaveInstance program s run scope holds.1 member (List.mem_of_getElem? slot) stands
        holds.2)⟩, recorded.2⟩
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
    ⟨⟨begun.1, side.instanceBegin s request holds.2⟩, begun.2⟩
  defer s requests holds bare :=
    have deferred := ops.defer s requests holds.1 bare
    ⟨⟨deferred.1, side.defer s requests holds.2⟩, deferred.2⟩
  runs s base next loop holds settledNext placedNext opens linked :=
    have ran := ops.runs s base next loop holds.1 settledNext placedNext opens linked
    ⟨⟨ran.1, by rw [Laws.MultiInstance.setRun_eq]; exact side.runs _ _ holds.2⟩, ran.2⟩
  write s scope writes rule holds :=
    have written := ops.write s scope writes rule holds.1
    ⟨⟨written.1, side.signal holds.2 _⟩, written.2⟩

theorem startsOps_alongside (side : FrameAlongside rel) {program : Program}
    (ops : Laws.Starts.StartsOps (WellFormed program)) :
    Laws.Starts.StartsOps fun s => WellFormed program s ∧ rel s where
  clock s atMs holds :=
    ⟨ops.clock s atMs holds.1, side.frame s _ .same holds.2⟩
  complete s occurrence leave writes rule holds member begun :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun, side.signal holds.2 _⟩

theorem scopesOps_alongside (side : FrameAlongside rel) {program : Program}
    (ops : Laws.Scopes.ScopesOps (WellFormed program)) :
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
  begin s request holds stands inner flows owned nodup admitted :=
    ⟨ops.begin s request holds.1 stands inner flows owned nodup admitted,
      side.signalBegin _ _ (.flows flows owned) holds.2⟩
  armed := ops.armed
  scopeArmed := ops.scopeArmed
  signalScopes := ops.signalScopes

theorem propagationOps_alongside (side : FrameAlongside rel) {program : Program}
    (occurs : OccursAlongside program rel)
    (ops : Laws.Propagation.PropagationOps program (WellFormed program)) :
    Laws.Propagation.PropagationOps program fun s => WellFormed program s ∧ rel s where
  complete s occurrence leave writes rule holds member begun :=
    ⟨ops.complete s occurrence leave writes rule holds.1 member begun, side.signal holds.2 _⟩
  raise s raised occurrence holds member begun raises :=
    ⟨ops.raise s raised occurrence holds.1 member begun (raises.imp fun _ => And.left),
      occurs.raise s raised occurrence holds.1 raises holds.2⟩
  fire s item fired holds := ⟨ops.fire s item fired holds.1, side.signal holds.2 _⟩
  outbox s outbox holds :=
    ⟨ops.outbox s outbox holds.1, side.frame s _ .same holds.2⟩
  compensate s occurrence scope activity trigger leave holds member begun begunFrom named :=
    ⟨ops.compensate s occurrence scope activity trigger leave holds.1 member begun (begunFrom.imp fun _ => And.left)
      named, occurs.throwCompensate s occurrence scope activity trigger leave holds.1 begunFrom named holds.2⟩
  terminate s occurrence holds member begun :=
    have cleared := ops.terminate s occurrence holds.1 member begun
    ⟨⟨cleared.1, side.clearInside program s _ _ holds.1 (holds.1.owned.occurrenceScopes occurrence member)
      (fun _ inside keeps strictly => strictly.2 (congrArg Occurrence.scope (Laws.State.nodup_map_eq
        holds.1.distinct.occurrences inside member (List.mem_singleton.mp keeps)))) holds.2⟩, cleared.2⟩
  openItem s kind occurrence holds member begun unstarted role :=
    ⟨ops.openItem s kind occurrence holds.1 member begun unstarted role, side.openItem holds.2 kind occurrence⟩
  signalOccurrences := ops.signalOccurrences
  begin s element scope holds stands :=
    ⟨ops.begin s element scope holds.1 stands, side.signalBegin _ _ (.fresh rfl rfl) holds.2⟩
  cancel s id holds := ⟨ops.cancel s id holds.1, side.signal holds.2 _⟩
  occur s element scope leave writes rule holds bounded :=
    ⟨ops.occur s element scope leave writes rule holds.1 bounded, occurs.occur _ _ _ _ _ _ (.inl bounded) holds.2⟩
  write s scope writes rule holds := ⟨ops.write s scope writes rule holds.1, side.signal holds.2 _⟩
  failCompensation s handler code message origin holds :=
    ⟨ops.failCompensation s handler code message origin holds.1, side.signal holds.2 _⟩
  fail s failure holds := ⟨ops.fail s failure holds.1, side.signal holds.2 _⟩
  disarm s host holds :=
    have disarmed := ops.disarm s host holds.1
    ⟨⟨disarmed.1, side.disarm program s host holds.1 holds.2⟩, disarmed.2⟩
  rollBack s scope trigger leave element parent flows holds stands bounded rolls :=
    ⟨ops.rollBack s scope trigger leave element parent flows holds.1 stands bounded (rolls.imp fun _ => And.left),
      occurs.compensate _ _ _ _ _ _ _ _ (.inl bounded) ⟨s, rfl, holds.1, List.mem_map.mpr stands, rolls⟩
        (side.clearInside program s scope [] holds.1 (List.mem_map.mpr stands) (fun _ _ none => by simp at none) holds.2)⟩

/-- Compensation runs' record beside `WellFormed`: a context `Laws.Compensation.RunsOps` leaves is a running one
(`LeavesOwned`), the runs it stores hold only contexts held or fresh (`StoresHeldOrFresh`) and resume by pending
reservations (`ResumesPending`), and an ended run's resume is pending. -/
theorem runsOps_alongside (side : StoresAlongside rel) {program : Program}
    (occurs : OccursAlongside program rel)
    (ops : Laws.Compensation.RunsOps (WellFormed program) Laws.State.Settled) :
    Laws.Compensation.RunsOps (fun s => WellFormed program s ∧ rel s) Laws.State.Settled where
  fits s run holds member := ops.fits s run holds.1 member
  issued s holds := ops.issued s holds.1
  slotsIssued s holds := ops.slotsIssued s holds.1
  store s compensation holds kept contexts resumes :=
    have stored := ops.store s compensation holds.1 kept contexts (fun run member element at_ leave resumed =>
      (resumes run member element at_ leave resumed).imp fun _ => And.imp_left And.left)
    ⟨⟨stored.1, side.storeRuns program s compensation holds.1 (fun run member context running =>
      (contexts run member context running).imp_right fun none ⟨body, inside, active⟩ => none body inside active)
      (fun run member element at_ leave resumed => .inr ((resumes run member element at_ leave resumed).imp
        fun _ => And.imp_left And.right)) holds.2⟩, stored.2⟩
  enter s element parent locals holds stands :=
    have entered := ops.enter s element parent locals holds.1 stands
    ⟨⟨entered.1, side.enterScope program s element parent locals none holds.1 holds.2⟩, entered.2⟩
  entered := ops.entered
  signalled := ops.signalled
  cancel s id holds := have queued := ops.cancel s id holds.1; ⟨⟨queued.1, side.signal holds.2 _⟩, queued.2⟩
  complete s id leave writes rule holds settled :=
    have queued := ops.complete s id leave writes rule holds.1 settled
    ⟨⟨queued.1, side.signal holds.2 _⟩, queued.2⟩
  occur s element scope leave writes rule holds pending :=
    have queued := ops.occur s element scope leave writes rule holds.1 (pending.imp fun _ => And.imp_left And.left)
    ⟨⟨queued.1, occurs.occur _ _ _ _ _ _ (.inr (pending.imp fun _ => And.imp_left And.right)) holds.2⟩, queued.2⟩
  begin s handler context scope holds stands :=
    have queued := ops.begin s handler context scope holds.1 stands
    ⟨⟨queued.1, side.signalBegin _ _ (.handler rfl rfl) holds.2⟩, queued.2⟩
  leave s entry parent holds member link running :=
    have left := ops.leave s entry parent holds.1 member link running
    ⟨⟨left.1, side.leaveScope program s entry.id holds.1 (List.mem_map.mpr ⟨entry, member, rfl⟩) (.inr running)
      holds.2⟩, left.2⟩

theorem subscriptionsOps_alongside (side : FrameAlongside rel) {program : Program}
    (occurs : OccursAlongside program rel)
    (ops : Laws.Subscriptions.SubscriptionsOps program (WellFormed program)) :
    Laws.Subscriptions.SubscriptionsOps program fun s => WellFormed program s ∧ rel s where
  fire s item fired holds := ⟨ops.fire s item fired holds.1, side.signal holds.2 _⟩
  rekind s change holds kept waits :=
    ⟨ops.rekind s change holds.1 kept waits,
      side.frame s _ .same holds.2⟩
  awaits := ops.awaits
  disarm s host holds := ⟨ops.disarm s host holds.1, side.disarm program s host holds.1 holds.2⟩
  openItem s kind occurrence holds member begun unstarted role :=
    ⟨ops.openItem s kind occurrence holds.1 member begun unstarted role, side.openItem holds.2 kind occurrence⟩
  openSubscription s kind element scope host passive holds stands hangs waits reservable :=
    ⟨ops.openSubscription s kind element scope host passive holds.1 stands hangs waits reservable,
      side.openSubscription occurs holds.1 holds.2 kind element scope host passive reservable⟩
  subscribed s kind element scope host passive holds := ops.subscribed s kind element scope host passive holds.1
  closeComplete s item leave writes holds member :=
    ⟨ops.closeComplete s item leave writes holds.1 member, side.signal (side.closeItem holds.2 item.id) _⟩
  gatewayComplete s item gateway leave writes holds member attached :=
    ⟨ops.gatewayComplete s item gateway leave writes holds.1 member attached, side.signal (side.signal
      (side.disarm program _ gateway (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id)) _) _⟩
  interruptComplete s item host leave writes holds member :=
    ⟨ops.interruptComplete s item host leave writes holds.1 member, side.signal (side.signal
      (side.withdrawOccurrence (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id) host) _) _⟩
  reopenComplete s item detail leave writes holds member reservable :=
    ⟨ops.reopenComplete s item detail leave writes holds.1 member reservable, side.signal (side.openSubscription occurs
      (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id) _ _ _ _ _ reservable) _⟩
  occur s item element leave writes holds member bounded :=
    ⟨ops.occur s item element leave writes holds.1 member bounded, occurs.occur _ _ _ _ _ _ (.inl bounded) holds.2⟩
  insideBegin s item element locals holds member start :=
    ⟨ops.insideBegin s item element locals holds.1 member start,
      side.signalBegin _ _ (.fresh rfl rfl) (side.withdrawInside (side.closeItem holds.2 item.id) item.scope)⟩
  closeBegin s item element locals holds member start :=
    ⟨ops.closeBegin s item element locals holds.1 member start,
      side.signalBegin _ _ (.fresh rfl rfl) (side.closeItem holds.2 item.id)⟩
  reopenBegin s item detail element locals holds member start reservable :=
    ⟨ops.reopenBegin s item detail element locals holds.1 member start reservable, side.signalBegin _ _ (.fresh rfl rfl)
      (side.openSubscription occurs (Laws.State.closeItem_fired holds.1 member).1 (side.closeItem holds.2 item.id) _ _ _ _ _
        reservable)⟩
  bareBegin s item element locals holds member :=
    ⟨ops.bareBegin s item element locals holds.1 member, side.signalBegin _ _ (.fresh rfl rfl) holds.2⟩

theorem compensationOps_alongside (side : StoresAlongside rel) {program : Program}
    (ops : Laws.Compensation.CompensationOps (WellFormed program)) :
    Laws.Compensation.CompensationOps fun s => WellFormed program s ∧ rel s where
  store s compensation holds runs :=
    ⟨ops.store s compensation holds.1 runs, side.storeRuns program s compensation holds.1
      (fun run member _ inside => .inl ⟨run, runs run member, inside⟩)
      (fun run member _ at_ leave resumed => .inl (.inr (.inr ⟨run, runs run member, at_, leave, resumed⟩))) holds.2⟩
  issue s holds := ⟨ops.issue s holds.1, side.issue s holds.2⟩
  issued := ops.issued
  fail s failure holds := ⟨ops.fail s failure holds.1, side.signal holds.2 _⟩

end Alongside

/-! ## The registered hooks' feature records beside `WellFormed` -/

/-- The feature records but Multi-Instance's and Compensation's of `WellFormed` and a property beside it, which may
read the step's program, from those of `WellFormed` and `FrameAlongside` alone (`Proofs.Step.registered_contract_of`
turns them and what the Multi-Instance and compensation hooks keep into the registered hooks' contract). -/
theorem featureOps_frame {rel : Program → State → Prop} (ops : Proofs.Step.FeatureOps WellFormed)
    (side : ∀ program, FrameAlongside (rel program))
    (occurs : ∀ program, OccursAlongside program (rel program)) :
    Proofs.Step.FeatureOps fun program s => WellFormed program s ∧ rel program s where
  operations := operations_alongside side ops.operations
  work _ := workOps_alongside (side _) (ops.work _)
  flow _ := flowOps_alongside (side _) (ops.flow _)
  join _ := joinOps_alongside (side _) (ops.join _)
  starts _ := startsOps_alongside (side _) (ops.starts _)
  scopes _ := scopesOps_alongside (side _) (ops.scopes _)
  subscriptions _ := subscriptionsOps_alongside (side _) (occurs _) (ops.subscriptions _)
  propagation _ := propagationOps_alongside (side _) (occurs _) (ops.propagation _)

/-- What the registered compensation hooks keep of `WellFormed` and a property beside it that storing runs keeps, from
the compensation records of `WellFormed`. -/
theorem compensationKeeps_frame {rel : Program → State → Prop} (ops : Proofs.Step.RegisteredOps WellFormed)
    (side : ∀ program, StoresAlongside (rel program)) (occurs : ∀ program, OccursAlongside program (rel program)) :
    Proofs.Step.CompensationKeeps fun program s => WellFormed program s ∧ rel program s :=
  Proofs.Step.compensationKeeps_of (fun _ => compensationOps_alongside (side _) (ops.compensation _))
    (fun _ => runsOps_alongside (side _) (occurs _) (ops.runs _))

/-- The feature records of `WellFormed` and a property beside it that `Alongside` and `StoresAlongside` gather, from
those of `WellFormed`. -/
theorem registeredOps_alongside {rel : State → Prop} (ops : Proofs.Step.RegisteredOps WellFormed)
    (side : Alongside rel) (stores : StoresAlongside rel) (occurs : ∀ program, OccursAlongside program rel) :
    Proofs.Step.RegisteredOps fun program s => WellFormed program s ∧ rel s :=
  { featureOps_frame ops.toFeatureOps (fun _ => side.toFrameAlongside) occurs with
    multiInstance := fun _ => multiInstanceOps_alongside side (ops.multiInstance _)
    compensation := fun _ => compensationOps_alongside stores (ops.compensation _)
    runs := fun _ => runsOps_alongside stores (occurs _) (ops.runs _) }

/-! ## Subtree removal of the registered hooks -/

/-- Reservations and queued occurrences keep the scope occurrences of any before-state: a reservation issues one
identity and enters none. -/
theorem scopesKept_occursAlongside (before : State) (program : Program) :
    OccursAlongside program (ScopesKept before) where
  reserve s element scope _ _ kept :=
    have reserves := Laws.State.reserve_reserves s element scope
    kept.enter reserves.nextIssue fun _ member => .inl (reserves.scopes ▸ member)
  occur s _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  compensate s _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  throwCompensate s _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  raise s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept

/-- The registered hooks keep the scope occurrences of any before-state beside `WellFormed`. -/
theorem keepsScopes_contract (ops : Proofs.Step.RegisteredOps WellFormed) (before : State) :
    Laws.Step.HookContract Registry.hooks (KeepsScopes before) :=
  Proofs.Step.registered_contract (registeredOps_alongside ops (scopesKept_alongside before)
    (scopesKept_stores before) (scopesKept_occursAlongside before)) Proofs.State.stateFacts

/-- `SubtreeRemoved` of the registered hooks, from the records and phases of `WellFormed`. -/
theorem subtreeRemoved_registered (ops : Proofs.Step.RegisteredOps WellFormed) (phases : Laws.Step.Phases WellFormed)
    (pipeline : Laws.Step.PipelinePhases WellFormed) : SubtreeRemoved Registry.hooks :=
  subtreeRemoved_of_keeps (keepsScopes_contract ops) (keepsScopes_phases phases) (keepsScopes_pipelinePhases pipeline)
    Proofs.State.stateFacts

/-! ## End facts of the registered hooks -/

/-- The state operations the hooks apply keep an input's end facts from its start under any exemption, since each frames
them (`Kernel.Laws.Step.EndsFrames`): the hooks then keep `Laws.Step.EndsInv` by their feature lemmas
(`endsInv_contract`). -/
theorem endsKept_alongside (b : State) (x : Option (Nat × OccurrenceKey)) :
    Alongside (Laws.Step.EndsKept b x) where
  frame _ _ moved kept := kept.unmoved moved.occurrences moved.activations ⟨moved.scopes, moved.instanceId⟩
    (Nat.le_of_eq moved.nextIssue.symm) (.of_eq (by simp only [Laws.Step.endKeys, moved.journal, moved.draft]))
  signalBegin s _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  issue _ kept := by
    rw [Laws.State.issue_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_succ _) (.refl _)
  enterScope _ s element parent locals owner formed kept :=
    kept.step formed (Laws.Step.enterScope_frame formed element parent locals owner)
  enterCalled _ s called call variables definition formed kept :=
    kept.step formed (Laws.Step.enterCalled_frame formed called call variables definition)
  reserve _ _ element scope formed _ kept := kept.step formed (Laws.Step.reserve_frame formed element scope)
  leaveScope _ _ _ formed present _ kept := kept.step formed (Laws.Step.leaveScope_frame formed present)
  clearInside _ _ _ _ formed present inside kept := kept.step formed (Laws.Step.clearInside_frame formed present inside)
  disarm _ s host formed kept := kept.step formed (Laws.Step.disarm_frame s host)
  setVariable _ s target name value formed kept := kept.step formed (Laws.Step.setVariable_frame s target name value)
  removeVariable _ s target name formed kept := kept.step formed (Laws.Step.removeVariable_frame s target name)
  instanceBegin s _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  defer s _ kept := by
    rw [Laws.State.deferBegins_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  leaveInstance _ _ _ _ formed _ _ present kept := kept.step formed (Laws.Step.leaveScope_frame formed present)
  runs _ _ kept := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)

/-- Storing compensation runs keeps an input's end facts from its start. -/
theorem endsKept_stores (b : State) (x : Option (Nat × OccurrenceKey)) : StoresAlongside (Laws.Step.EndsKept b x) :=
  { (endsKept_alongside b x).toFrameAlongside with
    storeRuns := fun _ _ _ _ _ _ kept => kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _) }

/-- `Step`'s phases keep an input's end facts from its start: journalling the draft and ordering the journal permute
them, and beginning and cancelling frame them (`Kernel.Laws.Step.EndsFrames`). -/
theorem endsKept_stepAlongside (b : State) :
    StepAlongside (Laws.Step.EndsKept b none) where
  toFrameAlongside := (endsKept_alongside b none).toFrameAlongside
  journal _ s transition _ kept _ ended := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (by
    simp only [Laws.Step.endKeys, List.flatMap_cons, ended, List.map_append]
    simpa using List.perm_append_comm)
  runOrder _ s _ kept := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _)
    ((((List.reverse_perm s.journal).flatMap_right _).append_right _).map _)
  dequeue _ _ _ _ _ kept := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  untoken _ _ _ _ _ kept := kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  begin _ _ _ role sourceType formed stands admitted _ _ kept :=
    kept.step formed (Laws.Step.beginOccurrence_frame formed stands admitted role sourceType)
  cancel _ _ id formed kept := kept.step formed (Laws.Step.cancelOccurrence_frame formed id)

/-- Reservations and queued occurrences keep an input's end facts from its start, which they frame
(`Kernel.Laws.Step.EndsFrames`). -/
theorem endsKept_occursAlongside (b : State) (x : Option (Nat × OccurrenceKey)) (program : Program) :
    OccursAlongside program (Laws.Step.EndsKept b x) where
  reserve _ element scope formed _ kept := kept.step formed (Laws.Step.reserve_frame formed element scope)
  occur s _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  compensate s _ _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  throwCompensate s _ _ _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)
  raise s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept.unmoved rfl rfl ⟨rfl, rfl⟩ (Nat.le_refl _) (.refl _)

/-- The registered hooks keep an input's end facts from its start beside `WellFormed`, under any exemption
(`Laws.Step.EndsInv`), the hook contract `Laws.Step.complete_ends` and `MicroStepsKeepEnds` rest on. -/
theorem endsInv_contract (ops : Proofs.Step.RegisteredOps WellFormed) (b : State) (x : Option (Nat × OccurrenceKey)) :
    Laws.Step.HookContract Registry.hooks (Laws.Step.EndsInv b x) :=
  Proofs.Step.registered_contract (registeredOps_alongside ops (endsKept_alongside b x) (endsKept_stores b x)
    (endsKept_occursAlongside b x))
    Proofs.State.stateFacts

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

/-- Opening a subscription keeps the draft's end facts: its reservation journals nothing (`Laws.State.Reserves`). -/
private theorem openSubscription_ended (s : State) (kind : OpenKind)
    (element : ElementId) (scope : ScopeOccurrenceId) (host : Option Nat) (passive : Bool) :
    (s.openSubscription kind element scope host passive).1.draft.ended = s.draft.ended := by
  rw [Laws.State.openSubscription_eq]
  exact congrArg (·.ended) (Laws.State.reserve_reserves s element scope).draft

/-- Subscriptions' operations keep the draft's end facts: they queue firings and completions, open, close, withdraw
and rekind items and disarm hosts, and a subscription reserves its occurrence, which journals nothing. -/
theorem subscriptionsOps_draft (program : Program)
    (ended : List (OccurrenceKey × Terminal)) :
    Laws.Subscriptions.SubscriptionsOps program fun s => s.draft.ended = ended where
  fire s _ _ same := by rw [signal_draft]; exact same
  rekind _ _ same _ _ := same
  awaits := Laws.State.triggers_await
  disarm s host same := by rw [disarm_draft]; exact same
  openItem s kind occurrence same _ _ _ _ := by
    rw [Laws.State.openItem_eq]
    exact same
  openSubscription s kind element scope host passive same _ _ _ _ :=
    (openSubscription_ended s kind element scope host passive).trans same
  subscribed s kind element scope host passive _ := by
    have reserves := Laws.State.reserve_reserves s element scope
    rw [Laws.State.openSubscription_eq]
    exact ⟨reserves.scopes, fun o inside => reserves.occurrences ▸ List.mem_append_left _ inside⟩
  closeComplete s _ _ _ same _ := by rw [signal_draft, closeItem_draft]; exact same
  gatewayComplete s _ _ _ _ same _ _ := by rw [signal_draft, signal_draft, disarm_draft, closeItem_draft]; exact same
  interruptComplete s _ _ _ _ same _ := by
    rw [signal_draft, signal_draft, withdrawOccurrence_draft, closeItem_draft]
    exact same
  reopenComplete s _ _ _ _ same _ _ := by rw [signal_draft, openSubscription_ended, closeItem_draft]; exact same
  occur s _ _ _ _ same _ _ := by rw [signal_draft]; exact same
  insideBegin s _ _ _ same _ _ := by rw [signal_draft, withdrawInside_draft, closeItem_draft]; exact same
  closeBegin s _ _ _ same _ _ := by rw [signal_draft, closeItem_draft]; exact same
  reopenBegin s _ _ _ _ same _ _ _ := by rw [signal_draft, openSubscription_ended, closeItem_draft]; exact same
  bareBegin s _ _ _ same _ := by rw [signal_draft]; exact same

end Draft

/-- The registered hooks journal no end when told of a cancellation, which no feature hears, or of variable writes,
which Subscriptions offers to Conditional items by queueing the firings they decide (`Laws.Subscriptions`), so each
micro-step leaves the draft without end facts (`Laws.Step.microStep_drafts`). -/
theorem registered_quiet :
    (∀ ctx occurrence state after, state.draft.ended = [] → Registry.hooks.cancelled ctx occurrence state = .ok after →
      after.draft.ended = []) ∧
    ∀ ctx writes state after, state.draft.ended = [] → Registry.hooks.written ctx writes state = .ok after →
      after.draft.ended = [] :=
  ⟨fun _ _ _ _ empty ran => by
    rw [Laws.Registry.hooks_cancelled] at ran
    cases ran
    exact empty, fun ctx _ _ _ empty ran => by
    rw [Laws.Registry.hooks_written] at ran
    exact Laws.Subscriptions.offerWrites_keeps (subscriptionsOps_draft ctx.program []) empty ran⟩

/-- `MicroStepsKeepEnds` of the registered hooks, from the records and phases of `WellFormed`; `removedEndOnce` then
gives `RemovedEndOnce`. -/
theorem microStepsKeepEnds_registered (ops : Proofs.Step.RegisteredOps WellFormed)
    (phases : Laws.Step.Phases WellFormed) (pipeline : Laws.Step.PipelinePhases WellFormed) :
    MicroStepsKeepEnds Registry.hooks := by
  have kept := fun b => microStepsKeep_alongside (rel := fun _ => Laws.Step.EndsKept b none) (endsInv_contract ops b none)
    phases.toClosurePhases (fun _ => (endsKept_stepAlongside b).toClosureAlongside) Proofs.State.stateFacts
    (Laws.Step.complete_ends (endsInv_contract ops b) phases pipeline Proofs.State.stateFacts)
  obtain ⟨cancelled, written⟩ := registered_quiet
  refine ⟨fun ctx cause transition b state after runs holds ran =>
    ⟨(kept b).1 ctx cause transition state after runs holds ran, Laws.Step.microStep_drafts cancelled written ran⟩,
    fun ctx b state after holds step => ⟨(kept b).2 ctx state after holds step, ?_⟩⟩
  obtain ⟨_, _, _, ⟨_, _, ran⟩⟩ := step.microStep
  exact Laws.Step.microStep_drafts cancelled written ran

/-- `RemovedEndOnce` of the registered hooks, from the records and phases of `WellFormed`. -/
theorem removedEndOnce_registered (ops : Proofs.Step.RegisteredOps WellFormed) (phases : Laws.Step.Phases WellFormed)
    (pipeline : Laws.Step.PipelinePhases WellFormed) : RemovedEndOnce Registry.hooks :=
  removedEndOnce (microStepsKeepEnds_registered ops phases pipeline)

/-! ## The clearings of the registered hooks

A Terminate End's and an interrupting Event Sub-Process start's clearings are `Laws.State.ClearsInside` transitions of a
well-formed state (`Laws.Scopes.clearInside_clears`). -/

/-- `Laws.Scopes.TerminateClears` of the registered hooks: a Terminate End arriving as an occurrence of a well-formed
state clears its scope occurrence, keeping only that occurrence, and queues its completion, which the clearing does not
read (TEND-REGION-01, BPMN 2.0.2 §13.5.6). -/
theorem registered_terminateClears {ctx : Ctx} {header : Header} {payload : EventPayload} {occurrence : Occurrence}
    {state after : State} (formed : WellFormed ctx.program state) (member : occurrence ∈ state.occurrences)
    (ran : Registry.hooks.arriveThrow ctx header payload .terminate occurrence state = .ok after) :
    Laws.Scopes.TerminateClears true occurrence.scope occurrence.id state after := fun _ => by
  rw [Laws.Registry.hooks_arriveThrow, Laws.Propagation.arriveThrow_terminate] at ran
  cases ran
  exact Laws.Scopes.clearsInside_signal
    (Laws.Scopes.clearInside_clears formed (formed.owned.occurrenceScopes occurrence member) _) _

/-- `Laws.Scopes.InterruptingStart` of the registered hooks: an Event Sub-Process arriving as an occurrence of a
well-formed state enters its Scope on the clearing of its parent scope occurrence that keeps only its own occurrence and
its start Event's reservation when its start interrupts, and on the arrival's state otherwise (§13.5.4, IMESP). -/
theorem registered_interruptingStart {ctx : Ctx} {header : Header} {payload : ScopePayload} {occurrence : Occurrence}
    {entry : ScopeEntry} {state after : State} {start : Subscription} {interrupting : Bool}
    (formed : WellFormed ctx.program state) (member : occurrence ∈ state.occurrences)
    (kind : payload.kind = .eventSubProcess start interrupting)
    (ran : Registry.hooks.arriveScope ctx header payload occurrence entry state = .ok after) :
    ∃ cleared, Laws.Scopes.InterruptingStart interrupting occurrence.scope (occurrence.id :: entry.inner.toList) state
      cleared ∧ (interrupting = false → cleared = state) ∧
      Feature.Scopes.enter ctx header payload occurrence entry cleared = .ok after := by
  rw [Laws.Registry.hooks_arriveScope] at ran
  exact Laws.Scopes.arriveScope_interrupts formed member kind ran

end Kernel.Proofs.Cancellation
