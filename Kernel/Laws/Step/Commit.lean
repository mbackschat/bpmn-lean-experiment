module

public import Kernel.Step.Commit
public import Kernel.Laws.State.Issue
public import Kernel.Laws.State.Items
public import Kernel.Laws.State.Rename
import all Kernel.Step.Commit

/-! # Laws of the step function: commit

What `Kernel.Step.Commit` does, read from its bodies: a micro-step's draft is journalled as the transition of its unit
(`journalDraft_eq`), and a committed closure's journal and intents are put in run order, every unit-keyed family emptied
(`orderJournal_ok`, `orderJournal_closed`), then compacted (DC12): the assignment gives every entry of the issue table an
ordinal at or above its slot's base and below its slot's next ordinal (`assign_took`), the counters it leaves only rise
and reach every advanced slot's next ordinal (`advance_raised`, `advance_scope` of `advanceCounters`), the renaming of a layered key renames
each segment (`Laws.State.renameScope_eq`), and the committed state is the settled one, or, when it issued anything, the settled
one renamed and advanced (`compact_cases`). This is the one module that sees `Kernel.Step.Commit`'s bodies ([module table](../../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape));
`Kernel.Laws.Step` composes these facts with `Kernel.Step`'s bodies. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Step

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State

/-- The draft journalled as the transition of the unit `unit`, the draft and the write log emptied. -/
theorem journalDraft_eq {unit : UnitKey} {cause : Cause} {element : Option ElementId} {owner : ScopeOccurrenceId}
    {state : State} :
    journalDraft unit cause element owner state = { state with
      transitions := state.transitions.insert unit
        { cause, element, owner, started := state.draft.started, ended := state.draft.ended, ready := state.draft.ready },
      draft := {}, writes := [] } := by
  simp only [journalDraft]

/-- A settled closure before compaction: its transitions and intents in run order (`byRun`), every unit-keyed family
emptied, so no unit key outlives its closure (DC4). -/
abbrev ordered (log : RunLog) (state : State) : State :=
  { state with journal := byRun log state.transitions, intents := (byRun log state.outboxes).flatten
               transitions := ∅, outboxes := ∅, queuedTokens := ∅, queuedSignals := ∅ }

/-- A committed closure: the settled one ordered, then compacted. -/
theorem orderJournal_ok {start : State} {outcome : Except Failure (State × RunLog)} {after : State} (ran : orderJournal schedule start outcome = .ok after) :
    ∃ settled log, outcome = .ok (settled, log) ∧ compact schedule start log (ordered log settled) = .ok after := by
  cases outcome with
  | error failure => simp [orderJournal, bind, Except.bind] at ran
  | ok settled => exact ⟨settled.1, settled.2, rfl, ran⟩

/-- What a settled closure commits, given its settled state and run log. -/
theorem orderJournal_of {start state : State} {log : RunLog} {after : State}
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) :
    compact schedule start log (ordered log state) = .ok after :=
  made

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

/-- A committed commit committed a settled closure. -/
theorem orderJournal_settled {start : State} {outcome : Except Failure (State × RunLog)} {after : State}
    (ran : orderJournal schedule start outcome = .ok after) : ∃ settled, outcome = .ok settled ∧ orderJournal schedule start (.ok settled) = .ok after := by
  cases outcome with
  | error failure => simp [orderJournal, bind, Except.bind] at ran
  | ok settled => exact ⟨settled, rfl, ran⟩

/-! ## Compaction at commit (DC12) -/

open Kernel.Laws.State

/-! ## The assignment -/

/-- The fold took `claim`: its issue holds an ordinal at or above its slot's base and below its slot's next ordinal. -/
def Took (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ClaimSlot) : Prop :=
  ∃ n m, acc.1[claim.1]? = some n ∧ acc.2[claim.2]? = some m ∧ base claim.2 ≤ n ∧ n < m

/-- Every next ordinal the fold holds is at or above its slot's base. -/
def AboveBase (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) : Prop :=
  ∀ slot m, acc.2[slot]? = some m → base slot ≤ m

