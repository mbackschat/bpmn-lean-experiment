module

public import Kernel.Laws.Flow.Rules

/-! # Laws of flow: the witnesses

The non-vacuity witnesses of `Kernel.Laws.Flow.Rules` for splits, joins, reach and Link Events: values that satisfy
each rule and, where the rule could otherwise hold of everything, values that violate it. They read the rules alone, so
they stay outside `Kernel.Feature.Flow`'s rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Flow

open Kernel

/-! ## Non-vacuity

A gateway `J` with incoming flows `a` (from `A`) and `b` (from `B`) and outgoing `out`; `B` is fed by `c` from `C`. -/

def flowA : FlowId := ⟨"a"⟩
def flowB : FlowId := ⟨"b"⟩
def flowC : FlowId := ⟨"c"⟩
def flowOut : FlowId := ⟨"out"⟩
def joinGateway : ElementId := ⟨"J"⟩

def edgeA : Flow := { id := flowA, source := ⟨"A"⟩, target := joinGateway }
def edgeB : Flow := { id := flowB, source := ⟨"B"⟩, target := joinGateway }
def edgeC : Flow := { id := flowC, source := ⟨"C"⟩, target := ⟨"B"⟩ }
def edgeOut : Flow := { id := flowOut, source := joinGateway, target := ⟨"D"⟩ }
def diagram : List Flow := [edgeA, edgeB, edgeC, edgeOut]

def root : ScopeOccurrenceId := ⟨[]⟩

/-- The occurrence keys of the witnesses: three of `J` and one of `C`, all in the root. -/
@[simp] def joinedFirst : OccurrenceId := { scope := root, element := joinGateway, ordinal := 0 }
@[simp] def joinedSecond : OccurrenceId := { scope := root, element := joinGateway, ordinal := 1 }
@[simp] def joinedThird : OccurrenceId := { scope := root, element := joinGateway, ordinal := 2 }
@[simp] def keyC : OccurrenceId := { scope := root, element := ⟨"C"⟩, ordinal := 0 }

def arrivedA : Parked := { occurrence := joinedFirst, flow := flowA, scope := root }
def arrivedB : Parked := { occurrence := joinedSecond, flow := flowB, scope := root }
def againA : Parked := { occurrence := joinedThird, flow := flowA, scope := root }

/-- `true` for `a` only. -/
def onlyA (flow : FlowId) : Bool := flow == flowA

theorem first_true_taken : ExclusiveTakes [flowB, flowA, flowC] none onlyA [flowB, flowA] (some [flowA]) :=
  .inl ⟨[flowB], flowA, [flowC], rfl, by simp [onlyA, flowA, flowB], by simp [onlyA], rfl, rfl⟩

theorem later_true_rejected : ¬ ExclusiveTakes [flowA, flowB] none (fun _ => true) [flowA, flowB] (some [flowB]) := by
  rintro (⟨earlier, chosen, later, facts⟩ | ⟨_, _, fallback⟩)
  · obtain ⟨_, before, rest⟩ := facts
    obtain ⟨_, evaluated, _⟩ := rest
    cases earlier with
    | nil => simp at evaluated
    | cons head tail => exact absurd (before head (by simp)) (by simp)
  · obtain ⟨_, none, _⟩ := fallback
    simp at none

theorem default_taken : ExclusiveTakes [flowA] (some flowC) (fun _ => false) [flowA] (some [flowC]) :=
  .inr ⟨by simp, rfl, flowC, rfl, rfl⟩

theorem no_default_rolls_back : ExclusiveTakes [flowA] none (fun _ => false) [flowA] none :=
  ⟨by simp, rfl, rfl⟩

theorem every_true_taken :
    InclusiveTakes [flowA, flowB] (some flowC) [flowA, flowB, flowC] (fun flow => flow != flowC) (some [flowB, flowA]) := by
  have chosen : [flowA, flowB].filter (fun flow => flow != flowC) = [flowA, flowB] := by
    simp [flowA, flowB, flowC]
  exact .inr (.inl ⟨by simp [chosen], by rw [chosen]; exact List.Perm.swap _ _ []⟩)

theorem default_beside_true_rejected :
    ¬ InclusiveTakes [flowA, flowB] (some flowC) [flowA, flowB, flowC] onlyA (some [flowC]) := by
  have chosen : [flowA, flowB].filter onlyA = [flowA] := by simp [onlyA, flowA, flowB]
  rintro (⟨empty, _⟩ | ⟨_, taken⟩ | ⟨none, _⟩)
  · simp at empty
  · rw [chosen] at taken
    simpa [flowA, flowC] using taken.mem_iff.mp (List.mem_singleton_self flowC)
  · simp [chosen] at none

theorem pure_join_takes_all : InclusiveTakes [] none [flowOut] onlyA (some [flowOut]) :=
  .inl ⟨rfl, rfl, List.Perm.refl _⟩

theorem own_default_when_none : OwnTakes [flowA, flowB] (some flowB) (fun _ => false) (some [flowB]) :=
  .inr (.inr ⟨by simp, flowB, rfl, by simp, rfl⟩)

theorem own_rollback : OwnTakes [flowA] none (fun _ => false) none :=
  ⟨by simp, by simp, rfl⟩

theorem own_sink : OwnTakes [] none onlyA (some []) := .inl ⟨rfl, rfl⟩

theorem fork_all : ForkTakes [flowA, flowB] [flowB, flowA] := List.Perm.swap _ _ []

