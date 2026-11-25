module

public import Kernel.Proofs.MultiInstance.Numbered
public import Kernel.Laws.Step.Order
public import Kernel.Laws.Step.Compacted

/-! # Multi-Instance numbering in run order (KD1, `declarationDepthFirst`)

Under `declarationDepthFirst` the commit numbers the pending activations in issue order, by the position at which their
units ran (`issuerOrder`, KD1), so that a body's instances are numbered in item order needs the run log: a pending
instance of a lower slot was issued by a unit that ran before the later one's, or by the same unit first (`RanBefore`).
A begin issues at the running unit's next index, after every issue the unit made and after every unit that ran
(`ranBefore_next`); recording the unit keeps every such order (`RanBefore.record`). Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel Kernel.Laws.State
open Kernel.Step (RunLog issueOrder issuerOrder)

/-- Issue `a` was made before issue `b` under the run log `log`: of two pending issues, the one whose unit ran first,
or of one unit the one it numbered first. It says nothing of a committed issue, whose order `CommittedBelow` states. -/
def RanBefore (log : RunLog) : Issue → Issue → Prop
  | .fresh unit index, .fresh unit' index' =>
    log.runPosition unit < log.runPosition unit' ∨ unit = unit' ∧ index < index'
  | _, _ => True

/-- The relation the closure numbers instances by: `CommittedBelow`, and of two pending activations the one made first
(`RanBefore`). -/
def RunBelow (log : RunLog) (earlier later : Issue) : Prop :=
  Laws.MultiInstance.CommittedBelow earlier later ∧ RanBefore log earlier later

/-- The run log `log` of a micro-step of the unit `unit` over the transitions `T`: the unit has not run, and every
transition but the unit's own, which its conclusion journals, is of a unit that ran, at a position below the log's
size. -/
structure LogFrame (log : RunLog) (unit : UnitKey) (T : TreeMap UnitKey Transition compare) : Prop where
  running : unit ∉ log.positions
  logged : ∀ other, T.contains other = true →
    other = unit ∨ other ∈ log.positions ∧ log.runPosition other < log.positions.size

/-- **A begin issues after every issue the table holds** (`Laws.State.Activated.pending`): an issue at or above the
running unit's next index follows every tabled one, whose unit is the running one at a lower index or one that ran
(`IssuerFresh.ran`, `LogFrame`). -/
theorem ranBefore_issued {program : Program} {log : RunLog} {s : State} (formed : WellFormed program s)
    (frame : LogFrame log s.issuing s.transitions) {unit : UnitKey} {k : Nat} {slot : ClaimSlot}
    (tabled : s.issued[Issue.fresh unit k]? = some slot) {index : Nat} (above : s.issueNext ≤ index) :
    RanBefore log (.fresh unit k) (.fresh s.issuing index) := by
  show log.runPosition unit < log.runPosition s.issuing ∨ unit = s.issuing ∧ k < index
  have mine : unit = s.issuing → log.runPosition unit < log.runPosition s.issuing ∨ unit = s.issuing ∧ k < index :=
    fun same => .inr ⟨same, Nat.lt_of_lt_of_le (formed.issuer.below k slot (same ▸ tabled)) above⟩
  rcases formed.issuer.ran unit k slot tabled with ran | same
  · rcases frame.logged unit ran with same | ⟨_, below⟩
    · exact mine same
    · exact .inl (by rw [Laws.Step.runPosition_unlogged frame.running]; exact below)
  · exact mine same

/-- `ranBefore_issued` of an occurrence's activation, which its counter tabled (`OccurrencesCounted`). -/
theorem ranBefore_next {program : Program} {log : RunLog} {s : State} (formed : WellFormed program s)
    (frame : LogFrame log s.issuing s.transitions) {o : Occurrence} (oIn : o ∈ s.occurrences) {index : Nat}
    (above : s.issueNext ≤ index) : RanBefore log o.activation (.fresh s.issuing index) := by
  have counted := formed.occurrencesCounted o oIn
  unfold Counted at counted
  cases held : o.activation with
  | committed _ => trivial
  | fresh unit k =>
    simp only [key, held] at counted
    exact ranBefore_issued formed frame counted above