theorem getD_above {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    (above : AboveBase base acc) (slot : ClaimSlot) : base slot ≤ acc.2.getD slot (base slot) := by
  rw [Std.ExtTreeMap.getD_eq_getD_getElem?]
  cases h : acc.2[slot]? with
  | none => exact Nat.le_refl _
  | some m => exact above slot m h

theorem assignStep_above {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    (above : AboveBase base acc) (claim : Issue × ClaimSlot) : AboveBase base (assignStep base acc claim) := by
  intro slot m found
  simp only [assignStep, Std.ExtTreeMap.getElem?_insert] at found
  split at found
  · rename_i same
    cases found
    rw [← Std.LawfulEqOrd.eq_of_compare same]
    exact Nat.le_succ_of_le (getD_above above claim.2)
  · exact above slot m found

theorem assignStep_took {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    (above : AboveBase base acc) (claim : Issue × ClaimSlot) : Took base (assignStep base acc claim) claim :=
  ⟨_, _, by simp [assignStep], by simp [assignStep], getD_above above claim.2, Nat.lt_succ_self _⟩

theorem assignStep_keeps {base : ClaimSlot → Nat} {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare}
    {claim other : Issue × ClaimSlot} (apart : other.1 ≠ claim.1) (took : Took base acc other) :
    Took base (assignStep base acc claim) other := by
  obtain ⟨n, m, entries⟩ := took
  obtain ⟨issue, slot, low, high⟩ := entries
  have kept : (assignStep base acc claim).1[other.1]? = some n := by
    simp only [assignStep, Std.ExtTreeMap.getElem?_insert]
    split
    · rename_i same; exact absurd (Std.LawfulEqOrd.eq_of_compare same).symm apart
    · exact issue
  by_cases same : compare claim.2 other.2 = .eq
  · have slots := Std.LawfulEqOrd.eq_of_compare same
    refine ⟨n, acc.2.getD claim.2 (base claim.2) + 1, kept, ?_, low, ?_⟩
    · simp [assignStep, slots]
    · rw [slots, Std.ExtTreeMap.getD_eq_getD_getElem?, slot]
      exact Nat.lt_succ_of_lt high
  · refine ⟨n, m, kept, ?_, low, high⟩
    simp only [assignStep, Std.ExtTreeMap.getElem?_insert, same, ite_false]
    exact slot

/-- The fold keeps what it took of a claim whose issue no later claim repeats, and its next ordinals above their bases. -/
theorem fold_keeps {base : ClaimSlot → Nat} {other : Issue × ClaimSlot} :
    ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      other.1 ∉ claims.map (·.1) → AboveBase base acc → Took base acc other →
      Took base (claims.foldl (assignStep base) acc) other
  | [], _, _, _, took => took
  | claim :: rest, acc, absent, above, took => by
    simp only [List.map_cons, List.mem_cons, not_or] at absent
    exact fold_keeps rest _ absent.2 (assignStep_above above claim) (assignStep_keeps absent.1 took)

theorem fold_above {base : ClaimSlot → Nat} :
    ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      AboveBase base acc → AboveBase base (claims.foldl (assignStep base) acc)
  | [], _, above => above
  | claim :: rest, _, above => fold_above rest _ (assignStep_above above claim)

/-- **The assignment takes every claim** of a list whose issues are distinct. -/
theorem fold_took {base : ClaimSlot → Nat} :
    ∀ (claims : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      (claims.map (·.1)).Nodup → AboveBase base acc → ∀ claim ∈ claims, Took base (claims.foldl (assignStep base) acc) claim
  | [], _, _, _, _, member => nomatch member
  | first :: rest, acc, distinct, above, claim, member => by
    simp only [List.map_cons, List.nodup_cons] at distinct
    rcases List.mem_cons.mp member with rfl | later
    · exact fold_keeps rest _ distinct.1 (assignStep_above above _) (assignStep_took above _)
    · exact fold_took rest _ distinct.2 (assignStep_above above first) claim later

theorem assignStep_eq (base : ClaimSlot → Nat) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare)
    (claim : Issue × ClaimSlot) : assignStep base acc claim = (acc.1.insert claim.1 (acc.2.getD claim.2 (base claim.2)),
      acc.2.insert claim.2 (acc.2.getD claim.2 (base claim.2) + 1)) := by simp only [assignStep]

theorem assign_eq (start : State) (log : RunLog) (state : State) :
    assign schedule start log state = (issueOrder schedule log state).foldl (assignStep (slotBase start)) (∅, ∅) := by
  simp only [assign]

theorem issueOrder_eq (log : RunLog) (state : State) : issueOrder schedule log state =
    state.issued.toList.mergeSort fun a b => Issue.notAfter (issuerOrder schedule log) a.1 b.1 := by simp only [issueOrder]

/-- The issue order lists the table's entries, each issue once. -/
theorem issueOrder_mem {log : RunLog} {state : State} {claim : Issue × ClaimSlot} :
    claim ∈ issueOrder schedule log state ↔ state.issued[claim.1]? = some claim.2 := by
  unfold issueOrder
  rw [(List.mergeSort_perm _ _).mem_iff]
  exact Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some

theorem issueOrder_nodup (schedule : BranchSchedule) (log : RunLog) (state : State) : ((issueOrder schedule log state).map (·.1)).Nodup := by
  unfold issueOrder
  refine ((List.mergeSort_perm _ _).map _).nodup_iff.mpr ?_
  rw [List.nodup_iff_pairwise_ne, List.pairwise_map]
  exact Std.ExtTreeMap.distinct_keys_toList.imp fun apart same => apart (by rw [same]; exact Std.ReflCmp.compare_self)

/-- **`assign_took`.** Every entry of the issue table takes an ordinal at or above its slot's base and below the slot's
next ordinal. -/
theorem assign_took {start : State} {log : RunLog} {state : State} {issue : Issue} {slot : ClaimSlot}
    (tabled : state.issued[issue]? = some slot) : Took (slotBase start) (assign schedule start log state) (issue, slot) := by
  unfold assign
  exact fold_took _ _ (issueOrder_nodup schedule log state) (fun _ _ found => by simp at found) _ (issueOrder_mem.mpr tabled)

/-! ## The counters after the commit -/

theorem raiseCounter_ge {α : Type} [Ord α] [Std.TransOrd α] [Std.LawfulEqOrd α] (counters : TreeMap α Nat compare)
    (slot key : α) (ordinal : Nat) : counters.getD key 0 ≤ (raiseCounter counters slot ordinal).getD key 0 := by
  unfold raiseCounter
  rw [Std.ExtTreeMap.getD_insert]
  split
  · rename_i same
    rw [← Std.LawfulEqOrd.eq_of_compare same]
    exact Nat.le_max_right _ _
  · exact Nat.le_refl _

theorem raiseCounter_self {α : Type} [Ord α] [Std.TransOrd α] [Std.LawfulEqOrd α] (counters : TreeMap α Nat compare)
    (slot : α) (ordinal : Nat) : ordinal ≤ (raiseCounter counters slot ordinal).getD slot 0 := by
  unfold raiseCounter
  rw [Std.ExtTreeMap.getD_insert_self]
  exact Nat.le_max_left _ _

/-- `after` holds `before`'s scope occurrences, occurrences and items, and every counter of `before` at or above. -/
structure Raised (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  items : after.openItems = before.openItems
  scopeOrdinals : ∀ slot, before.scopeOrdinals.getD slot 0 ≤ after.scopeOrdinals.getD slot 0
  occurrenceOrdinals : ∀ slot, before.occurrenceOrdinals.getD slot 0 ≤ after.occurrenceOrdinals.getD slot 0
  itemOrdinals : ∀ occurrence, before.itemOrdinals.getD occurrence 0 ≤ after.itemOrdinals.getD occurrence 0

theorem Raised.refl (state : State) : Raised state state :=
  ⟨rfl, rfl, rfl, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩

theorem Raised.trans {a b c : State} (first : Raised a b) (second : Raised b c) : Raised a c :=
  ⟨second.scopes.trans first.scopes, second.occurrences.trans first.occurrences, second.items.trans first.items,
    fun slot => Nat.le_trans (first.scopeOrdinals slot) (second.scopeOrdinals slot),
    fun slot => Nat.le_trans (first.occurrenceOrdinals slot) (second.occurrenceOrdinals slot),
    fun slot => Nat.le_trans (first.itemOrdinals slot) (second.itemOrdinals slot)⟩

theorem foldl_raised {β : Type} {g : State → β → State} (step : ∀ state x, Raised state (g state x)) :
    ∀ (entries : List β) (state : State), Raised state (entries.foldl g state)
  | [], state => .refl state
  | x :: rest, state => (step state x).trans (foldl_raised step rest _)

/-- One advance step raises: it changes one counter, never lowering it. -/
theorem advance_step (r : Issue → Issue) (renamed state : State) (slot : ClaimSlot) (ordinal : Nat) :
    Raised state (match slot with
      | .scope slot =>
        let slot := { slot with parent := renameScope r slot.parent }
        if renamed.scopes.any (·.id == slot.parent) then { state with scopeOrdinals := raiseCounter state.scopeOrdinals slot ordinal }
        else state
      | .occurrence slot =>
        let slot := { slot with parent := renameScope r slot.parent }
        if renamed.scopes.any (·.id == slot.parent) then
          { state with occurrenceOrdinals := raiseCounter state.occurrenceOrdinals slot ordinal }
        else state
      | .item occurrence =>
        let occurrence := renameId r occurrence
        if renamed.occurrences.any (·.id == occurrence) then
          { state with itemOrdinals := raiseCounter state.itemOrdinals occurrence ordinal }
        else state
      | .position => { state with nextOrder := max ordinal state.nextOrder }) := by
  cases slot <;> dsimp only <;> try split
  all_goals first
    | exact .refl state
    | exact ⟨rfl, rfl, rfl, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
    | exact ⟨rfl, rfl, rfl, fun key => raiseCounter_ge _ _ key _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
    | exact ⟨rfl, rfl, rfl, fun _ => Nat.le_refl _, fun key => raiseCounter_ge _ _ key _, fun _ => Nat.le_refl _⟩
    | exact ⟨rfl, rfl, rfl, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun key => raiseCounter_ge _ _ key _⟩

theorem advance_raised (r : Issue → Issue) (next : TreeMap ClaimSlot Nat compare) (renamed : State) :
    Raised renamed (advanceCounters r next renamed) := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  exact foldl_raised (fun state (x : ClaimSlot × Nat) => advance_step r renamed state x.1 x.2) _ _

theorem foldl_reaches {β : Type} {g : State → β → State} (step : ∀ state x, Raised state (g state x))
    {P : State → Prop} (mono : ∀ a b, Raised a b → P a → P b) {x : β} (hit : ∀ state, P (g state x)) :
    ∀ (entries : List β) (state : State), x ∈ entries → P (entries.foldl g state)
  | [], _, member => nomatch member
  | y :: rest, state, member => by
    rcases List.mem_cons.mp member with same | later
    · subst same
      exact mono _ _ (foldl_raised step rest _) (hit state)
    · exact foldl_reaches step mono hit rest _ later

/-- An advanced scope slot whose renamed parent stands counts past its next ordinal after the commit. -/
theorem advance_scope {r : Issue → Issue} {next : TreeMap ClaimSlot Nat compare} {renamed : State} {slot : ScopeSlot}
    {ordinal : Nat} (advanced : next[ClaimSlot.scope slot]? = some ordinal)
    (stands : renamed.scopes.any (·.id == renameScope r slot.parent) = true) :
    ordinal ≤ (advanceCounters r next renamed).scopeOrdinals.getD { slot with parent := renameScope r slot.parent } 0 := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  refine foldl_reaches (x := (ClaimSlot.scope slot, ordinal)) (fun state x => advance_step r renamed state x.1 x.2)
    (fun a b raised held => Nat.le_trans held (raised.scopeOrdinals _)) (fun state => ?_) _ _
    (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr advanced)
  dsimp only
  rw [ite_eq_left stands]
  exact raiseCounter_self _ _ _

theorem advance_occurrence {r : Issue → Issue} {next : TreeMap ClaimSlot Nat compare} {renamed : State}
    {slot : ScopeSlot} {ordinal : Nat} (advanced : next[ClaimSlot.occurrence slot]? = some ordinal)
    (stands : renamed.scopes.any (·.id == renameScope r slot.parent) = true) :
    ordinal ≤ (advanceCounters r next renamed).occurrenceOrdinals.getD { slot with parent := renameScope r slot.parent } 0 := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  refine foldl_reaches (x := (ClaimSlot.occurrence slot, ordinal)) (fun state x => advance_step r renamed state x.1 x.2)
    (fun a b raised held => Nat.le_trans held (raised.occurrenceOrdinals _)) (fun state => ?_) _ _
    (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr advanced)
  dsimp only
  rw [ite_eq_left stands]
  exact raiseCounter_self _ _ _

theorem advance_item {r : Issue → Issue} {next : TreeMap ClaimSlot Nat compare} {renamed : State}
    {occurrence : OccurrenceId} {ordinal : Nat} (advanced : next[ClaimSlot.item occurrence]? = some ordinal)
    (present : renamed.occurrences.any (·.id == renameId r occurrence) = true) :
    ordinal ≤ (advanceCounters r next renamed).itemOrdinals.getD (renameId r occurrence) 0 := by
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  refine foldl_reaches (x := (ClaimSlot.item occurrence, ordinal)) (fun state x => advance_step r renamed state x.1 x.2)
    (fun a b raised held => Nat.le_trans held (raised.itemOrdinals _)) (fun state => ?_) _ _
    (Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mpr advanced)
  dsimp only
  rw [ite_eq_left present]
  exact raiseCounter_self _ _ _

/-! ## The renaming -/

theorem renameBy_fixes (assigned : TreeMap Issue Nat compare) : Fixes (renameBy assigned) := fun _ => rfl

theorem fresh_of_committed {segments : List ScopeSegment}
    (committed : ∀ segment ∈ segments, segment.ordinal.isFresh = false) :
    (ScopeOccurrenceId.ofSegments segments).fresh = false := by
  cases segments with
  | nil => simp
  | cons segment rest => simpa using committed segment List.mem_cons_self

/-- The renaming an assignment defines, as equations: a committed issue stays, an assigned fresh one takes its
ordinal. -/
@[simp] theorem renameBy_committed (assigned : TreeMap Issue Nat compare) (n : Nat) :
    renameBy assigned (.committed n) = .committed n := by
  simp only [renameBy]

@[simp] theorem renameBy_fresh (assigned : TreeMap Issue Nat compare) (unit : UnitKey) (index : Nat) :
    renameBy assigned (.fresh unit index) = (assigned[Issue.fresh unit index]?.map Issue.committed).getD (.fresh unit index) := by
  simp only [renameBy, Std.ExtTreeMap.get?_eq_getElem?]
  cases assigned[Issue.fresh unit index]? <;> rfl

/-- A slot's base, as an equation per counter. -/
theorem slotBase_eq (state : State) (slot : ClaimSlot) : slotBase state slot = match slot with
    | .scope slot => if slot.parent.fresh then 0 else state.scopeOrdinals.getD slot 0
    | .occurrence slot => if slot.parent.fresh then 0 else state.occurrenceOrdinals.getD slot 0
    | .item occurrence => if occurrence.fresh then 0 else state.itemOrdinals.getD occurrence 0
    | .position => state.nextOrder := by
  cases slot <;> rfl

/-- What the fold keeps of the claims it processed: each took an ordinal below its slot's next ordinal, and two of one
slot took different ordinals. -/
structure Apart (processed : List (Issue × ClaimSlot))
    (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare) : Prop where
  took : ∀ c ∈ processed, ∃ n m, acc.1[c.1]? = some n ∧ acc.2[c.2]? = some m ∧ n < m
  apart : ∀ c ∈ processed, ∀ d ∈ processed, c.2 = d.2 → acc.1[c.1]? = acc.1[d.1]? → c.1 = d.1

theorem Apart.step {base : ClaimSlot → Nat} {processed : List (Issue × ClaimSlot)}
    {acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare} (kept : Apart processed acc)
    {claim : Issue × ClaimSlot} (fresh : claim.1 ∉ processed.map (·.1)) :
    Apart (processed ++ [claim]) (assignStep base acc claim) := by
  have issueApart : ∀ c ∈ processed, c.1 ≠ claim.1 := fun c member same =>
    fresh (same ▸ List.mem_map_of_mem (f := (·.1)) member)
  have oldIssue : ∀ c ∈ processed, (assignStep base acc claim).1[c.1]? = acc.1[c.1]? := fun c member => by
    simp only [assignStep, Std.ExtTreeMap.getElem?_insert]
    split
    · rename_i same; exact absurd (Std.LawfulEqOrd.eq_of_compare same).symm (issueApart c member)
    · rfl
  have newIssue : (assignStep base acc claim).1[claim.1]? = some (acc.2.getD claim.2 (base claim.2)) := by
    simp [assignStep]
  -- An old claim of the new claim's slot took an ordinal below the slot's next ordinal, which the new claim takes.
  have below : ∀ c ∈ processed, c.2 = claim.2 → ∀ n, acc.1[c.1]? = some n → n < acc.2.getD claim.2 (base claim.2) := by
    intro c member slot n held
    obtain ⟨n', m, parts⟩ := kept.took c member
    obtain ⟨held', next, lt⟩ := parts
    rw [held] at held'
    cases held'
    rw [Std.ExtTreeMap.getD_eq_getD_getElem?, ← slot, next]
    exact lt
  refine ⟨fun c member => ?_, fun c cm d dm slot same => ?_⟩
  · rcases List.mem_append.mp member with old | new
    · obtain ⟨n, m, parts⟩ := kept.took c old
      obtain ⟨held, next, lt⟩ := parts
      refine ⟨n, ?_, by rw [oldIssue c old]; exact held, ?_, ?_⟩
      · exact if slot : c.2 = claim.2 then acc.2.getD claim.2 (base claim.2) + 1 else m
      · by_cases slot : c.2 = claim.2
        · simp [assignStep, slot]
        · simp only [assignStep, Std.ExtTreeMap.getElem?_insert, slot, ↓reduceDIte]
          split
          · rename_i same; exact absurd (Std.LawfulEqOrd.eq_of_compare same).symm slot
          · exact next
      · by_cases slot : c.2 = claim.2
        · simp only [slot, ↓reduceDIte]; exact Nat.lt_succ_of_lt (below c old slot n held)
        · simp only [slot, ↓reduceDIte]; exact lt
    · rw [List.mem_singleton.mp new]
      exact ⟨_, _, newIssue, by simp [assignStep], Nat.lt_succ_self _⟩
  · rcases List.mem_append.mp cm with cold | cnew <;> rcases List.mem_append.mp dm with dold | dnew
    · rw [oldIssue c cold, oldIssue d dold] at same
      exact kept.apart c cold d dold slot same
    · rw [List.mem_singleton.mp dnew] at slot same ⊢
      rw [oldIssue c cold, newIssue] at same
      exact absurd (below c cold slot _ same) (Nat.lt_irrefl _)
    · rw [List.mem_singleton.mp cnew] at slot same ⊢
      rw [oldIssue d dold, newIssue] at same
      exact absurd (below d dold slot.symm _ same.symm) (Nat.lt_irrefl _)
    · rw [List.mem_singleton.mp cnew, List.mem_singleton.mp dnew]

theorem fold_apart {base : ClaimSlot → Nat} :
    ∀ (claims processed : List (Issue × ClaimSlot)) (acc : TreeMap Issue Nat compare × TreeMap ClaimSlot Nat compare),
      ((processed ++ claims).map (·.1)).Nodup → Apart processed acc →
      Apart (processed ++ claims) (claims.foldl (assignStep base) acc)
  | [], processed, acc, _, kept => by simpa using kept
  | claim :: rest, processed, acc, distinct, kept => by
    have fresh : claim.1 ∉ processed.map (·.1) := by
      rw [List.map_append, List.map_cons] at distinct
      exact fun member => (List.nodup_append.mp distinct).2.2 _ member _ List.mem_cons_self rfl
    have next := fold_apart (base := base) rest (processed ++ [claim]) _
      (by simpa using distinct) (kept.step (base := base) fresh)
    simpa using next

/-- **Two entries of one slot take different ordinals.** -/
theorem assign_apart {start : State} {log : RunLog} {state : State} {first second : Issue} {slot : ClaimSlot}
    (one : state.issued[first]? = some slot) (two : state.issued[second]? = some slot)
    (same : (assign schedule start log state).1[first]? = (assign schedule start log state).1[second]?) : first = second := by
  have kept := fold_apart (base := slotBase start) (issueOrder schedule log state) [] (∅, ∅)
    (by simpa using issueOrder_nodup schedule log state) ⟨fun _ member => (nomatch member), fun _ member => (nomatch member)⟩
  unfold assign at same
  exact kept.apart (first, slot) (by simpa using issueOrder_mem.mpr one) (second, slot)
    (by simpa using issueOrder_mem.mpr two) rfl same

/-! ## What a commit leaves -/

/-- The renaming a commit applies. -/
abbrev commitRenaming (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : Issue → Issue := renameBy (assign schedule start log s).1

/-- The continuation renaming a commit passes to `renameState`. -/
abbrev commitRekey (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : Continuation → Continuation :=
  Continuation.rekey (renameId (commitRenaming schedule start log s)) (renameScope (commitRenaming schedule start log s))

@[simp] theorem commitRenaming_committed (start : State) (log : RunLog) (s : State) (n : Nat) :
    commitRenaming schedule start log s (.committed n) = .committed n :=
  renameBy_committed _ n

/-- The state a commit leaves when the closure issued anything: the settled one renamed and advanced, the issue table
emptied. -/
abbrev compacted (schedule : BranchSchedule) (start : State) (log : RunLog) (s : State) : State :=
  { advanceCounters (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitRekey schedule start log s) s) with
    issued := ∅, issuing := .ofRoot .seed, issueNext := 0 }

/-- **A closure that issued nothing commits its state as it is.** -/
theorem compact_empty {start : State} {log : RunLog} {s : State} (empty : s.issued.isEmpty = true) : compact schedule start log s = .ok s := by
  simp [compact, empty]

/-- A commit leaves the settled state when the closure issued nothing, and `compacted` otherwise. -/
theorem compact_cases {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) :
    (s.issued.isEmpty = true ∧ t = s) ∨ (s.issued.isEmpty = false ∧ t = compacted schedule start log s) := by
  unfold compact at ran
  split at ran
  · rename_i empty
    exact .inl ⟨empty, (Except.ok.inj ran).symm⟩
  · rename_i empty
    split at ran
    · cases ran
    · split at ran
      · cases ran
      · exact .inr ⟨by simpa using empty, (Except.ok.inj ran).symm⟩

theorem assign_empty {start : State} {log : RunLog} {s : State} (empty : s.issued.isEmpty = true) : assign schedule start log s = (∅, ∅) := by
  have none : issueOrder schedule log s = [] := by
    have list : s.issued.toList = [] := by simpa [Std.ExtTreeMap.isEmpty_iff] using empty
    unfold issueOrder
    simp [list]
  simp [assign, none]

/-- A closure that issued nothing renames nothing. -/
theorem commitRenaming_empty {start : State} {log : RunLog} {s : State} (empty : s.issued.isEmpty = true) (issue : Issue) :
    commitRenaming schedule start log s issue = issue := by
  cases issue <;> simp [commitRenaming, renameBy, assign_empty empty]

theorem rekey_id {r : Issue → Issue} (same : ∀ issue, r issue = issue) (continuation : Continuation) :
    continuation.rekey (renameId r) (renameScope r) = continuation := by
  cases continuation <;> simp [Continuation.rekey, renameId_id same, renameScope_id same]

theorem compact_scopes {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) :
    standingKeys t = (standingKeys s).map (renameScope (commitRenaming schedule start log s)) := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · simp [renameScope_id (commitRenaming_empty empty)]
  change (advanceCounters _ _ _).scopes.map (·.id) = _
  rw [(advance_raised _ _ _).scopes]
  simp only [standingKeys, renameState_scopes, List.map_map]
  rfl

theorem compact_counter {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) (slot : ScopeSlot) :
    s.scopeOrdinals.getD slot 0 ≤ t.scopeOrdinals.getD slot 0 := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact Nat.le_refl _
  have raised := (advance_raised (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitRekey schedule start log s) s)).scopeOrdinals slot
  rwa [renameState_scopeOrdinals] at raised

theorem compact_reach {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {slot : ScopeSlot} {ordinal : Nat}
    (advanced : (assign schedule start log s).2[ClaimSlot.scope slot]? = some ordinal)
    (stands : renameScope (commitRenaming schedule start log s) slot.parent ∈ standingKeys t) :
    ordinal ≤ t.scopeOrdinals.getD { slot with parent := renameScope (commitRenaming schedule start log s) slot.parent } 0 := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · simp [assign_empty empty] at advanced
  change _ ∈ (advanceCounters _ _ _).scopes.map (·.id) at stands
  rw [(advance_raised _ _ _).scopes] at stands
  obtain ⟨z, member, same⟩ := List.mem_map.mp stands
  exact advance_scope advanced (List.any_eq_true.mpr ⟨z, member, by simp [same]⟩)

/-- `t` is `s` with its counters alone changed. -/
def CountersOnly (s t : State) : Prop :=
  t = { s with scopeOrdinals := t.scopeOrdinals, occurrenceOrdinals := t.occurrenceOrdinals,
               itemOrdinals := t.itemOrdinals, nextOrder := t.nextOrder }

/-- Advancing changes the counters alone. -/
theorem advance_frame (r : Issue → Issue) (next : TreeMap ClaimSlot Nat compare) (renamed : State) :
    advanceCounters r next renamed =
      { renamed with scopeOrdinals := (advanceCounters r next renamed).scopeOrdinals,
                     occurrenceOrdinals := (advanceCounters r next renamed).occurrenceOrdinals,
                     itemOrdinals := (advanceCounters r next renamed).itemOrdinals,
                     nextOrder := (advanceCounters r next renamed).nextOrder } := by
  show CountersOnly renamed _
  unfold advanceCounters
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList]
  generalize next.toList = entries
  have fold : ∀ (f : State → ClaimSlot × Nat → State),
      (∀ state x, CountersOnly renamed state → CountersOnly renamed (f state x)) →
      ∀ (entries : List (ClaimSlot × Nat)) state, CountersOnly renamed state →
        CountersOnly renamed (entries.foldl f state) := by
    intro f keeps entries
    induction entries with
    | nil => intro state framed; exact framed
    | cons x rest step => intro state framed; exact step _ (keeps state x framed)
  refine fold _ (fun state x framed => ?_) entries renamed rfl
  obtain ⟨slot, ordinal⟩ := x
  unfold CountersOnly at framed ⊢
  cases slot <;> dsimp only <;> try split
  all_goals (rw [framed])

/-- A commit changes no field but the identities, the counters and the issue table. -/
theorem compact_frame {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) :
    t.queuedTokens = s.queuedTokens ∧ t.queuedSignals = s.queuedSignals ∧ t.transitions = s.transitions ∧
      t.outboxes = s.outboxes ∧ t.journal.flatMap (·.ended) = s.journal.flatMap (·.ended) := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact ⟨rfl, rfl, rfl, rfl, rfl⟩
  have same := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitRekey schedule start log s) s)
  unfold compacted
  rw [same, renameState_eq]
  refine ⟨rfl, rfl, rfl, rfl, ?_⟩
  change List.flatMap _ (s.journal.map (renameTransition _)) = _
  simp only [List.flatMap_map, renameTransition_ended]

/-- A committed closure's journal holds its transitions' end facts, in the order its units ran. -/
theorem orderJournal_ended {start : State} {outcome : Except Failure (State × RunLog)} {after : State} (ran : orderJournal schedule start outcome = .ok after) :
    ∃ settled, outcome = .ok settled ∧
      (after.journal.flatMap (·.ended)).Perm ((settled.1.transitions.toList.map (·.2)).flatMap (·.ended)) := by
  obtain ⟨settled, log, same, made⟩ := orderJournal_ok ran
  rw [(compact_frame made).2.2.2.2]
  exact ⟨(settled, log), same, (byRun_perm log settled.transitions).flatMap_right _⟩

/-- No unit key outlives its closure: a committed state holds no queued token, signal, transition or keyed intent. -/
theorem orderJournal_closed {start : State} {outcome : Except Failure (State × RunLog)} {after : State} (ran : orderJournal schedule start outcome = .ok after) :
    after.queuedTokens = ∅ ∧ after.queuedSignals = ∅ ∧ after.transitions = ∅ ∧ after.outboxes = ∅ := by
  obtain ⟨_, _, _, made⟩ := orderJournal_ok ran
  obtain ⟨tokens, signals, parts⟩ := compact_frame made
  obtain ⟨transitions, outboxes, _⟩ := parts
  exact ⟨tokens, signals, transitions, outboxes⟩

/-! ## The occurrences and items a commit leaves -/

theorem compact_occurrences {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) :
    t.occurrences = s.occurrences.map fun occurrence =>
      { occurrence with id := renameId (commitRenaming schedule start log s) occurrence.id
                        scope := renameScope (commitRenaming schedule start log s) occurrence.scope
                        continuation := occurrence.continuation.rekey (renameId (commitRenaming schedule start log s))
                          (renameScope (commitRenaming schedule start log s)) } := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · have same := commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty
    exact (List.map_congr_left fun _ _ => by simp [renameId_id same, renameScope_id same, rekey_id same]).trans
      (List.map_id _) |>.symm
  change (advanceCounters _ _ _).occurrences = _
  rw [(advance_raised _ _ _).occurrences, renameState_occurrences]

theorem compact_occurrence_counter {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) (slot : ScopeSlot) :
    s.occurrenceOrdinals.getD slot 0 ≤ t.occurrenceOrdinals.getD slot 0 := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact Nat.le_refl _
  have raised := (advance_raised (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitRekey schedule start log s) s)).occurrenceOrdinals slot
  rwa [renameState_occurrenceOrdinals] at raised

theorem compact_item_counter {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) (occurrence : OccurrenceId) :
    s.itemOrdinals.getD occurrence 0 ≤ t.itemOrdinals.getD occurrence 0 := by
  rcases compact_cases ran with ⟨_, rfl⟩ | ⟨_, rfl⟩
  · exact Nat.le_refl _
  have raised := (advance_raised (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitRekey schedule start log s) s)).itemOrdinals occurrence
  rwa [renameState_itemOrdinals] at raised

