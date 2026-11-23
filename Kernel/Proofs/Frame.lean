module

public import Kernel.Proofs.Frame.Alongside

/-! # Proofs: `Step`'s phases beside `WellFormed`

`Step`'s phases keep a property carried beside `Laws.State.WellFormed` that the state operations they apply keep
(`closurePhases_alongside`, `phases_alongside`), from the records of `Kernel.Proofs.Frame.Alongside`. Every proof lane
that carries a property beside `WellFormed` imports this module or the records' rather than another lane's; it reads no
feature, so it lies in no feature's rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Frame

open Kernel
open Kernel.Laws.State (WellFormed)

/-- The phases a micro-step's body runs keep a property beside `WellFormed` that the state operations they apply keep:
the phases that read `WellFormed` alone read its first half, and the others keep the second by `BodyAlongside` of the
step's program. -/
theorem bodyPhases_alongside {rel : Program → State → Prop} (phases : Laws.Step.BodyPhases WellFormed)
    (side : ∀ program, BodyAlongside program (rel program)) :
    Laws.Step.BodyPhases fun program s => WellFormed program s ∧ rel program s where
  clock _ s atMs holds :=
    ⟨phases.clock _ _ atMs holds.1,
      (side _).frame s _ .same holds.2⟩
  dequeue _ s signals holds fewer :=
    ⟨phases.dequeue _ _ signals holds.1 fewer, (side _).dequeue s signals holds.1 fewer holds.2⟩
  unqueue _ s unit holds := ⟨phases.unqueue _ _ unit holds.1, (side _).unqueue s unit holds.1 holds.2⟩
  untoken _ s unit holds := ⟨phases.untoken _ _ unit holds.1, (side _).untoken s unit holds.1 holds.2⟩
  queueWrite _ _ scope writes rule holds :=
    ⟨phases.queueWrite _ _ scope writes rule holds.1, (side _).toFrameAlongside.signal holds.2 _⟩
  queueRemove _ _ scope names holds :=
    ⟨phases.queueRemove _ _ scope names holds.1, (side _).toFrameAlongside.signal holds.2 _⟩
  armIssued _ _ host element scope holds := phases.armIssued _ _ host element scope holds.1
  armScopeIssued _ _ scope holds := phases.armScopeIssued _ _ scope holds.1
  armGatewayIssued _ _ occurrence gateway scope holds :=
    phases.armGatewayIssued _ _ occurrence gateway scope holds.1
  endRecorded _ _ status failure holds := phases.endRecorded _ _ status failure holds.1
  admittedSignal _ _ unit request holds := phases.admittedSignal _ _ unit request holds.1
  admittedToken _ _ request popped holds := phases.admittedToken _ _ request popped holds.1
  completeQueued _ _ id leave writes rule holds := phases.completeQueued _ _ id leave writes rule holds.1
  resumable _ _ scope activity trigger leave resume unit holds :=
    phases.resumable _ _ scope activity trigger leave resume unit holds.1
  raisable _ _ raised origin unit holds := phases.raisable _ _ raised origin unit holds.1
  housed _ _ occurrence holds := phases.housed _ _ occurrence holds.1
  issued _ _ occurrence holds := phases.issued _ _ occurrence holds.1
  issuer _ _ holds := phases.issuer _ _ holds.1
  bodied _ _ occurrence holds := phases.bodied _ _ occurrence holds.1
  newest _ _ request role sourceType holds := phases.newest _ _ request role sourceType holds.1
  unrun _ _ request role sourceType holds := phases.unrun _ _ request role sourceType holds.1
  unowned _ _ request role sourceType holds := phases.unowned _ _ request role sourceType holds.1
  parkedBegun _ _ waiting occurrence holds := phases.parkedBegun _ _ waiting occurrence holds.1
  endInstance _ s status failure holds recorded := by
    refine ⟨phases.endInstance _ _ status failure holds.1 recorded, ?_⟩
    rw [Laws.Step.endInstance_eq]
    exact (side _).frame (s.clearInside State.root) _ .same
      ((side _).clearInside s State.root [] holds.1 holds.1.rooted.1 (fun _ _ none => by cases none) holds.2)
  begin _ s request role sourceType holds stands admitted roled bodied assigned origin :=
    have begun := phases.begin _ _ request role sourceType holds.1 stands admitted roled bodied assigned
      (origin.mono fun _ held => held.1)
    ⟨⟨begun.1, (side _).begin s request role sourceType holds.1 stands admitted assigned origin holds.2⟩, begun.2⟩
  reserve _ s element scope holds stands pending popped :=
    have reserved := phases.reserve _ _ element scope holds.1 stands (pending.imp fun _ => And.imp_left And.left)
      (popped.imp fun _ => Exists.imp fun _ => Exists.imp fun _ queued => queued.imp fun _ held => held.1)
    ⟨⟨reserved.1, (side _).reserve s element scope holds.1 stands (pending.imp fun _ => And.imp_left And.right) popped
      holds.2⟩, reserved.2⟩
  cancel _ s id holds := ⟨phases.cancel _ _ id holds.1, (side _).cancel s id holds.1 holds.2⟩

