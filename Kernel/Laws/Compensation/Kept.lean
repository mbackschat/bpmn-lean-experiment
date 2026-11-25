module

public import Kernel.Laws.Compensation.Rules
public import Kernel.Feature.Compensation.Kept
import all Kernel.Feature.Compensation.Kept

/-! # Laws of compensation: the records a completed Sub-Process keeps

What `Kernel.Feature.Compensation.Kept` does, read from its bodies: a completed Sub-Process's record keeps the records
retained in it flat, each under its group key (`keptRecords`), with the completion numbers and elements they held; and
its begin hands them back as records in the begun context (`begunChildren`), naming only the holder's elements and
holding no completion number more often than the holder kept it, so no begin gains a record. `Kernel.Laws.Compensation`
states the hooks over these. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Compensation

open Kernel

theorem keptRecords_completions (record : Compensable) :
    (Feature.Compensation.keptRecords record).map (·.completion) = heldCompletions record := by
  simp [Feature.Compensation.keptRecords, heldCompletions, Function.comp_def]

theorem keptRecords_elements (record : Compensable) :
    (Feature.Compensation.keptRecords record).flatMap childElements = recordElements record := by
  simp only [Feature.Compensation.keptRecords, recordElements, List.flatMap_cons, List.flatMap_map]
  rfl

theorem count_partition {α : Type} (p : α → Bool) (f : α → Nat) (l : List α) (n : Nat) :
    ((l.filter p).map f).count n + ((l.filter (fun x => !p x)).map f).count n = (l.map f).count n := by
  rw [← List.count_append, ← List.map_append]
  exact ((List.filter_append_perm p l).map f).count_eq n

theorem releaseKept_count (context : ScopeOccurrenceId) (n : Nat) :
    ∀ (direct below : List CompensableChild),
      ((Feature.Compensation.releaseKept context direct below).flatMap heldCompletions).count n ≤
        (direct.map (·.completion)).count n + (below.map (·.completion)).count n
  | [], below => by simp [Feature.Compensation.releaseKept]
  | child :: direct, below => by
    have rest := releaseKept_count context n direct
      (below.filter fun record => !(record.group.head? == some child.completion))
    have split := count_partition (fun record : CompensableChild => record.group.head? == some child.completion)
      (·.completion) below n
    simp only [Feature.Compensation.releaseKept, List.partition_eq_filter_filter, List.flatMap_cons, heldCompletions,
      List.count_append, List.count_cons, List.map_cons, List.map_map, Function.comp_def] at rest split ⊢
    omega

theorem releaseKept_scope (context : ScopeOccurrenceId) :
    ∀ (direct below : List CompensableChild), ∀ record ∈ Feature.Compensation.releaseKept context direct below,
      record.scope = context
  | [], _, record, member => by simp [Feature.Compensation.releaseKept] at member
  | child :: direct, below, record, member => by
    simp only [Feature.Compensation.releaseKept, List.partition_eq_filter_filter, List.mem_cons] at member
    rcases member with rfl | later
    · rfl
    · exact releaseKept_scope context direct _ record later

theorem releaseKept_elements (context : ScopeOccurrenceId) :
    ∀ (direct below : List CompensableChild), ∀ record ∈ Feature.Compensation.releaseKept context direct below,
      ∀ element ∈ recordElements record, element ∈ direct.flatMap childElements ∨ element ∈ below.flatMap childElements
  | [], _, record, member, _, _ => by simp [Feature.Compensation.releaseKept] at member
  | child :: direct, below, record, member, element, named => by
    simp only [Feature.Compensation.releaseKept, List.partition_eq_filter_filter, List.mem_cons] at member
    rcases member with rfl | later
    · rw [recordElements] at named
      rcases List.mem_cons.mp named with here | rest
      · exact .inl (List.mem_flatMap.mpr ⟨child, List.mem_cons_self .., by rw [here]; exact List.mem_cons_self ..⟩)
      rcases List.mem_append.mp rest with handler | deeper
      · exact .inl (List.mem_flatMap.mpr ⟨child, List.mem_cons_self .., List.mem_cons_of_mem _ handler⟩)
      obtain ⟨kept, mapped, at_⟩ := List.mem_flatMap.mp deeper
      obtain ⟨original, inside, rfl⟩ := List.mem_map.mp mapped
      exact .inr (List.mem_flatMap.mpr ⟨original, (List.mem_filter.mp inside).1, at_⟩)
    · rcases releaseKept_elements context direct _ record later element named with first | second
      · exact .inl (List.mem_append_right _ first)
      · obtain ⟨original, inside, at_⟩ := List.mem_flatMap.mp second
        exact .inr (List.mem_flatMap.mpr ⟨original, (List.mem_filter.mp inside).1, at_⟩)

theorem begunChildren_eq (record : Compensable) (context : ScopeOccurrenceId) :
    Feature.Compensation.begunChildren record context = Feature.Compensation.releaseKept context
      (record.children.filter (·.group.isEmpty)) (record.children.filter fun child => !child.group.isEmpty) := by
  simp only [Feature.Compensation.begunChildren, List.partition_eq_filter_filter]
  rfl

/-- What a begun record's children hold: each lies in `context`, names only elements of `record`, and holds no
completion number more often than `record` keeps it. -/
theorem begunChildren_scope (record : Compensable) (context : ScopeOccurrenceId) :
    ∀ child ∈ Feature.Compensation.begunChildren record context, child.scope = context := by
  rw [begunChildren_eq]
  exact releaseKept_scope context _ _

theorem begunChildren_elements (record : Compensable) (context : ScopeOccurrenceId) :
    ∀ child ∈ Feature.Compensation.begunChildren record context, ∀ element ∈ recordElements child,
      element ∈ recordElements record := by
  intro child member element named
  rw [begunChildren_eq] at member
  have kept : ∀ kept ∈ record.children, ∀ element ∈ childElements kept, element ∈ recordElements record :=
    fun _ inside _ at_ => recordElements_child inside at_
  rcases releaseKept_elements context _ _ child member element named with first | second <;>
  · obtain ⟨original, inside, at_⟩ := List.mem_flatMap.mp (by assumption)
    exact kept original (List.mem_filter.mp inside).1 element at_

theorem begunChildren_count (record : Compensable) (context : ScopeOccurrenceId) (n : Nat) :
    ((Feature.Compensation.begunChildren record context).flatMap heldCompletions).count n ≤
      (record.children.map (·.completion)).count n := by
  have bound := releaseKept_count context n (record.children.filter (·.group.isEmpty))
    (record.children.filter fun child => !child.group.isEmpty)
  have split := count_partition (·.group.isEmpty) (·.completion) record.children n
  rw [begunChildren_eq]
  omega

end Kernel.Laws.Compensation