theorem compact_reach_occurrence {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {slot : ScopeSlot}
    {ordinal : Nat} (advanced : (assign schedule start log s).2[ClaimSlot.occurrence slot]? = some ordinal)
    (stands : renameScope (commitRenaming schedule start log s) slot.parent ∈ standingKeys t) :
    ordinal ≤ t.occurrenceOrdinals.getD { slot with parent := renameScope (commitRenaming schedule start log s) slot.parent } 0 := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · simp [assign_empty empty] at advanced
  change _ ∈ (advanceCounters _ _ _).scopes.map (·.id) at stands
  rw [(advance_raised _ _ _).scopes] at stands
  obtain ⟨z, member, same⟩ := List.mem_map.mp stands
  exact advance_occurrence advanced (List.any_eq_true.mpr ⟨z, member, by simp [same]⟩)

theorem compact_reach_item {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {occurrence : OccurrenceId}
    {ordinal : Nat} (advanced : (assign schedule start log s).2[ClaimSlot.item occurrence]? = some ordinal)
    (present : ∃ other ∈ t.occurrences, other.id = renameId (commitRenaming schedule start log s) occurrence) :
    ordinal ≤ t.itemOrdinals.getD (renameId (commitRenaming schedule start log s) occurrence) 0 := by
  obtain ⟨other, member, same⟩ := present
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · simp [assign_empty empty] at advanced
  change other ∈ (advanceCounters _ _ _).occurrences at member
  rw [(advance_raised _ _ _).occurrences] at member
  exact advance_item advanced (List.any_eq_true.mpr ⟨other, member, by simp [same]⟩)

theorem renameId_keep {r : Issue → Issue} (fixes : Fixes r) {id : OccurrenceId} (scope : renameScope r id.scope = id.scope)
    {m : Nat} (ordinal : id.ordinal = .committed m) : renameId r id = id := by
  obtain ⟨scope', element, ordinal'⟩ := id
  simp only at scope ordinal
  subst ordinal
  rw [renameId_eq]
  simp only [scope, fixes m]

/-- What a fold of inserts holds came from its start or from one of its entries. -/
theorem foldl_from {β : Type} {f : OpenItems → β → OpenItems} {g : β → OpenItem}
    (step : ∀ (m : OpenItems) (x : β) (k : ItemKey) (v : OpenItem), (f m x)[k]? = some v → m[k]? = some v ∨ v = g x) :
    ∀ (entries : List β) (acc : OpenItems) (k : ItemKey) (v : OpenItem), (entries.foldl f acc)[k]? = some v →
      acc[k]? = some v ∨ ∃ x ∈ entries, v = g x
  | [], _, _, _, held => .inl held
  | x :: rest, acc, k, v, held => by
    rcases foldl_from step rest (f acc x) k v held with first | later
    · rcases step acc x k v first with old | new
      · exact .inl old
      · exact .inr ⟨x, List.mem_cons_self, new⟩
    · obtain ⟨y, member, same⟩ := later
      exact .inr ⟨y, List.mem_cons_of_mem _ member, same⟩

/-- An item the commit leaves is an item of the settled state renamed. -/
theorem compact_items {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {item : OpenItem}
    (member : item ∈ itemList t.openItems) :
    ∃ old ∈ itemList s.openItems, item.id = renameItemKey (commitRenaming schedule start log s) old.id := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · exact ⟨item, member, (renameItemKey_id (commitRenaming_empty empty) _).symm⟩
  change item ∈ itemList (advanceCounters _ _ _).openItems at member
  rw [(advance_raised _ _ _).items, mem_itemList] at member
  obtain ⟨k, held⟩ := member
  rw [renameState_openItems] at held
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList] at held
  rcases foldl_from (g := fun (x : ItemKey × OpenItem) =>
      { x.2 with id := renameItemKey (commitRenaming schedule start log s) x.2.id, position := commitRenaming schedule start log s x.2.position,
                 scope := renameScope (commitRenaming schedule start log s) x.2.scope
                 attachedTo := x.2.attachedTo.map (renameId (commitRenaming schedule start log s)) })
      (fun m x k v found => by
        simp only [Std.ExtTreeMap.getElem?_insert] at found
        split at found
        · exact .inr (Option.some.inj found).symm
        · exact .inl found) _ _ k item held with empty | ⟨x, entry, same⟩
  · simp at empty
  · refine ⟨x.2, mem_itemList.mpr ⟨x.1, Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp entry⟩, ?_⟩
    rw [same]

/-! ## One shape for both commits -/

/-- The feature slots a commit leaves: the settled state's, renamed. -/
theorem compact_slots {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) :
    t.slots = renameSlots (commitRenaming schedule start log s) s.slots := by
  rcases compact_cases ran with ⟨empty, rfl⟩ | ⟨_, rfl⟩
  · exact (renameSlots_id (commitRenaming_empty empty) _).symm
  have frame := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitRekey schedule start log s) s)
  unfold compacted
  rw [frame, renameState_eq]

