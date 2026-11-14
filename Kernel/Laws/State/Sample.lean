module

public import Kernel.Laws.State

/-! # Laws of the kernel state: the sample's witnesses that read `State.root` or the program

That the sample instance of `Kernel.Laws.State.Invariant` is well-formed, the witnesses of `ReservationsUnstarted`
and `Rooted` that read its process instance or `State.root` (`Laws.State.root_eq`), and those of the clauses on what an
item or a queued begin holds: `Typed`, which reads the program, `AttachedReserved` and `InnerPlaced`. It reads no body.
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- The sample's scope occurrences read the instance `p`. -/
private theorem sample_instance (kind : OpenKind) :
    (sample kind).instanceOf processRoot = "p" ∧ (sample kind).instanceOf subScope = "p" := by
  have nodup : (scopeIds (sample kind)).Nodup := by simp [scopeIds, sample, rootScope, childScope, processRoot, subScope]
  have parentless : ∀ entry ∈ (sample kind).scopes, entry.parent = none → entry.id = State.root := by
    simp [sample, rootScope, childScope, processRoot, root_eq]
  have root : InstanceIn (sample kind) processRoot (sample kind).instanceId [rootScope] :=
    .root rootScope (by simp [sample]) rfl rfl
  have sub : InstanceIn (sample kind) subScope (sample kind).instanceId [childScope, rootScope] :=
    .up childScope processRoot _ [rootScope] (by simp [sample]) rfl rfl root
  exact ⟨instanceOf_eq nodup parentless root (by simp), instanceOf_eq nodup parentless sub
    (by simp [rootScope, childScope, processRoot, subScope])⟩

