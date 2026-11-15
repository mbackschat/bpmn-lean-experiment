module

public import Kernel.Laws.Step.Contract

/-! # Proofs: what a reservation may name

A reservation is an occurrence under the element role (`State.reserve`), so the numbering lane needs every reservation
the features make to name no looping element: one of a looping element in an instance's scope occurrence would be no
instance (`Laws.MultiInstance.InstancesPlaced`). This module states what the frame and phase records that carry a
property beside `WellFormed` require of where a reservation's element comes from (`Laws.IL.BoundaryOf`,
`Laws.IL.Reservable`, `Laws.MultiInstance.PendingIn`), and what that gives under a program whose identifiers are
unique (`Laws.MultiInstance.IdsUnique`). It imports no proof module, so the cancellation
lane's records can name it. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed)
open Kernel.Laws.IL (BoundaryOf Reservable)
open Kernel.Laws.MultiInstance (LoopOf IdsUnique OccurPending PendingIn)

/-- What the features' records supply, for a property `rel` carried beside `WellFormed` under `program`, where they
make or queue a reservation: a subscription reserves a `Reservable` element, and a queued `Signal.occur` or
compensation resume names a boundary or one pending in a state that kept `rel`. -/
structure OccursAlongside (program : Program) (rel : State → Prop) : Prop where
  reserve : ∀ s element scope, WellFormed program s → Reservable program element → rel s →
    rel (s.reserve element scope).1
  occur : ∀ s element scope leave writes rule, (BoundaryOf program element ∨ PendingIn rel element) → rel s →
    rel (s.signal (.occur element scope leave writes rule))
  compensate : ∀ s scope activity trigger leave element at_ resumed,
    (BoundaryOf program element ∨ PendingIn rel element) → rel s →
    rel (s.signal (.compensate scope activity trigger leave (some (.occur element at_ resumed))))

/-- The compensation runs `compensation` resume only reservations pending in `s` or in a state that kept `rel`: what
storing them needs (`Proofs.Cancellation.FrameAlongside.storeRuns`). -/
def ResumesPending (rel : State → Prop) (s : State) (compensation : Compensations) : Prop :=
  ∀ run ∈ compensation.runs, ∀ element at_ leave, run.resume = some (.occur element at_ leave) →
    OccurPending s element ∨ PendingIn rel element

/-- A boundary's identifier names no looping element of a program whose identifiers are unique. -/
theorem boundaryOf_unlooped {program : Program} {element : ElementId} (apart : IdsUnique program)
    (boundary : BoundaryOf program element) : ∀ loop, ¬ LoopOf program element loop := by
  obtain ⟨host, member, envelope, rest⟩ := boundary
  obtain ⟨has, found, inside, named⟩ := rest
  intro loop looped
  have none := apart.boundaries host member envelope has found inside
  rw [named] at none
  rw [LoopOf, none] at looped
  cases looped

/-- A reservable element is no looping one of a program whose identifiers are unique. -/
theorem reservable_unlooped {program : Program} {element : ElementId} (apart : IdsUnique program)
    (reservable : Reservable program element) :
    ∀ loop, ¬ LoopOf program element loop := by
  rcases reservable with boundary | ⟨found, member, named, bare⟩
  · exact boundaryOf_unlooped apart boundary
  · intro loop looped
    have some := Laws.IL.element?_isSome member
    rw [named] at some
    obtain ⟨located, finds⟩ := Option.isSome_iff_exists.mp some
    have same := Laws.State.nodup_map_eq apart.headers (Laws.IL.element?_mem finds) member
      ((Laws.IL.element?_header finds).trans named.symm)
    rw [same] at finds
    simp [LoopOf, finds, bare] at looped

end Kernel.Proofs.MultiInstance