/-- The scope occurrence records a commit leaves: the settled state's, renamed. -/
theorem compact_scopeRecords {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) :
    t.scopes = s.scopes.map fun scope =>
      { scope with id := renameScope (commitRenaming schedule start log s) scope.id,
                   occurrence := scope.occurrence.map (renameId (commitRenaming schedule start log s)) } := by
  rcases compact_cases ran with ⟨empty, kept⟩ | ⟨_, rfl⟩
  · rw [kept]
    have same := commitRenaming_empty (schedule := schedule) (start := start) (log := log) empty
    have ids : renameId (commitRenaming schedule start log s) = id := funext (renameId_id same)
    exact ((List.map_congr_left fun _ _ => by simp [ids, renameScope_id same]).trans (List.map_id _)).symm
  have frame := advance_frame (commitRenaming schedule start log s) (assign schedule start log s).2 (renameState (commitRenaming schedule start log s) (commitRekey schedule start log s) s)
  unfold compacted
  rw [frame, renameState_eq]

/-! ## Issuer names -/

/-- No two neighbours of the list share an index and an issuer name (`sameIssuerName`). -/
def AdjacentApart : List Issue → Prop
  | a :: b :: rest => sameIssuerName a b = false ∧ AdjacentApart (b :: rest)
  | _ => True