/-- **Recording a unit keeps the order of issues the log ran or the unit made** (`RunLog.record`): the recorded
unit takes the log's size, after every unit that ran, each of which keeps its position. -/
theorem RanBefore.record {log : RunLog} {unit : UnitKey} {a b : Issue} (held : RanBefore log a b)
    (unrun : unit ∉ log.positions) (bounded : ∀ other ∈ log.positions, log.runPosition other < log.positions.size)
    (first : ∀ other index, a = .fresh other index → other = unit ∨ other ∈ log.positions)
    (second : ∀ other index, b = .fresh other index → other = unit ∨ other ∈ log.positions) :
    RanBefore (log.record unit) a b := by
  cases a with
  | committed _ => trivial
  | fresh one i =>
    cases b with
    | committed _ => trivial
    | fresh two j =>
      have oneIn := first one i rfl
      have twoIn := second two j rfl
      show (log.record unit).runPosition one < (log.record unit).runPosition two ∨ one = two ∧ i < j
      change log.runPosition one < log.runPosition two ∨ one = two ∧ i < j at held
      rw [Laws.Step.runPosition_record _ _ _ oneIn, Laws.Step.runPosition_record _ _ _ twoIn]
      rcases oneIn with rfl | oneLogged <;> rcases twoIn with rfl | twoLogged
      · simp only [ite_true, Nat.lt_irrefl, false_or]
        exact ⟨trivial, (held.resolve_left (Nat.lt_irrefl _)).2⟩
      · have apart : two ≠ one := fun same => unrun (same ▸ twoLogged)
        rw [ite_eq_left rfl, ite_eq_right apart]
        rcases held with less | ⟨same, _⟩
        · rw [Laws.Step.runPosition_unlogged unrun] at less
          exact absurd (Nat.lt_trans less (bounded two twoLogged)) (Nat.lt_irrefl _)
        · exact absurd same.symm apart
      · have apart : one ≠ two := fun same => unrun (same ▸ oneLogged)
        rw [ite_eq_right apart, ite_eq_left rfl]
        exact .inl (bounded one oneLogged)
      · have oneApart : one ≠ unit := fun same => unrun (same ▸ oneLogged)
        have twoApart : two ≠ unit := fun same => unrun (same ▸ twoLogged)
        rw [ite_eq_right oneApart, ite_eq_right twoApart]
        exact held

/-- Of two activations, the later was issued after the earlier under the run log `log`, both pending (`RanBefore`):
the order the commit numbers them in under `declarationDepthFirst` (`assign_ranBefore`). -/
def FreshBefore (log : RunLog) (earlier later : Issue) : Prop :=
  (∃ unit index, earlier = .fresh unit index) ∧ (∃ unit index, later = .fresh unit index) ∧ RanBefore log earlier later

/-- `element`'s start facts under the element role carry activations issued in list order. -/
def MadeInOrder (log : RunLog) (facts : List StartedFact) (element : ElementId) : Prop :=
  ((facts.filter fun fact => fact.occurrence.element == element && fact.occurrence.role == .element).map
    (·.occurrence.activation)).Pairwise (FreshBefore log)

/-- Under a micro-step's run log every pending activation of an occurrence is the running unit's or of a unit that
ran (`IssuerFresh.ran`, `LogFrame`). -/
theorem activation_logged {program : Program} {log : RunLog} {s : State} (formed : WellFormed program s)
    (frame : LogFrame log s.issuing s.transitions) {o : Occurrence} (oIn : o ∈ s.occurrences) (other : UnitKey)
    (index : Nat) (pending : o.activation = .fresh other index) : other = s.issuing ∨ other ∈ log.positions := by
  have counted := formed.occurrencesCounted o oIn
  unfold Counted at counted
  simp only [key, pending] at counted
  rcases formed.issuer.ran other index _ counted with ran | same
  · exact (frame.logged other ran).imp_right And.left
  · exact .inl same