/-- The sample instance is well-formed under a program that declares neither of its waiting elements a start Event. -/
theorem sample_wellFormed (kind : OpenKind) {program : Program}
    (unstarted : ∀ item ∈ (sample kind).openItems, ((program.element? item.element).bind (·.start?)).isSome = false) :
    WellFormed program (sample kind) where
  issued := ⟨by simp [sample, subProcess, innerTask, outerTask], by simp [sample, innerItem, outerItem],
    by simp [sample, rootScope, childScope, processRoot, subScope]⟩
  distinct := ⟨by simp [occurrenceIds, sample, subProcess, innerTask, outerTask], by simp [sample, innerItem, outerItem],
    by simp [scopeIds, sample, rootScope, childScope, processRoot, subScope],
    by simp [key, sample, subProcess, innerTask, outerTask]⟩
  startedOnce := by simp [StartedOnce, starts, sample]
  activations := ⟨by simp [sample], by simp [sample]⟩
  reservations := by simp [ReservationsUnstarted, sample, subProcess, innerTask, outerTask]
  owned := {
    occurrenceScopes := by simp [sample, scopeIds, subProcess, innerTask, outerTask, rootScope, childScope]
    itemScopes := by simp [sample, scopeIds, innerItem, outerItem, rootScope, childScope]
    itemOccurrences := by simp [sample, innerItem, outerItem, subProcess, innerTask, outerTask]
    attachments := by simp [sample, innerItem, outerItem]
    scopeOwners := by simp [sample, rootScope, childScope, subProcess, innerTask, outerTask]
    variableScopes := by simp [sample, scopeIds, rootScope, childScope]
    tokenScopes := by simp [sample] }
  rooted := ⟨by simp [scopeIds, sample, rootScope, processRoot, root_eq],
    by simp [sample, rootScope, childScope, processRoot, subScope, root_eq], by
      simp only [sample, List.mem_cons, List.not_mem_nil, or_false]
      rintro scope (rfl | rfl) <;> rw [root_eq]
      · exact .refl _
      · exact sub_within⟩
  variables := ⟨by simp [sample, processRoot, subScope], by simp [sample]⟩
  failure := by simp [FailureRecorded, sample]
  queue := ⟨by simp [sample], by simp [sample], by simp [sample], by simp [sample]⟩
  counted := by simp [StartsCounted, starts, sample]
  occurrencesCounted := by
    obtain ⟨root, sub⟩ := sample_instance kind
    intro occurrence member
    simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
    rcases member with rfl | rfl | rfl <;> simp only [Counted, key, subProcess, innerTask, outerTask, root, sub] <;>
      simp [sample]
  ownedBelow := by
    simp only [OwnedBelow, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro scope (rfl | rfl) occurrence (rfl | rfl | rfl) owner <;>
      simp_all [rootScope, childScope, subProcess, innerTask, outerTask]
  claimed := ⟨by simp [sample, innerItem, outerItem], by simp [Queued, sample], by simp [Precedes, sample],
    by simp [Precedes, sample], by simp [sample], by simp [Queued, sample], by simp [Queued, sample],
    by simp [Queued, sample]⟩
  settled := ⟨by simp [sample], by simp [sample], by simp [sample], by simp [sample], by simp [sample],
    by simp [sample], by simp [sample]⟩
  attachedReserved := by simp [AttachedReserved, sample, innerItem, outerItem]
  typed := fun item member started => by simp [unstarted item member] at started

/-- A start fact carrying the armed reservation's key breaks `ReservationsUnstarted`. -/
theorem early_start_rejected (kind : OpenKind) :
    ¬ ReservationsUnstarted { armedState kind with draft := { started := [startFact reservation] } } := fun unstarted => by
  have := unstarted reservation (by simp [armedState]) rfl (startFact reservation) (by simp [starts])
  simp [key, startFact, reservation] at this
  have same : ∀ t : State, t.scopes = (sample kind).scopes → t.instanceId = (sample kind).instanceId →
      t.instanceOf processRoot = "p" := fun _ scopes named => (instanceOf_congr scopes named processRoot).trans (sample_instance kind).1
  exact this (same { armedState kind with draft := { started := [startFact reservation] } } rfl rfl).symm

/-- A second parentless scope breaks `Rooted`. -/
theorem forest_rejected (kind : OpenKind) :
    ¬ Rooted { sample kind with scopes := [rootScope, { childScope with parent := none }] } := by
  rintro ⟨_, parentless, _⟩
  have second := (parentless { childScope with parent := none } (by simp)).mp rfl
  simp [childScope, subScope, root_eq] at second

/-- A lone parentless scope occurrence other than `State.root` breaks `Rooted`. -/
theorem foreign_root_rejected (kind : OpenKind) : ¬ Rooted { sample kind with scopes := [{ rootScope with id := ⟨7⟩ }] } := by
  rintro ⟨present, _, _⟩
  simp [scopeIds, root_eq] at present

/-- An item of `Outer` holding the reservation 7, for a program that declares `Outer` a start Event, as an Event
Sub-Process's is, and `Inner` none. -/
def startItem (kind : OpenKind) : OpenItem :=
  { id := 8, kind, element := ⟨"Outer"⟩, scope := processRoot, occurrence := 7, passive := true }

theorem start_item_typed (kind : OpenKind) {program : Program}
    (inner : ((program.element? ⟨"Inner"⟩).bind (·.start?)).isSome = false) :
    Typed program { armedState kind with openItems := [innerItem kind, startItem kind] } := by
  intro item member started
  simp only [List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl
  · simp [innerItem, inner] at started
  · refine ⟨fun occurrence present named => ?_, fun other inside same => ?_⟩
    · simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at present
      rcases present with rfl | rfl | rfl | rfl <;> simp_all [subProcess, innerTask, outerTask, reservation, startItem]
    · simp only [List.mem_cons, List.not_mem_nil, or_false] at inside
      rcases inside with rfl | rfl <;> simp_all [innerItem, startItem]

/-- Under such a program, the item of `Outer` waiting for the begun occurrence 5 breaks `Typed`: its firing would begin
5 again; so do two items of `Outer` holding the reservation 7, since the firing of one would leave the other waiting on
a begun occurrence. -/
theorem begun_start_rejected (kind : OpenKind) {program : Program}
    (outer : ((program.element? ⟨"Outer"⟩).bind (·.start?)).isSome = true) : ¬ Typed program (sample kind) :=
  fun typed => by
    have := (typed (outerItem kind) (by simp [sample]) (by simpa [outerItem] using outer)).1 outerTask
      (by simp [sample]) rfl
    simp [outerTask] at this

theorem shared_start_rejected (kind : OpenKind) {program : Program}
    (outer : ((program.element? ⟨"Outer"⟩).bind (·.start?)).isSome = true) :
    ¬ Typed program { armedState kind with openItems := [startItem kind, { startItem kind with id := 9 }] } :=
  fun typed => by
    have := (typed (startItem kind) (by simp) (by simpa [startItem] using outer)).2 { startItem kind with id := 9 }
      (by simp) rfl
    simp [startItem] at this

/-- An item attached to the root's task 5 holding the reservation 7 is reserved; one waiting for the begun occurrence 5
itself breaks `AttachedReserved`. -/
theorem attached_reserved (kind : OpenKind) :
    AttachedReserved { armedState kind with openItems := [{ startItem kind with attachedTo := some 5 }] } := by
  intro item member _ occurrence present named
  simp only [List.mem_singleton] at member
  subst member
  simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at present
  rcases present with rfl | rfl | rfl | rfl <;> simp_all [subProcess, innerTask, outerTask, reservation, startItem]

theorem attached_begun_rejected (kind : OpenKind) :
    ¬ AttachedReserved { sample kind with openItems := [{ outerItem kind with attachedTo := some 1 }] } :=
  fun reserved => by
    have := reserved { outerItem kind with attachedTo := some 1 } (by simp) rfl outerTask (by simp [sample]) rfl
    simp [outerTask] at this

/-- A queued Event Sub-Process begin in the root holding the root's reservation 7 places it; one in the Sub-Process's
scope occurrence does not. -/
theorem inner_placed (kind : OpenKind) :
    InnerPlaced (armedState kind) { element := ⟨"Esp"⟩, scope := processRoot, inner := some 7 } := by
  intro id named occurrence member same
  simp only [Option.toList_some, List.mem_singleton] at named
  subst named
  simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl | rfl <;> simp_all [subProcess, innerTask, outerTask, reservation]

theorem misplaced_inner_rejected (kind : OpenKind) :
    ¬ InnerPlaced (armedState kind) { element := ⟨"Esp"⟩, scope := subScope, inner := some 7 } := fun placed => by
  have := placed 7 (by simp) reservation (by simp [armedState]) rfl
  simp [reservation, processRoot, subScope] at this

end Kernel.Laws.State