theorem AdjacentApart.tail {a : Issue} {rest : List Issue} (apart : AdjacentApart (a :: rest)) : AdjacentApart rest := by
  cases rest with
  | nil => trivial
  | cons b rest => exact apart.2

private theorem scan_found : ∀ (l : List (Issue × ClaimSlot)) (previous : Option Issue),
    (l.foldl (fun acc b => (some b.1, acc.2 || acc.1.any (sameIssuerName · b.1))) (previous, true)).2 = true
  | [], _ => rfl
  | b :: l, _ => by simpa using scan_found l (some b.1)

/-- `issuerCollision`'s pass finds nothing only when no two neighbours share an index and an issuer name. -/
private theorem scan_adjacent : ∀ (l : List (Issue × ClaimSlot)) (previous : Option Issue) (found : Bool),
    (l.foldl (fun acc b => (some b.1, acc.2 || acc.1.any (sameIssuerName · b.1))) (previous, found)).2 = false →
    AdjacentApart (previous.toList ++ l.map Prod.fst)
  | [], previous, _, _ => by cases previous <;> simp [AdjacentApart]
  | b :: l, previous, found, clear => by
    simp only [List.foldl_cons] at clear
    cases step : (found || previous.any (sameIssuerName · b.1)) with
    | true => rw [step, scan_found] at clear; cases clear
    | false =>
      rw [step] at clear
      have rest := scan_adjacent l (some b.1) false clear
      simp only [Bool.or_eq_false_iff] at step
      cases previous with
      | none => simpa using rest
      | some a =>
        simp only [Option.toList_some, List.singleton_append, List.map_cons, Option.any_some] at rest step ⊢
        exact ⟨step.2, rest⟩

