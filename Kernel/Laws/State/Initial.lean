module

public import Kernel.Laws.State.Derived
public import Kernel.Laws.State.Committed

/-! # Laws of the kernel state: the fresh instance

That a start's fresh instance (`State.initial`) is well-formed and holds no occurrence, queued work or body, read by
`Kernel.Laws.State.Keeps` and the lanes' initial states. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

open Kernel

/-! ## The fresh instance -/

/-- A fresh instance's variables are keyed, whatever bindings the start supplied (#147). -/
theorem initial_variablesKeyed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    VariablesKeyed (State.initial instanceId variables businessKey) where
  scopes := by simp [initial_eq]
  names := by
    intro vars member
    simp only [initial_eq, List.mem_singleton] at member
    subst member
    exact keyed_names variables

/-- The fresh instance's one key, the root, is a history. -/
private theorem initial_historic (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    Historic (State.initial instanceId variables businessKey) :=
  historic_of_standing (by simp [initial_eq, root_eq]) (by simp [initial_eq, root_eq]) (by simp [initial_eq, root_eq])
    (by simp [initial_eq, root_eq, Layered])

section Initial

/- The fresh instance queues nothing under a unit key, so its queue views are its batches. -/
attribute [local simp] allSignals allQueuedTokens

/-- A start's fresh instance is committed: it has no transition and an empty issue table, so a run's every before-state
is committed (`Laws.Step.orderJournal_committed` for every other). -/
theorem initial_committed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    Committed (State.initial instanceId variables businessKey) :=
  ⟨by simp [initial_eq], by simp [initial_eq], by simp [initial_eq]⟩

/-- A start's fresh instance; `Kernel.Proofs.Step` queues its root's arming (`signal_queueSound`). -/
theorem initial_wellFormed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    WellFormed program (State.initial instanceId variables businessKey) where
  issued := ⟨by simp [initial_eq], by simp [initial_eq, itemList_empty],
    fun _ member => (initial_historic instanceId variables businessKey).issued member⟩
  distinct := ⟨by simp [occurrenceIds, initial_eq], by simp [initial_eq, keyedBy_empty],
    by simp [scopeIds, initial_eq], by simp [initial_eq]⟩
  startedOnce := by simp [StartedOnce, starts, initial_eq]
  activations := ⟨by simp [initial_eq], by simp [initial_eq]⟩
  reservations := by simp [ReservationsUnstarted, initial_eq]
  owned := ⟨by simp [initial_eq], by simp [initial_eq, itemList_empty], by simp [initial_eq, itemList_empty], by simp [initial_eq, itemList_empty],
    by simp [initial_eq], by simp [scopeIds, initial_eq], by simp [initial_eq]⟩
  rooted := ⟨by simp [scopeIds, initial_eq], by simp [initial_eq, root_eq], by
    simp only [initial_eq, List.mem_singleton]; rintro scope rfl; exact .refl _⟩
  variables := ⟨by simp [initial_eq], fun vars member => by
    simp only [initial_eq, List.mem_singleton] at member
    subst member
    exact keyed_names variables⟩
  failure := by simp [FailureRecorded, initial_eq]
  issuer := ⟨fun _ _ held => by simp [initial_eq] at held, fun _ _ held => by simp [initial_eq] at held,
    fun _ _ _ held => by simp [initial_eq] at held⟩
  queue := ⟨by simp [initial_eq], by simp [initial_eq], by simp [initial_eq], by simp [initial_eq],
    by simp [initial_eq]⟩
  counted := by simp [StartsCounted, starts, initial_eq]
  occurrencesCounted := by simp [OccurrencesCounted, initial_eq]
  ownedBelow := by simp [OwnedBelow, initial_eq]
  claimed := ⟨by simp [initial_eq, itemList_empty], by simp [Queued, initial_eq], by simp [Precedes, initial_eq],
    by simp [Precedes, initial_eq], by simp [initial_eq], by simp [Queued, initial_eq],
    by simp [Queued, initial_eq], by simp [Queued, initial_eq]⟩
  settled := ⟨by simp [initial_eq], by simp [initial_eq], by simp [initial_eq], by simp [initial_eq],
    by simp [initial_eq], by simp [initial_eq], by simp [initial_eq], by simp [initial_eq]⟩
  attachedReserved := by simp [AttachedReserved, initial_eq, itemList_empty]
  typed := by simp [Typed, initial_eq, itemList_empty]
  worked := by simp [Worked, initial_eq, itemList_empty]
  roles := by simp [EventRoles, initial_eq]
  bodyRoles := by simp [BodyRoles, initial_eq]
  itemRoles := by simp [ItemRoles, initial_eq, itemList_empty]
  raises := by simp [RaisesSound, initial_eq]

/-- The fresh instance's root was issued. -/
theorem initial_rootIssued (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    ScopeIssued (State.initial instanceId variables businessKey) State.root :=
  (initial_historic instanceId variables businessKey).issued_key (by simp [initial_eq, root_eq])

/-- The fresh instance runs no Multi-Instance body. -/
theorem initial_bodies (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    (State.initial instanceId variables businessKey).slots.multiInstances = [] := by simp [initial_eq]

/-- The fresh instance holds no occurrence, queued signal or token, and no compensation run. -/
theorem initial_empty (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    let s := State.initial instanceId variables businessKey
    s.occurrences = [] ∧ allSignals s = [] ∧ allQueuedTokens s = [] ∧ s.slots.compensation.runs = [] := by
  simp [initial_eq, allSignals, allQueuedTokens]

end Initial

end Kernel.Laws.State