theorem parallel_fires :
    ParallelFires [flowA, flowB] root [arrivedA, againA, arrivedB] [againA] [arrivedA, arrivedB] where
  ready := by simp [ParallelReady, Filled, arrivedA, arrivedB, againA]
  consumes := {
    kept := List.Perm.cons _ (List.Perm.swap _ _ [])
    inScope := by simp [arrivedA, arrivedB]
    onIncoming := by simp [arrivedA, arrivedB]
    oneEach := by simp [arrivedA, arrivedB, flowA, flowB]
    everyFilled := by simp [arrivedA, arrivedB] }

/-- One flow's arrivals twice over are no Parallel join: provenance, not count. -/
theorem count_without_provenance_rejected : ¬ ParallelReady [flowA, flowB] [arrivedA, againA] root := by
  intro ready
  obtain ⟨arrival, member, _, flow⟩ := ready flowB (by simp)
  simp only [List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [arrivedA, againA, flowA, flowB] at flow

/-- Consuming the excess arrival too consumes more than one per flow. -/
theorem excess_consumed_rejected :
    ¬ Consumes [flowA, flowB] root [arrivedA, againA, arrivedB] [] [arrivedA, againA, arrivedB] := fun consumes => by
  have := consumes.oneEach
  simp [arrivedA, againA, arrivedB] at this

theorem leaves_once : LeavesOnce [arrivedA, arrivedB] [flowOut] [(joinedSecond, []), (joinedFirst, [flowOut])] :=
  ⟨joinedFirst, [joinedSecond], List.Perm.refl _, List.Perm.swap _ _ []⟩

/-- Both joined occurrences leaving on the outgoing flow is two leavings, not one. -/
theorem both_leave_rejected :
    ¬ LeavesOnce [arrivedA, arrivedB] [flowOut] [(joinedFirst, [flowOut]), (joinedSecond, [flowOut])] := by
  rintro ⟨winner, others, _, leaving⟩
  have first := leaving.mem_iff.mp (List.mem_cons_self (a := (joinedFirst, [flowOut])))
  have second := leaving.mem_iff.mp (List.mem_cons_of_mem _ (List.mem_singleton_self (joinedSecond, [flowOut])))
  simp at first second
  cases first
  simp at second

def atJoin : Occurrence := { id := joinedFirst, element := joinGateway, scope := root, activation := 1 }
def atC : Occurrence := { id := keyC, element := ⟨"C"⟩, scope := root, activation := 1 }

/-- `A` arrived; `C` still works upstream of `b`, so the Inclusive join waits. -/
def waitingAtC : State :=
  { instanceId := "p", scopes := [{ id := root, element := none }], occurrences := [atJoin, atC],
    slots := { parked := [arrivedA] } }

/-- `C` is gone: nothing can reach `b` any more, so the join is ready without an arrival on `b`. -/
def doneAtC : State := { waitingAtC with occurrences := [atJoin] }

theorem c_reaches_b : CanReach diagram (fun _ _ => False) waitingAtC joinGateway root flowB :=
  .inr ⟨⟨"C"⟩, flowC, ⟨by simp [joinGateway], .inl ⟨atC, by simp [waitingAtC], rfl, rfl, rfl⟩⟩,
    .inl ⟨edgeC, by simp [diagram], rfl, rfl⟩,
    .step edgeC flowB flowB (by simp [diagram]) (by simp [edgeC, joinGateway])
      (.inl ⟨edgeB, by simp [diagram], rfl, rfl⟩) (.here _)⟩

theorem upstream_blocks : ¬ InclusiveReady diagram (fun _ _ => False) [flowA, flowB] waitingAtC joinGateway root := by
  rintro ⟨_, quiet⟩
  refine quiet flowB (by simp) ?_ c_reaches_b
  rintro ⟨arrival, member, _, flow⟩
  simp only [waitingAtC, List.mem_singleton] at member
  subst member
  simp [arrivedA, flowA, flowB] at flow

/-- The parked arrival at `J` is no position, and `J`'s own outgoing flow passes `J`, so nothing blocks the join. -/
theorem nothing_upstream_ready : InclusiveReady diagram (fun _ _ => False) [flowA, flowB] doneAtC joinGateway root := by
  refine ⟨⟨flowA, by simp, arrivedA, by simp [doneAtC, waitingAtC], rfl, rfl⟩, ?_⟩
  intro flow _ _ reach
  rcases reach with ⟨_, token, _⟩ | ⟨element, _, position⟩
  · simp [doneAtC, waitingAtC] at token
  obtain ⟨⟨other, holds⟩, _, _⟩ := position
  rcases holds with ⟨occurrence, member, facts⟩ | ⟨child, member, parent, _⟩ | ⟨_, token, _⟩
  · obtain ⟨_, _, same⟩ := facts
    simp only [doneAtC, List.mem_singleton] at member
    subst member
    exact other same.symm
  · simp only [doneAtC, waitingAtC, List.mem_singleton] at member
    subst member
    simp [root] at parent
  · simp [doneAtC, waitingAtC] at token

/-! ## Link Events -/

theorem no_link_held : LinkPassesThrough (· == ⟨"L"⟩) waitingAtC := by
  intro occurrence member
  simp only [waitingAtC, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [atJoin, atC, joinGateway]

/-- A state still holding the occurrence of an unpublished element breaks the rule. -/
theorem held_link_rejected : ¬ LinkPassesThrough (· == ⟨"C"⟩) waitingAtC := fun passes => by
  have := passes atC (by simp [waitingAtC])
  simp [atC] at this

end Kernel.Laws.Flow