/-- A fresh issue between two that share an index and an issuer name shares them too. -/
private theorem between_same {a b c : Issue} (ab : compare a b = .lt) (bc : compare b c = .lt)
    (same : sameIssuerName a c = true) : sameIssuerName a b = true := by
  cases a with
  | committed _ => simp [sameIssuerName] at same
  | fresh u i =>
    cases c with
    | committed _ => simp [sameIssuerName] at same
    | fresh w j =>
      simp only [sameIssuerName, Bool.and_eq_true, beq_iff_eq] at same
      obtain ⟨⟨⟨index, level⟩, print⟩, root⟩ := same
      subst index
      rw [Kernel.Laws.State.UnitKey.spine_level, Kernel.Laws.State.UnitKey.spine_level] at level
      rw [Kernel.Laws.State.UnitKey.spine_fingerprint, Kernel.Laws.State.UnitKey.spine_fingerprint] at print
      obtain ⟨v, rfl, parts⟩ := Kernel.Laws.State.Issue.between_fresh ab bc level print root
      obtain ⟨l, p, r⟩ := parts
      simp only [sameIssuerName, Bool.and_eq_true, beq_iff_eq, Kernel.Laws.State.UnitKey.spine_level,
        Kernel.Laws.State.UnitKey.spine_fingerprint, l, p, r, and_self]

