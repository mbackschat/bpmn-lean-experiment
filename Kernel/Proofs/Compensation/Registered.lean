module

public import Kernel.Laws.Registry
public import Kernel.Proofs.Step
public import Kernel.Proofs.Compensation.Hooks

/-! # Proofs: the Compensation and Transaction lane under the registered hooks

The compensation hooks keep `WellFormed` with the lane relation `Formed` beside it (`compensationKeeps_formed`), each
hook by what `Kernel.Proofs.Compensation.Hooks` proves of its result. This is the lane's one module that imports the
registry's Laws module, since it composes the registered hooks, and so stays in every feature's rebuild cone (guard
15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed)

/-- The compensation hooks keep `WellFormed` with the lane relation beside it, read under `hooks`' Step context, given
that they keep `WellFormed`. -/
theorem compensationKeeps_formed (hooks : Hooks) (wf : Proofs.Step.CompensationKeeps WellFormed) :
    Proofs.Step.CompensationKeeps fun program s =>
      WellFormed program s ∧ Formed (DependsIn hooks footprintReads footprintWrites program) s where
  completed ctx occurrence state after holds member ran := by
    obtain ⟨kept, frame⟩ := wf.completed ctx occurrence state after holds.1 member ran
    exact ⟨⟨kept, completed_formed hooks holds.1 holds.2 member kept ran⟩, frame⟩
  dropWithin ctx scope state holds := by
    obtain ⟨kept, steady⟩ := wf.dropWithin ctx scope state holds.1
    exact ⟨⟨kept, dropWithin_formed hooks holds.1 holds.2 kept⟩, steady⟩
  failCompensation ctx handler code message origin state after holds stands ran := by
    have kept := wf.failCompensation ctx handler code message origin state after holds.1 stands ran
    exact ⟨kept, failCompensation_formed hooks holds.2 ran⟩
  compensate ctx scope activity trigger leave resume state after holds stands resumable pending popped ran := by
    have kept := wf.compensate ctx scope activity trigger leave resume state after holds.1 stands resumable
      (fun element at_ resumed named => by
        obtain ⟨held, heldHolds, waiting⟩ := pending element at_ resumed named
        exact ⟨held, heldHolds.1, waiting⟩)
      (by
        obtain ⟨queue, queueHolds, rest⟩ := popped
        exact ⟨queue, queueHolds.1, rest⟩) ran
    exact ⟨kept, compensate_formed hooks holds.1 holds.2 stands popped kept ran⟩
  handlerCompleted ctx run occurrence state after holds stands ran := by
    have kept := wf.handlerCompleted ctx run occurrence state after holds.1 stands ran
    exact ⟨kept, handlerCompleted_formed hooks holds.1 holds.2 kept ran⟩
  handlerEnded ctx run occurrence state after holds stands ran := by
    have kept := wf.handlerEnded ctx run occurrence state after holds.1 stands ran
    exact ⟨kept, handlerEnded_formed hooks holds.1 holds.2 kept ran⟩

/-- The registered compensation hooks keep `WellFormed` with the lane relation beside it. -/
theorem registered_compensationKeeps :
    Proofs.Step.CompensationKeeps fun program s =>
      WellFormed program s ∧ Formed (DependsIn Registry.hooks footprintReads footprintWrites program) s :=
  compensationKeeps_formed Registry.hooks
    (Proofs.Step.compensationKeeps_of Proofs.Step.registeredOps_wellFormed.compensation
      Proofs.Step.registeredOps_wellFormed.runs)

end Kernel.Proofs.Compensation
