module

public import Kernel.Step.Commit
import all Kernel.Step.Commit

/-! # Laws of the step function: commit

What `Kernel.Step.Commit` does, read from its bodies: a micro-step's draft is journalled as the transition of its unit
(`journalDraft_eq`), and a committed closure's journal and outbox are put in run order, every unit-keyed family emptied
(`orderJournal_ok`, `orderJournal_closed`). This is the one module
that sees `Kernel.Step.Commit`'s bodies ([module table](../../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape));
`Kernel.Laws.Step` composes these facts with `Kernel.Step`'s bodies. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- The draft journalled as the transition of the unit `unit`, the draft and the write log emptied. -/
theorem journalDraft_eq {unit : UnitKey} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId}
    {state : State} :
    journalDraft unit cause element owner state = { state with
      transitions := state.transitions.insert unit
        { cause, element, owner, started := state.draft.started, ended := state.draft.ended, ready := state.draft.ready },
      draft := {}, writes := [] } := by
  simp only [journalDraft]

/-- A committed closure: its transitions and intents in run order (`byRun`), every unit-keyed family emptied, so no unit
key outlives its closure (DC4). -/
theorem orderJournal_ok {outcome : Except Failure (State × RunLog)} {after : State} (ran : orderJournal outcome = .ok after) :
    ∃ settled log, outcome = .ok (settled, log) ∧ after = { settled with
      journal := byRun log settled.transitions, outbox := (byRun log settled.outboxes).flatten
      transitions := ∅, outboxes := ∅, queuedTokens := ∅, queuedSignals := ∅ } := by
  cases outcome with
  | error failure => simp [orderJournal, Except.map] at ran
  | ok settled => exact ⟨settled.1, settled.2, rfl, (Except.ok.inj ran).symm⟩

/-- What a settled closure commits, given its settled state and run log. -/
theorem orderJournal_of {state : State} {log : RunLog} {after : State} (made : orderJournal (.ok (state, log)) = .ok after) :
    after = { state with
      journal := byRun log state.transitions, outbox := (byRun log state.outboxes).flatten
      transitions := ∅, outboxes := ∅, queuedTokens := ∅, queuedSignals := ∅ } :=
  (Except.ok.inj made).symm

/-- `byRun` reorders the entries of a unit-keyed family and keeps each of them. -/
theorem byRun_perm {α : Type} (log : RunLog) (entries : TreeMap UnitKey α compare) :
    (byRun log entries).Perm (entries.toList.map (·.2)) := by
  unfold byRun
  refine ((List.mergeSort_perm _ _).map _).trans ?_
  simp [List.map_map, Function.comp_def]

/-- `byRun` lists the entries in the order their units ran: as some ordering of the family's entries in which every
unit comes after each unit that ran at an earlier position. -/
theorem byRun_sorted {α : Type} (log : RunLog) (entries : TreeMap UnitKey α compare) :
    ∃ sorted : List (UnitKey × α), byRun log entries = sorted.map (·.2) ∧ sorted.Perm entries.toList ∧
      sorted.Pairwise fun a b => log.runPosition a.1 ≤ log.runPosition b.1 := by
  let ranBefore : Nat × UnitKey × α → Nat × UnitKey × α → Bool := fun a b =>
    a.1 < b.1 || a.1 == b.1 && compare a.2.1 b.2.1 != .gt
  have trans : ∀ a b c, ranBefore a b = true → ranBefore b c = true → ranBefore a c = true := by
    intro a b c one two
    simp only [ranBefore, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq, bne_iff_ne, ne_eq] at one two ⊢
    rcases one with lower | ⟨same, keys⟩ <;> rcases two with lower' | ⟨same', keys'⟩
    · exact .inl (by omega)
    · exact .inl (by omega)
    · exact .inl (by omega)
    · have isLE : ∀ order : Ordering, ¬ order = .gt → order.isLE := by intro order; cases order <;> decide +kernel
      exact .inr ⟨same.trans same', fun gt => by
        have := Std.TransCmp.isLE_trans (isLE _ keys) (isLE _ keys')
        rw [gt] at this
        cases this⟩
  have total : ∀ a b, (ranBefore a b || ranBefore b a) = true := by
    intro a b
    simp only [ranBefore, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq, bne_iff_ne, ne_eq]
    rcases Nat.lt_trichotomy a.1 b.1 with lower | same | higher
    · exact .inl (.inl lower)
    · by_cases gt : compare a.2.1 b.2.1 = .gt
      · exact .inr (.inr ⟨same.symm, fun gt' => by
          have swapped := Std.OrientedCmp.lt_of_gt gt
          rw [gt'] at swapped
          cases swapped⟩)
      · exact .inl (.inr ⟨same, gt⟩)
    · exact .inr (.inl higher)
  let tagged := entries.toList.map fun (unit, value) => (log.runPosition unit, unit, value)
  refine ⟨(tagged.mergeSort ranBefore).map (·.2), ?_, ?_, ?_⟩
  · simp [byRun, tagged, ranBefore, List.map_map, Function.comp_def]
  · refine ((List.mergeSort_perm _ _).map _).trans ?_
    simp [tagged, List.map_map, Function.comp_def]
  · have sorted := List.pairwise_mergeSort trans total tagged
    have tags : ∀ x ∈ tagged.mergeSort ranBefore, x.1 = log.runPosition x.2.1 := by
      intro x inside
      obtain ⟨⟨unit, value⟩, _, rfl⟩ := List.mem_map.mp ((List.mergeSort_perm _ _).subset inside)
      rfl
    refine List.pairwise_map.mpr (sorted.imp_of_mem fun {a b} aIn bIn ordered => ?_)
    rw [← tags a aIn, ← tags b bIn]
    simp only [ranBefore, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq] at ordered
    rcases ordered with lower | ⟨same, _⟩
    · exact Nat.le_of_lt lower
    · exact Nat.le_of_eq same

/-- A committed closure's journal holds its transitions' end facts, in the order its units ran. -/
theorem orderJournal_ended {outcome : Except Failure (State × RunLog)} {after : State} (ran : orderJournal outcome = .ok after) :
    ∃ settled, outcome = .ok settled ∧
      (after.journal.flatMap (·.ended)).Perm ((settled.1.transitions.toList.map (·.2)).flatMap (·.ended)) := by
  obtain ⟨settled, log, same, made⟩ := orderJournal_ok ran
  subst made
  exact ⟨(settled, log), same, (byRun_perm log settled.transitions).flatMap_right _⟩

/-- A committed commit committed a settled closure. -/
theorem orderJournal_settled {outcome : Except Failure (State × RunLog)} {after : State}
    (ran : orderJournal outcome = .ok after) : ∃ settled, outcome = .ok settled ∧ orderJournal (.ok settled) = .ok after := by
  cases outcome with
  | error failure => simp [orderJournal, Except.map] at ran
  | ok settled => exact ⟨settled, rfl, ran⟩

/-- No unit key outlives its closure: a committed state holds no queued token, signal, transition or keyed intent. -/
theorem orderJournal_closed {outcome : Except Failure (State × RunLog)} {after : State} (ran : orderJournal outcome = .ok after) :
    after.queuedTokens = ∅ ∧ after.queuedSignals = ∅ ∧ after.transitions = ∅ ∧ after.outboxes = ∅ := by
  obtain ⟨_, _, _, made⟩ := orderJournal_ok ran
  subst made
  exact ⟨rfl, rfl, rfl, rfl⟩

end Kernel.Laws.Step