/-- In a strictly ordered list whose neighbours do not share an index and an issuer name, no two issues do. -/
private theorem apart_of_adjacent (K : List Issue) (sorted : K.Pairwise fun a b => compare a b = .lt)
    (adjacent : AdjacentApart K) : ∀ x ∈ K, ∀ y ∈ K, compare x y = .lt → sameIssuerName x y = false := by
  induction K with
  | nil => intro x member; cases member
  | cons a rest ih =>
    intro x xm y ym lt
    rw [List.pairwise_cons] at sorted
    rcases List.mem_cons.mp xm with rfl | xr
    · rcases List.mem_cons.mp ym with rfl | yr
      · have := Std.OrientedCmp.gt_of_lt lt
        rw [lt] at this
        cases this
      · cases rest with
        | nil => cases yr
        | cons b rest =>
          have ab : sameIssuerName x b = false := adjacent.1
          rcases List.mem_cons.mp yr with rfl | yr'
          · exact ab
          · cases hxy : sameIssuerName x y with
            | false => rfl
            | true =>
              have := between_same (sorted.1 b (List.mem_cons_self ..)) ((List.pairwise_cons.mp sorted.2).1 y yr') hxy
              rw [ab] at this
              cases this
    · rcases List.mem_cons.mp ym with rfl | yr
      · have := Std.OrientedCmp.gt_of_lt (sorted.1 x xr)
        rw [lt] at this
        cases this
      · exact ih sorted.2 adjacent.tail x xr y yr lt

/-- **Issuer names apart** (DC12): a commit that compacts leaves no two distinct units that issued at a common index and
agree on depth, fingerprint and root, the fixed-size name the TypeScript kernel orders issuers by. Every unit numbers
its issues from 0 (`Step.microStep`), so any two distinct issuers share index 0. -/
theorem compact_issuersNamed {start : State} {log : RunLog} {s t : State} (ran : compact schedule start log s = .ok t) {unit other : UnitKey}
    {index : Nat} (held : Issue.fresh unit index ∈ s.issued) (held' : Issue.fresh other index ∈ s.issued)
    (apart : unit ≠ other) :
    ¬ (unit.spine.level = other.spine.level ∧ unit.spine.fingerprint = other.spine.fingerprint ∧ unit.root = other.root) := by
  rintro ⟨level, print, root⟩
  have clear : issuerCollision s.issued = false := by
    unfold compact at ran
    split at ran
    · rename_i empty
      rw [Std.ExtTreeMap.isEmpty_iff] at empty
      rw [empty] at held
      simp at held
    · split at ran
      · cases ran
      · split at ran
        · cases ran
        · rename_i collision
          simpa using collision
  unfold issuerCollision at clear
  rw [Std.ExtTreeMap.foldl_eq_foldl_toList] at clear
  have adjacent := scan_adjacent _ none false clear
  simp only [Option.toList_none, List.nil_append] at adjacent
  have sorted : (s.issued.toList.map Prod.fst).Pairwise fun a b => compare a b = .lt :=
    List.pairwise_map.mpr Std.ExtTreeMap.ordered_keys_toList
  have mem : ∀ issue ∈ s.issued, issue ∈ s.issued.toList.map Prod.fst := fun issue member => by
    rw [Std.ExtTreeMap.map_fst_toList_eq_keys]
    exact Std.ExtTreeMap.mem_keys.mpr member
  have named : ∀ x y : UnitKey, x.spine.level = y.spine.level → x.spine.fingerprint = y.spine.fingerprint →
      x.root = y.root → sameIssuerName (.fresh x index) (.fresh y index) = true := fun _ _ l p r => by
    simp [sameIssuerName, l, p, r]
  cases order : compare (Issue.fresh unit index) (.fresh other index) with
  | lt =>
    have := apart_of_adjacent _ sorted adjacent _ (mem _ held) _ (mem _ held') order
    rw [named _ _ level print root] at this
    cases this
  | gt =>
    have := apart_of_adjacent _ sorted adjacent _ (mem _ held') _ (mem _ held) (Std.OrientedCmp.lt_of_gt order)
    rw [named _ _ level.symm print.symm root.symm] at this
    cases this
  | eq =>
    cases Std.LawfulEqCmp.eq_of_compare order
    exact apart rfl


/-- `Continuation.body?`'s equations, for modules that cannot open `Kernel.Step.Commit`'s bodies. -/
@[simp] theorem _root_.Kernel.Continuation.body?_flow : Continuation.flow.body? = none := by
  simp only [Continuation.body?]

@[simp] theorem _root_.Kernel.Continuation.body?_multiInstance (body : OccurrenceId) :
    (Continuation.multiInstance body).body? = some body := by
  simp only [Continuation.body?]

@[simp] theorem _root_.Kernel.Continuation.body?_compensation (run : ScopeOccurrenceId) :
    (Continuation.compensation run).body? = none := by
  simp only [Continuation.body?]

/-- `Continuation.rekey`'s equations, for the commit's clause laws over occurrences' continuations. -/
@[simp] theorem _root_.Kernel.Continuation.rekey_flow (occurrence : OccurrenceId → OccurrenceId)
    (scope : ScopeOccurrenceId → ScopeOccurrenceId) : Continuation.flow.rekey occurrence scope = .flow := by
  simp only [Continuation.rekey]

@[simp] theorem _root_.Kernel.Continuation.rekey_multiInstance (occurrence : OccurrenceId → OccurrenceId)
    (scope : ScopeOccurrenceId → ScopeOccurrenceId) (body : OccurrenceId) :
    (Continuation.multiInstance body).rekey occurrence scope = .multiInstance (occurrence body) := by
  simp only [Continuation.rekey]

@[simp] theorem _root_.Kernel.Continuation.rekey_compensation (occurrence : OccurrenceId → OccurrenceId)
    (scope : ScopeOccurrenceId → ScopeOccurrenceId) (run : ScopeOccurrenceId) :
    (Continuation.compensation run).rekey occurrence scope = .compensation (scope run) := by
  simp only [Continuation.rekey]

/-- A renamed continuation into a body is the renaming of a continuation into a body. -/
theorem _root_.Kernel.Continuation.rekey_eq_multiInstance {continuation : Continuation}
    {occurrence : OccurrenceId → OccurrenceId} {scope : ScopeOccurrenceId → ScopeOccurrenceId} {body : OccurrenceId}
    (renamed : continuation.rekey occurrence scope = .multiInstance body) :
    ∃ earlier, continuation = .multiInstance earlier ∧ occurrence earlier = body := by
  cases continuation with
  | flow => simp [Continuation.rekey] at renamed
  | multiInstance earlier => exact ⟨earlier, rfl, by simpa [Continuation.rekey] using renamed⟩
  | compensation run => simp [Continuation.rekey] at renamed

end Kernel.Laws.Step
