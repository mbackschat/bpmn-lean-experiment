module

public import Kernel.Laws.MultiInstance.Rules

/-! # Proofs: what a reservation may name

A reservation is an occurrence under the element role (`State.reserve`), so the numbering lane needs every reservation
the features make to name no looping element: one of a looping element in an instance's scope occurrence would be no
instance (`Laws.MultiInstance.InstancesPlaced`). This module states where a reservation's element comes from, for the
frame and phase records that carry a property beside `WellFormed` to require it, and what that gives under a program
whose boundaries name no element (`Laws.MultiInstance.BoundariesApart`). It imports no proof module, so the cancellation
lane's records can name it. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed)
open Kernel.Laws.MultiInstance (LoopOf BoundariesApart OccurPending)

/-- `element` is the identifier of a boundary of one of `program`'s elements. -/
def BoundaryOf (program : Program) (element : ElementId) : Prop :=
  ∃ host ∈ program.elements, ∃ envelope, host.envelope? = some envelope ∧
    ∃ boundary ∈ envelope.boundaries, boundary.id = element

/-- What a subscription may reserve: a boundary, or an element the program finds without an envelope, an Event or a
start. -/
def Reservable (program : Program) (element : ElementId) : Prop :=
  BoundaryOf program element ∨ (program.element? element).bind (·.envelope?) = none

/-- `element` is a reservation still to be made in a state that keeps `rel`: where a queued `Signal.occur`, a queued
compensation's resume or a held compensation run's resume came from once the closure has taken it. -/
def PendingIn (rel : State → Prop) (element : ElementId) : Prop :=
  ∃ held, rel held ∧ OccurPending held element

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

/-- A boundary's identifier names no looping element of a program whose boundaries name no element. -/
theorem BoundaryOf.unlooped {program : Program} {element : ElementId} (apart : BoundariesApart program)
    (boundary : BoundaryOf program element) : ∀ loop, ¬ LoopOf program element loop := by
  obtain ⟨host, member, envelope, rest⟩ := boundary
  obtain ⟨has, found, inside, named⟩ := rest
  intro loop looped
  have none := apart host member envelope has found inside
  rw [named] at none
  rw [LoopOf, none] at looped
  cases looped

/-- A reservable element is no looping one of a program whose boundaries name no element. -/
theorem Reservable.unlooped {program : Program} {element : ElementId} (apart : BoundariesApart program)
    (reservable : Reservable program element) : ∀ loop, ¬ LoopOf program element loop := by
  rcases reservable with boundary | bare
  · exact boundary.unlooped apart
  · intro loop looped
    rw [LoopOf, bare] at looped
    cases looped

end Kernel.Proofs.MultiInstance