/-- The phases a closure runs keep a property beside `WellFormed` that the state operations they apply keep: the body's
by `bodyPhases_alongside`, journalling the draft and moving the batches by `ClosureAlongside`, and the issuer resets
when `rel` reads no issuer (`reissue`). -/
theorem closurePhases_alongside {rel : Program → State → Prop} (phases : Laws.Step.ClosurePhases WellFormed)
    (side : ∀ program, ClosureAlongside program (rel program))
    (reissue : ∀ program s unit, rel program s → rel program { s with issuing := unit, issueNext := 0 }) :
    Laws.Step.ClosurePhases fun program s => WellFormed program s ∧ rel program s :=
  { bodyPhases_alongside phases.toBodyPhases fun program => (side program).toBodyAlongside with
    journal := fun _ s unit transition holds fresh started ended =>
      ⟨phases.journal _ _ unit transition holds.1 fresh started ended,
        (side _).journal s unit transition holds.1 holds.2 fresh started ended⟩
    queueBatch := fun _ s unit holds => ⟨phases.queueBatch _ _ unit holds.1, (side _).queueBatch s unit holds.1 holds.2⟩
    enterUnit := fun _ _ unit holds unrun unseeded untabled =>
      ⟨phases.enterUnit _ _ unit holds.1 unrun unseeded untabled, reissue _ _ unit holds.2⟩
    leaveUnit := fun _ _ holds ran seed => ⟨phases.leaveUnit _ _ holds.1 ran seed, reissue _ _ _ holds.2⟩ }

/-- `Step`'s phases keep a property beside `WellFormed` that the state operations they apply keep
(`closurePhases_alongside`), ordering the journal by `StepAlongside.runOrder`. -/
theorem phases_alongside {rel : Program → State → Prop} (phases : Laws.Step.Phases WellFormed)
    (side : ∀ program, StepAlongside program (rel program))
    (reissue : ∀ program s unit, rel program s → rel program { s with issuing := unit, issueNext := 0 }) :
    Laws.Step.Phases fun program s => WellFormed program s ∧ rel program s :=
  { closurePhases_alongside phases.toClosurePhases (fun program => (side program).toClosureAlongside) reissue with
    runOrder := fun _ start s log holds counters batches keys after made =>
      ⟨phases.runOrder _ start s log holds.1 counters batches keys after made,
        (side _).runOrder start s log holds.1 holds.2 counters batches keys after made⟩ }

/-! ## The counters a closure starts from (DC12)

No counter rises inside a closure: every identity a closure issues goes into the issue table, and a removal only prunes
the counters of what it removes. So the closure keeps `Laws.State.CountersFrom start` of the state `start` it began
from, the premise `Laws.Step.Phases.runOrder` compacts under. One record per writer group; every field but the
removals' keeps the three counter maps. -/

section Counters

variable (start : State) (program : Program)

theorem countersFrom_frame : FrameAlongside program (Laws.State.CountersFrom start) where
  frame _ _ moved held := held.same moved.scopeOrdinals moved.occurrenceOrdinals moved.itemOrdinals moved.nextOrder
  emit _ _ _ _ _ _ held := by rw [Laws.State.emit_eq]; exact held.same rfl rfl rfl
  complete _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
  park _ _ _ _ held := held.same rfl rfl rfl
  arm _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
  armGateway _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
  raise _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
  signalBegin _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
  takePosition _ held := by rw [Laws.State.takePosition_eq]; exact held.same rfl rfl rfl
  enterScope _ _ _ _ _ _ _ _ held := by rw [Laws.State.enterScope_eq]; exact held.same rfl rfl rfl
  reserve s element scope _ _ _ _ held :=
    have reserves := Laws.State.reserve_reserves s element scope
    held.same reserves.scopeOrdinals reserves.occurrenceOrdinals reserves.itemMap.2
      ((Laws.State.orders_kept s).1 element scope)
  leaveScope _ scope _ _ _ held := Laws.State.leaveScope_countersFrom held scope
  clearInside _ scope keep _ _ _ held := Laws.State.clearInside_countersFrom held scope keep
  disarm _ host _ held := Laws.State.disarm_countersFrom held host
  setVariable s target name value _ held :=
    have same := Laws.State.setVariable_same s target name value
    held.same same.scopeOrdinals same.occurrenceOrdinals same.ordinals ((Laws.State.orders_kept s).2.2.2.1 target name value)
  removeVariable s target name _ held :=
    have same := Laws.State.removeVariable_same s target name
    held.same same.scopeOrdinals same.occurrenceOrdinals same.ordinals ((Laws.State.orders_kept s).2.2.2.2 target name)

