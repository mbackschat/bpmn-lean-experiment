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

/-- The phases a closure runs keep a property beside `WellFormed` that the state operations they apply keep: the
phases that read `WellFormed` alone read its first half, and the others keep the second by `ClosureAlongside` of the
step's program. -/
theorem closurePhases_alongside {rel : Program → State → Prop} (phases : Laws.Step.ClosurePhases WellFormed)
    (side : ∀ program, ClosureAlongside program (rel program)) :
    Laws.Step.ClosurePhases fun program s => WellFormed program s ∧ rel program s where
  clock _ s atMs holds :=
    ⟨phases.clock _ _ atMs holds.1,
      (side _).frame s _ .same holds.2⟩
  journal _ s transition holds started ended :=
    ⟨phases.journal _ _ transition holds.1 started ended, (side _).journal s transition holds.1 holds.2 started ended⟩
  dequeue _ s signals holds fewer :=
    ⟨phases.dequeue _ _ signals holds.1 fewer, (side _).dequeue s signals holds.1 fewer holds.2⟩
  untoken _ s tokens holds fewer :=
    ⟨phases.untoken _ _ tokens holds.1 fewer, (side _).untoken s tokens holds.1 fewer holds.2⟩
  queueWrite _ _ scope writes rule holds :=
    ⟨phases.queueWrite _ _ scope writes rule holds.1, (side _).toFrameAlongside.signal holds.2 _⟩
  queueRemove _ _ scope names holds :=
    ⟨phases.queueRemove _ _ scope names holds.1, (side _).toFrameAlongside.signal holds.2 _⟩
  armIssued _ _ host element scope holds := phases.armIssued _ _ host element scope holds.1
  armScopeIssued _ _ scope holds := phases.armScopeIssued _ _ scope holds.1
  armGatewayIssued _ _ occurrence gateway scope holds :=
    phases.armGatewayIssued _ _ occurrence gateway scope holds.1
  endRecorded _ _ status failure holds := phases.endRecorded _ _ status failure holds.1
  admittedSignal _ _ request rest holds := phases.admittedSignal _ _ request rest holds.1
  admittedToken _ _ request rest holds := phases.admittedToken _ _ request rest holds.1
  completeQueued _ _ id leave writes rule holds := phases.completeQueued _ _ id leave writes rule holds.1
  resumable _ _ scope activity trigger leave resume rest holds :=
    phases.resumable _ _ scope activity trigger leave resume rest holds.1
  raisable _ _ raised origin rest holds := phases.raisable _ _ raised origin rest holds.1
  housed _ _ occurrence holds := phases.housed _ _ occurrence holds.1
  issued _ _ occurrence holds := phases.issued _ _ occurrence holds.1
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
    ⟨⟨reserved.1, (side _).reserve s element scope holds.1 (pending.imp fun _ => And.imp_left And.right) popped
      holds.2⟩, reserved.2⟩
  cancel _ s id holds := ⟨phases.cancel _ _ id holds.1, (side _).cancel s id holds.1 holds.2⟩

/-- `Step`'s phases keep a property beside `WellFormed` that the state operations they apply keep
(`closurePhases_alongside`), ordering the journal by `StepAlongside.runOrder`. -/
theorem phases_alongside {rel : Program → State → Prop} (phases : Laws.Step.Phases WellFormed)
    (side : ∀ program, StepAlongside program (rel program)) :
    Laws.Step.Phases fun program s => WellFormed program s ∧ rel program s :=
  { closurePhases_alongside phases.toClosurePhases fun program => (side program).toClosureAlongside with
    runOrder := fun _ s holds => ⟨phases.runOrder _ _ holds.1, (side _).runOrder s holds.1 holds.2⟩ }

end Kernel.Proofs.Frame