/-- Recording the running unit keeps the numbering in run order of a state whose pending activations are the unit's
or of units that ran (`RanBefore.record`). -/
theorem NumberedBy.record {program : Program} {log : RunLog} {unit : UnitKey} {s : State}
    (held : NumberedBy (RunBelow log) program s) (unrun : unit ∉ log.positions)
    (bounded : ∀ other ∈ log.positions, log.runPosition other < log.positions.size)
    (logged : ∀ o ∈ s.occurrences, ∀ other index, o.activation = .fresh other index → other = unit ∨ other ∈ log.positions) :
    NumberedBy (RunBelow (log.record unit)) program s :=
  held.imp fun earlier present later present' below =>
    ⟨below.1, below.2.record unrun bounded (logged earlier present) (logged later present')⟩

/-! ## The commit's numbering in run order -/

open Kernel.Step Kernel.Laws.Step

/-- Under `declarationDepthFirst` an issue made after another is not listed before it (`issueOrder`). -/
theorem notAfter_ranBefore {log : RunLog} {a b : Issue} (ran : RanBefore log a b) (pending : ∃ unit index, a = .fresh unit index)
    (later : ∃ unit index, b = .fresh unit index) : Issue.notAfter (issuerOrder .declarationDepthFirst log) b a = false := by
  obtain ⟨one, i, rfl⟩ := pending
  obtain ⟨two, j, rfl⟩ := later
  change log.runPosition one < log.runPosition two ∨ one = two ∧ i < j at ran
  rcases ran with earlier | ⟨rfl, lower⟩
  · exact Laws.State.notAfter_fresh_gt (issuerOrder_ran earlier) i j
  · rw [Laws.State.notAfter_fresh_same, decide_eq_false_iff_not, Nat.not_le]
    exact lower

/-- Of two claims of a list sorted by `le`, one that is not `le` the other comes after it. -/
theorem split_of_sorted {α : Type} {le : α → α → Bool} {l : List α} (sorted : l.Pairwise fun x y => le x y = true)
    (refl : ∀ x, le x x = true) {a b : α} (aIn : a ∈ l) (bIn : b ∈ l) (later : le b a = false) :
    ∃ pre mid post, l = pre ++ a :: (mid ++ b :: post) := by
  obtain ⟨pre, rest, split⟩ := List.append_of_mem aIn
  subst split
  rcases List.mem_append.mp bIn with early | late
  · have := (List.pairwise_append.mp sorted).2.2 b early a List.mem_cons_self
    rw [this] at later; cases later
  · rcases List.mem_cons.mp late with same | after
    · subst same; rw [refl] at later; cases later
    · obtain ⟨mid, post, cut⟩ := List.append_of_mem after
      exact ⟨pre, mid, post, by rw [cut]⟩

/-- **Under `declarationDepthFirst` the commit numbers an activation made first below a later one on its slot**
(`issueOrder`, KD1): the issue order lists it first, the tagging keeps that order with each place its index,
one depth keeps the places (`activationOrder_before_place`), and the fold numbers the earlier one first on their one
counter. -/
theorem assign_ranBefore {start : State} {log : RunLog} {s : State}
    (slotsNamed : ∀ (issue : Issue) (slot : ActivationSlot), s.issued[issue]? = some (.activation slot) →
      NameTabled s slot.processInstance)
    {a b : Issue} {sa sb : ActivationSlot} (tabledA : s.issued[a]? = some (.activation sa))
    (tabledB : s.issued[b]? = some (.activation sb)) (later : Issue.notAfter (issuerOrder .declarationDepthFirst log) b a = false)
    (depth : sa.processInstance.callDepth = sb.processInstance.callDepth)
    (slot : (resolvedClaim (commitRenaming .declarationDepthFirst start log s) (a, sa)).2 =
      (resolvedClaim (commitRenaming .declarationDepthFirst start log s) (b, sb)).2) {na nb : Nat}
    (tookA : (assign .declarationDepthFirst start log s).1[a]? = some na)
    (tookB : (assign .declarationDepthFirst start log s).1[b]? = some nb) : na < nb := by
  obtain ⟨pre, mid, post, split⟩ := split_of_sorted (issueOrder_sorted .declarationDepthFirst log s)
    (fun x => notAfter_refl x.1) (a := (a, .activation sa)) (b := (b, .activation sb))
    (issueOrder_mem.mpr tabledA) (issueOrder_mem.mpr tabledB) later
  let T := fun claims : List (Issue × ClaimSlot) => (claims.filterMap activationClaim?).map
    fun claim => (claim, (none : Option (OccurrenceId × Nat)))
  have tagged : taggedActivations .declarationDepthFirst s (issueOrder .declarationDepthFirst log s) =
      T pre ++ ((a, sa), none) :: (T mid ++ ((b, sb), none) :: T post) := by
    simp only [taggedActivations_ddf, split, T, List.filterMap_append, List.filterMap_cons,
      activationClaim?_activation, List.map_append, List.map_cons]
  have atA : (taggedActivations .declarationDepthFirst s (issueOrder .declarationDepthFirst log s))[(T pre).length]? =
      some ((a, sa), none) := by
    rw [tagged, List.getElem?_append_right (Nat.le_refl _), Nat.sub_self, List.getElem?_cons_zero]
  have atB : (taggedActivations .declarationDepthFirst s (issueOrder .declarationDepthFirst log s))[
      (T pre).length + 1 + (T mid).length]? = some ((b, sb), none) := by
    rw [tagged, List.getElem?_append_right (by omega), show (T pre).length + 1 + (T mid).length - (T pre).length =
      (T mid).length + 1 by omega, List.getElem?_cons_succ, List.getElem?_append_right (Nat.le_refl _), Nat.sub_self,
      List.getElem?_cons_zero]
  obtain ⟨before, after, sorted, inAfter⟩ := activationOrder_before_place atA atB depth (by
    simp only [activationPlace_none]; omega)
  rw [assign_replay slotsNamed] at tookA tookB
  have committed : committedOrder .declarationDepthFirst start log s =
      (identityClaims (issueOrder .declarationDepthFirst log s) ++
        before.map (resolvedClaim (commitRenaming .declarationDepthFirst start log s))) ++
        resolvedClaim (commitRenaming .declarationDepthFirst start log s) (a, sa) ::
          after.map (resolvedClaim (commitRenaming .declarationDepthFirst start log s)) := by
    simp only [committedOrder, sorted, List.map_append, List.map_cons, List.append_assoc]
  have distinct := committedOrder_nodup (schedule := .declarationDepthFirst) start log s
  rw [committed] at distinct tookA tookB
  obtain ⟨midA, rest, cut⟩ := List.append_of_mem (List.mem_map_of_mem (f := resolvedClaim
    (commitRenaming .declarationDepthFirst start log s)) inAfter)
  rw [cut] at distinct tookA tookB
  simp only [List.map_append, List.map_cons] at distinct
  have tail := (List.nodup_append.mp distinct).2.1
  have firstOut := (List.nodup_cons.mp tail).1
  have secondOut := (List.nodup_cons.mp (List.nodup_append.mp (List.nodup_cons.mp tail).2).2.1).1
  exact fold_before _ midA rest _ _ (∅, ∅) slot (by simpa [List.map_append] using firstOut) secondOut tookA tookB

end Kernel.Proofs.MultiInstance
