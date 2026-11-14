module

public import Kernel.Laws.State

/-! # Laws of the kernel state: the sample's witnesses that read `State.root`

That the sample instance of `Kernel.Laws.State.Invariant` is well-formed, and the witnesses of `ReservationsUnstarted`
and `Rooted` that read its process instance or `State.root` (`Laws.State.root_eq`). It reads no body. Nothing
executable imports this module.
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

/-- The sample instance is well-formed. -/
theorem sample_wellFormed (kind : OpenKind) : WellFormed (sample kind) where
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
    by simp [Precedes, sample], by simp [sample], by simp [Queued, sample], by simp [Queued, sample]⟩
  settled := ⟨by simp [sample], by simp [sample], by simp [sample], by simp [sample]⟩

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

end Kernel.Laws.State
