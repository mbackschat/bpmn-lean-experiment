module

public import Kernel.Laws.MultiInstance.Rules

/-! # Proofs: what a reservation may name

A reservation is an occurrence under the element role (`State.reserve`), so the numbering lane needs every reservation
the features make to name no looping element: one of a looping element in an instance's scope occurrence would be no
instance (`Laws.MultiInstance.InstancesPlaced`). The frame records require every reservation's element to be a
boundary's, a reservable one or one pending in a state that kept the property (`Kernel.Proofs.Frame.OccursAlongside`:
`Laws.IL.BoundaryOf`, `Laws.IL.Reservable`, `Laws.Step.PendingIn`); this module states what that gives under a program
whose identifiers are unique (`Laws.MultiInstance.IdsUnique`). It imports no proof module. Nothing executable imports
this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed)
open Kernel.Laws.IL (BoundaryOf Reservable)
open Kernel.Laws.MultiInstance (LoopOf IdsUnique)
open Kernel.Laws.Step (OccurPending PendingIn)

/-- A reservation pending in a state that kept `rel` names no looping element when no state that keeps `rel` leaves
one of a looping element pending. -/
theorem PendingIn.unlooped {rel : State → Prop} {program : Program} {element : ElementId}
    (occurs : ∀ s, rel s → ∀ element, OccurPending s element → ∀ loop, ¬ LoopOf program element loop)
    (pending : PendingIn rel element) : ∀ loop, ¬ LoopOf program element loop :=
  have ⟨held, kept, named⟩ := pending
  occurs held kept element named

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