theorem countersFrom_stores : StoresAlongside program (Laws.State.CountersFrom start) :=
  { countersFrom_frame start program with storeRuns := fun _ _ _ _ _ _ held => held.same rfl rfl rfl }

theorem countersFrom_alongside : Alongside program (Laws.State.CountersFrom start) :=
  { countersFrom_frame start program with
    instanceBegin := fun _ _ _ _ held => by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
    defer := fun _ _ _ _ held => by rw [Laws.State.deferBegins_eq]; exact held.same rfl rfl rfl
    leaveInstance := fun _ _ scope _ _ _ _ held => Laws.State.leaveScope_countersFrom held scope
    runs := fun _ _ _ _ held => held.same rfl rfl rfl }

theorem countersFrom_occurs : OccursAlongside program (Laws.State.CountersFrom start) where
  reserve s element scope _ _ _ _ held :=
    have reserves := Laws.State.reserve_reserves s element scope
    held.same reserves.scopeOrdinals reserves.occurrenceOrdinals reserves.itemMap.2
      ((Laws.State.orders_kept s).1 element scope)
  occur _ _ _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
  compensate _ _ _ _ _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
  throwCompensate _ _ _ _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
  raise _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held.same rfl rfl rfl
  enterCalled _ _ _ _ formed _ _ _ _ _ held := by
    rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]; exact held.same rfl rfl rfl

theorem countersFrom_closure : ClosureAlongside program (Laws.State.CountersFrom start) :=
  { countersFrom_frame start program with
    dequeue := fun _ _ _ _ held => held.same rfl rfl rfl
    unqueue := fun _ _ _ held => held.same rfl rfl rfl
    untoken := fun _ _ _ held => held.same rfl rfl rfl
    begin := fun s request role sourceType formed _ _ _ _ held => by
      have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
      rcases begins.itemMap.2 with same | ⟨_, _, _, erased⟩
      · exact held.same begins.scopeOrdinals begins.occurrenceOrdinals same ((Laws.State.orders_kept s).2.1 request role sourceType)
      · exact held.lower (fun _ => Nat.le_of_eq (by rw [begins.scopeOrdinals]))
          (fun _ => Nat.le_of_eq (by rw [begins.occurrenceOrdinals]))
          (fun _ => by rw [erased]; exact Laws.State.getD_erase_le _ _ _)
          (Nat.le_of_eq ((Laws.State.orders_kept s).2.1 request role sourceType))
    cancel := fun _ id _ held => Laws.State.cancelOccurrence_countersFrom held id
    journal := fun _ _ _ _ held _ _ _ => held.same rfl rfl rfl
    queueBatch := fun _ _ _ held => by rw [Laws.State.queueBatch_eq]; exact held.same rfl rfl rfl }

/-- The completion pipeline keeps `WellFormed` and `CountersFrom start` beside it: starting a reservation and closing
what waited for it move no counter, removing an occurrence prunes them and journalling an end moves none. -/
theorem countersFrom_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ Laws.State.CountersFrom start s where
  startReserved _ s occurrence sourceType holds member unnamed := by
    refine ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    have started : Laws.State.CountersFrom start (s.startReserved occurrence sourceType).1 := by
      cases begun : occurrence.begun
      · have starts := Laws.State.startReserved_starts s sourceType begun
        exact holds.2.same starts.scopeOrdinals starts.occurrenceOrdinals starts.itemMap.2
          ((Laws.State.orders_kept s).2.2.1 occurrence sourceType)
      · rw [Laws.State.startReserved_begun s sourceType begun]
        exact holds.2
    rw [Laws.State.closeOwnItems_eq]
    exact started.same rfl rfl rfl
  removeOccurrence _ s occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, Laws.State.removeOccurrence_countersFrom holds.2 occurrence.id⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact holds.2.same rfl rfl rfl⟩

end Counters

/-! ## The transitions and the issuer a body starts from (DC12)

A micro-step's body and the hooks its conclusion runs keep the transitions and the issuer of the state the body started
from (`Laws.Step.Framed`), beside `WellFormed`: no hook journals a transition or replaces the issuer, and a removal keeps
both (`Laws.State.IssuerKept`). One record per writer group, which `Kernel.Proofs.Cancellation.Registered` assembles into
`Laws.Step.Framing`. -/

section Framed

variable (b : State) (program : Program)

/-- The transitions and the issuer of `b`. -/
abbrev IssuerOf (s : State) : Prop := s.transitions = b.transitions ∧ s.issuing = b.issuing

variable {b} in
theorem IssuerOf.kept {s t : State} (held : IssuerOf b s) (kept : Laws.State.IssuerKept s t) : IssuerOf b t :=
  ⟨kept.transitions.trans held.1, kept.issuing.trans held.2⟩

theorem issuerOf_frame : FrameAlongside program (IssuerOf b) where
  frame _ _ moved held := ⟨moved.transitions.trans held.1, moved.issuing.trans held.2⟩
  emit _ _ _ _ _ _ held := by rw [Laws.State.emit_eq]; exact held
  complete _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  park _ _ _ _ held := held
  arm _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  armGateway _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  raise _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  signalBegin _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  takePosition _ held := by rw [Laws.State.takePosition_eq]; exact held
  enterScope _ _ _ _ _ _ _ _ held := by rw [Laws.State.enterScope_eq]; exact held
  reserve s element scope _ _ _ _ held :=
    have reserves := Laws.State.reserve_reserves s element scope
    held.kept ⟨reserves.transitions, reserves.issuing⟩
  leaveScope s scope _ _ _ held := held.kept (Laws.State.leaveScope_issuerKept s scope)
  clearInside s scope keep _ _ _ held := held.kept (Laws.State.clearInside_issuerKept s scope keep)
  disarm s host _ held := held.kept (Laws.State.disarm_issuerKept s host)
  setVariable s target name value _ held :=
    have same := Laws.State.setVariable_same s target name value
    held.kept ⟨same.transitions, same.issuing⟩
  removeVariable s target name _ held :=
    have same := Laws.State.removeVariable_same s target name
    held.kept ⟨same.transitions, same.issuing⟩

theorem issuerOf_stores : StoresAlongside program (IssuerOf b) :=
  { issuerOf_frame b program with storeRuns := fun _ _ _ _ _ _ held => held }

theorem issuerOf_alongside : Alongside program (IssuerOf b) :=
  { issuerOf_frame b program with
    instanceBegin := fun _ _ _ _ held => by rw [Laws.State.signal_eq]; exact held
    defer := fun _ _ _ _ held => by rw [Laws.State.deferBegins_eq]; exact held
    leaveInstance := fun _ _ scope _ _ _ _ held => held.kept (Laws.State.leaveScope_issuerKept _ scope)
    runs := fun _ _ _ _ held => held }

theorem issuerOf_occurs : OccursAlongside program (IssuerOf b) where
  reserve s element scope _ _ _ _ held :=
    have reserves := Laws.State.reserve_reserves s element scope
    held.kept ⟨reserves.transitions, reserves.issuing⟩
  occur _ _ _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  compensate _ _ _ _ _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  throwCompensate _ _ _ _ _ _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  raise _ _ _ _ _ held := by rw [Laws.State.signal_eq]; exact held
  enterCalled _ _ _ _ formed _ _ _ _ _ held := by
    rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]; exact held

theorem issuerOf_body : BodyAlongside program (IssuerOf b) :=
  { issuerOf_frame b program with
    dequeue := fun _ _ _ _ held => held
    unqueue := fun _ _ _ held => held
    untoken := fun _ _ _ held => held
    begin := fun _ request role sourceType formed _ _ _ _ held =>
      have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
      held.kept ⟨begins.transitions, begins.issuing⟩
    cancel := fun s id _ held => held.kept (Laws.State.cancelOccurrence_issuerKept s id) }

/-- The completion pipeline keeps `WellFormed` and the transitions and the issuer of `b` beside it. -/
theorem issuerOf_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ IssuerOf b s where
  startReserved _ s occurrence sourceType holds member unnamed := by
    refine ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    have started : IssuerOf b (s.startReserved occurrence sourceType).1 := by
      cases begun : occurrence.begun
      · have starts := Laws.State.startReserved_starts s sourceType begun
        exact holds.2.kept ⟨starts.transitions, starts.issuing⟩
      · rw [Laws.State.startReserved_begun s sourceType begun]
        exact holds.2
    rw [Laws.State.closeOwnItems_eq]
    exact started
  removeOccurrence _ s occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, holds.2.kept (Laws.State.removeOccurrence_issuerKept s occurrence.id)⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact holds.2⟩

end Framed

end Kernel.Proofs.Frame
